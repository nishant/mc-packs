// Synthesizes the Realistic Rain sounds into packs/rain_rp/sounds/realistic_rain/ (mono Ogg Vorbis, 44.1 kHz) and
// writes the definitions that play them (sounds/sound_definitions.json, and sounds.json for the lightning pitch):
//   rain1-6         2.0-2.4 s, like vanilla's 2 s clips (the game starts a new one every few ticks and about 15 play
//                   at once, all at full volume): a hiss with dense patter and soft pats, nothing tonal, matched to
//                   vanilla's tone octave by octave (matchEq), so it sounds like vanilla's rain, heavier and textured.
//   thunder1-5      7-10 s, played for every bolt. Physically modeled: N-waves from a tortuous lightning channel,
//                   delayed by distance, softened by air over distance, then rolled through a terrain echo.
//   crack1-4        about 4 s, played only near the bolt: the same model heard from 30-90 m away, with short N-waves
//                   and no low end (the thunder that plays with it carries the boom), so it's a sharp, high crack as
//                   the low channel tears past, then the rest of the bolt rumbling in, not an explosion.
//   wind1-3         10 s storm gusts with a faint whistle, played by Rain Extras; wind_inside1-2 is the same heard
//                   through walls. roof1-4: 3.6 s of rain on the roof above, muffled, also played by Rain Extras.
// Every file is deterministic (seeded) and normalized with ffmpeg's EBU R128 meter. The definitions' volumes are
// computed from the measured loudness, so each event lands at its target level in game whatever the file's level.
// Vanilla reference (bedrock-samples 1.26.50.4, decoded): rain -15.1 LUFS at volume 0.02, thunder -17.3 LUFS,
// lightning impact -12.6 LUFS.
// Needs ffmpeg with libvorbis (and libmp3lame for --audition) on PATH. Not part of npm run check (outputs are committed).
//
//   node tools/gen-rain/sounds.mjs                        write the sounds and their definitions
//   node tools/gen-rain/sounds.mjs --audition docs/media/rain   also write listening clips at in-game relative levels:
//                                                             rain.mp3 (Realistic Rain) and extras.mp3 (Rain Extras)
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const pack = join(root, "packs", "rain_rp");
const outDir = join(pack, "sounds", "realistic_rain");
const SR = 44100;
const TAU = Math.PI * 2;
const C = 343; // speed of sound, m/s
const auditionArg = process.argv.indexOf("--audition");
const audition = auditionArg > 0 ? process.argv[auditionArg + 1] : undefined;

/** Seeded PRNG in [0, 1). */
function mulberry32(/** @type {number} */ seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (/** @type {() => number} */ rnd) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd());
const between = (/** @type {() => number} */ rnd, /** @type {number} */ lo, /** @type {number} */ hi) => lo + rnd() * (hi - lo);

// ---------------------------------------------------------------------------
// DSP helpers (all in place on Float64Array unless they say otherwise)
// ---------------------------------------------------------------------------

