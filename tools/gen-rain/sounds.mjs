// Makes the Realistic Rain sounds in packs/rain_rp/sounds/realistic_rain/ (mono Ogg Vorbis, 44.1 kHz) and writes the
// definitions that play them (sounds/sound_definitions.json, and sounds.json for the lightning pitch). The rain and thunder
// are the realm owner's recordings (recordings.json), cut and otherwise left as they are:
//   rain1-8         2.4 s excerpts of the rain recording. The game starts a rain sound every few ticks and about 15 play at
//                   once, so short clips from different places in the recording blend back into steady rain.
//   thunder1-6      8 s rolls from the thunderstorm recording, played for every lightning bolt.
//   crack1-4        4.5 s of its sharpest hits, played only when a bolt strikes near you.
//   bed1-4          20 s stretches of the thunderstorm recording, which Rain Extras plays back to back during thunderstorms;
//                   bed_inside1-2 is the same heard through walls (low-passed).
//   wind1-3         10 s storm gusts with a faint whistle, played by Rain Extras; wind_inside1-2 is the same heard
//                   through walls. roof1-4: 3.6 s of rain on the roof above, muffled, also played by Rain Extras.
//                   These are synthesized.
// The definitions' volumes are computed from the measured loudness (ffmpeg's EBU R128 meter), so each event lands at its
// target level in game whatever the file's level. Vanilla reference (bedrock-samples 1.26.50.4, decoded): rain -15.1 LUFS
// at volume 0.02, thunder -17.3 LUFS, lightning impact -12.6 LUFS.
// Needs ffmpeg with libvorbis (and libmp3lame for --audition) on PATH. The recordings aren't committed (10 minutes each):
// without them in tools/gen-rain/sources/, the clips cut from them are kept as committed and only the rest is remade.
// Not part of npm run check (outputs are committed).
//
//   node tools/gen-rain/sounds.mjs                              write the sounds and their definitions
//   node tools/gen-rain/sounds.mjs --audition docs/media/rain   also write listening clips at in-game relative levels:
//                                                             rain.mp3 (Realistic Rain) and extras.mp3 (Rain Extras)
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const pack = join(root, "packs", "rain_rp");
const outDir = join(pack, "sounds", "realistic_rain");
const SR = 44100;
const TAU = Math.PI * 2;
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
// Thunder and lightning: excerpts of real recordings (recordings.json)
// ---------------------------------------------------------------------------

const RECORDINGS = JSON.parse(readFileSync(join(import.meta.dirname, "recordings.json"), "utf8")).sources;

/** A recording's path, if it's in tools/gen-rain/sources/ and matches its sha256; otherwise undefined. */
function source(/** @type {string} */ id) {
  const rec = RECORDINGS[id], file = join(import.meta.dirname, rec.file);
  if (!existsSync(file)) return undefined;
  if (createHash("sha256").update(readFileSync(file)).digest("hex") !== rec.sha256) throw new Error(`${rec.file} isn't the recording in recordings.json (sha256 differs)`);
  return file;
}

/**
 * `seconds` of a recording from `start`, mono 44.1 kHz, with only sub-bass below 25 Hz removed and fades, or undefined
 * when the recording isn't there (the committed clip is kept).
 */
function excerpt(/** @type {string} */ id, /** @type {number} */ start, /** @type {number} */ seconds, /** @type {number} */ fadeIn, /** @type {number} */ fadeOut) {
  const x = decodeRange(id, start, seconds);
  return x && fades(x, fadeIn, fadeOut, true);
}

/** Mono samples of a recording from `start` for `seconds`, with the 25 Hz high-pass every excerpt gets. */
function decodeRange(/** @type {string} */ id, /** @type {number} */ start, /** @type {number} */ seconds) {
  const file = source(id);
  if (!file) return undefined;
  const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", String(Math.max(0, start)), "-t", String(seconds), "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return biquad(Float64Array.from(new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)), "hp", 25);
}

/** The same, heard through walls: low-passed. */
const muffled = (/** @type {Float64Array | undefined} */ x) => x && biquad(biquad(x, "lp", 450), "lp", 600);

