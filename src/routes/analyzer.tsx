import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Card, PageHeader } from "./scales";
import { analyzeAudioBuffer } from "@/lib/audio/analyzer";
import { buildScale, noteToPc, NOTE_NAMES_SHARP, type ScaleId } from "@/lib/music/theory";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { Fretboard } from "@/components/Fretboard";
import { fretboardForScale } from "@/lib/music/theory";

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

function AnalyzerPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "analyzing" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [keyOverride, setKeyOverride] = useState<{ root: string; mode: "major" | "minor" } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleFile = async (file: File) => {
    setStatus("loading");
    setErrorMsg("");
    setResult(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new Ctor();
      const buffer = await ac.decodeAudioData(arrayBuffer.slice(0));
      setStatus("analyzing");
      // give UI a tick
      await new Promise((r) => setTimeout(r, 50));
      const res = await analyzeAudioBuffer(buffer, 2);
      setResult(res);
      setFileName(file.name);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setStatus("done");
    } catch (e) {
      console.error(e);
      setErrorMsg(e instanceof Error ? e.message : "Failed to analyze audio");
      setStatus("error");
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
              MP3, WAV, OGG · processed locally · YouTube import requires backend
            </div>
          </div>
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
        {status === "loading" && <p className="mt-3 text-sm text-muted-foreground">Decoding audio…</p>}
        {status === "analyzing" && <p className="mt-3 text-sm text-gold">Analyzing chroma + chords… (a few seconds)</p>}
        {status === "error" && <p className="mt-3 text-sm text-rose-400">{errorMsg}</p>}
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

          <Card kicker={`// Chord progression${confidenceTier === "medium" ? " (approximate)" : ""}`}>
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