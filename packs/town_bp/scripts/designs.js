// Town Projects' built-in designs: the blocks of each build and the box it covers. No @minecraft import, so the unit
// tests (tools/town-designs.test.mjs) run it in node. Footprints must never change for an existing design: saved
// spots keep the box (`b`) and the structure snapshot of the ground they covered when they were built.

/** The built-in designs a project's `build` can name. */
export const BUILDS = /** @type {const} */ (["well", "lamps", "stall", "bell_tower", "dock", "garden", "notice_board"]);

/** @typedef {typeof BUILDS[number]} Build */
/**
 * What each placement may replace: "air" air and plants; "ground" also grass and dirt (the top of the
 * ground, for a well's water or a garden's farmland); "water" also water (a dock's deck); "wet" only
 * water (a dock's posts, down to the bottom).
 * @typedef {"air" | "ground" | "water" | "wet"} Mode
 * @typedef {{ x: number, y: number, z: number, block: string, states?: Record<string, string | number | boolean>, mode: Mode }} Place
 * x: to the right, y: up from the spot (0 = feet, -1 = the ground), z: forward
 */
/** @typedef {{ x: number, y: number, z: number }} Vec */
/** @typedef {{ x: number, y: number, z: number, f: number }} Facing f: 0 south, 1 west, 2 north, 3 east */
/** @typedef {{ min: Vec, max: Vec }} Box inclusive block corners */

/** The blocks of a build, in placing order (supports first). @param {Build} kind @returns {Place[]} */
export function design(kind) {
  /** @type {Place[]} */
  const out = [];
  /** @param {number} x @param {number} y @param {number} z @param {string} block @param {Mode} [mode] @param {Record<string, string | number | boolean>} [states] */
  const at = (x, y, z, block, mode = "air", states) => out.push({ x, y, z, block, mode, states });
  const slab = { "minecraft:vertical_half": "bottom" };
  switch (kind) {
    case "well":
      for (let x = -2; x <= 2; x++)
        for (let z = 1; z <= 5; z++) {
          const ring = Math.abs(x) === 2 || z === 1 || z === 5;
          if (!ring) at(x, -2, z, "minecraft:cobblestone"); // only where it's open below, so the water can't drain into a cave
          at(x, -1, z, ring ? "minecraft:cobblestone" : "minecraft:water", "ground");
          if (ring) at(x, 0, z, "minecraft:cobblestone");
        }
      for (const [x, z] of [[-2, 1], [2, 1], [-2, 5], [2, 5]]) for (let y = 1; y <= 2; y++) at(x, y, z, "minecraft:oak_fence");
      for (let x = -2; x <= 2; x++) for (let z = 1; z <= 5; z++) at(x, 3, z, "minecraft:oak_slab", "air", slab);
      break;
    case "lamps":
      for (let z = 0; z <= 12; z += 4) {
        for (let y = 0; y <= 2; y++) at(0, y, z, "minecraft:oak_fence");
        at(0, 3, z, "minecraft:lantern", "air", { hanging: false });
      }
      break;
    case "stall":
      for (const [x, z] of [[-2, 1], [2, 1], [-2, 3], [2, 3]]) for (let y = 0; y <= 2; y++) at(x, y, z, "minecraft:oak_fence");
      for (let x = -1; x <= 1; x++) at(x, 0, 1, "minecraft:oak_planks");
      at(-1, 0, 3, "minecraft:barrel");
      at(1, 0, 3, "minecraft:barrel");
      for (let x = -2; x <= 2; x++) for (let z = 1; z <= 3; z++) at(x, 3, z, (x + 2) % 2 === 0 ? "minecraft:red_wool" : "minecraft:white_wool");
      break;
    case "bell_tower":
      for (const [x, z] of [[-1, 1], [1, 1], [-1, 3], [1, 3]]) for (let y = 0; y <= 4; y++) at(x, y, z, "minecraft:stone_bricks");
      for (let x = -1; x <= 1; x++) for (let z = 1; z <= 3; z++) at(x, 5, z, "minecraft:stone_bricks");
      at(0, 6, 2, "minecraft:stone_bricks");
      at(0, 7, 2, "minecraft:lightning_rod", "air", { facing_direction: 1 });
      at(0, 4, 2, "minecraft:bell", "air", { attachment: "hanging" });
      break;
    case "dock": {
      const length = 10;
      for (let z = 1; z <= length; z++) for (let x = -1; x <= 1; x++) at(x, -1, z, "minecraft:oak_planks", "water");
      for (let z = 2; z <= length; z += 3) for (const x of [-1, 1]) for (let y = -2; y >= -9; y--) at(x, y, z, "minecraft:oak_log", "wet");
      for (let z = 1; z <= length; z++) for (const x of [-1, 1]) at(x, 0, z, "minecraft:oak_fence");
      at(-1, 1, length, "minecraft:lantern", "air", { hanging: false });
      at(1, 1, length, "minecraft:lantern", "air", { hanging: false });
      break;
    }
    case "garden": {
      const crops = ["minecraft:wheat", "minecraft:carrots", "minecraft:potatoes", "minecraft:beetroot"];
      let k = 0;
      for (let x = -2; x <= 2; x++)
        for (let z = 1; z <= 5; z++) {
          const border = Math.abs(x) === 2 || z === 1 || z === 5;
          const middle = x === 0 && z === 3;
          if (middle) at(x, -2, z, "minecraft:dirt");
          at(x, -1, z, border ? "minecraft:oak_log" : middle ? "minecraft:water" : "minecraft:farmland", "ground", middle || border ? undefined : { moisturized_amount: 7 });
          if (middle) at(x, 0, z, "minecraft:waterlily");
          else if (!border) at(x, 0, z, crops[k++ % crops.length], "air", { growth: 0 });
        }
      break;
    }
    case "notice_board":
      for (const x of [-2, 2]) for (let y = 0; y <= 2; y++) at(x, y, 1, "minecraft:oak_log");
      for (let x = -1; x <= 1; x++) for (let y = 1; y <= 2; y++) at(x, y, 1, "minecraft:oak_planks");
      for (let x = -2; x <= 2; x++) at(x, 3, 1, "minecraft:oak_slab", "air", slab);
      // Signs on the front, facing the spot: filled in by refreshBoard.
      for (let x = -1; x <= 1; x++) out.push({ x, y: 1, z: 0, block: "minecraft:wall_sign", mode: "air" });
      break;
  }
  return out;
}