// ---------------------------------------------------------------------------
// Taking the rain out of the thunder. The thunderstorm recording has rain under every roll, and a roll plays about
// 20 dB over the game's rain, so its rain would swell with each bolt. A spectral gate learns the rain from the whole
// recording (per frequency, a low percentile of the level: the rain is always there, the thunder isn't) and turns down
// only what doesn't rise clearly above it for a few frames. Thunder, rumble and the crack of a strike pass; the rain
// under them drops by GATE.floorDb. Gains are smoothed over time and frequency so the rain fades out instead of
// fluttering.
// ---------------------------------------------------------------------------

const FRAME = 2048, HOP = 512, BINS = FRAME / 2 + 1;
const WINDOW = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME));
const GATE = { percentile: 0.1, thresholdDb: 10, floorDb: -30, attackMs: 30, releaseMs: 180, spreadBins: 3 };

/** In-place radix-2 FFT (length a power of two). */
function fft(/** @type {Float64Array} */ re, /** @type {Float64Array} */ im) {
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
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Short-time spectra of x (Hann windows, 75% overlap, padded by a frame each side). */
function stft(/** @type {Float64Array} */ x) {
  const pad = new Float64Array(x.length + 2 * FRAME);
  pad.set(x, FRAME);
  const frames = [];
  for (let s = 0; s + FRAME <= pad.length; s += HOP) {
    const re = new Float64Array(FRAME), im = new Float64Array(FRAME);
    for (let i = 0; i < FRAME; i++) re[i] = pad[s + i] * WINDOW[i];
    fft(re, im);
    frames.push({ re, im });
  }
  return frames;
}

/** Each frame's power per bin, averaged over the neighboring bins so single bins don't flicker. */
function smoothPower(/** @type {{ re: Float64Array, im: Float64Array }} */ f) {
  const p = new Float64Array(BINS), out = new Float64Array(BINS);
  for (let b = 0; b < BINS; b++) p[b] = f.re[b] * f.re[b] + f.im[b] * f.im[b];
  for (let b = 0; b < BINS; b++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, b - 2); k <= Math.min(BINS - 1, b + 2); k++, n++) s += p[k];
    out[b] = s / n;
  }
  return out;
}

/** The rain's level per bin: a low percentile of the smoothed power over the whole recording (every 4th frame, a minute
 * at a time), where the storm is quietest. A local window doesn't work: some strikes sit inside a minute of rumble. */
const profiles = new Map();
function rainProfile(/** @type {string} */ id) {
  if (profiles.has(id)) return profiles.get(id);
  const rows = [];
  for (let from = 0; ; from += 60) {
    const x = decodeRange(id, from, 60);
    if (!x || x.length < FRAME * 4) break;
    stft(x).slice(4, -4).forEach((f, i) => i % 4 === 0 && rows.push(Float32Array.from(smoothPower(f))));
    if (x.length < 60 * SR - SR) break;
  }
  const profile = new Float64Array(BINS), column = new Float64Array(rows.length);
  for (let b = 0; b < BINS; b++) {
    rows.forEach((p, i) => (column[i] = p[b]));
    column.sort();
    profile[b] = column[Math.floor(GATE.percentile * (column.length - 1))];
  }
  profiles.set(id, profile);
  return profile;
}

/** x with the rain under it turned down (see GATE). */
function derain(/** @type {Float64Array} */ x, /** @type {Float64Array} */ profile) {
  const frames = stft(x), F = frames.length, gains = new Float64Array(F * BINS);
  const pass = Math.pow(10, GATE.thresholdDb / 10), floor = Math.pow(10, GATE.floorDb / 20);
  // A bin opens only if it stays over the rain for three frames (about 35 ms): thunder does, a single loud drop doesn't.
  const powers = frames.map(smoothPower);
  for (let i = 0; i < F; i++) {
    for (let b = 0; b < BINS; b++) {
      const held = Math.min(powers[Math.max(0, i - 1)][b], powers[i][b], powers[Math.min(F - 1, i + 1)][b]);
      gains[i * BINS + b] = held > profile[b] * pass ? 1 : floor;
    }
  }
  // Opens within attackMs before the thunder, closes over releaseMs after it.
  const rel = Math.pow(floor, HOP / SR / (GATE.releaseMs / 1000)), att = Math.pow(floor, HOP / SR / (GATE.attackMs / 1000));
  for (let b = 0; b < BINS; b++) {
    for (let i = 1; i < F; i++) gains[i * BINS + b] = Math.max(gains[i * BINS + b], gains[(i - 1) * BINS + b] * rel);
    for (let i = F - 2; i >= 0; i--) gains[i * BINS + b] = Math.max(gains[i * BINS + b], gains[(i + 1) * BINS + b] * att);
  }
  const out = new Float64Array(x.length + 2 * FRAME), norm = new Float64Array(out.length), g = new Float64Array(BINS);
  frames.forEach((f, i) => {
    for (let b = 0; b < BINS; b++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, b - GATE.spreadBins); k <= Math.min(BINS - 1, b + GATE.spreadBins); k++, n++) s += Math.log(gains[i * BINS + k]);
      g[b] = Math.exp(s / n);
    }
    for (let b = 0; b < FRAME; b++) {
      const k = b < BINS ? b : FRAME - b;
      f.re[b] *= g[k];
      f.im[b] = -f.im[b] * g[k]; // conjugate: the forward FFT then computes the inverse
    }
    fft(f.re, f.im);
    for (let j = 0; j < FRAME; j++) {
      out[i * HOP + j] += (f.re[j] / FRAME) * WINDOW[j];
      norm[i * HOP + j] += WINDOW[j] * WINDOW[j];
    }
  });
  return Float64Array.from(x, (_, i) => out[i + FRAME] / Math.max(1e-6, norm[i + FRAME]));
}

