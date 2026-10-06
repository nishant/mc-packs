// Generates the Realistic Rain textures into packs/rain_rp/:
//   textures/environment/weather.png     the weather atlas at 4× vanilla (128×128): new rain, heavier snowflakes
//   textures/particle/realm_rain_mist.png soft blob for the Rain Extras ground mist (32×32)
//   pack_icon.png                         128×128
// Deterministic: the same code always produces the same pixels.
//
//   node tools/gen-rain/textures.mjs           write them
//   node tools/gen-rain/textures.mjs --check   fail if the committed files' pixels differ
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { blank, decode, encode, samePixels } from "./png.mjs";

const root = join(import.meta.dirname, "..", "..");
const pack = join(root, "packs", "rain_rp");
const check = process.argv.includes("--check");

/** Integer hash → [0, 1). Same function as the mockups, so the streak layout matches what was approved. */
function hash(/** @type {number} */ x, /** @type {number} */ z, /** @type {number} */ s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul((s | 0) + 1, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** @param {import("./png.mjs").Image} img @param {number} x @param {number} y @param {number[]} rgba */
function put(img, x, y, rgba) {
  img.data.set(rgba.map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * img.width + x) * 4);
}

// ---------------------------------------------------------------------------
// weather.png: vanilla is 32×32 with snowflakes in rows 0–2, rain streaks in rows 5–19 (8 lanes of
// 1 px blue streaks) and four 3×3 swatches in rows 20–30. Everything is upscaled 4× nearest-neighbor
// so the swatches stay pixel-identical, then the rain rows (20–79 at 4×) and the snowflakes (0–11 at 4×) are redrawn.
// ---------------------------------------------------------------------------
const SCALE = 4;
const RAIN_TOP = 5 * SCALE, RAIN_ROWS = 15 * SCALE; // rows 20..79
/** Vanilla's streaks: 1 texel wide (4 px here), its blue, its opacity range (0.31–0.96). 13 lanes instead of 8. */
const STREAK = { color: [68, 101, 193], width: SCALE, lanes: 13, alphaTail: 0.4, alphaHead: 0.96 };
/** Coverage × alpha of the rain strip, as a fraction (vanilla: 0.100). Guards against thinning the rain out by accident. */
const INK = { min: 0.17, max: 0.23 };

function weather() {
  const vanilla = decode(readFileSync(join(import.meta.dirname, "vanilla", "weather.png")));
  const size = vanilla.width * SCALE;
  const img = blank(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y >= RAIN_TOP && y < RAIN_TOP + RAIN_ROWS) continue; // redrawn below
      const o = (Math.floor(y / SCALE) * vanilla.width + Math.floor(x / SCALE)) * 4;
      put(img, x, y, [...vanilla.data.subarray(o, o + 4)]);
    }
  }
  // 13 lanes of vanilla-width streaks (vanilla has 8), about 10 px apart with a little jitter. Each lane has
  // one long streak or two shorter ones that fade from a fainter tail (top) to a solid head (bottom),
  // wrapping vertically so the strip tiles without a seam as the game scrolls it. Coverage × alpha comes to
  // about 19% of the strip, nearly twice vanilla's 10%: the same thick blue rain, more of it.
  const pitch = size / STREAK.lanes;
  for (let i = 0; i < STREAK.lanes; i++) {
    const lane = Math.round(1 + i * pitch + (hash(i, 3, 41) - 0.5) * 3);
    const segments = hash(i, 1, 42) < 0.4 ? 2 : 1;
    const dim = 0.85 + hash(i, 2, 43) * 0.15;
    const tint = 0.94 + hash(i, 4, 46) * 0.12;
    const first = Math.floor(hash(i, 0, 45) * RAIN_ROWS);
    for (let s = 0; s < segments; s++) {
      const len = segments === 2 ? 20 + Math.floor(hash(i, s, 44) * 13) : 34 + Math.floor(hash(i, s, 44) * 25);
      const start = first + s * (RAIN_ROWS / 2);
      for (let k = 0; k < len; k++) {
        const t = k / (len - 1); // 0 = tail, 1 = head
        const alpha = (STREAK.alphaTail + (STREAK.alphaHead - STREAK.alphaTail) * Math.pow(t, 1.5)) * dim;
        const y = RAIN_TOP + ((start + k) % RAIN_ROWS);
        for (let w = 0; w < STREAK.width; w++) put(img, lane + w, y, [...STREAK.color.map((c) => c * tint), alpha * 255]);
      }
    }
  }
  let ink = 0;
  for (let y = RAIN_TOP; y < RAIN_TOP + RAIN_ROWS; y++) for (let x = 0; x < size; x++) ink += img.data[(y * size + x) * 4 + 3] / 255;
  ink /= size * RAIN_ROWS;
  if (ink < INK.min || ink > INK.max) throw new Error(`rain ink ${(ink * 100).toFixed(1)}% is outside ${INK.min * 100}–${INK.max * 100}%`);
  snow(vanilla, img);
  return img;
}

