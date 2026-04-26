// Lightweight key/chord detection using FFT chroma features.

import { CHORD_FORMULAS, NOTE_NAMES_SHARP, noteToPc } from "@/lib/music/theory";

const NOTE_PCS = NOTE_NAMES_SHARP;

/**
 * Temperley/Bellman-Budge style key profiles — empirically derived from a
 * large corpus of pop/rock recordings. Outperforms Krumhansl-Schmuckler on
 * modern tonal music (where K-S was tuned to classical probe-tone tests).
 * Refs: Temperley 2007, Albrecht & Shanahan 2013.
 */
const MAJOR_PROFILE = [
  0.748, 0.06, 0.488, 0.082, 0.67, 0.46,
  0.096, 0.715, 0.104, 0.366, 0.057, 0.4,
];
const MINOR_PROFILE = [
  0.712, 0.084, 0.474, 0.618, 0.049, 0.46,
  0.105, 0.747, 0.404, 0.067, 0.133, 0.33,
];

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function norm(a: number[]): number {
  return Math.sqrt(a.reduce((s, x) => s + x * x, 0)) || 1;
}
function cosine(a: number[], b: number[]): number {
  return dot(a, b) / (norm(a) * norm(b));
}

/** Pearson correlation — better for matching shape of profiles than cosine. */
function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db) || 1;
  return num / den;
}

function rotate(arr: number[], n: number): number[] {
  const r = arr.slice();
  return r.map((_, i) => arr[(i + n) % arr.length]);
}

/** Estimate key (root + mode) from a 12-bin chroma vector. */
export function detectKey(chroma: number[]): { root: string; mode: "major" | "minor"; confidence: number; second?: { root: string; mode: "major" | "minor" } } {
  let best = { score: -Infinity, root: 0, mode: "major" as "major" | "minor" };
  let second = { score: -Infinity, root: 0, mode: "major" as "major" | "minor" };
  for (let r = 0; r < 12; r++) {
    const majScore = pearson(chroma, rotate(MAJOR_PROFILE, -r));
    const minScore = pearson(chroma, rotate(MINOR_PROFILE, -r));
    if (majScore > best.score) {
      second = best;
      best = { score: majScore, root: r, mode: "major" };
    } else if (majScore > second.score) {
      second = { score: majScore, root: r, mode: "major" };
    }
    if (minScore > best.score) {
      second = best;
      best = { score: minScore, root: r, mode: "minor" };
    } else if (minScore > second.score) {
      second = { score: minScore, root: r, mode: "minor" };
    }
  }
  // confidence: gap between best and second, scaled
  const gap = best.score - second.score;
  const confidence = Math.max(0, Math.min(1, 0.5 + gap * 6));
  return {
    root: NOTE_PCS[best.root],
    mode: best.mode,
    confidence,
    second: { root: NOTE_PCS[second.root], mode: second.mode },
  };
}

/** Estimate the most likely chord from a chroma vector. */
export function detectChord(chroma: number[]): { symbol: string; rootPc: number; type: string; confidence: number } {
  let best = { score: -Infinity, root: 0, type: "maj", symbol: "C" };
  const candidateTypes: (keyof typeof CHORD_FORMULAS)[] = ["maj", "min", "dom7", "maj7", "min7", "dim", "sus4"];
  for (let r = 0; r < 12; r++) {
    for (const t of candidateTypes) {
      const formula = CHORD_FORMULAS[t];
      const tmpl = new Array(12).fill(0);
      formula.intervals.forEach((iv) => {
        tmpl[(r + iv) % 12] = 1;
      });
      const score = cosine(chroma, tmpl);
      if (score > best.score) {
        best = { score, root: r, type: t, symbol: NOTE_PCS[r] + formula.suffix };
      }
    }
  }
  return { symbol: best.symbol, rootPc: best.root, type: best.type, confidence: Math.max(0, Math.min(1, best.score)) };
}

