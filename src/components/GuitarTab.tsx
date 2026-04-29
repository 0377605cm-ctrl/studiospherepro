import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { CHORD_FORMULAS, NOTE_NAMES_SHARP, noteToPc, SCALES, type ScaleId } from "@/lib/music/theory";

/**
 * Renders a guitar TAB + treble-clef notation view from analyzer chord segments.
 * - SVG-based (no extra deps)
 * - Slow-down playback (0.5x – 1x) using HTMLAudioElement.playbackRate
 * - Fullscreen toggle
 * - Fullscreen zoom controls for note size + measure width
 */

export interface TabSegment {
  startSec: number;
  chord: { symbol: string; rootPc: number; type: string };
}

interface Props {
  segments: TabSegment[];
  bpm: number;
  keyRoot: string;
  keyMode: "major" | "minor";
  audioRef: RefObject<HTMLAudioElement | null>;
  /** Active solo scale — drives note spelling (sharps vs flats) on the staff/TAB. */
  scaleRoot?: string;
  scaleId?: ScaleId;
}

const STRING_MIDI = [64, 59, 55, 50, 45, 40];
const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

function voiceChord(rootPc: number, type: string): { stringIdx: number; fret: number; pc: number }[] {
  const formula = CHORD_FORMULAS[type] ?? CHORD_FORMULAS.maj;
  const pcs = formula.intervals.map((iv) => (rootPc + iv) % 12);

  let bestWindow: { stringIdx: number; fret: number; pc: number }[] | null = null;
  let bestSpan = Infinity;
  for (let startFret = 0; startFret <= 7; startFret++) {
    const used = new Set<number>();
    const placed: { stringIdx: number; fret: number; pc: number }[] = [];
    for (const pc of pcs) {
      let placedThis = false;
      for (let s = 5; s >= 0 && !placedThis; s--) {
        if (used.has(s)) continue;
        for (let fret = startFret; fret < startFret + 5 && fret <= 15; fret++) {
          const noteMidi = STRING_MIDI[s] + fret;
          if (((noteMidi % 12) + 12) % 12 === pc) {
            placed.push({ stringIdx: s, fret, pc });
            used.add(s);
            placedThis = true;
            break;
          }
        }
      }
    }
    if (placed.length === pcs.length) {
      const frets = placed.map((p) => p.fret);
      const span = Math.max(...frets) - Math.min(...frets);
      if (span < bestSpan) {
        bestSpan = span;
        bestWindow = placed;
      }
    }
  }
  if (bestWindow) return bestWindow;

  return pcs
    .map((pc) => {
      for (let fret = 0; fret <= 12; fret++) {
        for (let s = 5; s >= 0; s--) {
          const m = STRING_MIDI[s] + fret;
          if (((m % 12) + 12) % 12 === pc) return { stringIdx: s, fret, pc };
        }
      }
      return null;
    })
    .filter((x): x is { stringIdx: number; fret: number; pc: number } => x !== null);
}

const LETTER_STEPS: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
function midiToStaveInfo(midi: number, useFlats = false): { y: number; accidental: "" | "#" | "b"; letter: string; octave: number } {
  const arr = useFlats ? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] : NOTE_NAMES_SHARP;
  const pc = ((midi % 12) + 12) % 12;
  const name = arr[pc];
  const letter = name[0];
  const accidental: "" | "#" | "b" = name.length > 1 ? (name[1] === "#" ? "#" : "b") : "";
  const octave = Math.floor(midi / 12) - 1;
  const step = LETTER_STEPS[letter] + octave * 7;
  const baseStep = LETTER_STEPS.E + 4 * 7;
  const y = (baseStep - step) * 3;
  return { y, accidental, letter, octave };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nudge(value: number, delta: number, min: number, max: number) {
  return Number(clamp(value + delta, min, max).toFixed(2));
}

