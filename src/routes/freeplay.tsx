import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import {
  NOTE_NAMES_SHARP,
  ALL_KEY_NAMES,
  SCALES,
  CHORD_FORMULAS,
  buildScale,
  diatonicChords,
  scalesByDifficulty,
  pcToNote,
  STANDARD_TUNING_MIDI,
  type ScaleId,
  type ChordType,
} from "@/lib/music/theory";
import { Fretboard } from "@/components/Fretboard";
import { playMidi, playChord, unlockAudio } from "@/lib/audio/synth";
import { PageHeader, Card } from "./scales";

export const Route = createFileRoute("/freeplay")({
  head: () => ({
    meta: [
      { title: "Free-Play — StudioSphere" },
      { name: "description", content: "Play any note on a full piano or fretboard. Get instant chord matches and suggested progressions." },
      { property: "og:title", content: "Free-Play — StudioSphere" },
      { property: "og:description", content: "Tap notes, see possible chords and chord progressions in real time." },
    ],
  }),
  component: FreePlayPage,
});

type View = "piano" | "guitar";

/* ---------- Chord identification ---------- */

interface ChordMatch {
  rootName: string;
  rootPc: number;
  type: ChordType;
  symbol: string;
  score: number; // 0..1
  missing: number[];
  extras: number[];
}

