// Realistic instrument playback powered by Tone.js samplers.
// Salamander Grand Piano + nylon/acoustic guitar samples streamed from a public CDN.
// All exports keep their original signatures so callers don't need to change.

import * as Tone from "tone";

export interface PlayOptions {
  duration?: number; // seconds
  velocity?: number; // 0..1
  /**
   * Oscillator type kept for back-compat. We use it as an *instrument hint*:
   *  - "triangle" / "sine" → piano
   *  - anything else (sawtooth, square, etc.) → guitar
   */
  type?: OscillatorType;
  attack?: number;
  release?: number;
}

type Instrument = "piano" | "guitar";

let pianoSampler: Tone.Sampler | null = null;
let guitarSampler: Tone.Sampler | null = null;
let pianoReady = false;
let guitarReady = false;
let unlocked = false;

// Per-instrument volume nodes so users can mix piano vs guitar independently.
let pianoVol: Tone.Volume | null = null;
let guitarVol: Tone.Volume | null = null;
let masterVol: Tone.Volume | null = null;
// HTMLAudioElement destination — required to support setSinkId routing.
// Tone routes everything through Tone.Destination → mediaStreamDest → <audio>.
let mediaDest: MediaStreamAudioDestinationNode | null = null;
let routerAudioEl: HTMLAudioElement | null = null;
let currentSinkId = "default";

// Listeners so the UI can re-render when audio state changes externally.
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
export function subscribeAudio(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function ensureMixer() {
  if (masterVol) return;
  masterVol = new Tone.Volume(0).toDestination();
  pianoVol = new Tone.Volume(0).connect(masterVol);
  guitarVol = new Tone.Volume(0).connect(masterVol);
}

const MIDI_TO_NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${MIDI_TO_NOTE[pc]}${octave}`;
}

function ensurePiano() {
  if (pianoSampler) return pianoSampler;
  ensureMixer();
  // Salamander Grand Piano — public sample set hosted by Tone.js
  pianoSampler = new Tone.Sampler({
    urls: {
      A0: "A0.mp3",
      C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3", A1: "A1.mp3",
      C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3", A2: "A2.mp3",
      C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", A3: "A3.mp3",
      C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", A4: "A4.mp3",
      C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3", A5: "A5.mp3",
      C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3", A6: "A6.mp3",
      C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3", A7: "A7.mp3",
      C8: "C8.mp3",
    },
    release: 1,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    onload: () => {
      pianoReady = true;
      emit();
    },
  }).connect(pianoVol!);
  return pianoSampler;
}

function ensureGuitar() {
  if (guitarSampler) return guitarSampler;
  ensureMixer();
  // Nylon/acoustic guitar samples from Tone.js demo audio set
  guitarSampler = new Tone.Sampler({
    urls: {
      E2: "E2.mp3",
      A2: "A2.mp3",
      D3: "D3.mp3",
      G3: "G3.mp3",
      B3: "B3.mp3",
      E4: "E4.mp3",
    },
    release: 1,
    baseUrl: "https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/",
    onload: () => {
      guitarReady = true;
      emit();
    },
  }).connect(guitarVol!);
  return guitarSampler;
}

/** Must be called from a user gesture before audio can play in most browsers. */
export async function unlockAudio() {
  if (typeof window === "undefined") return;
  if (!unlocked) {
    await Tone.start();
    unlocked = true;
  }
  ensurePiano();
  ensureGuitar();
}

function pickInstrument(opts: PlayOptions): Instrument {
  const t = opts.type;
  if (!t || t === "triangle" || t === "sine") return "piano";
  return "guitar";
}

/** Fallback oscillator beep so users hear *something* before samples finish loading. */
function fallbackBeep(midi: number, opts: PlayOptions, instrument: Instrument) {
  const ctx = Tone.getContext().rawContext as AudioContext;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const { duration = 0.5, velocity = 0.4, attack = 0.005, release = 0.15 } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.min(8000, freq * 6);
  osc.type = instrument === "piano" ? "triangle" : "sawtooth";
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(velocity, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration + release);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + release + 0.05);
}

export function playMidi(midi: number, opts: PlayOptions = {}) {
  if (typeof window === "undefined") return;
  // Fire-and-forget unlock — safe to call repeatedly, resolves instantly after first time.
  void unlockAudio();
  const instrument = pickInstrument(opts);
  const sampler = instrument === "piano" ? ensurePiano() : ensureGuitar();
  const ready = instrument === "piano" ? pianoReady : guitarReady;
  const { duration = 0.6, velocity = 0.8 } = opts;

  if (!ready) {
    fallbackBeep(midi, opts, instrument);
    return;
  }
  try {
    sampler.triggerAttackRelease(midiToNoteName(midi), duration, undefined, velocity);
  } catch {
    fallbackBeep(midi, opts, instrument);
  }
}

export function playFreq(freq: number, opts: PlayOptions = {}) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  playMidi(midi, opts);
}

export function playChord(midis: number[], opts: PlayOptions = {}) {
  if (typeof window === "undefined") return;
  void unlockAudio();
  const instrument = pickInstrument(opts);
  const sampler = instrument === "piano" ? ensurePiano() : ensureGuitar();
  const ready = instrument === "piano" ? pianoReady : guitarReady;
  const { duration = 1, velocity = 0.7 } = opts;

  if (!ready) {
    midis.forEach((m) => fallbackBeep(m, opts, instrument));
    return;
  }
  try {
    sampler.triggerAttackRelease(midis.map(midiToNoteName), duration, undefined, velocity);
  } catch {
    midis.forEach((m) => fallbackBeep(m, opts, instrument));
  }
}

/** Back-compat shim: returns Tone's underlying AudioContext. */
export function getAudioContext(): AudioContext {
  if (typeof window === "undefined") throw new Error("AudioContext only available in browser");
  return Tone.getContext().rawContext as AudioContext;
}