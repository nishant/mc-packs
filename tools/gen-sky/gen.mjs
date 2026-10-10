// Generates the whole Realm Skies resource pack, packs/sky_rp/: the sky particles and fogs the adventure behavior
// packs spawn and push (tornado_bp, rainbow_bp, night_bp, meteor_bp, climate_bp, moon_bp, storm_bp, titles_bp), their
// procedurally drawn textures, the pack icon and the manifest. Nothing in sky_rp is hand-edited.
// Deterministic: hash-based noise only, no Math.random and no timestamps, so the same code always writes the same files.
//
//   node tools/gen-sky/gen.mjs           write them (and remove files in its folders that it no longer makes)
//   node tools/gen-sky/gen.mjs --check   fail if a committed file differs, is missing or is left over
//
// Particle notes (format 1.10.0):
// - Scripts pass numbers with MolangVariableMap.setFloat("variable.size", n). They live on the emitter and every
//   particle expression can read them; an unset one reads 0, so each expression falls back to a default.
// - Billboard `size` is half the width and half the height (a 1x1 block billboard is [0.5, 0.5]).
// - Molang trig works in degrees.
// - Glowing things (rainbow, aurora, stars, meteors, sparks, embers, motes, sparkles) skip
//   particle_appearance_lighting so they stay bright at night; dust, sand, snow, smoke, fog and leaves are lit.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { blank, decode, encode, samePixels } from "../gen-rain/png.mjs";

const root = join(import.meta.dirname, "..", "..");
const pack = join(root, "packs", "sky_rp");
const check = process.argv.includes("--check");

/** @typedef {import("../gen-rain/png.mjs").Image} Image */

// ---------------------------------------------------------------------------
// Small math and drawing helpers
// ---------------------------------------------------------------------------

/** Integer hash -> [0, 1). */
function hash(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp = (/** @type {number} */ v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;
function smooth(/** @type {number} */ e0, /** @type {number} */ e1, /** @type {number} */ v) {
  const t = clamp((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
/** Smooth value noise, period `wrap` cells in x when given (so a texture can tile sideways). */
function noise(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ seed, wrap = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = (/** @type {number} */ v) => (wrap ? ((v % wrap) + wrap) % wrap : v);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(w(xi), yi, seed), b = hash(w(xi + 1), yi, seed), c = hash(w(xi), yi + 1, seed), d = hash(w(xi + 1), yi + 1, seed);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
}
/** Fractal noise in [0, 1). */
function fbm(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ seed, octaves = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * 2 ** o, y * 2 ** o, seed + o * 17) * amp;
    norm += amp;
    amp /= 2;
  }
  return sum / norm;
}
/** @param {Image} img @param {number} x @param {number} y @param {number[]} rgba 0..255 */
function put(img, x, y, rgba) {
  img.data.set(rgba.map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * img.width + x) * 4);
}
/** Alpha-blends rgba (0..255, straight alpha) over the pixel. */
function over(/** @type {Image} */ img, /** @type {number} */ x, /** @type {number} */ y, /** @type {number[]} */ rgba) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4, d = img.data, a = rgba[3] / 255, da = d[o + 3] / 255;
  const oa = a + da * (1 - a);
  if (oa <= 0) return;
  const c = [0, 1, 2].map((i) => (rgba[i] * a + d[o + i] * da * (1 - a)) / oa);
  put(img, x, y, [...c, oa * 255]);
}
/** Adds light (0..255 rgb times strength) to an opaque pixel. */
function add(/** @type {Image} */ img, /** @type {number} */ x, /** @type {number} */ y, /** @type {number[]} */ rgb, /** @type {number} */ k) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4, d = img.data;
  put(img, x, y, [d[o] + rgb[0] * k, d[o + 1] + rgb[1] * k, d[o + 2] + rgb[2] * k, d[o + 3]]);
}
/** HSV (h in degrees) -> rgb 0..255. */
function hsv(/** @type {number} */ h, /** @type {number} */ s, /** @type {number} */ v) {
  const f = (/** @type {number} */ n) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return [f(5), f(3), f(1)];
}

// ---------------------------------------------------------------------------
// Textures (white or gray where the particle tints them; colored where the color is the point)
// ---------------------------------------------------------------------------

/**
 * Rainbow, 256x128: a semicircular arc whose center is the middle of the bottom edge. Red outside, violet inside,
 * with soft inner and outer edges, a faint brightening of the sky inside the bow (as real rainbows have), and both
 * feet fading into the ground haze. Fully transparent pixels keep the band's color so filtering never fringes dark.
 */
function rainbow() {
  const w = 256, h = 128, img = blank(w, h);
  const inner = 0.7, outer = 0.97;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2), dy = (h - y - 0.5) / h;
      const r = Math.hypot(dx, dy);
      const t = clamp((r - inner) / (outer - inner)); // 0 inner (violet) .. 1 outer (red)
      // Hue from violet (275) to red (0), weighted so green and blue get their fair width.
      const rgb = hsv(275 * (1 - t) ** 1.08, 0.78, 1);
      let a = smooth(inner - 0.035, inner + 0.03, r) * (1 - smooth(outer - 0.03, outer + 0.03, r));
      a *= 0.82 + 0.18 * Math.sin(Math.PI * t); // the middle bands a little stronger
      const glow = r < inner ? 0.07 * smooth(0.25, inner, r) : 0; // brighter sky inside the bow
      const feet = smooth(0.0, 0.32, dy); // fade toward the ground
      const alpha = Math.max(a, glow) * feet;
      const col = a >= glow ? rgb : [255, 255, 255];
      put(img, x, y, [...col, alpha * 255]);
    }
  }
  return img;
}

/**
 * Aurora, a flipbook of 8 frames of 32x128 (256x128): a curtain whose lower edge is bright and wavy and whose rays
 * fade upward. The rays and the wave drift a full period over the 8 frames, so the loop is seamless and the curtain
 * seems to ripple. Grayscale: the particle tints it from green to purple with variable.hue. Soft left and right
 * edges so neighboring segments merge.
 */
