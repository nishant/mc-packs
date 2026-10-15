// The Grunt Birthday cheer for Silly Enchants, synthesized from scratch (no recordings): a party-horn toot, then a
// squeaky little chorus of five voices cheering "yaaay". Deterministic (seeded noise), mono, 44.1 kHz.
//
// The voices are a classic source-filter model: a band-limited glottal pulse (harmonics of a pitch contour around
// 600-900 Hz, small-creature high) through a cascade of four Klatt resonators whose formants glide
// y -> aa -> ay -> ee. Each voice is detuned, starts a little late and wobbles on its own. The horn is a buzzy
// sawtooth-ish reed whose pitch bends up as the blower unrolls, with a little breath noise. A short Schroeder reverb
// puts them in a small room.

export const SR = 44100;
const TAU = Math.PI * 2;
const T = 1 / SR;

/** Seeded PRNG in [0, 1). @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear interpolation through [x, y] keys (x ascending). @param {number[][]} keys @param {number} x */
function track(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [x1, y1] = keys[i];
    if (x <= x1) {
      const [x0, y0] = keys[i - 1];
      const u = (x - x0) / (x1 - x0);
      const s = u * u * (3 - 2 * u); // smoothstep: glides, not corners
      return y0 + (y1 - y0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

/** Smoothly varying noise in [-1, 1] (interpolated random points every `step` samples). @param {() => number} rnd @param {number} n @param {number} step */
function slowNoise(rnd, n, step) {
  const pts = Array.from({ length: Math.ceil(n / step) + 2 }, () => rnd() * 2 - 1);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / step), u = (i % step) / step, s = u * u * (3 - 2 * u);
    out[i] = pts[k] + (pts[k + 1] - pts[k]) * s;
  }
  return out;
}

/** In-place RBJ biquad. @param {Float64Array} x @param {"lp"|"hp"|"bp"} type @param {number} f @param {number} q */
function biquad(x, type, f, q = 0.707) {
  const w = (TAU * f) / SR, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === "lp") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === "hp") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/**
 * Band-limited additive oscillator following a frequency contour.
 * @param {Float64Array} freq Hz per sample @param {(k: number) => number} amp harmonic k's amplitude
 * @param {number} limit highest partial frequency @param {number} phase0
 */
function additive(freq, amp, limit, phase0 = 0) {
  const n = freq.length, out = new Float64Array(n);
  let fmin = Infinity;
  for (const f of freq) fmin = Math.min(fmin, f);
  const K = Math.floor(limit / fmin);
  const phases = new Float64Array(K + 1).fill(phase0);
  for (let i = 0; i < n; i++) {
    const f = freq[i];
    let s = 0;
    for (let k = 1; k <= K; k++) {
      const fk = f * k;
      if (fk > limit) break;
      phases[k] += TAU * fk * T;
      // fade partials out over the last 1.5 kHz before the limit, so a rising pitch drops them without clicks
      const edge = Math.min(1, (limit - fk) / 1500);
      s += amp(k) * edge * Math.sin(phases[k]);
    }
    out[i] = s;
  }
  return out;
}

/** The party horn: a reedy toot whose pitch rises as it unrolls. @param {() => number} rnd */
function horn(rnd) {
  const dur = 0.4, n = Math.round(dur * SR);
  const freq = new Float64Array(n);
  const wob = slowNoise(rnd, n, 500);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // 330 Hz blat up to 500 Hz, overshooting a touch at the end like a blower snapping straight
    const base = track([[0, 330], [0.08, 360], [0.6, 470], [0.85, 505], [1, 495]], t);
    freq[i] = base * (1 + 0.012 * wob[i] + 0.008 * Math.sin(TAU * 23 * i * T));
  }
  // Reed: a sawtooth with stronger odd partials (buzzy, a little nasal).
  const reed = additive(freq, (k) => (k % 2 ? 1.25 : 0.8) / k, 9000);
  const nasal = biquad(Float64Array.from(reed), "bp", 1700, 2.2);
  const out = new Float64Array(n);
  const breath = slowNoise(rnd, n, 1).map((v) => v * 0.5);
  biquad(breath, "bp", 3200, 1.2);
  for (let i = 0; i < n; i++) {
    const t = i * T;
    const attack = Math.min(1, t / 0.012);
    const blat = 1 + 0.35 * Math.exp(-t / 0.03); // the first puff is the loudest
    const release = Math.min(1, (dur - t) / 0.07);
    const env = attack * blat * Math.max(0, release);
    out[i] = env * (0.45 * reed[i] + 0.9 * nasal[i] + 0.25 * breath[i]);
  }
  biquad(out, "lp", 6500);
  return out;
}

// Formant targets (Hz) for a small, squeaky creature: adult values scaled up about 15 percent.
const F = {
  y: [320, 2500, 3300, 4300],
  a: [980, 1560, 2950, 4300],
  e: [600, 2200, 3050, 4300],
  i: [380, 2600, 3400, 4400],
};
const BW = [110, 130, 190, 300];

/**
 * One cheering voice. @param {() => number} rnd
 * @param {{ f0: number, dur: number, bright: number, rise: number }} v
 */
