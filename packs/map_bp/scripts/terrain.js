// The minimap's terrain data, with no game imports so tools/map-terrain.test.mjs can run it in Node.
// World data is kept per "store": the surface of a dimension (the same for everyone) or one underground layer of a
// dimension (the height a player stands at; the cave picture depends on it). A store keeps canonical 4 x 4 samples
// and exact block columns within six blocks of a viewer (thin roofs must not alias their neighbors), by an exact
// numeric key (no wrapping: a far or negative column never lands on another's key). Players only share a store
// when what is stored in it means the same thing to both of them.
import { G } from "./glyphs.js";

export const COL = 4;
/** @typedef {{ wx: number, wz: number, key: number, resolution?: number, store?: Store }} Pick */
/** @typedef {{ kind: string, y: number, depth: number, tick: number, glyph?: string }} Col */
/** @typedef {{ id: string, cols: Map<number, Col>, fine: Set<number>, coarse: Set<number>, ver: number, used: number, miss: Map<number, number> }} Store */

/** Ticks before a column whose chunk wasn't loaded is read again. */
export const MISS_RETRY = 5;

const BIAS = 2 ** 24; // the world is 60 million blocks wide: 7.5 million columns a side, far less than 2^24
const SPAN = 2 ** 25;
/**
 * The key of the 4 x 4 column holding a block position, or -1 when it is beyond any real world (nothing is stored).
 * @param {number} wx @param {number} wz
 */
export function colKey(wx, wz, resolution = COL) {
  if (resolution === COL) {
    const qx = Math.floor(wx / COL) + BIAS;
    const qz = Math.floor(wz / COL) + BIAS;
    if (!(qx >= 0 && qx < SPAN && qz >= 0 && qz < SPAN)) return -1;
    return qx * SPAN + qz;
  }
  const span = SPAN * 2;
  const qx = Math.floor(wx) + BIAS * 2;
  const qz = Math.floor(wz) + BIAS * 2;
  if (!(qx >= 0 && qx < span && qz >= 0 && qz < span)) return -1;
  return 2 ** 52 + qx * span + qz;
}

/** Near-field detail without turning a fast flier's entire grid into 441 new block columns each tick. */
export const sampleResolution = (/** @type {number} */ sx, /** @type {number} */ sy) => sx * sx + sy * sy <= 36 ? 1 : COL;
/** Every key always means the same sampled block, regardless of who first requested it or their heading. */
export const sampleCoord = (/** @type {number} */ w, resolution = COL) => Math.floor(w / resolution) * resolution + Math.floor(resolution / 2);

