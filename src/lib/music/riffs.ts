import {
  buildScale,
  STANDARD_TUNING_PCS,
  STANDARD_TUNING_MIDI,
  PROGRESSIONS,
  CHORD_FORMULAS,
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
  /** Additional simultaneous notes on other strings (double-stops, power chords, strums). */
  extras?: { midi: number; string: number; fret: number }[];
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
  chordBars?: ChordBar[]; // optional chord backing per bar
  progressionName?: string;
}

export interface ChordBar {
  rootPc: number;
  chordPcs: number[]; // pitch classes
  midis: number[]; // playable midi voicing
  symbol: string;
  degree: number;
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
  blues:  { bpm: 90,  preferredString: 1, rhythmPattern: [0.66, 0.34, 1, 0.5, 0.5, 1, 0.66, 0.34] },
  rock:   { bpm: 120, preferredString: 2, rhythmPattern: [0.5, 0.5, 0.5, 0.5, 1, 1, 0.5, 0.5] },
  jazz:   { bpm: 140, preferredString: 3, rhythmPattern: [0.66, 0.34, 0.66, 0.34, 0.5, 0.5, 1] },
  rnb:    { bpm: 85,  preferredString: 2, rhythmPattern: [0.5, 0.5, 0.25, 0.25, 0.5, 1, 0.5, 0.5] },
  trap:   { bpm: 75,  preferredString: 0, rhythmPattern: [0.5, 0.25, 0.25, 1, 0.5, 0.5, 1] },
  metal:  { bpm: 160, preferredString: 0, rhythmPattern: [0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 1, 0.5, 0.5] },
};

/** Genres where chord backing materially helps the riff. */
const CHORD_BACKED_GENRES: Genre[] = ["blues", "jazz", "rnb"];

/** Probability (0-1) of layering extra strings on a strong-beat note. */
const VOICING_DENSITY: Record<Genre, number> = {
  blues: 0.55,
  rock: 0.4,
  jazz: 0.5,
  rnb: 0.45,
  trap: 0.15,
  metal: 0.7, // power chords love
};

/** Try to find a fret on a specific string for a given pitch class, near a target fret. */
function fretOnString(pc: number, stringIdx: number, nearFret: number): number | null {
  if (stringIdx < 0 || stringIdx >= STANDARD_TUNING_PCS.length) return null;
  const open = STANDARD_TUNING_PCS[stringIdx];
  let best: number | null = null;
  for (let f = 0; f <= 14; f++) {
    if ((open + f) % 12 === pc) {
      if (best === null || Math.abs(f - nearFret) < Math.abs(best - nearFret)) best = f;
    }
  }
  return best;
}