function identifyChords(activePcs: number[]): ChordMatch[] {
  if (activePcs.length === 0) return [];
  const pcSet = new Set(activePcs);
  const matches: ChordMatch[] = [];

  for (const pc of activePcs) {
    for (const type of Object.keys(CHORD_FORMULAS) as ChordType[]) {
      const formula = CHORD_FORMULAS[type];
      const chordPcs = formula.intervals.map((iv) => (pc + iv) % 12);
      const chordSet = new Set(chordPcs);
      const have = chordPcs.filter((p) => pcSet.has(p)).length;
      const missing = chordPcs.filter((p) => !pcSet.has(p));
      const extras = activePcs.filter((p) => !chordSet.has(p));
      // Score: coverage of chord tones, penalized by extras + missing
      const coverage = have / chordPcs.length;
      const penalty = (extras.length + missing.length) * 0.12;
      const score = Math.max(0, coverage - penalty);
      if (coverage >= 0.66 && score > 0.25) {
        matches.push({
          rootName: NOTE_NAMES_SHARP[pc],
          rootPc: pc,
          type,
          symbol: NOTE_NAMES_SHARP[pc] + formula.suffix,
          score,
          missing,
          extras,
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  // Dedupe by symbol
  const seen = new Set<string>();
  const out: ChordMatch[] = [];
  for (const m of matches) {
    if (seen.has(m.symbol)) continue;
    seen.add(m.symbol);
    out.push(m);
    if (out.length >= 6) break;
  }
  return out;
}

/* ---------- Progression suggestions ---------- */

interface ProgressionSuggestion {
  name: string;
  chords: { symbol: string; type: ChordType; rootPc: number }[];
}

function suggestProgressions(rootPc: number, type: ChordType, keyRoot: string, scaleId: ScaleId): ProgressionSuggestion[] {
  // Build the diatonic chords of the chosen key as our palette
  const scale = buildScale(keyRoot, scaleId);
  const isSeventh = type.includes("7") || type.includes("9") || type.includes("13");
  const dia = diatonicChords(scale, isSeventh);

  // Find the played chord's degree in the diatonic set (by root pc)
  const idx = dia.findIndex((d) => d.rootPc === rootPc);
  const startDeg = idx >= 0 ? idx : 0;

  const isMinorKey = scaleId === "minor" || scaleId === "harmonic_minor" || scaleId === "melodic_minor";

  // Common templates as scale degree indices (0-based)
  const templates: { name: string; degrees: number[] }[] = isMinorKey
    ? [
        { name: "i – VI – III – VII", degrees: [0, 5, 2, 6] },
        { name: "i – iv – v – i", degrees: [0, 3, 4, 0] },
        { name: "i – VII – VI – V", degrees: [0, 6, 5, 4] },
        { name: "i – iv – VII – III", degrees: [0, 3, 6, 2] },
      ]
    : [
        { name: "I – V – vi – IV", degrees: [0, 4, 5, 3] },
        { name: "ii – V – I", degrees: [1, 4, 0] },
        { name: "I – vi – IV – V", degrees: [0, 5, 3, 4] },
        { name: "vi – IV – I – V", degrees: [5, 3, 0, 4] },
      ];

  return templates.map((tpl) => {
    // Rotate template so it starts on the played chord when possible
    const rot = tpl.degrees.indexOf(startDeg);
    const degs = rot >= 0 ? [...tpl.degrees.slice(rot), ...tpl.degrees.slice(0, rot)] : tpl.degrees;
    const chords = degs.map((d) => {
      const c = dia[d % dia.length];
      return { symbol: c.symbol, type: c.type, rootPc: c.rootPc };
    });
    return { name: tpl.name, chords };
  });
}

/* ---------- Component ---------- */

function FreePlayPage() {
  const [view, setView] = useState<View>("piano");
  const [active, setActive] = useState<Set<number>>(new Set()); // MIDI numbers
  const [keyRoot, setKeyRoot] = useState("C");
  const [scaleId, setScaleId] = useState<ScaleId>("major");
  const [showScaleOverlay, setShowScaleOverlay] = useState(true);

  const scales = scalesByDifficulty("very-difficult");
  const scale = useMemo(() => buildScale(keyRoot, scaleId), [keyRoot, scaleId]);

  const activePcs = useMemo(() => {
    const s = new Set<number>();
    active.forEach((m) => s.add(((m % 12) + 12) % 12));
    return Array.from(s);
  }, [active]);

  const matches = useMemo(() => identifyChords(activePcs), [activePcs]);
  const topMatch = matches[0];
  const progressions = useMemo(
    () => (topMatch ? suggestProgressions(topMatch.rootPc, topMatch.type, keyRoot, scaleId) : []),
    [topMatch, keyRoot, scaleId],
  );

  const toggleNote = useCallback((midi: number) => {
    void unlockAudio();
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(midi)) {
        next.delete(midi);
      } else {
        next.add(midi);
        playMidi(midi, { duration: 0.7, type: view === "piano" ? "triangle" : "sawtooth" });
      }
      return next;
    });
  }, [view]);

  const clearNotes = () => setActive(new Set());

  const playActive = () => {
    const midis = Array.from(active).sort((a, b) => a - b);
    if (midis.length === 0) return;
    playChord(midis, { duration: 1.4, type: view === "piano" ? "triangle" : "sawtooth" });
  };

  const playProgression = (prog: ProgressionSuggestion) => {
    void unlockAudio();
    prog.chords.forEach((c, i) => {
      const midis = CHORD_FORMULAS[c.type].intervals.map((iv) => 48 + c.rootPc + iv);
      setTimeout(() => playChord(midis, { duration: 0.9, type: "triangle" }), i * 750);
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PageHeader
        kicker="04 — Play"
        title="Free-Play"
        sub="Tap notes — discover chords and progressions live."
      />

      {/* Controls */}
      <Card kicker="// Setup">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="View">
            <div className="flex overflow-hidden rounded-md border border-border">
              {(["piano", "guitar"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => { setView(v); clearNotes(); }}
                  className={`flex-1 px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                    view === v ? "bg-gold text-gold-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "piano" ? "🎹 Piano" : "🎸 Guitar"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Key">
            <select
              value={keyRoot}
              onChange={(e) => setKeyRoot(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
            >
              {ALL_KEY_NAMES.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Scale / Mode">
            <select
              value={scaleId}
              onChange={(e) => setScaleId(e.target.value as ScaleId)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:border-gold focus:outline-none"
            >
              {scales.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </select>
          </Field>
          <Field label="Overlay">
            <label className="flex h-full cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
              <input
                type="checkbox"
                checked={showScaleOverlay}
                onChange={(e) => setShowScaleOverlay(e.target.checked)}
                className="accent-gold"
              />
              Highlight scale notes
            </label>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={clearNotes}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 font-mono text-xs uppercase tracking-widest hover:border-gold/50"
          >
            Clear notes
          </button>
          <button
            onClick={playActive}
            disabled={active.size === 0}
            className="rounded-md border border-gold/60 bg-gold/10 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-gold transition-colors hover:bg-gold/20 disabled:opacity-40"
          >
            ▶ Play held notes
          </button>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {active.size === 0 ? "No notes held — tap to add" : `${active.size} note${active.size === 1 ? "" : "s"} held`}
          </span>
        </div>
      </Card>

      {/* Instrument view */}
      {view === "piano" ? (
        <Card kicker="// Piano · all keys">
          <FreePlayPiano
            active={active}
            onToggle={toggleNote}
            scalePcs={showScaleOverlay ? scale.notes : []}
            rootPc={scale.rootPc}
          />
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            Click keys to add/remove them. Gold dot = scale note · Gold key = key root.
          </p>
        </Card>
      ) : (
        <Card kicker="// Guitar · 6 strings · 15 frets">
          <Fretboard
            positions={Array.from(active).flatMap((midi) => {
              const positions: { string: number; fret: number; pc: number; isRoot: boolean; label?: string }[] = [];
              for (let s = 0; s < 6; s++) {
                const fret = midi - STANDARD_TUNING_MIDI[s];
                if (fret >= 0 && fret <= 15) {
                  const pc = ((midi % 12) + 12) % 12;
                  positions.push({ string: s, fret, pc, isRoot: pc === scale.rootPc });
                }
              }
              return positions;
            })}
            startFret={0}
            endFret={15}
            rootPc={scale.rootPc}
            scalePcs={showScaleOverlay ? scale.notes : undefined}
            height={220}
          />
          <FretClickGrid active={active} onToggle={toggleNote} />
          <p className="mt-3 font-mono text-[10px] text-muted-foreground">
            Tap any cell below to toggle that fret. Held notes appear on the fretboard above.
          </p>
        </Card>
      )}

      {/* Possible chords */}
      <Card
        kicker="// Possible chords"
        right={
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            From {activePcs.length} pitch{activePcs.length === 1 ? "" : "es"}
          </span>
        }
      >
        {matches.length === 0 ? (
          <p className="font-mono text-xs text-muted-foreground">
            Hold at least 2 notes to see chord matches. Try a triad — root, third, fifth.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {matches.map((m, i) => {
              const midis = CHORD_FORMULAS[m.type].intervals.map((iv) => 48 + m.rootPc + iv);
              return (
                <button
                  key={m.symbol + i}
                  onClick={() => playChord(midis, { duration: 1.2, type: "triangle" })}
                  className={`group relative rounded-lg border p-3 text-left transition-all hover:border-gold/60 hover:bg-secondary ${
                    i === 0 ? "border-gold/60 bg-gold/10" : "border-border bg-secondary/40"
                  }`}
                >
                  <div className="font-mono text-[9px] uppercase tracking-widest text-gold">
                    {i === 0 ? "Best match" : `Match ${i + 1}`}
                  </div>
                  <div className="mt-1 text-xl font-bold tracking-tight">{m.symbol}</div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {CHORD_FORMULAS[m.type].name}
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-background">
                    <div className="h-full bg-gold" style={{ width: `${Math.round(m.score * 100)}%` }} />
                  </div>
                  {(m.missing.length > 0 || m.extras.length > 0) && (
                    <div className="mt-2 font-mono text-[9px] text-muted-foreground">
                      {m.missing.length > 0 && <span>missing {m.missing.map((p) => pcToNote(p)).join(",")} · </span>}
                      {m.extras.length > 0 && <span>+{m.extras.map((p) => pcToNote(p)).join(",")}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Progression suggestions */}
      <Card
        kicker="// Suggested progressions"
        right={
          topMatch && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Starting from <span className="text-gold">{topMatch.symbol}</span> in {keyRoot} {SCALES[scaleId].name}
            </span>
          )
        }
      >
        {!topMatch ? (
          <p className="font-mono text-xs text-muted-foreground">
            Play a recognizable chord to see progressions that work with it.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {progressions.map((prog, i) => (
              <div key={i} className="rounded-lg border border-border bg-secondary/40 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-gold">{prog.name}</div>
                  <button
                    onClick={() => playProgression(prog)}
                    className="rounded border border-gold/50 bg-gold/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-gold hover:bg-gold/20"
                  >
                    ▶ Play
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {prog.chords.map((c, j) => {
                    const midis = CHORD_FORMULAS[c.type].intervals.map((iv) => 48 + c.rootPc + iv);
                    return (
                      <button
                        key={j}
                        onClick={() => playChord(midis, { duration: 1, type: "triangle" })}
                        className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm font-semibold transition-colors hover:border-gold/50 hover:text-gold"
                      >
                        {c.symbol}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Free-play piano (full range, click toggles MIDI) ---------- */

function FreePlayPiano({
  active,
  onToggle,
  scalePcs,
  rootPc,
}: {
  active: Set<number>;
  onToggle: (midi: number) => void;
  scalePcs: number[];
  rootPc: number;
}) {
  const START_MIDI = 36; // C2
  const OCTAVES = 5; // C2..C7
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  const BLACK_PCS = [1, 3, 6, 8, 10];
  const blackToWhite: Record<number, number> = { 1: 0, 3: 2, 6: 5, 8: 7, 10: 9 };
  const whiteIndex: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

  const whites: { midi: number; pc: number }[] = [];
  for (let o = 0; o < OCTAVES; o++) {
    for (const pc of WHITE_PCS) whites.push({ midi: START_MIDI + o * 12 + pc, pc });
  }
  const blacks: { midi: number; pc: number; idx: number }[] = [];
  for (let o = 0; o < OCTAVES; o++) {
    for (const pc of BLACK_PCS) {
      blacks.push({ midi: START_MIDI + o * 12 + pc, pc, idx: o * 7 + whiteIndex[blackToWhite[pc]] });
    }
  }
  const total = whites.length;

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-gradient-to-b from-secondary/40 to-background p-3 shadow-inner">
      <div className="relative h-44" style={{ minWidth: total * 26 }}>
        <div className="relative flex h-full">
          {whites.map((k) => {
            const isActive = active.has(k.midi);
            const inScale = scalePcs.includes(k.pc);
            const isRoot = k.pc === rootPc;
            return (
              <button
                key={k.midi}
                onClick={() => onToggle(k.midi)}
                style={{ width: `${100 / total}%` }}
                className={`group relative flex flex-col-reverse items-center rounded-b-md border-l border-border/40 first:border-l-0 transition-all active:translate-y-px ${
                  isActive
                    ? "bg-gradient-to-b from-gold to-gold/60"
                    : isRoot
                    ? "bg-gradient-to-b from-gold/30 to-gold/10"
                    : inScale
                    ? "bg-gradient-to-b from-gold/15 to-zinc-100 hover:from-gold/25"
                    : "bg-gradient-to-b from-zinc-100 to-zinc-300 hover:from-white"
                }`}
              >
                <span className={`mb-2 font-mono text-[8px] uppercase ${isActive ? "text-gold-foreground" : "text-zinc-500"}`}>
                  {NOTE_NAMES_SHARP[k.pc]}
                  {Math.floor(k.midi / 12) - 1}
                </span>
              </button>
            );
          })}
          {blacks.map((k) => {
            const isActive = active.has(k.midi);
            const inScale = scalePcs.includes(k.pc);
            const isRoot = k.pc === rootPc;
            const left = ((k.idx + 1) / total) * 100;
            const widthPct = (100 / total) * 0.6;
            return (
              <button
                key={k.midi}
                onClick={() => onToggle(k.midi)}
                style={{ left: `calc(${left}% - ${widthPct / 2}%)`, width: `${widthPct}%` }}
                className={`absolute top-0 h-28 rounded-b-md border border-black/60 transition-all active:translate-y-px ${
                  isActive
                    ? "bg-gradient-to-b from-gold to-gold/70 shadow-[0_0_18px_oklch(0.78_0.13_85_/_0.7)]"
                    : isRoot
                    ? "bg-gradient-to-b from-gold/70 to-gold/40"
                    : inScale
                    ? "bg-gradient-to-b from-gold/40 to-zinc-900"
                    : "bg-gradient-to-b from-zinc-900 to-black"
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Fret click grid (toggle frets directly) ---------- */

function FretClickGrid({
  active,
  onToggle,
}: {
  active: Set<number>;
  onToggle: (midi: number) => void;
}) {
  const STRINGS = [0, 1, 2, 3, 4, 5]; // low E .. high E
  const STRING_LABELS = ["E", "A", "D", "G", "B", "e"];
  const FRETS = Array.from({ length: 16 }, (_, i) => i); // 0..15

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border/60 bg-card/30 p-2">
      <table className="w-full border-collapse font-mono text-[10px]">
        <thead>
          <tr>
            <th className="px-1 py-1 text-left text-muted-foreground">str</th>
            {FRETS.map((f) => (
              <th key={f} className="px-1 py-1 text-center text-muted-foreground">{f}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...STRINGS].reverse().map((s) => (
            <tr key={s}>
              <td className="px-1 py-0.5 font-bold text-gold">{STRING_LABELS[s]}</td>
              {FRETS.map((f) => {
                const midi = STANDARD_TUNING_MIDI[s] + f;
                const isActive = active.has(midi);
                const pc = ((midi % 12) + 12) % 12;
                return (
                  <td key={f} className="p-0">
                    <button
                      onClick={() => onToggle(midi)}
                      className={`m-0.5 h-7 w-full min-w-[28px] rounded border text-[9px] transition-colors ${
                        isActive
                          ? "border-gold bg-gold text-gold-foreground"
                          : "border-border bg-secondary/40 text-muted-foreground hover:border-gold/50 hover:text-gold"
                      }`}
                      title={`String ${s + 1}, fret ${f} (${NOTE_NAMES_SHARP[pc]})`}
                    >
                      {NOTE_NAMES_SHARP[pc]}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}