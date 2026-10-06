// Renders pictures of the rain packs for docs/PACKS.md and mc.nish.software (docs/media/rain/), from the pack's own
// files: the vanilla and Realistic Rain weather.png, the fog numbers in fogs.mjs, the splash sizes. A small voxel
// scene (terrain, trees, a lake) seen from one spot at 10-chunk render distance, with rain falling in every block
// column within 10 blocks, textured from the rain strip and scrolling down.
// These are approximations, not in-game screenshots: lighting, sky and Vibrant Visuals are not modeled. How much rain
// shows is calibrated to an in-game screenshot (see STREAKS).
//   rain-vanilla.webp   vanilla rain (animated, 1.5 s loop)
//   rain.webp           Realistic Rain (animated)
//   storm.webp          a thunderstorm with Rain Extras: storm fog, ground mist and drips (animated)
//   weather-atlas.png   the weather texture: vanilla 32x32 at 8x, Realistic Rain 128x128 at 2x
// Deterministic. Needs ffmpeg with libwebp on PATH. Not part of npm run check (the outputs are committed).
//
//   node tools/gen-rain/renders.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { blank, decode, encode } from "./png.mjs";

const root = join(import.meta.dirname, "..", "..");
const outDir = join(root, "docs", "media", "rain");
const VANILLA = decode(readFileSync(join(import.meta.dirname, "vanilla", "weather.png")));
const NEW = decode(readFileSync(join(root, "packs", "rain_rp", "textures", "environment", "weather.png")));

const PW = 960, PH = 540, F = 468, HOR = 184, R = 160, N = 512, RAIN_R = 10;
// Calibration: an in-game screenshot of Realistic Rain 1.0 (Vibrant Visuals, plain rain) has its sky about 2-3% covered
// by rain, with blue on 5-15% of the pixels: Bedrock draws short streaks falling down each column, not a full sheet.
// So each column shows `window`-block stretches of the strip every `every` blocks, at `alpha`, and only up to `above`
// blocks over the eye. Measured the same way in this scene, the 1.0 texture gives 2.7% and 11.8%.
const STREAKS = { window: 1.5, every: 16.5, alpha: 0.4, above: 10 };
const LOOP_S = 1.5, FPS = 20, BASE_SPEED = 7.5;

function hash(/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul((s | 0) + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ s) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, s), b = hash(ix + 1, iz, s), c = hash(ix, iz + 1, s), d = hash(ix + 1, iz + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ s) {
  let t = 0, amp = 1, n = 0;
  for (let o = 0; o < 4; o++) {
    t += amp * vnoise(x, z, s + o * 17);
    n += amp;
    amp *= 0.5;
    x *= 2;
    z *= 2;
  }
  return t / n;
}
const hex = (/** @type {string} */ h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------------------------------------------------------------------------
// The world: rolling grass with a lake, a hill and a few oak trees
// ---------------------------------------------------------------------------
const CX = 256.5, CZ = 80.5, YAW = 0.1;
const FWD = [Math.sin(YAW), Math.cos(YAW)], RIGHT = [Math.cos(YAW), -Math.sin(YAW)];
const Hm = new Float32Array(N * N), Tm = new Uint8Array(N * N), Ground = new Float32Array(N * N);
const GRASS = 0, SAND = 1, STONE = 2, WATER = 3, LEAVES = 4;
function baseH(/** @type {number} */ x, /** @type {number} */ z) {
  let h = 65 + (fbm(x / 46, z / 46, 1) - 0.5) * 12 + (fbm(x / 11, z / 11, 7) - 0.5) * 2.5;
  const far = Math.max(0, z - 165);
  h += Math.min(34, far * 0.3) * (0.55 + fbm(x / 38, z / 38, 3));
  const dl = Math.hypot((x - 262) / 1.6, z - 128);
  if (dl < 30) h -= (30 - dl) * 0.5;
  const dc = Math.hypot(x - 256, z - 78);
  if (dc < 26) h += (26 - dc) * 0.13;
  return Math.floor(h);
}
for (let z = 0; z < N; z++) {
  for (let x = 0; x < N; x++) {
    const k = z * N + x;
    let h = baseH(x, z), t = GRASS;
    if (h < 62) {
      h = 62;
      t = WATER;
    } else if (h <= 63 && Math.hypot((x - 262) / 1.6, z - 128) < 34) t = SAND;
    else if (h >= 86) t = STONE;
    Hm[k] = h;
    Tm[k] = t;
    Ground[k] = h;
  }
}
/** @type {{ x: number, z: number, h0: number }[]} */
const TREES = [];
for (let z = 2; z < N - 2; z++) {
  for (let x = 2; x < N - 2; x++) {
    const k = z * N + x;
    if (Tm[k] !== GRASS || hash(x, z, 99) > 0.022) continue;
    if (Math.hypot(x - CX, z - CZ) < 5) continue;
    const h0 = Hm[k];
    TREES.push({ x, z, h0 });
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && hash(x + dx, z + dz, 5) < 0.7) continue;
        const kk = (z + dz) * N + (x + dx);
        const top = h0 + (Math.abs(dx) <= 1 && Math.abs(dz) <= 1 ? 6 : 5);
        if (top > Hm[kk]) {
          Hm[kk] = top;
          Tm[kk] = LEAVES;
        }
      }
    }
  }
}
const CY = Hm[Math.floor(CZ) * N + Math.floor(CX)] + 1.62;
const TOP = { [GRASS]: hex("#7FA650"), [SAND]: hex("#D9CC98"), [STONE]: hex("#808080"), [WATER]: hex("#3A62B0"), [LEAVES]: hex("#4F8A34") };
const DIRT = hex("#8A6A48");
const sideColor = (/** @type {number} */ t, /** @type {number} */ below) => (t === GRASS ? (below < 0.19 ? TOP[GRASS] : DIRT) : TOP[t]);

