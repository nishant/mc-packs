// Structure builders for every story place (docs/STORY_BIBLE.md section 5).
//
// Each prefab is drawn once into a local blueprint (x east, y up, z south; the build's front faces
// north, -z) and then rotated and placed by buildSteps. Origin (0, 0, 0) is the ground center of the
// build: y 0 is the ground block the build stands on (its floor), people stand at y 1. Weathering
// (mossy and cracked variants, missing boards, rubble) comes from an RNG seeded by the place name
// and the origin, so a rebuild on the same spot is identical.

import { BlockPermutation, LiquidType } from "@minecraft/server";

/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Block} Block */
/** @typedef {{ x: number, y: number, z: number }} V3 */
/** @typedef {"land" | "coast" | "water" | "underground" | "sky" | "high"} Site */
/**
 * size: the box the build covers (x and z odd, centered on the origin); below: how many of the
 * size.y layers lie under the origin; y: fixed origin height for underground and sky places;
 * minDepth: water depth a water site needs; slope: most height difference a land site may have;
 * wet: a land site may be shallow water (a swamp).
 * @typedef {{ label: string, size: V3, site: Site, minDist: number, maxDist: number, y?: number, features: Record<string, V3>, below?: number, minDepth?: number, slope?: number, wet?: boolean }} PrefabInfo
 */
/** @typedef {Record<string, string | number | boolean>} States */
/** @typedef {{ id: string, s?: States }} B */
/** @typedef {string | B | ((r: () => number) => string | B) | null} Spec */
/** @typedef {{ x: number, y: number, z: number, b: B, k: number, up?: B }} Entry */

/** @type {Record<string, PrefabInfo>} */
export const PREFABS = {
  lighthouse: {
    label: "Lighthouse", size: { x: 9, y: 25, z: 9 }, below: 3, site: "coast", minDist: 80, maxDist: 250,
    features: { door: v(0, 1, -2), ladder: v(0, 1, 1), lamp: v(0, 17, 0), balcony: v(0, 16, -3), top: v(0, 16, 1) },
  },
  sunken_bell: {
    label: "Sunken Bell", size: { x: 13, y: 9, z: 13 }, below: 2, site: "water", minDist: 150, maxDist: 400, minDepth: 8,
    features: { bell: v(0, 4, 0), beam: v(0, 5, 0), entrance: v(0, 1, -3), rubble: v(4, 1, -2), lantern: v(2, 1, -2) },
  },
  old_chapel: {
    label: "Old Chapel", size: { x: 11, y: 14, z: 17 }, below: 4, site: "land", minDist: 120, maxDist: 300,
    features: {
      door: v(0, 1, -4), bell: v(-4, 3, -6), altar: v(0, 1, 6), candles: v(0, 2, 6), candle_left: v(-2, 2, 6),
      candle_right: v(2, 2, 6), loose_stone: v(0, 0, 5), listening_stone: v(0, -3, 4), pews: v(0, 1, 1), lamp: v(0, 7, 3),
    },
  },
  graveyard: {
    label: "Old Graveyard", size: { x: 17, y: 10, z: 17 }, below: 4, site: "land", minDist: 60, maxDist: 200,
    features: {
      gate: v(0, 1, -8), lantern: v(-1, 3, -2), crypt_door: v(0, 1, 3), button: v(1, 2, 2), crypt: v(0, 1, 4),
      coffin: v(0, 0, 5), grave_lily: v(-3, 1, 1), grave_twin: v(6, 1, -5), grave_mayor: v(-6, 1, -5),
      grave_hal: v(3, 1, -2), grave_dug: v(6, 0, 1), tree_spot: v(5, 1, 5), dead_tree: v(-7, 1, 6),
    },
  },
  observatory: {
    label: "Stargazer's Ruin", size: { x: 13, y: 18, z: 13 }, below: 3, site: "high", minDist: 300, maxDist: 700,
    features: { lodestone: v(0, 1, 0), door: v(0, 1, -5), platform: v(0, 8, -2), lectern: v(2, 1, 1), echo: v(0, 1, 2), telescope: v(0, 9, -3) },
  },
  sea_cave: {
    label: "Smugglers' Cove", size: { x: 15, y: 10, z: 15 }, below: 3, site: "coast", minDist: 250, maxDist: 600,
    features: { mouth: v(0, 1, -6), dock: v(2, 1, -3), ledger: v(-2, 1, 4), lantern: v(0, 3, 1), pool: v(0, 0, -2), barrels: v(3, 1, 3) },
  },
  choir_ring: {
    label: "The Gray Ring", size: { x: 17, y: 9, z: 17 }, below: 2, site: "land", minDist: 400, maxDist: 900,
    features: { bell: v(0, 2, 0), center: v(0, 1, -1), lectern: v(0, 1, 2), entrance: v(0, 1, -6), hide: v(0, 1, -8) },
  },
  witch_hut: {
    label: "Hollow Fen", size: { x: 13, y: 14, z: 13 }, below: 3, site: "land", minDist: 500, maxDist: 1000, wet: true,
    features: { door: v(0, 4, -2), porch: v(0, 4, -3), ladder: v(0, 1, -4), cauldron: v(-2, 4, 2), lantern: v(0, 7, 0), pond: v(-4, 1, 0) },
  },
  old_mine: {
    label: "Abandoned Mine", size: { x: 11, y: 15, z: 17 }, below: 9, site: "land", minDist: 200, maxDist: 500, slope: 4,
    features: { entrance: v(0, 1, -5), minecart: v(0, 1, -6), tunnel: v(0, -4, 0), bottom: v(0, -7, 5), notes: v(-2, -7, 5), sealed_door: v(0, -6, 8) },
  },
  watchtower: {
    label: "Ruined Watchtower", size: { x: 11, y: 17, z: 11 }, below: 3, site: "land", minDist: 300, maxDist: 700,
    features: { door: v(0, 1, -2), ladder: v(0, 1, 1), top: v(0, 11, 0), fire: v(3, 0, -4), flag: v(3, 13, -2) },
  },
  meadow: {
    label: "Wren's Meadow", size: { x: 17, y: 8, z: 17 }, below: 3, site: "land", minDist: 40, maxDist: 150,
    features: { gate: v(0, 1, -8), center: v(0, 1, 0), shed: v(4, 1, 5), hay: v(5, 1, 6), trough: v(-4, 1, -3) },
  },
  starfall: {
    label: "Starfall Crater", size: { x: 21, y: 11, z: 21 }, below: 6, site: "land", minDist: 600, maxDist: 1200, slope: 4,
    features: { core: v(0, -2, 0), floor: v(3, -3, 0), rim: v(0, 1, -9), crater: v(0, -2, -5) },
  },
  seal_tide: {
    label: "The Tide Seal", size: { x: 17, y: 10, z: 17 }, below: 3, site: "water", minDist: 500, maxDist: 1200, minDepth: 11,
    features: { seal: v(0, 3, 0), conduit: v(0, 3, 0), lantern: v(0, 1, 0), gate: v(0, 1, -7), ring: v(0, 1, -4) },
  },
  seal_stone: {
    label: "The Stone Seal", size: { x: 15, y: 11, z: 19 }, below: 1, y: -45, site: "underground", minDist: 300, maxDist: 800,
    features: { seal: v(0, 1, 0), dais: v(0, 1, 0), frame: v(0, 1, -3), door: v(0, 1, -6), corridor: v(0, 1, -8) },
  },
  seal_sky: {
    label: "The Sky Seal", size: { x: 25, y: 9, z: 25 }, below: 3, y: 220, site: "sky", minDist: 300, maxDist: 800,
    features: {
      seal: v(0, 1, 0), island: v(0, 1, 0), arrival: v(0, 1, -11), gap: v(0, 0, -6),
      crown_n: v(0, 1, -2), crown_e: v(2, 1, 0), crown_s: v(0, 1, 2), crown_w: v(-2, 1, 0),
    },
  },
  hollow_gate: {
    label: "The Hollow Gate", size: { x: 21, y: 20, z: 21 }, below: 8, site: "land", minDist: 800, maxDist: 1500, slope: 4,
    features: { arch: v(0, 10, 0), front: v(0, 1, -6), heart: v(0, 1, 7), pit: v(0, -6, 2), fire: v(0, -6, 0), lantern: v(0, 6, 0) },
  },
};

