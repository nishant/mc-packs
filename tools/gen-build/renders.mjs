// Before/after renders of Easy Building's outlines and mirror guide for docs/PACKS.md ("See and hear it" under
// Easy Building): drawn from the same geometry the pack uses (utils/edges.js, the mirror's plane builder), in an
// isometric view, so they show what changed in W8, not a screenshot of the game.
//   node tools/gen-build/renders.mjs          write docs/media/build/*.png
//   node tools/gen-build/renders.mjs --check  fail if a committed render differs or is missing
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blank, decode, encode, samePixels } from "../gen-rain/png.mjs";
import { creaseSegments } from "../../packs/build_bp/scripts/utils/edges.js";

const root = join(import.meta.dirname, "..", "..");
const OUT = "docs/media/build";
const check = process.argv.includes("--check");
const W = 360, H = 260;

/** @typedef {import("../gen-rain/png.mjs").Image} Image */
/** @typedef {[number, number, number, number]} RGBA */

/** @param {Image} img @param {number} x @param {number} y @param {RGBA} c */
function put(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const a = c[3] / 255;
  for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(c[k] * a + img.data[i + k] * (1 - a));
  img.data[i + 3] = 255;
}
/** @param {Image} img @param {number[]} a @param {number[]} b @param {number} w @param {RGBA} c */
function line(img, a, b, w, c) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
  const r = w / 2;
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

const BG = /** @type {RGBA} */ ([24, 30, 40, 255]);
const GROUND = /** @type {RGBA} */ ([60, 70, 84, 255]);
const WHITE = /** @type {RGBA} */ ([245, 245, 245, 235]);
const RED = /** @type {RGBA} */ ([255, 70, 55, 240]);
const BLUE = /** @type {RGBA} */ ([115, 215, 255, 220]);

/** An isometric camera: world (x, y, z) to pixels, `s` pixels a block, origin at (ox, oy). */
function camera(s, ox, oy) {
  const c = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6);
  return (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => [ox + (x - z) * c * s, oy + (x + z) * sn * s - y * s];
}

function canvas() {
  const img = blank(W, H);
  for (let i = 0; i < img.data.length; i += 4) img.data.set(BG, i);
  return img;
}

/** The ground grid under a box from (0, 0) to (nx, nz). @param {Image} img @param {ReturnType<typeof camera>} cam */
function ground(img, cam, nx, nz) {
  for (let x = -2; x <= nx + 2; x++) line(img, cam(x, 0, -2), cam(x, 0, nz + 2), 1, GROUND);
  for (let z = -2; z <= nz + 2; z++) line(img, cam(-2, 0, z), cam(nx + 2, 0, z), 1, GROUND);
}

/** A unit cube's 12 edges at cell (x, y, z), as the old per-block outline drew it. */
function cellCube(img, cam, x, y, z, c) {
  const P = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ d) => cam(x + a, y + b, z + d);
  for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    line(img, P(0, a, b), P(1, a, b), 1, c);
    line(img, P(a, 0, b), P(a, 1, b), 1, c);
    line(img, P(a, b, 0), P(a, b, 1), 1, c);
  }
}

/** Draws segments (utils/edges.js) as 2-pixel lines. */
function segments(img, cam, segs, c) {
  for (const s of segs) {
    const h = s.len / 2;
    const a = [s.x, s.y, s.z], b = [s.x, s.y, s.z];
    a[s.axis] -= h; b[s.axis] += h;
    line(img, cam(a[0], a[1], a[2]), cam(b[0], b[1], b[2]), 2, c);
  }
}

// A 7 x 4 x 6 box, the shape a Cube preview outlines.
const BX = 7, BY = 4, BZ = 6;
const cells = [];
for (let x = 0; x < BX; x++) for (let y = 0; y < BY; y++) for (let z = 0; z < BZ; z++) cells.push({ x, y, z });
const onEdge = (/** @type {{x:number,y:number,z:number}} */ p) =>
  (p.x === 0 || p.x === BX - 1 ? 1 : 0) + (p.y === 0 || p.y === BY - 1 ? 1 : 0) + (p.z === 0 || p.z === BZ - 1 ? 1 : 0) >= 2;

function outline(before, color) {
  const img = canvas();
  const cam = camera(17, W / 2 - 8, 70);
  ground(img, cam, BX, BZ);
  if (before) for (const p of cells.filter(onEdge)) cellCube(img, cam, p.x, p.y, p.z, color);
  else segments(img, cam, creaseSegments(cells), color);
  return img;
}

// A mirror's X plane at x = 0, 5 blocks each way of the player's height, as the old guide drew it (a framed square for
// every block along its border and center lines, plus the Z plane and the center column whichever axis was on) and as
// the new one does (its border and center lines, one line each).
const R = 5;
function mirror(before) {
  const img = canvas();
  const cam = camera(13, W / 2, 120);
  ground(img, cam, 0, 0);
  const sq = (/** @type {number[][]} */ pts) => { for (let i = 0; i < 4; i++) line(img, pts[i], pts[(i + 1) % 4], 1, BLUE); };
  if (before) {
    for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
      const border = y === -R || y === R || z === -R || z === R || y === 0 || z === 0;
      if (border) sq([cam(0, y, z), cam(0, y + 1, z), cam(0, y + 1, z + 1), cam(0, y, z + 1)]);
    }
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      const border = y === -R || y === R || x === -R || x === R || y === 0 || x === 0;
      if (border) sq([cam(x, y, 0), cam(x, y + 1, 0), cam(x + 1, y + 1, 0), cam(x + 1, y, 0)]);
    }
  } else {
    const L = (/** @type {number[]} */ a, /** @type {number[]} */ b) => line(img, cam(a[0], a[1], a[2]), cam(b[0], b[1], b[2]), 2, BLUE);
    L([0, -R, -R], [0, -R, R + 1]); L([0, R + 1, -R], [0, R + 1, R + 1]); L([0, 0.5, -R], [0, 0.5, R + 1]);
    L([0, -R, -R], [0, R + 1, -R]); L([0, -R, R + 1], [0, R + 1, R + 1]); L([0, -R, 0.5], [0, R + 1, 0.5]);
  }
  return img;
}

/** @type {Map<string, Image>} */
const outputs = new Map([
  [`${OUT}/outline-before.png`, outline(true, WHITE)],
  [`${OUT}/outline-after.png`, outline(false, WHITE)],
  [`${OUT}/destroy-before.png`, outline(true, RED)],
  [`${OUT}/destroy-after.png`, outline(false, RED)],
  [`${OUT}/mirror-before.png`, mirror(true)],
  [`${OUT}/mirror-after.png`, mirror(false)],
]);

if (check) {
  const stale = [];
  for (const [rel, want] of outputs) {
    const file = join(root, rel);
    if (!existsSync(file)) stale.push(`${rel} (missing)`);
    else if (!samePixels(decode(readFileSync(file)), want)) stale.push(rel);
  }
  if (stale.length) {
    console.error(`Easy Building renders out of date: ${stale.join(", ")} (run node tools/gen-build/renders.mjs)`);
    process.exit(1);
  }
  console.log(`Easy Building renders match tools/gen-build/renders.mjs (${outputs.size} files).`);
} else {
  mkdirSync(join(root, OUT), { recursive: true });
  for (const [rel, img] of outputs) writeFileSync(join(root, rel), encode(img));
  console.log(`wrote ${outputs.size} renders: ${[...outputs.keys()].join(", ")}`);
}
