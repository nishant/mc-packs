// Atlas of the Realm: what each site looks like. Every prefab is drawn from non-directional blocks only,
// so turning one (facing 0-3) only turns the x/z offsets. Offsets are from the origin: the ground block
// (land sites) or the sea floor (the wreck); y 0 is that block's layer, y 1 the first layer above it.
// Ids checked against @minecraft/vanilla-data (cobblestone stairs are `stone_stairs`, chains `iron_chain`).

/** @typedef {Record<string, string | number | boolean>} States */
/** @typedef {[number, number, number, string, States?]} Entry  dx, dy, dz, block id (without minecraft:), states */
/**
 * @typedef {object} Prefab
 * @property {"land" | "water"} site
 * @property {number} r half the footprint's side (a 2r+1 square)
 * @property {number} h layers above y 0 to clear of natural blocks before building (land)
 * @property {string} floor the y 0 layer under the footprint (land); "" keeps the ground
 * @property {[number, number, number]} heart the block players tap, hit or break
 * @property {Entry[]} blocks
 * @property {[number, number, number][]} [bones] the fossil dig's bone blocks (put back for the next digger)
 */

/** A deterministic mix: the same offsets always get the same block. @param {string[]} ids @param {number} x @param {number} y @param {number} z */
function pick(ids, x, y, z) {
  const h = Math.imul(x * 73856093 ^ y * 19349663 ^ z * 83492791, 0x9e3779b1) >>> 0;
  return ids[((h ^ (h >>> 15)) >>> 0) % ids.length];
}

const STONE = ["stone_bricks", "stone_bricks", "mossy_stone_bricks", "cracked_stone_bricks"];
const COBBLE = ["cobblestone", "cobblestone", "mossy_cobblestone"];
const TUFF = ["tuff_bricks", "tuff_bricks", "polished_tuff", "tuff"];

/** @param {number} r @param {(x: number, z: number) => boolean} [mask] @returns {[number, number][]} */
function square(r, mask) {
  /** @type {[number, number][]} */
  const out = [];
  for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) if (!mask || mask(x, z)) out.push([x, z]);
  return out;
}

/** Wayside Shrine: a little roofed stone with a candle and flowers. */
function shrine() {
  /** @type {Entry[]} */
  const b = [];
  for (const [x, z] of square(2)) b.push([x, 0, z, pick(STONE, x, 0, z)]);
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    b.push([x, 1, z, "mossy_cobblestone_wall"], [x, 2, z, "mossy_cobblestone_wall"], [x, 3, z, "stone_brick_wall"]);
  }
  for (const [x, z] of square(2)) b.push([x, 4, z, Math.abs(x) === 2 || Math.abs(z) === 2 ? "stone_brick_slab" : "stone_bricks", { "minecraft:vertical_half": "bottom" }]);
  b.push([0, 1, 0, "chiseled_stone_bricks"], [0, 2, 0, "candle", { candles: 2, lit: true }]);
  b.push([0, 3, 0, "lantern", { hanging: true }]);
  b.push([1, 1, 1, "flower_pot"], [-1, 1, -1, "flower_pot"], [1, 1, -1, "moss_carpet"], [-1, 1, 1, "moss_carpet"]);
  return /** @type {Prefab} */ ({ site: "land", r: 2, h: 5, floor: "", heart: [0, 1, 0], blocks: b });
}

/** Starwright Tablet: a standing carved stone on a tuff step. */
function tablet() {
  /** @type {Entry[]} */
  const b = [];
  for (const [x, z] of square(1)) b.push([x, 0, z, pick(TUFF, x, 0, z)]);
  b.push([0, 1, 0, "polished_tuff"], [0, 2, 0, "chiseled_tuff_bricks"], [0, 3, 0, "chiseled_tuff"]);
  b.push([1, 1, 0, "moss_carpet"], [-1, 1, 1, "moss_carpet"], [0, 1, -1, "tuff_brick_slab", { "minecraft:vertical_half": "bottom" }]);
  return /** @type {Prefab} */ ({ site: "land", r: 1, h: 4, floor: "", heart: [0, 2, 0], blocks: b });
}