/** @param {number} x @param {number} y @param {number} z @returns {V3} */
function v(x, y, z) {
  return { x, y, z };
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

/**
 * An offset rotated clockwise (seen from above) by facing * 90 degrees: north turns east.
 * @param {V3} offset @param {number} facing @returns {V3}
 */
export function rotate(offset, facing) {
  let { x, z } = offset;
  for (let i = 0; i < (((facing % 4) + 4) % 4); i++) [x, z] = [-z, x];
  return { x: x + 0, y: offset.y, z: z + 0 };
}

/**
 * The world box a build covers.
 * @param {string} name @param {V3} origin @param {number} facing @returns {{ min: V3, max: V3 }}
 */
export function footprint(name, origin, facing) {
  const info = PREFABS[name];
  const hx = (info.size.x - 1) / 2, hz = (info.size.z - 1) / 2;
  const a = rotate({ x: -hx, y: 0, z: -hz }, facing), b = rotate({ x: hx, y: 0, z: hz }, facing);
  const y0 = origin.y - (info.below ?? 0);
  return {
    min: { x: origin.x + Math.min(a.x, b.x), y: y0, z: origin.z + Math.min(a.z, b.z) },
    max: { x: origin.x + Math.max(a.x, b.x), y: y0 + info.size.y - 1, z: origin.z + Math.max(a.z, b.z) },
  };
}

const NAMES = ["north", "east", "south", "west"];
const WEIRDO = [3, 0, 2, 1]; // stairs: the high side north, east, south, west
const FACE = [2, 5, 3, 4]; // facing_direction north, east, south, west
const OLD = [2, 3, 0, 1]; // legacy direction (bells): north, east, south, west
const ASC = [4, 2, 5, 3]; // rails ascending north, east, south, west

/** @param {any[]} table @param {any} val @param {number} f */
function rotIn(table, val, f) {
  const i = table.indexOf(val);
  return i < 0 ? val : table[(i + f) % 4];
}

/** Directional block states turned with the build. @param {States | undefined} s @param {number} f @returns {States | undefined} */
function rotStates(s, f) {
  if (!s || !f) return s;
  /** @type {States} */
  const o = {};
  for (const [k, val] of Object.entries(s)) {
    let key = k, out = val;
    const m = /^(minecraft:connection_|wall_connection_type_)(north|east|south|west)$/.exec(k);
    if (m) key = m[1] + rotIn(NAMES, m[2], f);
    else if (k === "minecraft:cardinal_direction" || k === "torch_facing_direction" || k === "minecraft:block_face" || k === "minecraft:facing_direction") out = rotIn(NAMES, val, f);
    else if (k === "weirdo_direction") out = rotIn(WEIRDO, val, f);
    else if (k === "facing_direction") out = rotIn(FACE, val, f);
    else if (k === "direction") out = rotIn(OLD, val, f);
    else if (k === "ground_sign_direction") out = (Number(val) + 4 * f) % 16;
    else if (k === "pillar_axis" && f % 2) out = val === "x" ? "z" : val === "z" ? "x" : val;
    else if (k === "rail_direction") {
      const n = Number(val);
      out = n <= 1 ? (f % 2 ? 1 - n : n) : n <= 5 ? rotIn(ASC, n, f) : 6 + ((n - 6 + f) % 4);
    }
    o[key] = out;
  }
  return o;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** @typedef {"n" | "e" | "s" | "w"} Dir */
const DI = { n: 0, e: 1, s: 2, w: 3 };

/** @param {string} id @param {States} [s] @returns {B} */
function b(id, s) {
  return { id: id.includes(":") ? id : "minecraft:" + id, s };
}
/** Stairs whose tall back is on side `high`. @param {string} id @param {Dir} high @param {boolean} [up] */
const stair = (id, high, up = false) => b(id, { weirdo_direction: WEIRDO[DI[high]], upside_down_bit: up });
/** @param {string} id @param {boolean} [top] */
const slab = (id, top = false) => b(id, { "minecraft:vertical_half": top ? "top" : "bottom" });
/** @param {string} id @param {"x" | "y" | "z"} [axis] */
const log = (id, axis = "y") => b(id, { pillar_axis: axis });
/** @param {boolean} [hanging] @param {boolean} [soul] */
const lantern = (hanging = false, soul = false) => b(soul ? "soul_lantern" : "lantern", { hanging });
/** A ladder facing `face` (its wall is on the other side). @param {Dir} face */
const ladder = (face) => b("ladder", { facing_direction: FACE[DI[face]] });
/** A bell hanging from the block above. */
const bellHanging = () => b("bell", { attachment: "hanging", direction: OLD[0], toggle_bit: false });
/** @param {"x" | "y" | "z"} [axis] */
const chain = (axis = "y") => b("iron_chain", { pillar_axis: axis });
/** @param {number} n @param {boolean} lit @param {string} [color] */
const candle = (n, lit, color = "") => b(color ? color + "_candle" : "candle", { candles: n - 1, lit });
/** @param {Dir | "u"} face */
const barrel = (face) => b("barrel", { facing_direction: face === "u" ? 1 : FACE[DI[face]], open_bit: false });
/** @param {string} id @param {Dir} dir */
const card = (id, dir) => b(id, { "minecraft:cardinal_direction": NAMES[DI[dir]] });
/** A fence gate; "n"/"s" spans east-west. @param {string} id @param {Dir} dir */
const gate = (id, dir) => b(id, { "minecraft:cardinal_direction": NAMES[DI[dir]], open_bit: false, in_wall_bit: false });
/** @param {Dir | "u" | "d"} face */
const endRod = (face) => b("end_rod", { facing_direction: face === "u" ? 1 : face === "d" ? 0 : FACE[DI[face]] });
/** @param {number} n */
const rail = (n) => b("rail", { rail_direction: n });
/** @param {string} id */
const up = (id) => b(id, { "minecraft:block_face": "up" });
/** @param {boolean} [soul] */
const campfire = (soul = false) => b(soul ? "soul_campfire" : "campfire", { "minecraft:cardinal_direction": "north", extinguished: false });

/**
 * A weighted random pick, drawn per block from the build's seeded RNG.
 * @param {...[string | B, number]} pairs @returns {(r: () => number) => string | B}
 */
function mix(...pairs) {
  const total = pairs.reduce((t, p) => t + p[1], 0);
  return (r) => {
    let x = r() * total;
    for (const [s, w] of pairs) if ((x -= w) < 0) return s;
    return pairs[pairs.length - 1][0];
  };
}

const STONEBRICK = mix(["stone_bricks", 6], ["mossy_stone_bricks", 3], ["cracked_stone_bricks", 2]);
const OLDBRICK = mix(["stone_bricks", 3], ["mossy_stone_bricks", 4], ["cracked_stone_bricks", 3]);
const COBBLE = mix(["cobblestone", 6], ["mossy_cobblestone", 4]);
const ROCK = mix(["stone", 5], ["andesite", 2], ["cobblestone", 2], ["mossy_cobblestone", 1]);
const DEEP = mix(["deepslate_bricks", 5], ["cracked_deepslate_bricks", 2], ["deepslate_tiles", 3], ["cracked_deepslate_tiles", 1]);
const PRIS = mix(["prismarine_bricks", 5], ["prismarine", 3], ["dark_prismarine", 1]);
const QUARTZ = mix(["quartz_block", 3], ["smooth_quartz", 3], ["quartz_bricks", 2]);
const BLACK = mix(["blackstone", 3], ["polished_blackstone_bricks", 2], ["cracked_polished_blackstone_bricks", 2], ["crying_obsidian", 1], [log("basalt"), 1]);
const FLOWERS = mix(["poppy", 3], ["dandelion", 3], ["cornflower", 2], ["oxeye_daisy", 2], ["azure_bluet", 2], ["allium", 1], ["lily_of_the_valley", 1], ["short_grass", 4]);

// Entry kinds: SOLID always placed, SOFT only into air, liquid or plants (foundations), AIR and
// WATER clear the space (WATER never into air, so no water floats), SKIP reserves a cell (door tops).
const SOLID = 0, SOFT = 1, AIR = 2, WATER = 3, SKIP = 4;

/** Blocks that hang or stand on another block: placed after the solid ones. */
const ATTACH = /lantern|chain|ladder|candle|rail|button|carpet|bell|end_rod|cluster|_bud|bush|mushroom|skull|campfire|fire|waterlily|pickle|seagrass|poppy|dandelion|cornflower|daisy|bluet|allium|lily_of|orchid|short_grass|web|_door|lectern|lightning_rod/;
/** Blocks that are not a full cube (they do not count as a wall a fence can join). */
const PARTIAL = /stairs|slab|fence|_wall|pane|bars|door|trapdoor|lantern|chain|ladder|candle|rail|button|carpet|bell|end_rod|cluster|_bud|bush|mushroom|skull|campfire|fire|waterlily|pickle|seagrass|lectern|cauldron|lightning_rod|web|chest|conduit|poppy|dandelion|cornflower|daisy|bluet|allium|lily_of|orchid|short_grass|sensor|shrieker|brewing|air$|water$/;

// ---------------------------------------------------------------------------
// The blueprint
// ---------------------------------------------------------------------------

/** @param {number} seed */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string} s */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

class Plan {
  /** @param {number} seed */
  constructor(seed) {
    /** @type {Map<string, Entry>} */
    this.m = new Map();
    this.r = rng(seed);
    /** @type {{ type: string, at: V3 }[]} */
    this.entities = [];
  }
  /** @param {number} x @param {number} y @param {number} z @param {Spec} spec @param {number} [k] */
  put(x, y, z, spec, k = SOLID) {
    const key = `${x},${y},${z}`;
    if (spec === null) return void this.m.delete(key);
    const s = typeof spec === "function" ? spec(this.r) : spec;
    this.m.set(key, { x, y, z, b: typeof s === "string" ? b(s) : s, k });
  }
  /** @param {number} x @param {number} y @param {number} z @param {Spec} spec */
  set(x, y, z, spec) {
    this.put(x, y, z, spec);
  }
  /** Foundation: only where the plan has nothing yet. @param {number} x @param {number} y @param {number} z @param {Spec} spec */
  soft(x, y, z, spec) {
    if (!this.has(x, y, z)) this.put(x, y, z, spec, SOFT);
  }
  /** @param {number} x @param {number} y @param {number} z @param {Spec} spec */
  ifEmpty(x, y, z, spec) {
    if (!this.has(x, y, z)) this.put(x, y, z, spec);
  }
  /** @param {number} x @param {number} y @param {number} z */
  air(x, y, z) {
    this.put(x, y, z, "air", AIR);
  }
  /** @param {number} x @param {number} y @param {number} z */
  water(x, y, z) {
    this.put(x, y, z, "water", WATER);
  }
  /** @param {number} x @param {number} y @param {number} z */
  has(x, y, z) {
    return this.m.has(`${x},${y},${z}`);
  }
  /** @param {number} x @param {number} y @param {number} z */
  get(x, y, z) {
    return this.m.get(`${x},${y},${z}`);
  }
  /** @param {number} x1 @param {number} y1 @param {number} z1 @param {number} x2 @param {number} y2 @param {number} z2 @param {Spec} spec @param {number} [k] */
  box(x1, y1, z1, x2, y2, z2, spec, k = SOLID) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++)
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++)
        for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) this.put(x, y, z, spec, k);
  }
  /** Four walls (no floor or roof). @param {number} x1 @param {number} y1 @param {number} z1 @param {number} x2 @param {number} y2 @param {number} z2 @param {Spec} spec */
  walls(x1, y1, z1, x2, y2, z2, spec) {
    for (let x = x1; x <= x2; x++)
      for (let z = z1; z <= z2; z++) if (x === x1 || x === x2 || z === z1 || z === z2) for (let y = y1; y <= y2; y++) this.put(x, y, z, spec);
  }
  /** Calls fn for every cell of a disc (inner radius exclusive). @param {number} r @param {(x: number, z: number, d: number) => void} fn @param {number} [rin] */
  disc(r, fn, rin = -1) {
    const n = Math.ceil(r);
    for (let x = -n; x <= n; x++)
      for (let z = -n; z <= n; z++) {
        const d = Math.hypot(x, z);
        if (d <= r && d > rin) fn(x, z, d);
      }
  }
  /** A door: both halves are placed together. @param {number} x @param {number} y @param {number} z @param {string} id @param {Dir} dir */
  door(x, y, z, id, dir) {
    const s = { "minecraft:cardinal_direction": NAMES[DI[dir]], open_bit: false, door_hinge_bit: false };
    this.put(x, y + 1, z, "air", SKIP);
    this.m.set(`${x},${y},${z}`, { x, y, z, k: SOLID, b: b(id, { ...s, upper_block_bit: false }), up: b(id, { ...s, upper_block_bit: true }) });
  }
  /**
   * Level ground for a land build: fills holes under the ground (soft), and clears the space above.
   * @param {(x: number, z: number) => boolean} inside @param {number} hx @param {number} hz @param {number} top @param {number} depth
   */
  pad(inside, hx, hz, top, depth) {
    for (let x = -hx; x <= hx; x++)
      for (let z = -hz; z <= hz; z++) {
        if (!inside(x, z)) continue;
        for (let y = 1; y <= top; y++) this.air(x, y, z);
        this.soft(x, 0, z, "grass_block");
        for (let y = -1; y >= -depth; y--) this.soft(x, y, z, "dirt");
      }
  }
}

/** @param {number} hx @param {number} hz @returns {(x: number, z: number) => boolean} */
const rect = (hx, hz) => (x, z) => Math.abs(x) <= hx && Math.abs(z) <= hz;
/** @param {number} r @returns {(x: number, z: number) => boolean} */
const round = (r) => (x, z) => Math.hypot(x, z) <= r;

// ---------------------------------------------------------------------------
// The builders (local coordinates, front to the north)
// ---------------------------------------------------------------------------

