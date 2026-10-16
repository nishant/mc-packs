// Generates the pictures of the Easy Building Guides resource pack (packs/build_rp): the guide particle
// textures (textures/particle/realm_guide.png: a one-block outline and a corner outline side by side;
// realm_guide_dot.png), the Building Book icon (textures/items/realm_building_book.png), inventory page
// buttons (textures/items/inv_{prev,menu,next}.png), and pack_icon.png.
// The particles, item_texture.json and the manifest are hand-written.
// Deterministic (no Math.random), so the same code always writes the same files.
//
//   node tools/gen-build/gen.mjs           write them
//   node tools/gen-build/gen.mjs --check   fail if a committed file differs or is missing
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { blank, decode, encode, samePixels } from "../gen-rain/png.mjs";

const root = join(import.meta.dirname, "..", "..");
const check = process.argv.includes("--check");
const RP = "packs/build_rp";

/** @typedef {import("../gen-rain/png.mjs").Image} Image */
/** @typedef {[number, number, number, number]} RGBA */

/** @param {Image} img @param {number} x @param {number} y @param {RGBA} c */
function put(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const a = c[3] / 255, b = img.data[i + 3] / 255;
  const out = a + b * (1 - a);
  for (let k = 0; k < 3; k++) img.data[i + k] = out ? Math.round((c[k] * a + img.data[i + k] * b * (1 - a)) / out) : 0;
  img.data[i + 3] = Math.round(out * 255);
}
/** @param {Image} img @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {RGBA} c inclusive */
function rect(img, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(img, x, y, c);
}
/** Anti-aliased-ish thick line (round brush). @param {Image} img @param {number[]} a @param {number[]} b @param {number} w @param {RGBA} c */
function line(img, a, b, w, c) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
  const r = w / 2;
  /** @type {Set<number>} */
  const done = new Set();
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n, y = a[1] + ((b[1] - a[1]) * i) / n;
    for (let py = Math.floor(y - r - 1); py <= Math.ceil(y + r + 1); py++)
      for (let px = Math.floor(x - r - 1); px <= Math.ceil(x + r + 1); px++) {
        const d = Math.hypot(px + 0.5 - x, py + 0.5 - y);
        if (d > r + 0.5 || done.has(py * 4096 + px)) continue;
        done.add(py * 4096 + px);
        const cover = Math.max(0, Math.min(1, r + 0.5 - d));
        put(img, px, py, [c[0], c[1], c[2], Math.round(c[3] * cover)]);
      }
  }
}

const WHITE = /** @type {RGBA} */ ([255, 255, 255, 255]);
const SHADE = /** @type {RGBA} */ ([0, 0, 0, 110]);

// ---------------------------------------------------------------------------
// Guide textures. Tinted in game (variable.color), so they are white with a faint dark inner line that keeps
// them readable against snow and quartz.
// ---------------------------------------------------------------------------

/** 64 x 32: [outline | corner outline], each 32 x 32 for one block face. */
function guideTexture() {
  const img = blank(64, 32);
  const S = 32, T = 2; // a 2-pixel line is 1/16 of a block
  for (const [ox, corners] of /** @type {[number, boolean][]} */ ([[0, false], [32, true]])) {
    const L = corners ? 9 : S; // corner arms
    /** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 */
    const r = (x0, y0, x1, y1, /** @type {RGBA} */ c) => rect(img, ox + x0, y0, ox + x1, y1, c);
    for (const [x0, x1] of [[0, L - 1], [S - L, S - 1]]) {
      // top and bottom arms
      r(x0, 0, x1, T - 1, WHITE);
      r(x0, S - T, x1, S - 1, WHITE);
      // left and right arms
      r(0, x0, T - 1, x1, WHITE);
      r(S - T, x0, S - 1, x1, WHITE);
    }
    // the faint inner line
    for (const [x0, x1] of [[T, L - 1], [Math.max(T, S - L), S - 1 - T]]) {
      r(x0, T, x1, T, SHADE);
      r(x0, S - 1 - T, x1, S - 1 - T, SHADE);
      r(T, x0, T, x1, SHADE);
      r(S - 1 - T, x0, S - 1 - T, x1, SHADE);
    }
  }
  return img;
}

/** 16 x 16 round dot with a dark rim. */
function dotTexture() {
  const img = blank(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d <= 5.2) put(img, x, y, WHITE);
      else if (d <= 6.6) put(img, x, y, [0, 0, 0, Math.round(140 * Math.min(1, 6.6 - d + 0.3))]);
    }
  return img;
}

// ---------------------------------------------------------------------------
// The Building Book icon (16 x 16): a teal book with cream pages, a gold corner and a little brick wall.
// ---------------------------------------------------------------------------