/** RBJ biquad coefficients. @param {"lp"|"hp"|"bp"|"lowshelf"} type @returns {number[]} b0, b1, b2, a1, a2 (normalized) */
function coefs(type, freq, q = 0.707, gainDb = 0) {
  const w = (TAU * Math.min(freq, SR * 0.45)) / SR, cos = Math.cos(w), sin = Math.sin(w);
  let b0, b1, b2, a0, a1, a2;
  if (type === "lowshelf") {
    const A = Math.pow(10, gainDb / 40), alpha = (sin / 2) * Math.SQRT2, k = 2 * Math.sqrt(A) * alpha;
    [b0, b1, b2] = [A * (A + 1 - (A - 1) * cos + k), 2 * A * (A - 1 - (A + 1) * cos), A * (A + 1 - (A - 1) * cos - k)];
    [a0, a1, a2] = [A + 1 + (A - 1) * cos + k, -2 * (A - 1 + (A + 1) * cos), A + 1 + (A - 1) * cos - k];
  } else {
    const alpha = sin / (2 * q);
    if (type === "lp") [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
    else if (type === "hp") [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    else [b0, b1, b2] = [alpha, 0, -alpha];
    [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

/** Static biquad. @param {Float64Array} x @param {"lp"|"hp"|"bp"|"lowshelf"} type */
function biquad(x, type, freq, q = 0.707, gainDb = 0) {
  const [b0, b1, b2, a1, a2] = coefs(type, freq, q, gainDb);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** Biquad whose frequency follows freqAt(t seconds), updated every 32 samples. @param {Float64Array} x @param {"lp"|"bp"} type */
function sweep(x, type, /** @type {(t: number) => number} */ freqAt, q = 0.707) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = coefs(type, freqAt(0), q);
  for (let i = 0; i < x.length; i++) {
    if (i % 32 === 0) c = coefs(type, freqAt(i / SR), q);
    const y = c[0] * x[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

/** One-pole low-pass whose cutoff follows cutoffAt(t seconds). */
function sweepLP(/** @type {Float64Array} */ x, /** @type {(t: number) => number} */ cutoffAt) {
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const a = 1 - Math.exp((-TAU * cutoffAt(i / SR)) / SR);
    y += a * (x[i] - y);
    x[i] = y;
  }
  return x;
}

const white = (/** @type {() => number} */ rnd, /** @type {number} */ n) => Float64Array.from({ length: n }, () => rnd() * 2 - 1);

/** Pink noise (Paul Kellet's filter). */
function pink(/** @type {() => number} */ rnd, /** @type {number} */ n) {
  const out = new Float64Array(n);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return out;
}

/** Brown (red) noise: leaky integrated white noise. */
function brown(/** @type {() => number} */ rnd, /** @type {number} */ n) {
  const out = new Float64Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = 0.998 * y + (rnd() * 2 - 1) * 0.06;
    out[i] = y;
  }
  return out;
}

const rms = (/** @type {Float64Array} */ x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
const peak = (/** @type {Float64Array} */ x) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
function scale(/** @type {Float64Array} */ x, /** @type {number} */ g) {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}
/** Adds src × gain into dst starting at sample `at` (clipped to dst). */
function mixIn(/** @type {Float64Array} */ dst, /** @type {Float64Array} */ src, /** @type {number} */ at, gain = 1) {
  const start = Math.max(0, at), end = Math.min(dst.length, at + src.length);
  for (let i = start; i < end; i++) dst[i] += src[i - at] * gain;
}

/** In-place radix-2 FFT of (re, im); inverse when `inv`. */
function fft(/** @type {Float64Array} */ re, /** @type {Float64Array} */ im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, ang = ((inv ? 2 : -2) * Math.PI) / len;
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      for (let i = k; i < n; i += len) {
        const b = i + half, tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[i] - tr; im[b] = im[i] - ti;
        re[i] += tr; im[i] += ti;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/** Linear convolution by FFT, trimmed to x's length. @returns {Float64Array} */
function convolve(/** @type {Float64Array} */ x, /** @type {Float64Array} */ h) {
  let n = 1;
  while (n < x.length + h.length) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x); br.set(h);
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    ai[i] = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r;
  }
  fft(ar, ai, true);
  return ar.slice(0, x.length);
}

/**
 * Outdoor echo: decaying noise that gets darker as it goes (highs die first), plus a few discrete echoes off
 * hills and tree lines. Unit energy, so convolving keeps the level about the same.
 */
function impulse(/** @type {() => number} */ rnd, { seconds, t60, bright, dark, echoes }) {
  const n = Math.round(seconds * SR), ir = white(rnd, n);
  for (let i = 0; i < n; i++) ir[i] *= Math.exp((-6.91 * i) / (t60 * SR)) * Math.min(1, i / (0.012 * SR));
  for (let e = 0; e < echoes; e++) {
    const at = Math.round(between(rnd, 0.15, seconds * 0.6) * SR);
    ir[at] += between(rnd, 25, 60) * Math.exp((-6.91 * at) / (t60 * SR));
  }
  sweepLP(ir, (t) => bright * Math.pow(dark / bright, t / seconds));
  return scale(ir, 1 / Math.sqrt(ir.reduce((s, v) => s + v * v, 0)));
}

/**
 * Feed-forward compressor (peak follower, `attack`/`release` in seconds), like the one on a field recorder: brings the
 * rumble up toward the crack so the limiter only has to shave the very tops. Threshold is relative to the peak.
 */
function compress(/** @type {Float64Array} */ x, thresholdDb, ratio, attack = 0.004, release = 0.25) {
  const thr = peak(x) * Math.pow(10, thresholdDb / 20), a = Math.exp(-1 / (attack * SR)), r = Math.exp(-1 / (release * SR));
  let env = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    env = v > env ? v + (env - v) * a : v + (env - v) * r;
    if (env > thr) x[i] *= Math.pow(env / thr, 1 / ratio - 1);
  }
  return x;
}

/** Soft clipping above `kneeDb` under the peak (tanh): a close crack overloads the mic and rounds off like this. */
function saturate(/** @type {Float64Array} */ x, kneeDb) {
  const t = peak(x) * Math.pow(10, kneeDb / 20);
  for (let i = 0; i < x.length; i++) x[i] = t * Math.tanh(x[i] / t);
  return x;
}

/** Short fades so overlapping copies blend without clicks; `equalPower` for long crossfades. */
function fades(/** @type {Float64Array} */ x, inS, outS, equalPower = false) {
  const a = Math.round(inS * SR), b = Math.round(outS * SR);
  for (let i = 0; i < a; i++) x[i] *= equalPower ? Math.sin(((i / a) * Math.PI) / 2) : i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= Math.sin((i / b) * (Math.PI / 2));
  return x;
}

/** Look-ahead peak limiter: keeps every sample under `ceiling` with a 2 ms attack and 60 ms release. @returns {number} the most gain it took away, in dB */
function limit(/** @type {Float64Array} */ x, ceiling) {
  const look = Math.round(0.002 * SR), rel = Math.exp(-1 / (0.06 * SR));
  const need = Float64Array.from(x, (v) => Math.min(1, ceiling / Math.max(1e-9, Math.abs(v))));
  let g = 1, most = 1;
  const gain = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let m = 1;
    for (let j = i; j < Math.min(x.length, i + look); j++) m = Math.min(m, need[j]);
    g = m < g ? m : m + (g - m) * rel;
    gain[i] = g;
    most = Math.min(most, g);
  }
  for (let i = 0; i < x.length; i++) x[i] *= gain[i];
  return -20 * Math.log10(most);
}

// ---------------------------------------------------------------------------
// Rain: a soft bed and a few distinct drops per clip
// ---------------------------------------------------------------------------

// 1.0's rain (a hiss with dense patter), without anything tonal: 1.1's puddle plinks and ringing taps read as
// high-pitched bubbles. Then matchEq() gives each clip vanilla's tonal balance (VANILLA_RAIN_OCTAVES), 2 dB darker on top.
const RAIN = { hiss: 0.55, patter: 0.5, pats: 0.5 };
/** Vanilla rain1 (decoded) per octave band, dB relative to its total: strongest at 500-1000 Hz. */
const VANILLA_RAIN_OCTAVES = { 63: -47, 125: -26, 250: -13, 500: -6, 1000: -3, 2000: -10, 4000: -12, 8000: -18, 16000: -34 };

/** Static FFT equalizer: moves each octave band's share of the energy to `target` (dB, as VANILLA_RAIN_OCTAVES), with the
 * gain interpolated smoothly between band centers and kept within ±18 dB. */
function matchEq(/** @type {Float64Array} */ x, /** @type {Record<number, number>} */ target) {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  const centers = Object.keys(target).map(Number);
  const band = (/** @type {number} */ c) => [Math.round((c / Math.SQRT2) * n / SR), Math.min(n / 2, Math.round(c * Math.SQRT2 * n / SR))];
  const energy = centers.map((c) => { const [a, b] = band(c); let e = 0; for (let k = a; k < b; k++) e += re[k] ** 2 + im[k] ** 2; return e; });
  const total = energy.reduce((a, b) => a + b, 0);
  const gains = centers.map((c, i) => Math.max(-18, Math.min(18, target[c] - 10 * Math.log10(energy[i] / total + 1e-12))));
  for (let k = 1; k < n / 2; k++) {
    const lf = Math.log2((k * SR) / n), pos = Math.max(0, Math.min(centers.length - 1, lf - Math.log2(centers[0])));
    const i = Math.min(centers.length - 2, Math.floor(pos)), g = Math.pow(10, (gains[i] + (gains[i + 1] - gains[i]) * (pos - i)) / 20);
    re[k] *= g; im[k] *= g; re[n - k] *= g; im[n - k] *= g;
  }
  re[0] = 0; im[0] = 0;
  fft(re, im, true);
  x.set(re.subarray(0, x.length));
  return x;
}

function rain(/** @type {number} */ seed, /** @type {number} */ seconds) {
  const rnd = mulberry32(seed), n = Math.round(seconds * SR);
  // Hiss: pink noise from 250 Hz up, rolled off early on top.
  const hiss = biquad(biquad(biquad(pink(rnd, n), "hp", 300), "lp", 2200), "lp", 9000);
  scale(hiss, 1 / rms(hiss));
  // Patter: many tiny ticks (Poisson, ~900 a second), noise only, so they blend into a crackle instead of ringing.
  const patter = new Float64Array(n);
  for (let t = 0; t < n; t += Math.max(1, Math.round((-Math.log(1 - rnd()) / 900) * SR))) {
    const amp = -Math.log(1 - rnd()), len = Math.round((0.0015 + rnd() * 0.004) * SR), tau = len / 3;
    for (let k = 0; k < len && t + k < n; k++) patter[t + k] += (rnd() * 2 - 1) * amp * Math.exp(-k / tau);
  }
  biquad(biquad(biquad(patter, "hp", 450), "lp", 1700), "lp", 7000);
  scale(patter, 1 / rms(patter));
  // Pats: softer, fuller drops on leaves and ground (~30 a second): short noise bursts, low-passed, never tuned.
  const pats = new Float64Array(n);
  for (let t = 0; t < n; t += Math.max(1, Math.round((-Math.log(1 - rnd()) / 30) * SR))) {
    const len = Math.round(between(rnd, 0.006, 0.016) * SR), tau = len / 4, amp = Math.min(3, Math.exp(0.45 * gauss(rnd)));
    const burst = Float64Array.from({ length: len }, (_, k) => (rnd() * 2 - 1) * Math.exp(-k / tau));
    biquad(biquad(burst, "lp", between(rnd, 700, 1500)), "hp", 260);
    mixIn(pats, burst, t, amp);
  }
  scale(pats, 1 / rms(pats));
  // Slow swell so consecutive copies don't sound identical.
  const f = between(rnd, 0.25, 0.6), ph = rnd() * TAU, out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (hiss[i] * RAIN.hiss + patter[i] * RAIN.patter + pats[i] * RAIN.pats) * (0.9 + 0.1 * Math.sin((TAU * f * i) / SR + ph));
  return fades(matchEq(out, VANILLA_RAIN_OCTAVES), 0.05, 0.15);
}

/** Rain on the roof, heard from inside: a dense, muffled drumming with a soft gutter trickle. */
function roof(/** @type {number} */ seed, /** @type {number} */ seconds) {
  const rnd = mulberry32(seed), n = Math.round(seconds * SR);
  const out = biquad(biquad(pink(rnd, n), "hp", 70), "lp", 650);
  scale(out, 0.05 / rms(out));
  const taps = new Float64Array(n);
  for (let s = 0; s < seconds; s += -Math.log(1 - rnd()) / 170) {
    const len = Math.round(between(rnd, 0.004, 0.009) * SR), tau = between(rnd, 0.0008, 0.002) * SR;
    const x = Float64Array.from({ length: len }, (_, k) => (rnd() * 2 - 1) * Math.exp(-k / tau));
    const body = biquad(Float64Array.from(x), "bp", between(rnd, 170, 420), 3); // the planks
    const tick = biquad(x, "bp", between(rnd, 800, 1700), 2);
    for (let k = 0; k < len; k++) body[k] = body[k] * 2.2 + tick[k] * 0.5;
    mixIn(taps, body, Math.round(s * SR), Math.min(3, Math.exp(0.45 * gauss(rnd))) * 0.06);
  }
  // Gutter: a thin trickle with the occasional soft drip into the downspout (noise, never tuned).
  const trickle = sweep(white(rnd, n), "bp", (t) => 1100 + 250 * Math.sin(TAU * 0.7 * t), 1.6);
  const tm = between(rnd, 0.2, 0.4), tph = rnd() * TAU;
  for (let i = 0; i < n; i++) trickle[i] *= 0.012 * (0.6 + 0.4 * Math.sin((TAU * tm * i) / SR + tph));
  for (let s = rnd() * 0.3; s < seconds - 0.1; s += -Math.log(1 - rnd()) / 5) {
    const len = Math.round(between(rnd, 0.01, 0.025) * SR), tau = len / 4;
    const pat = biquad(Float64Array.from({ length: len }, (_, k) => (rnd() * 2 - 1) * Math.exp(-k / tau)), "lp", between(rnd, 600, 1100));
    mixIn(trickle, scale(pat, 1 / Math.max(1e-9, peak(pat))), Math.round(s * SR), between(rnd, 0.03, 0.08));
  }
  for (let i = 0; i < n; i++) out[i] += taps[i] + trickle[i];
  biquad(biquad(out, "lp", 1700), "lp", 2200); // through the roof
  return fades(out, 0.35, 0.35, true);
}

// ---------------------------------------------------------------------------
// Wind: gusts for storms (Rain Extras plays them)
// ---------------------------------------------------------------------------

function wind(/** @type {number} */ seed, /** @type {number} */ seconds, inside = false) {
  const rnd = mulberry32(seed), n = Math.round(seconds * SR);
  // Gust strength 0.15-1: two slow swells and a wandering noise.
  const wander = sweepLP(white(rnd, n), () => 0.35);
  scale(wander, 1 / Math.max(1e-9, peak(wander)));
  const [f1, f2, p1, p2] = [between(rnd, 0.06, 0.12), between(rnd, 0.15, 0.26), rnd() * TAU, rnd() * TAU];
  const gust = Float64Array.from({ length: n }, (_, i) => {
    const t = i / SR;
    return Math.max(0.15, Math.min(1, 0.55 + 0.25 * Math.sin(TAU * f1 * t + p1) + 0.12 * Math.sin(TAU * f2 * t + p2) + 0.25 * wander[i]));
  });
  const g = (/** @type {number} */ t) => gust[Math.min(n - 1, Math.round(t * SR))];
  const body = sweep(pink(rnd, n), "bp", (t) => 170 + 520 * g(t), 0.8);
  const hiss = sweep(white(rnd, n), "bp", (t) => 650 + 1500 * g(t), 0.9);
  const rumble = biquad(brown(rnd, n), "lp", 90);
  const whistles = [between(rnd, 380, 560), between(rnd, 640, 900)].map((fw, k) => {
    const vib = between(rnd, 4, 6.5);
    return sweep(white(rnd, n), "bp", (t) => fw * (1 + 0.025 * Math.sin(TAU * vib * t + k)), 28);
  });
  [body, hiss, rumble, ...whistles].forEach((x) => scale(x, 1 / Math.max(1e-9, rms(x))));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const gi = gust[i], howl = Math.max(0, gi - 0.62) / 0.38;
    out[i] = body[i] * (0.2 + 0.8 * gi) + hiss[i] * 0.3 * gi * gi + rumble[i] * 0.35 * gi + (whistles[0][i] + whistles[1][i] * 0.7) * 0.08 * howl;
  }
  if (inside) {
    biquad(biquad(out, "lp", 420), "lp", 520);
    // A window or door rattling in the strongest gusts.
    const rattle = biquad(white(rnd, n), "bp", 260, 4), rate = between(rnd, 16, 24);
    scale(rattle, 1 / rms(rattle));
    for (let i = 0; i < n; i++) out[i] += rattle[i] * 0.05 * Math.max(0, gust[i] - 0.72) * (0.5 + 0.5 * Math.sin((TAU * rate * i) / SR));
  }
  return fades(out, 2, 2, true);
}

// ---------------------------------------------------------------------------
// Thunder and lightning: a physical model
// ---------------------------------------------------------------------------
//
// A bolt is a tortuous channel kilometers long. When it heats, every few meters of it sends out a short pressure pulse
// (an N-wave, a few ms long). You hear the sum: each segment's pulse arrives after r/c seconds, is weaker with distance,
// is dulled by the air over distance, and is smeared over L·|cos θ|/c, so segments broadside to you arrive all at once
// (a clap) and segments pointing at you arrive as a drawn-out rumble. Close by, the low channel tears past within a few
// milliseconds (the crack); farther away, the kilometers of channel and its branches arrive over many seconds (the roll).

/** @typedef {{ p: number[], q: number[], w: number }} Segment */

/** A tortuous walk: `steps` of 2-8 m (wider in the cloud) around `dir`, each ~16° off on average. @returns {Segment[]} */
function walk(/** @type {() => number} */ rnd, /** @type {number[]} */ from, /** @type {number[]} */ dir, /** @type {number} */ length, /** @type {number} */ weight, stepRange = [2, 8]) {
  const segs = [];
  let p = from, done = 0;
  while (done < length) {
    const d = [dir[0] + gauss(rnd) * 0.3, dir[1] + gauss(rnd) * 0.3, dir[2] + gauss(rnd) * 0.3];
    const len = Math.hypot(...d), L = between(rnd, stepRange[0], stepRange[1]);
    const q = [p[0] + (d[0] / len) * L, p[1] + (d[1] / len) * L, p[2] + (d[2] / len) * L];
    segs.push({ p, q, w: weight * (1 - 0.5 * (done / length)) });
    p = q;
    done += L;
  }
  return segs;
}

/**
 * @param {number} seed
 * @param {{ seconds: number, distance: number, height: number, branches: number, cloud: number, echo: object, wet: number, knee: number, nwave: number, lowCut: number, bass: number, sizzle?: boolean }} o
 *   nwave: shortest N-wave (s) near the channel; lowCut (Hz) and bass (dB shelf at 160 Hz) shape the low end
 */
function lightning(seed, o) {
  const rnd = mulberry32(seed), n = Math.round(o.seconds * SR);
  // The channel: ground to cloud base, branches hanging off it, then a run along the cloud base.
  const main = walk(rnd, [0, 0, 0], [0, 0, 1], o.height, 1);
  const segs = [...main];
  for (let b = 0; b < o.branches; b++) {
    const from = main[Math.floor(between(rnd, 0.25, 0.9) * main.length)].q, az = rnd() * TAU;
    segs.push(...walk(rnd, from, [Math.cos(az), Math.sin(az), -0.7], between(rnd, 80, 450), between(rnd, 0.35, 0.6)));
  }
  const top = main[main.length - 1].q, caz = rnd() * TAU;
  segs.push(...walk(rnd, top, [Math.cos(caz), Math.sin(caz), 0.05], o.cloud, between(rnd, 0.55, 0.75), [4, 12]));

  const oaz = rnd() * TAU, ear = [o.distance * Math.cos(oaz), o.distance * Math.sin(oaz), 1.7];
  // Distance bands, each softened by the air like a microphone that far away (absorption grows with distance).
  const edges = [0, 60, 150, 400, 1000, 2500, 6000, Infinity];
  const bands = edges.slice(1).map(() => new Float64Array(n));
  const cutoff = (/** @type {number} */ r) => Math.max(140, Math.min(16000, 20000 * Math.pow(50 / r, 0.9)));
  const arrivals = segs.map((s) => {
    const m = [(s.p[0] + s.q[0]) / 2, (s.p[1] + s.q[1]) / 2, (s.p[2] + s.q[2]) / 2];
    const v = [m[0] - ear[0], m[1] - ear[1], m[2] - ear[2]], r = Math.hypot(...v);
    const d = [s.q[0] - s.p[0], s.q[1] - s.p[1], s.q[2] - s.p[2]], L = Math.hypot(...d);
    const cos = Math.abs((d[0] * v[0] + d[1] * v[1] + d[2] * v[2]) / (L * r));
    return { r, L, spread: (L * cos) / C, w: s.w };
  });
  const first = Math.min(...arrivals.map((a) => a.r));
  const preroll = o.sizzle ? 0.06 : between(rnd, 0.12, 0.3);
  for (const a of arrivals) {
    const t0 = preroll + (a.r - first) / C;
    const tau = o.nwave * (1 + rnd() * 1.6) + a.r * 3e-6; // N-waves lengthen as they travel
    const amp = (a.w * a.L) / Math.pow(Math.max(a.r, 45), 0.75);
    const parts = Math.max(1, Math.ceil(a.spread / tau));
    const band = bands[edges.findIndex((e, i) => a.r >= e && a.r < edges[i + 1])];
    for (let k = 0; k < parts; k++) {
      const start = Math.round((t0 - a.spread / 2 + (a.spread * (k + 0.5)) / parts) * SR), len = Math.max(2, Math.round(tau * SR));
      if (start < 0 || start + len >= n) continue;
      for (let i = 0; i < len; i++) band[start + i] += (amp / parts) * (1 - (2 * i) / (len - 1)); // N-wave: + to - ramp
    }
  }
  const dry = new Float64Array(n);
  bands.forEach((b, i) => {
    const r = i === 0 ? 35 : i === bands.length - 1 ? 9000 : Math.sqrt(edges[i] * edges[i + 1]);
    biquad(biquad(b, "lp", cutoff(r)), "lp", cutoff(r) * 1.4);
    mixIn(dry, b, 0);
  });
  if (o.sizzle) {
    // The hiss some people hear a split second before a very close strike.
    const len = Math.round(0.035 * SR), at = Math.round((preroll - 0.04) * SR), hiss = biquad(white(rnd, len), "hp", 4500);
    for (let i = 0; i < len; i++) hiss[i] *= Math.pow(i / len, 2);
    mixIn(dry, hiss, at, peak(dry) * 0.06);
  }
  // Rolling echoes off the land, then weight in the low end small speakers can still carry.
  const wet = convolve(dry, impulse(rnd, o.echo));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = dry[i] + wet[i] * o.wet;
  biquad(out, "hp", o.lowCut);
  if (o.bass) biquad(out, "lowshelf", 160, 0.707, o.bass);
  saturate(out, o.knee);
  compress(out, -12, 2.5, 0.0005);
  return fades(out, 0.002, Math.min(1.5, o.seconds * 0.2));
}

const THUNDER_ECHO = { seconds: 4.5, t60: 4.2, bright: 2600, dark: 260, echoes: 5 };
const CRACK_ECHO = { seconds: 2.5, t60: 2.2, bright: 7000, dark: 420, echoes: 2 };

// ---------------------------------------------------------------------------
// Files, loudness and definitions
// ---------------------------------------------------------------------------

/** @param {Float64Array} x @param {string} file */
function writeWav(x, file) {
  const buf = Buffer.alloc(44 + x.length * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + x.length * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(32, 34);
  buf.write("data", 36); buf.writeUInt32LE(x.length * 4, 40);
  for (let i = 0; i < x.length; i++) buf.writeFloatLE(x[i], 44 + i * 4);
  writeFileSync(file, buf);
}

/** Integrated loudness (LUFS) and true peak (dBTP) of an audio file, from ffmpeg's EBU R128 summary on stderr. */
function summary(/** @type {string} */ file) {
  const res = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  if (res.error || res.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${res.error ?? res.stderr}`);
  const tail = res.stderr.slice(res.stderr.lastIndexOf("Summary:"));
  const lufs = Number(tail.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const peakDb = Number(tail.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(peakDb)) throw new Error(`no loudness reading for ${file}`);
  return { lufs, peak: peakDb };
}

/** The game starts a rain clip every 2-4 ticks, and about 15 play at once, all at full volume: 20 s of that. */
function layered(/** @type {Float64Array[]} */ clips, seconds = 20) {
  const rnd = mulberry32(7), mix = new Float64Array(seconds * SR);
  for (let t = 0; t < seconds; t += (2 + Math.floor(rnd() * 3)) / 20) mixIn(mix, clips[Math.floor(rnd() * clips.length)], Math.round(t * SR));
  return mix;
}

/** Vanilla's rain1-4 (decoded from bedrock-samples' .fsb, resampled to 44.1 kHz) through layered() at volume 0.02. */
const VANILLA_RAIN_LAYERED = -41.3;

/**
 * Each event: its files, the file loudness to normalize to (as loud as the peaks allow) and the level it should play at
 * in game, which sets the definition volume:
 *   `level`    one copy at full volume: file LUFS + 20·log10(volume).
 *   `layered`  rain only: the loudness of layered() at the definition volume. Per-file loudness doesn't predict how
 *              sparse drops add up, so the stacked mix itself is matched: vanilla's plus 25%.
 * Thunder and the impact land at about vanilla's level (-17.3 and -12.6 LUFS); the Rain Extras sounds sit under the
 * thunder, and Rain Extras scales them further.
 */
const EVENTS = [
  {
    event: "ambient.weather.rain", subtitle: "subtitles.weather.rain", target: -23, ceiling: -1.5, layered: VANILLA_RAIN_LAYERED + 20 * Math.log10(1.25),
    files: [2.2, 2.0, 2.4, 2.1, 2.3, 2.0].map((s, i) => ({ name: `rain${i + 1}`, make: () => rain(1100 + i, s) })),
  },
  {
    event: "ambient.weather.thunder", subtitle: "subtitles.entity.lightning_bolt.thunder", target: -16.5, ceiling: -2, level: -16.5,
    files: [
      { distance: 700, height: 1400, branches: 4, cloud: 1400, seconds: 7.5 },
      { distance: 1100, height: 1700, branches: 5, cloud: 2000, seconds: 7.5 },
      { distance: 1600, height: 1500, branches: 3, cloud: 2400, seconds: 8.5 },
      { distance: 2600, height: 1800, branches: 4, cloud: 2800, seconds: 10 },
      { distance: 3600, height: 1600, branches: 3, cloud: 4500, seconds: 10 },
    ].map((o, i) => ({ name: `thunder${i + 1}`, make: () => lightning(2100 + i, { ...o, echo: THUNDER_ECHO, wet: 0.6, knee: -10, nwave: 0.0025, lowCut: 25, bass: 3 }) })),
  },
  {
    event: "ambient.weather.lightning.impact", subtitle: "subtitles.entity.generic.explode", target: -16, ceiling: -2, level: -16,
    files: [
      { distance: 30, height: 1300, branches: 4, cloud: 500, seconds: 4.2 },
      { distance: 50, height: 1500, branches: 3, cloud: 700, seconds: 4.4 },
      { distance: 70, height: 1200, branches: 5, cloud: 400, seconds: 4 },
      { distance: 90, height: 1600, branches: 4, cloud: 800, seconds: 4.5 },
    ].map((o, i) => ({ name: `crack${i + 1}`, make: () => lightning(3100 + i, { ...o, echo: CRACK_ECHO, wet: 0.3, knee: -18, nwave: 0.0004, lowCut: 180, bass: 0, sizzle: true }) })),
  },
  {
    event: "realm.storm.wind", target: -20, ceiling: -3, level: -34,
    files: [0, 1, 2].map((i) => ({ name: `wind${i + 1}`, make: () => wind(4100 + i, 10) })),
  },
  {
    event: "realm.storm.wind_inside", target: -26, ceiling: -3, level: -41,
    files: [0, 1].map((i) => ({ name: `wind_inside${i + 1}`, make: () => wind(4200 + i, 10, true) })),
  },
  {
    event: "realm.rain.roof", subtitle: "subtitles.weather.rain", target: -22, ceiling: -3, level: -37,
    files: [0, 1, 2, 3].map((i) => ({ name: `roof${i + 1}`, make: () => roof(5100 + i, 3.6) })),
  },
];

/** The definitions: vanilla's keys for weather sounds, with each file's volume from `volumes`. */
function definitions(/** @type {Map<string, number>} */ volumes) {
  /** @type {Record<string, object>} */
  const defs = {};
  for (const e of EVENTS) {
    defs[e.event] = {
      __use_legacy_max_distance: "true",
      category: "weather",
      max_distance: null,
      min_distance: 100.0,
      sounds: e.files.map((f, i) => ({ ...(i === 0 ? { load_on_low_memory: true } : {}), name: `sounds/realistic_rain/${f.name}`, volume: volumes.get(f.name) })),
      ...(e.subtitle ? { subtitle: e.subtitle } : {}),
    };
  }
  return JSON.stringify({ format_version: "1.20.20", sound_definitions: defs }, null, 2) + "\n";
}

// Vanilla's lightning_bolt entry from sounds.json (volume 1000, both events), with the pitch near 1 instead of
// 0.3-0.7 (impact) and 0.6-1.0 (thunder), so the modeled sounds play as made. The whole entity entry is included so
// it replaces vanilla's either way packs merge it.
const SOUNDS_JSON = {
  entity_sounds: {
    entities: {
      lightning_bolt: {
        events: {
          explode: { pitch: [0.9, 1.1], sound: "ambient.weather.lightning.impact" },
          thunder: { pitch: [0.9, 1.1], sound: "ambient.weather.thunder" },
        },
        volume: 1000.0,
      },
    },
  },
};

/**
 * Listening clips for the docs and the site, each a scene the game could play: rain stacked the way the game stacks it
 * (a clip every 2-4 ticks), plus what the scene adds at its definition and Rain Extras volumes. In game a strike is
 * about 23 dB louder than the rain, which leaves the rain inaudible in a clip, so strikes play STRIKE_GAIN quieter here.
 * Normalized to -18 LUFS and limited.
 */
const STRIKE_GAIN = Math.pow(10, -12 / 20);
const AUDITION = {
  // Realistic Rain on its own: rain, a far thunder, then a close strike (the impact and the thunder together).
  rain: { seconds: 26, play: [["ambient.weather.thunder", "thunder4", 9, STRIKE_GAIN], ["ambient.weather.thunder", "thunder2", 18, STRIKE_GAIN], ["ambient.weather.lightning.impact", "crack2", 18, STRIKE_GAIN]] },
  // Rain Extras: a breeze outdoors in rain, then indoors (rain on the roof, muffled wind), then outdoors in a storm.
  extras: {
    seconds: 30,
    play: [
      ["realm.storm.wind", "wind1", 0, 0.35], ["realm.storm.wind", "wind2", 8, 0.35],
      ["realm.rain.roof", "roof1", 10, 0.8], ["realm.rain.roof", "roof2", 13, 0.8], ["realm.rain.roof", "roof3", 16, 0.8], ["realm.storm.wind_inside", "wind_inside1", 10, 0.35],
      ["realm.storm.wind", "wind3", 19, 1], ["realm.storm.wind", "wind1", 27, 1], ["ambient.weather.thunder", "thunder5", 21, STRIKE_GAIN],
    ],
  },
};

mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "gen-rain-"));
const rows = [];
/** @type {Map<string, number>} file → definition volume */
const volumes = new Map();
const toVolume = (/** @type {number} */ db) => Math.round(Math.min(1, Math.pow(10, db / 20)) * 1000) / 1000;
/** @type {Map<string, Float64Array>} final samples, for the audition */
const made = new Map();
const keep = new Set(EVENTS.flatMap((e) => e.files.map((f) => `${f.name}.ogg`)));
try {
  for (const e of EVENTS) {
    for (const f of e.files) {
      const x = f.make();
      const wav = join(tmp, `${f.name}.wav`);
      const ceil = Math.pow(10, e.ceiling / 20);
      // Gain to the target, limit peaks, and repeat: limiting lowers the loudness a little each time.
      let reduction = 0;
      for (let pass = 0; pass < 5; pass++) {
        writeWav(x, wav);
        const { lufs } = summary(wav);
        if (pass > 0 && Math.abs(e.target - lufs) < 0.2) break;
        scale(x, Math.pow(10, (e.target - lufs) / 20));
        reduction = Math.max(reduction, limit(x, ceil));
      }
      writeWav(x, wav);
      const ogg = join(outDir, `${f.name}.ogg`);
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-ar", String(SR), "-c:a", "libvorbis", "-q:a", "3", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", ogg]);
      const m = summary(ogg);
      if (e.level !== undefined) volumes.set(f.name, toVolume(e.level - m.lufs));
      made.set(f.name, x);
      rows.push({ file: f.name, seconds: (x.length / SR).toFixed(2), lufs: m.lufs.toFixed(1), truePeak: m.peak.toFixed(1), limitedDb: reduction.toFixed(1), kb: (statSync(ogg).size / 1024).toFixed(1) });
    }
    if (e.layered !== undefined) {
      const wav = join(tmp, "layered.wav");
      writeWav(layered(e.files.map((f) => /** @type {Float64Array} */ (made.get(f.name)))), wav);
      const { lufs } = summary(wav);
      for (const f of e.files) volumes.set(f.name, toVolume(e.layered - lufs));
      console.log(`${e.event}: layered ${lufs.toFixed(1)} LUFS at volume 1 → volume ${volumes.get(e.files[0].name)} for ${e.layered.toFixed(1)} LUFS`);
    }
  }
  for (const name of readdirSync(outDir)) if (!keep.has(name)) rmSync(join(outDir, name)); // retired files
  writeFileSync(join(pack, "sounds", "sound_definitions.json"), definitions(volumes));
  writeFileSync(join(pack, "sounds.json"), JSON.stringify(SOUNDS_JSON, null, 2) + "\n");
  if (audition) writeAudition(audition, tmp);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.table(rows);
console.log(`total ${(rows.reduce((s, r) => s + Number(r.kb), 0) / 1024).toFixed(2)} MB of sounds; wrote sounds/sound_definitions.json and sounds.json`);

// ---------------------------------------------------------------------------
// Audition: roughly what a player hears, at in-game relative levels
// ---------------------------------------------------------------------------

function writeAudition(/** @type {string} */ dir, /** @type {string} */ tmpDir) {
  mkdirSync(dir, { recursive: true });
  const defs = JSON.parse(definitions(volumes)).sound_definitions;
  const vol = (/** @type {string} */ event, /** @type {string} */ name) => defs[event].sounds.find((/** @type {{ name: string }} */ s) => s.name.endsWith(`/${name}`)).volume;
  for (const [name, scene] of Object.entries(AUDITION)) {
    const rnd = mulberry32(99), mix = new Float64Array(scene.seconds * SR);
    for (let t = 0; t < scene.seconds; t += (2 + Math.floor(rnd() * 3)) / 20) {
      const clip = `rain${1 + Math.floor(rnd() * 6)}`;
      mixIn(mix, /** @type {Float64Array} */ (made.get(clip)), Math.round(t * SR), vol("ambient.weather.rain", clip));
    }
    for (const [event, clip, at, gain = 1] of /** @type {[string, string, number, number?][]} */ (scene.play)) mixIn(mix, /** @type {Float64Array} */ (made.get(clip)), Math.round(at * SR), vol(event, clip) * gain);
    fades(mix, 0.5, 1.5);
    const wav = join(tmpDir, `${name}-audition.wav`);
    for (let pass = 0; pass < 4; pass++) {
      writeWav(mix, wav);
      const { lufs } = summary(wav);
      if (pass > 0 && Math.abs(-18 - lufs) < 0.3) break;
      scale(mix, Math.pow(10, (-18 - lufs) / 20));
      limit(mix, Math.pow(10, -1.5 / 20));
    }
    writeWav(mix, wav);
    const out = join(dir, `${name}.mp3`);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-c:a", "libmp3lame", "-q:a", "4", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", out]);
    console.log(`audition: ${relative(root, out)} (${scene.seconds} s, ${(statSync(out).size / 1024).toFixed(0)} KB)`);
  }
}