/** @type {Record<string, (p: Plan) => void>} */
const BUILD = {
  lighthouse(p) {
    p.pad(rect(4, 4), 4, 4, 21, 3);
    p.box(-3, 0, -3, 3, 0, 3, COBBLE);
    p.box(-3, -1, -3, 3, -3, 3, "cobblestone", SOFT);
    p.walls(-2, 1, -2, 2, 14, 2, STONEBRICK);
    p.walls(-2, 4, -2, 2, 4, 2, "calcite");
    p.walls(-2, 9, -2, 2, 9, 2, "calcite");
    p.box(-1, 0, -1, 1, 0, 1, "spruce_planks");
    p.box(-1, 8, -1, 1, 8, 1, slab("spruce_slab", true));
    p.door(0, 1, -2, "spruce_door", "n");
    for (const [x, y, z] of [[0, 6, -2], [0, 11, -2], [2, 7, 0], [-2, 7, 0], [2, 12, 0], [-2, 12, 0]]) p.set(x, y, z, "glass_pane");
    // balcony on corbels, iron rail, glass lantern room
    p.box(-3, 15, -3, 3, 15, 3, "stone_bricks");
    p.box(-1, 15, -1, 1, 15, 1, "smooth_stone");
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) !== 3 && Math.abs(z) !== 3) continue;
        const corner = Math.abs(x) === 3 && Math.abs(z) === 3;
        /** @type {Dir} */
        const toward = z === -3 ? "s" : z === 3 ? "n" : x === -3 ? "e" : "w";
        p.set(x, 14, z, corner ? slab("stone_brick_slab", true) : stair("stone_brick_stairs", toward, true));
        p.set(x, 16, z, "iron_bars");
      }
    for (let y = 16; y <= 18; y++)
      for (let x = -2; x <= 2; x++)
        for (let z = -2; z <= 2; z++) {
          if (Math.abs(x) !== 2 && Math.abs(z) !== 2) continue;
          p.set(x, y, z, Math.abs(x) === 2 && Math.abs(z) === 2 ? "stone_bricks" : "glass");
        }
    p.air(0, 16, -2);
    p.air(0, 17, -2);
    p.set(0, 16, 0, "chiseled_stone_bricks");
    p.set(0, 17, 0, "sea_lantern");
    p.set(0, 18, 0, "glowstone");
    // pointed cap
    for (const [y, h] of [[19, 2], [20, 1]])
      for (let x = -h; x <= h; x++)
        for (let z = -h; z <= h; z++) {
          if (Math.abs(x) !== h && Math.abs(z) !== h) p.set(x, y, z, "deepslate_tiles");
          else p.set(x, y, z, stair("deepslate_tile_stairs", z === -h ? "s" : z === h ? "n" : x === -h ? "e" : "w"));
        }
    p.set(0, 20, 0, "deepslate_tiles");
    p.set(0, 21, 0, b("lightning_rod", { facing_direction: 1 }));
    for (let y = 1; y <= 15; y++) p.set(0, y, 1, ladder("n"));
    for (const x of [-2, 2]) {
      p.set(x, 1, -4, "spruce_fence");
      p.set(x, 2, -4, lantern());
    }
  },

  sunken_bell(p) {
    p.box(-6, 1, -6, 6, 6, 6, "water", WATER);
    p.box(-4, -1, -4, 4, -2, 4, "cobblestone", SOFT);
    p.box(-3, 0, -3, 3, 0, 3, mix(["stone_bricks", 3], ["mossy_stone_bricks", 3], ["gravel", 2], ["sand", 1]));
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) !== 3 && Math.abs(z) !== 3) continue;
        const corner = Math.abs(x) === 3 && Math.abs(z) === 3;
        const h = z === -3 && !corner ? Math.floor(p.r() * 2) : corner ? 4 + Math.floor(p.r() * 2) : 2 + Math.floor(p.r() * 3);
        for (let y = 1; y <= h; y++) p.set(x, y, z, OLDBRICK);
      }
    for (const x of [-2, 2]) for (let y = 1; y <= 4; y++) p.set(x, y, 0, log("dark_oak_log"));
    for (let x = -2; x <= 2; x++) p.set(x, 5, 0, log("dark_oak_log", "x"));
    p.set(0, 4, 0, bellHanging());
    for (const x of [-1, 1]) for (let y = 3; y <= 4; y++) p.set(x, y, 0, chain());
    p.set(-2, 1, -1, chain("z"));
    p.set(1, 1, -2, chain("x"));
    for (let x = -1; x <= 2; x++) p.set(x, 1, 2, log("dark_oak_log", "x"));
    p.set(2, 1, -2, lantern());
    // a fallen piece of wall and scattered rubble
    for (const [x, y, z] of [[4, 1, -2], [5, 1, -2], [5, 1, -1], [6, 1, -1], [4, 2, -2]]) {
      p.set(x, y, z, OLDBRICK);
      p.soft(x, 0, z, "gravel");
    }
    const rubble = mix(["cobblestone", 3], ["mossy_cobblestone", 3], ["mossy_stone_bricks", 2], ["cracked_stone_bricks", 2], [slab("stone_brick_slab"), 2], [stair("mossy_stone_brick_stairs", "e"), 1], [stair("stone_brick_stairs", "s"), 1]);
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(p.r() * 13) - 6, z = Math.floor(p.r() * 13) - 6;
      if (Math.abs(x) <= 3 && Math.abs(z) <= 3) continue;
      if (p.get(x, 1, z)?.k !== WATER) continue;
      p.set(x, 0, z, "gravel");
      p.soft(x, -1, z, "gravel");
      const r = p.r();
      p.set(x, 1, z, r < 0.2 ? b("sea_pickle", { cluster_count: Math.floor(p.r() * 4), dead_bit: false }) : r < 0.35 ? b("seagrass", { sea_grass_type: "default" }) : rubble);
    }
  },

  old_chapel(p) {
    p.pad(rect(5, 8), 5, 8, 9, 2);
    // the listening stone's chamber under the floor, reached through the loose stone
    p.box(-2, -4, 2, 2, -1, 6, mix(["stone", 3], ["cobbled_deepslate", 2], ["deepslate", 2]));
    p.box(-1, -3, 3, 1, -3, 5, "deepslate_tiles");
    p.box(-1, -2, 3, 1, -1, 5, "air", AIR);
    p.set(0, -3, 4, "chiseled_deepslate");
    p.set(-1, -2, 3, "sculk_sensor");
    p.set(1, -2, 3, candle(1, false));
    p.set(0, -2, 5, ladder("n"));
    p.set(0, -1, 5, ladder("n"));
    // floor, walls, gables
    p.box(-3, 0, -4, 3, 0, 7, COBBLE);
    p.box(-2, 0, -3, 2, 0, 6, mix(["stone_bricks", 5], ["polished_andesite", 3], ["cracked_stone_bricks", 1]));
    p.set(0, 0, 5, "mossy_cobblestone");
    p.walls(-3, 1, -4, 3, 4, 7, COBBLE);
    for (const x of [-3, 3]) for (const z of [-4, 7]) for (let y = 1; y <= 4; y++) p.set(x, y, z, STONEBRICK);
    for (let y = 5; y <= 8; y++)
      for (let x = -(8 - y); x <= 8 - y; x++) {
        p.set(x, y, -4, COBBLE);
        p.set(x, y, 7, COBBLE);
      }
    // steep roof
    const roof = mix(["dark_oak_stairs", 9], ["spruce_stairs", 1]);
    for (let i = 0; i < 4; i++)
      for (let z = -5; z <= 8; z++) {
        const id = /** @type {string} */ (roof(p.r));
        p.set(-(4 - i), 5 + i, z, stair(id, "e"));
        p.set(4 - i, 5 + i, z, stair(id, "w"));
      }
    for (let z = -5; z <= 8; z++) p.set(0, 9, z, "dark_oak_planks");
    // front door, windows
    p.door(0, 1, -4, "dark_oak_door", "n");
    p.set(0, 3, -4, "chiseled_stone_bricks");
    for (const x of [-1, 1]) for (let y = 1; y <= 3; y++) p.set(x, y, -4, "stone_bricks");
    p.set(0, 6, -4, "light_blue_stained_glass");
    p.set(0, 7, -4, "yellow_stained_glass");
    p.set(-1, 6, 7, "red_stained_glass");
    p.set(0, 6, 7, "yellow_stained_glass");
    p.set(1, 6, 7, "red_stained_glass");
    p.set(0, 7, 7, "blue_stained_glass");
    const panes = ["light_blue", "yellow", "red", "lime", "purple", "light_blue"];
    let i = 0;
    for (const z of [-2, 1, 4])
      for (const x of [-3, 3]) {
        const c = panes[i++ % panes.length];
        for (let y = 2; y <= 3; y++) p.set(x, y, z, `${c}_stained_glass_pane`);
      }
    for (const x of [-4, 4])
      for (const z of [-1, 3]) {
        p.set(x, 1, z, "stone_bricks");
        p.set(x, 2, z, stair("stone_brick_stairs", x < 0 ? "e" : "w"));
      }
    // pews, aisle, altar with unlit candles
    for (const z of [-2, 0, 2]) for (const x of [-2, -1, 1, 2]) p.set(x, 1, z, stair("spruce_stairs", "n"));
    for (let z = -3; z <= 4; z++) p.set(0, 1, z, "red_carpet");
    p.set(0, 1, 6, "chiseled_stone_bricks");
    p.set(-1, 1, 6, "polished_andesite");
    p.set(1, 1, 6, "polished_andesite");
    for (const x of [-2, 2]) p.set(x, 1, 6, b("stone_brick_wall", { wall_post_bit: true }));
    p.set(0, 2, 6, candle(3, false));
    p.set(-1, 2, 6, candle(1, false));
    p.set(1, 2, 6, candle(2, false));
    p.set(-2, 2, 6, candle(1, false));
    p.set(2, 2, 6, candle(1, false));
    for (const z of [-1, 3]) {
      p.set(0, 8, z, chain());
      p.set(0, 7, z, lantern(true));
    }
    // bell frame in the front yard
    for (const x of [-5, -3]) for (let y = 1; y <= 3; y++) p.set(x, y, -6, log("spruce_log"));
    for (let x = -5; x <= -3; x++) {
      p.set(x, 4, -6, log("spruce_log", "x"));
      p.set(x, 5, -6, slab("spruce_slab"));
    }
    p.set(-4, 3, -6, bellHanging());
    for (let z = -8; z <= -5; z++) for (let x = -1; x <= 1; x++) p.set(x, 0, z, x === 0 ? "grass_path" : mix(["grass_path", 2], ["gravel", 1]));
    p.set(3, 1, -7, "spruce_fence");
    p.set(3, 2, -7, lantern());
    for (let n = 0; n < 14; n++) {
      const x = Math.floor(p.r() * 11) - 5, z = Math.floor(p.r() * 17) - 8;
      if (p.get(x, 1, z)?.k === AIR && p.get(x, 0, z)?.k === SOFT) p.set(x, 1, z, p.r() < 0.5 ? "moss_carpet" : FLOWERS);
    }
  },

  graveyard(p) {
    p.pad(rect(8, 8), 8, 8, 5, 2);
    p.box(-7, 0, -7, 7, 0, 7, mix(["grass_block", 5], ["coarse_dirt", 2], ["podzol", 2], ["dirt", 1]));
    for (let x = -8; x <= 8; x++)
      for (let z = -8; z <= 8; z++) {
        if (Math.abs(x) !== 8 && Math.abs(z) !== 8) continue;
        p.set(x, 0, z, "grass_block");
        if (Math.abs(x) === 8 && Math.abs(z) === 8) {
          p.set(x, 1, z, "mossy_stone_bricks");
          p.set(x, 2, z, "mossy_stone_bricks");
        } else p.set(x, 1, z, "dark_oak_fence");
      }
    // gate: stone posts with lanterns, iron bars over three gates
    for (const x of [-2, 2]) {
      for (let y = 1; y <= 3; y++) p.set(x, y, -8, STONEBRICK);
      p.set(x, 4, -8, lantern());
    }
    for (let x = -1; x <= 1; x++) {
      p.set(x, 1, -8, gate("dark_oak_fence_gate", "n"));
      p.air(x, 2, -8);
      p.set(x, 3, -8, "iron_bars");
    }
    for (let z = -7; z <= 2; z++) p.set(0, 0, z, mix(["gravel", 2], ["grass_path", 3]));
    // twelve graves on grass and dirt
    const heads = mix(["mossy_stone_bricks", 2], ["cracked_stone_bricks", 2], ["chiseled_stone_bricks", 1], [b("stone_brick_wall", { wall_post_bit: true }), 2], [b("mossy_cobblestone_wall", { wall_post_bit: true }), 2], [slab("stone_brick_slab", true), 1], ["andesite", 1]);
    const mound = mix(["grass_block", 2], ["dirt", 2], ["podzol", 1]);
    for (const x of [-6, -3, 3, 6])
      for (const z of [-6, -3, 0]) {
        const special = x === 6 && z === 0 ? "dug" : x === -6 && z === -6 ? "mayor" : x === -3 && z === 0 ? "lily" : x === 3 && z === -3 ? "hal" : "";
        if (special === "mayor") {
          p.set(x, 1, z, "chiseled_stone_bricks");
          p.set(x, 2, z, b("stone_brick_wall", { wall_post_bit: true }));
        } else if (special === "lily") p.set(x, 1, z, slab("smooth_stone_slab"));
        else if (special === "hal") {
          p.set(x, 1, z, "polished_andesite");
          p.set(x, 2, z, candle(1, false));
        } else p.set(x, 1, z, heads);
        for (const dz of [1, 2]) {
          if (special === "dug") {
            p.air(x, 0, z + dz);
            p.set(x, -1, z + dz, "dirt");
          } else {
            p.set(x, 0, z + dz, special === "lily" ? "grass_block" : mound);
            const r = p.r();
            if (!special && dz === 2 && r < 0.25) p.set(x, 1, z + dz, "deadbush");
            else if (!special && dz === 1 && r > 0.85) p.set(x, 1, z + dz, "poppy");
          }
        }
        if (special === "dug") {
          p.set(x + 1, 1, z + 1, "coarse_dirt");
          p.set(x + 1, 0, z + 1, "dirt");
        }
      }
    // the crypt
    p.walls(-3, 1, 3, 3, 4, 7, STONEBRICK);
    p.box(-2, 0, 4, 2, 0, 6, "polished_deepslate");
    p.box(-3, 5, 3, 3, 5, 7, slab("stone_brick_slab"));
    p.box(-2, 5, 4, 2, 5, 6, "stone_bricks");
    p.box(-2, 1, 4, 2, 4, 6, "air", AIR);
    p.door(0, 1, 3, "iron_door", "n");
    p.set(1, 2, 2, b("stone_button", { facing_direction: FACE[0], button_pressed_bit: false }));
    p.set(0, 3, 3, "chiseled_stone_bricks");
    for (const x of [-2, 2]) {
      for (let y = 1; y <= 4; y++) p.set(x, y, 2, b("stone_brick_wall", { wall_post_bit: true }));
      p.set(x, 5, 2, slab("stone_brick_slab"));
    }
    for (const z of [5, 6]) {
      p.air(0, 0, z);
      p.set(0, -1, z, "dark_oak_planks");
    }
    for (const [x, z] of [[-1, 5], [-1, 6], [1, 5], [1, 6], [0, 4], [0, 7]]) p.set(x, -1, z, "stone");
    p.set(1, 1, 6, slab("smooth_stone_slab"));
    p.set(-2, 1, 6, b("skeleton_skull", { facing_direction: 1 }));
    p.set(2, 1, 6, log("bone_block"));
    p.set(-2, 1, 4, candle(2, true));
    p.set(2, 1, 4, candle(1, true));
    p.set(0, 4, 5, lantern(true, true));
    // lamp post, dead tree, dead bushes, a patch of grass for a new tree
    for (let y = 1; y <= 2; y++) p.set(-1, y, -2, "dark_oak_fence");
    p.set(-1, 3, -2, lantern());
    for (let y = 1; y <= 4; y++) p.set(-7, y, 6, log("stripped_dark_oak_log"));
    for (const [x, y, z] of [[-6, 3, 6], [-7, 4, 5], [-6, 4, 5], [-7, 5, 6]]) p.set(x, y, z, "dark_oak_fence");
    p.set(-6, 4, 6, "web");
    for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) p.set(x, 0, z, "grass_block");
    for (let n = 0; n < 16; n++) {
      const x = Math.floor(p.r() * 15) - 7, z = Math.floor(p.r() * 15) - 7;
      if (p.get(x, 1, z)?.k === AIR && x !== 0 && !(x >= 4 && z >= 4 && x <= 6 && z <= 6)) p.set(x, 1, z, p.r() < 0.6 ? "deadbush" : "short_grass");
    }
  },

  observatory(p) {
    p.pad(round(6.3), 6, 6, 14, 3);
    const walls = mix(["stone_bricks", 4], ["cracked_stone_bricks", 4], ["mossy_stone_bricks", 2], ["cobblestone", 1]);
    p.disc(5.2, (x, z, d) => {
      p.set(x, 0, z, d > 4.2 ? "stone_bricks" : Math.abs(d - 2.9) < 0.45 ? "calcite" : (x === 0 || z === 0 || Math.abs(x) === Math.abs(z)) && d < 2.5 ? "chiseled_stone_bricks" : mix(["stone_bricks", 5], ["polished_andesite", 3], ["cracked_stone_bricks", 2]));
      for (let y = -1; y >= -3; y--) p.soft(x, y, z, "cobblestone");
    });
    // broken glass dome over the north half
    for (let x = -5; x <= 5; x++)
      for (let z = -5; z <= 0; z++)
        for (let y = 10; y <= 14; y++) {
          const d = Math.hypot(x, y - 9, z);
          if (Math.abs(d - 4.8) > 0.5) continue;
          if (x === 0) p.set(x, y, z, "polished_andesite");
          else if (p.r() > 0.4) p.set(x, y, z, mix(["glass", 3], ["tinted_glass", 1], ["light_blue_stained_glass", 1]));
        }
    // round walls, collapsed to the south-east
    p.disc(5.2, (x, z) => {
      const a = Math.atan2(z, x);
      const broken = a > 0.3 && a < 1.8;
      const h = broken ? 2 + Math.floor(p.r() * 3) : 9 + Math.floor(p.r() * 3);
      for (let y = 1; y <= h; y++) p.set(x, y, z, walls);
    }, 4.2);
    for (const y of [1, 2]) p.air(0, y, -5);
    p.set(0, 3, -5, "chiseled_stone_bricks");
    for (const [x, z] of [[-5, 0], [5, 0], [0, 5]]) for (const y of [6, 7]) if (p.get(x, y, z)) p.air(x, y, z);
    // spiral steps up to a half floor
    p.disc(4.2, (x, z) => {
      if (z <= -1) p.set(x, 7, z, slab("stone_brick_slab", true));
    });
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 - 0.5 - i * 0.42;
      const x = Math.round(3.4 * Math.cos(a)), z = Math.round(3.4 * Math.sin(a));
      p.set(x, 1 + Math.floor(i / 2), z, slab("stone_brick_slab", i % 2 === 1));
    }
    p.set(0, 8, -3, "spruce_fence");
    p.set(0, 9, -3, b("lightning_rod", { facing_direction: FACE[0] }));
    // the lodestone, Fenn's lectern, rubble and moss
    p.set(0, 1, 0, "lodestone");
    p.set(2, 1, 1, card("lectern", "w"));
    const rubble = mix(["cobblestone", 2], ["mossy_stone_bricks", 2], ["cracked_stone_bricks", 2], [slab("stone_brick_slab"), 2], [slab("mossy_stone_brick_slab"), 1]);
    for (let n = 0; n < 40; n++) {
      const x = Math.floor(p.r() * 13) - 6, z = Math.floor(p.r() * 13) - 6, d = Math.hypot(x, z);
      if (p.get(x, 1, z)?.k !== AIR) continue;
      if (d > 5.4) p.set(x, 1, z, p.r() < 0.7 ? rubble : FLOWERS);
      else if (d < 4 && d > 1.5) p.set(x, 1, z, p.r() < 0.5 ? "moss_carpet" : rubble);
    }
  },

  sea_cave(p) {
    /** @param {number} x @param {number} y @param {number} z */
    const hollow = (x, y, z) => y >= 1 && ((x / 4.6) ** 2 + ((z - 0.5) / 5.2) ** 2 + ((y - 0.5) / 4.2) ** 2 <= 1 || (Math.abs(x) <= 2 && z <= -3 && y <= (Math.abs(x) === 2 ? 2 : 3)));
    for (let x = -7; x <= 7; x++)
      for (let z = -7; z <= 7; z++) {
        let top = -1;
        for (let y = 0; y <= 6; y++) {
          const e = (x / 7.2) ** 2 + ((z - 1) / 7.2) ** 2 + (y / 6.3) ** 2;
          if (e <= 1 - p.r() * 0.12) {
            p.set(x, y, z, ROCK);
            top = y;
          } else p.air(x, y, z);
        }
        if (top >= 1 && !hollow(x, top, z)) p.set(x, top, z, mix(["grass_block", 3], ["coarse_dirt", 1], ["stone", 1]));
        if (top >= 0) for (let y = -1; y >= -3; y--) p.soft(x, y, z, "stone");
      }
    for (let x = -7; x <= 7; x++)
      for (let z = -7; z <= 7; z++)
        for (let y = 1; y <= 6; y++)
          if (hollow(x, y, z)) {
            p.air(x, y, z);
            if (y === 1) p.set(x, 0, z, mix(["gravel", 2], ["stone", 2], ["andesite", 1]));
          }
    // a hidden pool, contained on every side
    for (let x = -2; x <= 2; x++)
      for (let z = -7; z <= 2; z++) {
        const inside = Math.abs(x) <= 1 && z >= -6 && z <= 1;
        p.set(x, -2, z, "stone");
        p.set(x, -1, z, inside ? "water" : "stone");
        if (inside) p.set(x, 0, z, "water");
        else if (z === -7 || z === 2) p.set(x, 0, z, "stone");
      }
    for (let x = 2; x <= 3; x++) for (let z = -6; z <= 2; z++) if (hollow(x, 1, z)) p.set(x, 0, z, "spruce_planks");
    for (let x = -3; x <= 3; x++) for (let z = 3; z <= 4; z++) if (hollow(x, 1, z)) p.set(x, 0, z, "spruce_planks");
    p.set(2, 1, -5, "spruce_fence");
    p.set(2, 2, -5, lantern());
    p.set(0, 4, 1, chain());
    p.set(0, 5, 1, ROCK);
    p.set(0, 3, 1, lantern(true));
    p.set(3, 1, 3, barrel("u"));
    p.set(3, 2, 3, barrel("u"));
    p.set(2, 1, 4, barrel("w"));
    p.set(-3, 1, 3, barrel("e"));
    p.set(-2, 1, 4, card("chest", "n"));
    p.set(-1, 1, 4, barrel("u"));
  },

  choir_ring(p) {
    p.pad(round(8.3), 8, 8, 6, 2);
    p.disc(7.3, (x, z, d) => {
      p.set(x, 0, z, d <= 2.2 ? "tuff_bricks" : Math.abs(d - 6) < 0.6 ? "tuff" : mix(["gravel", 3], ["tuff", 2], ["coarse_dirt", 3], ["podzol", 1], ["grass_block", 2]));
    });
    const body = mix(["gray_concrete", 4], ["tuff", 3], ["tuff_bricks", 1], ["light_gray_concrete", 1]);
    for (let k = 0; k < 9; k++) {
      const a = ((-20 + k * 40) * Math.PI) / 180;
      const x = Math.round(6 * Math.sin(a)), z = Math.round(-6 * Math.cos(a));
      if (k === 4) {
        // a fallen stone lying outward
        for (let t = 0; t < 3; t++) p.set(Math.round(x + t * Math.sin(a) * 0.9), 1, Math.round(z - t * Math.cos(a) * 0.9), body);
        continue;
      }
      const h = k === 0 || k === 8 ? 4 : 3 + Math.floor(p.r() * 3);
      for (let y = 1; y < h; y++) p.set(x, y, z, body);
      p.set(x, h, z, mix(["chiseled_tuff", 2], ["polished_tuff", 1]));
      if (k % 2 === 1) for (let y = 1; y < h; y++) p.set(x + (Math.abs(z) > Math.abs(x) ? 1 : 0), y, z + (Math.abs(z) > Math.abs(x) ? 0 : 1), body);
      if (k === 2 || k === 6) p.set(x, h + 1, z, lantern(false, true));
      p.set(x, 0, z, "tuff");
    }
    for (let x = -2; x <= 2; x++) p.set(x, 5, -6, "tuff_bricks");
    for (const x of [-1, 1]) p.set(x, 4, -6, "gray_wool");
    // the cracked bell between two posts
    p.set(0, 0, 0, "chiseled_tuff");
    for (const x of [-1, 1]) for (let y = 1; y <= 2; y++) p.set(x, y, 0, b("tuff_brick_wall", { wall_post_bit: true }));
    for (let x = -1; x <= 1; x++) p.set(x, 3, 0, log("polished_basalt", "x"));
    p.set(0, 2, 0, bellHanging());
    p.set(1, 3, 1, "web");
    p.set(0, 1, 2, card("lectern", "n"));
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + Math.PI / 8;
      const x = Math.round(2.6 * Math.sin(a)), z = Math.round(-2.6 * Math.cos(a));
      if (!p.get(x, 1, z) || p.get(x, 1, z)?.k === AIR) p.set(x, 1, z, candle(1 + (k % 3), true, k % 2 ? "gray" : "black"));
    }
  },

  witch_hut(p) {
    p.pad(rect(6, 6), 6, 6, 10, 3);
    /** @type {Set<string>} */
    const pond = new Set();
    for (let x = -5; x <= 5; x++)
      for (let z = -5; z <= 5; z++) {
        const e = (x / 4.8) ** 2 + (z / 4.3) ** 2;
        if (e <= 0.85 || (e <= 1.1 && p.r() < 0.5)) pond.add(`${x},${z}`);
      }
    for (let x = -6; x <= 6; x++)
      for (let z = -6; z <= 6; z++) {
        if (pond.has(`${x},${z}`)) {
          p.set(x, 0, z, "water");
          p.set(x, -1, z, "mud");
          if (p.r() < 0.12 && (Math.abs(x) > 3 || z < -4 || z > 4)) p.set(x, 1, z, "waterlily");
        } else {
          p.set(x, 0, z, mix(["grass_block", 5], ["podzol", 2], ["mud", 1]));
          p.set(x, -1, z, "dirt");
          const r = p.r();
          if (r < 0.1) {
            p.set(x, 0, z, "podzol");
            p.set(x, 1, z, p.r() < 0.5 ? "red_mushroom" : "brown_mushroom");
          } else if (r < 0.14) p.set(x, 1, z, "firefly_bush");
        }
      }
    // stilts, floor and porch
    for (const x of [-3, 3]) for (const z of [-3, -2, 3]) for (let y = -1; y <= 2; y++) p.set(x, y, z, log("dark_oak_log"));
    for (let y = -1; y <= 2; y++) p.set(0, y, -3, log("dark_oak_log"));
    p.box(-3, 3, -3, 3, 3, 3, "dark_oak_planks");
    for (let x = -3; x <= 3; x++) if (x !== 0) p.set(x, 4, -3, "dark_oak_fence");
    // walls, windows, door
    p.walls(-3, 4, -2, 3, 6, 3, mix(["dark_oak_planks", 5], ["spruce_planks", 1]));
    for (const x of [-3, 3]) for (const z of [-2, 3]) for (let y = 4; y <= 6; y++) p.set(x, y, z, log("dark_oak_log"));
    for (const [x, z] of [[-3, 0], [-3, 1], [3, 0], [3, 1], [0, 3]]) p.set(x, 5, z, "brown_stained_glass_pane");
    p.door(0, 4, -2, "dark_oak_door", "n");
    // gable roof along z
    for (let i = 0; i < 4; i++)
      for (let z = -4; z <= 4; z++) {
        p.set(-(4 - i), 6 + i, z, stair("dark_oak_stairs", "e"));
        p.set(4 - i, 6 + i, z, stair("dark_oak_stairs", "w"));
      }
    for (let z = -4; z <= 4; z++) p.set(0, 10, z, slab("dark_oak_slab"));
    for (let y = 7; y <= 9; y++)
      for (let x = -(9 - y); x <= 9 - y; x++) {
        p.set(x, y, -2, "dark_oak_planks");
        p.set(x, y, 3, "dark_oak_planks");
      }
    // inside: cauldrons, brewing, lantern
    p.box(-2, 4, -1, 2, 9, 2, "air", AIR);
    p.set(-2, 4, 2, b("cauldron", { fill_level: 6, cauldron_liquid: "water" }));
    p.set(2, 4, 2, b("cauldron", { fill_level: 3, cauldron_liquid: "water" }));
    p.set(-2, 4, 1, "brewing_stand");
    p.set(2, 4, -1, barrel("u"));
    p.set(-2, 4, -1, "bookshelf");
    p.set(0, 9, 0, chain());
    p.set(0, 8, 0, chain());
    p.set(0, 7, 0, lantern(true, true));
    p.set(-4, 5, -3, lantern(true, true));
    p.set(4, 5, -3, lantern(true));
    // plank landing and ladder up to the porch
    p.set(0, 0, -4, "dark_oak_planks");
    p.set(0, 0, -5, "dark_oak_planks");
    for (let y = 1; y <= 3; y++) p.set(0, y, -4, ladder("n"));
  },

  old_mine(p) {
    p.pad((x, z) => z <= -5, 5, 8, 5, 2);
    const wall = mix(["stone", 4], ["cobblestone", 2], ["dirt", 1], ["andesite", 1]);
    const floor = mix(["stone", 3], ["cobblestone", 2], ["andesite", 1]);
    // the sloped tunnel: rails climb north, one block per block
    for (let k = 0; k <= 7; k++) {
      const z = -4 + k, yr = -k;
      for (let x = -2; x <= 2; x++) {
        if (Math.abs(x) <= 1) {
          p.set(x, yr - 1, z, floor);
          for (let y = yr; y <= yr + 3; y++) p.air(x, y, z);
        } else for (let y = yr - 1; y <= yr + 3; y++) p.put(x, y, z, wall, SOFT);
        p.put(x, yr + 4, z, wall, SOFT);
      }
      p.set(0, yr, z, rail(4));
      if (k % 3 === 0) {
        for (const x of [-1, 1]) for (let y = yr; y <= yr + 2; y++) p.set(x, y, z, "spruce_fence");
        for (let x = -1; x <= 1; x++) p.set(x, yr + 3, z, log("stripped_spruce_log", "x"));
        if (k < 7) p.set(-1, yr + 2, z + 1, lantern(true));
      } else for (const x of [-1, 1]) if (p.r() < 0.35) p.set(x, yr + 3, z, "web");
    }
    // outside: flat rails, the boarded frame, a minecart, tailings
    for (let z = -8; z <= -5; z++) for (let x = -1; x <= 1; x++) p.set(x, 0, z, x === 0 ? "gravel" : "coarse_dirt");
    for (let z = -7; z <= -5; z++) p.set(0, 1, z, rail(0));
    for (const x of [-2, 2]) for (let y = 1; y <= 3; y++) p.set(x, y, -5, log("spruce_log"));
    for (let x = -2; x <= 2; x++) p.set(x, 4, -5, log("spruce_log", "x"));
    p.set(-1, 1, -5, "spruce_planks");
    p.set(1, 2, -5, "spruce_planks");
    p.set(1, 3, -5, "spruce_planks");
    p.set(-1, 3, -5, slab("spruce_slab", true));
    p.set(0, 3, -5, slab("spruce_slab", true));
    for (const [x, y, z] of [[-4, 1, -7], [-3, 1, -7], [-4, 1, -6], [-4, 2, -7], [-3, 1, -8]]) p.set(x, y, z, mix(["gravel", 2], ["cobblestone", 2], ["stone", 1]));
    p.set(3, 1, -7, barrel("u"));
    p.set(3, 1, -6, barrel("w"));
    for (let y = 1; y <= 2; y++) p.set(-3, y, -5, "spruce_fence");
    p.set(-3, 3, -5, lantern());
    p.entities.push({ type: "minecraft:minecart", at: v(0, 1, -6) });
    // the bottom room and the sealed tunnel
    const deep = mix(["stone", 2], ["cobbled_deepslate", 2], ["deepslate", 2], ["tuff", 1]);
    p.box(-3, -8, 4, 3, -4, 8, deep);
    p.box(-2, -7, 4, 2, -5, 7, "air", AIR);
    p.box(-2, -8, 4, 2, -8, 7, floor);
    for (let z = 4; z <= 6; z++) p.set(0, -7, z, rail(0));
    p.box(-1, -7, 8, 1, -5, 8, "cobbled_deepslate");
    for (const [x, y] of [[-1, -7], [0, -6], [1, -5], [1, -7], [-1, -5]]) p.set(x, y, 7, "spruce_planks");
    p.set(-2, -7, 5, card("lectern", "e"));
    p.set(2, -7, 6, barrel("u"));
    p.set(2, -7, 4, lantern());
    p.set(-2, -5, 7, "web");
    p.set(2, -5, 4, "web");
  },

  watchtower(p) {
    p.pad(rect(5, 5), 5, 5, 13, 3);
    p.box(-2, 0, -2, 2, 0, 2, COBBLE);
    p.walls(-2, 1, -2, 2, 4, 2, COBBLE);
    p.air(0, 1, -2);
    p.air(0, 2, -2);
    p.box(-2, 5, -2, 2, 5, 2, "spruce_planks");
    for (let y = 6; y <= 9; y++)
      for (let x = -2; x <= 2; x++)
        for (let z = -2; z <= 2; z++) {
          if (Math.abs(x) !== 2 && Math.abs(z) !== 2) continue;
          if (x === 0 && z === 2) p.set(x, y, z, "spruce_planks");
          else if (p.r() < 0.65) p.set(x, y, z, mix(["spruce_planks", 4], ["stripped_spruce_log", 1]));
        }
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (p.r() < 0.85 || (x === 0 && z === 2)) p.set(x, 10, z, "spruce_planks");
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.abs(x) !== 3 && Math.abs(z) !== 3) continue;
        if (p.r() < 0.7) p.set(x, 10, z, slab("spruce_slab", true));
      }
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        if ((Math.abs(x) !== 2 && Math.abs(z) !== 2) || (Math.abs(x) === 2 && Math.abs(z) === 2)) continue;
        if (p.r() < 0.6) p.set(x, 11, z, "spruce_fence");
      }
    const heights = [[-2, -2, 12], [2, -2, 11], [-2, 2, 10], [2, 2, 12]];
    for (const [x, z, h] of heights) for (let y = 1; y <= h; y++) p.set(x, y, z, log("spruce_log"));
    p.set(-1, 12, -2, log("spruce_log", "x"));
    p.set(0, 12, -2, log("spruce_log", "x"));
    p.set(-2, 13, -2, slab("spruce_slab"));
    for (let y = 1; y <= 10; y++) p.set(0, y, 1, ladder("n"));
    // cloth banners
    for (let y = 12; y <= 13; y++) p.set(2, y, -2, "spruce_fence");
    for (let y = 12; y <= 13; y++) p.set(3, y, -2, "red_wool");
    for (let y = 8; y <= 9; y++) p.set(0, y, -3, "red_wool");
    p.set(-3, 9, 0, "red_wool");
    // fire pit with log benches
    p.set(3, 0, -4, campfire());
    for (const [x, z] of [[2, -5], [3, -5], [4, -5], [2, -4], [4, -4], [2, -3], [3, -3], [4, -3]]) p.set(x, 0, z, COBBLE);
    for (const [x, z] of [[2, -4], [4, -4], [3, -5], [3, -3]]) p.set(x, 1, z, slab("cobblestone_slab"));
    for (let z = -5; z <= -3; z++) p.set(5, 1, z, log("stripped_spruce_log", "z"));
    p.set(-3, 1, 1, barrel("u"));
    p.set(-3, 1, 2, barrel("e"));
    p.set(-3, 2, 1, lantern());
  },

  meadow(p) {
    p.pad(rect(8, 8), 8, 8, 4, 3);
    p.box(-8, 0, -8, 8, 0, 8, "grass_block");
    for (let x = -8; x <= 8; x++)
      for (let z = -8; z <= 8; z++) if (Math.abs(x) === 8 || Math.abs(z) === 8) p.set(x, 1, z, Math.abs(x) === 8 && Math.abs(z) === 8 ? log("oak_log") : "oak_fence");
    p.set(0, 1, -8, gate("spruce_fence_gate", "n"));
    for (const x of [-1, 1]) {
      p.set(x, 1, -8, log("oak_log"));
      p.set(x, 2, -8, lantern());
    }
    // hay shed with a slab roof
    for (const [x, z] of [[2, 3], [7, 3], [2, 7], [7, 7]]) for (let y = 1; y <= 3; y++) p.set(x, y, z, log("spruce_log"));
    for (let x = 3; x <= 6; x++) for (let y = 1; y <= 2; y++) p.set(x, y, 7, "spruce_planks");
    for (let z = 4; z <= 6; z++) for (let y = 1; y <= 2; y++) p.set(7, y, z, "spruce_planks");
    p.box(2, 4, 2, 7, 4, 7, slab("spruce_slab"));
    p.box(3, 0, 4, 6, 0, 6, "coarse_dirt");
    for (const [x, y, z, a] of /** @type {[number, number, number, "x" | "y" | "z"][]} */ ([[6, 1, 6, "y"], [5, 1, 6, "x"], [6, 2, 6, "y"], [6, 1, 5, "z"]])) p.set(x, y, z, log("hay_block", a));
    // water trough
    for (let x = -6; x <= -2; x++)
      for (let z = -4; z <= -2; z++) {
        const inside = x >= -5 && x <= -3 && z === -3;
        p.set(x, 0, z, inside ? "water" : log("stripped_spruce_log", z === -3 ? "z" : "x"));
        p.set(x, -1, z, inside ? "spruce_planks" : "dirt");
      }
    p.set(-6, 1, 6, "composter");
    for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) if (p.get(x, 1, z)?.k === AIR && p.r() < 0.24) p.set(x, 1, z, FLOWERS);
  },

  starfall(p) {
    p.pad(round(10.3), 10, 10, 4, 0);
    p.disc(10.3, (x, z, d) => {
      if (d <= 8.5) {
        const ys = -Math.round(4.2 * (1 - (d / 8.5) ** 2));
        const top = d < 2.5 ? mix(["magma", 3], ["blackstone", 2], ["crying_obsidian", 1], ["obsidian", 1]) : d < 5 ? mix(["blackstone", 4], [log("basalt"), 2], ["tinted_glass", 1], ["obsidian", 1], ["magma", 1], ["smooth_basalt", 1]) : mix(["blackstone", 2], ["coarse_dirt", 3], ["gravel", 2], ["tinted_glass", 1], [log("basalt"), 1]);
        for (let y = ys + 1; y <= 4; y++) p.air(x, y, z);
        p.set(x, ys, z, top);
        p.set(x, ys - 1, z, mix(["blackstone", 1], ["smooth_basalt", 1]));
        p.soft(x, ys - 2, z, "stone");
      } else {
        p.set(x, 0, z, mix(["coarse_dirt", 3], ["gravel", 2], ["blackstone", 1]));
        p.soft(x, -1, z, "dirt");
        if (d < 9.4 || p.r() < 0.35) p.set(x, 1, z, mix(["coarse_dirt", 3], ["gravel", 1], ["blackstone", 1], ["cobblestone", 1]));
      }
    });
    // glassy rays thrown out from the impact
    for (let k = 0; k < 6; k++) {
      const a = ((k * 60 + p.r() * 30) * Math.PI) / 180;
      for (let t = 3; t <= 9.5; t += 0.5) {
        const x = Math.round(t * Math.cos(a)), z = Math.round(t * Math.sin(a)), d = Math.hypot(x, z);
        const glass = mix(["obsidian", 2], ["tinted_glass", 2], ["crying_obsidian", 1]);
        if (d <= 8.5) p.set(x, -Math.round(4.2 * (1 - (d / 8.5) ** 2)), z, glass);
        else if (d <= 10.3) p.set(x, 0, z, glass);
      }
    }
    // the fallen star: a dark rock with an amethyst heart
    for (let x = -2; x <= 2; x++)
      for (let y = -4; y <= -1; y++)
        for (let z = -2; z <= 2; z++) if (Math.hypot(x, y + 3, z) <= 1.6) p.set(x, y, z, mix(["blackstone", 3], ["crying_obsidian", 2], ["gilded_blackstone", 1], ["obsidian", 1]));
    p.set(0, -3, 0, "glowstone");
    p.set(0, -2, 0, "amethyst_block");
    p.set(0, -1, 0, up("amethyst_cluster"));
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.set(x, -1, z, up(p.r() < 0.5 ? "amethyst_cluster" : "large_amethyst_bud"));
    for (let n = 0; n < 14; n++) {
      const a = p.r() * Math.PI * 2, t = 2.5 + p.r() * 4;
      const x = Math.round(t * Math.cos(a)), z = Math.round(t * Math.sin(a));
      const ys = -Math.round(4.2 * (1 - (Math.hypot(x, z) / 8.5) ** 2));
      if (p.get(x, ys + 1, z)?.k !== AIR) continue;
      if (p.r() < 0.5) p.set(x, ys, z, "amethyst_block");
      p.set(x, ys + 1, z, up(p.r() < 0.6 ? "amethyst_cluster" : "large_amethyst_bud"));
    }
  },

  seal_tide(p) {
    p.box(-8, 1, -8, 8, 6, 8, "water", WATER);
    p.disc(8.3, (x, z, d) => {
      if (d > 7.5) {
        p.set(x, 0, z, slab("prismarine_brick_slab"));
        return;
      }
      p.set(x, 0, z, d > 6.6 ? "dark_prismarine" : Math.abs(d - 4) < 0.45 ? "sea_lantern" : d <= 1.5 ? "dark_prismarine" : PRIS);
      for (let y = -1; y >= -3; y--) p.soft(x, y, z, "prismarine");
    });
    /** @type {[number, number][]} */
    const pillars = [];
    for (let k = 0; k < 8; k++) {
      const a = ((22.5 + 45 * k) * Math.PI) / 180;
      const x = Math.round(6 * Math.sin(a)), z = Math.round(-6 * Math.cos(a));
      pillars.push([x, z]);
      for (let y = 1; y <= 5; y++) p.set(x, y, z, mix(["prismarine", 1], ["prismarine_bricks", 1]));
      p.set(x, 6, z, "sea_lantern");
    }
    for (let k = 0; k < 8; k++) {
      const [x1, z1] = pillars[k], [x2, z2] = pillars[(k + 1) % 8];
      for (let t = 1; t < 6; t++) {
        const x = Math.round(x1 + ((x2 - x1) * t) / 6), z = Math.round(z1 + ((z2 - z1) * t) / 6);
        if ((x === x1 && z === z1) || (x === x2 && z === z2)) continue;
        if (p.r() < 0.8) p.set(x, 6, z, slab("dark_prismarine_slab"));
      }
    }
    // the conduit frame: three square rings around the conduit
    const frame = mix(["prismarine_bricks", 3], ["prismarine", 2], ["dark_prismarine", 2]);
    for (let a = -2; a <= 2; a++)
      for (let c = -2; c <= 2; c++) {
        if (Math.max(Math.abs(a), Math.abs(c)) !== 2) continue;
        const corner = Math.abs(a) === 2 && Math.abs(c) === 2;
        p.set(a, 3, c, corner ? "sea_lantern" : frame);
        p.set(0, 3 + a, c, frame);
        p.set(a, 3 + c, 0, frame);
      }
    p.set(0, 1, 0, "sea_lantern");
    p.set(0, 3, 0, "conduit");
    for (let n = 0; n < 16; n++) {
      const x = Math.floor(p.r() * 15) - 7, z = Math.floor(p.r() * 15) - 7;
      if (Math.hypot(x, z) > 7 || (Math.abs(x) <= 2 && Math.abs(z) <= 2) || p.get(x, 1, z)?.k !== WATER) continue;
      p.set(x, 1, z, b("sea_pickle", { cluster_count: Math.floor(p.r() * 4), dead_bit: false }));
    }
  },

  seal_stone(p) {
    p.box(-7, -1, -9, 7, 9, 9, "deepslate", SOFT);
    for (let x = -6; x <= 6; x++)
      for (let y = 0; y <= 8; y++)
        for (let z = -6; z <= 6; z++) {
          const edge = Math.abs(x) === 6 || Math.abs(z) === 6 || y === 0 || y === 8;
          if (!edge) p.air(x, y, z);
          else if (y === 0) p.set(x, y, z, Math.abs(Math.hypot(x, z) - 2.9) < 0.45 ? "polished_deepslate" : p.r() < 0.25 && Math.hypot(x, z) > 3.5 ? "sculk" : mix(["deepslate_tiles", 5], ["cracked_deepslate_tiles", 2], ["polished_deepslate", 1]));
          else p.set(x, y, z, DEEP);
        }
    for (const x of [-5, 5]) for (const z of [-5, 5]) for (let y = 1; y <= 7; y++) p.set(x, y, z, "reinforced_deepslate");
    for (const [x, z] of [[-5, 0], [5, 0], [0, 5]])
      for (let y = 1; y <= 7; y++) p.set(x, y, z, y === 1 || y === 7 ? "chiseled_deepslate" : "polished_deepslate");
    // the dais and its relight stone
    p.set(0, 1, 0, "reinforced_deepslate");
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      p.set(x, 1, z, "chiseled_deepslate");
      p.set(x, 2, z, candle(2, true, "black"));
    }
    p.set(0, 1, -1, stair("polished_deepslate_stairs", "s"));
    p.set(0, 1, 1, stair("polished_deepslate_stairs", "n"));
    p.set(-1, 1, 0, stair("polished_deepslate_stairs", "e"));
    p.set(1, 1, 0, stair("polished_deepslate_stairs", "w"));
    for (const x of [-2, 2]) for (const z of [-2, 2]) {
      for (let y = 1; y <= 3; y++) p.set(x, y, z, "reinforced_deepslate");
      p.set(x, 4, z, lantern(false, true));
    }
    // the broken frame: 8 stones left, 16 empty slots to rebuild
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== 3) continue;
        if (x === 0 || z === 0 || Math.abs(x) === Math.abs(z)) p.set(x, 1, z, "chiseled_deepslate");
      }
    for (const x of [-3, 3]) for (const z of [-4, 4]) {
      p.set(x, 7, z, chain());
      p.set(x, 6, z, lantern(true, true));
    }
    p.set(-4, 1, 3, "sculk_sensor");
    p.set(4, 1, -3, "sculk_sensor");
    p.set(3, 1, 4, b("sculk_shrieker", { active: false, can_summon: false }));
    p.set(-4, 1, -4, "sculk_catalyst");
    for (const [x, z] of [[4, 2], [-2, 4], [4, -1]]) p.set(x, 1, z, "cobbled_deepslate");
    // the chained door and the corridor beyond
    for (let x = -2; x <= 2; x++) p.set(x, 4, -6, "chiseled_deepslate");
    for (const x of [-2, 2]) for (let y = 1; y <= 3; y++) p.set(x, y, -6, "polished_deepslate");
    for (const x of [-1, 1]) for (let y = 1; y <= 3; y++) p.set(x, y, -6, chain());
    p.air(0, 1, -6);
    p.air(0, 2, -6);
    p.set(0, 3, -6, chain("x"));
    for (let z = -9; z <= -7; z++)
      for (let x = -2; x <= 2; x++)
        for (let y = 0; y <= 4; y++) {
          if (Math.abs(x) <= 1 && y >= 1 && y <= 3) p.air(x, y, z);
          else p.set(x, y, z, "cobbled_deepslate");
        }
  },

  seal_sky(p) {
    // the outer ring, with its bridge to the island missing (24 blocks to place)
    p.disc(12.3, (x, z, d) => {
      if (Math.abs(x) <= 1 && z < 0 && d < 10.5) return;
      if (d < 10.5) return;
      const point = (x === 0 || z === 0) && d > 11;
      p.set(x, 0, z, point ? "chiseled_quartz_block" : d < 11 ? "light_blue_stained_glass" : QUARTZ);
      if (d > 10.8 && d < 11.8) p.set(x, -1, z, (x + z) % 3 === 0 ? "sea_lantern" : "light_blue_stained_glass");
      if (d > 11.8 && !point) p.set(x, 1, z, "glass_pane");
    });
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const x = Math.round(11.3 * Math.sin(a)), z = Math.round(-11.3 * Math.cos(a));
      p.set(x, -2, z, endRod("d"));
    }
    for (let k = 0; k < 8; k++) {
      const a = ((22.5 + 45 * k) * Math.PI) / 180;
      const x = Math.round(11.3 * Math.sin(a)), z = Math.round(-11.3 * Math.cos(a));
      p.set(x, 0, z, "chiseled_quartz_block");
      for (let y = 1; y <= 3; y++) p.set(x, y, z, log("quartz_pillar"));
      p.set(x, 4, z, endRod("u"));
    }
    // stubs of the old bridge on both sides of the gap
    p.set(0, 0, -11, "chiseled_quartz_block");
    // the island with the seal and its crown of end rods
    p.disc(2.5, (x, z) => p.set(x, 0, z, "smooth_quartz"));
    p.disc(1.5, (x, z) => p.set(x, -1, z, "quartz_block"));
    p.set(0, -2, 0, "quartz_block");
    p.set(0, -3, 0, endRod("d"));
    p.set(0, 0, 0, b("chiseled_quartz_block", { pillar_axis: "y" }));
    p.set(0, 1, 0, "lodestone");
    for (const [x, z] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) p.set(x, 1, z, endRod("u"));
    for (const x of [-1, 1]) for (const z of [-1, 1]) p.set(x, 1, z, candle(3, true, "white"));
  },

  hollow_gate(p) {
    p.pad(round(10.3), 10, 10, 11, 2);
    p.disc(10.3, (x, z, d) => {
      if (d <= 4.7) return;
      p.set(x, 0, z, d <= 6.5 ? mix(["blackstone", 3], [log("basalt"), 2], ["soul_soil", 2], ["sculk", 2], ["coarse_dirt", 1]) : mix(["coarse_dirt", 3], ["blackstone", 2], ["soul_soil", 1], ["sculk", 1], ["podzol", 1]));
      if (d > 6.5 && p.r() < 0.06) p.set(x, 1, z, "deadbush");
    });
    // the pit: blackened walls, soul soil floor, soul fire in the middle
    p.disc(4.7, (x, z, d) => {
      for (let y = -8; y <= 0; y++) {
        if (y === -8) p.soft(x, y, z, "blackstone");
        else if (d > 3.5) p.set(x, y, z, BLACK);
        else if (y === -7) p.set(x, y, z, "soul_soil");
        else if (y === -6 && d <= 1.6) p.set(x, y, z, b("soul_fire", { age: 0 }));
        else p.air(x, y, z);
      }
    });
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + 0.35 + i * 0.45;
      const x = Math.round(2.9 * Math.cos(a)), z = Math.round(2.9 * Math.sin(a));
      const s = 1 - 0.5 * i;
      p.set(x, Math.ceil(s) - 1, z, slab("blackstone_slab", Number.isInteger(s)));
    }
    // the arch over the pit
    for (let x = -8; x <= 8; x++)
      for (let y = 1; y <= 11; y++) {
        const eo = (x / 7.6) ** 2 + ((y - 0.5) / 10.8) ** 2, ei = (x / 5.4) ** 2 + ((y - 0.5) / 8.6) ** 2;
        if (eo > 1 || ei <= 1) continue;
        for (let z = -1; z <= 1; z++) p.set(x, y, z, z !== 0 && eo > 0.8 && p.r() < 0.35 ? "sculk" : mix(["obsidian", 4], ["crying_obsidian", 3], ["blackstone", 1]));
      }
    for (let y = 7; y <= 9; y++) p.set(0, y, 0, chain());
    p.set(0, 6, 0, lantern(true, true));
    // the altar and its sculk heart, basalt lamp posts
    p.set(0, 1, 7, "sculk_catalyst");
    for (const x of [-1, 1]) {
      p.set(x, 1, 7, "crying_obsidian");
      p.set(x, 2, 7, lantern(false, true));
    }
    p.set(0, 1, 8, "polished_blackstone_bricks");
    for (const x of [-6, 6]) for (const z of [-6, 6]) {
      for (let y = 1; y <= 3; y++) p.set(x, y, z, log("basalt"));
      p.set(x, 4, z, lantern(false, true));
    }
  },
};