function aurora() {
  const fw = 32, h = 128, frames = 8, img = blank(fw * frames, h);
  for (let f = 0; f < frames; f++) {
    const p = (f / frames) * 2 * Math.PI;
    for (let x = 0; x < fw; x++) {
      const u = x / fw;
      const edge = 0.8 + 0.03 * Math.sin(2 * Math.PI * u + p) + 0.012 * Math.sin(6 * Math.PI * u - 2 * p);
      const rays = 0.55 + 0.25 * Math.sin(2 * Math.PI * 3 * u + p) + 0.2 * Math.sin(2 * Math.PI * 5 * u - 2 * p + 1.3);
      const side = smooth(0, 0.22, u) * smooth(0, 0.22, 1 - u);
      for (let y = 0; y < h; y++) {
        const v = y / h; // 0 top .. 1 bottom
        const below = v - edge; // > 0 under the lower edge
        const lower = below > 0 ? Math.exp(-((below / 0.035) ** 2)) : 1; // sharp-ish but soft lower edge
        const up = Math.max(0, edge - v);
        const fade = Math.exp(-up / (0.28 + 0.12 * rays)) * (1 - smooth(0.72, 1, up / edge)); // rays reach up, die before the top
        const band = 0.45 * Math.exp(-(((v - edge) / 0.04) ** 2)); // the bright seam along the lower edge
        const a = clamp((fade * (0.35 + 0.65 * rays) + band) * lower * side);
        const shade = 200 + 55 * clamp(band * 2); // brightest at the seam
        put(img, f * fw + x, y, [shade, shade, shade, a * 255]);
      }
    }
  }
  return img;
}

/** A round glow, 32x32, white: a hot core and a soft halo (star trails, embers, moon motes). */
function glow() {
  const n = 32, img = blank(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const a = clamp(Math.exp(-((r / 0.22) ** 2)) + 0.45 * Math.exp(-((r / 0.55) ** 2))) * (1 - smooth(0.85, 1, r));
      put(img, x, y, [255, 255, 255, a * 255]);
    }
  }
  return img;
}

/** Meteor fireball, 32x32, in color: white core, yellow, then an orange flame halo with a ragged rim. */
function meteor() {
  const n = 32, img = blank(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x + 0.5 - n / 2, dy = y + 0.5 - n / 2;
      const ang = Math.atan2(dy, dx);
      const rag = 0.88 + 0.22 * noise((ang / (2 * Math.PI) + 0.5) * 9, 0.5, 31, 9);
      const r = Math.hypot(dx, dy) / (n / 2) / rag;
      const core = Math.exp(-((r / 0.25) ** 2));
      const col = [255, mix(120, 255, smooth(0.15, 0.55, 1 - r)), mix(30, 235, core)];
      const a = clamp(core + 0.85 * Math.exp(-((r / 0.6) ** 2))) * (1 - smooth(0.8, 1, r));
      put(img, x, y, [...col, a * 255]);
    }
  }
  return img;
}

/** A lumpy soft blob, n x n, white (smoke, fog, dust). `edge` is how far the noise eats into the rim. */
function puff(/** @type {number} */ n, /** @type {number} */ seed, /** @type {number} */ edge, /** @type {number} */ ox = 0, /** @type {Image} */ img = blank(n, n)) {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - n / 2) / (n / 2), dy = (y + 0.5 - n / 2) / (n / 2);
      const r = Math.hypot(dx, dy);
      const lump = fbm((x / n) * 4, (y / n) * 4, seed);
      const a = clamp((1 - r * r) * (1 - edge) + (lump - 0.5) * edge * 2) * (1 - smooth(0.85, 1, r));
      const shade = 225 + 30 * lump;
      put(img, ox + x, y, [shade, shade, shade, clamp(a * 1.15) * 255]);
    }
  }
  return img;
}

/** Four 16x16 dust puffs side by side (64x16); the tornado picks one at random. */
function dust() {
  const img = blank(64, 16);
  for (let i = 0; i < 4; i++) puff(16, 60 + i * 7, 0.55, i * 16, img);
  return img;
}

/** A sand grain, 8x8: an irregular speck, white (tinted tan). */
function grain() {
  const n = 8, img = blank(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x + 0.5 - 4, y + 0.5 - 4) / 4;
      const a = r < 0.55 + 0.35 * hash(x, y, 71) ? 1 - 0.3 * r : 0;
      const shade = 215 + 40 * hash(x, y, 72);
      put(img, x, y, [shade, shade, shade, a * 255]);
    }
  }
  return img;
}

/** A snow streak, 32x8: a soft horizontal line, brightest just behind its leading (right) end. */
function streak() {
  const w = 32, h = 8, img = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5 - h / 2) / (h / 2);
      const along = smooth(0, 0.75, u) * (1 - smooth(0.9, 1, u));
      const a = along * Math.exp(-((v / 0.45) ** 2));
      put(img, x, y, [255, 255, 255, a * 255]);
    }
  }
  return img;
}

/** 16x8: a pixel-art leaf (left 8x8) and a clod of dirt (right 8x8), in grays the particles tint. */
function bits() {
  const img = blank(16, 8);
  const leaf = [
    "......##",
    "....####",
    "...##o##",
    "..##o###",
    ".##o####",
    ".#o####.",
    ".o###...",
    "o.......",
  ];
  const clod = [
    "........",
    "..###...",
    ".#####..",
    ".######.",
    "########",
    ".######.",
    "..####..",
    "........",
  ];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const l = leaf[y][x];
      if (l === "#") put(img, x, y, [...Array(3).fill(200 + 55 * hash(x, y, 81)), 255]);
      else if (l === "o") put(img, x, y, [150, 150, 150, 255]); // the stem and middle vein, darker
      if (clod[y][x] === "#") put(img, 8 + x, y, [...Array(3).fill(150 + 105 * hash(x, y, 82)), 255]);
    }
  }
  return img;
}