export function GuitarTab({ segments, bpm, keyRoot, keyMode, audioRef, scaleRoot, scaleId }: Props) {
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [noteScale, setNoteScale] = useState(1);
  const [measureScale, setMeasureScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const applyPlaybackRate = () => {
      const audioEl = audioRef.current;
      if (!audioEl) return;
      audioEl.playbackRate = speed;
      const mediaEl = audioEl as HTMLAudioElement & {
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      mediaEl.preservesPitch = true;
      mediaEl.webkitPreservesPitch = true;
    };

    applyPlaybackRate();
    const raf = requestAnimationFrame(applyPlaybackRate);
    return () => cancelAnimationFrame(raf);
  }, [audioRef, speed]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const audioEl = audioRef.current;
      if (!audioEl) {
        setActiveIdx(-1);
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = audioEl.currentTime;
      let idx = -1;
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].startSec <= t) idx = i;
        else break;
      }
      setActiveIdx(idx);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioRef, segments]);

  const voicings = useMemo(
    () => segments.map((s) => ({ ...s, voicing: voiceChord(s.chord.rootPc, s.chord.type) })),
    [segments],
  );

  const measuresPerLine = 4;
  const beatsPerMeasure = 4;
  const chordsPerLine = measuresPerLine * beatsPerMeasure;
  const chordWidth = 60 * measureScale;
  const leftPad = 72;
  const rightPad = 24;
  const lineWidth = leftPad + chordsPerLine * chordWidth + rightPad;
  const staveGap = 6 * noteScale;
  const staveHeight = staveGap * 4;
  const tabTop = staveHeight + 18 * noteScale;
  const tabGap = 10 * noteScale;
  const tabHeight = tabGap * 5;
  const lineBlockHeight = tabTop + tabHeight + 18 * noteScale;
  const lineGap = 38 * noteScale;
  const totalLines = Math.ceil(voicings.length / chordsPerLine) || 1;
  const svgHeight = totalLines * (lineBlockHeight + lineGap) + 28;

  const toggleFs = async () => {
    if (!containerRef.current) return;
    if (!fullscreen) {
      try {
        await containerRef.current.requestFullscreen?.();
      } catch {}
      setFullscreen(true);
    } else {
      try {
        await document.exitFullscreen?.();
      } catch {}
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const flatRoots = ["F", "Bb", "Eb", "Ab", "Db", "Gb"];
  const flatScales: ScaleId[] = ["minor", "pentatonic_minor", "blues", "dorian", "phrygian", "locrian", "harmonic_minor", "melodic_minor", "phrygian_dominant"];
  const useFlats = scaleId
    ? flatRoots.includes(scaleRoot ?? keyRoot) || flatScales.includes(scaleId)
    : keyMode === "minor" || flatRoots.includes(keyRoot);

  const seekAndPlay = (startSec: number) => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    audioEl.currentTime = startSec;
    void audioEl.play().catch(() => undefined);
  };

  return (
    <div
      ref={containerRef}
      className={fullscreen ? "fixed inset-0 z-50 overflow-auto bg-background p-4 sm:p-6" : ""}
    >
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Speed</span>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-32 accent-gold"
          />
          <span className="w-12 font-mono text-xs text-gold">{Math.round(speed * 100)}%</span>
        </div>

        <div className="flex gap-1">
          {[0.5, 0.75, 1].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${
                Math.abs(speed - s) < 0.01
                  ? "border-gold bg-gold/20 text-gold"
                  : "border-border text-muted-foreground hover:border-gold/50"
              }`}
            >
              {s === 1 ? "Full" : `${s}x`}
            </button>
          ))}
        </div>

        {fullscreen && (
          <>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Notes</span>
              <button
                onClick={() => setNoteScale((v) => nudge(v, -0.1, 0.8, 1.8))}
                className="h-7 w-7 rounded border border-border bg-secondary/40 text-sm text-foreground hover:border-gold/50"
                aria-label="Shrink notes"
              >
                −
              </button>
              <span className="w-10 text-center font-mono text-[11px] text-gold">{noteScale.toFixed(1)}x</span>
              <button
                onClick={() => setNoteScale((v) => nudge(v, 0.1, 0.8, 1.8))}
                className="h-7 w-7 rounded border border-border bg-secondary/40 text-sm text-foreground hover:border-gold/50"
                aria-label="Enlarge notes"
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Measures</span>
              <button
                onClick={() => setMeasureScale((v) => nudge(v, -0.1, 0.75, 1.8))}
                className="h-7 w-7 rounded border border-border bg-secondary/40 text-sm text-foreground hover:border-gold/50"
                aria-label="Shrink measures"
              >
                −
              </button>
              <span className="w-10 text-center font-mono text-[11px] text-gold">{measureScale.toFixed(1)}x</span>
              <button
                onClick={() => setMeasureScale((v) => nudge(v, 0.1, 0.75, 1.8))}
                className="h-7 w-7 rounded border border-border bg-secondary/40 text-sm text-foreground hover:border-gold/50"
                aria-label="Enlarge measures"
              >
                +
              </button>
            </div>

            <button
              onClick={() => {
                setNoteScale(1);
                setMeasureScale(1);
              }}
              className="rounded border border-border bg-secondary/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-gold/50 hover:text-foreground"
            >
              Reset zoom
            </button>
          </>
        )}

        <button
          onClick={toggleFs}
          className="ml-auto rounded border border-border bg-secondary/40 px-3 py-1 font-mono text-[10px] uppercase tracking-widest hover:border-gold/60"
        >
          {fullscreen ? "✕ Exit fullscreen" : "⛶ Fullscreen"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/40 p-4">
        <svg
          viewBox={`0 0 ${lineWidth} ${svgHeight}`}
          width="100%"
          style={{ minWidth: fullscreen ? `${lineWidth}px` : `${Math.min(lineWidth, 900)}px` }}
          className="text-foreground"
        >
          {Array.from({ length: totalLines }).map((_, lineIdx) => {
            const yOff = lineIdx * (lineBlockHeight + lineGap) + 12;
            const lineSegments = voicings.slice(lineIdx * chordsPerLine, (lineIdx + 1) * chordsPerLine);

            return (
              <g key={lineIdx} transform={`translate(0, ${yOff})`}>
                <text
                  x={6}
                  y={staveHeight - 2 * noteScale}
                  fontSize={36 * noteScale}
                  fill="currentColor"
                  fontFamily="serif"
                  style={{ fontStyle: "italic" }}
                >
                  𝄞
                </text>
                <text
                  x={42}
                  y={staveGap * 2}
                  fontSize={14 * noteScale}
                  fontWeight="bold"
                  fill="currentColor"
                  textAnchor="middle"
                >
                  {beatsPerMeasure}
                </text>
                <text
                  x={42}
                  y={staveHeight - 1.5 * noteScale}
                  fontSize={14 * noteScale}
                  fontWeight="bold"
                  fill="currentColor"
                  textAnchor="middle"
                >
                  4
                </text>

                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={i}
                    x1={leftPad - 10}
                    x2={lineWidth - rightPad}
                    y1={i * staveGap}
                    y2={i * staveGap}
                    stroke="currentColor"
                    strokeOpacity={0.6}
                    strokeWidth={0.6}
                  />
                ))}

                <text
                  x={6}
                  y={tabTop + tabGap * 1.8}
                  fontSize={11 * noteScale}
                  fontFamily="monospace"
                  fill="currentColor"
                  opacity={0.7}
                >
                  TAB
                </text>
                {STRING_LABELS.map((label, i) => (
                  <g key={i}>
                    <line
                      x1={leftPad - 10}
                      x2={lineWidth - rightPad}
                      y1={tabTop + i * tabGap}
                      y2={tabTop + i * tabGap}
                      stroke="currentColor"
                      strokeOpacity={0.4}
                      strokeWidth={0.5}
                    />
                    <text
                      x={leftPad - 16}
                      y={tabTop + 3 * noteScale + i * tabGap}
                      fontSize={8 * noteScale}
                      fontFamily="monospace"
                      fill="currentColor"
                      opacity={0.6}
                      textAnchor="end"
                    >
                      {label}
                    </text>
                  </g>
                ))}

                {lineSegments.map((seg, beatIdx) => {
                  const x = leftPad + beatIdx * chordWidth + chordWidth / 2;
                  const globalIdx = lineIdx * chordsPerLine + beatIdx;
                  const isActive = globalIdx === activeIdx;
                  const isMeasureStart = beatIdx % beatsPerMeasure === 0;

                  return (
                    <g key={beatIdx}>
                      {isMeasureStart && beatIdx > 0 && (
                        <>
                          <line
                            x1={leftPad + beatIdx * chordWidth}
                            x2={leftPad + beatIdx * chordWidth}
                            y1={0}
                            y2={staveHeight - staveGap}
                            stroke="currentColor"
                            strokeOpacity={0.5}
                          />
                          <line
                            x1={leftPad + beatIdx * chordWidth}
                            x2={leftPad + beatIdx * chordWidth}
                            y1={tabTop}
                            y2={tabTop + tabGap * 5}
                            stroke="currentColor"
                            strokeOpacity={0.5}
                          />
                        </>
                      )}

                      {isActive && (
                        <rect
                          x={x - chordWidth / 2 + 4}
                          y={-7 * noteScale}
                          width={Math.max(chordWidth - 8, 18)}
                          height={lineBlockHeight}
                          fill="var(--gold)"
                          opacity={0.12}
                          rx={4}
                        />
                      )}

                      <text
                        x={x}
                        y={-8 * noteScale}
                        fontSize={11 * noteScale}
                        fontWeight="bold"
                        fill={isActive ? "var(--gold)" : "currentColor"}
                        textAnchor="middle"
                        fontFamily="monospace"
                        style={{ cursor: "pointer" }}
                        onClick={() => seekAndPlay(seg.startSec)}
                      >
                        {seg.chord.symbol}
                      </text>

                      {seg.voicing.map((v, vi) => {
                        const midi = STRING_MIDI[v.stringIdx] + v.fret;
                        const info = midiToStaveInfo(midi, useFlats);
                        const noteY = staveHeight - staveGap + info.y * noteScale;
                        if (noteY < -24 * noteScale || noteY > staveHeight + 10 * noteScale) return null;
                        return (
                          <g key={vi}>
                            {info.accidental && (
                              <text
                                x={x - 10 * noteScale}
                                y={noteY + 2 * noteScale}
                                fontSize={9 * noteScale}
                                fill="currentColor"
                                textAnchor="end"
                              >
                                {info.accidental === "#" ? "♯" : "♭"}
                              </text>
                            )}
                            <ellipse
                              cx={x}
                              cy={noteY}
                              rx={3.5 * noteScale}
                              ry={2.6 * noteScale}
                              fill="currentColor"
                              transform={`rotate(-20 ${x} ${noteY})`}
                            />
                          </g>
                        );
                      })}

                      {seg.voicing.map((v, vi) => (
                        <text
                          key={vi}
                          x={x}
                          y={tabTop + 3 * noteScale + v.stringIdx * tabGap}
                          fontSize={9 * noteScale}
                          fontFamily="monospace"
                          fill={isActive ? "var(--gold)" : "currentColor"}
                          fontWeight={isActive ? "bold" : "normal"}
                          textAnchor="middle"
                        >
                          {v.fret}
                        </text>
                      ))}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-muted-foreground">
        <span>
          Key: <span className="text-gold">{keyRoot} {keyMode}</span> · Tempo: <span className="text-gold">{bpm} BPM</span> ·
          Time: <span className="text-gold">{beatsPerMeasure}/4</span>
          {scaleId && (
            <> · Scale: <span className="text-gold">{scaleRoot ?? keyRoot} {SCALES[scaleId].name}</span></>
          )}
        </span>
        <span>{voicings.length} chord{voicings.length === 1 ? "" : "s"} · click any symbol to seek</span>
      </div>

      <span hidden>{noteToPc(keyRoot)}</span>
    </div>
  );
}