function proj(/** @type {number} */ wx, /** @type {number} */ wy, /** @type {number} */ wz) {
  const rx = wx - CX, rz = wz - CZ, d = rx * FWD[0] + rz * FWD[1], lat = rx * RIGHT[0] + rz * RIGHT[1];
  return { d, x: PW / 2 + (lat * F) / d, y: HOR + ((CY - wy) * F) / d };
}

/** @typedef {{ data: Uint8ClampedArray }} Frame */
/** @typedef {{ fog: string, fogStart: number, fogEnd: number, skyTop: string, skyDark: number, worldDark: number, rainLight: number, region: Region, splash: { size: number, color: number[], alpha: number }, mistColor?: string, mistAlpha?: number, drips?: boolean }} Scene */
/** @typedef {{ w: number, h: number, px: Uint8Array }} Region the rain strip of a weather.png */

/** The terrain with distance fog, ray-marched per screen column. @param {Scene} P */
function renderTerrain(P) {
  const depth = new Float32Array(PW * PH).fill(1e9);
  const d = new Uint8ClampedArray(PW * PH * 4);
  const fogC = hex(P.fog), skyTop = hex(P.skyTop);
  for (let y = 0; y < PH; y++) {
    const t = Math.min(1, Math.max(0, y / (HOR + 10))), e = t * t * (3 - 2 * t);
    for (let x = 0; x < PW; x++) {
      const o = (y * PW + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = (skyTop[c] + (fogC[c] - skyTop[c]) * e) * P.skyDark;
      d[o + 3] = 255;
    }
  }
  const fs = P.fogStart * R, fe = P.fogEnd * R;
  for (let i = 0; i < PW; i++) {
    const s = (i + 0.5 - PW / 2) / F;
    const dx = FWD[0] + RIGHT[0] * s, dz = FWD[1] + RIGHT[1] * s, radial = Math.sqrt(1 + s * s);
    let yb = PH, pk = -1, ph = -1e9, pbx = 0, pbz = 0;
    for (let z = 0.3; z < R; z += 0.01 + z * 0.0045) {
      const wx = CX + dx * z, wz = CZ + dz * z, bx = Math.floor(wx), bz = Math.floor(wz);
      if (bx < 0 || bz < 0 || bx >= N || bz >= N) break;
      const k = bz * N + bx, h = Hm[k], t = Tm[k];
      const yi = Math.max(0, Math.ceil(HOR + ((CY - h) * F) / z));
      if (yi < yb) {
        const side = k !== pk && h > ph + 0.01;
        const xface = bx !== pbx, zface = bz !== pbz;
        const shade = side ? (xface && zface ? 0.7 : xface ? 0.62 : 0.82) : 1;
        const dist = z * radial, fog = Math.min(1, Math.max(0, (dist - fs) / (fe - fs)));
        for (let y = yi; y < yb; y++) {
          let base, tex;
          if (side) {
            const wy = CY - ((y - HOR) * z) / F, below = h - wy;
            base = sideColor(t, below);
            const u = xface ? wz - Math.floor(wz) : wx - Math.floor(wx);
            tex = hash(bx * 16 + Math.floor(u * 16), Math.floor(below * 16) + bz * 7, t);
          } else {
            base = TOP[t];
            tex = hash(bx * 16 + Math.floor((wx - bx) * 16), bz * 16 + Math.floor((wz - bz) * 16), t + 11);
          }
          const j = (0.9 + tex * 0.2) * shade * P.worldDark, o = (y * PW + i) * 4;
          for (let c = 0; c < 3; c++) d[o + c] = base[c] * j * (1 - fog) + fogC[c] * P.skyDark * fog;
          depth[y * PW + i] = dist;
        }
        yb = yi;
      }
      if (k !== pk) {
        ph = h;
        pbx = bx;
        pbz = bz;
        pk = k;
      }
    }
  }
  return { d, depth };
}

/** The rain rows of a weather.png. @returns {Region} */
function region(/** @type {import("./png.mjs").Image} */ img, /** @type {number} */ top, /** @type {number} */ rows) {
  const w = img.width, px = new Uint8Array(w * rows * 4);
  px.set(img.data.subarray(top * w * 4, (top + rows) * w * 4));
  return { w, h: rows, px };
}

// ---------------------------------------------------------------------------
// Rain, splashes, mist and drips
// ---------------------------------------------------------------------------
const QUADS = (() => {
  const q = [];
  for (let bz = Math.floor(CZ) - RAIN_R; bz <= Math.floor(CZ) + RAIN_R; bz++) {
    for (let bx = Math.floor(CX) - RAIN_R; bx <= Math.floor(CX) + RAIN_R; bx++) {
      const rx = bx + 0.5 - CX, rz = bz + 0.5 - CZ;
      if (Math.hypot(rx, rz) > RAIN_R) continue;
      const d = rx * FWD[0] + rz * FWD[1], lat = rx * RIGHT[0] + rz * RIGHT[1];
      if (d < 1.8) continue;
      const sx = PW / 2 + (lat * F) / d, hw = (0.5 * F) / d;
      if (sx + hw < 0 || sx - hw > PW) continue;
      q.push({ d, sx, hw, dh: Math.hypot(rx, rz), ground: Hm[bz * N + bx], off: hash(bx, bz, 7), sp: 0.85 + hash(bx, bz, 8) * 0.3, win: Math.floor(hash(bx, bz, 9) * 2) });
    }
  }
  return q.sort((a, b) => b.d - a.d);
})();

/** @param {Uint8ClampedArray} d @param {Float32Array} depth @param {Scene} P */
function drawRain(d, depth, P, /** @type {number} */ t) {
  const reg = P.region, win = reg.w / 2, tpb = win, period = reg.h / tpb;
  const fs = P.fogStart * R, fe = P.fogEnd * R;
  for (const q of QUADS) {
    const travel = Math.round((BASE_SPEED * q.sp * LOOP_S) / period) * period; // whole strips per loop, so it loops
    const scroll = travel * (t / LOOP_S) + q.off * period;
    // The visible stretches fall with the rain and also wrap a whole number of times per loop.
    const every = travel / Math.max(1, Math.round(travel / STREAKS.every)), fall = travel * (t / LOOP_S) - q.off * every;
    const fog = Math.min(1, Math.max(0, (q.d - fs) / (fe - fs)));
    const fade = (1 - fog) * Math.min(1, q.d / 1.6) * ((1 - (q.dh / RAIN_R) ** 2) * 0.5 + 0.5) * P.rainLight * STREAKS.alpha;
    const x0 = Math.max(0, Math.floor(q.sx - q.hw)), x1 = Math.min(PW - 1, Math.ceil(q.sx + q.hw));
    const yBot = Math.min(PH - 1, Math.floor(HOR + ((CY - q.ground) * F) / q.d));
    for (let y = 0; y <= yBot; y++) {
      const wy = CY - ((y - HOR) * q.d) / F;
      if (wy > CY + STREAKS.above || (((wy + fall) % every) + every) % every > STREAKS.window) continue;
      let v = Math.floor(((scroll - wy) * tpb) % reg.h);
      if (v < 0) v += reg.h;
      for (let x = x0; x <= x1; x++) {
        if (depth[y * PW + x] < q.d) continue;
        const uu = Math.floor(((x + 0.5 - (q.sx - q.hw)) / (2 * q.hw)) * win);
        if (uu < 0 || uu >= win) continue;
        const so = (v * reg.w + q.win * win + uu) * 4, a = (reg.px[so + 3] / 255) * fade;
        if (a <= 0) continue;
        const o = (y * PW + x) * 4;
        for (let c = 0; c < 3; c++) d[o + c] = reg.px[so + c] * P.rainLight * a + d[o + c] * (1 - a);
      }
    }
  }
}
function blend(/** @type {Uint8ClampedArray} */ d, /** @type {number} */ x, /** @type {number} */ y, /** @type {number[]} */ col, /** @type {number} */ a) {
  const o = (y * PW + x) * 4;
  for (let c = 0; c < 3; c++) d[o + c] = col[c] * a + d[o + c] * (1 - a);
}
/** @param {Uint8ClampedArray} d @param {Float32Array} depth @param {Scene["splash"]} S */
function drawSplashes(d, depth, S, /** @type {number} */ t) {
  const frame = Math.round(t * 20);
  for (let n = 0; n < 80; n++) {
    const q = QUADS[Math.floor(hash(n, frame, 61) * QUADS.length)];
    if (q.d > 9) continue;
    const sz = Math.max(1, Math.round((S.size * F) / q.d));
    const x = Math.round(q.sx + (hash(n, frame, 62) - 0.5) * 2 * q.hw);
    const y = Math.round(HOR + ((CY - q.ground) * F) / q.d) - Math.round((hash(n, frame, 63) * 0.15 * F) / q.d);
    for (let yy = y - sz; yy < y; yy++) {
      for (let xx = x; xx < x + sz; xx++) {
        if (xx < 0 || yy < 0 || xx >= PW || yy >= PH || depth[yy * PW + xx] < q.d - 0.6) continue;
        blend(d, xx, yy, S.color, S.alpha);
      }
    }
  }
}
// Mist: about 32 soft sprites 3-14 blocks out, hugging the ground and drifting with the wind.
const MIST = Array.from({ length: 32 }, (_, n) => {
  const ang = (hash(n, 1, 71) - 0.5) * 1.6, dist = 3 + hash(n, 2, 72) * 11;
  const wx = CX + FWD[0] * dist * Math.cos(ang) + RIGHT[0] * dist * Math.sin(ang);
  const wz = CZ + FWD[1] * dist * Math.cos(ang) + RIGHT[1] * dist * Math.sin(ang);
  return { wx, wz, size: 1.4 + hash(n, 3, 73) * 1.6, lift: 0.25 + hash(n, 4, 74) * 0.6, phase: hash(n, 5, 75), drift: 0.3 + hash(n, 6, 76) * 0.4 };
});
/** @param {Uint8ClampedArray} d @param {Float32Array} depth @param {Scene} P */
function drawMist(d, depth, P, /** @type {number} */ t) {
  const col = hex(/** @type {string} */ (P.mistColor));
  for (const m of MIST) {
    const life = (m.phase + t / LOOP_S) % 1, alpha = Math.sin(Math.PI * life) * /** @type {number} */ (P.mistAlpha);
    const wx = m.wx + m.drift * (life - 0.5) * 2, g = Ground[Math.floor(m.wz) * N + Math.floor(wx)] || 64;
    const p = proj(wx, g + m.lift, m.wz);
    if (p.d < 1.5) continue;
    const rx = (m.size * F) / p.d, ry = rx * 0.38;
    for (let y = Math.max(0, Math.floor(p.y - ry)); y < Math.min(PH, p.y + ry); y++) {
      for (let x = Math.max(0, Math.floor(p.x - rx)); x < Math.min(PW, p.x + rx); x++) {
        const e = ((x - p.x) / rx) ** 2 + ((y - p.y) / ry) ** 2;
        if (e >= 1 || depth[y * PW + x] < p.d - 0.5) continue;
        blend(d, x, y, col, alpha * (1 - e) * (1 - e));
      }
    }
  }
}
// Drips under the nearest canopies.
const NEAR_TREES = TREES.map((tr) => ({ ...tr, p: proj(tr.x + 0.5, tr.h0, tr.z + 0.5) }))
  .filter((tr) => tr.p.d > 3 && tr.p.d < 16 && tr.p.x > 0 && tr.p.x < PW)
  .sort((a, b) => a.p.d - b.p.d)
  .slice(0, 4);
/** @param {Uint8ClampedArray} d @param {Float32Array} depth */
function drawDrips(d, depth, /** @type {number} */ t) {
  const col = hex("#9DB4E6");
  for (let n = 0; n < 8; n++) {
    const tr = NEAR_TREES[n % NEAR_TREES.length];
    if (!tr) return;
    const ox = (hash(n, 1, 81) - 0.5) * 3, oz = (hash(n, 2, 81) - 0.5) * 3;
    const fall = ((hash(n, 3, 81) + (t / LOOP_S) * 2) % 1) * 3.6; // from the canopy's underside (h0+3.6) to the ground
    const p = proj(tr.x + 0.5 + ox, tr.h0 + 3.6 - fall, tr.z + 0.5 + oz);
    const w = Math.max(1, Math.round((0.05 * F) / p.d)), hgt = Math.max(2, Math.round((0.14 * F) / p.d));
    for (let y = Math.round(p.y - hgt); y < p.y; y++) {
      for (let x = Math.round(p.x); x < p.x + w; x++) {
        if (x < 0 || y < 0 || x >= PW || y >= PH || depth[y * PW + x] < p.d - 0.5) continue;
        blend(d, x, y, col, 0.8);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// The scenes, with each pack's numbers (fogs.mjs, particles/rain_splash.json)
// ---------------------------------------------------------------------------
const VANILLA_RAIN = region(VANILLA, 5, 15);
const NEW_RAIN = region(NEW, 20, 60);
const VANILLA_SPLASH = { size: 0.175 * 0.5, color: hex("#C8D4F0"), alpha: 0.95 };
const NEW_SPLASH = { size: 0.1 * 0.5, color: hex("#A9BCE6"), alpha: 0.7 };
/** @type {Record<string, Scene>} */
const SCENES = {
  "rain-vanilla": { fog: "#666666", fogStart: 0.23, fogEnd: 0.7, skyTop: "#62676E", skyDark: 1, worldDark: 0.74, rainLight: 1, region: VANILLA_RAIN, splash: VANILLA_SPLASH },
  rain: { fog: "#5F6B79", fogStart: 0.15, fogEnd: 0.55, skyTop: "#62676E", skyDark: 1, worldDark: 0.74, rainLight: 1, region: NEW_RAIN, splash: NEW_SPLASH },
  storm: {
    fog: "#4E5763", fogStart: 0.08, fogEnd: 0.35, skyTop: "#62676E", skyDark: 0.8, worldDark: 0.6, rainLight: 0.85, region: NEW_RAIN, splash: NEW_SPLASH,
    mistColor: "#7C8794", mistAlpha: 0.2, drips: true,
  },
};

/** The weather texture side by side: vanilla 32x32 at 8x, Realistic Rain 128x128 at 2x, on a dark checkerboard with a darker divider. */
function atlas() {
  const size = 256, gap = 24, img = blank(size * 2 + gap, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4, inGap = x >= size && x < size + gap;
      const check = ((x >> 4) + (y >> 4)) % 2 ? 0x2b : 0x22;
      const [sx, src, scale] = x < size ? [x, VANILLA, 8] : [x - size - gap, NEW, 2];
      const bg = inGap ? [0x16, 0x19, 0x1d, 255] : [check, check + 4, check + 10, 255];
      if (inGap) {
        img.data.set(bg, o);
        continue;
      }
      const so = (Math.floor(y / scale) * src.width + Math.floor(sx / scale)) * 4, a = src.data[so + 3] / 255;
      img.data.set([0, 1, 2].map((c) => Math.round(src.data[so + c] * a + bg[c] * (1 - a))).concat(255), o);
    }
  }
  return img;
}

mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "rain-renders-"));
try {
  for (const [name, P] of Object.entries(SCENES)) {
    const base = renderTerrain(P);
    const frames = Math.round(LOOP_S * FPS);
    for (let f = 0; f < frames; f++) {
      const t = (f / frames) * LOOP_S;
      const d = Uint8ClampedArray.from(base.d), depth = Float32Array.from(base.depth);
      if (P.mistColor) drawMist(d, depth, P, t);
      drawRain(d, depth, P, t);
      drawSplashes(d, depth, P.splash, t);
      if (P.drips) drawDrips(d, depth, t);
      writeFileSync(join(tmp, `${name}-${String(f).padStart(3, "0")}.png`), encode({ width: PW, height: PH, data: d }));
    }
    const out = join(outDir, `${name}.webp`);
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(tmp, `${name}-%03d.png`), "-c:v", "libwebp_anim", "-quality", "70", "-compression_level", "6", "-loop", "0", "-map_metadata", "-1", out]);
    console.log(`wrote ${relative(root, out)} (${PW}x${PH}, ${frames} frames, ${(statSync(out).size / 1024).toFixed(0)} KB)`);
  }
  const at = join(outDir, "weather-atlas.png");
  writeFileSync(at, encode(atlas()));
  console.log(`wrote ${relative(root, at)} (${(statSync(at).size / 1024).toFixed(0)} KB)`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