/** Fences, panes, bars and walls join their neighbors in the plan. @param {Plan} p */
function connect(p) {
  const fam = (/** @type {string} */ id) => (/_fence$/.test(id) ? "fence" : /fence_gate$/.test(id) ? "gate" : /pane$|iron_bars$/.test(id) ? "pane" : /_wall$/.test(id) ? "wall" : "");
  const DXZ = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const e of p.m.values()) {
    const f = fam(e.b.id);
    if (!f || f === "gate") continue;
    /** @type {States} */
    const s = { ...(e.b.s ?? {}) };
    const links = DXZ.map(([dx, dz]) => {
      const n = p.get(e.x + dx, e.y, e.z + dz);
      if (!n || n.k === AIR || n.k === WATER || n.k === SKIP) return false;
      const nf = fam(n.b.id);
      return nf === f || (f === "fence" && nf === "gate") || (!nf && !PARTIAL.test(n.b.id));
    });
    links.forEach((on, i) => {
      if (f === "wall") s[`wall_connection_type_${NAMES[i]}`] = on ? "short" : "none";
      else s[`minecraft:connection_${NAMES[i]}`] = on;
    });
    if (f === "wall") s.wall_post_bit = !((links[0] && links[2] && !links[1] && !links[3]) || (links[1] && links[3] && !links[0] && !links[2]));
    e.b = { id: e.b.id, s };
  }
}

