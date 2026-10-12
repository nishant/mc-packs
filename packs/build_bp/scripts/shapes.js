// The shapes Easy Building can make, as pure geometry: no game objects here, so it is easy to read
// and to reason about. A shape fills a box of W x H x D cells in its own frame:
//   u: 0 .. W-1, left to right as the player looks
//   v: 0 .. H-1, bottom to top
//   w: 0 .. D-1, near to far (away from the player)
// main.js turns that frame into world blocks (facing, anchor, copies) and picks the real blocks.
//
// A cell says what goes there:
//   k "m"  the main block (the block you place, a hotbar mix or a typed id)
//   k "a"  the second block (trim, posts, pillars); `fb` is used when there is none, else the main block
//   k "s"  a stair of the main block, rising toward `d` (falls back to the main block when it isn't a stair)
//   k "g"  a fence gate matching the main block (closed), facing along `d`
//   k "x"  a fixed block `id` (lanterns, torches, ladders facing `d`, glass panes, farmland, water)
// `full`: something hangs on this cell, so it must be a full block (oak planks stand in for stairs, slabs, fences...).
// `d` is a direction in the frame: [du, dw], e.g. [0, 1] is away from the player.

/** @typedef {{ u: number, v: number, w: number, k: "m" | "a" | "s" | "g" | "x", d?: number[], up?: boolean, id?: string, fb?: string, full?: boolean }} Cell */
/** @typedef {Record<string, number | boolean | string>} Values */

/**
 * The settings a shape can have, as menu controls. `max` "size" means the realm's `maxSize`.
 * @type {Record<string, { label: string, type: "int" | "bool" | "enum", min?: number, max?: number | "size" | "half", def: number | boolean | string, choices?: string[], names?: string[], help?: string }>}
 */
export const PARAMS = {
  width: { label: "Width (left to right)", type: "int", min: 1, max: "size", def: 5 },
  height: { label: "Height", type: "int", min: 1, max: "size", def: 3 },
  depth: { label: "Depth (away from you)", type: "int", min: 1, max: "size", def: 5 },
  length: { label: "Length", type: "int", min: 1, max: "size", def: 8 },
  radius: { label: "Radius", type: "int", min: 1, max: "half", def: 4 },
  thick: { label: "Thickness", type: "int", min: 1, max: 8, def: 1 },
  size: { label: "Column width", type: "int", min: 1, max: 7, def: 1 },
  spacing: { label: "Posts or pillars every (blocks)", type: "int", min: 2, max: 16, def: 4 },
  dir: {
    label: "Direction",
    type: "enum",
    choices: ["away", "across", "up", "diagonal"],
    names: ["Away from you", "Left to right", "Straight up", "Rising away from you"],
    def: "away",
  },
  pattern: {
    label: "Pattern (second block)",
    type: "enum",
    choices: ["plain", "checker", "stripes", "border", "pillars", "speckled"],
    names: ["Plain", "Checkerboard", "Stripes", "Border", "Pillars (every N)", "Speckled"],
    def: "plain",
  },
  fill: {
    label: "Fill",
    type: "enum",
    choices: ["hollow", "filled", "walls", "frame"],
    names: ["Hollow (walls, floor and roof)", "Filled", "Walls only (no floor or roof)", "Frame (edges only)"],
    def: "hollow",
  },
  style: { label: "Roof style", type: "enum", choices: ["gable", "hip"], names: ["Gable (two slopes)", "Hip (four slopes)"], def: "gable" },
  round: { label: "Round", type: "bool", def: false },
  base: { label: "Base and top in the second block", type: "bool", def: true },
  hollow: { label: "Hollow", type: "bool", def: true },
  filled: { label: "Filled", type: "bool", def: false },
  gate: { label: "Gate in the middle", type: "bool", def: true },
  lights: { label: "Lights", type: "bool", def: true },
  under: { label: "Fill underneath", type: "bool", def: false },
  battlements: { label: "Battlements on top", type: "bool", def: false },
  ends: { label: "Close the gable ends (second block)", type: "bool", def: true },
};

/**
 * Every shape: its menu name, group, settings and defaults. `points`: can also be sized by placing
 * two blocks (the shape then fills the box between them).
 * @type {{ id: string, name: string, group: string, params: string[], defaults?: Values, points: boolean, about: string }[]}
 */
