import { useEffect, useMemo, useRef, useState } from "react";
import { CHORD_FORMULAS, NOTE_NAMES_SHARP, noteToPc } from "@/lib/music/theory";

/**
 * Renders a guitar TAB + treble-clef notation view from analyzer chord segments.
 * - SVG-based (no extra deps)
 * - Slow-down playback (0.5x – 1x) using HTMLAudioElement.playbackRate
 * - Fullscreen toggle
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
  audioEl: HTMLAudioElement | null;
}

/** Standard tuning, low-E (string 6) → high-E (string 1), in MIDI. */
const STRING_MIDI = [64, 59, 55, 50, 45, 40]; // high-E first for display row 0
const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

/** Map a target MIDI to a [stringIndex, fret] preferring low frets and standard chord shapes. */
function midiToFret(midi: number): { stringIdx: number; fret: number } | null {
  let best: { stringIdx: number; fret: number; score: number } | null = null;
  for (let s = 0; s < STRING_MIDI.length; s++) {
    const fret = midi - STRING_MIDI[s];
    if (fret < 0 || fret > 15) continue;
    // prefer lower frets, prefer middle strings slightly
    const score = fret + Math.abs(s - 2.5) * 0.3;
    if (!best || score < best.score) best = { stringIdx: s, fret, score };
  }
  return best ? { stringIdx: best.stringIdx, fret: best.fret } : null;
}