/**
 * The build's blocks in placing order, in local coordinates (facing 0).
 * @param {string} name @param {V3} origin @returns {{ entries: Entry[], entities: { type: string, at: V3 }[] }}
 */
export function blueprint(name, origin) {
  const p = new Plan(hash(`${name}:${origin.x},${origin.y},${origin.z}`));
  BUILD[name](p);
  connect(p);
  const phase = (/** @type {Entry} */ e) => (e.k === SOFT ? 0 : e.k === AIR || e.k === WATER ? 1 : ATTACH.test(e.b.id) ? (e.b.s?.hanging || /chain/.test(e.b.id) ? 4 : 3) : 2);
  const entries = [...p.m.values()].filter((e) => e.k !== SKIP);
  // hanging things go top-down so each has its support; everything else bottom-up
  entries.sort((a, c) => phase(a) - phase(c) || (phase(a) === 4 ? c.y - a.y : a.y - c.y));
  return { entries, entities: p.entities };
}

// ---------------------------------------------------------------------------
// Placing
// ---------------------------------------------------------------------------

/** @type {Map<string, BlockPermutation | null>} */
const perms = new Map();
/** @type {Set<string>} */
const warned = new Set();

/** @param {string} msg */
function warnOnce(msg) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`[saga] ${msg}`);
}