export class TerrainWorld {
  /** @param {number} [maxCols] per store @param {number} [maxLayers] cave stores kept (the least recently used go) */
  constructor(maxCols = 6000, maxLayers = 24) {
    this.maxCols = maxCols;
    this.maxLayers = maxLayers;
    /** @type {Map<string, Store>} */
    this.stores = new Map();
    this.clock = 0;
  }
  /** @param {string} dimId @param {number | undefined} layer undefined: the surface; else the underground layer (the player's block height) */
  store(dimId, layer) {
    const id = layer === undefined ? `${dimId}|surface` : `${dimId}|layer${Math.floor(layer)}`;
    let s = this.stores.get(id);
    if (!s) {
      if (layer !== undefined) this.#dropOldLayer();
      s = { id, cols: new Map(), fine: new Set(), coarse: new Set(), ver: 0, used: 0, miss: new Map() };
      this.stores.set(id, s);
    }
    s.used = ++this.clock;
    return s;
  }
  #dropOldLayer() {
    let layers = 0;
    /** @type {Store | undefined} */
    let oldest;
    for (const s of this.stores.values()) {
      if (s.id.includes("|surface")) continue;
      layers++;
      if (!oldest || s.used < oldest.used) oldest = s;
    }
    if (oldest && layers >= this.maxLayers) this.stores.delete(oldest.id);
  }
  /** @param {Store} s @param {number} wx @param {number} wz */
  get(s, wx, wz, resolution = COL, retain = false) {
    const k = colKey(wx, wz, resolution);
    const value = k < 0 ? undefined : s.cols.get(k);
    if (value && retain) {
      const queue = resolution === 1 ? s.fine : s.coarse;
      queue.delete(k);
      queue.add(k);
    }
    return value;
  }
  /**
   * Stores a column. Returns true (and bumps the store's version, which redraws every viewer of it) when it is new or differs.
   * @param {Store} s @param {number} wx @param {number} wz @param {{ kind: string, y: number, depth: number }} d @param {number} tick
   */
  put(s, wx, wz, d, tick, resolution = COL) {
    const k = colKey(wx, wz, resolution);
    if (k < 0) return false;
    const old = s.cols.get(k);
    s.miss.delete(k);
    if (old && old.kind === d.kind && old.y === d.y && old.depth === d.depth) {
      old.tick = tick;
      return false;
    }
    if (!old && s.cols.size >= this.maxCols) {
      // Either resolution may borrow unused space, but neither may starve the other's working set.
      const reserve = Math.max(1, Math.floor(this.maxCols / 3));
      const queue = resolution === 1
        ? (s.fine.size >= reserve ? s.fine : s.coarse)
        : (s.coarse.size >= this.maxCols - reserve ? s.coarse : s.fine);
      const oldest = /** @type {number} */ (queue.values().next().value ?? s.cols.keys().next().value);
      s.cols.delete(oldest);
      s.fine.delete(oldest);
      s.coarse.delete(oldest);
      for (const k of [oldest + 1, oldest + (oldest >= 2 ** 52 ? SPAN * 2 : SPAN)]) {
        const neighbor = s.cols.get(k);
        if (neighbor) neighbor.glyph = undefined;
      }
    }
    s.cols.set(k, { kind: d.kind, y: d.y, depth: d.depth, tick });
    if (resolution === 1) s.fine.add(k);
    else s.coarse.add(k);
    this.#shadeNeighbors(s, wx, wz, resolution);
    s.ver++;
    return true;
  }
  /**
   * A read failed (the chunk isn't loaded): nothing is stored, what was known stays, and the column is asked again
   * in MISS_RETRY ticks.
   * @param {Store} s @param {number} wx @param {number} wz @param {number} tick
   */
  miss(s, wx, wz, tick, resolution = COL) {
    const k = colKey(wx, wz, resolution);
    if (k < 0) return;
    if (s.miss.size > 4000) s.miss.clear();
    s.miss.set(k, tick);
  }
  /** A block changed: forget its column in the dimension's surface and in every layer, so every viewer redraws it. @param {string} dimId @param {number} wx @param {number} wz */
  invalidate(dimId, wx, wz) {
    const keys = [colKey(wx, wz), colKey(wx, wz, 1)].filter((k) => k >= 0);
    let n = 0;
    for (const s of this.stores.values()) {
      if (!s.id.startsWith(`${dimId}|`)) continue;
      let changed = false;
      for (const k of keys) {
        changed = s.cols.delete(k) || changed;
        s.fine.delete(k);
        s.coarse.delete(k);
        s.miss.delete(k);
      }
      this.#shadeNeighbors(s, wx, wz, COL);
      this.#shadeNeighbors(s, wx, wz, 1);
      if (changed) {
        s.ver++;
        n++;
      }
    }
    return n;
  }
  /** Only the south/east samples depend on this sample's height. @param {Store} s @param {number} wx @param {number} wz @param {number} resolution */
  #shadeNeighbors(s, wx, wz, resolution) {
    for (const k of [colKey(wx + resolution, wz, resolution), colKey(wx, wz + resolution, resolution)]) {
      const neighbor = s.cols.get(k);
      if (neighbor) neighbor.glyph = undefined;
    }
  }
}

/** Where a radar cell is in the world: the same math the radar draws with. @param {{ x: number, z: number }} at @param {number} cos @param {number} sin @param {boolean} north @param {number} sx @param {number} sy */
export function cellWorld(at, cos, sin, north, sx, sy) {
  return north ? { x: at.x + sx, z: at.z + sy } : { x: at.x + sx * cos - sy * sin, z: at.z + sx * sin + sy * cos };
}

/**
 * The columns a scan should read for one viewer, most urgent first: those missing (never scanned) before those gone
 * stale, taken alternately from the picture right now (nearest the player) and the picture where the player is
 * heading (the cells of the same turned grid around the point `lead` blocks ahead), so a fast flier's far edge
 * never starves the middle. Cells come from the radar's own grid, so a turned view's corners are covered too.
 * @param {{ world: TerrainWorld, store: Store, at: { x: number, z: number }, heading: number, north: boolean, radius: number, half: number, lead: { x: number, z: number }, now: number, maxAge: number }} o
 * @returns {Pick[]}
 */
