// The minimap's terrain data, with no game imports so tools/map-terrain.test.mjs can run it in Node.
// World data is kept per "store": the surface of a dimension (the same for everyone) or one underground layer of a
// dimension (the height a player stands at; the cave picture depends on it). A store keeps canonical 4 x 4 samples
// and exact block columns within six blocks of a viewer (thin roofs must not alias their neighbors), by an exact
// numeric key (no wrapping: a far or negative column never lands on another's key). Players only share a store
// when what is stored in it means the same thing to both of them.
import { G } from "./glyphs.js";

export const COL = 4;
/** `since`: stored at or after this tick counts as done (default: when the plan was made). @typedef {{ wx: number, wz: number, key: number, resolution?: number, store?: Store, since?: number, stale?: boolean }} Pick */
/** @typedef {{ kind: string, y: number, depth: number, tick: number, glyph?: string }} Col */
/** `regions`: a version per REGION x REGION blocks, so a viewer redraws only for changes near it. @typedef {{ id: string, cols: Map<number, Col>, fine: Set<number>, coarse: Set<number>, ver: number, used: number, miss: Map<number, number>, regions: Map<number, number> }} Store */

/** Ticks before a column whose chunk wasn't loaded is read again. */
export const MISS_RETRY = 5;
/** Blocks a side of one region version (Store.regions). */
export const REGION = 64;
/** @param {number} wx @param {number} wz */
const regionKey = (wx, wz) => (Math.floor(wx / REGION) + 2 ** 20) * 2 ** 21 + (Math.floor(wz / REGION) + 2 ** 20);

const BIAS = 2 ** 24; // the world is 60 million blocks wide: 7.5 million columns a side, far less than 2^24
const SPAN = 2 ** 25;
/** colKey's coarse key is (floor(wx / COL) + KEY_BIAS) * KEY_SPAN + floor(wz / COL) + KEY_BIAS (for callers that inline it). */
export const KEY_BIAS = BIAS;
export const KEY_SPAN = SPAN;
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
      s = { id, cols: new Map(), fine: new Set(), coarse: new Set(), ver: 0, used: 0, miss: new Map(), regions: new Map() };
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
    this.#bump(s, wx, wz, resolution);
    return true;
  }
  /** A column changed: the store's version and its region's (and the shaded neighbors' region) go up. @param {Store} s @param {number} wx @param {number} wz @param {number} resolution */
  #bump(s, wx, wz, resolution) {
    s.ver++;
    const k = regionKey(wx, wz);
    s.regions.set(k, (s.regions.get(k) ?? 0) + 1);
    const k2 = regionKey(wx + resolution, wz + resolution);
    if (k2 !== k) s.regions.set(k2, (s.regions.get(k2) ?? 0) + 1);
  }
  /**
   * What a viewer's picture depends on: the sum of the region versions within `reach` blocks of (x, z). It only goes
   * up, and only when a column near the viewer changed (another viewer's reads far away leave it alone).
   * @param {Store} s @param {number} x @param {number} z @param {number} reach
   */
  viewVer(s, x, z, reach) {
    let n = 0;
    const x0 = Math.floor((x - reach) / REGION), x1 = Math.floor((x + reach) / REGION);
    const z0 = Math.floor((z - reach) / REGION), z1 = Math.floor((z + reach) / REGION);
    for (let rx = x0; rx <= x1; rx++) for (let rz = z0; rz <= z1; rz++) n += s.regions.get((rx + 2 ** 20) * 2 ** 21 + (rz + 2 ** 20)) ?? 0;
    return n;
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
        this.#bump(s, wx, wz, 1);
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
  /**
   * One candidate column: skipped at once when it is known and fresh (most are, so no Set or object for those).
   * @param {number} px @param {number} pz @param {number} resolution
   */
  const consider = (px, pz, resolution) => {
    const key = colKey(px, pz, resolution);
    if (key < 0) return;
    const have = store.cols.get(key);
    if (have && now - have.tick <= maxAge) return;
    if (seen.has(key)) return;
    seen.add(key);
    const missed = store.miss.get(key);
    if (missed !== undefined && now - missed < MISS_RETRY) return;
    list.push({ wx: sampleCoord(px, resolution), wz: sampleCoord(pz, resolution), resolution, key, d: (px - at.x) ** 2 + (pz - at.z) ** 2, a: (px - lx) ** 2 + (pz - lz) ** 2, stale: !!have });
  };
  /** The radar's cells around `from` (cellWorld and sampleResolution, inline). @param {number} fx @param {number} fz @param {boolean} near */
  const grid = (fx, fz, near) => {
    for (let r = -half; r <= half; r++) {
      const sy = r * cell;
      for (let c = -half; c <= half; c++) {
        const sx = c * cell;
        const px = north ? fx + sx : fx + sx * cos - sy * sin;
        const pz = north ? fz + sy : fz + sx * sin + sy * cos;
        // Always fill a canonical coarse base first. Near-field exact details then replace that known terrain;
        // prefetch needs only the base, not exact future blocks a fast flier may never stand on.
        consider(px, pz, COL);
        if (near && sx * sx + sy * sy <= 36) consider(px, pz, 1);
      }
    }
  };
  grid(at.x, at.z, true);
  if (ahead) grid(lx, lz, false);
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

/** Coarse column offsets within a disc, nearest first, by disc radius in columns. @type {Map<number, Int32Array>} */
const discs = new Map();
/** @param {number} r radius in columns */
function discOffsets(r) {
  let d = discs.get(r);
  if (d) return d;
  /** @type {[number, number, number][]} */
  const list = [];
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r) list.push([dx, dz, dx * dx + dz * dz]);
  list.sort((a, b) => a[2] - b[2]);
  d = new Int32Array(list.length * 2);
  list.forEach(([dx, dz], i) => {
    d[i * 2] = dx;
    d[i * 2 + 1] = dz;
  });
  discs.set(r, d);
  return d;
}