/** A permutation, dropping states this game version doesn't know. @param {B} blk */
function perm(blk) {
  const key = blk.id + JSON.stringify(blk.s ?? {});
  if (perms.has(key)) return perms.get(key) ?? null;
  /** @param {States | undefined} s */
  const tryResolve = (s) => {
    try {
      return BlockPermutation.resolve(/** @type {any} */ (blk.id), /** @type {any} */ (s));
    } catch {
      return null;
    }
  };
  let out = tryResolve(blk.s);
  if (!out && blk.s) {
    for (const k of Object.keys(blk.s)) {
      const rest = { ...blk.s };
      delete rest[k];
      if ((out = tryResolve(rest))) {
        warnOnce(`prefab block ${blk.id}: state ${k} unknown`);
        break;
      }
    }
    if (!out && (out = tryResolve(undefined))) warnOnce(`prefab block ${blk.id}: states unknown`);
  }
  if (!out) warnOnce(`prefab block ${blk.id} is unknown`);
  perms.set(key, out);
  return out;
}

const SOFT_GROUND = /grass$|fern|flower|bush|tulip|orchid|poppy|dandelion|allium|bluet|daisy|lily_of|cornflower|snow_layer|petals|leaf_litter|sapling|vine|seagrass|kelp|deadbush|lilac|peony|sunflower|leaves|mushroom$/;