function voice(rnd, v) {
  const n = Math.round(v.dur * SR);
  const freq = new Float64Array(n);
  const jitter = slowNoise(rnd, n, 220);
  const drift = slowNoise(rnd, n, 4000);
  const vibRate = 6.2 + rnd() * 1.6, vibPhase = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // "y-" scoops up, "aaa" holds with an excited lift, "-ay" climbs into a squeak at the end
    const contour = track([[0, 0.78], [0.14, 1.0], [0.6, 1.07], [0.82, 1.1], [1, 1.1 + v.rise]], t);
    const vibDepth = 0.008 + 0.025 * Math.min(1, t / 0.5);
    freq[i] = v.f0 * contour * (1 + vibDepth * Math.sin(TAU * vibRate * i * T + vibPhase) + 0.006 * jitter[i] + 0.012 * drift[i]);
  }
  // Glottal source: a bright pulse (partials falling about 10 dB per octave), plus a little breath.
  const src = additive(freq, (k) => Math.pow(k, -v.bright), 11000, rnd() * TAU);
  const asp = slowNoise(rnd, n, 1);
  biquad(asp, "hp", 2000);
  for (let i = 0; i < n; i++) src[i] += 0.05 * asp[i];
  // Cascade of Klatt resonators (unity gain at 0 Hz), coefficients updated every 16 samples.
  const out = new Float64Array(n);
  const state = BW.map(() => [0, 0]);
  /** @type {number[][]} */
  let co = [];
  for (let i = 0; i < n; i++) {
    if (i % 16 === 0) {
      const t = i / n;
      const which = (/** @type {number} */ f) => track([[0, F.y[f]], [0.13, F.a[f]], [0.6, F.a[f]], [0.8, F.e[f]], [1, F.i[f]]], t);
      co = BW.map((bw, f) => {
        const C = -Math.exp(-TAU * bw * T);
        const B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(TAU * which(f) * T);
        return [1 - B - C, B, C];
      });
    }
    let x = src[i];
    for (let f = 0; f < co.length; f++) {
      const [A, B, C] = co[f], s = state[f];
      const y = A * x + B * s[0] + C * s[1];
      s[1] = s[0];
      s[0] = y;
      x = y;
    }
    out[i] = x;
  }
  // Envelope: a soft "y" onset, a swell on "aaa", a quick fade after the squeak.
  for (let i = 0; i < n; i++) {
    const t = i * T, u = i / n;
    const attack = Math.min(1, t / 0.045);
    const swell = 0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, u / 0.7));
    const release = Math.min(1, (v.dur - t) / 0.12);
    out[i] *= attack * swell * Math.max(0, release);
  }
  return biquad(out, "hp", 250);
}

/** A small, bright room. @param {Float64Array} x @param {number} wet */
function reverb(x, wet) {
  const n = x.length, out = new Float64Array(n);
  for (const [ms, g] of [[23.1, 0.72], [29.7, 0.7], [33.9, 0.68], [39.3, 0.66]]) {
    const d = Math.round((ms / 1000) * SR), buf = new Float64Array(d);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const y = buf[i % d];
      lp = y * 0.6 + lp * 0.4; // damping: highs die first
      buf[i % d] = x[i] + g * lp;
      out[i] += y / 4;
    }
  }
  for (const [ms, g] of [[5.0, 0.7], [1.7, 0.7]]) {
    const d = Math.round((ms / 1000) * SR), buf = new Float64Array(d);
    for (let i = 0; i < n; i++) {
      const b = buf[i % d], y = -g * out[i] + b;
      buf[i % d] = out[i] + g * y;
      out[i] = y;
    }
  }
  return x.map((v, i) => v * (1 - wet * 0.5) + out[i] * wet);
}

/** The whole cheer, mono PCM in [-1, 1]. */
export function yay() {
  const rnd = mulberry32(0x5111);
  const total = 1.4, n = Math.round(total * SR);
  const mix = new Float64Array(n);
  /** @param {Float64Array} part @param {number} at seconds @param {number} gain */
  const add = (part, at, gain) => {
    const o = Math.round(at * SR);
    for (let i = 0; i < part.length && o + i < n; i++) mix[o + i] += part[i] * gain;
  };
  const toot = horn(rnd);
  add(toot, 0, 0.5 / peak(toot));
  // Five little voices, detuned and a beat apart, each its own size (f0) and brightness.
  const voices = [
    { at: 0.3, f0: 700, dur: 0.86, bright: 0.85, rise: 0.12, gain: 1.0 },
    { at: 0.33, f0: 780, dur: 0.82, bright: 0.8, rise: 0.18, gain: 0.8 },
    { at: 0.36, f0: 640, dur: 0.88, bright: 0.9, rise: 0.08, gain: 0.85 },
    { at: 0.39, f0: 860, dur: 0.78, bright: 0.75, rise: 0.22, gain: 0.6 },
    { at: 0.42, f0: 610, dur: 0.84, bright: 0.95, rise: 0.1, gain: 0.7 },
  ];
  for (const v of voices) {
    const part = voice(rnd, v);
    add(part, v.at, (v.gain * 0.42) / peak(part));
  }
  const wet = reverb(mix, 0.28);
  // Fade the reverb tail out at the end of the clip, then normalize to -3 dBFS peak.
  for (let i = 0; i < n; i++) wet[i] *= Math.min(1, (n - i) / (0.08 * SR));
  const g = Math.pow(10, -3 / 20) / peak(wet);
  return wet.map((v) => Math.tanh(v * g * 1.05) / Math.tanh(1.05));
}

/** @param {Float64Array} x */
function peak(x) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  return m || 1;
}

/** 16-bit PCM WAV. @param {Float64Array} x */
export function wav(x) {
  const buf = Buffer.alloc(44 + x.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + x.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return buf;
}
