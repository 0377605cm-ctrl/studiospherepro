// Music theory engine — scales, chords, intervals, key parsing, fretboard mapping.

export const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export type Difficulty = "easy" | "intermediate" | "difficult" | "very-difficult";
export type Instrument = "guitar" | "piano" | "both";
export type Genre = "blues" | "rock" | "jazz" | "rnb" | "trap" | "metal";

/** Convert a note name (with sharps, flats, double-sharps) to pitch class 0-11. */
export function noteToPc(note: string): number {
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const letter = note[0].toUpperCase();
  let pc = base[letter];
  if (pc === undefined) return 0;
  for (let i = 1; i < note.length; i++) {
    const c = note[i];
    if (c === "#" || c === "♯") pc += 1;
    else if (c === "b" || c === "♭") pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}

export function pcToNote(pc: number, useFlats = false): string {
  const arr = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return arr[((pc % 12) + 12) % 12];
}

// Scale formulas as semitone intervals from root.
export const SCALES: Record<string, { name: string; intervals: number[]; difficulty: Difficulty; tags: string[] }> = {
  major: { name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11], difficulty: "easy", tags: ["pop", "rock", "country"] },
  minor: { name: "Natural Minor", intervals: [0, 2, 3, 5, 7, 8, 10], difficulty: "easy", tags: ["rock", "pop"] },
  pentatonic_major: { name: "Major Pentatonic", intervals: [0, 2, 4, 7, 9], difficulty: "easy", tags: ["country", "rock"] },
  pentatonic_minor: { name: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10], difficulty: "easy", tags: ["blues", "rock"] },
  blues: { name: "Blues", intervals: [0, 3, 5, 6, 7, 10], difficulty: "easy", tags: ["blues"] },
  dorian: { name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10], difficulty: "intermediate", tags: ["jazz", "rock"] },
  mixolydian: { name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10], difficulty: "intermediate", tags: ["blues", "rock"] },
  lydian: { name: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11], difficulty: "intermediate", tags: ["jazz", "film"] },
  phrygian: { name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10], difficulty: "intermediate", tags: ["metal", "flamenco"] },
  locrian: { name: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10], difficulty: "difficult", tags: ["jazz", "metal"] },
  harmonic_minor: { name: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11], difficulty: "difficult", tags: ["classical", "metal"] },
  melodic_minor: { name: "Melodic Minor", intervals: [0, 2, 3, 5, 7, 9, 11], difficulty: "difficult", tags: ["jazz"] },
  phrygian_dominant: { name: "Phrygian Dominant", intervals: [0, 1, 4, 5, 7, 8, 10], difficulty: "very-difficult", tags: ["metal", "flamenco"] },
  whole_tone: { name: "Whole Tone", intervals: [0, 2, 4, 6, 8, 10], difficulty: "very-difficult", tags: ["jazz", "impressionist"] },
  diminished: { name: "Diminished (W-H)", intervals: [0, 2, 3, 5, 6, 8, 9, 11], difficulty: "very-difficult", tags: ["jazz"] },
  altered: { name: "Altered", intervals: [0, 1, 3, 4, 6, 8, 10], difficulty: "very-difficult", tags: ["jazz"] },
};

export type ScaleId = keyof typeof SCALES;