/**
 * Places a prefab, a few hundred blocks per step: run it with system.runJob. Chunks that aren't
 * loaded are skipped (logged once); nothing throws.
 * @param {string} name @param {Dimension} dimension @param {V3} origin @param {number} facing
 * @returns {Generator<void, void, void>}
 */
export function* buildSteps(name, dimension, origin, facing) {
  let skipped = 0, failed = 0, n = 0;
  try {
    const f = ((facing % 4) + 4) % 4;
    const wet = PREFABS[name].site === "water";
    const { entries, entities } = blueprint(name, origin);
    for (const e of entries) {
      if (++n % 200 === 0) yield;
      const o = rotate(e, f);
      const at = { x: origin.x + o.x, y: origin.y + e.y, z: origin.z + o.z };
      try {
        const block = dimension.getBlock(at);
        if (!block) {
          skipped++;
          continue;
        }
        const id = block.typeId;
        const wasWater = block.isLiquid && id.includes("water");
        if (e.k === AIR && (block.isAir || block.isLiquid)) continue;
        if (e.k === WATER && (block.isAir || wasWater)) continue;
        if (e.k === SOFT && !(block.isAir || block.isLiquid || SOFT_GROUND.test(id))) continue;
        const pm = perm({ id: e.b.id, s: rotStates(e.b.s, f) });
        if (!pm) continue;
        block.setPermutation(pm);
        if (wet && wasWater && e.k !== WATER) {
          try {
            if (block.canContainLiquid(LiquidType.Water)) block.setWaterlogged(true);
          } catch {
            // a full block: no water inside
          }
        }
        if (e.up) {
          const top = dimension.getBlock({ x: at.x, y: at.y + 1, z: at.z });
          const pu = perm({ id: e.up.id, s: rotStates(e.up.s, f) });
          if (top && pu) top.setPermutation(pu);
        }
      } catch (err) {
        if (String(err).includes("Unloaded") || /unloaded/i.test(String(err))) skipped++;
        else {
          failed++;
          warnOnce(`prefab ${name}: ${err}`);
        }
      }
    }
    for (const en of entities) {
      const o = rotate(en.at, f);
      const at = { x: origin.x + o.x + 0.5, y: origin.y + en.at.y, z: origin.z + o.z + 0.5 };
      try {
        if (!dimension.getEntities({ type: en.type, location: at, maxDistance: 3 }).length) dimension.spawnEntity(/** @type {any} */ (en.type), at);
      } catch {
        skipped++;
      }
    }
  } catch (err) {
    warnOnce(`prefab ${name} stopped: ${err}`);
  }
  if (skipped) console.warn(`[saga] prefab ${name} at ${origin.x} ${origin.y} ${origin.z}: ${skipped} blocks skipped (chunks not loaded)`);
  if (failed) console.warn(`[saga] prefab ${name}: ${failed} blocks failed`);
}