export const SHAPES = [
  { id: "line", name: "Line", group: "Basic", params: ["length", "thick", "dir"], points: true, about: "A straight line; with two blocks, from one to the other at any angle" },
  { id: "wall", name: "Wall", group: "Basic", params: ["width", "height", "thick", "pattern", "spacing"], points: true, about: "A wall across your view; with two blocks, between them (diagonals too)" },
  { id: "floor", name: "Floor or platform", group: "Basic", params: ["width", "depth", "thick", "pattern", "spacing"], points: true, about: "A flat area" },
  { id: "box", name: "Box or room", group: "Basic", params: ["width", "height", "depth", "fill", "pattern", "spacing"], defaults: { height: 4 }, points: true, about: "Hollow, filled, walls only or just the edges" },
  { id: "column", name: "Column or pillar", group: "Basic", params: ["height", "size", "round", "base"], defaults: { height: 5 }, points: false, about: "Square or round, with a base and top in the second block" },
  { id: "fence", name: "Fence or railing", group: "Basic", params: ["width", "height", "spacing", "gate", "lights"], defaults: { width: 9, height: 1 }, points: true, about: "Hold a fence or wall; posts every N in the second block, a gate and torches" },
  { id: "pen", name: "Animal pen", group: "Basic", params: ["width", "depth", "gate", "lights"], defaults: { width: 7, depth: 7 }, points: true, about: "A fence ring with a gate at the front and corner posts" },
  { id: "stairs", name: "Staircase", group: "Slopes and curves", params: ["width", "height", "under"], defaults: { width: 3, height: 5 }, points: true, about: "Hold stairs for real steps; rises away from you" },
  { id: "ramp", name: "Slope or ramp", group: "Slopes and curves", params: ["width", "height", "depth", "under"], defaults: { width: 3, height: 3, depth: 6 }, points: true, about: "Rises away from you over the depth" },
  { id: "arch", name: "Arch", group: "Slopes and curves", params: ["width", "height", "thick", "depth"], defaults: { width: 7, height: 5, depth: 1 }, points: true, about: "A round arch across your view" },
  { id: "circle", name: "Circle or ring", group: "Slopes and curves", params: ["radius", "thick", "filled"], points: true, about: "Flat on the ground" },
  { id: "cylinder", name: "Tower or cylinder", group: "Slopes and curves", params: ["radius", "height", "thick", "filled", "battlements"], defaults: { height: 8 }, points: true, about: "Round walls; battlements in the second block" },
  { id: "sphere", name: "Sphere", group: "Slopes and curves", params: ["radius", "hollow"], points: true, about: "A ball sitting on the ground" },
  { id: "dome", name: "Dome", group: "Slopes and curves", params: ["radius", "hollow"], points: true, about: "The top half of a sphere" },
  { id: "pyramid", name: "Pyramid", group: "Slopes and curves", params: ["width", "hollow"], defaults: { width: 9 }, points: true, about: "Hold stairs for smooth sides" },
  { id: "cone", name: "Cone or spire", group: "Slopes and curves", params: ["radius", "height", "hollow"], defaults: { height: 8 }, points: true, about: "A round point" },
  { id: "roof", name: "Roof", group: "Slopes and curves", params: ["width", "depth", "style", "ends"], defaults: { width: 7, depth: 9 }, points: true, about: "Hold stairs; the ridge runs away from you" },
  { id: "hut", name: "Small hut", group: "Ready-made", params: ["width", "depth", "height"], defaults: { width: 7, depth: 7, height: 4 }, points: false, about: "Walls of your block; floor, corners and roof of the second block; a doorway, windows and a lantern" },
  { id: "tower", name: "Watchtower", group: "Ready-made", params: ["height"], defaults: { height: 8 }, points: false, about: "Corner posts, a ladder, a platform with railings and lanterns" },
  { id: "bridge", name: "Bridge", group: "Ready-made", params: ["width", "length", "spacing", "lights"], defaults: { width: 5, length: 12, spacing: 6 }, points: false, about: "A deck of your block, railings of the second block (oak fence without one) and lanterns" },
  { id: "lamp", name: "Lamp post", group: "Ready-made", params: ["height"], defaults: { height: 4 }, points: false, about: "A post of the second block (oak fence without one) with a lantern" },
  { id: "farm", name: "Farm plot", group: "Ready-made", params: ["width", "depth"], defaults: { width: 9, depth: 9 }, points: true, about: "A border of your block, farmland and a water channel down the middle" },
];

