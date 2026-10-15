// Generates the platypus model, its two skins and the pictures: packs/platypus_rp/models/entity/platypus.geo.json,
// packs/platypus_rp/textures/entity/platypus/{platypus,perry}.png, both packs' pack_icon.png and
// docs/media/platypus/platypus.png (a render of the model, for PACKS.md). The model and the skins come from the same
// cube list below, so the texture layout always matches the geometry. The client entity, render controller,
// animations, lang file and manifests in platypus_rp are hand-written.
// Deterministic: hash-based noise only, no Math.random, so the same code always writes the same files.
//
//   node tools/gen-platypus/gen.mjs           write them
//   node tools/gen-platypus/gen.mjs --check   fail if a committed file differs or is missing
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { blank, decode, encode, samePixels } from "../gen-rain/png.mjs";

const root = join(import.meta.dirname, "..", "..");
const check = process.argv.includes("--check");

/** @typedef {import("../gen-rain/png.mjs").Image} Image */
/** @typedef {[number, number, number]} Vec */
/** @typedef {{ origin: Vec, size: Vec, uv: [number, number] }} Cube */
/** @typedef {{ name: string, parent?: string, pivot: Vec, cubes: Cube[], locators?: Record<string, Vec> }} Bone */

// ---------------------------------------------------------------------------
// Helpers
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
/** @param {number[]} c @param {number} k */
const shade = (c, k) => c.map((v) => clamp(v * k, 0, 255));
/** @param {string} hex @returns {number[]} */
const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16));

/** @param {Image} img @param {number} x @param {number} y @param {number[]} rgba */
function put(img, x, y, rgba) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set(rgba.map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * img.width + x) * 4);
}

// ---------------------------------------------------------------------------
// The model (Bedrock units: 16 per block; the head points to -Z, as in vanilla models)
// ---------------------------------------------------------------------------

const TEX_W = 64, TEX_H = 32;

/** A leg with its webbed foot: the leg's top center is the pivot, the foot points forward. */
function leg(/** @type {string} */ name, /** @type {number} */ side, /** @type {number} */ z) {
  const x0 = side > 0 ? 2.5 : -4.5;
  return {
    name,
    parent: "body",
    pivot: /** @type {Vec} */ ([x0 + 1, 2.5, z + 1]),
    cubes: [
      { origin: /** @type {Vec} */ ([x0, 0.5, z]), size: /** @type {Vec} */ ([2, 2, 2]), uv: /** @type {[number, number]} */ ([0, 21]) },
      { origin: /** @type {Vec} */ ([x0 - 0.5, 0, z - 1.25]), size: /** @type {Vec} */ ([3, 1, 3]), uv: /** @type {[number, number]} */ ([8, 21]) },
    ],
  };
}

/** @type {Bone[]} */
const BONES = [
  // The lead ties on at the shoulders, on top of the body (without a "lead" locator it floats above the mob).
  { name: "body", pivot: [0, 3, 0], cubes: [{ origin: [-3.5, 1, -5], size: [7, 4, 10], uv: [0, 0] }], locators: { lead: /** @type {Vec} */ ([0, 5, -3]) } },
  { name: "head", parent: "body", pivot: [0, 3, -5], cubes: [{ origin: [-2.5, 1.5, -9], size: [5, 3, 4], uv: [0, 14] }] },
  { name: "bill", parent: "head", pivot: [0, 2.5, -9], cubes: [{ origin: [-2.5, 1.75, -13], size: [5, 1, 4], uv: [18, 14] }] },
  { name: "tail", parent: "body", pivot: [0, 2.5, 5], cubes: [{ origin: [-3, 1.75, 5], size: [6, 1, 6], uv: [34, 0] }] },
  leg("leg_front_left", 1, -4),
  leg("leg_front_right", -1, -4),
  leg("leg_back_left", 1, 2),
  leg("leg_back_right", -1, 2),
  {
    name: "fedora",
    parent: "head",
    pivot: [0, 4.5, -7],
    cubes: [
      { origin: [-3.5, 4.55, -10.5], size: [7, 1, 7], uv: [20, 24] },
      { origin: [-2, 5.55, -9], size: [4, 2, 4], uv: [36, 8] },
    ],
  },
];

/**
 * The six faces of a cube with their box-UV rectangles and their corners in 3D, listed top-left, top-right,
 * bottom-right, bottom-left as the texture shows them (looking at the face from outside).
 * @param {Cube} c
 */