/** Like cuts(), with the recording's rain taken out of each excerpt (thunder rolls and strikes). */
const rainlessCuts = (/** @type {string} */ name, /** @type {string} */ id, /** @type {number[][]} */ list, /** @type {number} */ fadeIn, /** @type {number} */ fadeOut) =>
  list.map(([start, seconds], i) => ({
    name: `${name}${i + 1}`,
    make: () => {
      const x = decodeRange(id, start, seconds);
      return x && fades(derain(x, rainProfile(id)), fadeIn, fadeOut, true);
    },
  }));

/** CREDITS.txt for the pack. */
function credits() {
  const lines = ["Realistic Rain: sound credits", "", "The rain, thunder, lightning-strike and thunderstorm sounds are excerpts of recordings supplied by the realm owner:", ""];
  for (const r of Object.values(RECORDINGS)) lines.push(`- ${r.title}, ${r.author}`);
  lines.push("", "The wind and rain-on-the-roof sounds are synthesized (tools/gen-rain/sounds.mjs in nishant/mc-packs).");
  return lines.join("\n") + "\n";
}

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

/** Excerpts of a recording as an event's files: `${name}1`, `${name}2`, ... from each [start, seconds]. */
const cuts = (/** @type {string} */ name, /** @type {string} */ id, /** @type {number[][]} */ list, /** @type {number} */ fadeIn, /** @type {number} */ fadeOut, post = (/** @type {Float64Array | undefined} */ x) => x) =>
  list.map(([start, seconds], i) => ({ name: `${name}${i + 1}`, make: () => post(excerpt(id, start, seconds, fadeIn, fadeOut)) }));

/**
 * Each event: its files, the file loudness to normalize to (as loud as the peaks allow) and the level it should play at
 * in game, which sets the definition volume:
 *   `level`    one copy at full volume: file LUFS + 20·log10(volume).
 *   `layered`  rain only: the loudness of layered() at the definition volume, since the game stacks rain clips: vanilla's
 *              plus 25%.
 * Thunder and the impact land a little under vanilla (-17.3 and -12.6 LUFS). With the rain taken out of them, the
 * impact sits 1.4 dB lower than before so the thunder itself plays at the same level on average. The Rain Extras sounds sit well under the
 * thunder (the thunderstorm bed about 6 dB over the rain), and Rain Extras scales them further. Times are seconds into
 * the recordings (thunder: rolls start 1.5 s before their loudest moment, strikes right on the hit).
 */