export const CHORD_FORMULAS: Record<string, { name: string; intervals: number[]; difficulty: Difficulty; suffix: string }> = {
  maj: { name: "Major", intervals: [0, 4, 7], difficulty: "easy", suffix: "" },
  min: { name: "Minor", intervals: [0, 3, 7], difficulty: "easy", suffix: "m" },
  sus2: { name: "Sus2", intervals: [0, 2, 7], difficulty: "easy", suffix: "sus2" },
  sus4: { name: "Sus4", intervals: [0, 5, 7], difficulty: "easy", suffix: "sus4" },
  dom7: { name: "Dominant 7", intervals: [0, 4, 7, 10], difficulty: "intermediate", suffix: "7" },
  maj7: { name: "Major 7", intervals: [0, 4, 7, 11], difficulty: "intermediate", suffix: "maj7" },
  min7: { name: "Minor 7", intervals: [0, 3, 7, 10], difficulty: "intermediate", suffix: "m7" },
  dim: { name: "Diminished", intervals: [0, 3, 6], difficulty: "intermediate", suffix: "dim" },
  m7b5: { name: "Half-Diminished", intervals: [0, 3, 6, 10], difficulty: "difficult", suffix: "m7b5" },
  dim7: { name: "Diminished 7", intervals: [0, 3, 6, 9], difficulty: "difficult", suffix: "dim7" },
  aug: { name: "Augmented", intervals: [0, 4, 8], difficulty: "difficult", suffix: "aug" },
  maj9: { name: "Major 9", intervals: [0, 4, 7, 11, 14], difficulty: "very-difficult", suffix: "maj9" },
  min9: { name: "Minor 9", intervals: [0, 3, 7, 10, 14], difficulty: "very-difficult", suffix: "m9" },
  dom13: { name: "Dominant 13", intervals: [0, 4, 7, 10, 14, 21], difficulty: "very-difficult", suffix: "13" },
};

export type ChordType = keyof typeof CHORD_FORMULAS;

export interface ScaleInstance {
  rootPc: number;
  rootName: string;
  scaleId: ScaleId;
  notes: number[]; // pitch classes in order
  noteNames: string[];
}

export function buildScale(rootName: string, scaleId: ScaleId, useFlats = false): ScaleInstance {
  const rootPc = noteToPc(rootName);
  const intervals = SCALES[scaleId].intervals;
  const notes = intervals.map((i) => (rootPc + i) % 12);
  return {
    rootPc,
    rootName,
    scaleId,
    notes,
    noteNames: notes.map((pc) => pcToNote(pc, useFlats)),
  };
}

export function buildChord(rootName: string, type: ChordType): { rootPc: number; pcs: number[]; symbol: string; intervals: number[] } {
  const rootPc = noteToPc(rootName);
  const formula = CHORD_FORMULAS[type];
  const pcs = formula.intervals.map((i) => (rootPc + i) % 12);
  return { rootPc, pcs, intervals: formula.intervals, symbol: rootName + formula.suffix };
}

/** Diatonic chords for a major or natural-minor scale. */
export function diatonicChords(scale: ScaleInstance, seventh = false): { degree: string; symbol: string; type: ChordType; rootPc: number }[] {
  const degreesMajor = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
  const degreesMinor = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
  const isMinor = scale.scaleId === "minor" || scale.scaleId === "harmonic_minor" || scale.scaleId === "melodic_minor";
  const degrees = isMinor ? degreesMinor : degreesMajor;
  const triadQualities = isMinor
    ? ["min", "dim", "maj", "min", "min", "maj", "maj"]
    : ["maj", "min", "min", "maj", "maj", "min", "dim"];
  const seventhQualities = isMinor
    ? ["min7", "m7b5", "maj7", "min7", "min7", "maj7", "dom7"]
    : ["maj7", "min7", "min7", "maj7", "dom7", "min7", "m7b5"];
  const qualities = seventh ? seventhQualities : triadQualities;
  return scale.notes.slice(0, 7).map((pc, i) => {
    const type = qualities[i] as ChordType;
    const rootName = pcToNote(pc);
    const symbol = rootName + CHORD_FORMULAS[type].suffix;
    return { degree: degrees[i] || "?", symbol, type, rootPc: pc };
  });
}

// Filter scale list by difficulty (cumulative — easier difficulties included)
const DIFF_RANK: Record<Difficulty, number> = { easy: 0, intermediate: 1, difficult: 2, "very-difficult": 3 };

export function scalesByDifficulty(d: Difficulty): { id: ScaleId; name: string }[] {
  const max = DIFF_RANK[d];
  return (Object.keys(SCALES) as ScaleId[])
    .filter((id) => DIFF_RANK[SCALES[id].difficulty] <= max)
    .map((id) => ({ id, name: SCALES[id].name }));
}