/**
 * The coarse columns a fast viewer will need around a point ahead of them (any heading: the radar's whole reach
 * there), nearest that point first, missing ones before stale ones; at most `limit`. Much cheaper than planScan:
 * one lookup per column, and it stops once it has `limit` missing ones.
 * @param {Store} store @param {number} x @param {number} z the point ahead @param {number} reach blocks around it
 * @param {number} now @param {number} maxAge @param {number} limit
 * @returns {Pick[]}
 */
export function aheadPicks(store, x, z, reach, now, maxAge, limit) {
  const offs = discOffsets(Math.ceil(reach / COL));
  const cx = Math.floor(x / COL);
  const cz = Math.floor(z / COL);
  /** @type {Pick[]} */
  const out = [];
  /** @type {Pick[]} */
  const stale = [];
  for (let i = 0; i < offs.length && out.length < limit; i += 2) {
    const qx = cx + offs[i];
    const qz = cz + offs[i + 1];
    const key = (qx + BIAS) * SPAN + qz + BIAS;
    const have = store.cols.get(key);
    if (have && now - have.tick <= maxAge) continue;
    const missed = store.miss.get(key);
    if (missed !== undefined && now - missed < MISS_RETRY) continue;
    (have ? stale : out).push({ wx: qx * COL + COL / 2, wz: qz * COL + COL / 2, key, resolution: COL });
  }
  for (const p of stale) if (out.length < limit) out.push(p);
  return out;
}

/**
 * Spends one tick's reading budget on every viewer's plan in turns, so each gets the same share and the unused
 * share of those who need less goes to the rest. A column stored since the plan was made (`at`, this tick when
 * missing), by any viewer of the same store, costs nothing. A plan kept over several ticks resumes where it
 * stopped (`pos`, written back).
 * @template {{ id: string, store: Store, picks: Pick[], pos?: number, at?: number }} P
 * @param {P[]} plans
 * @param {number} total reads all viewers share @param {number} each reads one viewer gets at most
 * @param {number} first which viewer goes first (turns over from tick to tick, so the odd read isn't always theirs)
 * @param {number} now the tick, which `read` stamps on what it stores
 * @param {(plan: P, pick: Pick) => boolean | void} read false: one operation ran, column still pending; otherwise finished
 *   (it may set plan.pos past the end to stop reading that plan)
 * @returns {Map<string, number>} reads per viewer
 */
export function spendBudget(plans, total, each, first, now, read) {
  /** @type {Map<string, number>} */
  const spent = new Map();
  const next = plans.map((p) => p.pos ?? 0);
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
        const since = pick.since ?? plan.at ?? now;
        if ((store.cols.get(pick.key)?.tick ?? -Infinity) >= since || (store.miss.get(pick.key) ?? -Infinity) >= since) {
          next[i]++;
          continue;
        }
        if (read(plan, pick) !== false) next[i]++;
        // A read may give up on the rest of its plan (raising plan.pos), as when its area isn't loaded.
        if (plan.pos !== undefined && plan.pos > next[i]) next[i] = plan.pos;
        spent.set(plan.id, used + 1);
        left--;
        progress = true;
        break;
      }
    }
  }
  for (let i = 0; i < plans.length; i++) plans[i].pos = next[i];
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

/** Passable plants the column reader looks under, by block id (learned once per id). @type {Map<string, boolean>} */
const plants = new Map();
/** @param {string} id */
function plant(id) {
  let p = plants.get(id);
  if (p === undefined) {
    p = !id.includes("leaves") && /short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|lily_of_the_valley|rose_bush|peony|lilac|dead_bush/.test(id);
    if (plants.size < 2000) plants.set(id, p);
  }
  return p;
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
  for (let i = 0; i < 2 && plant(block.typeId); i++) {
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
  return { kind: kindOf(id), y, depth: 0 };
}

/** Block id -> radar material, learned once per id (the tests run for every column read). @type {Map<string, string>} */
const kinds = new Map();
/** @param {string} id */
function kindOf(id) {
  const hit = kinds.get(id);
  if (hit) return hit;
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
  if (kinds.size < 2000) kinds.set(id, kind);
  return kind;
}

/**
 * What a finished scan depended on. It uses the radar's own geometry (half blocks, whole degrees), so any move or
 * turn that draws different columns plans the scan again. Other viewers' reads don't: a column they store is
 * simply skipped (and the time bucket brings back stale or evicted ones every 100 ticks).
 * @param {{ storeId: string, ver?: number, at: { x: number, z: number }, heading: number, north: boolean, radius: number, now: number, lead: { x: number, z: number } }} s
 */
export function scanMemo(s) {
  return `${s.storeId}|${Math.round(s.at.x * 2)}|${Math.round(s.at.z * 2)}|${s.north ? 0 : Math.round(s.heading)}|${s.radius}|${Math.floor(s.now / 100)}|${Math.round(s.lead.x / 4)}|${Math.round(s.lead.z / 4)}`;
}