const EVENTS = [
  {
    event: "ambient.weather.rain", subtitle: "subtitles.weather.rain", target: -23, ceiling: -1.5, layered: VANILLA_RAIN_LAYERED + 20 * Math.log10(1.25),
    files: cuts("rain", "rain", [30, 95, 160, 225, 290, 355, 420, 485].map((t) => [t, 2.4]), 0.05, 0.15),
  },
  {
    event: "ambient.weather.thunder", subtitle: "subtitles.entity.lightning_bolt.thunder", target: -18, ceiling: -1, level: -19.5,
    files: rainlessCuts("thunder", "thunder", [26.55, 196.45, 274.2, 323.9, 551.3, 585.55].map((t) => [t, 8]), 0.4, 2),
  },
  {
    event: "ambient.weather.lightning.impact", subtitle: "subtitles.entity.generic.explode", target: -15.5, ceiling: -1, level: -18.4,
    files: rainlessCuts("crack", "thunder", [100.3, 169.25, 204.2, 465.6].map((t) => [t, 4.5]), 0.01, 2),
  },
  {
    event: "realm.storm.bed", target: -18, ceiling: -1, level: -33,
    files: cuts("bed", "thunder", [40, 230, 360, 490].map((t) => [t, 20]), 2, 2),
  },
  {
    event: "realm.storm.bed_inside", target: -24, ceiling: -1, level: -40,
    files: cuts("bed_inside", "thunder", [40, 360].map((t) => [t, 20]), 2, 2, muffled),
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
// 0.3-0.7 (impact) and 0.6-1.0 (thunder), so the recordings play at their real pitch. The whole entity entry is included so
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
 * about 21 dB louder than the rain, which leaves the rain inaudible in a clip, so strikes play STRIKE_GAIN quieter here.
 * The rain stack sits at RAIN_AT in every clip, so a level change between versions is heard as one; peaks are limited.
 */
const STRIKE_GAIN = Math.pow(10, -12 / 20);
const RAIN_AT = -27;
const AUDITION = {
  // Realistic Rain on its own: rain, a distant roll, then a close strike (the strike and a roll together).
  rain: { seconds: 26, play: [["ambient.weather.thunder", "thunder3", 7, STRIKE_GAIN], ["ambient.weather.thunder", "thunder1", 16, STRIKE_GAIN], ["ambient.weather.lightning.impact", "crack2", 16, STRIKE_GAIN]] },
  // Rain Extras: a breeze outdoors in rain, then indoors (rain on the roof, muffled wind), then outdoors in a thunderstorm
  // (the storm recording, gusts).
  extras: {
    seconds: 34,
    play: [
      ["realm.storm.wind", "wind1", 0, 0.35], ["realm.storm.wind", "wind2", 8, 0.35],
      ["realm.rain.roof", "roof1", 10, 0.8], ["realm.rain.roof", "roof2", 13, 0.8], ["realm.rain.roof", "roof3", 16, 0.8], ["realm.storm.wind_inside", "wind_inside1", 10, 0.35],
      ["realm.storm.bed", "bed1", 19, 1], ["realm.storm.wind", "wind3", 19, 0.7], ["realm.storm.wind", "wind1", 27, 0.7],
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
      const ogg = join(outDir, `${f.name}.ogg`);
      if (!x) {
        // Cut from a recording that isn't in tools/gen-rain/sources/: keep the committed clip as it is.
        if (!existsSync(ogg)) throw new Error(`${f.name}.ogg needs the recordings in tools/gen-rain/sources/ (see recordings.json)`);
        const raw = execFileSync("ffmpeg", ["-v", "error", "-i", ogg, "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
        const kept = Float64Array.from(new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4));
        const m = summary(ogg);
        if (e.level !== undefined) volumes.set(f.name, toVolume(e.level - m.lufs));
        made.set(f.name, kept);
        rows.push({ file: f.name, seconds: (kept.length / SR).toFixed(2), lufs: m.lufs.toFixed(1), truePeak: m.peak.toFixed(1), limitedDb: "kept", kb: (statSync(ogg).size / 1024).toFixed(1) });
        continue;
      }
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
  writeFileSync(join(pack, "CREDITS.txt"), credits());
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
    const wav = join(tmpDir, `${name}-audition.wav`);
    writeWav(mix, wav);
    const gain = Math.pow(10, (RAIN_AT - summary(wav).lufs) / 20);
    for (const [event, clip, at, g = 1] of /** @type {[string, string, number, number?][]} */ (scene.play)) mixIn(mix, /** @type {Float64Array} */ (made.get(clip)), Math.round(at * SR), vol(event, clip) * g);
    scale(mix, gain);
    fades(mix, 0.5, 1.5);
    const limited = limit(mix, Math.pow(10, -1.5 / 20));
    writeWav(mix, wav);
    const out = join(dir, `${name}.mp3`);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-c:a", "libmp3lame", "-q:a", "4", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", out]);
    console.log(`audition: ${relative(root, out)} (${scene.seconds} s, ${(statSync(out).size / 1024).toFixed(0)} KB, peaks limited ${limited.toFixed(1)} dB)`);
  }
}
