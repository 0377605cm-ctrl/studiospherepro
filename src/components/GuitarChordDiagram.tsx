import { useMemo } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { guitarShape } from "@/lib/music/guitar-shapes";
import { type ChordType } from "@/lib/music/theory";
import { playChord, unlockAudio } from "@/lib/audio/synth";

export function GuitarChordDiagram({ rootPc, type, symbol }: { rootPc: number; type: ChordType; symbol: string }) {
  const shape = useMemo(() => guitarShape(rootPc, type), [rootPc, type]);
  const x = (string: number) => 28 + string * 22;
  const y = (fret: number) => 42 + (fret - shape.startFret + 0.5) * 25;
  const description = shape.frets.map((fret, i) => `${["low E", "A", "D", "G", "B", "high E"][i]}: ${fret === null ? "muted" : fret === 0 ? "open" : `fret ${fret}, finger ${shape.fingers[i]}`}`).join("; ");
  return (
    <figure className="min-w-0" aria-label={`${symbol} guitar fingering`}>
      <figcaption className="flex items-center justify-between gap-1 font-mono text-sm font-semibold">
        <span>{symbol}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gold" title={`Play ${symbol} on guitar`} aria-label={`Play ${symbol} on guitar`}
          onClick={() => { void unlockAudio(); playChord(shape.midis, { duration: 1, type: "sawtooth" }); }}>
          <Play className="h-3 w-3" />
        </Button>
      </figcaption>
      <svg viewBox="0 0 162 190" role="img" aria-label={`${symbol}: ${description}`} className="mx-auto h-auto w-full max-w-[170px] font-mono">
        <title>{symbol} — {description}</title>
        {shape.frets.map((fret, i) => <text key={i} x={x(i)} y={30} textAnchor="middle" className={fret === null ? "fill-muted-foreground" : "fill-gold"} fontSize="14">{fret === null ? "×" : fret === 0 ? "○" : ""}</text>)}
        {Array.from({ length: 6 }, (_, i) => <line key={`s${i}`} x1={x(i)} x2={x(i)} y1={42} y2={167} className="stroke-muted-foreground" strokeWidth={1} />)}
        {Array.from({ length: 6 }, (_, i) => <line key={`f${i}`} x1={28} x2={138} y1={42 + i * 25} y2={42 + i * 25} className="stroke-muted-foreground" strokeWidth={i === 0 && shape.startFret === 1 ? 4 : 1} />)}
        <text x={4} y={59} fontSize="10" className="fill-muted-foreground">{shape.startFret}</text>
        {shape.barre && <line x1={x(shape.barre.from)} x2={x(shape.barre.to)} y1={y(shape.barre.fret)} y2={y(shape.barre.fret)} strokeWidth={13} strokeLinecap="round" className="stroke-gold" />}
        {shape.frets.map((fret, i) => fret !== null && fret > 0 && <g key={i}>
          <circle cx={x(i)} cy={y(fret)} r={8} className="fill-gold" />
          <text x={x(i)} y={y(fret) + 3.5} textAnchor="middle" fontSize="10" fontWeight="bold" className="fill-gold-foreground">{shape.fingers[i]}</text>
        </g>)}
        {["E", "A", "D", "G", "B", "e"].map((label, i) => <text key={i} x={x(i)} y={185} textAnchor="middle" fontSize="10" className="fill-muted-foreground">{label}</text>)}
      </svg>
    </figure>
  );
}