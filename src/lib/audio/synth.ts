// Tiny Web Audio synth used across the app for click-to-play and riff playback.

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (typeof window === "undefined") throw new Error("AudioContext only available in browser");
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export interface PlayOptions {
  duration?: number;
  velocity?: number;
  type?: OscillatorType;
  attack?: number;
  release?: number;
}

export function playFreq(freq: number, opts: PlayOptions = {}) {
  if (typeof window === "undefined") return;
  const a = getAudioContext();
  const { duration = 0.5, velocity = 0.5, type = "triangle", attack = 0.005, release = 0.15 } = opts;
  const osc = a.createOscillator();
  const gain = a.createGain();
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = Math.min(8000, freq * 6);
  osc.type = type;
  osc.frequency.value = freq;
  const now = a.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(velocity, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration + release);
  osc.connect(filter).connect(gain).connect(a.destination);
  osc.start(now);
  osc.stop(now + duration + release + 0.05);
}

export function playMidi(midi: number, opts: PlayOptions = {}) {
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  playFreq(freq, opts);
}

export function playChord(midis: number[], opts: PlayOptions = {}) {
  midis.forEach((m) => playMidi(m, opts));
}