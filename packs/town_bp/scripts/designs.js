// Town Projects' built-in designs: the blocks of each build and the box it covers. No @minecraft import, so the unit
// tests (tools/town-designs.test.mjs) run it in node. Footprints must never change for an existing design: saved
// spots keep the box (`b`) and the structure snapshot of the ground they covered when they were built.

/** The built-in designs a project's `build` can name. */
export const BUILDS = /** @type {const} */ (["well", "lamps", "stall", "bell_tower", "dock", "garden", "notice_board", "house", "pen"]);

/** The job-site block a house gets when none is named. */
export const DEFAULT_JOB = "minecraft:composter";

/** @typedef {typeof BUILDS[number]} Build */
/**
 * What each placement may replace: "air" air and plants; "ground" also grass and dirt (the top of the
 * ground, for a well's water or a garden's farmland); "water" also water (a dock's deck); "wet" only
 * water (a dock's posts, down to the bottom).
 * @typedef {"air" | "ground" | "water" | "wet"} Mode
 * @typedef {{ x: number, y: number, z: number, block: string, states?: Record<string, string | number | boolean>, mode: Mode, dir?: number, axis?: "x" | "z", pair?: 1 }} Place
 * x: to the right, y: up from the spot (0 = feet, -1 = the ground), z: forward. Only a house's places use the rest:
 * dir, the way the block points (0 forward, 1 right, 2 back, 3 left), turned with the spot by placeStates; axis, the
 * local axis a glass pane runs along (its connections); pair 1 on the second half of a bed or a door, which goes in
 * with the half before it or not at all.
 */
/** @typedef {{ x: number, y: number, z: number }} Vec */
/** @typedef {{ x: number, y: number, z: number, f: number }} Facing f: 0 south, 1 west, 2 north, 3 east */
/** @typedef {{ min: Vec, max: Vec }} Box inclusive block corners */

/**
 * The blocks of a build, in placing order (supports first). `job`: a house's job-site block (DEFAULT_JOB when not given).
 * @param {Build} kind @param {string} [job] @returns {Place[]}
 */
export function design(kind, job) {
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
    case "house": {
      // A 7 x 7 cottage, x -3..3, z 1..7: log corners, planks walls 3 high with glass panes, the door in the middle of
      // the front wall (facing the spot), a slab roof; inside a bed, the job-site block and a lantern.
      for (let x = -2; x <= 2; x++) for (let z = 2; z <= 6; z++) at(x, -1, z, "minecraft:oak_planks", "ground"); // the floor, where it's grass or dirt
      for (let y = 0; y <= 2; y++)
        for (let x = -3; x <= 3; x++)
          for (let z = 1; z <= 7; z++) {
            const side = Math.abs(x) === 3;
            if (!side && z !== 1 && z !== 7) continue; // inside
            if (x === 0 && z === 1 && y <= 1) continue; // the doorway
            const corner = side && (z === 1 || z === 7);
            const pane = y === 1 && ((z === 1 && Math.abs(x) === 2) || (z === 7 && Math.abs(x) <= 1) || (side && z === 4));
            if (corner) at(x, y, z, "minecraft:oak_log");
            else if (pane) out.push({ x, y, z, block: "minecraft:glass_pane", mode: "air", axis: side ? "z" : "x" });
            else at(x, y, z, "minecraft:oak_planks");
          }
      const door = { door_hinge_bit: false, open_bit: false };
      out.push({ x: 0, y: 0, z: 1, block: "minecraft:wooden_door", mode: "air", states: { ...door, upper_block_bit: false }, dir: 0 });
      out.push({ x: 0, y: 1, z: 1, block: "minecraft:wooden_door", mode: "air", states: { ...door, upper_block_bit: true }, dir: 0, pair: 1 });
      for (let x = -3; x <= 3; x++) for (let z = 1; z <= 7; z++) at(x, 3, z, "minecraft:oak_slab", "air", slab);
      // The bed: its foot, then its head toward the back wall.
      out.push({ x: 2, y: 0, z: 5, block: "minecraft:bed", mode: "air", states: { head_piece_bit: false, occupied_bit: false }, dir: 0 });
      out.push({ x: 2, y: 0, z: 6, block: "minecraft:bed", mode: "air", states: { head_piece_bit: true, occupied_bit: false }, dir: 0, pair: 1 });
      at(-2, 0, 6, job ?? DEFAULT_JOB);
      at(-2, 0, 2, "minecraft:lantern", "air", { hanging: false });
      break;
    }
    case "pen":
      // The garden pen: a 5 x 5 ring of oak fence, x -2..2, z 1..5, with a gate in the middle of the front side (facing
      // the spot, so it opens toward the town's center). Its animals are spawned once it is built (main.js).
      for (let x = -2; x <= 2; x++)
        for (let z = 1; z <= 5; z++) {
          if (Math.abs(x) !== 2 && z !== 1 && z !== 5) continue;
          if (x === 0 && z === 1) out.push({ x, y: 0, z, block: "minecraft:fence_gate", mode: "air", states: { in_wall_bit: false, open_bit: false }, dir: 0 });
          else at(x, 0, z, "minecraft:oak_fence");
        }
      break;
  }
  return out;
}