/** Choir Cairn: a pile of gray stones with a cracked bell on top, ringed by four gray standing stones. */
function cairn() {
  /** @type {Entry[]} */
  const b = [];
  const G = ["cobblestone", "mossy_cobblestone", "tuff", "andesite", "light_gray_concrete"];
  for (const [x, z] of square(2, (x, z) => Math.abs(x) + Math.abs(z) <= 3)) b.push([x, 1, z, pick(G, x, 1, z)]);
  for (const [x, z] of square(1)) b.push([x, 2, z, pick(G, x, 2, z)]);
  b.push([0, 3, 0, "tuff"], [0, 4, 0, "bell", { attachment: "standing" }]);
  for (const [x, z] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) b.push([x, 1, z, "gray_concrete"], [x, 2, z, "gray_concrete"]);
  b.push([2, 1, 2, "gray_carpet"], [-2, 1, -2, "light_gray_carpet"]);
  return /** @type {Prefab} */ ({ site: "land", r: 3, h: 5, floor: "", heart: [0, 4, 0], blocks: b });
}

/** Abandoned Camp: a wool lean-to, a dead campfire, a log seat and a barrel. */
function camp() {
  /** @type {Entry[]} */
  const b = [];
  for (const z of [-1, 0, 1]) {
    b.push([-2, 1, z, "spruce_fence"], [-2, 2, z, "white_wool"], [-1, 3, z, "white_wool"], [0, 3, z, "brown_wool"]);
  }
  b.push([-1, 1, -1, "white_carpet"], [-1, 1, 0, "white_carpet"]);
  b.push([2, 1, 0, "campfire", { extinguished: true }], [2, 1, 2, "spruce_log"], [3, 1, 2, "spruce_log"]);
  b.push([1, 1, -2, "barrel"], [2, 1, -2, "hay_block"], [0, 1, 2, "coarse_dirt"]);
  return /** @type {Prefab} */ ({ site: "land", r: 3, h: 4, floor: "coarse_dirt", heart: [1, 1, -2], blocks: b });
}

/** Hermit Hut: a one-room spruce cabin with a lantern, a bed of hay and a bookshelf. */
function hermit() {
  /** @type {Entry[]} */
  const b = [];
  for (const [x, z] of square(2)) b.push([x, 0, z, pick(COBBLE, x, 0, z)]);
  for (let y = 1; y <= 3; y++)
    for (const [x, z] of square(2, (x, z) => Math.abs(x) === 2 || Math.abs(z) === 2)) {
      const corner = Math.abs(x) === 2 && Math.abs(z) === 2;
      if (!corner && z === 2 && x === 0 && y <= 2) continue; // the doorway
      if (!corner && y === 2 && (x === 0 || z === 0)) b.push([x, y, z, "glass"]);
      else b.push([x, y, z, corner ? "spruce_log" : "spruce_planks"]);
    }
  for (const [x, z] of square(2)) b.push([x, 4, z, "spruce_planks"]);
  for (const [x, z] of square(1)) b.push([x, 5, z, "spruce_slab", { "minecraft:vertical_half": "bottom" }]);
  b.push([-1, 1, -1, "hay_block"], [1, 1, -1, "bookshelf"], [1, 1, 1, "crafting_table"], [0, 3, 0, "lantern", { hanging: true }]);
  b.push([-1, 1, 1, "flower_pot"]);
  return /** @type {Prefab} */ ({ site: "land", r: 2, h: 6, floor: "", heart: [0, 1, 0], blocks: b });
}

/** Sunken Wreck: a broken spruce hull on the sea floor with a chest and a snapped mast. */
function wreck() {
  /** @type {Entry[]} */
  const b = [];
  for (let x = -3; x <= 3; x++) {
    const w = Math.abs(x) === 3 ? 0 : 1;
    for (let z = -w; z <= w; z++) b.push([x, 1, z, x === 2 && z === 1 ? "spruce_slab" : "spruce_planks", { "minecraft:vertical_half": "bottom" }]);
    if (Math.abs(x) < 3) {
      b.push([x, 2, -2, pick(["spruce_planks", "spruce_planks", "stripped_spruce_log"], x, 2, -2)]);
      if (x !== 1) b.push([x, 2, 2, "spruce_planks"]);
    }
  }
  b.push([3, 2, 0, "spruce_fence"], [-3, 2, 0, "spruce_planks"], [-3, 3, 0, "spruce_fence"]);
  b.push([0, 2, 0, "spruce_log"], [0, 3, 0, "spruce_log"], [0, 4, 0, "spruce_fence"]);
  b.push([-1, 2, 0, "chest"], [1, 2, -1, "sea_pickle"], [-2, 2, 1, "seagrass"]);
  return /** @type {Prefab} */ ({ site: "water", r: 3, h: 0, floor: "", heart: [-1, 2, 0], blocks: b });
}