export function planScan({ world, store, at, heading, north, radius, half, lead, now, maxAge }) {
  const h = (heading * Math.PI) / 180;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  const cell = radius / half;
  const ahead = Math.hypot(lead.x, lead.z) >= 4;
  /** @type {Set<number>} */
  const seen = new Set();
  /** @type {(Pick & { d: number, a: number, stale: boolean })[]} */
  const list = [];
  const lx = at.x + lead.x;
  const lz = at.z + lead.z;
  /** @param {{ x: number, z: number }} from @param {number} stride */
  const grid = (from, stride) => {
    for (let r = -half; r <= half; r += stride) {
      for (let c = -half; c <= half; c += stride) {
        const p = cellWorld(from, cos, sin, north, c * cell, r * cell);
        // Always fill a canonical coarse base first. Near-field exact details then replace that known terrain;
        // prefetch needs only the base, not exact future blocks a fast flier may never stand on.
        const resolutions = from === at && sampleResolution(c * cell, r * cell) === 1 ? [COL, 1] : [COL];
        for (const resolution of resolutions) {
          const key = colKey(p.x, p.z, resolution);
          if (key < 0 || seen.has(key)) continue;
          seen.add(key);
          const have = store.cols.get(key);
          if (have && now - have.tick <= maxAge) continue;
          const missed = store.miss.get(key);
          if (missed !== undefined && now - missed < MISS_RETRY) continue;
          list.push({ wx: sampleCoord(p.x, resolution), wz: sampleCoord(p.z, resolution), resolution, key, d: (p.x - at.x) ** 2 + (p.z - at.z) ** 2, a: (p.x - lx) ** 2 + (p.z - lz) ** 2, stale: !!have });
        }
      }
    }
  };
  grid(at, 1);
  if (ahead) grid({ x: lx, z: lz }, 1);
  const byCenter = list.filter((e) => !e.stale).sort((a, b) => Number(a.resolution === 1) - Number(b.resolution === 1) || a.d - b.d);
  const byAhead = ahead ? list.filter((e) => !e.stale && e.resolution !== 1).sort((a, b) => a.a - b.a) : [];
  const stale = list.filter((e) => e.stale).sort((a, b) => a.d - b.d);
  /** @type {typeof list} */
  const out = [];
  /** @type {Set<number>} */
  const used = new Set();
  for (let i = 0, j = 0; i < byCenter.length || j < byAhead.length; ) {
    while (i < byCenter.length && used.has(byCenter[i].key)) i++;
    if (i < byCenter.length) {
      used.add(byCenter[i].key);
      out.push(byCenter[i++]);
    }
    while (j < byAhead.length && used.has(byAhead[j].key)) j++;
    if (j < byAhead.length) {
      used.add(byAhead[j].key);
      out.push(byAhead[j++]);
    }
  }
  for (const e of stale) out.push(e);
  return out;
}

/**
 * Spends one tick's reading budget on every viewer's plan in turns, so each gets the same share and the unused
 * share of those who need less goes to the rest. A column another viewer's turn already stored this tick (same store)
 * costs nothing.
 * @template {{ id: string, store: Store, picks: Pick[] }} P
 * @param {P[]} plans
 * @param {number} total reads all viewers share @param {number} each reads one viewer gets at most
 * @param {number} first which viewer goes first (turns over from tick to tick, so the odd read isn't always theirs)
 * @param {number} now the tick, which `read` stamps on what it stores
 * @param {(plan: P, pick: Pick) => boolean | void} read false: one operation ran, column still pending; otherwise finished
 * @returns {Map<string, number>} reads per viewer
 */
export function spendBudget(plans, total, each, first, now, read) {
  /** @type {Map<string, number>} */
  const spent = new Map();
  const next = new Array(plans.length).fill(0);
  let left = total;
  let progress = true;
  while (left > 0 && progress) {
    progress = false;
    for (let n = 0; n < plans.length && left > 0; n++) {
      const i = (first + n) % plans.length;
      const plan = plans[i];
      const used = spent.get(plan.id) ?? 0;
      if (used >= each) continue;
      while (next[i] < plan.picks.length) {
        const pick = plan.picks[next[i]];
        const store = pick.store ?? plan.store;
        if (store.cols.get(pick.key)?.tick === now || store.miss.get(pick.key) === now) {
          next[i]++;
          continue;
        }
        if (read(plan, pick) !== false) next[i]++;
        spent.set(plan.id, used + 1);
        left--;
        progress = true;
        break;
      }
    }
  }
  return spent;
}