/** A block of a design that's only needed where it's open (a dock's posts, the floor under a well's or a garden's water). @param {string} build @param {Place} pl */
export const isOptionalPlace = (build, pl) => pl.mode === "wet" || ((build === "well" || build === "garden") && pl.y === -2);

/** Forward, by the spot's facing. */
export const FORWARD = [
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
  { x: 1, z: 0 },
];

/** Local (right, up, forward) to world. @param {Facing} s @param {number} x @param {number} y @param {number} z @returns {Vec} */
export function toWorld(s, x, y, z) {
  const f = FORWARD[s.f] ?? FORWARD[0];
  const r = { x: -f.z, z: f.x };
  return { x: s.x + r.x * x + f.x * z, y: s.y + y, z: s.z + r.z * x + f.z * z };
}

/** @type {Map<string, Box>} */
const localBoxes = new Map();

/** The box a built-in design covers, in (right, up, forward) from the spot, read from design(). @param {Build} kind @returns {Box} */
export function localBox(kind) {
  let box = localBoxes.get(kind);
  if (box) return box;
  const places = design(kind);
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const pl of places) {
    for (const k of /** @type {const} */ (["x", "y", "z"])) {
      min[k] = Math.min(min[k], pl[k]);
      max[k] = Math.max(max[k], pl[k]);
    }
  }
  box = places.length ? { min, max } : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  localBoxes.set(kind, box);
  return box;
}

/** The world box a built-in design covers at a spot, turned the way the spot faces. @param {Build} kind @param {Facing} s @returns {Box} */
export function designFootprint(kind, s) {
  const lb = localBox(kind);
  const a = toWorld(s, lb.min.x, lb.min.y, lb.min.z);
  const b = toWorld(s, lb.max.x, lb.max.y, lb.max.z);
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  };
}
