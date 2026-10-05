// Synthesizes the Realistic Rain sounds into packs/rain_rp/sounds/realistic_rain/ (mono Ogg Vorbis, 44.1 kHz):
//   rain1-4     2.6-3.0 s of rain on the ground: a soft hiss, dense patter and the odd heavier drop.
//               Short like vanilla's, because the game starts a new one every few ticks and long clips
//               would stack up voices (CPU, voice stealing on Switch and phones).
//   thunder1-4  distant rolling thunder, about 6.5 s. sounds.json plays thunder at pitch 0.6-1.0, so these
//               are authored about 1.25x higher to land at a natural pitch.
//   crack1-4    close lightning: a sharp crack, crackle and a low boom, about 3 s. The impact plays at pitch
//               0.3-0.7, so these are authored about 2x higher (and come out about 6 s long in game).
// Every file is deterministic (seeded) and normalized with ffmpeg's EBU R128 meter to a loudness target.
// Needs ffmpeg with libvorbis on PATH. Not part of npm run check (the outputs are committed).
//
//   node tools/gen-rain/sounds.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const outDir = join(root, "packs", "rain_rp", "sounds", "realistic_rain");
const SR = 44100;
const TAU = Math.PI * 2;

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

// ---------------------------------------------------------------------------
// DSP helpers (all in place on Float64Array)
// ---------------------------------------------------------------------------

/** RBJ biquad. @param {Float64Array} x @param {"lp"|"hp"|"bp"} type */
function biquad(x, type, freq, q = 0.707) {
  const w = (TAU * freq) / SR, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
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

/** Small Schroeder reverb (4 combs, 2 all-passes), mixed in at `wet`. */
function reverb(/** @type {Float64Array} */ x, wet = 0.3, feedback = 0.78) {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((s) => Math.round(s * SR));
  const sum = new Float64Array(x.length);
  for (const d of combs) {
    const buf = new Float64Array(d);
    for (let i = 0, p = 0; i < x.length; i++, p = (p + 1) % d) {
      const y = buf[p];
      buf[p] = x[i] + y * feedback;
      sum[i] += y / combs.length;
    }
  }
  for (const d of [0.005, 0.0017].map((s) => Math.round(s * SR))) {
    const buf = new Float64Array(d);
    for (let i = 0, p = 0; i < sum.length; i++, p = (p + 1) % d) {
      const b = buf[p], y = -0.7 * sum[i] + b;
      buf[p] = sum[i] + 0.7 * y;
      sum[i] = y;
    }
  }
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 - wet) + sum[i] * wet;
  return x;
}

/** Short fades so overlapping copies blend without clicks. */
function fades(/** @type {Float64Array} */ x, inS, outS) {
  const a = Math.round(inS * SR), b = Math.round(outS * SR);
  for (let i = 0; i < a; i++) x[i] *= i / a;
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= Math.sin((i / b) * (Math.PI / 2));
  return x;
}

/** Look-ahead peak limiter: keeps every sample under `ceiling` with a 2 ms attack and 60 ms release. */
function limit(/** @type {Float64Array} */ x, ceiling) {
  const look = Math.round(0.002 * SR), rel = Math.exp(-1 / (0.06 * SR));
  const need = Float64Array.from(x, (v) => Math.min(1, ceiling / Math.max(1e-9, Math.abs(v))));
  const gain = new Float64Array(x.length);
  let g = 1;
  for (let i = 0; i < x.length; i++) {
    let m = 1;
    for (let j = i; j < Math.min(x.length, i + look); j++) m = Math.min(m, need[j]);
    g = m < g ? m : m + (g - m) * rel;
    gain[i] = g;
  }
  for (let i = 0; i < x.length; i++) x[i] *= gain[i];
  return x;
}

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

function rain(/** @type {number} */ seed, /** @type {number} */ seconds) {
  const rnd = mulberry32(seed), n = Math.round(seconds * SR);
  // Hiss: pink noise without the low rumble and the brightest air, for a darker, cozier rain.
  const hiss = biquad(biquad(pink(rnd, n), "hp", 280), "lp", 6200);
  // Body: a little low-frequency weight from heavy rain on the ground.
  const body = biquad(biquad(brown(rnd, n), "lp", 220), "hp", 70);
  // Patter: many tiny ticks (Poisson, ~1100 per second), band-passed into droplets.
  const patter = new Float64Array(n);
  for (let t = 0; t < n; t += Math.max(1, Math.round((-Math.log(1 - rnd()) / 1100) * SR))) {
    const amp = -Math.log(1 - rnd()) * 0.22, len = Math.round((0.0012 + rnd() * 0.0035) * SR), tau = len / 3;
    for (let k = 0; k < len && t + k < n; k++) patter[t + k] += (rnd() * 2 - 1) * amp * Math.exp(-k / tau);
  }
  biquad(biquad(patter, "hp", 1100), "lp", 7500);
  // Heavier drops: soft resonant plips (~22 per second) that fall slightly in pitch.
  const drops = new Float64Array(n);
  for (let t = 0; t < n; t += Math.max(1, Math.round((-Math.log(1 - rnd()) / 22) * SR))) {
    const f0 = 700 + rnd() * 1900, tau = (0.006 + rnd() * 0.018) * SR, amp = 0.08 + rnd() * 0.22, len = Math.round(tau * 5);
    let ph = 0;
    for (let k = 0; k < len && t + k < n; k++) {
      ph += (TAU * f0 * (1 - 0.25 * (k / len))) / SR;
      drops[t + k] += Math.sin(ph) * amp * Math.exp(-k / tau);
    }
  }
  // Slow swell so consecutive copies don't sound identical.
  const f = 0.25 + rnd() * 0.4, ph = rnd() * TAU;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const swell = 0.88 + 0.12 * Math.sin((TAU * f * i) / SR + ph);
    out[i] = (hiss[i] * 0.6 + body[i] * 0.16 + patter[i] * 0.65 + drops[i] * 0.3) * swell;
  }
  return fades(out, 0.04, 0.25);
}