const LIT = /** @type {Record<string, [string, string, string]>} */ ({
  mesa: [G.Q_MESA, G.Q_MESA_LO, G.Q_MESA_HI],
  forest: [G.Q_FOREST, G.Q_FOREST_LO, G.Q_FOREST_HI],
  sand: [G.Q_SAND, G.Q_SAND_LO, G.Q_SAND_HI],
  stone: [G.Q_STONE, G.Q_STONE_LO, G.Q_STONE_HI],
  snow: [G.Q_SNOW, G.Q_SNOW_LO, G.Q_SNOW_HI],
  path: [G.Q_PATH, G.Q_PATH_LO, G.Q_PATH_HI],
  grass: [G.Q_GRASS, G.Q_GRASS_LO, G.Q_GRASS_HI],
  sandstone: [G.Q_SANDSTONE, G.Q_SANDSTONE_LO, G.Q_SANDSTONE_HI],
  brick: [G.Q_BRICK, G.Q_MESA_LO, G.Q_MESA_HI],
});
const FLAT = /** @type {Record<string, string>} */ ({
  lava: G.Q_LAVA,
  cave: G.Q_CAVE,
  cave_floor: G.Q_CAVE_FLOOR,
  cave_wall: G.Q_CAVE_WALL,
  cherry: G.Q_CHERRY,
  birch: G.Q_BIRCH,
  spruce: G.Q_SPRUCE,
  savanna: G.Q_SAVANNA,
  swamp: G.Q_SWAMP,
  deepslate: G.Q_DEEPSLATE,
  crop: G.Q_CROP,
  warped: G.Q_WARPED,
  ice: G.Q_ICE,
  nether: G.Q_NETHER,
  end: G.Q_END,
});

/**
 * The radar glyph of a stored column, shaded by how much higher it is than the columns north and west of it.
 * A column nobody has read yet is G.Q_EMPTY (unknown), never made-up ground.
 * @param {TerrainWorld} world @param {Store} store @param {number} wx @param {number} wz
 */
export function glyphAt(world, store, wx, wz, resolution = COL) {
  const cur = world.get(store, wx, wz, resolution);
  if (!cur && resolution === 1) return glyphAt(world, store, wx, wz);
  if (!cur || cur.kind === "empty") return G.Q_EMPTY;
  if (cur.glyph) return cur.glyph;
  if (cur.kind === "water") return cur.glyph = cur.depth <= 1 ? G.Q_WATER_SHALLOW : cur.depth >= 3 ? G.Q_WATER_DEEP : G.Q_WATER;
  const flat = FLAT[cur.kind];
  if (flat) return cur.glyph = flat;
  const north = world.get(store, wx, wz - resolution, resolution);
  const west = world.get(store, wx - resolution, wz, resolution);
  const dh = cur.y - (north?.y ?? cur.y) + (cur.y - (west?.y ?? cur.y));
  const set = LIT[cur.kind] ?? LIT.grass;
  return cur.glyph = dh >= 2 ? set[2] : dh <= -2 ? set[1] : set[0];
}

/** @param {string} id */
const water = (id) => /^(minecraft:)?(water|flowing_water|kelp|seagrass|bubble_column)$/.test(id);
/** @param {import("@minecraft/server").Block | undefined} block */
function available(block) {
  if (!block) throw new Error("terrain block unavailable");
  // Reading a returned block can itself throw in an unloaded chunk.
  void block.typeId;
  return block;
}

/**
 * Each yield is exactly one native block query or bounded ray. The scheduler advances only one yield per budget
 * turn, shares unfinished work, and never commits a partial result. BDS 1.26.52 getTopmostBlock skips liquids;
 * a fluid-inclusive downward ray returns the actual water/plant or a solid bridge above it.
 * @param {import("@minecraft/server").Dimension} dim @param {number} x @param {number} z @param {number} [layer]
 * @returns {Generator<() => import("@minecraft/server").Block | undefined, { kind: string, y: number, depth: number }, import("@minecraft/server").Block | undefined>}
 */
