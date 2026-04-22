import {
  buildScale,
  STANDARD_TUNING_PCS,
  STANDARD_TUNING_MIDI,
  fretboardForScale,
  PROGRESSIONS,
  type Difficulty,
  type Genre,
  type ScaleId,
} from "./theory";

export interface RiffNote {
  midi: number; // pitch
  string: number; // 0=lowE
  fret: number;
  startBeat: number; // in beats (1 beat = quarter)
  duration: number; // in beats
}

export interface Riff {
  notes: RiffNote[];
  bpm: number;
  key: string;
  scaleId: ScaleId;
  genre: Genre;
  difficulty: Difficulty;
  bars: number;
  beatsPerBar: number;
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Find the lowest fret position for a given pitch class within the scale. */
function findPosition(pc: number, scaleNotes: number[], preferredString = 2): { string: number; fret: number; midi: number } | null {
  if (!scaleNotes.includes(pc)) return null;
  // Search nearby strings/frets
  for (let span = 0; span <= 6; span++) {
    for (const dir of [0, 1, -1]) {
      const s = preferredString + dir * span;
      if (s < 0 || s >= STANDARD_TUNING_PCS.length) continue;
      for (let f = 0; f <= 12; f++) {
        const tuningPc = STANDARD_TUNING_PCS[s];
        if ((tuningPc + f) % 12 === pc) {
          return { string: s, fret: f, midi: STANDARD_TUNING_MIDI[s] + f };
        }
      }
    }
  }
  return null;
}

const GENRE_DEFAULTS: Record<Genre, { bpm: number; preferredString: number; rhythmPattern: number[] }> = {
  blues: { bpm: 90, preferredString: 1, rhythmPattern: [1, 0.5, 0.5, 1, 1] },
  rock: { bpm: 120, preferredString: 2, rhythmPattern: [0.5, 0.5, 0.5, 0.5, 1, 1] },
  jazz: { bpm: 140, preferredString: 3, rhythmPattern: [0.33, 0.66, 0.33, 0.66, 1] },
  rnb: { bpm: 85, preferredString: 2, rhythmPattern: [0.5, 0.5, 1, 0.5, 0.5, 1] },
  trap: { bpm: 75, preferredString: 0, rhythmPattern: [0.5, 0.25, 0.25, 1, 0.5, 0.5] },
  metal: { bpm: 160, preferredString: 0, rhythmPattern: [0.25, 0.25, 0.25, 0.25, 1, 0.5, 0.5] },
};

/** Generate a riff deterministically from key/scale/genre/difficulty + seed. */
export function generateRiff(opts: {
  key: string;
  scaleId: ScaleId;
  genre: Genre;
  difficulty: Difficulty;
  bars?: number;
  seed?: number;
}): Riff {
  const { key, scaleId, genre, difficulty, bars = 4, seed = Date.now() } = opts;
  const rand = mulberry32(seed);
  const scale = buildScale(key, scaleId);
  const beatsPerBar = 4;
  const { bpm, preferredString, rhythmPattern } = GENRE_DEFAULTS[genre];

  // Difficulty controls range, density, ornamentation
  const noteDensity = { easy: 0.7, intermediate: 1, difficult: 1.4, "very-difficult": 1.8 }[difficulty];
  const rangeOctaves = { easy: 1, intermediate: 1, difficult: 2, "very-difficult": 2 }[difficulty];

  // Build available pitches across desired range
  const available: number[] = [];
  const baseMidi = 40 + STANDARD_TUNING_PCS[preferredString]; // approx low note
  for (let oct = 0; oct < rangeOctaves; oct++) {
    for (const interval of scale.notes.map((pc) => (pc - scale.rootPc + 12) % 12).sort((a, b) => a - b)) {
      available.push(baseMidi + 12 * oct + interval);
    }
  }

  const notes: RiffNote[] = [];
  let beat = 0;
  let prevMidi = available[0];
  const totalBeats = bars * beatsPerBar;

  while (beat < totalBeats) {
    // pick rhythm value
    let dur = rhythmPattern[Math.floor(rand() * rhythmPattern.length)] / noteDensity;
    if (beat + dur > totalBeats) dur = totalBeats - beat;

    // chance of rest at higher difficulty
    if (difficulty !== "easy" && rand() < 0.1) {
      beat += dur;
      continue;
    }

    // pick next note - prefer step-wise motion
    const candidates = available
      .map((m) => ({ m, dist: Math.abs(m - prevMidi) }))
      .sort((a, b) => a.dist - b.dist);
    // weighted random toward closer notes
    const pickIdx = Math.floor(Math.pow(rand(), 2) * Math.min(candidates.length, 5));
    const midi = candidates[pickIdx].m;
    prevMidi = midi;

    const pc = midi % 12;
    const pos = findPosition(pc, scale.notes, preferredString);
    if (pos) {
      // adjust midi to chosen position
      notes.push({
        midi: STANDARD_TUNING_MIDI[pos.string] + pos.fret,
        string: pos.string,
        fret: pos.fret,
        startBeat: beat,
        duration: dur,
      });
    }
    beat += dur;
  }

  // Anchor: ensure first note is the root
  if (notes.length > 0) {
    const rootPos = findPosition(scale.rootPc, scale.notes, preferredString);
    if (rootPos) {
      notes[0] = {
        ...notes[0],
        midi: STANDARD_TUNING_MIDI[rootPos.string] + rootPos.fret,
        string: rootPos.string,
        fret: rootPos.fret,
      };
    }
  }

  return { notes, bpm, key, scaleId, genre, difficulty, bars, beatsPerBar };
}

/** Render a riff to ASCII guitar TAB. */
export function riffToTab(riff: Riff): string {
  const stringChars = ["e", "B", "G", "D", "A", "E"]; // visual top to bottom
  const totalSlots = Math.ceil(riff.bars * riff.beatsPerBar * 4); // sixteenth note resolution
  // Build per-string arrays
  const lines: string[][] = stringChars.map(() => Array(totalSlots).fill("-"));
  for (const n of riff.notes) {
    const slot = Math.round(n.startBeat * 4);
    const visualString = 5 - n.string; // string 0 (lowE) -> bottom (index 5)
    if (slot >= 0 && slot < totalSlots && lines[visualString]) {
      const fret = n.fret.toString();
      // place each char of fret number, padding adjacent slot if 2 digits
      for (let i = 0; i < fret.length; i++) {
        if (slot + i < totalSlots) lines[visualString][slot + i] = fret[i];
      }
    }
  }
  // join
  return lines.map((line, i) => `${stringChars[i]}|${line.join("")}|`).join("\n");
}

/** Build a chord progression (one chord per bar) from progressions library + scale. */
export function generateProgression(opts: { key: string; scaleId: ScaleId; genre: Genre; seed?: number }) {
  const { key, scaleId, genre, seed = Date.now() } = opts;
  const rand = mulberry32(seed);
  const scale = buildScale(key, scaleId);
  const progs = PROGRESSIONS[genre];
  const prog = progs[Math.floor(rand() * progs.length)];
  return {
    name: prog.name,
    bars: prog.degrees.map((deg) => {
      const pc = scale.notes[deg % scale.notes.length];
      return { degree: deg, pc };
    }),
  };
}