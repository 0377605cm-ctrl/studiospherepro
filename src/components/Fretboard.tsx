import { STANDARD_TUNING_PCS, STANDARD_TUNING_MIDI, NOTE_NAMES_SHARP } from "@/lib/music/theory";
import { playMidi } from "@/lib/audio/synth";

interface Position {
  string: number;
  fret: number;
  pc: number;
  isRoot?: boolean;
  label?: string; // override label
  emphasis?: "tab" | "scale";
}

interface Props {
  positions: Position[];
  startFret?: number;
  endFret?: number;
  showAllNoteNames?: boolean;
  rootPc?: number;
  scalePcs?: number[];
  height?: number;
  tuningPcs?: number[];
  tuningMidi?: number[];
  stringLabels?: string[];
}

const DEFAULT_STRING_LABELS = ["E", "A", "D", "G", "B", "e"]; // low to high
const FRET_MARKERS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_MARKERS = [12, 24];

export function Fretboard({
  positions,
  startFret = 0,
  endFret = 15,
  rootPc,
  scalePcs,
  height = 200,
  tuningPcs = STANDARD_TUNING_PCS,
  tuningMidi = STANDARD_TUNING_MIDI,
  stringLabels = DEFAULT_STRING_LABELS,
}: Props) {
  const fretCount = endFret - startFret + 1;
  const numStrings = 6;
  const stringSpacing = (height - 30) / (numStrings - 1);
  const NUT_WIDTH = 30; // px reserved for string labels / nut

  // index positions for fast lookup
  const posMap = new Map<string, Position>();
  positions.forEach((p) => posMap.set(`${p.string}:${p.fret}`, p));

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-gradient-to-b from-[oklch(0.16_0.01_60)] to-[oklch(0.12_0.005_60)] p-4 shadow-inner">
      <div className="relative" style={{ minWidth: 640, height: height + 40 }}>
        {/* Fret numbers */}
        <div className="mb-2 flex">
          <div style={{ width: NUT_WIDTH, flex: "0 0 auto" }} />
          {Array.from({ length: fretCount }).map((_, i) => {
            const fret = startFret + i;
            return (
              <div
                key={fret}
                className="flex-1 text-center font-mono text-[10px] text-muted-foreground"
              >
                {fret}
              </div>
            );
          })}
        </div>

        <div className="relative" style={{ height }}>
          {/* Background fret marker dots */}
          <div className="absolute inset-0 flex" style={{ paddingLeft: NUT_WIDTH }}>
            {Array.from({ length: fretCount }).map((_, i) => {
              const fret = startFret + i;
              const isMarker = FRET_MARKERS.includes(fret);
              const isDouble = DOUBLE_MARKERS.includes(fret);
              return (
                <div key={fret} className="relative flex-1">
                  {isMarker && !isDouble && (
                    <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/10" />
                  )}
                  {isDouble && (
                    <>
                      <div className="absolute left-1/2 top-1/3 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/15" />
                      <div className="absolute left-1/2 top-2/3 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/15" />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Strings */}
          {Array.from({ length: numStrings }).map((_, sIdx) => {
            const stringIdx = numStrings - 1 - sIdx; // visual top = high E (index 5)
            const y = sIdx * stringSpacing;
            const thickness = 1 + (numStrings - 1 - sIdx) * 0.3;
            return (
              <div key={stringIdx}>
                {/* string line */}
                <div
                  className="absolute bg-gradient-to-r from-zinc-500/70 via-zinc-300/70 to-zinc-500/70"
                  style={{ top: y, left: NUT_WIDTH, right: 0, height: thickness }}
                />
                <div
                  className="absolute -translate-y-1/2 font-mono text-[10px] text-muted-foreground"
                  style={{ top: y, left: 0, width: 24, textAlign: "right" }}
                >
                  {stringLabels[stringIdx]}
                </div>
              </div>
            );
          })}

          {/* Fret wires */}
          <div className="absolute inset-0 flex" style={{ paddingLeft: NUT_WIDTH }}>
            {Array.from({ length: fretCount + 1 }).map((_, i) => (
              <div
                key={i}
                className="border-l border-zinc-600/50 first:border-l-2 first:border-zinc-300/70"
                style={{ flex: i === 0 ? "0 0 0" : "1 1 0" }}
              />
            ))}
          </div>

          {/* Notes */}
          {Array.from({ length: numStrings }).map((_, sIdx) => {
            const stringIdx = numStrings - 1 - sIdx;
            const y = sIdx * stringSpacing;
            return Array.from({ length: fretCount }).map((_, fIdx) => {
              const fret = startFret + fIdx;
              const found = posMap.get(`${stringIdx}:${fret}`);
              const pc = (tuningPcs[stringIdx] + fret) % 12;
              const inScale = scalePcs?.includes(pc);
              if (!found && !inScale) return null;
              const isRoot = found?.isRoot ?? pc === rootPc;
              const label = found?.label ?? NOTE_NAMES_SHARP[pc];
              const handleClick = () => {
                const midi = tuningMidi[stringIdx] + fret;
                playMidi(midi, { duration: 0.5, type: "sawtooth" });
              };
              const size = found ? 22 : 16;
              return (
                <button
                  key={`${stringIdx}-${fret}`}
                  onClick={handleClick}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border font-mono text-[9px] font-semibold transition-all hover:scale-110 ${
                    isRoot
                      ? "border-gold bg-gold text-gold-foreground shadow-[0_0_12px_oklch(0.78_0.13_85_/_0.7)]"
                      : found
                        ? "border-gold/60 bg-gold/20 text-gold"
                        : "border-border/40 bg-background/60 text-muted-foreground hover:border-gold/40 hover:text-gold"
                  }`}
                  style={{
                    top: y,
                    left: `calc(${NUT_WIDTH}px + (100% - ${NUT_WIDTH}px) * ${(fIdx + 0.5) / fretCount})`,
                    width: size,
                    height: size,
                  }}
                >
                  {label}
                </button>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}