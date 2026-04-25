import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/lib/state";
import { GlobalControls } from "@/components/GlobalControls";
import { Card, PageHeader } from "./scales";
import { generateRiff, generateProgression, riffToTab, type Riff } from "@/lib/music/riffs";
import { ALL_KEY_NAMES, SCALES, scalesByDifficulty, NOTE_NAMES_SHARP, type ScaleId } from "@/lib/music/theory";
import { playMidi, playChord } from "@/lib/audio/synth";
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
  const [bars, setBars] = useState(4);
  const [savedRiffs, setSavedRiffs] = useState<SavedRiff[]>(() => loadSavedRiffs());
  const [riffName, setRiffName] = useState("");

  const riff = useMemo(
    () =>
      generateRiff({
        key: state.rootKey,
        scaleId: state.scaleId,
        genre: state.genre,
        difficulty: state.difficulty,
        bars,
        seed,
      }),
    [state.rootKey, state.scaleId, state.genre, state.difficulty, seed, bars],
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

  const saveCurrentRiff = () => {
    const name = riffName.trim() || `${state.rootKey} ${SCALES[state.scaleId].name} ${state.genre} #${savedRiffs.length + 1}`;
    const entry: SavedRiff = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      createdAt: Date.now(),
      seed,
      bars,
      key: state.rootKey,
      scaleId: state.scaleId,
      genre: state.genre,
      difficulty: state.difficulty,
    };
    const next = [entry, ...savedRiffs].slice(0, 50);
    setSavedRiffs(next);
    persistSavedRiffs(next);
    setRiffName("");
  };

  const loadRiff = (s: SavedRiff) => {
    state.setRootKey(s.key);
    state.setScaleId(s.scaleId);
    state.setGenre(s.genre);
    state.setDifficulty(s.difficulty);
    setBars(s.bars);
    setSeed(s.seed);
  };

  const deleteRiff = (id: string) => {
    const next = savedRiffs.filter((s) => s.id !== id);
    setSavedRiffs(next);
    persistSavedRiffs(next);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        kicker="02 — Generate"
        title="AI Riff Generator"
        sub={`${riff.key} ${SCALES[riff.scaleId].name} · ${riff.genre.toUpperCase()} · ${bpm} BPM · ${riff.notes.length} notes`}
      />

      <GlobalControls showGenre />

      <div className="flex flex-wrap items-center gap-3">
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
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Length</label>
          <select
            value={bars}
            onChange={(e) => setBars(Number(e.target.value))}
            className="rounded bg-background/70 px-2 py-1 text-sm font-semibold"
          >
            {[2, 4, 8, 12, 16, 24, 32].map((n) => (
              <option key={n} value={n}>
                {n} bars
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-gold/40 bg-secondary/40 px-3 py-2">
          <input
            value={riffName}
            onChange={(e) => setRiffName(e.target.value)}
            placeholder="Name this riff…"
            className="w-40 rounded bg-background/70 px-2 py-1 text-sm placeholder:text-muted-foreground/60"
          />
          <button
            onClick={saveCurrentRiff}
            className="rounded bg-gold/90 px-3 py-1 text-xs font-bold text-gold-foreground hover:bg-gold"
          >
            💾 Save
          </button>
        </div>
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

      {riff.chordBars && riff.chordBars.length > 0 && (
        <Card kicker="// Chord backing (auto-included)">
          <div className="mb-2 text-sm">
            <span className="font-semibold">{riff.progressionName}</span>{" "}
            <span className="font-mono text-muted-foreground">
              · {riff.genre.toUpperCase()} · click a chord to hear it
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {riff.chordBars.map((c, i) => (
              <button
                key={i}
                onClick={() => playChord(c.midis, { duration: 1.2, type: "triangle", velocity: 0.6 })}
                className="rounded-md border border-gold/40 bg-secondary/40 px-4 py-3 text-center transition-colors hover:border-gold"
              >
                <div className="font-mono text-[9px] uppercase text-gold">Bar {i + 1}</div>
                <div className="text-lg font-semibold">{c.symbol}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

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

      <Card kicker="// Saved riffs">
        {savedRiffs.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground">
            No saved riffs yet. Hit 💾 Save to store the current riff for later.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {savedRiffs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {s.key} {SCALES[s.scaleId].name} · {s.genre.toUpperCase()} · {s.bars} bars · {s.difficulty}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadRiff(s)}
                    className="rounded border border-gold/50 px-3 py-1 text-xs font-semibold text-gold hover:bg-gold/10"
                  >
                    Load
                  </button>
                  <button
                    onClick={() => deleteRiff(s.id)}
                    className="rounded border border-border px-3 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* -------------------- Saved riffs (localStorage) -------------------- */

interface SavedRiff {
  id: string;
  name: string;
  createdAt: number;
  seed: number;
  bars: number;
  key: string;
  scaleId: ScaleId;
  genre: ReturnType<typeof useAppState>["genre"];
  difficulty: ReturnType<typeof useAppState>["difficulty"];
}

const SAVED_RIFFS_KEY = "studiosphere.savedRiffs.v1";

function loadSavedRiffs(): SavedRiff[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_RIFFS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedRiffs(list: SavedRiff[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_RIFFS_KEY, JSON.stringify(list));
  } catch {
    // ignore quota errors
  }
}

function RiffPlayer({ riff, bpm, setBpm }: { riff: Riff; bpm: number; setBpm: (n: number | null) => void }) {
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const playedSetRef = useRef<Set<number>>(new Set());
  const playedChordBarsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    startTimeRef.current = performance.now();
    playedSetRef.current = new Set();
    playedChordBarsRef.current = new Set();

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
          const dur = (n.duration * beatMs) / 1000;
          playMidi(n.midi, { duration: dur, type: "sawtooth", velocity: 0.55 });
          if (n.extras && n.extras.length > 0) {
            // Strum: tiny stagger between strings for realism.
            n.extras.forEach((ex, i) => {
              setTimeout(() => {
                playMidi(ex.midi, { duration: dur, type: "sawtooth", velocity: 0.5 });
              }, 12 * (i + 1));
            });
          }
        }
      });
      // play chord on each new bar (if we have backing chords)
      if (riff.chordBars) {
        const barIdx = Math.floor(beat / riff.beatsPerBar);
        if (barIdx < riff.chordBars.length && !playedChordBarsRef.current.has(barIdx)) {
          playedChordBarsRef.current.add(barIdx);
          const c = riff.chordBars[barIdx];
          playChord(c.midis, {
            duration: (riff.beatsPerBar * beatMs) / 1000,
            type: "triangle",
            velocity: 0.35,
          });
        }
      }
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