/** Voice a chord across the 6 strings within a comfortable fret window. */
function voiceChord(rootPc: number, type: string): { stringIdx: number; fret: number; pc: number }[] {
  const formula = CHORD_FORMULAS[type] ?? CHORD_FORMULAS.maj;
  const pcs = formula.intervals.map((iv) => (rootPc + iv) % 12);

  // Try to fit each chord tone on a unique string, lowest-fret-first.
  // Search a 5-fret window starting at fret 0..7.
  let bestWindow: { stringIdx: number; fret: number; pc: number }[] | null = null;
  let bestSpan = Infinity;
  for (let startFret = 0; startFret <= 7; startFret++) {
    const used = new Set<number>();
    const placed: { stringIdx: number; fret: number; pc: number }[] = [];
    for (const pc of pcs) {
      // try each string from low (5) to high (0) - bass note first
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

  // fallback: per-tone single placements
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

/** Map a MIDI note to a vertical Y position on a treble-clef stave (line spacing = 6px).
 *  Stave from top: F5 line, then E5, D5, C5, B4, A4, G4, F4, E4 line.
 *  We position diatonically by letter; accidentals drawn next to head.
 */
const LETTER_STEPS: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
function midiToStaveInfo(midi: number, useFlats = false): { y: number; accidental: "" | "#" | "b"; letter: string; octave: number } {
  const arr = useFlats ? ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] : NOTE_NAMES_SHARP;
  const pc = ((midi % 12) + 12) % 12;
  const name = arr[pc];
  const letter = name[0];
  const accidental: "" | "#" | "b" = name.length > 1 ? (name[1] === "#" ? "#" : "b") : "";
  const octave = Math.floor(midi / 12) - 1;
  // diatonic step count from C0
  const step = LETTER_STEPS[letter] + octave * 7;
  // E4 (MIDI 64) sits on bottom line -> step(E,4)=2+28=30 → y=baseline
  const baseStep = LETTER_STEPS["E"] + 4 * 7; // 30
  const y = (baseStep - step) * 3; // 3px per half-step (6px per line spacing)
  return { y, accidental, letter, octave };
}

export function GuitarTab({ segments, bpm, keyRoot, keyMode, audioEl }: Props) {
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Apply playback speed to the audio element
  useEffect(() => {
    if (audioEl) {
      audioEl.playbackRate = speed;
      audioEl.preservesPitch = true;
    }
  }, [audioEl, speed]);

  // Track the currently playing chord
  useEffect(() => {
    if (!audioEl) return;
    let raf = 0;
    const tick = () => {
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
  }, [audioEl, segments]);

  // Build TAB voicings once
  const voicings = useMemo(
    () => segments.map((s) => ({ ...s, voicing: voiceChord(s.chord.rootPc, s.chord.type) })),
    [segments],
  );

  // Layout constants
  const measuresPerLine = 4;
  const beatsPerMeasure = 4;
  const chordsPerLine = measuresPerLine * beatsPerMeasure; // 1 chord per beat (approx)
  const chordWidth = 60;
  const leftPad = 70;
  const rightPad = 20;
  const lineWidth = leftPad + chordsPerLine * chordWidth + rightPad;
  const staveHeight = 30; // 5 lines, 6px apart
  const tabHeight = 60; // 6 strings, 12px apart
  const lineGap = 50;
  const totalLines = Math.ceil(voicings.length / chordsPerLine) || 1;
  const svgHeight = totalLines * (staveHeight + tabHeight + lineGap) + 40;

  // Fullscreen
  const toggleFs = async () => {
    if (!containerRef.current) return;
    if (!fullscreen) {
      try {
        await containerRef.current.requestFullscreen?.();
      } catch {/* ignore */}
      setFullscreen(true);
    } else {
      try {
        await document.exitFullscreen?.();
      } catch {/* ignore */}
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const useFlats = keyMode === "minor" || ["F", "Bb", "Eb", "Ab", "Db"].includes(keyRoot);

  return (
    <div
      ref={containerRef}
      className={fullscreen ? "fixed inset-0 z-50 overflow-auto bg-background p-6" : ""}
    >
      {/* Controls */}
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
          <span className="font-mono text-xs text-gold w-12">{Math.round(speed * 100)}%</span>
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
        <button
          onClick={toggleFs}
          className="ml-auto rounded border border-border bg-secondary/40 px-3 py-1 font-mono text-[10px] uppercase tracking-widest hover:border-gold/60"
        >
          {fullscreen ? "✕ Exit fullscreen" : "⛶ Fullscreen"}
        </button>
      </div>

      {/* SVG TAB + Notation */}
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/40 p-4">
        <svg
          viewBox={`0 0 ${lineWidth} ${svgHeight}`}
          width="100%"
          style={{ minWidth: fullscreen ? "100%" : `${Math.min(lineWidth, 900)}px` }}
          className="text-foreground"
        >
          {Array.from({ length: totalLines }).map((_, lineIdx) => {
            const yOff = lineIdx * (staveHeight + tabHeight + lineGap) + 10;
            const lineSegments = voicings.slice(lineIdx * chordsPerLine, (lineIdx + 1) * chordsPerLine);

            return (
              <g key={lineIdx} transform={`translate(0, ${yOff})`}>
                {/* Treble clef (simple stylized G clef glyph using text) */}
                <text x={6} y={staveHeight - 2} fontSize={36} fill="currentColor" fontFamily="serif" style={{ fontStyle: "italic" }}>
                  𝄞
                </text>
                {/* Time signature */}
                <text x={40} y={staveHeight / 2 + 2} fontSize={14} fontWeight="bold" fill="currentColor" textAnchor="middle">
                  {beatsPerMeasure}
                </text>
                <text x={40} y={staveHeight - 2} fontSize={14} fontWeight="bold" fill="currentColor" textAnchor="middle">
                  4
                </text>

                {/* 5-line stave */}
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={i}
                    x1={leftPad - 10}
                    x2={lineWidth - rightPad}
                    y1={i * 6}
                    y2={i * 6}
                    stroke="currentColor"
                    strokeOpacity={0.6}
                    strokeWidth={0.6}
                  />
                ))}

                {/* TAB stave (6 lines) */}
                <text x={6} y={staveHeight + 28} fontSize={11} fontFamily="monospace" fill="currentColor" opacity={0.7}>
                  TAB
                </text>
                {STRING_LABELS.map((label, i) => (
                  <g key={i}>
                    <line
                      x1={leftPad - 10}
                      x2={lineWidth - rightPad}
                      y1={staveHeight + 10 + i * 10}
                      y2={staveHeight + 10 + i * 10}
                      stroke="currentColor"
                      strokeOpacity={0.4}
                      strokeWidth={0.5}
                    />
                    <text
                      x={leftPad - 16}
                      y={staveHeight + 13 + i * 10}
                      fontSize={8}
                      fontFamily="monospace"
                      fill="currentColor"
                      opacity={0.6}
                      textAnchor="end"
                    >
                      {label}
                    </text>
                  </g>
                ))}

                {/* Bar lines + chord beats */}
                {lineSegments.map((seg, beatIdx) => {
                  const x = leftPad + beatIdx * chordWidth + chordWidth / 2;
                  const globalIdx = lineIdx * chordsPerLine + beatIdx;
                  const isActive = globalIdx === activeIdx;
                  const isMeasureStart = beatIdx % beatsPerMeasure === 0;

                  return (
                    <g key={beatIdx}>
                      {/* bar line at start of each measure */}
                      {isMeasureStart && beatIdx > 0 && (
                        <line
                          x1={leftPad + beatIdx * chordWidth}
                          x2={leftPad + beatIdx * chordWidth}
                          y1={0}
                          y2={staveHeight - 6}
                          stroke="currentColor"
                          strokeOpacity={0.5}
                        />
                      )}
                      {isMeasureStart && beatIdx > 0 && (
                        <line
                          x1={leftPad + beatIdx * chordWidth}
                          x2={leftPad + beatIdx * chordWidth}
                          y1={staveHeight + 10}
                          y2={staveHeight + 10 + 5 * 10}
                          stroke="currentColor"
                          strokeOpacity={0.5}
                        />
                      )}

                      {/* chord highlight */}
                      {isActive && (
                        <rect
                          x={x - chordWidth / 2 + 4}
                          y={-6}
                          width={chordWidth - 8}
                          height={staveHeight + tabHeight + 4}
                          fill="oklch(0.78 0.14 75)"
                          opacity={0.12}
                          rx={3}
                        />
                      )}

                      {/* chord symbol above stave */}
                      <text
                        x={x}
                        y={-8}
                        fontSize={11}
                        fontWeight="bold"
                        fill={isActive ? "oklch(0.78 0.14 75)" : "currentColor"}
                        textAnchor="middle"
                        fontFamily="monospace"
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          if (audioEl) {
                            audioEl.currentTime = seg.startSec;
                            audioEl.play();
                          }
                        }}
                      >
                        {seg.chord.symbol}
                      </text>

                      {/* notation note heads (one per chord tone) */}
                      {seg.voicing.map((v, vi) => {
                        const midi = STRING_MIDI[v.stringIdx] + v.fret;
                        const info = midiToStaveInfo(midi, useFlats);
                        const noteY = staveHeight - 6 + info.y;
                        if (noteY < -20 || noteY > staveHeight + 5) return null;
                        return (
                          <g key={vi}>
                            {info.accidental && (
                              <text x={x - 10} y={noteY + 2} fontSize={9} fill="currentColor" textAnchor="end">
                                {info.accidental === "#" ? "♯" : "♭"}
                              </text>
                            )}
                            <ellipse cx={x} cy={noteY} rx={3.5} ry={2.6} fill="currentColor" transform={`rotate(-20 ${x} ${noteY})`} />
                          </g>
                        );
                      })}

                      {/* TAB fret numbers */}
                      {seg.voicing.map((v, vi) => (
                        <text
                          key={vi}
                          x={x}
                          y={staveHeight + 13 + v.stringIdx * 10}
                          fontSize={9}
                          fontFamily="monospace"
                          fill={isActive ? "oklch(0.78 0.14 75)" : "currentColor"}
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
        </span>
        <span>{voicings.length} chord{voicings.length === 1 ? "" : "s"} · click any symbol to seek</span>
      </div>

      {/* unused note silencer for stricter TS */}
      <span hidden>{noteToPc(keyRoot)}</span>
    </div>
  );
}
