import { useMemo } from "react";
import { playMidi } from "@/lib/audio/synth";

interface Props {
  highlights: number[]; // pitch classes 0..11 to highlight
  rootPc?: number;
  startMidi?: number; // default C3 = 48
  octaves?: number;
  showNoteNames?: boolean;
}

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_PCS = [1, 3, 6, 8, 10];
const NOTE_LABELS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function PianoKeyboard({ highlights, rootPc, startMidi = 48, octaves = 2, showNoteNames = true }: Props) {
  const whiteKeys = useMemo(() => {
    const list: { midi: number; pc: number }[] = [];
    for (let o = 0; o < octaves; o++) {
      for (const pc of WHITE_PCS) {
        list.push({ midi: startMidi + o * 12 + pc, pc });
      }
    }
    return list;
  }, [startMidi, octaves]);

  const blackKeys = useMemo(() => {
    const list: { midi: number; pc: number; offsetIndex: number }[] = [];
    // Map pc -> index in white keys per octave
    const whiteIndex: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
    const blackToWhite: Record<number, number> = { 1: 0, 3: 2, 6: 5, 8: 7, 10: 9 };
    for (let o = 0; o < octaves; o++) {
      for (const pc of BLACK_PCS) {
        const w = whiteIndex[blackToWhite[pc]];
        list.push({ midi: startMidi + o * 12 + pc, pc, offsetIndex: o * 7 + w });
      }
    }
    return list;
  }, [startMidi, octaves]);

  const totalWhite = whiteKeys.length;
  const isHighlighted = (pc: number) => highlights.includes(pc);

  return (
    <div className="relative w-full select-none overflow-hidden rounded-lg border border-border/60 bg-gradient-to-b from-secondary/40 to-background p-3 shadow-inner">
      <div className="relative flex h-44 w-full">
        {whiteKeys.map((k, i) => {
          const hl = isHighlighted(k.pc);
          const isRoot = rootPc !== undefined && k.pc === rootPc;
          return (
            <button
              key={k.midi}
              onClick={() => playMidi(k.midi, { duration: 0.6, type: "triangle" })}
              style={{ width: `${100 / totalWhite}%` }}
              className={`group relative flex flex-col-reverse items-center rounded-b-md border-l border-border/40 first:border-l-0 transition-all active:translate-y-px ${
                isRoot
                  ? "bg-gradient-to-b from-gold/40 to-gold/20"
                  : hl
                    ? "bg-gradient-to-b from-gold/20 to-gold/5"
                    : "bg-gradient-to-b from-zinc-100 to-zinc-300 hover:from-white"
              }`}
            >
              {(showNoteNames || hl) && (
                <span
                  className={`mb-2 text-[9px] font-mono uppercase tracking-wider ${
                    isRoot
                      ? "text-gold"
                      : hl
                        ? "text-gold/80"
                        : "text-zinc-500"
                  }`}
                >
                  {NOTE_LABELS[k.pc]}
                </span>
              )}
              {(hl || isRoot) && (
                <span
                  className={`absolute bottom-8 h-2 w-2 rounded-full ${isRoot ? "bg-gold shadow-[0_0_12px_oklch(0.78_0.13_85)]" : "bg-gold/70"}`}
                />
              )}
              <span className="absolute top-1 text-[8px] font-mono text-zinc-400/70">{i + 1}</span>
            </button>
          );
        })}

        {blackKeys.map((k) => {
          const hl = isHighlighted(k.pc);
          const isRoot = rootPc !== undefined && k.pc === rootPc;
          const left = ((k.offsetIndex + 1) / totalWhite) * 100;
          const widthPct = (100 / totalWhite) * 0.6;
          return (
            <button
              key={k.midi}
              onClick={() => playMidi(k.midi, { duration: 0.6, type: "triangle" })}
              style={{ left: `calc(${left}% - ${widthPct / 2}%)`, width: `${widthPct}%` }}
              className={`absolute top-0 h-28 rounded-b-md border border-black/60 transition-all active:translate-y-px ${
                isRoot
                  ? "bg-gradient-to-b from-gold to-gold/70 shadow-[0_0_20px_oklch(0.78_0.13_85_/_0.6)]"
                  : hl
                    ? "bg-gradient-to-b from-gold/60 to-gold/30"
                    : "bg-gradient-to-b from-zinc-900 to-black"
              }`}
            >
              {hl && (
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-mono text-gold-foreground">
                  {NOTE_LABELS[k.pc]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}