export function* readColumn(dim, x, z, layer) {
  if (layer !== undefined) {
    const top = available(yield () => dim.getTopmostBlock({ x, z }));
    if (dim.id === "minecraft:nether" || layer < top.location.y - 8) {
      const here = available(yield () => dim.getBlock({ x, y: layer + 1, z }));
      const id = here.typeId;
      if (!here.isAir && !water(id) && !id.includes("lava")) return { kind: "cave_wall", y: layer, depth: 0 };
      const floor = available(yield () => dim.getBlock({ x, y: layer - 1, z }));
      const fid = floor.typeId;
      return { kind: /lava|magma/.test(fid) ? "lava" : water(fid) ? "water" : "cave_floor", y: layer - 1, depth: water(fid) ? 1 : 0 };
    }
  }
  const range = dim.heightRange;
  let block = available(yield () => dim.getBlockFromRay(
    { x: x + 0.5, y: range.max - 0.5, z: z + 0.5 }, { x: 0, y: -1, z: 0 },
    { includeLiquidBlocks: true, includePassableBlocks: true, maxDistance: range.max - range.min },
  )?.block);
  // At most two passable plant blocks; no column-height JS scan or recursion.
  for (let i = 0; i < 2 && !block.typeId.includes("leaves") && /short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|lily_of_the_valley|rose_bush|peony|lilac|dead_bush/.test(block.typeId); i++) {
    const y = block.location.y - 1;
    block = available(yield () => dim.getBlock({ x, y, z }));
  }
  const y = Math.floor(block.location.y);
  const id = block.typeId;
  if (water(id)) {
    const b1 = available(yield () => dim.getBlock({ x, y: y - 1, z }));
    if (!water(b1.typeId)) return { kind: "water", y, depth: 1 };
    const b3 = available(yield () => dim.getBlock({ x, y: y - 3, z }));
    return { kind: "water", y, depth: water(b3.typeId) ? 3 : 2 };
  }
  let kind = "grass";
  if (/lava|magma/.test(id)) kind = "lava";
  else if (/sandstone/.test(id)) kind = "sandstone";
  else if (/gravel/.test(id)) kind = "stone";
  else if (/:(wheat|carrots|potatoes|beetroot|melon_stem|pumpkin_stem)$/.test(id)) kind = "crop";
  else if (/white_(concrete|wool)|quartz/.test(id)) kind = "snow";
  else if (/black_(concrete|wool)/.test(id)) kind = "deepslate";
  else if (/(gray|light_gray)_(concrete|wool)/.test(id)) kind = "stone";
  else if (/brick|copper|shingle|tile/.test(id)) kind = "brick";
  else if (/planks|stairs|slab|wool|concrete|lantern|glass|fence|door|trapdoor|iron_block|gold_block|path|cobble|farmland/.test(id)) kind = "path";
  else if (/cherry_leaves|pink_petals/.test(id)) kind = "cherry";
  else if (/birch_leaves|azalea/.test(id)) kind = "birch";
  else if (/spruce_leaves|podzol/.test(id)) kind = "spruce";
  else if (/mangrove_leaves|mud|swamp|lily_pad/.test(id)) kind = "swamp";
  else if (/acacia_leaves|hay_block|dry_grass/.test(id)) kind = "savanna";
  else if (/warped_/.test(id)) kind = "warped";
  else if (/netherrack|nylium|wart_block|crimson|soul_/.test(id)) kind = "nether";
  else if (/end_stone|purpur|chorus/.test(id)) kind = "end";
  else if (/packed_ice|blue_ice|frosted_ice/.test(id)) kind = "ice";
  else if (/deepslate|obsidian|basalt|blackstone|bedrock|tuff/.test(id)) kind = "deepslate";
  else if (/terracotta|red_sand/.test(id)) kind = "mesa";
  else if (/snow|ice/.test(id)) kind = "snow";
  else if (/:(sand)$/.test(id)) kind = "sand";
  else if (/leaves|_log|bamboo|vine/.test(id)) kind = "forest";
  else if (/stone|andesite|diorite|granite|calcite|dripstone|ore/.test(id)) kind = "stone";
  return { kind, y, depth: 0 };
}

/**
 * What a finished scan depended on. It uses the radar's own geometry (half blocks, whole degrees), so any move or
 * turn that draws different columns plans the scan again.
 * @param {{ storeId: string, ver: number, at: { x: number, z: number }, heading: number, north: boolean, radius: number, now: number, lead: { x: number, z: number } }} s
 */
export function scanMemo(s) {
  return `${s.storeId}#${s.ver}|${Math.round(s.at.x * 2)}|${Math.round(s.at.z * 2)}|${s.north ? 0 : Math.round(s.heading)}|${s.radius}|${Math.floor(s.now / 100)}|${Math.round(s.lead.x / 4)}|${Math.round(s.lead.z / 4)}`;
}