/** Fallen Watch Post: a broken stone ring with a bell on a post, a cold fire pit and cobwebs. */
function watch() {
  /** @type {Entry[]} */
  const b = [];
  for (const [x, z] of square(2)) b.push([x, 0, z, pick(COBBLE, x, 0, z)]);
  for (const [x, z] of square(2, (x, z) => Math.abs(x) === 2 || Math.abs(z) === 2)) {
    const tall = 1 + ((x * 7 + z * 13 + 40) % 4); // ragged: 1 to 4 high
    for (let y = 1; y <= tall; y++) if (!(z === -2 && x === 0 && y <= 2)) b.push([x, y, z, pick(STONE, x, y, z)]);
  }
  b.push([1, 1, 1, "spruce_fence"], [1, 2, 1, "spruce_fence"], [1, 3, 1, "spruce_planks"], [1, 4, 1, "bell", { attachment: "standing" }]);
  b.push([-1, 1, 0, "campfire", { extinguished: true }], [0, 1, 1, "web"], [-1, 1, -1, "cobblestone_slab", { "minecraft:vertical_half": "bottom" }]);
  return /** @type {Prefab} */ ({ site: "land", r: 2, h: 5, floor: "", heart: [1, 4, 1], blocks: b });
}

/** Fossil Dig: a shallow pit with a skeleton of 12 bone blocks, a fence frame and a lantern. */
function fossil() {
  /** @type {[number, number, number][]} */
  const bones = [
    [-2, 0, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0], // spine
    [-1, 0, -1], [-1, 0, 1], [1, 0, -1], [1, 0, 1], // ribs
    [3, 0, 0], [-2, -1, -1], [-2, -1, 1], // skull and hips
  ];
  /** @type {Entry[]} */
  const b = [];
  for (const [x, z] of square(3)) b.push([x, -1, z, pick(["gravel", "coarse_dirt", "dirt"], x, -1, z)]);
  for (const [x, z] of square(3)) b.push([x, 0, z, Math.abs(x) === 3 || Math.abs(z) === 3 ? "coarse_dirt" : "air"]);
  for (const [x, y, z] of bones) b.push([x, y, z, "bone_block"]);
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) b.push([x, 1, z, "spruce_fence"]);
  b.push([-3, 2, -3, "lantern"], [3, 1, -2, "barrel"]);
  return /** @type {Prefab} */ ({ site: "land", r: 3, h: 3, floor: "", heart: [0, 0, 0], blocks: b, bones });
}

/** Starglass Pool: a still pool rimmed with calcite, amethyst and tinted glass, an amethyst stone with an end rod. */
function pool() {
  /** @type {Entry[]} */
  const b = [];
  for (const [x, z] of square(3)) {
    const d = Math.max(Math.abs(x), Math.abs(z));
    if (d <= 1) b.push([x, -1, z, "amethyst_block"], [x, 0, z, "water"]);
    else if (d === 2) b.push([x, 0, z, pick(["calcite", "calcite", "tinted_glass", "smooth_basalt"], x, 0, z)]);
    else b.push([x, 0, z, pick(["calcite", "smooth_basalt", "tuff"], x, 0, z)]);
  }
  b.push([2, 1, 2, "amethyst_block"], [2, 2, 2, "end_rod"], [-2, 1, 2, "amethyst_cluster", { "minecraft:block_face": "up" }], [2, 1, -2, "amethyst_cluster", { "minecraft:block_face": "up" }]);
  return /** @type {Prefab} */ ({ site: "land", r: 3, h: 4, floor: "", heart: [2, 1, 2], blocks: b });
}

/** Fenn's Survey Marker: a stone post with a carved cap and a lantern. */
function survey() {
  /** @type {Entry[]} */
  const b = [];
  for (const [x, z] of square(1, (x, z) => x === 0 || z === 0)) b.push([x, 0, z, "cobblestone"]);
  b.push([0, 1, 0, "cobblestone_wall"], [0, 2, 0, "cobblestone_wall"], [0, 3, 0, "chiseled_stone_bricks"], [0, 4, 0, "lantern"]);
  return /** @type {Prefab} */ ({ site: "land", r: 1, h: 5, floor: "", heart: [0, 3, 0], blocks: b });
}

/** @type {Record<string, Prefab>} */
export const PREFABS = { shrine: shrine(), tablet: tablet(), cairn: cairn(), camp: camp(), hermit: hermit(), wreck: wreck(), watch: watch(), fossil: fossil(), pool: pool(), survey: survey() };

/** Turns an x/z offset by facing (0-3, quarter turns). @param {number} x @param {number} z @param {number} f @returns {[number, number]} */
export function turn(x, z, f) {
  switch (((f % 4) + 4) % 4) {
    case 1:
      return [-z, x];
    case 2:
      return [-x, -z];
    case 3:
      return [z, -x];
    default:
      return [x, z];
  }
}