function faces(c) {
  const [x0, y0, z0] = c.origin, [w, h, d] = c.size, [u, v] = c.uv;
  const x1 = x0 + w, y1 = y0 + h, z1 = z0 + d;
  /** @type {{ name: string, rect: number[], corners: Vec[], normal: Vec }[]} */
  return [
    { name: "north", rect: [u + d, v + d, w, h], corners: [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]], normal: [0, 0, -1] },
    { name: "east", rect: [u, v + d, d, h], corners: [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], normal: [1, 0, 0] },
    { name: "west", rect: [u + d + w, v + d, d, h], corners: [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], normal: [-1, 0, 0] },
    { name: "south", rect: [u + 2 * d + w, v + d, w, h], corners: [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], normal: [0, 0, 1] },
    { name: "up", rect: [u + d, v, w, d], corners: [[x1, y1, z1], [x0, y1, z1], [x0, y1, z0], [x1, y1, z0]], normal: [0, 1, 0] },
    { name: "down", rect: [u + d + w, v, w, d], corners: [[x1, y0, z0], [x0, y0, z0], [x0, y0, z1], [x1, y0, z1]], normal: [0, -1, 0] },
  ];
}

/** Point on a face for texel (i, j) of its rectangle, at fractions (fi, fj) inside the texel. */
function facePoint(/** @type {Vec[]} */ k, /** @type {number} */ s, /** @type {number} */ t) {
  const top = k[0].map((a, n) => mix(a, k[1][n], s)), bottom = k[3].map((a, n) => mix(a, k[2][n], s));
  return /** @type {Vec} */ (top.map((a, n) => mix(a, bottom[n], t)));
}

// ---------------------------------------------------------------------------
// Skins
// ---------------------------------------------------------------------------

const SKINS = {
  platypus: {
    fur: rgb("#7a5233"), belly: rgb("#b48a62"), bill: rgb("#3b3532"), nostril: rgb("#1c1917"),
    tail: rgb("#5a3a22"), feet: rgb("#3e2f28"), eye: rgb("#0d0d0d"),
  },
  perry: {
    fur: rgb("#2aa59a"), belly: rgb("#5cc8bc"), bill: rgb("#f08a1c"), nostril: rgb("#a34d06"),
    tail: rgb("#1f8178"), feet: rgb("#f08a1c"), eye: rgb("#0d0d0d"),
    hat: rgb("#6b4a2e"), band: rgb("#2e1f14"),
  },
};

/**
 * Color of one texel. `p` is the texel's center on the model, `face` the cube face it is on.
 * @param {keyof typeof SKINS} skin @param {string} bone @param {number} cube @param {string} face @param {Vec} p
 * @param {number} i texel column in the face @param {number} j texel row in the face (0 = top)
 * @returns {number[] | undefined} RGBA, or undefined for a transparent texel
 */
function paint(skin, bone, cube, face, p, i, j) {
  const s = SKINS[skin];
  const n = hash(Math.floor(p[0] * 2 + 50), Math.floor(p[1] * 2 + 50) * 131 + Math.floor(p[2] * 2 + 50), bone.length);
  const grain = 0.9 + 0.2 * n;
  if (bone === "fedora") {
    if (!("hat" in s)) return undefined;
    const hat = /** @type {number[]} */ (s.hat), band = /** @type {number[]} */ (s.band);
    if (cube === 1 && face !== "up" && face !== "down" && j === 1) return [...shade(band, grain), 255];
    if (cube === 1 && face === "up") {
      // A pinch along the crown's middle, front to back.
      const mid = Math.abs(p[0]) < 0.6;
      return [...shade(hat, (mid ? 0.72 : 1.05) * grain), 255];
    }
    if (cube === 0 && face === "down") return [...shade(hat, 0.7 * grain), 255];
    return [...shade(hat, (face === "up" ? 1.05 : 0.85) * grain), 255];
  }
  if (bone === "bill") {
    let c = shade(s.bill, (face === "up" ? 1.08 : face === "down" ? 0.8 : 0.9) * (0.95 + 0.1 * n));
    // Two nostrils near the tip, on top.
    if (face === "up" && Math.abs(p[2] + 11.5) < 0.25 && Math.abs(Math.abs(p[0]) - 1) < 0.25) c = s.nostril;
    return [...c, 255];
  }
  if (bone.startsWith("leg")) {
    if (cube === 1) {
      // Webbed foot: toes as lighter streaks on top, darker webbing between them.
      const toe = face === "up" && Math.round(p[0] * 2) % 2 === 0;
      return [...shade(s.feet, (toe ? 1.25 : face === "down" ? 0.7 : 0.95) * grain), 255];
    }
    return [...shade(s.fur, (face === "down" ? 0.7 : 0.9) * grain), 255];
  }
  if (bone === "tail") {
    // Flat beaver tail: a crosshatch of scales on top, paler below.
    const hatch = (Math.floor(p[0] + 10) + Math.floor(p[2] + 10)) % 2 === 0;
    if (face === "down") return [...shade(s.tail, 1.15 * grain), 255];
    return [...shade(s.tail, (face === "up" ? (hatch ? 1.0 : 0.85) : 0.8) * grain), 255];
  }
  if (bone === "head") {
    // Eyes: one texel high up on each side, a little behind the bill.
    if ((face === "east" || face === "west") && j === 0 && Math.abs(p[2] + 7.5) < 0.25) return [...s.eye, 255];
    if (face === "down") return [...shade(s.belly, grain), 255];
    const lower = face !== "up" && j === 2;
    return [...(lower ? s.belly.map((v, k) => mix(v, s.fur[k], 0.4)) : shade(s.fur, (face === "up" ? 1.05 : 0.95) * grain)), 255];
  }
  // Body: darker along the spine, lighter belly and flanks fading into it.
  if (face === "down") return [...shade(s.belly, grain), 255];
  if (face === "up") {
    const spine = 1 - 0.18 * Math.exp(-((p[0] / 1.5) ** 2));
    return [...shade(s.fur, spine * 1.05 * grain), 255];
  }
  const t = clamp((3 - p[1]) / 2); // 0 at mid height, 1 at the bottom
  return [...s.fur.map((v, k) => mix(v, s.belly[k], t * 0.7)).map((v) => v * grain * 0.95), 255];
}