function thunder(/** @type {number} */ seed, /** @type {number} */ seconds) {
  const rnd = mulberry32(seed), n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  // Several rumbling bursts, each quieter and duller than the last, like thunder rolling across hills.
  let t = 0.02 + rnd() * 0.25;
  for (let k = 0; t < seconds * 0.7; k++) {
    const amp = Math.pow(0.8, k) * (0.6 + rnd() * 0.4);
    const attack = 0.03 + rnd() * 0.12, decay = 0.6 + rnd() * 1.3;
    const cut = 650 + rnd() * 450 - k * 40; // authored ~1.25x high
    const noise = sweepLP(brown(rnd, n), () => Math.max(160, cut));
    // Low-rate flutter makes the roll grumble instead of hiss.
    const flutter = sweepLP(white(rnd, n), () => 9);
    const start = Math.round(t * SR);
    for (let i = start; i < n; i++) {
      const s = (i - start) / SR;
      const env = s < attack ? s / attack : Math.exp(-(s - attack) / decay);
      out[i] += noise[i] * env * amp * (0.55 + 3.5 * Math.abs(flutter[i]));
    }
    t += 0.2 + rnd() * 1.0;
  }
  sweepLP(out, (s) => 1400 - (s / seconds) * 1100); // darker as it rolls away
  biquad(out, "hp", 38);
  reverb(out, 0.35, 0.8);
  return fades(out, 0.02, 0.6);
}

function crack(/** @type {number} */ seed, /** @type {number} */ seconds) {
  const rnd = mulberry32(seed), n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  // The strike: a few milliseconds of bright noise.
  const strike = biquad(white(rnd, Math.round(0.012 * SR)), "hp", 2200);
  for (let i = 0; i < strike.length; i++) out[i] += strike[i] * Math.exp(-i / (0.0025 * SR)) * 1.4;
  // Crackle: sharp clicks thinning out over half a second.
  const crackle = new Float64Array(n);
  for (let s = 0; s < 0.6; ) {
    const rate = 2400 * Math.exp(-s / 0.12) + 60;
    s += -Math.log(1 - rnd()) / rate;
    const i = Math.round(s * SR), amp = (rnd() * 2 - 1) * Math.exp(-s / 0.18);
    for (let k = 0; k < 40 && i + k < n; k++) crackle[i + k] += amp * Math.exp(-k / 8) * (rnd() * 2 - 1);
  }
  biquad(crackle, "hp", 1600);
  // Boom: a falling low sine (authored 2x high: 230 -> 75 Hz) over a body of dark noise.
  const body = sweepLP(brown(rnd, n), (s) => Math.max(180, 900 - s * 700));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const s = i / SR;
    const f = 75 + 155 * Math.exp(-s / 0.25);
    ph += (TAU * f) / SR;
    const boomEnv = (s < 0.006 ? s / 0.006 : 1) * Math.exp(-s / 0.55);
    out[i] += crackle[i] * 0.9 + Math.sin(ph) * boomEnv * 0.55 + body[i] * Math.exp(-s / 1.0) * 1.1;
  }
  biquad(out, "hp", 45);
  reverb(out, 0.28, 0.78);
  return fades(out, 0.0005, 0.5);
}

// ---------------------------------------------------------------------------
// Loudness (ffmpeg ebur128) and encoding
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
  const peak = Number(tail.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(peak)) throw new Error(`no loudness reading for ${file}`);
  return { lufs, peak };
}

const SOUNDS = [
  ...[2.8, 2.6, 3.0, 2.7].map((s, i) => ({ name: `rain${i + 1}`, make: () => rain(1000 + i, s), target: -25, ceiling: -3 })),
  ...[6.4, 6.8, 6.0, 6.6].map((s, i) => ({ name: `thunder${i + 1}`, make: () => thunder(2000 + i, s), target: -17.5, ceiling: -2.5 })),
  ...[3.0, 2.8, 3.2, 3.0].map((s, i) => ({ name: `crack${i + 1}`, make: () => crack(3000 + i, s), target: -13, ceiling: -3 })),
];

mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "gen-rain-"));
const rows = [];
try {
  for (const s of SOUNDS) {
    const x = s.make();
    const wav = join(tmp, `${s.name}.wav`);
    const ceil = Math.pow(10, s.ceiling / 20);
    // Gain to the target, limit peaks, and repeat: limiting lowers the loudness a little each time.
    for (let pass = 0; pass < 4; pass++) {
      writeWav(x, wav);
      const { lufs } = summary(wav);
      const gain = Math.pow(10, (s.target - lufs) / 20);
      if (pass > 0 && Math.abs(s.target - lufs) < 0.2) break;
      for (let i = 0; i < x.length; i++) x[i] *= gain;
      limit(x, ceil);
    }
    writeWav(x, wav);
    const ogg = join(outDir, `${s.name}.ogg`);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-ar", String(SR), "-c:a", "libvorbis", "-q:a", "3", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", ogg]);
    const m = summary(ogg);
    rows.push({ file: relative(root, ogg), seconds: (x.length / SR).toFixed(2), lufs: m.lufs.toFixed(1), truePeak: m.peak.toFixed(1), kb: (statSync(ogg).size / 1024).toFixed(1) });
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.table(rows);