/** Build extra simultaneous notes for a multi-string voicing on the current chord. */
function buildExtras(
  rootNote: { string: number; fret: number; midi: number },
  chord: ChordBar,
  genre: Genre,
): { midi: number; string: number; fret: number }[] {
  const extras: { midi: number; string: number; fret: number }[] = [];
  const usedStrings = new Set<number>([rootNote.string]);
  const rootPc = rootNote.midi % 12;
  // Determine target chord tones (excluding the note already played).
  const tones = chord.chordPcs.filter((pc) => pc !== rootPc);

  // Metal / Rock → power chord (root + 5th, optionally octave) on adjacent lower-pitched strings.
  if (genre === "metal" || genre === "rock") {
    const fifthPc = (rootPc + 7) % 12;
    // Add a 5th on the next-thicker string (string idx - 1 in our 0=lowE convention is HIGHER-pitched,
    // so 'next thicker' is +1; but our 0=lowE so a string with HIGHER index actually... let's check):
    // STANDARD_TUNING_PCS[0]=lowE, [5]=highE. Adjacent higher-pitched string is +1.
    const higher = rootNote.string + 1;
    if (higher < 6 && !usedStrings.has(higher)) {
      const f = fretOnString(fifthPc, higher, rootNote.fret);
      if (f !== null && Math.abs(f - rootNote.fret) <= 3) {
        extras.push({ string: higher, fret: f, midi: STANDARD_TUNING_MIDI[higher] + f });
        usedStrings.add(higher);
      }
    }
    // Optional octave on +2
    const higher2 = rootNote.string + 2;
    if (genre === "metal" && higher2 < 6 && !usedStrings.has(higher2)) {
      const f = fretOnString(rootPc, higher2, rootNote.fret);
      if (f !== null && Math.abs(f - rootNote.fret) <= 3) {
        extras.push({ string: higher2, fret: f, midi: STANDARD_TUNING_MIDI[higher2] + f });
      }
    }
    return extras;
  }

  // Blues / R&B → double-stop: add a 3rd or 6th above on an adjacent higher string.
  if (genre === "blues" || genre === "rnb") {
    const candidates = [(rootPc + 3) % 12, (rootPc + 4) % 12, (rootPc + 9) % 12]; // m3, M3, M6
    for (const cand of candidates) {
      if (!chord.chordPcs.includes(cand) && cand !== (rootPc + 9) % 12) continue;
      const higher = rootNote.string + 1;
      if (higher >= 6 || usedStrings.has(higher)) break;
      const f = fretOnString(cand, higher, rootNote.fret);
      if (f !== null && Math.abs(f - rootNote.fret) <= 3) {
        extras.push({ string: higher, fret: f, midi: STANDARD_TUNING_MIDI[higher] + f });
        break;
      }
    }
    return extras;
  }

  // Jazz → small 3-note chord shell (3rd + 7th) on higher strings.
  if (genre === "jazz") {
    for (const pc of tones) {
      const higher = rootNote.string + extras.length + 1;
      if (higher >= 6) break;
      const f = fretOnString(pc, higher, rootNote.fret);
      if (f !== null && Math.abs(f - rootNote.fret) <= 4) {
        extras.push({ string: higher, fret: f, midi: STANDARD_TUNING_MIDI[higher] + f });
        if (extras.length >= 2) break;
      }
    }
    return extras;
  }

  return extras;
}

function buildChordVoicing(rootPc: number, chordIntervals: number[], baseMidi = 48): number[] {
  // Root + 3rd + 5th (and 7th if present), spread close-position around baseMidi.
  return chordIntervals.map((iv) => baseMidi + ((rootPc + iv - (baseMidi % 12) + 24) % 12) + 12);
}