/**
 * A block of a design that's only needed where it's open (a dock's posts, the floor under a well's or a garden's water)
 * or nice to have (a house's floor, laid only where the ground is grass or dirt). @param {string} build @param {Place} pl
 */
export const isOptionalPlace = (build, pl) => pl.mode === "wet" || ((build === "well" || build === "garden") && pl.y === -2) || (build === "house" && pl.y === -1);

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

const CARDINAL = ["south", "west", "north", "east"];

/**
 * A place's block states in the world at a spot facing `f`: a bed's `direction` and a door's (or a fence gate's)
 * `minecraft:cardinal_direction` turned with the spot (both use 0 south, 1 west, 2 north, 3 east, as FORWARD), and a
 * glass pane connected along the wall it sits in. Every other place keeps its states as they are.
 * @param {Place} pl @param {number} f @returns {Record<string, string | number | boolean> | undefined}
 */
export function placeStates(pl, f) {
  if (pl.dir === undefined && pl.axis === undefined) return pl.states;
  const face = FORWARD[f] ? f : 0;
  /** @type {Record<string, string | number | boolean>} */
  const st = { ...pl.states };
  if (pl.dir !== undefined) {
    const w = (((face + pl.dir) % 4) + 4) % 4;
    if (pl.block === "minecraft:bed") st.direction = w;
    else st["minecraft:cardinal_direction"] = CARDINAL[w];
  }
  if (pl.axis !== undefined) {
    const fw = FORWARD[face];
    // Local x runs to the right (-forward.z, forward.x); local z runs forward.
    const alongX = pl.axis === "x" ? fw.z !== 0 : fw.x !== 0;
    st["minecraft:connection_east"] = alongX;
    st["minecraft:connection_west"] = alongX;
    st["minecraft:connection_north"] = !alongX;
    st["minecraft:connection_south"] = !alongX;
  }
  return st;
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

/**
 * The column (x, z) of a saved structure placed with its corner at a spot and turned `s.f` quarter turns clockwise
 * (Bedrock's StructureRotation, as build() places it) that lies under the world column (wx, wz); undefined outside it.
 * @param {Facing} s @param {{ x: number, z: number }} size the structure's own size @param {number} wx @param {number} wz
 * @returns {{ x: number, z: number } | undefined}
 */
export function structureLocal(s, size, wx, wz) {
  const dx = wx - s.x;
  const dz = wz - s.z;
  const f = (((s.f ?? 0) % 4) + 4) % 4;
  const [x, z] = f === 0 ? [dx, dz] : f === 1 ? [dz, size.z - 1 - dx] : f === 2 ? [size.x - 1 - dx, size.z - 1 - dz] : [size.x - 1 - dz, dx];
  return x < 0 || z < 0 || x >= size.x || z >= size.z ? undefined : { x, z };
}

/**
 * What a build puts in each block it may change, "x,y,z" -> block ids: the leveling plan's cuts (air up to 5 above the
 * new top), fills (dirt up to 3 under it) and new top, then the design's blocks. Remove spot puts the saved ground back
 * only in these blocks, and only where the block now is one of these (or air): any other block is a player's (F37).
 * Farmland also counts as dirt (trampled).
 * @param {Facing} s @param {Place[]} places @param {{ x: number, z: number, t: number }[]} [plan] @param {string} [top]
 * @returns {Map<string, Set<string>>}
 */
export function buildCells(s, places, plan = [], top = "minecraft:grass_block") {
  /** @type {Map<string, Set<string>>} */
  const out = new Map();
  /** @param {number} x @param {number} y @param {number} z @param {string} id */
  const add = (x, y, z, id) => {
    const k = `${x},${y},${z}`;
    let set = out.get(k);
    if (!set) out.set(k, (set = new Set()));
    set.add(id);
    if (id === "minecraft:farmland") set.add("minecraft:dirt");
  };
  for (const c of plan) {
    for (let y = c.t + 1; y <= c.t + 5; y++) add(c.x, y, c.z, "minecraft:air");
    for (let y = c.t - 3; y <= c.t - 1; y++) add(c.x, y, c.z, "minecraft:dirt");
    add(c.x, c.t, c.z, top);
  }
  for (const pl of places) {
    const w = toWorld(s, pl.x, pl.y, pl.z);
    add(w.x, w.y, w.z, pl.block);
  }
  return out;
}