// ---------------------------------------------------------------------------
// Site checks
// ---------------------------------------------------------------------------

const NATURAL = /^minecraft:(grass_block|dirt|coarse_dirt|rooted_dirt|dirt_with_roots|podzol|mycelium|mud|muddy_mangrove_roots|clay|sand|red_sand|gravel|suspicious_gravel|suspicious_sand|stone|granite|diorite|andesite|deepslate|tuff|calcite|dripstone_block|moss_block|pale_moss_block|snow|powder_snow|sandstone|red_sandstone|terracotta|[a-z_]+_terracotta|smooth_basalt|basalt|blackstone|netherrack|end_stone|[a-z_]*_ore|mangrove_roots)$/;

/**
 * What the top of a column is.
 * @param {Dimension} dim @param {number} x @param {number} z
 * @returns {{ kind: "ground" | "water" | "lava" | "tree" | "built" | "ice" | "none", y: number, floor?: number }}
 */
function surface(dim, x, z) {
  let blk;
  try {
    blk = dim.getTopmostBlock({ x, z });
  } catch {
    return { kind: "none", y: 0 };
  }
  for (let i = 0; i < 48 && blk; i++) {
    const id = blk.typeId, y = blk.location.y;
    if (blk.isLiquid && id.includes("lava")) return { kind: "lava", y };
    if (blk.isLiquid || id.includes("water")) {
      let fl = blk.below();
      for (let j = 0; j < 128 && fl && (fl.isLiquid || /seagrass|kelp|coral|sea_pickle/.test(fl.typeId)); j++) fl = fl.below();
      return { kind: "water", y, floor: fl ? fl.location.y : y - 128 };
    }
    if (/_leaves$|_log$|_wood$|mushroom_block|azalea|mangrove_roots$|bamboo/.test(id)) return { kind: "tree", y };
    if (/ice$/.test(id)) return { kind: "ice", y };
    if (NATURAL.test(id)) return { kind: "ground", y };
    let plant = SOFT_GROUND.test(id);
    if (!plant) {
      try {
        plant = blk.canBeDestroyedByLiquidSpread(LiquidType.Water);
      } catch {
        plant = false;
      }
    }
    if (!plant) return { kind: "built", y };
    blk = blk.below();
  }
  return { kind: "none", y: 0 };
}

/** @param {number[]} a */
function median(a) {
  const s = [...a].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
}

/**
 * Sample points over a prefab's footprint (5 by 5, corners included).
 * @param {PrefabInfo} info @param {number} x @param {number} z @param {number} [n]
 */
function samples(info, x, z, n = 5) {
  const h = Math.max(info.size.x, info.size.z) / 2 - 0.5;
  /** @type {[number, number][]} */
  const out = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push([Math.round(x - h + (2 * h * i) / (n - 1)), Math.round(z - h + (2 * h * j) / (n - 1))]);
  return out;
}

/** @param {Dimension} dim @param {PrefabInfo} info @param {number} x @param {number} z @returns {{ ok: boolean, y?: number, reason?: string }} */
function landOk(dim, info, x, z) {
  /** @type {number[]} */
  const ys = [];
  let trees = 0;
  for (const [sx, sz] of samples(info, x, z)) {
    const s = surface(dim, sx, sz);
    if (s.kind === "none") return { ok: false, reason: "not loaded" };
    if (s.kind === "lava") return { ok: false, reason: "lava" };
    if (s.kind === "built") return { ok: false, reason: "built up" };
    if (s.kind === "tree") {
      if (++trees > 3) return { ok: false, reason: "trees" };
      continue;
    }
    if (s.kind === "water" || s.kind === "ice") {
      if (!info.wet || s.y - (s.floor ?? s.y) > 2) return { ok: false, reason: "water" };
      ys.push(s.y);
      continue;
    }
    ys.push(s.y);
  }
  if (!ys.length) return { ok: false, reason: "trees" };
  const lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo > (info.slope ?? 3)) return { ok: false, reason: `too steep (${hi - lo})` };
  return { ok: true, y: median(ys) };
}

/**
 * Does the spot at x, z suit the place? Returns the origin y (the ground block's y, or the fixed y of
 * underground and sky places), and for coast places the facing that turns the front toward the water.
 * @param {string} name @param {Dimension} dimension @param {number} x @param {number} z
 * @returns {{ ok: boolean, y?: number, reason?: string, facing?: number }}
 */
export function siteOk(name, dimension, x, z) {
  const info = PREFABS[name];
  if (!info) return { ok: false, reason: "unknown place" };
  x = Math.floor(x);
  z = Math.floor(z);
  try {
    const range = dimension.heightRange;
    const above = info.size.y - (info.below ?? 0);
    if (info.site === "land") return landOk(dimension, info, x, z);
    if (info.site === "coast") {
      const land = landOk(dimension, info, x, z);
      if (!land.ok) return land;
      const h = (Math.max(info.size.x, info.size.z) - 1) / 2;
      for (let t = h + 1; t <= h + 12; t += 2)
        for (let f = 0; f < 4; f++) {
          const d = rotate({ x: 0, y: 0, z: -t }, f);
          if (surface(dimension, x + d.x, z + d.z).kind === "water") return { ok: true, y: land.y, facing: f };
        }
      return { ok: false, reason: "no water nearby" };
    }
    if (info.site === "high") {
      const land = landOk(dimension, info, x, z);
      if (!land.ok || land.y === undefined) return land;
      for (let dx = -48; dx <= 48; dx += 8)
        for (let dz = -48; dz <= 48; dz += 8) {
          if (dx * dx + dz * dz > 48 * 48) continue;
          const s = surface(dimension, x + dx, z + dz);
          if ((s.kind === "ground" || s.kind === "built") && s.y > land.y + 2) return { ok: false, reason: "not the highest point" };
        }
      return land;
    }
    if (info.site === "water") {
      /** @type {number[]} */
      const floors = [];
      for (const [sx, sz] of samples(info, x, z, 3)) {
        const s = surface(dimension, sx, sz);
        if (s.kind === "none") return { ok: false, reason: "not loaded" };
        if (s.kind !== "water" || s.floor === undefined) return { ok: false, reason: "not open water" };
        if (s.y - s.floor < (info.minDepth ?? above + 1)) return { ok: false, reason: `too shallow (${s.y - s.floor})` };
        floors.push(s.floor);
      }
      if (Math.max(...floors) - Math.min(...floors) > 3) return { ok: false, reason: "uneven sea floor" };
      return { ok: true, y: median(floors) };
    }
    const y = info.y ?? 0;
    if (y - (info.below ?? 0) < range.min || y + above >= range.max) return { ok: false, reason: "out of the world" };
    let solid = 0, total = 0;
    for (const [sx, sz] of samples(info, x, z, 3))
      for (const dy of info.site === "sky" ? [0, 4] : [0, 4, 8]) {
        const blk = dimension.getBlock({ x: sx, y: y + dy, z: sz });
        if (!blk) return { ok: false, reason: "not loaded" };
        if (blk.isLiquid && blk.typeId.includes("lava")) return { ok: false, reason: "lava" };
        total++;
        if (!blk.isAir && !blk.isLiquid) solid++;
      }
    if (info.site === "sky") return solid ? { ok: false, reason: "blocked" } : { ok: true, y };
    return solid / total >= 0.8 ? { ok: true, y } : { ok: false, reason: "caves" };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}