export function chordsByDifficulty(d: Difficulty): ChordType[] {
  const max = DIFF_RANK[d];
  return (Object.keys(CHORD_FORMULAS) as ChordType[]).filter((id) => DIFF_RANK[CHORD_FORMULAS[id].difficulty] <= max);
}

// Common chord progressions per genre / difficulty (roman numerals as scale degree indices 0-6)
export const PROGRESSIONS: Record<Genre, { name: string; degrees: number[]; minor?: boolean }[]> = {
  blues: [
    { name: "12-Bar Blues", degrees: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 0] },
    { name: "Quick Change", degrees: [0, 3, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4] },
  ],
  rock: [
    { name: "I-V-vi-IV", degrees: [0, 4, 5, 3] },
    { name: "I-IV-V", degrees: [0, 3, 4, 0] },
    { name: "vi-IV-I-V", degrees: [5, 3, 0, 4] },
  ],
  jazz: [
    { name: "ii-V-I", degrees: [1, 4, 0, 0] },
    { name: "I-vi-ii-V", degrees: [0, 5, 1, 4] },
  ],
  rnb: [
    { name: "ii-V-I-vi", degrees: [1, 4, 0, 5] },
    { name: "I-iii-IV-V", degrees: [0, 2, 3, 4] },
  ],
  trap: [
    { name: "i-VI-III-VII", degrees: [0, 5, 2, 6], minor: true },
    { name: "i-iv-VI-V", degrees: [0, 3, 5, 4], minor: true },
  ],
  metal: [
    { name: "i-bVI-bVII", degrees: [0, 5, 6], minor: true },
    { name: "i-iv-v", degrees: [0, 3, 4], minor: true },
  ],
};

// Standard guitar tuning (low to high): E A D G B E
export const STANDARD_TUNING_PCS = [4, 9, 2, 7, 11, 4]; // pitch classes
export const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64];

/** Map a scale onto fretboard positions (0..maxFret) for each string. */
export function fretboardForScale(scale: ScaleInstance, maxFret = 15, tuning = STANDARD_TUNING_PCS) {
  const positions: { string: number; fret: number; pc: number; isRoot: boolean }[] = [];
  for (let s = 0; s < tuning.length; s++) {
    for (let f = 0; f <= maxFret; f++) {
      const pc = (tuning[s] + f) % 12;
      if (scale.notes.includes(pc)) {
        positions.push({ string: s, fret: f, pc, isRoot: pc === scale.rootPc });
      }
    }
  }
  return positions;
}

/** Restrict fretboard positions to a CAGED-style box around the given fret window. */
export function fretboardBox(scale: ScaleInstance, startFret: number, span = 5, tuning = STANDARD_TUNING_PCS) {
  return fretboardForScale(scale, startFret + span, tuning).filter((p) => p.fret >= startFret && p.fret <= startFret + span);
}

/** Find a "home" box position based on root location on the low-E string. */
export function findRootBox(scale: ScaleInstance): number {
  for (let f = 0; f <= 12; f++) {
    if ((STANDARD_TUNING_PCS[0] + f) % 12 === scale.rootPc) return Math.max(0, f - 1);
  }
  return 0;
}

// Pitch -> frequency (A4 = 440)
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Common keys for selectors (major + minor). */
export const ALL_KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

export const CIRCLE_OF_FIFTHS_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "C#", "Ab", "Eb", "Bb", "F"];
export const CIRCLE_OF_FIFTHS_MINOR = ["A", "E", "B", "F#", "C#", "G#", "D#", "A#", "F", "C", "G", "D"];

export function relativeMinor(major: string): string {
  return pcToNote((noteToPc(major) + 9) % 12);
}
export function relativeMajor(minor: string): string {
  return pcToNote((noteToPc(minor) + 3) % 12);
}
export function dominant(root: string): string {
  return pcToNote((noteToPc(root) + 7) % 12);
}
export function subdominant(root: string): string {
  return pcToNote((noteToPc(root) + 5) % 12);
}