function chordQualityForDegree(genre: Genre, deg: number, scale: { notes: number[]; rootPc: number }): keyof typeof CHORD_FORMULAS {
  // Simple genre-aware mapping
  if (genre === "blues") {
    // dominant 7 on I, IV, V — staple blues sound
    return "dom7";
  }
  if (genre === "jazz") {
    // ii-V-I → m7, dom7, maj7
    if (deg === 1) return "min7";
    if (deg === 4) return "dom7";
    if (deg === 0) return "maj7";
    return "min7";
  }
  if (genre === "rnb") {
    if (deg === 0) return "maj7";
    if (deg === 4) return "dom7";
    return "min7";
  }
  // fallback triads from diatonic position
  const interval = (scale.notes[deg % scale.notes.length] - scale.rootPc + 12) % 12;
  // major-ish if interval is 0,5,7; minor otherwise
  return interval === 0 || interval === 5 || interval === 7 ? "maj" : "min";
}

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
  const noteDensity = { easy: 0.8, intermediate: 1, difficult: 1.3, "very-difficult": 1.6 }[difficulty];
  const rangeOctaves = { easy: 1, intermediate: 2, difficult: 2, "very-difficult": 2 }[difficulty];

  // Build available pitches across desired range
  const available: number[] = [];
  const baseMidi = 40 + STANDARD_TUNING_PCS[preferredString]; // approx low note
  for (let oct = 0; oct < rangeOctaves; oct++) {
    for (const interval of scale.notes.map((pc) => (pc - scale.rootPc + 12) % 12).sort((a, b) => a - b)) {
      available.push(baseMidi + 12 * oct + interval);
    }
  }

  // Build chord progression so the riff can target chord tones on strong beats.
  const progs = PROGRESSIONS[genre];
  const prog = progs[Math.floor(rand() * progs.length)];
  const chordBars: ChordBar[] = [];
  for (let b = 0; b < bars; b++) {
    const deg = prog.degrees[b % prog.degrees.length];
    const rootPc = scale.notes[deg % scale.notes.length];
    const quality = chordQualityForDegree(genre, deg, scale);
    const intervals = CHORD_FORMULAS[quality].intervals;
    const chordPcs = intervals.map((i) => (rootPc + i) % 12);
    const midis = buildChordVoicing(rootPc, intervals, 48);
    chordBars.push({
      rootPc,
      chordPcs,
      midis,
      degree: deg,
      symbol: ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][rootPc] + CHORD_FORMULAS[quality].suffix,
    });
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

    // Determine current chord & whether this beat is "strong" (downbeat or beat 3)
    const currentBar = Math.min(bars - 1, Math.floor(beat / beatsPerBar));
    const beatInBar = beat - currentBar * beatsPerBar;
    const isStrongBeat = Math.abs(beatInBar - Math.round(beatInBar)) < 0.05 &&
      (Math.round(beatInBar) === 0 || Math.round(beatInBar) === 2);
    const chord = chordBars[currentBar];

    // Build candidates: prefer chord tones on strong beats, prefer step-wise motion always.
    const scored = available.map((m) => {
      const dist = Math.abs(m - prevMidi);
      const isChordTone = chord.chordPcs.includes(m % 12);
      // Lower score = better. Step-wise motion + chord tone bias.
      let score = dist;
      if (isStrongBeat && !isChordTone) score += 6;
      if (isStrongBeat && isChordTone) score -= 2;
      // discourage huge leaps
      if (dist > 7) score += 4;
      return { m, score };
    }).sort((a, b) => a.score - b.score);
    const pickIdx = Math.floor(Math.pow(rand(), 2.2) * Math.min(scored.length, 4));
    const midi = scored[pickIdx].m;
    prevMidi = midi;

    const pc = midi % 12;
    const pos = findPosition(pc, scale.notes, preferredString);
    if (pos) {
      // adjust midi to chosen position
      const noteEntry: RiffNote = {
        midi: STANDARD_TUNING_MIDI[pos.string] + pos.fret,
        string: pos.string,
        fret: pos.fret,
        startBeat: beat,
        duration: dur,
      };
      // Layer extra strings on strong beats based on genre voicing density.
      if (isStrongBeat && rand() < VOICING_DENSITY[genre]) {
        const extras = buildExtras(
          { string: pos.string, fret: pos.fret, midi: noteEntry.midi },
          chord,
          genre,
        );
        if (extras.length > 0) noteEntry.extras = extras;
      }
      notes.push(noteEntry);
    }
    beat += dur;
  }

  // Anchor: first note = root, last note = root or chord tone of last bar
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
    // resolve to root on last note
    const last = notes[notes.length - 1];
    const resolvePos = findPosition(scale.rootPc, scale.notes, preferredString);
    if (resolvePos) {
      notes[notes.length - 1] = {
        ...last,
        midi: STANDARD_TUNING_MIDI[resolvePos.string] + resolvePos.fret,
        string: resolvePos.string,
        fret: resolvePos.fret,
      };
    }
  }

  const useChords = CHORD_BACKED_GENRES.includes(genre);

  return {
    notes,
    bpm,
    key,
    scaleId,
    genre,
    difficulty,
    bars,
    beatsPerBar,
    chordBars: useChords ? chordBars : undefined,
    progressionName: prog.name,
  };
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