// ---------------------------------------------------------------------------
// Snowflakes: vanilla's rows 0–2 hold three kinds of flake in each 12-texel period, each centered in a 3×3 cell 4
// texels apart: an "x" (5 texels), a "+" (5 texels) and a single-texel speck; 8 flakes, as the last period has no
// speck. Each is redrawn inside its own 3×3 footprint (12×12 px at 4×), so wherever the game samples a flake it finds
// a bigger, solider one in the same place: a round core with four arms (the speck becomes a small one), white with a
// cool rim so it stays readable against the pale snow fog. Nothing outside the footprints changes, so no flake bleeds into the rain.
// ---------------------------------------------------------------------------
const SNOW_ROWS = 3;
/** Pure white core, a cool rim (vanilla's snowball-particle tint, #DFE5ED) where the flake thins out. */
const FLAKE = { core: [255, 255, 255], rim: [223, 229, 237], coreAlpha: 1, rimAlpha: 0.82 };
/** Coverage × alpha inside the eight vanilla footprints (vanilla: 32 of 72 texels, 0.44; here 0.56): round, solid flakes instead of vanilla's thin, gappy ones, but still flakes with arms and gaps between them, not blobs. */
const SNOW_INK = { min: 0.52, max: 0.6 };

/** The 3×3 footprints of vanilla's flakes (connected white texels in rows 0–2; a lone speck is centered in one), in texels. */
function footprints(/** @type {import("./png.mjs").Image} */ vanilla) {
  const seen = new Set(), boxes = [];
  const lit = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && x < vanilla.width && y >= 0 && y < SNOW_ROWS && vanilla.data[(y * vanilla.width + x) * 4 + 3] > 0;
  for (let y = 0; y < SNOW_ROWS; y++) {
    for (let x = 0; x < vanilla.width; x++) {
      if (!lit(x, y) || seen.has(`${x},${y}`)) continue;
      const box = { x0: x, y0: y, x1: x, y1: y }, todo = [[x, y]];
      seen.add(`${x},${y}`);
      while (todo.length) {
        const [cx, cy] = /** @type {number[]} */ (todo.pop());
        Object.assign(box, { x0: Math.min(box.x0, cx), y0: Math.min(box.y0, cy), x1: Math.max(box.x1, cx), y1: Math.max(box.y1, cy) });
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (lit(cx + dx, cy + dy) && !seen.has(`${cx + dx},${cy + dy}`)) {
              seen.add(`${cx + dx},${cy + dy}`);
              todo.push([cx + dx, cy + dy]);
            }
          }
        }
      }
      // The "x" has its arms on the diagonals, the "+" on the axes: keep the same kind of flake in each place.
      const speck = box.x0 === box.x1 && box.y0 === box.y1;
      if (speck) Object.assign(box, { x0: box.x0 - 1, y0: box.y0 - 1, x1: box.x1 + 1, y1: box.y1 + 1 });
      const kind = speck ? "speck" : lit(box.x0, box.y0) ? "x" : "+";
      boxes.push({ ...box, kind });
    }
  }
  if (boxes.length !== 8 || boxes.some((b) => b.x0 < 0 || b.y0 < 0 || b.y1 >= SNOW_ROWS || b.x1 - b.x0 !== 2 || b.y1 - b.y0 !== 2)) throw new Error(`expected eight 3×3 vanilla snowflakes, found ${boxes.length}`);
  return boxes;
}

/**
 * One flake in an n×n px box at (ox, oy): a disc of radius `core` plus four arms `arm` px wide out to the box edge,
 * on the diagonals or the axes. Pixels in the outer ring of the shape get the rim color.
 */
function flake(/** @type {import("./png.mjs").Image} */ img, /** @type {number} */ ox, /** @type {number} */ oy, /** @type {number} */ n, /** @type {boolean} */ diagonal, /** @type {number} */ core, /** @type {number} */ arm) {
  const c = (n - 1) / 2;
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => {
    const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
    if (r <= core) return true;
    const [u, v] = diagonal ? [(dx + dy) / Math.SQRT2, (dx - dy) / Math.SQRT2] : [dx, dy];
    return r <= (diagonal ? c * Math.SQRT2 : c + 0.5) && (Math.abs(u) <= arm / 2 || Math.abs(v) <= arm / 2);
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      put(img, ox + x, oy + y, edge ? [...FLAKE.rim, FLAKE.rimAlpha * 255] : [...FLAKE.core, FLAKE.coreAlpha * 255]);
    }
  }
}