/** Two electric sparks, 16x16 each (32x16): a bright zigzag with a blue-white glow, in color. */
function spark() {
  const img = blank(32, 16);
  for (let k = 0; k < 2; k++) {
    // A jagged path from left to right, then glow around it.
    const pts = [];
    for (let i = 0; i <= 5; i++) pts.push([1.5 + i * 2.6, 8 + (hash(i, k, 91) - 0.5) * (i === 0 || i === 5 ? 2 : 9)]);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let d = 99;
        for (let i = 0; i < 5; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          const t = clamp(((x + 0.5 - ax) * (bx - ax) + (y + 0.5 - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2));
          d = Math.min(d, Math.hypot(x + 0.5 - (ax + t * (bx - ax)), y + 0.5 - (ay + t * (by - ay))));
        }
        const core = Math.exp(-((d / 0.7) ** 2)), halo = 0.55 * Math.exp(-((d / 2.2) ** 2));
        put(img, k * 16 + x, y, [mix(120, 255, core), mix(190, 255, core), 255, clamp(core + halo) * 255]);
      }
    }
  }
  return img;
}

/** A four-pointed sparkle, 16x16, white. */
function sparkle() {
  const n = 16, img = blank(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = Math.abs(x + 0.5 - n / 2) / (n / 2), dy = Math.abs(y + 0.5 - n / 2) / (n / 2);
      const arms = Math.max(Math.exp(-((dy / 0.09) ** 2)) * (1 - dx), Math.exp(-((dx / 0.09) ** 2)) * (1 - dy));
      const core = Math.exp(-((Math.hypot(dx, dy) / 0.22) ** 2));
      put(img, x, y, [255, 255, 255, clamp(arms * 1.2 + core) * 255]);
    }
  }
  return img;
}

/** 32x16: a small cloud puff (left 16x16, white) and a raindrop (right half, about 6x10 around x 24, blue). */
function cloud() {
  const img = blank(32, 16);
  const lobes = [[5, 9, 4], [9, 7, 5], [12, 9.5, 3.5], [8, 10.5, 4]];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let a = 0;
      for (const [cx, cy, r] of lobes) a = Math.max(a, 1 - smooth(r - 1.2, r + 0.4, Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
      const shade = 255 - 50 * smooth(8, 13, y) - 20 * hash(x, y, 101); // a darker underside
      put(img, x, y, [shade, shade, shade + 6, a * 255]);
    }
  }
  for (let y = 0; y < 16; y++) {
    for (let x = 16; x < 32; x++) {
      const dx = x + 0.5 - 24, dy = y + 0.5 - 8;
      const r = dy > 0 ? Math.hypot(dx, dy * 1.1) : Math.abs(dx) + (-dy) * 0.32; // round bottom, pointed top
      const a = 1 - smooth(1.6, 2.6, r);
      put(img, x, y, [120, 170, 255, a * 255]);
    }
  }
  return img;
}

/**
 * Pack icon, 128x128: a night sky with stars, a green-to-purple aurora curtain, a shooting star and blocky dark hills.
 */
function icon() {
  const n = 128, img = blank(n, n);
  const top = [8, 11, 34], bottom = [24, 40, 82];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) put(img, x, y, [...top.map((c, i) => mix(c, bottom[i], (y / n) ** 1.3)), 255]);
  // Stars.
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(hash(i, 0, 111) * n), y = Math.floor(hash(i, 1, 111) * 96), b = 0.35 + 0.65 * hash(i, 2, 111) ** 2;
    add(img, x, y, [255, 255, 240], b);
    if (b > 0.85) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) add(img, x + ox, y + oy, [200, 210, 255], 0.35);
  }
  // Aurora: rays above a wavy lower edge, green at the seam turning purple higher up.
  for (let x = 0; x < n; x++) {
    const u = x / n;
    const edge = 66 + 9 * Math.sin(u * 7.5 + 0.6) + 4 * Math.sin(u * 19 + 2);
    const rays = 0.55 + 0.25 * Math.sin(u * 40) + 0.2 * Math.sin(u * 71 + 1.3);
    for (let y = 8; y < n; y++) {
      const up = edge - y;
      const a = up >= 0 ? Math.exp(-up / (16 + 14 * rays)) * (0.4 + 0.6 * rays) : Math.exp(-((up / 2.5) ** 2));
      const seam = Math.exp(-((up / 3) ** 2));
      const t = clamp(up / 45);
      const col = [mix(60, 170, t), mix(255, 80, t), mix(150, 255, t)];
      add(img, x, y, col, clamp(a * 0.75 + seam * 0.35));
    }
  }
  // A shooting star in the top left.
  for (let i = 0; i < 26; i++) {
    const x = 14 + i, y = 12 + Math.round(i * 0.45), k = i / 25;
    add(img, x, y, [255, 250, 230], k * k);
    add(img, x, y + 1, [180, 200, 255], k * k * 0.4);
  }
  for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) add(img, 40 + ox, 23 + oy, [255, 255, 255], ox || oy ? 0.5 : 1);
  // Blocky hills in front, on a 4 px grid.
  for (let x = 0; x < n; x += 4) {
    const hgt = 100 + Math.round((6 * Math.sin(x * 0.05 + 1) + 5 * Math.sin(x * 0.13) + 2 * hash(x, 0, 121)) / 4) * 4;
    for (let y = hgt; y < n; y++) {
      const rim = y < hgt + 4 ? 10 : 0; // the aurora lights the hilltops a little
      for (let xx = 0; xx < 4; xx++) put(img, x + xx, y, [8 + rim / 2, 14 + rim, 26 + rim / 2, 255]);
    }
  }
  return img;
}

const TEXTURES = {
  rainbow: rainbow(),
  aurora: aurora(),
  glow: glow(),
  meteor: meteor(),
  smoke: puff(32, 40, 0.45),
  fog: puff(64, 50, 0.25),
  dust: dust(),
  grain: grain(),
  streak: streak(),
  bits: bits(),
  spark: spark(),
  sparkle: sparkle(),
  cloud: cloud(),
};

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

/** Molang: a passed variable, or `fallback` when the script left it at 0. */
const or = (/** @type {string} */ name, /** @type {number} */ fallback) => `(variable.${name} > 0 ? variable.${name} : ${fallback})`;
/** Molang: particle age as a fraction of its lifetime. */
const T = "(variable.particle_age / variable.particle_lifetime)";
/** Molang: 0 -> 1 over `fadeIn` seconds after birth and 1 -> 0 over the last `fadeOut` seconds. */
const fade = (/** @type {number} */ fadeIn, /** @type {number} */ fadeOut) =>
  `Math.clamp(Math.min(variable.particle_age / ${fadeIn}, (variable.particle_lifetime - variable.particle_age) / ${fadeOut}), 0, 1)`;

