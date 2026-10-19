import { STANDARD_TUNING_MIDI, type ChordType } from "./theory";

export interface GuitarShape {
  frets: (number | null)[];
  fingers: number[];
  startFret: number;
  barre?: { fret: number; from: number; to: number };
  midis: number[];
}

type Template = { frets: (number | null)[]; fingers: number[] };

// Low E to high e. Moveable E-family grips; finger 1 holds the barre.
const MOVEABLE: Record<ChordType, Template> = {
  maj: { frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  min: { frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  dom7: { frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  maj7: { frets: [0, null, 1, 1, 0, null], fingers: [1, 0, 2, 3, 1, 0] },
  min7: { frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  sus2: { frets: [0, 2, 4, 4, 0, 0], fingers: [1, 2, 4, 4, 1, 1] },
  sus4: { frets: [0, 2, 2, 2, 0, 0], fingers: [1, 3, 3, 3, 1, 1] },
  dim: { frets: [null, null, 2, 3, null, 3], fingers: [0, 0, 1, 2, 0, 3] },
  m7b5: { frets: [0, 1, 0, 0, null, null], fingers: [1, 2, 1, 1, 0, 0] },
  dim7: { frets: [null, null, 2, 3, 2, 3], fingers: [0, 0, 1, 2, 1, 3] },
  aug: { frets: [0, null, 2, 1, 1, null], fingers: [1, 0, 4, 2, 3, 0] },
  maj9: { frets: [0, 2, 1, 1, 0, 2], fingers: [1, 4, 2, 3, 1, 4] },
  min9: { frets: [0, 2, 0, 0, 0, 2], fingers: [1, 3, 1, 1, 1, 4] },
  dom13: { frets: [0, 2, 0, 1, 2, 2], fingers: [1, 3, 1, 2, 4, 4] },
};

const OPEN: Record<string, Template> = {
  "0:maj": { frets: [null, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  "2:maj": { frets: [null, null, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  "4:maj": { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  "7:maj": { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  "9:maj": { frets: [null, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  "2:min": { frets: [null, null, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  "4:min": { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  "9:min": { frets: [null, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  "9:min7": { frets: [null, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0] },
  "4:min7": { frets: [0, 2, 0, 0, 0, 0], fingers: [0, 2, 0, 0, 0, 0] },
  "2:min7": { frets: [null, null, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
  "7:dom7": { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  "9:dom7": { frets: [null, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0] },
  "2:dom7": { frets: [null, null, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
};

export function guitarShape(rootPc: number, type: ChordType): GuitarShape {
  const root = ((rootPc % 12) + 12) % 12;
  const open = OPEN[`${root}:${type}`];
  const shift = (root - 4 + 12) % 12;
  const template = open ?? MOVEABLE[type];
  const frets = template.frets.map((fret) => fret === null ? null : fret + (open ? 0 : shift));
  const fingers = template.fingers.map((finger, i) => frets[i] === 0 ? 0 : finger);
  const stopped = frets.filter((fret): fret is number => fret !== null && fret > 0);
  const startFret = stopped.length === 0 || Math.max(...stopped) <= 5 ? 1 : Math.min(...stopped);
  const barreStrings = fingers.flatMap((finger, i) => finger === 1 && frets[i] !== null ? [i] : []);
  const first = barreStrings[0];
  const last = barreStrings[barreStrings.length - 1];
  const barreFret = first === undefined ? null : frets[first];
  const barre = first !== undefined && last !== undefined && first !== last && barreFret !== null
    && barreStrings.every((i) => frets[i] === barreFret)
    ? { fret: barreFret, from: first, to: last } : undefined;
  return {
    frets, fingers, startFret, barre,
    midis: frets.flatMap((fret, string) => fret === null ? [] : [STANDARD_TUNING_MIDI[string] + fret]),
  };
}