/** @param {keyof typeof SKINS} skin @returns {Image} */
function skinTexture(skin) {
  const img = blank(TEX_W, TEX_H);
  for (const bone of BONES) {
    bone.cubes.forEach((cube, ci) => {
      for (const f of faces(cube)) {
        const [u, v, w, h] = f.rect;
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const c = paint(skin, bone.name, ci, f.name, facePoint(f.corners, (i + 0.5) / w, (j + 0.5) / h), i, j);
            if (c) put(img, u + i, v + j, c);
          }
        }
      }
    });
  }
  return img;
}

/** Fails if two cubes' box-UV areas overlap or leave the texture. */
function checkLayout() {
  const used = new Map();
  const problems = [];
  for (const bone of BONES) {
    bone.cubes.forEach((cube, ci) => {
      for (const f of faces(cube)) {
        const [u, v, w, h] = f.rect;
        for (let y = v; y < v + h; y++) {
          for (let x = u; x < u + w; x++) {
            if (x >= TEX_W || y >= TEX_H) problems.push(`${bone.name}[${ci}] ${f.name} leaves the texture`);
            const owner = used.get(`${x},${y}`);
            // Legs share one area on purpose.
            if (owner && !(owner.startsWith("leg") && bone.name.startsWith("leg"))) problems.push(`${bone.name}[${ci}] overlaps ${owner} at ${x},${y}`);
            used.set(`${x},${y}`, `${bone.name}[${ci}]`);
          }
        }
      }
    });
  }
  return [...new Set(problems)];
}

// ---------------------------------------------------------------------------
// Geometry file
// ---------------------------------------------------------------------------

const GEOMETRY = {
  format_version: "1.12.0",
  "minecraft:geometry": [
    {
      description: {
        identifier: "geometry.realm_platypus",
        texture_width: TEX_W,
        texture_height: TEX_H,
        visible_bounds_width: 2,
        visible_bounds_height: 1.5,
        visible_bounds_offset: [0, 0.5, 0],
      },
      bones: BONES.map((b) => ({
        name: b.name,
        ...(b.parent ? { parent: b.parent } : {}),
        pivot: b.pivot,
        cubes: b.cubes.map((c) => ({ origin: c.origin, size: c.size, uv: c.uv })),
        ...(b.locators ? { locators: b.locators } : {}),
      })),
    },
  ],
};

// ---------------------------------------------------------------------------
// Pictures: a small software renderer (orthographic, flat-shaded texels, painter's order)
// ---------------------------------------------------------------------------

/**
 * Draws the model with a skin onto `img`, centered at (cx, cy), `scale` pixels per model unit.
 * @param {Image} img @param {Image} tex @param {number} cx @param {number} cy @param {number} scale @param {number} yaw degrees
 * @param {boolean} hat whether the fedora shows
 */