function bookIcon() {
  const img = blank(16, 16);
  const cover = /** @type {RGBA} */ ([38, 120, 128, 255]);
  const coverDark = /** @type {RGBA} */ ([22, 74, 82, 255]);
  const pages = /** @type {RGBA} */ ([236, 226, 196, 255]);
  const outline = /** @type {RGBA} */ ([16, 30, 36, 255]);
  const gold = /** @type {RGBA} */ ([242, 196, 64, 255]);
  const brick = /** @type {RGBA} */ ([190, 92, 60, 255]);
  const mortar = /** @type {RGBA} */ ([226, 214, 190, 255]);
  // pages under the cover (the book is seen a little from the side)
  rect(img, 3, 13, 14, 14, pages);
  rect(img, 14, 3, 14, 14, pages);
  // cover
  rect(img, 2, 1, 13, 12, cover);
  rect(img, 2, 1, 3, 12, coverDark); // spine
  // outline
  rect(img, 1, 0, 14, 0, outline);
  rect(img, 1, 0, 1, 13, outline);
  rect(img, 1, 13, 2, 13, outline);
  rect(img, 2, 15, 15, 15, outline);
  rect(img, 15, 2, 15, 15, outline);
  rect(img, 14, 0, 14, 2, outline);
  rect(img, 2, 14, 2, 14, outline);
  // a brick wall on the cover: three rows
  rect(img, 5, 5, 12, 10, mortar);
  for (const [y, offs] of /** @type {[number, number[]][]} */ ([[5, [5, 9]], [7, [5, 7, 11]], [9, [5, 9]]])) {
    for (const x of offs) {
      const w = x === 5 && y === 7 ? 1 : x === 11 ? 1 : 3;
      rect(img, x, y, Math.min(12, x + w - 1), y + 1, brick);
    }
  }
  // gold corner and a ribbon
  rect(img, 12, 1, 13, 2, gold);
  put(img, 13, 3, gold);
  rect(img, 9, 12, 9, 14, [200, 50, 50, 255]);
  return img;
}

// ---------------------------------------------------------------------------
// Inventory slot buttons (128 x 128): matte obsidian, beveled edges and silver/cyan glyphs.
// ---------------------------------------------------------------------------

/** @param {"prev" | "menu" | "next"} kind */
function inventoryIcon(kind) {
  const img = blank(128, 128);
  /** @param {number} x @param {number} y @param {number} lo @param {number} hi */
  const inside = (x, y, lo, hi) => x >= lo && x <= hi && y >= lo && y <= hi
    && Math.min(x - lo, hi - x) + Math.min(y - lo, hi - y) >= 3;
  for (let y = 4; y <= 123; y++) {
    for (let x = 4; x <= 123; x++) {
      if (!inside(x, y, 4, 123)) continue;
      let color = /** @type {RGBA} */ ([8, 9, 12, 255]);
      if (inside(x, y, 8, 119)) color = x + y < 128 ? [46, 52, 66, 255] : [14, 16, 22, 255];
      if (inside(x, y, 12, 115)) {
        const t = (y - 12) / 103;
        color = [Math.round(22 - 10 * t), Math.round(25 - 11 * t), Math.round(34 - 15 * t), 255];
      }
      if (inside(x, y, 18, 109) && !inside(x, y, 19, 108)) color = [32, 36, 48, 255];
      put(img, x, y, color);
    }
  }

  /** Signed-distance coverage keeps the glyphs crisp without overlapping stroke seams.
   * @param {(x: number, y: number) => number} distance @param {RGBA} [core] */
  const glyph = (distance, core = [235, 245, 255, 255]) => {
    for (let y = 28; y <= 99; y++) {
      for (let x = 24; x <= 103; x++) {
        const d = distance(x + 0.5, y + 0.5);
        if (d >= 4) continue;
        const glow = Math.round(140 * (core[3] / 255) * (1 - Math.max(0, d) / 4) ** 2);
        put(img, x, y, [50, 180, 220, glow]);
        const coverage = Math.max(0, Math.min(1, 0.5 - d));
        if (coverage) put(img, x, y, [core[0], core[1], core[2], Math.round(core[3] * coverage)]);
      }
    }
  };
  /** @param {number} x @param {number} y @param {number[]} a @param {number[]} b */
  const segmentDistance = (x, y, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
  };
  if (kind === "menu") {
    glyph((x, y) => {
      let d = Infinity;
      for (const cy of [46, 64, 82]) {
        for (const cx of [46, 64, 82]) {
          const qx = Math.abs(x - cx) - 4, qy = Math.abs(y - cy) - 4;
          d = Math.min(d, Math.hypot(Math.max(0, qx), Math.max(0, qy)) + Math.min(0, Math.max(qx, qy)) - 2);
        }
      }
      return d;
    });
  } else {
    const tip = kind === "prev" ? 48 : 80, back = kind === "prev" ? 72 : 56;
    glyph((x, y) => Math.min(
      segmentDistance(x, y, [back, 44], [tip, 64]),
      segmentDistance(x, y, [tip, 64], [back, 84]),
    ) - 4.5);
    if (kind === "prev") glyph((x, y) => segmentDistance(x, y, [36, 55], [36, 73]) - 1.5, [142, 165, 182, 190]);
  }
  return img;
}

