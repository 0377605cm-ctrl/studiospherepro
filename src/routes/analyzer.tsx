import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { Card, PageHeader } from "./scales";
import { analyzeAudioBuffer } from "@/lib/audio/analyzer";
import {
  buildScale,
  noteToPc,
  NOTE_NAMES_SHARP,
  CHORD_FORMULAS,
  SCALES,
  TUNINGS,
  tuningPcs as tuningPcsFor,
  type ScaleId,
  type TuningId,
} from "@/lib/music/theory";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { Fretboard } from "@/components/Fretboard";
import { fretboardForScale } from "@/lib/music/theory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuitarTab } from "@/components/GuitarTab";
import { prepareMediaElementPlayback, unlockAudio, playChord } from "@/lib/audio/synth";

export const Route = createFileRoute("/analyzer")({
  head: () => ({
    meta: [
      { title: "Audio Analyzer — Chris goes: Pro" },
      { name: "description", content: "Upload an MP3 to detect key, chords, BPM and get a chord sheet with suggested scales." },
    ],
  }),
  component: AnalyzerPage,
});

type Result = Awaited<ReturnType<typeof analyzeAudioBuffer>>;

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Detect mobile / low-memory devices so we can warn users + downsample. */
function isLowPowerDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const dm = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowMem = typeof dm === "number" && dm <= 4;
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  return isMobile || lowMem || fewCores;
}

/** Pretty-print decode errors so users actually see why it failed. */
function describeDecodeError(err: unknown, file: File): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (!raw || lower.includes("unable to decode") || lower.includes("encodingerror")) {
    if (ext === "m4a" || ext === "aac" || ext === "mp4") {
      return `This browser couldn't decode the ${ext.toUpperCase()} file. Try converting it to MP3 or WAV and re-uploading.`;
    }
    return `This browser couldn't decode "${file.name}". The codec may be unsupported or the file is corrupt. Try re-exporting as MP3 or WAV.`;
  }
  if (lower.includes("memory") || lower.includes("allocation")) {
    return "Ran out of memory decoding this file. Try a shorter clip or a smaller MP3.";
  }
  return raw || "Unknown decoding error.";
}

/** Downsample/mono-mix an AudioBuffer using OfflineAudioContext to cut memory + CPU. */
async function downsampleBuffer(buffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate <= targetSampleRate && buffer.numberOfChannels === 1) return buffer;
  const length = Math.ceil((buffer.duration * targetSampleRate));
  const OAC =
    (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OAC) return buffer;
  const oac = new OAC(1, length, targetSampleRate);
  const src = oac.createBufferSource();
  src.buffer = buffer;
  src.connect(oac.destination);
  src.start(0);
  return oac.startRendering();
}

function AnalyzerPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "analyzing" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [keyOverride, setKeyOverride] = useState<{ root: string; mode: "major" | "minor" } | null>(null);
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);
  const [tuningId, setTuningId] = useState<TuningId>("standard");
  const [activeScale, setActiveScale] = useState<ScaleId | null>(null);
  const [progressNote, setProgressNote] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scalesRef = useRef<HTMLDivElement | null>(null);
  const lowPower = isLowPowerDevice();

  const primeIosPlayback = async () => {
    const audioEl = audioRef.current;
    await unlockAudio();
    if (!audioEl) return;
    prepareMediaElementPlayback(audioEl);
    try {
      audioEl.pause();
      audioEl.currentTime = 0;
      const playAttempt = audioEl.play();
      await playAttempt;
      audioEl.pause();
      audioEl.currentTime = 0;
    } catch {
      // ignore; this just primes the element while we're inside a user gesture
    }
  };

  const handleFile = async (file: File) => {
    setErrorMsg("");
    setResult(null);
    setProgressNote("");

    // 1. Hard size limit
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus("error");
      setErrorMsg(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)} MB — over the ${MAX_FILE_SIZE_MB} MB limit. ` +
          `Try trimming the clip or exporting at a lower bitrate.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setStatus("loading");
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();

      // Build / resume an AudioContext (Safari + iOS need a user gesture; this handler IS a gesture).
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        throw new Error("Your browser doesn't expose AudioContext — try Chrome, Firefox, Safari 14+, or Edge.");
      }
      const ac = new Ctor();
      if (ac.state === "suspended") {
        try { await ac.resume(); } catch { /* ignore */ }
      }

      // Wrap decodeAudioData with both promise + callback paths (Safari needs callbacks).
      let buffer: AudioBuffer;
      try {
        buffer = await new Promise<AudioBuffer>((resolve, reject) => {
          // Some Safari builds reject silently from the promise overload — use callbacks.
          const p = ac.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
          if (p && typeof (p as Promise<AudioBuffer>).then === "function") {
            (p as Promise<AudioBuffer>).then(resolve, reject);
          }
        });
      } catch (decodeErr) {
        throw new Error(describeDecodeError(decodeErr, file));
      }

      setStatus("analyzing");
      setProgressNote(
        lowPower
          ? "Low-power device detected — downsampling to 16 kHz mono before analysis…"
          : "Analyzing chroma + chords…",
      );

      // On phones / low-RAM devices, downsample to keep memory under control.
      let workBuffer = buffer;
      if (lowPower && buffer.sampleRate > 16000) {
        try {
          workBuffer = await downsampleBuffer(buffer, 16000);
        } catch (e) {
          console.warn("Downsample failed, falling back to original buffer", e);
        }
      }

      // give UI a tick
      await new Promise((r) => setTimeout(r, 50));
      const res = await analyzeAudioBuffer(workBuffer, lowPower ? 4 : 2);
      setResult(res);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setStatus("done");
      setProgressNote("");
    } catch (e) {
      console.error(e);
      setErrorMsg(e instanceof Error ? e.message : describeDecodeError(e, file));
      setStatus("error");
      setProgressNote("");
    }
  };

  const finalKey = keyOverride ?? (result ? { root: result.key.root, mode: result.key.mode } : null);
  const confidenceTier = result ? (result.key.confidence > 0.6 ? "high" : result.key.confidence > 0.35 ? "medium" : "low") : null;
  const finalBpm = bpmOverride ?? (result ? result.bpm.bpm : 0);

  const scrollToScales = () => {
    scalesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        kicker="04 — Analyze"
        title="Audio Analyzer"
        sub="Upload an MP3. We'll detect key, chord progression, BPM, and recommend scales to solo over."
      />

      {/* Upload */}
      <Card kicker="// Upload">
        <label className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-background/40 p-10 transition-colors hover:border-gold/60 cursor-pointer">
          <svg className="h-10 w-10 text-gold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
          </svg>
          <div className="text-center">
            <div className="font-semibold">{fileName || "Drop an MP3 or click to upload"}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              MP3, WAV, OGG · max {MAX_FILE_SIZE_MB} MB · processed locally
              {lowPower && " · mobile-optimized mode"}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            // iPadOS / iOS Safari grays out files in the Files app when accept is too narrow
            // (many MP3s in iCloud / Dropbox report application/octet-stream).
            // Listing both the MIME wildcard AND explicit extensions makes them selectable.
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,.webm,.mp4"
            // Visually hidden but still focusable/clickable — `display:none` can break iPad gesture chains.
            className="absolute h-px w-px overflow-hidden opacity-0"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // Clear value so re-selecting the same file still fires onChange
              e.target.value = "";
            }}
          />
        </label>
        {status === "loading" && <p className="mt-3 text-sm text-muted-foreground">Decoding audio…</p>}
        {status === "analyzing" && (
          <p className="mt-3 text-sm text-gold">{progressNote || "Analyzing chroma + chords… (a few seconds)"}</p>
        )}
        {status === "error" && (
          <div className="mt-3 rounded-md border border-rose-400/40 bg-rose-400/5 p-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-rose-400">Decode error</div>
            <p className="mt-1 text-sm text-rose-200">{errorMsg}</p>
            <button
              onClick={() => {
                setStatus("idle");
                setErrorMsg("");
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="mt-2 rounded border border-rose-400/40 px-3 py-1 text-xs text-rose-200 hover:bg-rose-400/10"
            >
              Try another file
            </button>
          </div>
        )}
        {lowPower && status === "idle" && (
          <p className="mt-3 text-[11px] font-mono text-muted-foreground">
            📱 Mobile / low-memory device detected — files will be downsampled to keep things stable. For best results,
            use clips under ~5 minutes.
          </p>
        )}
      </Card>

      {result && finalKey && (
        <>
          <Card kicker="// Manual overrides">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Key</div>
                <KeyOverridePicker current={finalKey} onChange={setKeyOverride} />
              </div>
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Tempo · {finalBpm} BPM
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={40}
                    max={240}
                    value={finalBpm}
                    onChange={(e) => setBpmOverride(Number(e.target.value))}
                    className="flex-1 accent-[oklch(0.78_0.13_85)]"
                  />
                  <input
                    type="number"
                    min={40}
                    max={240}
                    value={finalBpm}
                    onChange={(e) => setBpmOverride(Number(e.target.value))}
                    className="w-16 rounded-md border border-border bg-background px-2 py-1 font-mono text-sm"
                  />
                  {bpmOverride !== null && (
                    <button
                      onClick={() => setBpmOverride(null)}
                      className="rounded border border-border px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-gold"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Tuning</div>
                <select
                  value={tuningId}
                  onChange={(e) => setTuningId(e.target.value as TuningId)}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 font-mono text-sm"
                >
                  {(Object.keys(TUNINGS) as TuningId[]).map((id) => (
                    <option key={id} value={id}>{TUNINGS[id].name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={scrollToScales}
                className="rounded-md border border-gold/50 bg-gold/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-gold transition-colors hover:bg-gold/20"
              >
                ↓ Skip to suggested scales
              </button>
            </div>
          </Card>

          {audioUrl && (
            <Card kicker="// Playback">
              <div className="space-y-3">
                <audio ref={audioRef} src={audioUrl} controls className="w-full" playsInline />
                <button
                  onClick={() => {
                    void primeIosPlayback();
                  }}
                  className="rounded-md border border-gold/50 bg-gold/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-gold transition-colors hover:bg-gold/20"
                >
                  Enable iPad / iPhone speaker audio
                </button>
              </div>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <DetectionCard
              label="Detected key"
              value={`${finalKey.root} ${finalKey.mode === "minor" ? "minor" : "major"}`}
              confidence={result.key.confidence}
              hint={result.key.second && `2nd guess: ${result.key.second.root} ${result.key.second.mode}`}
            />
            <DetectionCard
              label="Tempo"
              value={`${finalBpm} BPM`}
              confidence={result.bpm.confidence}
              hint={
                bpmOverride !== null
                  ? `Manual override (detected ${result.bpm.bpm})`
                  : `${result.durationSec.toFixed(1)}s · ${result.segments.length} segments`
              }
            />
            <DetectionCard
              label="Tuning"
              value={TUNINGS[tuningId].labels.join(" ").toUpperCase()}
              confidence={1}
              hint={TUNINGS[tuningId].name}
            />
          </div>

          {/* Confidence-aware output mode */}
          {confidenceTier === "low" && (
            <Card kicker="// Low confidence — chord sheet mode">
              <p className="text-sm text-muted-foreground mb-3">
                Detection confidence is low. Showing chord sheet instead of TAB. Use the manual overrides above.
              </p>
            </Card>
          )}

          <Card kicker={`// Output${confidenceTier === "medium" ? " (approximate)" : ""}`}>
            <Tabs defaultValue="chords" className="w-full">
              <TabsList className="bg-secondary/40">
                <TabsTrigger value="chords">Chord sheet</TabsTrigger>
                <TabsTrigger value="tab">Guitar TAB</TabsTrigger>
              </TabsList>

              <TabsContent value="chords">
                <ChordChart
                  segments={result.segments.map((s) => ({
                    startSec: s.startSec,
                    chord: s.chord,
                  }))}
                  audioRef={audioRef}
                />
              </TabsContent>

              <TabsContent value="tab">
                <GuitarTab
                  segments={result.segments.map((s) => ({ startSec: s.startSec, chord: s.chord }))}
                  bpm={finalBpm}
                  keyRoot={finalKey.root}
                  keyMode={finalKey.mode}
                  audioRef={audioRef}
                />
              </TabsContent>
            </Tabs>
          </Card>

          <div ref={scalesRef}>
            <SuggestedScales
              root={finalKey.root}
              mode={finalKey.mode}
              tuningId={tuningId}
              activeScale={activeScale}
              onSelectScale={setActiveScale}
            />
          </div>
        </>
      )}

      {!result && status === "idle" && (
        <Card kicker="// How it works">
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li><span className="text-gold font-mono mr-2">01</span> Audio is decoded locally in your browser — nothing is uploaded.</li>
            <li><span className="text-gold font-mono mr-2">02</span> We compute chroma features per 2-second segment using Goertzel filters.</li>
            <li><span className="text-gold font-mono mr-2">03</span> Key is matched against Krumhansl-Schmuckler profiles with a confidence score.</li>
            <li><span className="text-gold font-mono mr-2">04</span> Chords are template-matched against the chroma; BPM is autocorrelated from onset energy.</li>
            <li><span className="text-gold font-mono mr-2">05</span> Low confidence? You'll see a chord sheet with manual override. High confidence opens TAB-ready output.</li>
          </ol>
        </Card>
      )}
    </div>
  );
}

function DetectionCard({ label, value, confidence, hint }: { label: string; value: string; confidence: number; hint?: string }) {
  const tier = confidence > 0.6 ? { color: "text-emerald-400", text: "HIGH" } : confidence > 0.35 ? { color: "text-amber-400", text: "MEDIUM" } : { color: "text-rose-400", text: "LOW" };
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className={`font-mono text-[10px] uppercase tracking-widest ${tier.color}`}>{tier.text} · {(confidence * 100).toFixed(0)}%</div>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-gold">{value}</div>
      {hint && <div className="mt-1 text-[11px] font-mono text-muted-foreground">{hint}</div>}
    </div>
  );
}

function KeyOverridePicker({ current, onChange }: { current: { root: string; mode: "major" | "minor" }; onChange: (k: { root: string; mode: "major" | "minor" }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Override key:</label>
      <select
        value={current.root}
        onChange={(e) => onChange({ ...current, root: e.target.value })}
        className="rounded-md border border-border bg-background px-2 py-1 font-mono text-sm"
      >
        {NOTE_NAMES_SHARP.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <div className="flex rounded-md border border-border bg-background p-0.5">
        {(["major", "minor"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onChange({ ...current, mode: m })}
            className={`rounded px-2 py-1 font-mono text-[10px] uppercase ${current.mode === m ? "bg-gold text-gold-foreground" : "text-muted-foreground"}`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function SuggestedScales({ root, mode }: { root: string; mode: "major" | "minor" }) {
  const baseScale: ScaleId = mode === "minor" ? "pentatonic_minor" : "pentatonic_major";
  const scale = buildScale(root, baseScale);
  const positions = fretboardForScale(scale, 15);

  return (
    <Card kicker="// Suggested scales for solos">
      <div className="mb-4 flex flex-wrap gap-2">
        {[baseScale, mode === "minor" ? "blues" : "major", mode === "minor" ? "minor" : "mixolydian"].map((id, i) => (
          <span key={i} className="rounded-md border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-xs text-gold">
            {root} {id.replace("_", " ")}
          </span>
        ))}
      </div>
      <PianoKeyboard highlights={scale.notes} rootPc={noteToPc(root)} startMidi={48} octaves={2} />
      <div className="mt-4">
        <Fretboard
          positions={positions.map((p) => ({ ...p, isRoot: p.isRoot }))}
          rootPc={scale.rootPc}
          startFret={0}
          endFret={12}
        />
      </div>
    </Card>
  );
}

/* ============================================================
 * ChordChart — multi-instrument chord sheet with isolated playback
 * ========================================================== */

type ChordSeg = {
  startSec: number;
  chord: { symbol: string; rootPc: number; type: string; confidence: number };
};

const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Pick a MIDI note for `pc` whose value is closest to `target`. */
function nearestPc(pc: number, target: number): number {
  const base = pc + 12 * Math.round((target - pc) / 12);
  return base;
}

/**
 * Piano LH+RH voicing: bass root in octave 2, triad/7th-chord tones voiced
 * close to middle C (C4 area) using nearest-pitch placement so each chord
 * voice-leads smoothly instead of jumping octaves with the root.
 */
function pianoVoicing(rootPc: number, type: string): number[] {
  const formula = CHORD_FORMULAS[type as keyof typeof CHORD_FORMULAS] ?? CHORD_FORMULAS.maj;
  const bass = nearestPc(rootPc, 36); // C2 area (E2..B2)
  // Place upper voices around C4 (60), each note picked nearest to a target
  // so the voicing sits in a natural keyboard register regardless of root.
  const targets = [60, 64, 67, 70]; // ~C4, E4, G4, Bb4
  const upper = formula.intervals.map((iv, i) => {
    const pc = (rootPc + iv) % 12;
    return nearestPc(pc, targets[i] ?? 67);
  });
  return [bass, ...upper];
}

/**
 * Guitar voicing — approximates a standard barre/open shape.
 * Roots C..F sit on the A-string (MIDI 45..53), F#..B sit on the low-E
 * string (MIDI 38..47). Then chord tones are laid out above the root in a
 * natural 4–5-string spread instead of a tight stack.
 */
function guitarVoicing(rootPc: number, type: string): number[] {
  const formula = CHORD_FORMULAS[type as keyof typeof CHORD_FORMULAS] ?? CHORD_FORMULAS.maj;
  // Root: prefer low-E (40) or A-string (45) — pick whichever stays below G3
  let root = 40 + rootPc;          // E-string root
  if (root > 47) root -= 12;       // ...wrap so we don't go above B3 on E string
  if (root < 40) root += 12;

  // Full guitar voicing: root + 5 + octave-root + 3 (or 7) + 5 + octave-3
  // Build by picking pitch classes from the chord and stretching them across
  // ~2.5 octaves like a real strummed shape.
  const chordPcs = formula.intervals.map((iv) => (rootPc + iv) % 12);
  // Targets: low root, fifth above, octave root, third, fifth, top voice
  const targetMidis = [root, root + 7, root + 12, root + 16, root + 19, root + 24];
  const out: number[] = [];
  targetMidis.forEach((t, i) => {
    // Cycle through chord tones; root, 5, root, 3, 5, octave-3...
    const pc = chordPcs[i % chordPcs.length];
    out.push(nearestPc(pc, t));
  });
  // De-dup adjacent equal notes (compact)
  return out.filter((m, i, a) => i === 0 || m !== a[i - 1]);
}

/** Bass: single root in E1–G2 range. */
function bassVoicing(rootPc: number): number[] {
  // Target G1 (31) so all roots land in real bass guitar register
  return [nearestPc(rootPc, 31)];
}

/** Convert MIDI to display name like "C4", "F#3". */
function midiName(m: number): string {
  const pc = ((m % 12) + 12) % 12;
  const oct = Math.floor(m / 12) - 1;
  return `${PC_NAMES[pc]}${oct}`;
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ChordChart({
  segments,
  audioRef,
}: {
  segments: ChordSeg[];
  audioRef: React.RefObject<HTMLAudioElement | null>;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [snippetIdx, setSnippetIdx] = useState<number | null>(null);
  const snippetTimerRef = useRef<number | null>(null);

  // Cleanup any pending snippet timer on unmount.
  useEffect(() => {
    return () => {
      if (snippetTimerRef.current !== null) {
        window.clearTimeout(snippetTimerRef.current);
      }
    };
  }, []);

  /** Duration of a segment, capped so isolated playback doesn't drone on. */
  const segDuration = (i: number, max = 2.5) => {
    const next = segments[i + 1];
    const raw = next ? next.startSec - segments[i].startSec : max;
    return Math.max(0.4, Math.min(max, raw));
  };

  const playIsolated = (i: number, instrument: "piano" | "guitar" | "bass") => {
    const seg = segments[i];
    const dur = segDuration(i, instrument === "bass" ? 2.0 : 2.5);
    const midis =
      instrument === "piano"
        ? pianoVoicing(seg.chord.rootPc, seg.chord.type)
        : instrument === "guitar"
          ? guitarVoicing(seg.chord.rootPc, seg.chord.type)
          : bassVoicing(seg.chord.rootPc);
    // type "triangle" → piano sampler, anything else → guitar sampler in synth.ts
    const synthType: OscillatorType = instrument === "piano" ? "triangle" : "sawtooth";
    setActiveIdx(i);
    playChord(midis, { duration: dur, velocity: instrument === "bass" ? 0.9 : 0.7, type: synthType });
    window.setTimeout(() => {
      setActiveIdx((cur) => (cur === i ? null : cur));
    }, dur * 1000);
  };

  /** Play just this segment of the original audio, then auto-pause at segment end. */
  const playSnippet = (i: number) => {
    const el = audioRef.current;
    if (!el) return;
    const seg = segments[i];
    const next = segments[i + 1];
    const endSec = next ? next.startSec : seg.startSec + 3;
    const dur = Math.max(0.3, endSec - seg.startSec);

    if (snippetTimerRef.current !== null) {
      window.clearTimeout(snippetTimerRef.current);
      snippetTimerRef.current = null;
    }
    el.currentTime = seg.startSec;
    void el.play().catch(() => undefined);
    setSnippetIdx(i);
    snippetTimerRef.current = window.setTimeout(() => {
      el.pause();
      setSnippetIdx((cur) => (cur === i ? null : cur));
      snippetTimerRef.current = null;
    }, dur * 1000);
  };

  const stopSnippet = () => {
    const el = audioRef.current;
    if (snippetTimerRef.current !== null) {
      window.clearTimeout(snippetTimerRef.current);
      snippetTimerRef.current = null;
    }
    if (el) el.pause();
    setSnippetIdx(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-muted-foreground">
        <span>Tap an instrument row to hear that chord in isolation — playback auto-stops so you can play along.</span>
      </div>
      <div className="space-y-2">
        {segments.map((seg, i) => {
          const piano = pianoVoicing(seg.chord.rootPc, seg.chord.type);
          const guitar = guitarVoicing(seg.chord.rootPc, seg.chord.type);
          const bass = bassVoicing(seg.chord.rootPc);
          const isActive = activeIdx === i;
          const isSnippet = snippetIdx === i;
          return (
            <div
              key={i}
              className={`rounded-lg border bg-secondary/30 p-3 transition-colors ${
                isActive || isSnippet ? "border-gold/70 bg-gold/5" : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-[68px] flex-col">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {fmtTime(seg.startSec)}
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-gold">{seg.chord.symbol}</div>
                </div>
                <div className="h-1 flex-1 min-w-[60px] overflow-hidden rounded bg-background">
                  <div className="h-full bg-gold/60" style={{ width: `${seg.chord.confidence * 100}%` }} />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => playSnippet(i)}
                    className="rounded border border-border bg-background/60 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-gold/60 hover:text-gold"
                  >
                    ▶ Snippet
                  </button>
                  {isSnippet && (
                    <button
                      onClick={stopSnippet}
                      className="rounded border border-rose-400/40 bg-rose-400/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-rose-200 hover:bg-rose-400/20"
                    >
                      ■ Stop
                    </button>
                  )}
                </div>
              </div>

              {/* Per-instrument lines */}
              <div className="mt-3 grid gap-1.5">
                <InstrumentLine
                  label="Piano"
                  notes={piano.map(midiName)}
                  onPlay={() => playIsolated(i, "piano")}
                />
                <InstrumentLine
                  label="Guitar"
                  notes={guitar.map(midiName)}
                  onPlay={() => playIsolated(i, "guitar")}
                />
                <InstrumentLine
                  label="Bass"
                  notes={bass.map(midiName)}
                  onPlay={() => playIsolated(i, "bass")}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InstrumentLine({
  label,
  notes,
  onPlay,
}: {
  label: string;
  notes: string[];
  onPlay: () => void;
}) {
  return (
    <button
      onClick={onPlay}
      className="group flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-left transition-colors hover:border-gold/60 hover:bg-gold/5"
    >
      <span className="w-14 font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-hover:text-gold">
        {label}
      </span>
      <span className="flex flex-1 flex-wrap gap-1">
        {notes.map((n, i) => (
          <span
            key={i}
            className="rounded border border-border bg-secondary/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground"
          >
            {n}
          </span>
        ))}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-hover:text-gold">
        ▶
      </span>
    </button>
  );
}