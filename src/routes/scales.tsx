import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAppState } from "@/lib/state";
import {
  buildScale,
  buildChord,
  diatonicChords,
  fretboardForScale,
  fretboardBox,
  findRootBox,
  STANDARD_TUNING_MIDI,
  SCALES,
  CHORD_FORMULAS,
  NOTE_NAMES_SHARP,
} from "@/lib/music/theory";
import { GlobalControls } from "@/components/GlobalControls";
import { PianoKeyboard } from "@/components/PianoKeyboard";
import { Fretboard } from "@/components/Fretboard";
import { playMidi, playChord } from "@/lib/audio/synth";

export const Route = createFileRoute("/scales")({
  head: () => ({
    meta: [
      { title: "Scales & Theory — Chris goes: Pro" },
      { name: "description", content: "Visualize scales, modes, chords and arpeggios on guitar and piano." },
    ],
  }),
  component: ScalesPage,
});

function ScalesPage() {
  const { rootKey, scaleId, instrument, difficulty } = useAppState();

  const scale = useMemo(() => buildScale(rootKey, scaleId), [rootKey, scaleId]);
  const fullPositions = useMemo(() => fretboardForScale(scale, 15), [scale]);
  const startBox = useMemo(() => findRootBox(scale), [scale]);
  const boxPositions = useMemo(() => fretboardBox(scale, startBox, 4), [scale, startBox]);
  const positions = difficulty === "easy" ? boxPositions : fullPositions;

  const seventh = difficulty === "difficult" || difficulty === "very-difficult";
  const chords = useMemo(() => diatonicChords(scale, seventh), [scale, seventh]);

  const arpeggios = chords.slice(0, 4).map((c) => buildChord(NOTE_NAMES_SHARP[c.rootPc], c.type));

  const showGuitar = instrument === "guitar" || instrument === "both";
  const showPiano = instrument === "piano" || instrument === "both";

  // Sound source for the "Notes in scale" row
  const [scaleSound, setScaleSound] = useState<"piano" | "guitar">("piano");
  const soundType: OscillatorType = scaleSound === "piano" ? "triangle" : "sawtooth";

  // Build an ascending MIDI sequence: root → octave → root, no octave jumps mid-row.
  const ascendingMidis = useMemo(() => {
    const base = 48 + scale.rootPc; // start at root one octave lower (C3 region)
    const seq: number[] = [];
    let prev = -Infinity;
    for (const iv of SCALES[scale.scaleId].intervals) {
      const m = base + iv;
      if (m <= prev) {
        // shouldn't happen since intervals are ascending, but guard anyway
        seq.push(m + 12);
        prev = m + 12;
      } else {
        seq.push(m);
        prev = m;
      }
    }
    seq.push(base + 12); // octave at the end
    return seq;
  }, [scale]);

  const playScaleAscending = () => {
    ascendingMidis.forEach((m, i) => {
      setTimeout(() => playMidi(m, { duration: 0.4, type: soundType }), i * 220);
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        kicker="01 — Theory"
        title="Scales & Theory"
        sub={`${scale.rootName} ${SCALES[scale.scaleId].name} · ${scale.noteNames.join(" – ")}`}
      />

      <GlobalControls />

      {/* Scale notes */}
      <Card
        kicker="// Notes in scale"
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Sound
            </span>
            <div className="flex overflow-hidden rounded-md border border-border">
              {(["piano", "guitar"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScaleSound(s)}
                  className={`px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    scaleSound === s
                      ? "bg-gold text-gold-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={playScaleAscending}
              className="rounded-md border border-gold/60 bg-gold/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gold transition-colors hover:bg-gold/20"
            >
              ▶ Play scale
            </button>
          </div>
        }
      >
        <div className="flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-1">
          {ascendingMidis.map((midi, i) => {
            const pc = ((midi % 12) + 12) % 12;
            const isRoot = pc === scale.rootPc;
            const isOctave = i === ascendingMidis.length - 1;
            const name = NOTE_NAMES_SHARP[pc];
            return (
              <button
                key={i}
                onClick={() => playMidi(midi, { duration: 0.4, type: soundType })}
                className={`flex min-w-[64px] flex-shrink-0 flex-col items-center rounded-md border px-3 py-2 font-mono text-sm transition-all hover:scale-105 ${
                  isRoot
                    ? "border-gold bg-gold text-gold-foreground glow-gold"
                    : "border-border bg-secondary text-foreground hover:border-gold/40"
                }`}
              >
                <span className="text-[9px] uppercase tracking-widest opacity-70">
                  {isOctave ? "8" : degreeLabel(i)}
                </span>
                <span className="text-base font-semibold">{name}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Ascending row — root to octave, no jumps. Click "Play scale" to hear it on{" "}
          <span className="text-gold">{scaleSound}</span>.
        </p>
      </Card>

      {showPiano && (
        <Card kicker="// Piano">
          <PianoKeyboard highlights={scale.notes} rootPc={scale.rootPc} startMidi={48} octaves={2} />
          <p className="mt-3 text-xs font-mono text-muted-foreground">Click any key to hear it. Gold = root.</p>
        </Card>
      )}

      {showGuitar && (
        <Card
          kicker="// Guitar"
          right={
            <span className="text-xs font-mono text-muted-foreground">
              {difficulty === "easy" ? `Box position (frets ${startBox}-${startBox + 4})` : "Full neck"}
            </span>
          }
        >
          <Fretboard
            positions={positions.map((p) => ({ ...p, isRoot: p.isRoot }))}
            startFret={difficulty === "easy" ? Math.max(0, startBox - 1) : 0}
            endFret={difficulty === "easy" ? Math.min(15, startBox + 5) : 15}
            rootPc={scale.rootPc}
          />
        </Card>
      )}

      {/* Diatonic chords */}
      <Card kicker="// Diatonic chords">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {chords.map((c, i) => {
            const chord = buildChord(NOTE_NAMES_SHARP[c.rootPc], c.type);
            const midis = chord.intervals.map((iv) => 48 + chord.rootPc + iv);
            return (
              <button
                key={i}
                onClick={() => playChord(midis, { duration: 1, type: "triangle" })}
                className="group rounded-lg border border-border bg-secondary/40 p-3 text-left transition-all hover:border-gold/50 hover:bg-secondary"
              >
                <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{c.degree}</div>
                <div className="mt-1 text-lg font-semibold tracking-tight">{c.symbol}</div>
                <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                  {CHORD_FORMULAS[c.type].name}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs font-mono text-muted-foreground">Click a chord to hear it. Showing {seventh ? "7th chords" : "triads"}.</p>
      </Card>

      {/* Arpeggios */}
      <Card kicker="// Arpeggios">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {arpeggios.map((arp, i) => {
            const midis = arp.intervals.map((iv) => 48 + arp.rootPc + iv);
            return (
              <button
                key={i}
                onClick={async () => {
                  for (let j = 0; j < midis.length; j++) {
                    setTimeout(() => playMidi(midis[j], { duration: 0.3 }), j * 180);
                  }
                }}
                className="rounded-lg border border-border bg-secondary/40 p-4 text-left transition-all hover:border-gold/50"
              >
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Arpeggio</div>
                <div className="mt-1 text-lg font-semibold">{arp.symbol}</div>
                <div className="mt-2 flex gap-1">
                  {arp.pcs.map((pc, k) => (
                    <span key={k} className="rounded bg-background px-2 py-0.5 font-mono text-xs text-gold">
                      {NOTE_NAMES_SHARP[pc]}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Theory sidebar */}
      <Card kicker="// Theory note">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The <span className="text-gold">{SCALES[scale.scaleId].name}</span> scale built on{" "}
          <span className="text-foreground font-mono">{scale.rootName}</span> contains {scale.notes.length} notes:{" "}
          <span className="font-mono">{scale.noteNames.join(" – ")}</span>. It's commonly used in{" "}
          <span className="text-foreground">{SCALES[scale.scaleId].tags.join(", ")}</span>. The root is the home note —
          phrases that resolve to it sound complete.
        </p>
      </Card>

      <div className="text-[10px] font-mono text-muted-foreground">
        STANDARD_TUNING: {STANDARD_TUNING_MIDI.join(", ")}
      </div>
    </div>
  );
}

function degreeLabel(i: number): string {
  return ["R", "2", "3", "4", "5", "6", "7", "8"][i] ?? `${i + 1}`;
}

export function PageHeader({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="border-b border-border/40 pb-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-gold">{kicker}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {sub && <p className="mt-2 font-mono text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Card({ kicker, right, children }: { kicker?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card/30 p-4 sm:p-5">
      {(kicker || right) && (
        <div className="mb-3 flex items-center justify-between">
          {kicker && <p className="font-mono text-[10px] uppercase tracking-widest text-gold">{kicker}</p>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}