// ---------------------------------------------------------------------------
// pack_icon.png (128 x 128): outlined blocks of a wall going up on a dark blue background.
// ---------------------------------------------------------------------------

function packIcon() {
  const N = 128;
  const img = blank(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = y / (N - 1);
      put(img, x, y, [Math.round(20 + 18 * t), Math.round(36 + 30 * t), Math.round(70 + 40 * t), 255]);
    }
  // Isometric blocks: a 3-wide, 2-high wall and one block on top being placed.
  const s = 16; // half-width of a block's top diamond
  /** Screen point of a block corner (bx right, by up, bz back). @param {number} bx @param {number} by @param {number} bz */
  const P = (bx, by, bz) => [64 + (bx - bz) * s, 92 + (bx + bz) * s * 0.5 - by * s * 1.15];
  /** @param {number} bx @param {number} by @param {number} bz @param {RGBA} c @param {RGBA} [fill] */
  const cube = (bx, by, bz, c, fill) => {
    const v = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => P(bx + x, by + y, bz + z);
    if (fill) {
      // fill the three visible faces with flat shades
      const faces = [
        [v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)],
        [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)],
        [v(1, 0, 0), v(1, 0, 1), v(1, 1, 1), v(1, 1, 0)],
      ];
      const shades = [1, 0.75, 0.58];
      faces.forEach((f, i) => fillQuad(img, f, [Math.round(fill[0] * shades[i]), Math.round(fill[1] * shades[i]), Math.round(fill[2] * shades[i]), fill[3]]));
    }
    const edges = [
      [[0, 0, 0], [1, 0, 0]], [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[0, 0, 1], [1, 0, 1]],
      [[0, 1, 0], [1, 1, 0]], [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]], [[0, 1, 1], [1, 1, 1]],
      [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]], [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]],
    ];
    for (const [a, b] of edges) line(img, v(a[0], a[1], a[2]), v(b[0], b[1], b[2]), 2.2, c);
  };
  const stone = /** @type {RGBA} */ ([150, 150, 156, 255]);
  // the wall, back to front so nearer blocks paint over
  for (let by = 0; by < 2; by++) for (let bx = -1; bx <= 1; bx++) cube(bx, by, 0, [40, 44, 52, 255], stone);
  // the guide: outlined blocks continuing the wall up
  const guide = /** @type {RGBA} */ ([110, 240, 255, 255]);
  for (let bx = -1; bx <= 1; bx++) cube(bx, 2, 0, guide);
  return img;
}

/** Fills a convex quad. @param {Image} img @param {number[][]} pts @param {RGBA} c */
function fillQuad(img, pts, c) {
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y + 0.5 && b[1] > y + 0.5) || (b[1] <= y + 0.5 && a[1] > y + 0.5)) xs.push(a[0] + ((y + 0.5 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let x = Math.round(xs[0]); x < Math.round(xs[xs.length - 1]); x++) put(img, x, y, c);
  }
}

/** @type {Map<string, Image>} */
const outputs = new Map();
outputs.set(`${RP}/textures/particle/realm_guide.png`, guideTexture());
outputs.set(`${RP}/textures/particle/realm_guide_dot.png`, dotTexture());
outputs.set(`${RP}/textures/items/realm_building_book.png`, bookIcon());
outputs.set(`${RP}/textures/items/inv_prev.png`, inventoryIcon("prev"));
outputs.set(`${RP}/textures/items/inv_menu.png`, inventoryIcon("menu"));
outputs.set(`${RP}/textures/items/inv_next.png`, inventoryIcon("next"));
outputs.set(`${RP}/pack_icon.png`, packIcon());

if (check) {
  const stale = [];
  for (const [rel, want] of outputs) {
    const file = join(root, rel);
    if (!existsSync(file)) stale.push(`${rel} (missing)`);
    else if (!samePixels(decode(readFileSync(file)), want)) stale.push(rel);
  }
  if (stale.length) {
    console.error(`build_rp pictures out of date: ${stale.join(", ")} (run npm run gen:build)`);
    process.exit(1);
  }
  console.log(`build_rp matches tools/gen-build/gen.mjs (${outputs.size} files).`);
} else {
  for (const [rel, img] of outputs) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, encode(img));
  }
  console.log(`wrote ${outputs.size} files for build_rp: ${[...outputs.keys()].join(", ")}`);
}