function render(img, tex, cx, cy, scale, yaw, hat) {
  const a = (yaw * Math.PI) / 180, pitch = (28 * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(pitch), sp = Math.sin(pitch);
  /** @param {Vec} p */
  const view = (p) => {
    const x = p[0] * ca - p[2] * sa, z = p[0] * sa + p[2] * ca;
    const y = p[1] * cp + z * sp, depth = -p[1] * sp + z * cp;
    return [cx + x * scale, cy - (y - 3) * scale, depth];
  };
  const light = /** @type {Vec} */ ([0.45, 0.8, -0.4]);
  /** @type {{ depth: number, pts: number[][], color: number[] }[]} */
  const quads = [];
  for (const bone of BONES) {
    if (bone.name === "fedora" && !hat) continue;
    for (const cube of bone.cubes) {
      for (const f of faces(cube)) {
        // Back-face cull: the camera looks along +depth.
        const nv = view(f.normal), o = view([0, 0, 0]);
        if (nv[2] - o[2] > 0.0001) continue;
        const lit = 0.62 + 0.38 * Math.max(0, f.normal[0] * light[0] + f.normal[1] * light[1] + f.normal[2] * light[2]);
        const [u, v, w, h] = f.rect;
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const k = (((v + j) * tex.width + u + i) * 4);
            if (tex.data[k + 3] < 128) continue;
            const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([s, t]) => view(facePoint(f.corners, s / w, t / h)));
            const depth = pts.reduce((sum, q) => sum + q[2], 0) / 4;
            quads.push({ depth, pts, color: [tex.data[k] * lit, tex.data[k + 1] * lit, tex.data[k + 2] * lit] });
          }
        }
      }
    }
  }
  quads.sort((p, q) => q.depth - p.depth);
  for (const q of quads) fillQuad(img, q.pts, q.color);
}

/** Fills a convex quad (pixel centers inside it). @param {Image} img @param {number[][]} pts @param {number[]} color */
function fillQuad(img, pts, color) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.floor(Math.min(...xs)), maxX = Math.ceil(Math.max(...xs)), minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      let pos = 0, neg = 0;
      for (let e = 0; e < 4; e++) {
        const [ax, ay] = pts[e], [bx, by] = pts[(e + 1) % 4];
        const cr = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        if (cr > 1e-9) pos++;
        else if (cr < -1e-9) neg++;
      }
      if (pos === 0 || neg === 0) put(img, x, y, [...color, 255]);
    }
  }
}

/** A vertical gradient background. @param {number} w @param {number} h @param {number[]} top @param {number[]} bottom */
function background(w, h, top, bottom) {
  const img = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(img, x, y, [...top.map((c, i) => mix(c, bottom[i], y / h)), 255]);
  return img;
}

/** Water and a muddy bank along the bottom of a picture. @param {Image} img @param {number} from */
function riverbank(img, from) {
  for (let y = from; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const bank = y < from + (img.height - from) * 0.35;
      const n = hash(x >> 2, y >> 2, 7);
      put(img, x, y, bank ? [104 + 20 * n, 82 + 16 * n, 56 + 10 * n, 255] : [38 + 14 * n, 112 + 24 * n, 140 + 20 * n, 255]);
    }
  }
}

const TEXTURES = { platypus: skinTexture("platypus"), perry: skinTexture("perry") };

function icon() {
  const img = background(128, 128, [150, 206, 230], [214, 238, 246]);
  riverbank(img, 92);
  render(img, TEXTURES.platypus, 64, 64, 6.2, 235, false);
  return img;
}

function picture() {
  const img = background(520, 220, [150, 206, 230], [214, 238, 246]);
  riverbank(img, 160);
  render(img, TEXTURES.platypus, 140, 100, 12, 235, false);
  render(img, TEXTURES.perry, 385, 100, 12, 125, true);
  return img;
}

// ---------------------------------------------------------------------------
// Write or compare
// ---------------------------------------------------------------------------

const layout = checkLayout();
if (layout.length) {
  console.error(`texture layout problems:\n  ${layout.join("\n  ")}`);
  process.exit(1);
}

const RP = "packs/platypus_rp";
/** @type {Map<string, string | Image>} path from the repo root -> contents */
const outputs = new Map();
outputs.set(`${RP}/models/entity/platypus.geo.json`, JSON.stringify(GEOMETRY, null, 2) + "\n");
outputs.set(`${RP}/textures/entity/platypus/platypus.png`, TEXTURES.platypus);
outputs.set(`${RP}/textures/entity/platypus/perry.png`, TEXTURES.perry);
const ICON = icon();
outputs.set(`${RP}/pack_icon.png`, ICON);
outputs.set("packs/platypus_bp/pack_icon.png", ICON);
outputs.set("docs/media/platypus/platypus.png", picture());

if (check) {
  const stale = [];
  for (const [rel, want] of outputs) {
    const file = join(root, rel);
    if (!existsSync(file)) stale.push(`${rel} (missing)`);
    else if (typeof want === "string" ? readFileSync(file, "utf8") !== want : !samePixels(decode(readFileSync(file)), want)) stale.push(rel);
  }
  if (stale.length) {
    console.error(`platypus files out of date: ${stale.join(", ")} (run npm run gen:platypus)`);
    process.exit(1);
  }
  console.log(`platypus_rp matches tools/gen-platypus/gen.mjs (${outputs.size} files).`);
} else {
  for (const [rel, data] of outputs) {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof data === "string" ? data : encode(data));
  }
  console.log(`wrote ${outputs.size} files for the platypus packs: ${[...outputs.keys()].join(", ")}`);
}
