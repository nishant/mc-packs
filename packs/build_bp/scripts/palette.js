// The palette: which of your blocks a build uses when its main block is "a palette of your blocks", and how
// they are spread over the shape (random, weighted, checkerboard, stripes, gradient, brick, noise, marble,
// border, wave, spiral, dissolve). Patterns work on world positions, so neighboring builds line up.
import { BlockPermutation } from "@minecraft/server";

/**
 * @typedef {object} Palette
 * @property {"hotbar" | "inventory" | "both"} from
 * @property {string} pattern one of PATTERNS
 * @property {"y" | "x" | "z"} dir the direction stripes, gradients, waves and dissolves run along
 * @property {number} scale 1..16: stripe width, noise size...
 */

/** @type {Palette} */
export const DEFAULT_PALETTE = { from: "hotbar", pattern: "random", dir: "y", scale: 2 };

export const FROM = ["hotbar", "inventory", "both"];
export const FROM_NAMES = ["Your hotbar", "Your inventory (not the hotbar)", "Hotbar and inventory"];
export const PATTERNS = ["random", "count", "slot", "unique", "checker", "stripes", "gradient", "brick", "noise", "marble", "border", "wave", "spiral", "dissolve"];
export const PATTERN_NAMES = [
  "Random (each slot alike)",
  "Random, weighted by how many you have",
  "Random, weighted by slot (left slots more)",
  "Random, each kind of block alike",
  "Checkerboard",
  "Stripes",
  "Gradient (in palette order)",
  "Brick (offset rows)",
  "Noise (patches)",
  "Marble (wavy veins)",
  "Border (first block on the edges)",
  "Wave",
  "Spiral (around the middle)",
  "Dissolve (a gradient that crumbles)",
];
export const DIRS = ["y", "x", "z"];
export const DIR_NAMES = ["Up", "East to west (x)", "North to south (z)"];

/** A saved value made safe. @param {any} p @returns {Palette} */
export function normalizePalette(p) {
  const o = p && typeof p === "object" ? p : {};
  return {
    from: FROM.includes(o.from) ? o.from : "hotbar",
    pattern: PATTERNS.includes(o.pattern) ? o.pattern : "random",
    dir: DIRS.includes(o.dir) ? o.dir : "y",
    scale: typeof o.scale === "number" && Number.isFinite(o.scale) ? Math.max(1, Math.min(16, Math.round(o.scale))) : 2,
  };
}

/** @param {Palette} p */
export const paletteLabel = (p) => PATTERN_NAMES[PATTERNS.indexOf(p.pattern)]?.replace(/ \(.*\)$/, "").toLowerCase() ?? p.pattern;

/** One palette slot: a block, its item, the slot it was in and how many of it the player has in all. */
/** @typedef {{ perm: BlockPermutation, item: string, slot: number, count: number }} Entry */

