import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/lib/state";
import { GlobalControls } from "@/components/GlobalControls";
import { Card, PageHeader } from "./scales";
import { generateRiff, generateProgression, riffToTab, type Riff } from "@/lib/music/riffs";
import { ALL_KEY_NAMES, SCALES, scalesByDifficulty, NOTE_NAMES_SHARP, type ScaleId } from "@/lib/music/theory";
import { playMidi } from "@/lib/audio/synth";
import { Fretboard } from "@/components/Fretboard";

export const Route = createFileRoute("/riffs")({
  head: () => ({
    meta: [
      { title: "AI Riff Generator — Chris goes: Pro" },
      { name: "description", content: "Generate riffs in any key, scale, genre and difficulty. Output to TAB with playback." },
    ],
  }),
  component: RiffsPage,
});

function RiffsPage() {
  const state = useAppState();
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [tempoOverride, setTempoOverride] = useState<number | null>(null);

  const riff = useMemo(
    () =>
      generateRiff({
        key: state.rootKey,
        scaleId: state.scaleId,
        genre: state.genre,
        difficulty: state.difficulty,
        bars: 4,
        seed,
      }),
    [state.rootKey, state.scaleId, state.genre, state.difficulty, seed],
  );
  const prog = useMemo(
    () =>
      generateProgression({
        key: state.rootKey,
        scaleId: state.scaleId,
        genre: state.genre,
        seed: seed + 1,
      }),
    [state.rootKey, state.scaleId, state.genre, seed],
  );

  const bpm = tempoOverride ?? riff.bpm;
  const tab = useMemo(() => riffToTab(riff), [riff]);

  const inspire = () => {
    const keys = ALL_KEY_NAMES;
    const newKey = keys[Math.floor(Math.random() * keys.length)];
    const scales = scalesByDifficulty(state.difficulty);
    const newScale = scales[Math.floor(Math.random() * scales.length)].id as ScaleId;
    state.setRootKey(newKey);
    state.setScaleId(newScale);
    setSeed(Math.floor(Math.random() * 1e9));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        kicker="02 — Generate"
        title="AI Riff Generator"
        sub={`${riff.key} ${SCALES[riff.scaleId].name} · ${riff.genre.toUpperCase()} · ${bpm} BPM · ${riff.notes.length} notes`}
      />

      <GlobalControls showGenre />

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
          className="inline-flex items-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground glow-gold hover:scale-[1.02] transition-transform"
        >
          ↻ Generate new riff
        </button>
        <button
          onClick={inspire}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/60 px-4 py-2 text-sm font-semibold hover:bg-secondary"
        >
          🎲 Inspire me
        </button>
      </div>

      <RiffPlayer riff={riff} bpm={bpm} setBpm={setTempoOverride} />

      <Card kicker="// Guitar TAB">
        <pre className="overflow-x-auto rounded-lg bg-background/70 p-4 font-mono text-xs leading-relaxed text-gold">
{tab}
        </pre>
        <p className="mt-2 text-[10px] font-mono text-muted-foreground">
          1 column ≈ 1/16 note · gold = active notes · adjust difficulty for note density
        </p>
      </Card>

      <Card kicker="// Fretboard preview">
        <Fretboard
          positions={riff.notes.map((n) => ({
            string: n.string,
            fret: n.fret,
            pc: n.midi % 12,
            isRoot: n.midi % 12 === ((riff.notes[0]?.midi ?? 0) % 12),
            label: n.fret.toString(),
          }))}
          startFret={0}
          endFret={Math.max(7, ...riff.notes.map((n) => n.fret)) + 1}
          rootPc={riff.notes[0]?.midi % 12}
        />
      </Card>

      <Card kicker="// Suggested progression">
        <div className="mb-2 text-sm">
          <span className="font-semibold">{prog.name}</span>{" "}
          <span className="font-mono text-muted-foreground">· {state.genre.toUpperCase()}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {prog.bars.map((b, i) => (
            <button
              key={i}
              onClick={() => {
                const midi = 48 + b.pc;
                [0, 4, 7].forEach((iv) => playMidi(midi + iv, { duration: 0.8, type: "triangle" }));
              }}
              className="rounded-md border border-border bg-secondary/40 px-4 py-3 text-center transition-colors hover:border-gold/40"
            >
              <div className="font-mono text-[9px] uppercase text-gold">Bar {i + 1}</div>
              <div className="text-lg font-semibold">{NOTE_NAMES_SHARP[b.pc]}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function RiffPlayer({ riff, bpm, setBpm }: { riff: Riff; bpm: number; setBpm: (n: number | null) => void }) {
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const playedSetRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    startTimeRef.current = performance.now();
    playedSetRef.current = new Set();

    const totalBeats = riff.bars * riff.beatsPerBar;
    const beatMs = 60000 / bpm;

    const loop = () => {
      const elapsed = performance.now() - (startTimeRef.current ?? 0);
      const beat = elapsed / beatMs;
      setCurrentBeat(beat);
      // play any notes that have crossed
      riff.notes.forEach((n, idx) => {
        if (!playedSetRef.current.has(idx) && beat >= n.startBeat) {
          playedSetRef.current.add(idx);
          playMidi(n.midi, { duration: (n.duration * beatMs) / 1000, type: "sawtooth", velocity: 0.4 });
        }
      });
      if (beat >= totalBeats) {
        setPlaying(false);
        setCurrentBeat(0);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, riff, bpm]);

  const totalBeats = riff.bars * riff.beatsPerBar;
  const progress = Math.min(100, (currentBeat / totalBeats) * 100);

  return (
    <Card kicker="// Playback">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gold text-gold-foreground glow-gold hover:scale-105 transition-transform"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            onClick={() => {
              setPlaying(false);
              setCurrentBeat(0);
            }}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary/60 hover:bg-secondary"
            aria-label="Stop"
          >
            ■
          </button>
        </div>
        <div className="flex-1">
          <div className="mb-2 flex items-center justify-between font-mono text-xs">
            <span className="text-muted-foreground">Bar {Math.min(riff.bars, Math.floor(currentBeat / riff.beatsPerBar) + 1)} / {riff.bars}</span>
            <span className="text-gold">{bpm} BPM</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-background/60">
            <div className="h-full bg-gradient-to-r from-gold/60 to-gold transition-[width] duration-75" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Tempo</label>
          <input
            type="range"
            min={40}
            max={220}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-32 accent-[oklch(0.78_0.13_85)]"
          />
        </div>
      </div>
    </Card>
  );
}