function snow(/** @type {import("./png.mjs").Image} */ vanilla, /** @type {import("./png.mjs").Image} */ img) {
  const boxes = footprints(vanilla);
  for (const b of boxes) for (let y = b.y0 * SCALE; y < (b.y1 + 1) * SCALE; y++) for (let x = b.x0 * SCALE; x < (b.x1 + 1) * SCALE; x++) put(img, x, y, [0, 0, 0, 0]);
  for (const b of boxes) {
    if (b.kind === "speck") flake(img, b.x0 * SCALE + 2, b.y0 * SCALE + 2, 8, hash(b.x0, 0, 51) < 0.5, 3.3, 2.6); // 8×8 px, centered
    else flake(img, b.x0 * SCALE, b.y0 * SCALE, 3 * SCALE, b.kind === "x", 4.7, 4.2);
  }
  let ink = 0;
  for (const b of boxes) {
    for (let y = b.y0 * SCALE; y < (b.y1 + 1) * SCALE; y++) for (let x = b.x0 * SCALE; x < (b.x1 + 1) * SCALE; x++) ink += img.data[(y * img.width + x) * 4 + 3] / 255;
  }
  ink /= boxes.length * (3 * SCALE) ** 2;
  if (ink < SNOW_INK.min || ink > SNOW_INK.max) throw new Error(`snow ink ${(ink * 100).toFixed(1)}% is outside ${SNOW_INK.min * 100}–${SNOW_INK.max * 100}%`);
}

// Ground mist: a soft, slightly lumpy white blob; the particle tints it gray-blue and fades it.
function mist() {
  const n = 32, img = blank(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - n / 2) / (n / 2), dy = (y + 0.5 - n / 2) / (n / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const lump = 0.85 + 0.15 * hash(x >> 2, y >> 2, 7);
      const a = r >= 1 ? 0 : Math.pow(1 - r * r, 2) * lump;
      put(img, x, y, [255, 255, 255, a * 255]);
    }
  }
  return img;
}

// Pack icon: a dark storm sky, a cloud, and blue rain.
function icon() {
  const n = 128, img = blank(n, n);
  const top = [0x2f, 0x37, 0x42], bottom = [0x5f, 0x6b, 0x79];
  for (let y = 0; y < n; y++) {
    const t = y / (n - 1);
    for (let x = 0; x < n; x++) put(img, x, y, [...top.map((c, i) => c + (bottom[i] - c) * t), 255]);
  }
  // Pixel cloud from overlapping circles, on an 8 px grid like a block texture.
  const puffs = [[34, 40, 18], [58, 30, 22], [84, 38, 19], [100, 46, 13], [22, 50, 12]];
  for (let y = 0; y < 72; y += 4) {
    for (let x = 0; x < n; x += 4) {
      const inside = puffs.some(([cx, cy, r]) => (x + 2 - cx) ** 2 + (y + 2 - cy) ** 2 < r * r) && y < 60;
      if (!inside) continue;
      const shade = 0x8a + Math.floor(hash(x, y, 3) * 18) - (y > 48 ? 22 : 0);
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) put(img, x + xx, y + yy, [shade, shade + 6, shade + 16, 255]);
    }
  }
  // Rain under the cloud.
  for (let lane = 0; lane < 18; lane++) {
    const x = 14 + Math.floor(lane * 5.6 + hash(lane, 0, 9) * 3);
    const y0 = 62 + Math.floor(hash(lane, 1, 9) * 30), len = 14 + Math.floor(hash(lane, 2, 9) * 22);
    for (let i = 0; i < len && y0 + i < n; i++) {
      const a = 0.35 + 0.6 * (i / len);
      for (let w = 0; w < 2; w++) {
        const o = ((y0 + i) * n + x + w) * 4, d = img.data;
        put(img, x + w, y0 + i, [0x6f * a + d[o] * (1 - a), 0x8f * a + d[o + 1] * (1 - a), 0xd4 * a + d[o + 2] * (1 - a), 255]);
      }
    }
  }
  return img;
}

const outputs = [
  ["textures/environment/weather.png", weather()],
  ["textures/particle/realm_rain_mist.png", mist()],
  ["pack_icon.png", icon()],
];

const stale = [];
for (const [rel, img] of /** @type {[string, import("./png.mjs").Image][]} */ (outputs)) {
  const file = join(pack, rel);
  if (check) {
    if (!existsSync(file) || !samePixels(decode(readFileSync(file)), img)) stale.push(rel);
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, encode(img));
    console.log(`wrote ${relative(root, file)} (${img.width}×${img.height})`);
  }
}
if (check) {
  if (stale.length) {
    console.error(`rain_rp textures out of date: ${stale.join(", ")} (run npm run gen:rain)`);
    process.exit(1);
  }
  console.log("rain_rp textures match tools/gen-rain/textures.mjs.");
}