/** Deterministic 0..1 hash of a block position. @param {number} x @param {number} y @param {number} z @param {number} [s] */
export function hash3(x, y, z, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041) ^ Math.imul(s + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, about one bump every `size` blocks. @param {number} x @param {number} y @param {number} z @param {number} size */
function noise(x, y, z, size) {
  const fx = x / size, fy = y / size, fz = z / size;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const tx = fx - x0, ty = fy - y0, tz = fz - z0;
  const s = (/** @type {number} */ t) => t * t * (3 - 2 * t);
  const sx = s(tx), sy = s(ty), sz = s(tz);
  let v = 0;
  for (let dx = 0; dx < 2; dx++)
    for (let dy = 0; dy < 2; dy++)
      for (let dz = 0; dz < 2; dz++) v += hash3(x0 + dx, y0 + dy, z0 + dz, 7) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
  return v;
}

/**
 * A block chooser for one build.
 * @param {Entry[]} entries in slot order (at least one)
 * @param {Palette} pal
 * @param {boolean} survival random patterns only pick blocks the player still has
 * @param {{ min: { x: number, y: number, z: number }, max: { x: number, y: number, z: number } }} box the whole build
 * @returns {(x: number, y: number, z: number) => BlockPermutation}
 */
export function picker(entries, pal, survival, box) {
  const n = entries.length;
  const S = pal.scale;
  /** Position along the pattern's direction. @param {number} x @param {number} y @param {number} z */
  const along = (x, y, z) => (pal.dir === "x" ? x : pal.dir === "z" ? z : y);
  const lo = along(box.min.x, box.min.y, box.min.z), hi = along(box.max.x, box.max.y, box.max.z);
  const span = Math.max(1, hi - lo);
  /** The entry at a 0..1 fraction of the palette. @param {number} f */
  const at = (f) => entries[Math.max(0, Math.min(n - 1, Math.floor(f * n)))].perm;
  const idx = (/** @type {number} */ i) => entries[((i % n) + n) % n].perm;

  if (["random", "count", "slot", "unique"].includes(pal.pattern)) {
    /** @type {{ perm: BlockPermutation, item: string, w: number }[]} */
    let pool;
    if (pal.pattern === "unique") {
      /** @type {Map<string, { perm: BlockPermutation, item: string, w: number }>} */
      const kinds = new Map();
      for (const e of entries) if (!kinds.has(e.item)) kinds.set(e.item, { perm: e.perm, item: e.item, w: 1 });
      pool = [...kinds.values()];
    } else if (pal.pattern === "count") pool = entries.map((e) => ({ perm: e.perm, item: e.item, w: Math.max(1, e.count) }));
    else if (pal.pattern === "slot") pool = entries.map((e, i) => ({ perm: e.perm, item: e.item, w: n - i }));
    else pool = entries.map((e) => ({ perm: e.perm, item: e.item, w: 1 }));
    // Survival: never pick more of a block than the player has (as long as anything is left).
    /** @type {Map<string, number>} */
    const left = new Map();
    for (const e of entries) left.set(e.item, e.count);
    return () => {
      let total = 0;
      const live = pool.map((p) => {
        const w = !survival || (left.get(p.item) ?? 0) > 0 ? p.w : 0;
        total += w;
        return w;
      });
      if (total <= 0) {
        live.fill(1);
        total = live.length;
      }
      let r = Math.random() * total;
      let i = 0;
      for (; i < live.length - 1; i++) {
        r -= live[i];
        if (r < 0) break;
      }
      if (survival) left.set(pool[i].item, (left.get(pool[i].item) ?? 0) - 1);
      return pool[i].perm;
    };
  }
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  switch (pal.pattern) {
    case "checker":
      return (x, y, z) => idx(Math.floor(x / S) + Math.floor(y / S) + Math.floor(z / S));
    case "stripes":
      return (x, y, z) => idx(Math.floor(along(x, y, z) / S));
    case "gradient":
      return (x, y, z) => at((along(x, y, z) - lo + 0.5) / (span + 1));
    case "brick": {
      // Rows `scale` high; bricks 2 x scale long; every other row shifted by half a brick.
      const len = 2 * S;
      return (x, y, z) => {
        const row = Math.floor(y / S);
        const h = (pal.dir === "z" ? z : x) + (row % 2 ? S : 0);
        return idx(row + Math.floor(h / len));
      };
    }
    case "noise":
      return (x, y, z) => at(Math.min(0.999, noise(x, y, z, S + 1)));
    case "marble":
      return (x, y, z) => {
        const t = Math.sin((along(x, y, z) + noise(x, y, z, S + 2) * 6 * S) / (S + 1)) * 0.5 + 0.5;
        return at(Math.min(0.999, t));
      };
    case "border": {
      const rest = entries.length > 1 ? entries.slice(1) : entries;
      return (x, y, z) => {
        const edge = x === box.min.x || x === box.max.x || z === box.min.z || z === box.max.z || y === box.min.y || y === box.max.y;
        return edge ? entries[0].perm : rest[Math.floor(hash3(x, y, z) * rest.length)].perm;
      };
    }
    case "wave":
      return (x, y, z) => {
        const a = pal.dir === "y" ? x + z : y;
        return idx(Math.floor((along(x, y, z) + Math.sin(a / (S + 1)) * (S + 1)) / S));
      };
    case "spiral":
      return (x, y, z) => {
        const ang = Math.atan2(z - cz, x - cx) / (2 * Math.PI) + 0.5;
        return idx(Math.floor(ang * n + y / S));
      };
    case "dissolve":
      return (x, y, z) => at(Math.max(0, Math.min(0.999, (along(x, y, z) - lo + 0.5) / (span + 1) + (hash3(x, y, z, 3) - 0.5) * 0.5)));
  }
  return () => entries[0].perm;
}