/**
 * One particle effect file.
 * @param {string} id @param {string} texture realm_sky_<texture> @param {"particles_blend" | "particles_add" | "particles_alpha"} material
 * @param {Record<string, unknown>} components
 */
function effect(id, texture, material, components) {
  return {
    format_version: "1.10.0",
    particle_effect: {
      description: { identifier: id, basic_render_parameters: { material, texture: `textures/particle/realm_sky_${texture}` } },
      components,
    },
  };
}
const once = (/** @type {number | string} */ active = 0) => ({ "minecraft:emitter_lifetime_once": { active_time: active } });
const burst = (/** @type {number | string} */ n) => ({ "minecraft:emitter_rate_instant": { num_particles: n } });
/** UV for the whole texture, or one cell of it. */
function uv(/** @type {string} */ tex, cell = [0, 0], size = /** @type {(number | string)[]} */ ([TEXTURES[/** @type {keyof typeof TEXTURES} */ (tex)].width, TEXTURES[/** @type {keyof typeof TEXTURES} */ (tex)].height])) {
  const t = TEXTURES[/** @type {keyof typeof TEXTURES} */ (tex)];
  return { texture_width: t.width, texture_height: t.height, uv: cell, uv_size: size };
}
/** Rising motes for the blood and harvest moons. */
function motes(/** @type {string} */ id, /** @type {number[]} */ color) {
  return effect(id, "glow", "particles_add", {
    ...burst(6),
    ...once(),
    "minecraft:emitter_shape_box": { half_dimensions: [4, 1, 4], offset: [0, 0.5, 0] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(4, 6.5)" },
    "minecraft:particle_motion_dynamic": {
      // Drift up slowly and sway; the drag keeps the speed near acceleration / drag (about 0.3 blocks/s).
      linear_acceleration: [
        "Math.sin(variable.particle_age * 70 + variable.particle_random_1 * 360) * 0.4",
        0.45,
        "Math.cos(variable.particle_age * 60 + variable.particle_random_2 * 360) * 0.4",
      ],
      linear_drag_coefficient: 1.5,
    },
    "minecraft:particle_appearance_billboard": {
      size: [
        "(0.07 + variable.particle_random_3 * 0.06) * (0.8 + 0.2 * Math.sin(variable.particle_age * 240))",
        "(0.07 + variable.particle_random_3 * 0.06) * (0.8 + 0.2 * Math.sin(variable.particle_age * 240))",
      ],
      facing_camera_mode: "lookat_xyz",
      uv: uv("glow"),
    },
    "minecraft:particle_appearance_tinting": { color: [...color, `${fade(1, 1.5)} * 0.9`] },
  });
}

const PARTICLES = {
  // One big rainbow. The emitter point is the middle of the arc's base: the billboard is lifted by half its height.
  sky_rainbow: effect("realm:sky_rainbow", "rainbow", "particles_blend", {
    ...burst(1),
    ...once(),
    "minecraft:emitter_shape_point": { offset: [0, `${or("size", 60)} / 4`, 0] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: or("life", 30) },
    "minecraft:particle_appearance_billboard": {
      size: [`${or("size", 60)} / 2`, `${or("size", 60)} / 4`],
      facing_camera_mode: "rotate_y",
      uv: uv("rainbow"),
    },
    // Fades in over 1 s and out over 1 s; at most 55% opaque, so the sky shows through.
    "minecraft:particle_appearance_tinting": { color: [1, 1, 1, `${fade(1, 1)} * 0.55`] },
  }),

  // One segment of an aurora curtain: upright, rippling (an 8-frame flipbook), additive, tinted green to purple.
  sky_aurora: effect("realm:sky_aurora", "aurora", "particles_add", {
    ...burst(1),
    ...once(),
    "minecraft:emitter_shape_point": {},
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: or("life", 20) },
    "minecraft:particle_appearance_billboard": {
      // 0.8 times as wide as tall, so segments placed about 0.6 x size apart overlap at their soft edges and the
      // curtain has no gaps; the width breathes a little so a row of segments doesn't look stamped.
      size: [
        `${or("size", 40)} * 0.4 * (1 + 0.08 * Math.sin(variable.particle_age * 40 + variable.particle_random_1 * 360))`,
        `${or("size", 40)} / 2`,
      ],
      facing_camera_mode: "rotate_y",
      uv: {
        texture_width: 256,
        texture_height: 128,
        flipbook: { base_UV: [0, 0], size_UV: [32, 128], step_UV: [32, 0], frames_per_second: 5, max_frame: 8, loop: true },
      },
    },
    "minecraft:particle_appearance_tinting": {
      color: [
        "0.25 + 0.5 * Math.clamp(variable.hue, 0, 1)",
        "1 - 0.65 * Math.clamp(variable.hue, 0, 1)",
        "0.55 + 0.45 * Math.clamp(variable.hue, 0, 1)",
        `${fade(2, 2)} * (0.75 + 0.15 * Math.sin(variable.particle_age * 25 + variable.particle_random_2 * 360))`,
      ],
    },
  }),

  // A shooting star: the emitter point itself flies along (dx, dy, dz) and leaves short-lived glows behind, so the
  // newest glow is the bright head and the older ones a thinning tail.
  sky_star: effect("realm:sky_star", "glow", "particles_add", {
    "minecraft:emitter_rate_steady": { spawn_rate: 90, max_particles: 80 },
    ...once(or("life", 1.2)),
    "minecraft:emitter_shape_point": {
      offset: ["variable.dx * variable.emitter_age", "variable.dy * variable.emitter_age", "variable.dz * variable.emitter_age"],
    },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: 0.45 },
    "minecraft:particle_appearance_billboard": {
      size: [`0.3 * (1 - ${T})`, `0.3 * (1 - ${T})`],
      facing_camera_mode: "lookat_xyz",
      uv: uv("glow"),
    },
    "minecraft:particle_appearance_tinting": {
      color: {
        interpolant: T,
        gradient: { "0.0": [1, 1, 1, 1], "0.3": [0.85, 0.9, 1, 0.8], "1.0": [0.5, 0.6, 1, 0] },
      },
    },
  }),

  // A meteor: like the shooting star, but a big fireball head and a long fiery trail whose embers drift and cool
  // from white through orange to dark red. variable.size scales the fireball (1 when unset), so a stand-in drawn
  // closer than the real one can be drawn smaller.
  sky_meteor: effect("realm:sky_meteor", "meteor", "particles_add", {
    "minecraft:emitter_rate_steady": { spawn_rate: 70, max_particles: 160 },
    ...once(or("life", 3)),
    "minecraft:emitter_shape_point": {
      offset: ["variable.dx * variable.emitter_age", "variable.dy * variable.emitter_age", "variable.dz * variable.emitter_age"],
      direction: ["Math.random(-1, 1)", "Math.random(-1, 1)", "Math.random(-1, 1)"],
    },
    "minecraft:particle_initial_speed": "Math.random(0.3, 1.5)",
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(0.9, 1.7)" },
    "minecraft:particle_motion_dynamic": { linear_acceleration: [0, 0.6, 0], linear_drag_coefficient: 1.2 },
    "minecraft:particle_initial_spin": { rotation: "Math.random(0, 360)", rotation_rate: "Math.random(-90, 90)" },
    "minecraft:particle_appearance_billboard": {
      size: [
        `(1.5 - 1.15 * Math.sqrt(${T})) * (0.85 + 0.3 * variable.particle_random_1) * ${or("size", 1)}`,
        `(1.5 - 1.15 * Math.sqrt(${T})) * (0.85 + 0.3 * variable.particle_random_1) * ${or("size", 1)}`,
      ],
      facing_camera_mode: "lookat_xyz",
      uv: uv("meteor"),
    },
    "minecraft:particle_appearance_tinting": {
      color: {
        interpolant: T,
        gradient: {
          "0.0": [1, 1, 0.95, 1],
          "0.12": [1, 0.85, 0.45, 0.95],
          "0.4": [1, 0.45, 0.12, 0.7],
          "0.75": [0.55, 0.12, 0.05, 0.35],
          "1.0": [0.2, 0.04, 0.02, 0],
        },
      },
    },
  }),

  // Dark smoke rising from a meteor crater: big lit puffs that grow, turn and thin out.
  sky_meteor_smoke: effect("realm:sky_meteor_smoke", "smoke", "particles_blend", {
    ...burst(8),
    ...once(),
    "minecraft:emitter_shape_disc": { plane_normal: "y", radius: 1.5, direction: "outwards" },
    "minecraft:particle_initial_speed": "Math.random(0.2, 0.6)",
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(3.5, 5.5)" },
    // Per-particle rise from particle_random_2 (Math.random here would be rolled again every frame and jitter).
    "minecraft:particle_motion_dynamic": { linear_acceleration: [0.15, "0.9 + variable.particle_random_2 * 0.5", 0.05], linear_drag_coefficient: 0.6 },
    "minecraft:particle_initial_spin": { rotation: "Math.random(0, 360)", rotation_rate: "Math.random(-25, 25)" },
    "minecraft:particle_appearance_billboard": {
      size: [`(0.6 + 0.3 * variable.particle_random_1) * (1 + 1.6 * ${T})`, `(0.6 + 0.3 * variable.particle_random_1) * (1 + 1.6 * ${T})`],
      facing_camera_mode: "lookat_xyz",
      uv: uv("smoke"),
    },
    "minecraft:particle_appearance_lighting": {},
    "minecraft:particle_appearance_tinting": {
      color: {
        interpolant: T,
        gradient: { "0.0": [0.18, 0.16, 0.15, 0], "0.12": [0.2, 0.18, 0.17, 0.8], "0.6": [0.3, 0.29, 0.28, 0.5], "1.0": [0.4, 0.4, 0.4, 0] },
      },
    },
  }),

  // A gust of sand: ~20 grains around the point, carried by the wind (wx, wz in blocks/s) with a little swirl.
  sky_sand: effect("realm:sky_sand", "grain", "particles_blend", {
    ...burst(20),
    ...once(),
    "minecraft:emitter_shape_box": { half_dimensions: [4, 1.5, 4] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(1.2, 2.2)" },
    "minecraft:particle_motion_dynamic": {
      // Speed settles at acceleration / drag = the wind, plus a swirl.
      linear_acceleration: [
        "variable.wx * 3 + Math.sin(variable.particle_age * 300 + variable.particle_random_1 * 360) * 2",
        "Math.sin(variable.particle_age * 220 + variable.particle_random_2 * 360) * 1.5 - 0.6",
        "variable.wz * 3 + Math.cos(variable.particle_age * 280 + variable.particle_random_3 * 360) * 2",
      ],
      linear_drag_coefficient: 3,
    },
    "minecraft:particle_motion_collision": { collision_radius: 0.03, collision_drag: 4, coefficient_of_restitution: 0.2 },
    "minecraft:particle_appearance_billboard": {
      size: ["0.035 + variable.particle_random_1 * 0.03", "0.035 + variable.particle_random_1 * 0.03"],
      facing_camera_mode: "lookat_xyz",
      uv: uv("grain"),
    },
    "minecraft:particle_appearance_lighting": {},
    "minecraft:particle_appearance_tinting": {
      color: ["0.86 + 0.08 * variable.particle_random_2", "0.72 + 0.08 * variable.particle_random_2", 0.5, fade(0.15, 0.4)],
    },
  }),

  // A gust of blizzard snow: ~20 streaks, stretched along their motion, driven by the wind and falling.
  sky_snow: effect("realm:sky_snow", "streak", "particles_blend", {
    ...burst(20),
    ...once(),
    "minecraft:emitter_shape_box": { half_dimensions: [4, 2, 4] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(0.9, 1.6)" },
    "minecraft:particle_motion_dynamic": {
      linear_acceleration: [
        "variable.wx * 4 + Math.sin(variable.particle_age * 260 + variable.particle_random_1 * 360) * 3",
        "-10 + Math.sin(variable.particle_age * 200 + variable.particle_random_2 * 360) * 2",
        "variable.wz * 4 + Math.cos(variable.particle_age * 240 + variable.particle_random_3 * 360) * 3",
      ],
      linear_drag_coefficient: 4,
    },
    "minecraft:particle_motion_collision": { collision_radius: 0.05, expire_on_contact: true },
    "minecraft:particle_appearance_billboard": {
      // Long side (x) along the motion: lookat_direction points the billboard's x axis along the velocity.
      size: ["0.22 + variable.particle_random_1 * 0.12", 0.035],
      facing_camera_mode: "lookat_direction",
      uv: uv("streak"),
    },
    "minecraft:particle_appearance_lighting": {},
    "minecraft:particle_appearance_tinting": { color: [0.95, 0.97, 1, `${fade(0.1, 0.3)} * 0.85`] },
  }),

  // A low fog bank: 4 big pale puffs that hug the ground and drift.
  sky_fogbank: effect("realm:sky_fogbank", "fog", "particles_blend", {
    ...burst(4),
    ...once(),
    "minecraft:emitter_shape_disc": { plane_normal: "y", radius: 5, direction: "outwards", offset: [0, 1, 0] },
    "minecraft:particle_initial_speed": "Math.random(0.05, 0.2)",
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(9, 13)" },
    "minecraft:particle_motion_dynamic": { linear_acceleration: [0.06, 0, 0.03], linear_drag_coefficient: 0.3 },
    "minecraft:particle_appearance_billboard": {
      size: [`(2.6 + variable.particle_random_1 * 1.4) * (1 + 0.3 * ${T})`, `(1.3 + variable.particle_random_1 * 0.5) * (1 + 0.3 * ${T})`],
      facing_camera_mode: "rotate_y",
      uv: uv("fog"),
    },
    "minecraft:particle_appearance_lighting": {},
    "minecraft:particle_appearance_tinting": { color: [0.86, 0.88, 0.9, `${fade(2.5, 3)} * 0.42`] },
  }),

  // One ring of a tornado: dust circling the point at variable.radius, spinning at variable.spin rad/s and climbing.
  // Positions are set directly (parametric), so the ring turns around the emitter point.
  sky_tornado: effect("realm:sky_tornado", "dust", "particles_blend", {
    ...burst(`Math.clamp(${or("radius", 2)} * 5, 8, 40)`),
    ...once(),
    "minecraft:emitter_shape_point": {},
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(0.9, 1.4)" },
    "minecraft:particle_motion_parametric": {
      relative_position: [
        `Math.cos(variable.particle_random_1 * 360 + variable.particle_age * ${or("spin", 4)} * 57.2958) * ${or("radius", 2)} * (0.9 + 0.2 * variable.particle_random_2)`,
        "variable.particle_age * (0.6 + variable.particle_random_3 * 0.8) + (variable.particle_random_2 - 0.5) * 0.8",
        `Math.sin(variable.particle_random_1 * 360 + variable.particle_age * ${or("spin", 4)} * 57.2958) * ${or("radius", 2)} * (0.9 + 0.2 * variable.particle_random_2)`,
      ],
    },
    "minecraft:particle_initial_spin": { rotation: "Math.random(0, 360)", rotation_rate: "Math.random(-120, 120)" },
    "minecraft:particle_appearance_billboard": {
      size: [`(0.35 + variable.particle_random_3 * 0.4) * (1 + 0.5 * ${T})`, `(0.35 + variable.particle_random_3 * 0.4) * (1 + 0.5 * ${T})`],
      facing_camera_mode: "lookat_xyz",
      uv: uv("dust", ["Math.floor(variable.particle_random_4 * 4) * 16", 0], [16, 16]),
    },
    "minecraft:particle_appearance_lighting": {},
    "minecraft:particle_appearance_tinting": {
      color: [
        "0.45 + 0.12 * variable.particle_random_2",
        "0.42 + 0.1 * variable.particle_random_2",
        "0.38 + 0.08 * variable.particle_random_2",
        `${fade(0.2, 0.4)} * 0.75`,
      ],
    },
  }),

  // Debris flung out of a tornado: a few dark leaves and clods thrown outward and up, tumbling, then falling.
  sky_debris: effect("realm:sky_debris", "bits", "particles_alpha", {
    ...burst(5),
    ...once(),
    "minecraft:emitter_shape_disc": { plane_normal: "y", radius: or("radius", 2), direction: "outwards", surface_only: true },
    "minecraft:particle_initial_speed": "Math.random(3, 7)",
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(1.5, 2.5)" },
    "minecraft:particle_motion_dynamic": {
      linear_acceleration: [0, "variable.particle_age < 0.35 ? 22 : -14", 0],
      linear_drag_coefficient: 0.6,
    },
    "minecraft:particle_motion_collision": { collision_radius: 0.08, collision_drag: 6, coefficient_of_restitution: 0.2 },
    "minecraft:particle_initial_spin": { rotation: "Math.random(0, 360)", rotation_rate: "Math.random(-500, 500)" },
    "minecraft:particle_appearance_billboard": {
      size: ["0.1 + variable.particle_random_2 * 0.08", "0.1 + variable.particle_random_2 * 0.08"],
      facing_camera_mode: "lookat_xyz",
      uv: uv("bits", ["variable.particle_random_3 < 0.5 ? 0 : 8", 0], [8, 8]),
    },
    "minecraft:particle_appearance_lighting": {},
    "minecraft:particle_appearance_tinting": {
      color: ["variable.particle_random_3 < 0.5 ? 0.3 : 0.38", "variable.particle_random_3 < 0.5 ? 0.38 : 0.28", 0.18, fade(0.05, 0.4)],
    },
  }),

  sky_blood: motes("realm:sky_blood", [1, 0.18, 0.12]),
  sky_harvest: motes("realm:sky_harvest", [1, 0.78, 0.3]),

  // A short blue electric spark: a few zigzags that flicker and vanish in a quarter second.
  sky_spark: effect("realm:sky_spark", "spark", "particles_add", {
    ...burst(4),
    ...once(),
    "minecraft:emitter_shape_sphere": { radius: 0.3, direction: "outwards" },
    "minecraft:particle_initial_speed": "Math.random(1, 3)",
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(0.15, 0.3)" },
    "minecraft:particle_motion_dynamic": { linear_drag_coefficient: 6 },
    "minecraft:particle_initial_spin": { rotation: "Math.random(0, 360)" },
    "minecraft:particle_appearance_billboard": {
      size: ["0.2 + variable.particle_random_1 * 0.15", "0.2 + variable.particle_random_1 * 0.15"],
      facing_camera_mode: "lookat_xyz",
      uv: uv("spark", ["variable.particle_random_2 < 0.5 ? 0 : 16", 0], [16, 16]),
    },
    "minecraft:particle_appearance_tinting": {
      // Flickers on and off as it dies.
      color: [0.75, 0.88, 1, `(Math.sin(variable.particle_age * 3000) > -0.3 ? 1 : 0.25) * (1 - ${T})`],
    },
  }),

  // Trail: a small gray cloud puff, and about one in three particles is a raindrop falling from it.
  trail_cloud: effect("realm:trail_cloud", "cloud", "particles_blend", {
    ...burst(3),
    ...once(),
    "minecraft:emitter_shape_sphere": { radius: 0.15, offset: [0, 0.1, 0] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: "variable.particle_random_1 < 0.34 ? 0.7 : Math.random(0.9, 1.3)" },
    "minecraft:particle_motion_dynamic": {
      linear_acceleration: [0, "variable.particle_random_1 < 0.34 ? (variable.particle_age < 0.15 ? 0 : -12) : 0.15", 0],
      linear_drag_coefficient: "variable.particle_random_1 < 0.34 ? 0.5 : 2",
    },
    "minecraft:particle_motion_collision": { collision_radius: 0.03, expire_on_contact: true },
    "minecraft:particle_appearance_billboard": {
      size: [
        `variable.particle_random_1 < 0.34 ? 0.045 : (0.22 + variable.particle_random_2 * 0.1) * (1 + 0.3 * ${T})`,
        `variable.particle_random_1 < 0.34 ? 0.09 : (0.22 + variable.particle_random_2 * 0.1) * (1 + 0.3 * ${T})`,
      ],
      facing_camera_mode: "lookat_xyz",
      // The drop's cell is cropped to the 8x16 around it, so the drop fills its 1:2 billboard.
      uv: uv("cloud", ["variable.particle_random_1 < 0.34 ? 20 : 0", 0], ["variable.particle_random_1 < 0.34 ? 8 : 16", 16]),
    },
    "minecraft:particle_appearance_lighting": {},
    "minecraft:particle_appearance_tinting": {
      color: [
        "variable.particle_random_1 < 0.34 ? 1 : 0.68",
        "variable.particle_random_1 < 0.34 ? 1 : 0.7",
        "variable.particle_random_1 < 0.34 ? 1 : 0.74",
        `${fade(0.1, 0.35)} * 0.9`,
      ],
    },
  }),

  // Trail: two leaves that flutter down, swaying and turning.
  trail_leaves: effect("realm:trail_leaves", "bits", "particles_alpha", {
    ...burst(2),
    ...once(),
    "minecraft:emitter_shape_sphere": { radius: 0.3, offset: [0, 0.4, 0] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(1.4, 2)" },
    "minecraft:particle_motion_dynamic": {
      linear_acceleration: [
        "Math.sin(variable.particle_age * 300 + variable.particle_random_1 * 360) * 3",
        -1.6,
        "Math.cos(variable.particle_age * 260 + variable.particle_random_2 * 360) * 2",
      ],
      linear_drag_coefficient: 2.2,
    },
    "minecraft:particle_motion_collision": { collision_radius: 0.05, collision_drag: 8 },
    "minecraft:particle_initial_spin": { rotation: "Math.random(0, 360)", rotation_rate: "Math.random(-160, 160)" },
    "minecraft:particle_appearance_billboard": {
      size: [0.09, 0.09],
      facing_camera_mode: "lookat_xyz",
      uv: uv("bits", [0, 0], [8, 8]),
    },
    "minecraft:particle_appearance_lighting": {},
    "minecraft:particle_appearance_tinting": {
      // Green, or now and then autumn orange.
      color: [
        "variable.particle_random_3 < 0.7 ? 0.42 : 0.95",
        "variable.particle_random_3 < 0.7 ? 0.72 : 0.58",
        "variable.particle_random_3 < 0.7 ? 0.26 : 0.2",
        fade(0.1, 0.4),
      ],
    },
  }),

  // Trail: two embers that float up, wobble and cool from yellow to red.
  trail_ember: effect("realm:trail_ember", "glow", "particles_add", {
    ...burst(2),
    ...once(),
    "minecraft:emitter_shape_sphere": { radius: 0.2, offset: [0, 0.2, 0] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(0.8, 1.3)" },
    "minecraft:particle_motion_dynamic": {
      linear_acceleration: [
        "Math.sin(variable.particle_age * 500 + variable.particle_random_1 * 360) * 1.5",
        2.2,
        "Math.cos(variable.particle_age * 450 + variable.particle_random_2 * 360) * 1.5",
      ],
      linear_drag_coefficient: 2,
    },
    "minecraft:particle_appearance_billboard": {
      size: [`0.07 * (1 - 0.6 * ${T})`, `0.07 * (1 - 0.6 * ${T})`],
      facing_camera_mode: "lookat_xyz",
      uv: uv("glow"),
    },
    "minecraft:particle_appearance_tinting": {
      color: { interpolant: T, gradient: { "0.0": [1, 0.92, 0.5, 1], "0.5": [1, 0.5, 0.15, 0.9], "1.0": [0.7, 0.15, 0.05, 0] } },
    },
  }),

  // Trail: three white sparkles that twinkle in place.
  trail_sparkle: effect("realm:trail_sparkle", "sparkle", "particles_add", {
    ...burst(3),
    ...once(),
    "minecraft:emitter_shape_sphere": { radius: 0.35, offset: [0, 0.5, 0] },
    "minecraft:particle_initial_speed": 0,
    "minecraft:particle_lifetime_expression": { max_lifetime: "Math.random(0.5, 0.9)" },
    "minecraft:particle_motion_dynamic": { linear_acceleration: [0, 0.2, 0], linear_drag_coefficient: 2 },
    "minecraft:particle_appearance_billboard": {
      // Grows, peaks, shrinks: a twinkle.
      size: [`0.13 * Math.sin(${T} * 180)`, `0.13 * Math.sin(${T} * 180)`],
      facing_camera_mode: "lookat_xyz",
      uv: uv("sparkle"),
    },
    "minecraft:particle_appearance_tinting": { color: [1, 1, 1, 1] },
  }),
};

// ---------------------------------------------------------------------------
// Fogs (pushed per player by the behavior packs with /fog). Each sets the air fog and the weather fog, so it
// looks the same whether or not it rains.
// ---------------------------------------------------------------------------

/** @typedef {{ start: number, end: number, color: string, type: "fixed" | "render" }} Fog */
const FOGS = /** @type {Record<string, { id: string, air: Fog, weather: Fog }>} */ ({
  // Blowing sand: a tan wall from 6 to 20 blocks (a little closer in rain).
  sky_sandstorm: { id: "realm:sky_sandstorm", air: { start: 6, end: 20, color: "#C9A46E", type: "fixed" }, weather: { start: 5, end: 17, color: "#B3946A", type: "fixed" } },
  // A white-out: 4 to 16 blocks of cold white.
  sky_blizzard: { id: "realm:sky_blizzard", air: { start: 4, end: 16, color: "#E4EAF0", type: "fixed" }, weather: { start: 4, end: 14, color: "#DCE3EA", type: "fixed" } },
  // A fog bank: pale and close, but you can still see the nearest hills.
  sky_fogbank: { id: "realm:sky_fogbank", air: { start: 0.04, end: 0.35, color: "#C8CFD6", type: "render" }, weather: { start: 0.03, end: 0.3, color: "#AEB6BF", type: "render" } },
  // Blood moon: a dark red tint on the distance.
  sky_blood_moon: { id: "realm:sky_blood_moon", air: { start: 0.2, end: 0.85, color: "#7A1612", type: "render" }, weather: { start: 0.15, end: 0.6, color: "#5E1410", type: "render" } },
  // Harvest moon: a soft gold glow on the distance.
  sky_harvest_moon: { id: "realm:sky_harvest_moon", air: { start: 0.3, end: 0.95, color: "#C99A45", type: "render" }, weather: { start: 0.18, end: 0.65, color: "#9C7B45", type: "render" } },
});

function fogFile(/** @type {{ id: string, air: Fog, weather: Fog }} */ f) {
  const d = (/** @type {Fog} */ x) => ({ fog_start: x.start, fog_end: x.end, fog_color: x.color, render_distance_type: x.type });
  return {
    format_version: "1.16.100",
    "minecraft:fog_settings": { description: { identifier: f.id }, distance: { air: d(f.air), weather: d(f.weather) } },
  };
}

const MANIFEST = {
  format_version: 2,
  header: {
    name: "Realm Skies",
    description: "Rainbows, auroras, shooting stars, meteors, tornadoes, sandstorms, blizzards, fog banks and moon glows for the realm's sky packs. Put it at the top of Resource Packs.",
    uuid: "c9dba129-e60f-4f08-919b-0d4901bea43a",
    version: [1, 0, 1],
    min_engine_version: [1, 21, 100],
  },
  modules: [{ type: "resources", uuid: "dfab3445-c4b0-42a7-9185-a93ecb664518", version: [1, 0, 1] }],
};

// ---------------------------------------------------------------------------
// Sanity checks, then write or compare
// ---------------------------------------------------------------------------

/** @type {Map<string, string | Image>} */
const outputs = new Map();
outputs.set("manifest.json", JSON.stringify(MANIFEST, null, 2) + "\n");
outputs.set("pack_icon.png", icon());
for (const [name, img] of Object.entries(TEXTURES)) outputs.set(`textures/particle/realm_sky_${name}.png`, img);
for (const [name, p] of Object.entries(PARTICLES)) outputs.set(`particles/${name}.json`, JSON.stringify(p, null, 2) + "\n");
for (const [name, f] of Object.entries(FOGS)) outputs.set(`fogs/${name}.json`, JSON.stringify(fogFile(f), null, 2) + "\n");

const problems = [];
for (const [name, p] of Object.entries(PARTICLES)) {
  const tex = p.particle_effect.description.basic_render_parameters.texture;
  if (!outputs.has(`${tex}.png`)) problems.push(`${name}: texture ${tex} is not generated`);
}
const used = new Set(Object.values(PARTICLES).map((p) => p.particle_effect.description.basic_render_parameters.texture));
for (const name of Object.keys(TEXTURES)) if (!used.has(`textures/particle/realm_sky_${name}`)) problems.push(`texture ${name} is not used by any particle`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

/** Every file now in the generated folders, relative to the pack. */
function existing() {
  const out = [];
  for (const dir of ["particles", "fogs", "textures/particle"]) {
    const abs = join(pack, dir);
    if (existsSync(abs)) for (const f of readdirSync(abs)) out.push(`${dir}/${f}`);
  }
  return out;
}

if (check) {
  const stale = [];
  for (const [rel, want] of outputs) {
    const file = join(pack, rel);
    if (!existsSync(file)) stale.push(`${rel} (missing)`);
    else if (typeof want === "string" ? readFileSync(file, "utf8") !== want : !samePixels(decode(readFileSync(file)), want)) stale.push(rel);
  }
  for (const rel of existing()) if (!outputs.has(rel)) stale.push(`${rel} (not generated)`);
  if (stale.length) {
    console.error(`sky_rp out of date: ${stale.join(", ")} (run npm run gen:sky)`);
    process.exit(1);
  }
  console.log(`sky_rp matches tools/gen-sky/gen.mjs (${outputs.size} files).`);
} else {
  for (const rel of existing()) {
    if (!outputs.has(rel)) {
      rmSync(join(pack, rel));
      console.log(`removed packs/sky_rp/${rel}`);
    }
  }
  for (const [rel, data] of outputs) {
    const file = join(pack, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof data === "string" ? data : encode(data));
  }
  console.log(`wrote ${outputs.size} files to ${relative(root, pack)}/`);
}
