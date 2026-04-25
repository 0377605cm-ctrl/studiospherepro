import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Card, PageHeader } from "./scales";
import { analyzeAudioBuffer } from "@/lib/audio/analyzer";
import { buildScale, noteToPc, NOTE_NAMES_SHARP, type ScaleId } from "@/lib/music/theory";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { Fretboard } from "@/components/Fretboard";
import { fretboardForScale } from "@/lib/music/theory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GuitarTab } from "@/components/GuitarTab";

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
  const [progressNote, setProgressNote] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lowPower = isLowPowerDevice();

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
          {audioUrl && (
            <Card kicker="// Playback">
              <audio ref={audioRef} src={audioUrl} controls className="w-full" />
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
              value={`${result.bpm.bpm} BPM`}
              confidence={result.bpm.confidence}
              hint={`${result.durationSec.toFixed(1)}s · ${result.segments.length} segments`}
            />
            <DetectionCard
              label="Tuning"
              value="Standard"
              confidence={0.7}
              hint="Auto-detect (manual override coming)"
            />
          </div>

          {/* Confidence-aware output mode */}
          {confidenceTier === "low" && (
            <Card kicker="// Low confidence — chord sheet mode">
              <p className="text-sm text-muted-foreground mb-3">
                Detection confidence is low. Showing chord sheet instead of TAB. Try the manual key picker below.
              </p>
              <KeyOverridePicker current={finalKey} onChange={setKeyOverride} />
            </Card>
          )}

          <Card kicker={`// Output${confidenceTier === "medium" ? " (approximate)" : ""}`}>
            <Tabs defaultValue="chords" className="w-full">
              <TabsList className="bg-secondary/40">
                <TabsTrigger value="chords">Chord sheet</TabsTrigger>
                <TabsTrigger value="tab">Guitar TAB</TabsTrigger>
              </TabsList>

              <TabsContent value="chords">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                  {result.segments.map((seg, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border bg-secondary/40 p-2 text-center"
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.currentTime = seg.startSec;
                          audioRef.current.play();
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <div className="font-mono text-[9px] text-muted-foreground">
                        {Math.floor(seg.startSec / 60)}:{(seg.startSec % 60).toFixed(0).padStart(2, "0")}
                      </div>
                      <div className="text-base font-semibold">{seg.chord.symbol}</div>
                      <div className="mt-1 h-1 overflow-hidden rounded bg-background">
                        <div className="h-full bg-gold/60" style={{ width: `${seg.chord.confidence * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs font-mono text-muted-foreground">Click a chord to seek the audio.</p>
              </TabsContent>

              <TabsContent value="tab">
                <GuitarTab
                  segments={result.segments.map((s) => ({ startSec: s.startSec, chord: s.chord }))}
                  bpm={result.bpm.bpm}
                  keyRoot={finalKey.root}
                  keyMode={finalKey.mode}
                  audioRef={audioRef}
                />
              </TabsContent>
            </Tabs>
          </Card>

          <SuggestedScales root={finalKey.root} mode={finalKey.mode} />
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