/** @param {string} id */
export const shapeOf = (id) => SHAPES.find((s) => s.id === id) ?? SHAPES[1];

/**
 * A shape's value for a setting: what the player chose, else the shape's default, else the setting's.
 * @param {string} shape @param {Values | undefined} values @param {string} key
 * @returns {any}
 */
export function valueOf(shape, values, key) {
  const v = values?.[key];
  const p = PARAMS[key];
  if (v !== undefined && p) {
    if (p.type === "int" && typeof v === "number") return v;
    if (p.type === "bool" && typeof v === "boolean") return v;
    if (p.type === "enum" && typeof v === "string" && p.choices?.includes(v)) return v;
  }
  return shapeOf(shape).defaults?.[key] ?? p?.def;
}

/**
 * The size of the box a shape fills when its size comes from the menu.
 * @param {string} shape @param {(key: string) => any} val
 * @returns {{ W: number, H: number, D: number }}
 */
export function boxOf(shape, val) {
  const r = val("radius"), t = val("thick");
  switch (shape) {
    case "line": {
      const L = val("length");
      switch (val("dir")) {
        case "across": return { W: L, H: t, D: t };
        case "up": return { W: t, H: L, D: t };
        case "diagonal": return { W: t, H: L + t - 1, D: L };
        default: return { W: t, H: t, D: L };
      }
    }
    case "wall": return { W: val("width"), H: val("height"), D: t };
    case "floor": return { W: val("width"), H: t, D: val("depth") };
    case "box": return { W: val("width"), H: val("height"), D: val("depth") };
    case "column": {
      const s = val("size") + (val("base") ? 2 : 0);
      return { W: s, H: val("height"), D: s };
    }
    case "fence": return { W: val("width"), H: val("height") + (val("lights") ? 1 : 0), D: 1 };
    case "pen": return { W: val("width"), H: val("lights") ? 2 : 1, D: val("depth") };
    case "stairs": return { W: val("width"), H: val("height"), D: val("height") };
    case "ramp": return { W: val("width"), H: val("height"), D: val("depth") };
    case "arch": return { W: val("width"), H: val("height"), D: val("depth") };
    case "circle": return { W: 2 * r + 1, H: 1, D: 2 * r + 1 };
    case "cylinder": return { W: 2 * r + 1, H: val("height") + (val("battlements") ? 1 : 0), D: 2 * r + 1 };
    case "sphere": return { W: 2 * r + 1, H: 2 * r + 1, D: 2 * r + 1 };
    case "dome": return { W: 2 * r + 1, H: r + 1, D: 2 * r + 1 };
    case "pyramid": return { W: val("width"), H: Math.ceil(val("width") / 2), D: val("width") };
    case "cone": return { W: 2 * r + 1, H: val("height"), D: 2 * r + 1 };
    case "roof": return { W: val("width"), H: Math.ceil(val("width") / 2), D: val("depth") };
    case "hut": return { W: Math.max(5, val("width")), H: Math.max(3, val("height")) + 1 + Math.ceil(Math.max(5, Math.min(val("width"), val("depth"))) / 2), D: Math.max(5, val("depth")) };
    case "tower": return { W: 5, H: Math.max(3, val("height")) + 3, D: 5 };
    case "bridge": return { W: Math.max(3, val("width")), H: val("lights") ? 3 : 2, D: val("length") };
    case "lamp": return { W: 1, H: Math.max(3, val("height")), D: 1 };
    case "farm": return { W: Math.max(3, val("width")), H: 1, D: Math.max(3, val("depth")) };
  }
  return { W: 1, H: 1, D: 1 };
}