/** Compute chroma vector from a Float32Array spectrum (magnitudes). */
export function spectrumToChroma(spectrum: Float32Array, sampleRate: number): number[] {
  const chroma = new Array(12).fill(0);
  const fftSize = spectrum.length * 2;
  for (let i = 1; i < spectrum.length; i++) {
    const freq = (i * sampleRate) / fftSize;
    if (freq < 65 || freq > 2000) continue; // restrict to musical band
    const midi = 69 + 12 * Math.log2(freq / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    const mag = spectrum[i];
    chroma[pc] += mag;
  }
  // normalize
  const max = Math.max(...chroma) || 1;
  return chroma.map((v) => v / max);
}

/** Detect BPM via simple energy-onset autocorrelation. */
export function detectBPM(audioData: Float32Array, sampleRate: number): { bpm: number; confidence: number } {
  const hopSize = 512;
  const frameSize = 1024;
  const energies: number[] = [];
  for (let i = 0; i + frameSize < audioData.length; i += hopSize) {
    let e = 0;
    for (let j = 0; j < frameSize; j++) e += audioData[i + j] * audioData[i + j];
    energies.push(e);
  }
  // onset detection: positive differences
  const onsets = energies.map((e, i) => Math.max(0, e - (energies[i - 1] || 0)));
  // autocorrelate to find period
  const minBpm = 60, maxBpm = 200;
  const framesPerSec = sampleRate / hopSize;
  let bestBpm = 120, bestScore = -Infinity;
  for (let bpm = minBpm; bpm <= maxBpm; bpm++) {
    const lag = Math.round((60 / bpm) * framesPerSec);
    let score = 0;
    for (let i = lag; i < onsets.length; i++) score += onsets[i] * onsets[i - lag];
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  return { bpm: bestBpm, confidence: Math.min(1, bestScore / (onsets.length || 1) * 100) };
}

/** Process an AudioBuffer, returning chroma per segment + overall, plus key + bpm. */
export async function analyzeAudioBuffer(buffer: AudioBuffer, segmentSeconds = 2): Promise<{
  overallChroma: number[];
  segments: { startSec: number; chroma: number[]; chord: ReturnType<typeof detectChord> }[];
  key: ReturnType<typeof detectKey>;
  bpm: ReturnType<typeof detectBPM>;
  durationSec: number;
}> {
  const sampleRate = buffer.sampleRate;
  // Mono mix
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }

  // Process FFT manually-ish: use OfflineAudioContext + AnalyserNode
  const fftSize = 4096;
  const segments: { startSec: number; chroma: number[]; chord: ReturnType<typeof detectChord> }[] = [];
  const segmentSamples = Math.floor(segmentSeconds * sampleRate);
  const overallChroma = new Array(12).fill(0);

  // Hann window + naive DFT-like accumulator using real FFT via OfflineAudioContext
  // Simpler: chunk through and FFT via custom impl is heavy; use wavelet-ish: project onto sin/cos.
  // For practical accuracy with reasonable perf, use the Web Audio AnalyserNode realtime equivalent isn't available offline easily.
  // Implement a simple Goertzel-like per-frequency for the 12 chroma bins across 5 octaves.

  const refMidi = 60; // C4
  // Each pc holds [freq, weight] pairs. Bass octaves get higher weight
  // because the root of a key is overwhelmingly carried by the bass line.
  const freqsByPc: { f: number; w: number }[][] = Array.from({ length: 12 }, () => []);
  for (let pc = 0; pc < 12; pc++) {
    for (let oct = -2; oct <= 3; oct++) {
      const midi = refMidi + pc + oct * 12;
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      if (f < 55 || f > 2200) continue;
      // Weight: emphasize 65–260 Hz (bass + low mids), de-emphasize highs
      // where overtones dominate. octaves: -2=C2, -1=C3, 0=C4, 1=C5...
      let w = 1;
      if (oct === -2) w = 1.6;       // bass
      else if (oct === -1) w = 1.4;  // low mids
      else if (oct === 0) w = 1.0;
      else if (oct === 1) w = 0.7;
      else w = 0.45;
      freqsByPc[pc].push({ f, w });
    }
  }

  function goertzel(samples: Float32Array, freq: number, sr: number): number {
    const k = Math.round((samples.length * freq) / sr);
    const w = (2 * Math.PI * k) / samples.length;
    const cosw = Math.cos(w);
    const coeff = 2 * cosw;
    let sPrev = 0, sPrev2 = 0;
    for (let n = 0; n < samples.length; n++) {
      const s = samples[n] + coeff * sPrev - sPrev2;
      sPrev2 = sPrev;
      sPrev = s;
    }
    const power = sPrev2 * sPrev2 + sPrev * sPrev - coeff * sPrev * sPrev2;
    return Math.sqrt(Math.max(0, power));
  }

  for (let start = 0; start + segmentSamples <= mono.length; start += segmentSamples) {
    const segment = mono.slice(start, start + segmentSamples);
    // window
    for (let i = 0; i < segment.length; i++) {
      segment[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / segment.length);
    }
    const chroma = new Array(12).fill(0);
    for (let pc = 0; pc < 12; pc++) {
      let sum = 0;
      for (const { f, w } of freqsByPc[pc]) sum += w * goertzel(segment, f, sampleRate);
      chroma[pc] = sum;
    }
    const max = Math.max(...chroma) || 1;
    const norm = chroma.map((v) => v / max);
    // Emphasize bass band for the *overall* (key) chroma — root motion lives
    // there. We approximate by weighting segments with stronger low-band
    // energy more, but here just accumulate normalized; root weighting is
    // handled below by the harmonic-suppressed pass.
    for (let i = 0; i < 12; i++) overallChroma[i] += norm[i];
    const chord = detectChord(norm);
    segments.push({ startSec: start / sampleRate, chroma: norm, chord });
  }

  // --- Build a separate, harmonic-suppressed chroma for KEY detection ---
  // Strategy: subtract a fraction of the perfect-5th and major-3rd energy
  // from each pitch class to undo the natural overtone bias that makes
  // detectors confuse a key with its dominant.
  const ovMax = Math.max(...overallChroma) || 1;
  const overallNorm = overallChroma.map((v) => v / ovMax);

  const keyChroma = overallNorm.slice();
  const fifthW = 0.33;
  const thirdW = 0.18;
  const suppressed = new Array(12).fill(0);
  for (let pc = 0; pc < 12; pc++) {
    const fifth = overallNorm[(pc + 7) % 12];
    const third = overallNorm[(pc + 4) % 12];
    suppressed[pc] = Math.max(0, keyChroma[pc] - fifthW * fifth - thirdW * third);
  }
  const sMax = Math.max(...suppressed) || 1;
  const keyChromaNorm = suppressed.map((v) => v / sMax);

  return {
    overallChroma: overallNorm,
    segments,
    key: detectKey(keyChromaNorm),
    bpm: detectBPM(mono, sampleRate),
    durationSec: buffer.duration,
  };
}

// Re-export for convenience
export { noteToPc };