/** Small deterministic hash for speckled patterns. @param {number} u @param {number} v @param {number} w */
const hash = (u, v, w) => {
  let h = (u * 73856093) ^ (v * 19349663) ^ (w * 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Thrown when a shape has more blocks than a build may place. */
export class TooBig extends Error {
  /** @param {number} n at least this many blocks */
  constructor(n) {
    super(`more than ${n} blocks`);
    this.n = n;
  }
}

/**
 * The cells of a shape.
 * @param {string} shape
 * @param {(key: string) => any} val the shape's settings
 * @param {number} W @param {number} H @param {number} D the box it fills
 * @param {{ a: number[], b: number[] }} [points] two-point mode: the two placed blocks, in box cells
 * @param {boolean} [stairs] the main block is a stair: slopes use stair cells
 * @param {number} [cap] stop (throw TooBig) once the shape has more cells than this, so a huge filled shape
 *   isn't laid out cell by cell only to be refused
 * @returns {Map<string, Cell>}
 */
export function cellsOf(shape, val, W, H, D, points, stairs = false, cap = Infinity) {
  /** @type {Map<string, Cell>} */
  const out = new Map();
  /** @param {number} u @param {number} v @param {number} w @param {Omit<Cell, "u" | "v" | "w">} c */
  const put = (u, v, w, c) => {
    if (u < 0 || v < 0 || w < 0 || u >= W || v >= H || w >= D) return;
    out.set(`${u},${v},${w}`, { u, v, w, ...c });
    if (out.size > cap) throw new TooBig(out.size);
  };
  /** @param {number} u @param {number} v @param {number} w */
  const del = (u, v, w) => out.delete(`${u},${v},${w}`);
  const M = { k: /** @type {"m"} */ ("m") };
  const A = { k: /** @type {"a"} */ ("a") };
  /** @param {[number, number]} d */
  const S = (d, up = false) => (stairs ? { k: /** @type {"s"} */ ("s"), d, up } : M);
  const F = /** @type {[number, number]} */ ([0, 1]), B = /** @type {[number, number]} */ ([0, -1]);
  const R = /** @type {[number, number]} */ ([1, 0]), L = /** @type {[number, number]} */ ([-1, 0]);
  const t = Math.max(1, val("thick") ?? 1);
  const cx = (W - 1) / 2, cz = (D - 1) / 2;

  /** Fills a whole box with a cell maker. @param {(u: number, v: number, w: number) => Omit<Cell, "u" | "v" | "w"> | undefined} fn */
  const each = (fn) => {
    for (let v = 0; v < H; v++) for (let w = 0; w < D; w++) for (let u = 0; u < W; u++) {
      const c = fn(u, v, w);
      if (c) put(u, v, w, c);
    }
  };

  /**
   * The surface of a solid: cells of it with a cell outside it within `t` along the listed axes.
   * @param {(u: number, v: number, w: number) => boolean} solid
   * @param {{ x?: boolean, up?: boolean, down?: boolean }} axes which ways count as "outside" (x: u and w)
   * @param {number} thickness
   */
  const shell = (solid, axes, thickness) => (/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ w) => {
    if (!solid(u, v, w)) return false;
    for (let k = 1; k <= thickness; k++) {
      if (axes.x && (!solid(u + k, v, w) || !solid(u - k, v, w) || !solid(u, v, w + k) || !solid(u, v, w - k))) return true;
      if (axes.up && !solid(u, v + k, w)) return true;
      if (axes.down && !solid(u, v - k, w)) return true;
    }
    return false;
  };
  /** @param {number} u @param {number} v @param {number} w */
  const inBox = (u, v, w) => u >= 0 && v >= 0 && w >= 0 && u < W && v < H && w < D;

  /** Second-block patterns over main cells. */
  const pattern = () => {
    const p = val("pattern"), n = val("spacing") ?? 4;
    if (!p || p === "plain") return;
    for (const c of out.values()) {
      if (c.k !== "m") continue;
      const { u, v, w } = c;
      let acc = false;
      if (p === "checker") acc = (u + v + w) % 2 === 1;
      else if (p === "stripes") acc = shape === "floor" ? u % 2 === 1 : v % 2 === 1;
      else if (p === "speckled") acc = hash(u, v, w) < 0.3;
      else if (p === "border") {
        const eu = u === 0 || u === W - 1, ev = v === 0 || v === H - 1, ew = w === 0 || w === D - 1;
        acc = shape === "wall" ? eu || ev : shape === "floor" ? eu || ew : (eu && ev) || (eu && ew) || (ev && ew);
      } else if (p === "pillars") {
        const pu = u % n === 0 || u === W - 1, pw = w % n === 0 || w === D - 1;
        acc = shape === "wall" ? pu : shape === "floor" ? u % n === 0 || w % n === 0 || u === W - 1 || w === D - 1 : pu && pw;
      }
      if (acc) c.k = "a";
    }
  };

  /** 3D line from a to b (inclusive), cells as [u, v, w]. @param {number[]} a @param {number[]} b */
  const line3 = (a, b) => {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2]));
    const cells = [];
    for (let i = 0; i <= n; i++) {
      const f = n ? i / n : 0;
      cells.push([Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)]);
    }
    return cells;
  };

  /** Ring of a rectangle inset `i` at height v, as stairs rising inward when `slope`. @param {number} v @param {number} i @param {boolean} slope */
  const ringLayer = (v, i, slope) => {
    const u0 = i, u1 = W - 1 - i, w0 = i, w1 = D - 1 - i;
    if (u0 > u1 || w0 > w1) return false;
    for (let u = u0; u <= u1; u++) for (let w = w0; w <= w1; w++) {
      const edge = u === u0 || u === u1 || w === w0 || w === w1;
      if (!edge) continue;
      if (!slope || u0 === u1 || w0 === w1) put(u, v, w, slope && (u0 === u1 || w0 === w1) ? A : M);
      else put(u, v, w, S(w === w0 ? F : w === w1 ? B : u === u0 ? R : L));
    }
    return true;
  };

  switch (shape) {
    case "line": {
      if (points) for (const [u, v, w] of line3(points.a, points.b)) put(u, v, w, M);
      else if (val("dir") === "diagonal") {
        for (let i = 0; i < D; i++) for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) put(a, i + b, i, M);
      } else each(() => M);
      break;
    }
    case "wall": {
      if (points) {
        const a = points.a, b = points.b;
        for (const [u, , w] of line3([a[0], 0, a[2]], [b[0], 0, b[2]])) for (let v = 0; v < H; v++) put(u, v, w, M);
      } else each(() => M);
      pattern();
      break;
    }
    case "floor":
      each(() => M);
      pattern();
      break;
    case "box": {
      const f = val("fill");
      each((u, v, w) => {
        const eu = u === 0 || u === W - 1, ev = v === 0 || v === H - 1, ew = w === 0 || w === D - 1;
        if (f === "filled") return M;
        if (f === "walls") return eu || ew ? M : undefined;
        if (f === "frame") return (eu && ev) || (eu && ew) || (ev && ew) ? M : undefined;
        return eu || ev || ew ? M : undefined;
      });
      pattern();
      break;
    }
    case "column": {
      const base = val("base"), round = val("round");
      const inner = base ? 1 : 0;
      const r = (W - 2 * inner) / 2, rb = W / 2;
      each((u, v, w) => {
        const capital = base && (v === 0 || v === H - 1);
        const rad = capital ? rb : r;
        const du = u - cx, dw = w - cz;
        const inside = round ? du * du + dw * dw <= rad * rad + 0.25 : Math.abs(du) < rad && Math.abs(dw) < rad;
        return inside ? (capital ? A : M) : undefined;
      });
      break;
    }
    case "fence": {
      const n = val("spacing"), lights = val("lights"), gate = val("gate");
      const top = lights ? H - 2 : H - 1;
      const mid = Math.floor((W - 1) / 2);
      for (let u = 0; u < W; u++) {
        const post = u % n === 0 || u === W - 1;
        for (let v = 0; v <= top; v++) put(u, v, 0, post ? A : M);
        if (post && lights) put(u, top + 1, 0, { k: "x", id: "minecraft:torch" });
      }
      if (gate && W >= 3) {
        put(mid, 0, 0, { k: "g", d: F });
        for (let v = 1; v < H; v++) del(mid, v, 0);
      }
      break;
    }
    case "pen": {
      const lights = val("lights"), gate = val("gate");
      for (let u = 0; u < W; u++) for (let w = 0; w < D; w++) {
        if (!(u === 0 || u === W - 1 || w === 0 || w === D - 1)) continue;
        const corner = (u === 0 || u === W - 1) && (w === 0 || w === D - 1);
        put(u, 0, w, corner ? A : M);
        if (corner && lights) put(u, 1, w, { k: "x", id: "minecraft:torch" });
      }
      if (gate && W >= 3) put(Math.floor((W - 1) / 2), 0, 0, { k: "g", d: F });
      break;
    }
    case "stairs": {
      for (let w = 0; w < D; w++) {
        const v = Math.min(H - 1, Math.floor((w * H) / D));
        for (let u = 0; u < W; u++) {
          put(u, v, w, S(F));
          if (val("under")) for (let y = 0; y < v; y++) put(u, y, w, M);
        }
      }
      break;
    }
    case "ramp": {
      let last = -1;
      for (let w = 0; w < D; w++) {
        const top = Math.max(0, Math.round(((w + 1) * H) / D) - 1);
        const rising = top > last && w < D - 1;
        for (let u = 0; u < W; u++) {
          put(u, top, w, rising ? S(F) : M);
          if (val("under")) for (let y = 0; y < top; y++) put(u, y, w, M);
          else if (top > 0 && rising && stairs) put(u, top - 1, w, M);
        }
        last = top;
      }
      break;
    }
    case "arch": {
      const a = W / 2, b = H, ai = Math.max(0, a - t), bi = Math.max(0, b - t);
      each((u, v) => {
        const x = u - cx, y = v + 0.5;
        const outer = (x * x) / (a * a) + (y * y) / (b * b) <= 1;
        const inner = ai > 0 && bi > 0 && (x * x) / (ai * ai) + (y * y) / (bi * bi) <= 1;
        // The legs: below the arch's widest point the band keeps its full width down to the ground.
        return outer && !inner ? M : undefined;
      });
      break;
    }
    case "circle":
    case "cylinder": {
      const rx = W / 2, rz = D / 2;
      const disk = (/** @type {number} */ u, /** @type {number} */ w) => {
        const x = (u - cx) / rx, z = (w - cz) / rz;
        return x * x + z * z <= 1;
      };
      const walls = shape === "cylinder" && val("battlements") ? H - 1 : H;
      const solid = (/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ w) => inBox(u, v, w) && v < walls && disk(u, w);
      const ring = shell(solid, { x: true }, t);
      each((u, v, w) => (v < walls && (val("filled") ? solid(u, v, w) : ring(u, v, w)) ? M : undefined));
      if (walls < H) {
        // Battlements: every other cell of the outer ring, one block up.
        const outerRing = shell(solid, { x: true }, 1);
        for (let u = 0; u < W; u++) for (let w = 0; w < D; w++) if (outerRing(u, walls - 1, w) && (u + w) % 2 === 0) put(u, walls, w, A);
      }
      break;
    }
    case "sphere":
    case "dome": {
      const rx = W / 2, rz = D / 2;
      const dome = shape === "dome";
      const ry = dome ? H - 0.5 : H / 2, cy = dome ? 0 : (H - 1) / 2;
      const solid = (/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ w) => {
        if (!inBox(u, v, w)) return dome && v < 0 && u >= 0 && w >= 0 && u < W && w < D ? solidAt(u, 0, w) : false;
        return solidAt(u, v, w);
      };
      const solidAt = (/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ w) => {
        const x = (u - cx) / rx, y = (v - cy) / ry, z = (w - cz) / rz;
        return x * x + y * y + z * z <= 1;
      };
      const surface = shell(solid, { x: true, up: true, down: true }, 1);
      each((u, v, w) => ((val("hollow") ? surface(u, v, w) : solid(u, v, w)) ? M : undefined));
      break;
    }
    case "pyramid": {
      const half = Math.min(W, D) / 2;
      const inset = (/** @type {number} */ v) => Math.floor((v * half) / H);
      const solid = (/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ w) => {
        if (!inBox(u, v, w)) return false;
        const i = inset(v);
        return u >= i && u <= W - 1 - i && w >= i && w <= D - 1 - i;
      };
      const surface = shell(solid, { x: true, up: true }, 1);
      each((u, v, w) => ((val("hollow") ? surface(u, v, w) : solid(u, v, w)) ? M : undefined));
      // With stairs, each layer's outer ring becomes steps facing out (the top stays full blocks).
      if (stairs) for (let v = 0; v < H - 1; v++) if (inset(v + 1) > inset(v)) ringLayer(v, inset(v), true);
      break;
    }
    case "cone": {
      const rx = W / 2, rz = D / 2;
      const solid = (/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ w) => {
        if (!inBox(u, v, w)) return false;
        const s = 1 - v / H;
        const x = (u - cx) / (rx * s), z = (w - cz) / (rz * s);
        return x * x + z * z <= 1 || (Math.abs(u - cx) < 0.6 && Math.abs(w - cz) < 0.6);
      };
      const surface = shell(solid, { x: true, up: true }, 1);
      each((u, v, w) => ((val("hollow") ? surface(u, v, w) : solid(u, v, w)) ? M : undefined));
      break;
    }
    case "roof": {
      const hip = val("style") === "hip";
      for (let v = 0; v < H; v++) {
        if (hip) {
          if (!ringLayer(v, v, true)) break;
          continue;
        }
        const u0 = v, u1 = W - 1 - v;
        if (u0 > u1) break;
        for (let w = 0; w < D; w++) {
          if (u0 === u1) put(u0, v, w, A);
          else {
            put(u0, v, w, S(R));
            put(u1, v, w, S(L));
          }
          if (val("ends") && (w === 0 || w === D - 1)) for (let u = u0 + 1; u < u1; u++) put(u, v, w, A);
        }
      }
      break;
    }
    case "hut": {
      const wallTop = H - 1 - Math.ceil(Math.min(W, D) / 2); // walls from 1 to wallTop
      for (let u = 0; u < W; u++) for (let w = 0; w < D; w++) {
        put(u, 0, w, A);
        const eu = u === 0 || u === W - 1, ew = w === 0 || w === D - 1;
        if (!eu && !ew) continue;
        for (let v = 1; v <= wallTop; v++) put(u, v, w, eu && ew ? A : M);
      }
      const mid = Math.floor((W - 1) / 2), midD = Math.floor((D - 1) / 2);
      // A doorway in the front, windows in the other three walls.
      for (let v = 1; v <= Math.min(2, wallTop); v++) del(mid, v, 0);
      if (wallTop >= 3) {
        put(mid, 2, D - 1, { k: "x", id: "minecraft:glass_pane" });
        put(0, 2, midD, { k: "x", id: "minecraft:glass_pane" });
        put(W - 1, 2, midD, { k: "x", id: "minecraft:glass_pane" });
      }
      // A hip roof of the second block, one layer per step.
      for (let i = 0, v = wallTop + 1; v < H; i++, v++) {
        const u0 = i, u1 = W - 1 - i, w0 = i, w1 = D - 1 - i;
        if (u0 > u1 || w0 > w1) break;
        for (let u = u0; u <= u1; u++) for (let w = w0; w <= w1; w++) {
          const top = u0 + 1 >= u1 || w0 + 1 >= w1;
          if (top || u === u0 || u === u1 || w === w0 || w === w1) put(u, v, w, A);
        }
      }
      // A lantern on the floor in a back corner.
      put(1, 1, D - 2, { k: "x", id: "minecraft:lantern" });
      break;
    }
    case "tower": {
      const top = H - 3; // the platform
      for (let v = 0; v < top; v++) {
        for (const [u, w] of [[0, 0], [4, 0], [0, 4], [4, 4]]) put(u, v, w, A);
        put(2, v, 2, { k: "m", full: true }); // the ladder's backing
        put(2, v, 1, { k: "x", id: "minecraft:ladder", d: B });
      }
      for (let u = 0; u < 5; u++) for (let w = 0; w < 5; w++) {
        if (u === 2 && w === 1) put(u, top, w, { k: "x", id: "minecraft:ladder", d: B });
        else put(u, top, w, M);
        const edge = u === 0 || u === 4 || w === 0 || w === 4;
        if (edge) put(u, top + 1, w, { k: "a", fb: "minecraft:oak_fence" });
      }
      for (const [u, w] of [[0, 0], [4, 0], [0, 4], [4, 4]]) put(u, top + 2, w, { k: "x", id: "minecraft:lantern" });
      break;
    }
    case "bridge": {
      const n = val("spacing"), lights = val("lights");
      for (let w = 0; w < D; w++) for (let u = 0; u < W; u++) {
        put(u, 0, w, M);
        if (u === 0 || u === W - 1) {
          put(u, 1, w, { k: "a", fb: "minecraft:oak_fence" });
          if (lights && (w % n === 0 || w === D - 1)) put(u, 2, w, { k: "x", id: "minecraft:lantern" });
        }
      }
      break;
    }
    case "lamp": {
      put(0, 0, 0, M);
      for (let v = 1; v < H - 1; v++) put(0, v, 0, { k: "a", fb: "minecraft:oak_fence" });
      put(0, H - 1, 0, { k: "x", id: "minecraft:lantern" });
      break;
    }
    case "farm": {
      const mid = Math.floor((W - 1) / 2);
      for (let u = 0; u < W; u++) for (let w = 0; w < D; w++) {
        const edge = u === 0 || u === W - 1 || w === 0 || w === D - 1;
        if (edge) put(u, 0, w, M);
        else if (u === mid) put(u, 0, w, { k: "x", id: "minecraft:water" });
        else put(u, 0, w, { k: "x", id: "minecraft:farmland" });
      }
      break;
    }
  }
  return out;
}
