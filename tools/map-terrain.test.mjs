import{COL}from"../packs/map_bp/scripts/terrain.js";
import{BALANCED,SPEED}from"../packs/map_bp/scripts/map-profile.js";
import{circleAnchors}from"../packs/map_bp/scripts/terrain-work.js";
// Minimap terrain data (packs/map_bp/scripts/terrain.js): key collisions, surface/Nether-band separation, shared
// invalidation, rotated-viewport coverage, the shared reading budget, and a fast flight over changing ground.
//   node --test tools/map-terrain.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { fixture as v2fixture } from "./map-v2-fixture.mjs";
import { SCAN_POLICY } from "../packs/map_bp/scripts/scan-policy.js";
// Adapter only: all current cases run the actual V2 module, never historical Sharp/C87.
function fixture(_old = false, count = 1, options = {}) { return v2fixture(count, options); }
import { G, overlayGlyph, SELF_ARROWS } from "../packs/map_bp/scripts/glyphs.js";
import { cellWorld, radarGeometry, northUpRadarGeometry, colKey, glyphAt, planScan, sampleResolution, spendBudget, TerrainWorld } from "../packs/map_bp/scripts/terrain.js";
import * as terrain from "../packs/map_bp/scripts/terrain.js";


// Captured with git show 1fd52517662d17fd327ffce54760414c847018ab:packs/map_bp/scripts/terrain.js (LF).
// Exact HISTORICAL published21/COL4 implementation, not a current33 coverage/credit claim.
const HISTORICAL_SHA="04d6f0cce9361e41c05e6438bc69018f158b5c293590454d6647d39378ed8f8a";
const HISTORICAL_TERRAIN="// The minimap's terrain data, with no game imports so tools/map-terrain.test.mjs can run it in Node.\n// World data is kept per \"store\": the surface of a dimension (the same for everyone) or one underground layer of a\n// dimension (the height a player stands at; the cave picture depends on it). A store keeps canonical 4 x 4 samples\n// and exact block columns within six blocks of a viewer (thin roofs must not alias their neighbors), by an exact\n// numeric key (no wrapping: a far or negative column never lands on another's key). Players only share a store\n// when what is stored in it means the same thing to both of them.\nimport { G } from \"./glyphs.js\";\n\nexport const COL = 4;\n/** `since`: stored at or after this tick counts as done (default: when the plan was made). @typedef {{ wx: number, wz: number, key: number, resolution?: number, store?: Store, since?: number, stale?: boolean }} Pick */\n/** @typedef {{ kind: string, y: number, depth: number, tick: number, glyph?: string }} Col */\n/** `regions`: a version per REGION x REGION blocks, so a viewer redraws only for changes near it. @typedef {{ id: string, cols: Map<number, Col>, fine: Set<number>, coarse: Set<number>, ver: number, used: number, miss: Map<number, number>, regions: Map<number, number> }} Store */\n\n/** Ticks before a column whose chunk wasn't loaded is read again. */\nexport const MISS_RETRY = 5;\n/** Blocks a side of one region version (Store.regions). */\nexport const REGION = 64;\n/** @param {number} wx @param {number} wz */\nconst regionKey = (wx, wz) => (Math.floor(wx / REGION) + 2 ** 20) * 2 ** 21 + (Math.floor(wz / REGION) + 2 ** 20);\n\nconst BIAS = 2 ** 24; // the world is 60 million blocks wide: 7.5 million columns a side, far less than 2^24\nconst SPAN = 2 ** 25;\n/** colKey's coarse key is (floor(wx / COL) + KEY_BIAS) * KEY_SPAN + floor(wz / COL) + KEY_BIAS (for callers that inline it). */\nexport const KEY_BIAS = BIAS;\nexport const KEY_SPAN = SPAN;\n/**\n * The key of the 4 x 4 column holding a block position, or -1 when it is beyond any real world (nothing is stored).\n * @param {number} wx @param {number} wz\n */\nexport function colKey(wx, wz, resolution = COL) {\n  if (resolution === COL) {\n    const qx = Math.floor(wx / COL) + BIAS;\n    const qz = Math.floor(wz / COL) + BIAS;\n    if (!(qx >= 0 && qx < SPAN && qz >= 0 && qz < SPAN)) return -1;\n    return qx * SPAN + qz;\n  }\n  const span = SPAN * 2;\n  const qx = Math.floor(wx) + BIAS * 2;\n  const qz = Math.floor(wz) + BIAS * 2;\n  if (!(qx >= 0 && qx < span && qz >= 0 && qz < span)) return -1;\n  return 2 ** 52 + qx * span + qz;\n}\n\n/** Near-field detail without turning a fast flier's entire grid into 441 new block columns each tick. */\nexport const sampleResolution = (/** @type {number} */ sx, /** @type {number} */ sy) => sx * sx + sy * sy <= 36 ? 1 : COL;\n/** Every key always means the same sampled block, regardless of who first requested it or their heading. */\nexport const sampleCoord = (/** @type {number} */ w, resolution = COL) => Math.floor(w / resolution) * resolution + Math.floor(resolution / 2);\n\nexport class TerrainWorld {\n  /** @param {number} [maxCols] per store @param {number} [maxLayers] cave stores kept (the least recently used go) */\n  constructor(maxCols = 6000, maxLayers = 24) {\n    this.maxCols = maxCols;\n    this.maxLayers = maxLayers;\n    /** @type {Map<string, Store>} */\n    this.stores = new Map();\n    this.clock = 0;\n  }\n  /** @param {string} dimId @param {number | undefined} layer undefined: the surface; else the underground layer (the player's block height) */\n  store(dimId, layer) {\n    const id = layer === undefined ? `${dimId}|surface` : `${dimId}|layer${Math.floor(layer)}`;\n    let s = this.stores.get(id);\n    if (!s) {\n      if (layer !== undefined) this.#dropOldLayer();\n      s = { id, cols: new Map(), fine: new Set(), coarse: new Set(), ver: 0, used: 0, miss: new Map(), regions: new Map() };\n      this.stores.set(id, s);\n    }\n    s.used = ++this.clock;\n    return s;\n  }\n  #dropOldLayer() {\n    let layers = 0;\n    /** @type {Store | undefined} */\n    let oldest;\n    for (const s of this.stores.values()) {\n      if (s.id.includes(\"|surface\")) continue;\n      layers++;\n      if (!oldest || s.used < oldest.used) oldest = s;\n    }\n    if (oldest && layers >= this.maxLayers) this.stores.delete(oldest.id);\n  }\n  /** @param {Store} s @param {number} wx @param {number} wz */\n  get(s, wx, wz, resolution = COL, retain = false) {\n    const k = colKey(wx, wz, resolution);\n    const value = k < 0 ? undefined : s.cols.get(k);\n    if (value && retain) {\n      const queue = resolution === 1 ? s.fine : s.coarse;\n      queue.delete(k);\n      queue.add(k);\n    }\n    return value;\n  }\n  /**\n   * Stores a column. Returns true (and bumps the store's version, which redraws every viewer of it) when it is new or differs.\n   * @param {Store} s @param {number} wx @param {number} wz @param {{ kind: string, y: number, depth: number }} d @param {number} tick\n   */\n  put(s, wx, wz, d, tick, resolution = COL) {\n    const k = colKey(wx, wz, resolution);\n    if (k < 0) return false;\n    const old = s.cols.get(k);\n    s.miss.delete(k);\n    if (old && old.kind === d.kind && old.y === d.y && old.depth === d.depth) {\n      old.tick = tick;\n      return false;\n    }\n    if (!old && s.cols.size >= this.maxCols) {\n      // Either resolution may borrow unused space, but neither may starve the other's working set.\n      const reserve = Math.max(1, Math.floor(this.maxCols / 3));\n      const queue = resolution === 1\n        ? (s.fine.size >= reserve ? s.fine : s.coarse)\n        : (s.coarse.size >= this.maxCols - reserve ? s.coarse : s.fine);\n      const oldest = /** @type {number} */ (queue.values().next().value ?? s.cols.keys().next().value);\n      s.cols.delete(oldest);\n      s.fine.delete(oldest);\n      s.coarse.delete(oldest);\n      for (const k of [oldest + 1, oldest + (oldest >= 2 ** 52 ? SPAN * 2 : SPAN)]) {\n        const neighbor = s.cols.get(k);\n        if (neighbor) neighbor.glyph = undefined;\n      }\n    }\n    s.cols.set(k, { kind: d.kind, y: d.y, depth: d.depth, tick });\n    if (resolution === 1) s.fine.add(k);\n    else s.coarse.add(k);\n    this.#shadeNeighbors(s, wx, wz, resolution);\n    this.#bump(s, wx, wz, resolution);\n    return true;\n  }\n  /** A column changed: the store's version and its region's (and the shaded neighbors' region) go up. @param {Store} s @param {number} wx @param {number} wz @param {number} resolution */\n  #bump(s, wx, wz, resolution) {\n    s.ver++;\n    const k = regionKey(wx, wz);\n    s.regions.set(k, (s.regions.get(k) ?? 0) + 1);\n    const k2 = regionKey(wx + resolution, wz + resolution);\n    if (k2 !== k) s.regions.set(k2, (s.regions.get(k2) ?? 0) + 1);\n  }\n  /**\n   * What a viewer's picture depends on: the sum of the region versions within `reach` blocks of (x, z). It only goes\n   * up, and only when a column near the viewer changed (another viewer's reads far away leave it alone).\n   * @param {Store} s @param {number} x @param {number} z @param {number} reach\n   */\n  viewVer(s, x, z, reach) {\n    let n = 0;\n    const x0 = Math.floor((x - reach) / REGION), x1 = Math.floor((x + reach) / REGION);\n    const z0 = Math.floor((z - reach) / REGION), z1 = Math.floor((z + reach) / REGION);\n    for (let rx = x0; rx <= x1; rx++) for (let rz = z0; rz <= z1; rz++) n += s.regions.get((rx + 2 ** 20) * 2 ** 21 + (rz + 2 ** 20)) ?? 0;\n    return n;\n  }\n  /**\n   * A read failed (the chunk isn't loaded): nothing is stored, what was known stays, and the column is asked again\n   * in MISS_RETRY ticks.\n   * @param {Store} s @param {number} wx @param {number} wz @param {number} tick\n   */\n  miss(s, wx, wz, tick, resolution = COL) {\n    const k = colKey(wx, wz, resolution);\n    if (k < 0) return;\n    if (s.miss.size > 4000) s.miss.clear();\n    s.miss.set(k, tick);\n  }\n  /** A block changed: forget its column in the dimension's surface and in every layer, so every viewer redraws it. @param {string} dimId @param {number} wx @param {number} wz */\n  invalidate(dimId, wx, wz) {\n    const keys = [colKey(wx, wz), colKey(wx, wz, 1)].filter((k) => k >= 0);\n    let n = 0;\n    for (const s of this.stores.values()) {\n      if (!s.id.startsWith(`${dimId}|`)) continue;\n      let changed = false;\n      for (const k of keys) {\n        changed = s.cols.delete(k) || changed;\n        s.fine.delete(k);\n        s.coarse.delete(k);\n        s.miss.delete(k);\n      }\n      this.#shadeNeighbors(s, wx, wz, COL);\n      this.#shadeNeighbors(s, wx, wz, 1);\n      if (changed) {\n        this.#bump(s, wx, wz, 1);\n        n++;\n      }\n    }\n    return n;\n  }\n  /** Only the south/east samples depend on this sample's height. @param {Store} s @param {number} wx @param {number} wz @param {number} resolution */\n  #shadeNeighbors(s, wx, wz, resolution) {\n    for (const k of [colKey(wx + resolution, wz, resolution), colKey(wx, wz + resolution, resolution)]) {\n      const neighbor = s.cols.get(k);\n      if (neighbor) neighbor.glyph = undefined;\n    }\n  }\n}\n\n/** Where a radar cell is in the world: the same math the radar draws with. @param {{ x: number, z: number }} at @param {number} cos @param {number} sin @param {boolean} north @param {number} sx @param {number} sy */\nexport function cellWorld(at, cos, sin, north, sx, sy) {\n  return north ? { x: at.x + sx, z: at.z + sy } : { x: at.x + sx * cos - sy * sin, z: at.z + sx * sin + sy * cos };\n}\n\n/**\n * The columns a scan should read for one viewer, most urgent first: those missing (never scanned) before those gone\n * stale, taken alternately from the picture right now (nearest the player) and the picture where the player is\n * heading (the cells of the same turned grid around the point `lead` blocks ahead), so a fast flier's far edge\n * never starves the middle. Cells come from the radar's own grid, so a turned view's corners are covered too.\n * @param {{ world: TerrainWorld, store: Store, at: { x: number, z: number }, heading: number, north: boolean, radius: number, half: number, lead: { x: number, z: number }, now: number, maxAge: number }} o\n * @returns {Pick[]}\n */\nexport function planScan({ world, store, at, heading, north, radius, half, lead, now, maxAge }) {\n  const h = (heading * Math.PI) / 180;\n  const cos = Math.cos(h);\n  const sin = Math.sin(h);\n  const cell = radius / half;\n  const ahead = Math.hypot(lead.x, lead.z) >= 4;\n  /** @type {Set<number>} */\n  const seen = new Set();\n  /** @type {(Pick & { d: number, a: number, stale: boolean })[]} */\n  const list = [];\n  const lx = at.x + lead.x;\n  const lz = at.z + lead.z;\n  /**\n   * One candidate column: skipped at once when it is known and fresh (most are, so no Set or object for those).\n   * @param {number} px @param {number} pz @param {number} resolution\n   */\n  const consider = (px, pz, resolution) => {\n    const key = colKey(px, pz, resolution);\n    if (key < 0) return;\n    const have = store.cols.get(key);\n    if (have && now - have.tick <= maxAge) return;\n    if (seen.has(key)) return;\n    seen.add(key);\n    const missed = store.miss.get(key);\n    if (missed !== undefined && now - missed < MISS_RETRY) return;\n    list.push({ wx: sampleCoord(px, resolution), wz: sampleCoord(pz, resolution), resolution, key, d: (px - at.x) ** 2 + (pz - at.z) ** 2, a: (px - lx) ** 2 + (pz - lz) ** 2, stale: !!have });\n  };\n  /** The radar's cells around `from` (cellWorld and sampleResolution, inline). @param {number} fx @param {number} fz @param {boolean} near */\n  const grid = (fx, fz, near) => {\n    for (let r = -half; r <= half; r++) {\n      const sy = r * cell;\n      for (let c = -half; c <= half; c++) {\n        const sx = c * cell;\n        const px = north ? fx + sx : fx + sx * cos - sy * sin;\n        const pz = north ? fz + sy : fz + sx * sin + sy * cos;\n        // Always fill a canonical coarse base first. Near-field exact details then replace that known terrain;\n        // prefetch needs only the base, not exact future blocks a fast flier may never stand on.\n        consider(px, pz, COL);\n        if (near && sx * sx + sy * sy <= 36) consider(px, pz, 1);\n      }\n    }\n  };\n  grid(at.x, at.z, true);\n  if (ahead) grid(lx, lz, false);\n  const byCenter = list.filter((e) => !e.stale).sort((a, b) => Number(a.resolution === 1) - Number(b.resolution === 1) || a.d - b.d);\n  const byAhead = ahead ? list.filter((e) => !e.stale && e.resolution !== 1).sort((a, b) => a.a - b.a) : [];\n  const stale = list.filter((e) => e.stale).sort((a, b) => a.d - b.d);\n  /** @type {typeof list} */\n  const out = [];\n  /** @type {Set<number>} */\n  const used = new Set();\n  for (let i = 0, j = 0; i < byCenter.length || j < byAhead.length; ) {\n    while (i < byCenter.length && used.has(byCenter[i].key)) i++;\n    if (i < byCenter.length) {\n      used.add(byCenter[i].key);\n      out.push(byCenter[i++]);\n    }\n    while (j < byAhead.length && used.has(byAhead[j].key)) j++;\n    if (j < byAhead.length) {\n      used.add(byAhead[j].key);\n      out.push(byAhead[j++]);\n    }\n  }\n  for (const e of stale) out.push(e);\n  return out;\n}\n\n/** Coarse column offsets within a disc, nearest first, by disc radius in columns. @type {Map<number, Int32Array>} */\nconst discs = new Map();\n/** @param {number} r radius in columns */\nfunction discOffsets(r) {\n  let d = discs.get(r);\n  if (d) return d;\n  /** @type {[number, number, number][]} */\n  const list = [];\n  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (dx * dx + dz * dz <= r * r) list.push([dx, dz, dx * dx + dz * dz]);\n  list.sort((a, b) => a[2] - b[2]);\n  d = new Int32Array(list.length * 2);\n  list.forEach(([dx, dz], i) => {\n    d[i * 2] = dx;\n    d[i * 2 + 1] = dz;\n  });\n  discs.set(r, d);\n  return d;\n}\n\n/**\n * The coarse columns a fast viewer will need around a point ahead of them (any heading: the radar's whole reach\n * there), nearest that point first, missing ones before stale ones; at most `limit`. Much cheaper than planScan:\n * one lookup per column, and it stops once it has `limit` missing ones.\n * @param {Store} store @param {number} x @param {number} z the point ahead @param {number} reach blocks around it\n * @param {number} now @param {number} maxAge @param {number} limit\n * @returns {Pick[]}\n */\nexport function aheadPicks(store, x, z, reach, now, maxAge, limit) {\n  const offs = discOffsets(Math.ceil(reach / COL));\n  const cx = Math.floor(x / COL);\n  const cz = Math.floor(z / COL);\n  /** @type {Pick[]} */\n  const out = [];\n  /** @type {Pick[]} */\n  const stale = [];\n  for (let i = 0; i < offs.length && out.length < limit; i += 2) {\n    const qx = cx + offs[i];\n    const qz = cz + offs[i + 1];\n    const key = (qx + BIAS) * SPAN + qz + BIAS;\n    const have = store.cols.get(key);\n    if (have && now - have.tick <= maxAge) continue;\n    const missed = store.miss.get(key);\n    if (missed !== undefined && now - missed < MISS_RETRY) continue;\n    (have ? stale : out).push({ wx: qx * COL + COL / 2, wz: qz * COL + COL / 2, key, resolution: COL });\n  }\n  for (const p of stale) if (out.length < limit) out.push(p);\n  return out;\n}\n\n/**\n * Spends one tick's reading budget on every viewer's plan in turns, so each gets the same share and the unused\n * share of those who need less goes to the rest. A column stored since the plan was made (`at`, this tick when\n * missing), by any viewer of the same store, costs nothing. A plan kept over several ticks resumes where it\n * stopped (`pos`, written back).\n * @template {{ id: string, store: Store, picks: Pick[], pos?: number, at?: number }} P\n * @param {P[]} plans\n * @param {number} total reads all viewers share @param {number} each reads one viewer gets at most\n * @param {number} first which viewer goes first (turns over from tick to tick, so the odd read isn't always theirs)\n * @param {number} now the tick, which `read` stamps on what it stores\n * @param {(plan: P, pick: Pick) => boolean | void} read false: one operation ran, column still pending; otherwise finished\n *   (it may set plan.pos past the end to stop reading that plan)\n * @returns {Map<string, number>} reads per viewer\n */\nexport function spendBudget(plans, total, each, first, now, read) {\n  /** @type {Map<string, number>} */\n  const spent = new Map();\n  const next = plans.map((p) => p.pos ?? 0);\n  let left = total;\n  let progress = true;\n  while (left > 0 && progress) {\n    progress = false;\n    for (let n = 0; n < plans.length && left > 0; n++) {\n      const i = (first + n) % plans.length;\n      const plan = plans[i];\n      const used = spent.get(plan.id) ?? 0;\n      if (used >= each) continue;\n      while (next[i] < plan.picks.length) {\n        const pick = plan.picks[next[i]];\n        const store = pick.store ?? plan.store;\n        const since = pick.since ?? plan.at ?? now;\n        if ((store.cols.get(pick.key)?.tick ?? -Infinity) >= since || (store.miss.get(pick.key) ?? -Infinity) >= since) {\n          next[i]++;\n          continue;\n        }\n        if (read(plan, pick) !== false) next[i]++;\n        // A read may give up on the rest of its plan (raising plan.pos), as when its area isn't loaded.\n        if (plan.pos !== undefined && plan.pos > next[i]) next[i] = plan.pos;\n        spent.set(plan.id, used + 1);\n        left--;\n        progress = true;\n        break;\n      }\n    }\n  }\n  for (let i = 0; i < plans.length; i++) plans[i].pos = next[i];\n  return spent;\n}\n\nconst LIT = /** @type {Record<string, [string, string, string]>} */ ({\n  mesa: [G.Q_MESA, G.Q_MESA_LO, G.Q_MESA_HI],\n  forest: [G.Q_FOREST, G.Q_FOREST_LO, G.Q_FOREST_HI],\n  sand: [G.Q_SAND, G.Q_SAND_LO, G.Q_SAND_HI],\n  stone: [G.Q_STONE, G.Q_STONE_LO, G.Q_STONE_HI],\n  snow: [G.Q_SNOW, G.Q_SNOW_LO, G.Q_SNOW_HI],\n  path: [G.Q_PATH, G.Q_PATH_LO, G.Q_PATH_HI],\n  grass: [G.Q_GRASS, G.Q_GRASS_LO, G.Q_GRASS_HI],\n  sandstone: [G.Q_SANDSTONE, G.Q_SANDSTONE_LO, G.Q_SANDSTONE_HI],\n  brick: [G.Q_BRICK, G.Q_MESA_LO, G.Q_MESA_HI],\n});\nconst FLAT = /** @type {Record<string, string>} */ ({\n  lava: G.Q_LAVA,\n  cave: G.Q_CAVE,\n  cave_floor: G.Q_CAVE_FLOOR,\n  cave_wall: G.Q_CAVE_WALL,\n  cherry: G.Q_CHERRY,\n  birch: G.Q_BIRCH,\n  spruce: G.Q_SPRUCE,\n  savanna: G.Q_SAVANNA,\n  swamp: G.Q_SWAMP,\n  deepslate: G.Q_DEEPSLATE,\n  crop: G.Q_CROP,\n  warped: G.Q_WARPED,\n  ice: G.Q_ICE,\n  nether: G.Q_NETHER,\n  end: G.Q_END,\n});\n\n/**\n * The radar glyph of a stored column, shaded by how much higher it is than the columns north and west of it.\n * A column nobody has read yet is G.Q_EMPTY (unknown), never made-up ground.\n * @param {TerrainWorld} world @param {Store} store @param {number} wx @param {number} wz\n */\nexport function glyphAt(world, store, wx, wz, resolution = COL) {\n  const cur = world.get(store, wx, wz, resolution);\n  if (!cur && resolution === 1) return glyphAt(world, store, wx, wz);\n  if (!cur || cur.kind === \"empty\") return G.Q_EMPTY;\n  if (cur.glyph) return cur.glyph;\n  if (cur.kind === \"water\") return cur.glyph = cur.depth <= 1 ? G.Q_WATER_SHALLOW : cur.depth >= 3 ? G.Q_WATER_DEEP : G.Q_WATER;\n  const flat = FLAT[cur.kind];\n  if (flat) return cur.glyph = flat;\n  const north = world.get(store, wx, wz - resolution, resolution);\n  const west = world.get(store, wx - resolution, wz, resolution);\n  const dh = cur.y - (north?.y ?? cur.y) + (cur.y - (west?.y ?? cur.y));\n  const set = LIT[cur.kind] ?? LIT.grass;\n  return cur.glyph = dh >= 2 ? set[2] : dh <= -2 ? set[1] : set[0];\n}\n\n/** Passable plants the column reader looks under, by block id (learned once per id). @type {Map<string, boolean>} */\nconst plants = new Map();\n/** @param {string} id */\nfunction plant(id) {\n  let p = plants.get(id);\n  if (p === undefined) {\n    p = !id.includes(\"leaves\") && /short_grass|tall_grass|fern|flower|dandelion|poppy|tulip|orchid|allium|bluet|daisy|lily_of_the_valley|rose_bush|peony|lilac|dead_bush/.test(id);\n    if (plants.size < 2000) plants.set(id, p);\n  }\n  return p;\n}\n/** @param {string} id */\nconst water = (id) => /^(minecraft:)?(water|flowing_water|kelp|seagrass|bubble_column)$/.test(id);\n/** @param {import(\"@minecraft/server\").Block | undefined} block */\nfunction available(block) {\n  if (!block) throw new Error(\"terrain block unavailable\");\n  // Reading a returned block can itself throw in an unloaded chunk.\n  void block.typeId;\n  return block;\n}\n\n/**\n * Each yield is exactly one native block query or bounded ray. The scheduler advances only one yield per budget\n * turn, shares unfinished work, and never commits a partial result. BDS 1.26.52 getTopmostBlock skips liquids;\n * a fluid-inclusive downward ray returns the actual water/plant or a solid bridge above it.\n * @param {import(\"@minecraft/server\").Dimension} dim @param {number} x @param {number} z @param {number} [layer]\n * @returns {Generator<() => import(\"@minecraft/server\").Block | undefined, { kind: string, y: number, depth: number }, import(\"@minecraft/server\").Block | undefined>}\n */\nexport function* readColumn(dim, x, z, layer) {\n  if (layer !== undefined) {\n    const top = available(yield () => dim.getTopmostBlock({ x, z }));\n    if (dim.id === \"minecraft:nether\" || layer < top.location.y - 8) {\n      const here = available(yield () => dim.getBlock({ x, y: layer + 1, z }));\n      const id = here.typeId;\n      if (!here.isAir && !water(id) && !id.includes(\"lava\")) return { kind: \"cave_wall\", y: layer, depth: 0 };\n      const floor = available(yield () => dim.getBlock({ x, y: layer - 1, z }));\n      const fid = floor.typeId;\n      return { kind: /lava|magma/.test(fid) ? \"lava\" : water(fid) ? \"water\" : \"cave_floor\", y: layer - 1, depth: water(fid) ? 1 : 0 };\n    }\n  }\n  const range = dim.heightRange;\n  let block = available(yield () => dim.getBlockFromRay(\n    { x: x + 0.5, y: range.max - 0.5, z: z + 0.5 }, { x: 0, y: -1, z: 0 },\n    { includeLiquidBlocks: true, includePassableBlocks: true, maxDistance: range.max - range.min },\n  )?.block);\n  // At most two passable plant blocks; no column-height JS scan or recursion.\n  for (let i = 0; i < 2 && plant(block.typeId); i++) {\n    const y = block.location.y - 1;\n    block = available(yield () => dim.getBlock({ x, y, z }));\n  }\n  const y = Math.floor(block.location.y);\n  const id = block.typeId;\n  if (water(id)) {\n    const b1 = available(yield () => dim.getBlock({ x, y: y - 1, z }));\n    if (!water(b1.typeId)) return { kind: \"water\", y, depth: 1 };\n    const b3 = available(yield () => dim.getBlock({ x, y: y - 3, z }));\n    return { kind: \"water\", y, depth: water(b3.typeId) ? 3 : 2 };\n  }\n  return { kind: kindOf(id), y, depth: 0 };\n}\n\n/** Block id -> radar material, learned once per id (the tests run for every column read). @type {Map<string, string>} */\nconst kinds = new Map();\n/** @param {string} id */\nfunction kindOf(id) {\n  const hit = kinds.get(id);\n  if (hit) return hit;\n  let kind = \"grass\";\n  if (/lava|magma/.test(id)) kind = \"lava\";\n  else if (/sandstone/.test(id)) kind = \"sandstone\";\n  else if (/gravel/.test(id)) kind = \"stone\";\n  else if (/:(wheat|carrots|potatoes|beetroot|melon_stem|pumpkin_stem)$/.test(id)) kind = \"crop\";\n  else if (/white_(concrete|wool)|quartz/.test(id)) kind = \"snow\";\n  else if (/black_(concrete|wool)/.test(id)) kind = \"deepslate\";\n  else if (/(gray|light_gray)_(concrete|wool)/.test(id)) kind = \"stone\";\n  else if (/brick|copper|shingle|tile/.test(id)) kind = \"brick\";\n  else if (/planks|stairs|slab|wool|concrete|lantern|glass|fence|door|trapdoor|iron_block|gold_block|path|cobble|farmland/.test(id)) kind = \"path\";\n  else if (/cherry_leaves|pink_petals/.test(id)) kind = \"cherry\";\n  else if (/birch_leaves|azalea/.test(id)) kind = \"birch\";\n  else if (/spruce_leaves|podzol/.test(id)) kind = \"spruce\";\n  else if (/mangrove_leaves|mud|swamp|lily_pad/.test(id)) kind = \"swamp\";\n  else if (/acacia_leaves|hay_block|dry_grass/.test(id)) kind = \"savanna\";\n  else if (/warped_/.test(id)) kind = \"warped\";\n  else if (/netherrack|nylium|wart_block|crimson|soul_/.test(id)) kind = \"nether\";\n  else if (/end_stone|purpur|chorus/.test(id)) kind = \"end\";\n  else if (/packed_ice|blue_ice|frosted_ice/.test(id)) kind = \"ice\";\n  else if (/deepslate|obsidian|basalt|blackstone|bedrock|tuff/.test(id)) kind = \"deepslate\";\n  else if (/terracotta|red_sand/.test(id)) kind = \"mesa\";\n  else if (/snow|ice/.test(id)) kind = \"snow\";\n  else if (/:(sand)$/.test(id)) kind = \"sand\";\n  else if (/leaves|_log|bamboo|vine/.test(id)) kind = \"forest\";\n  else if (/stone|andesite|diorite|granite|calcite|dripstone|ore/.test(id)) kind = \"stone\";\n  if (kinds.size < 2000) kinds.set(id, kind);\n  return kind;\n}\n\n/**\n * What a finished scan depended on. It uses the radar's own geometry (half blocks, whole degrees), so any move or\n * turn that draws different columns plans the scan again. Other viewers' reads don't: a column they store is\n * simply skipped (and the time bucket brings back stale or evicted ones every 100 ticks).\n * @param {{ storeId: string, ver?: number, at: { x: number, z: number }, heading: number, north: boolean, radius: number, now: number, lead: { x: number, z: number } }} s\n */\nexport function scanMemo(s) {\n  return `${s.storeId}|${Math.round(s.at.x * 2)}|${Math.round(s.at.z * 2)}|${s.north ? 0 : Math.round(s.heading)}|${s.radius}|${Math.floor(s.now / 100)}|${Math.round(s.lead.x / 4)}|${Math.round(s.lead.z / 4)}`;\n}\n";
function historicalAPI(){assert.equal(crypto.createHash("sha256").update(HISTORICAL_TERRAIN).digest("hex"),HISTORICAL_SHA);return vm.runInNewContext(HISTORICAL_TERRAIN.replace(/^import .+;\r?\n/gm,"").replace(/^export /gm,"")+"\n;({TerrainWorld,planScan,spendBudget,glyphAt,cellWorld,sampleResolution})",{G});}
function historicalUnknown(api,w,store,at,heading,north,radius){let n=0;const h=heading*Math.PI/180;for(let r=-10;r<=10;r++)for(let c=-10;c<=10;c++){const p=api.cellWorld(at,Math.cos(h),Math.sin(h),north,c*radius/10,r*radius/10);if(api.glyphAt(w,store,p.x,p.z,api.sampleResolution(c*radius/10,r*radius/10))===G.Q_EMPTY)n++;}return n;}
const HALF = 16;
/** main.js's staleSlot (each player's turn for the 200-tick rebuild), for the radarOf sandboxes below. @param {string} source */
function realStaleSlot(source) {
  const fn = source.match(/function staleSlot\([\s\S]*?\n\}/)?.[0];
  return fn ? vm.runInNewContext(`${source.match(/^const STALE_EVERY = .+;$/m)[0]}\n${fn}\nstaleSlot`) : undefined;
}

test("current dense33 north-up uses cardinal UI overlays; rotated helper protects labels under crowded markers",()=>{
 const f=fixture(false,1),radarOf=f.api.radarOf;const markers=[[0,-200],[200,0],[0,200],[-200,0]].map(([x,z])=>({kind:"other",x,z}));markers.push({kind:"mob",x:5,z:5});
 for(const north of [false,true])for(let heading=0;heading<360;heading+=15){const text=radarOf(heading,markers,36,north,{x:0,z:0}),rows=text.split("\n");assert.equal(rows.length,33);assert.ok(rows.every(r=>[...r].length===33));assert.equal(Buffer.byteLength(text),3299);for(const g of [G.Q_NORTH,G.Q_EAST,G.Q_SOUTH,G.Q_WEST])assert.equal([...text].filter(c=>c===g).length,north?0:1);assert.equal([...text].filter(c=>Array.from({length:8},(_,i)=>G["Q_FRIEND_"+i]).includes(c)).length,4);assert.ok(text.includes(G.Q_MOB));}
 const ui=JSON.parse(fs.readFileSync(new URL("../packs/hud_rp/ui/hud_screen.json",import.meta.url),"utf8"));const widget=ui.realm_radar_panel.controls[0].radar_widget;for(const d of ["n","e","s","w"])assert.ok(widget.controls.some(c=>c["radar_"+d]?.controls[0]["radar_"+d+"_badge"].texture==="textures/ui/map_cardinal_"+d));
});
const OW = "minecraft:overworld";
/** The ground at a column: grass, with a lake from x = 200 on and a stone ridge for z > 300. */
const ground = (x, z) => (x >= 200 ? { kind: "water", y: 62, depth: 2 } : z > 300 ? { kind: "stone", y: 90, depth: 0 } : { kind: "grass", y: 70, depth: 0 });
const read = (world, store, now) => (_plan, p) => world.put(store, p.wx, p.wz, ground(p.wx, p.wz), now, p.resolution);
/** Every column the radar shows from here, by its own grid. */
function viewColumns(at, heading, north, radius) {
  const h = (heading * Math.PI) / 180;
  const set = new Set();
  for (let r = -HALF; r <= HALF; r++) for (let c = -HALF; c <= HALF; c++) {
    const p = cellWorld(at, Math.cos(h), Math.sin(h), north, (c * radius) / HALF, (r * radius) / HALF);
    set.add(colKey(p.x, p.z));
    if (sampleResolution(c * radius / HALF, r * radius / HALF) === 1) set.add(colKey(p.x, p.z, 1));
  }
  return set;
}
const unknownIn = (world, store, at, heading, north, radius) => {
  const h = (heading * Math.PI) / 180;
  let n = 0;
  for (let r = -HALF; r <= HALF; r++) for (let c = -HALF; c <= HALF; c++) {
    const p = cellWorld(at, Math.cos(h), Math.sin(h), north, (c * radius) / HALF, (r * radius) / HALF);
    if (glyphAt(world, store, p.x, p.z, sampleResolution(c * radius / HALF, r * radius / HALF)) === G.Q_EMPTY) n++;
  }
  return n;
};

test("column keys never collide, however far or negative", () => {
  const seen = new Map();
  for (const x of [-30_000_000, -131072, -4, -1, 0, 3, 4, 131068, 131072, 262144, 30_000_000])
    for (const z of [-30_000_000, -131072, -4, 0, 4, 131072, 262144, 30_000_000]) {
      const k = colKey(x, z);
      assert.ok(k >= 0);
      const col = `${Math.floor(x / terrain.COL)},${Math.floor(z / terrain.COL)}`;
      assert.ok(!seen.has(k) || seen.get(k) === col, `key ${k} shared by ${seen.get(k)} and ${col}`);
      seen.set(k, col);
    }
  assert.equal(colKey(0, 0), colKey(1.9, 1.9));
  assert.notEqual(colKey(0, 0), colKey(2, 0));
  assert.equal(colKey(1e12, 0), -1, "beyond the world nothing is stored");
});

test("Overworld/End ignore altitude while Nether eight-block bands keep independent stores",()=>{const w=new TerrainWorld(),surface=w.store(OW),end=w.store("minecraft:the_end"),a=w.store("minecraft:nether",20),b=w.store("minecraft:nether",28);assert.equal(w.store(OW,12),surface);assert.equal(w.store(OW,200),surface);w.put(surface,0,0,ground(0,0),1);w.put(a,0,0,{kind:"nether",y:18,depth:0},1);assert.equal(glyphAt(w,surface,0,0),G.Q_GRASS);assert.equal(glyphAt(w,a,0,0),G.Q_NETHER);assert.equal(glyphAt(w,b,0,0),G.Q_EMPTY);assert.equal(glyphAt(w,end,0,0),G.Q_EMPTY);});

test("dimension invalidation retains last-good pixels as stale, bumps every affected band and revalidation",()=>{const w=new TerrainWorld(),surface=w.store(OW),a=w.store("minecraft:nether",20),b=w.store("minecraft:nether",28),end=w.store("minecraft:the_end");for(const t of [surface,a,b,end])w.put(t,8,8,{kind:"stone",y:60,depth:0},1);const before=[surface.ver,a.ver,b.ver,end.ver];assert.equal(w.invalidate(OW,9,9),1);assert.deepEqual([surface.ver,a.ver,b.ver,end.ver],[before[0]+1,...before.slice(1)]);assert.equal(w.get(surface,8,8).tick,-Infinity);assert.equal(glyphAt(w,surface,8,8),G.Q_STONE);assert.equal(w.invalidate("minecraft:nether",9,9),2);assert.equal(a.ver,before[1]+1);assert.equal(b.ver,before[2]+1);assert.equal(end.ver,before[3]);assert.equal(w.put(surface,8,8,{kind:"stone",y:60,depth:0},5),true);assert.equal(w.put(surface,8,8,{kind:"stone",y:60,depth:0},6),false);});

test("old Nether bands are bounded and retired, never the Overworld surface",()=>{const w=new TerrainWorld(100,3),surface=w.store(OW);for(let y=4;y<84;y+=8)w.store("minecraft:nether",y);assert.ok(w.stores.size<=4);assert.equal(w.store(OW),surface);});

for (const heading of [0, 45, 90, 135, 200, 315]) {
  test(`generic planScan helper covers rotated grid at ${heading} degrees; live circle admission is tested separately`, () => {
    const w = new TerrainWorld();
    const store = w.store(OW);
    const at = { x: 1003.5, z: -2210.2 };
    const radius = 24;
    const plan = planScan({ world: w, store, at, heading, north: false, radius, half: HALF, lead: { x: 0, z: 0 }, now: 0, maxAge: 2400 });
    const want = viewColumns(at, heading, false, radius);
    assert.deepEqual(new Set(plan.map((p) => p.key)), want);
    assert.equal(plan.length, want.size, "no column twice");
  });
}

test("generic planScan helper lists the square nearest-first; production applies actual circle36", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const at = { x: 10, z: 10 };
  const plan = planScan({ world: w, store, at, heading: 77, north: true, radius: 24, half: HALF, lead: { x: 0, z: 0 }, now: 0, maxAge: 2400 });
  assert.deepEqual(new Set(plan.map((p) => p.key)), viewColumns(at, 77, true, 24));
  assert.equal(plan[0].key, colKey(10, 10));
});

test("a fast lead does not starve the columns under the player", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const at = { x: 0, z: 0 };
  const plan = planScan({ world: w, store, at, heading: 90, north: false, radius: 24, half: HALF, lead: { x: 28, z: 0 }, now: 0, maxAge: 2400 });
  const first = new Set(plan.slice(0, 24).map((p) => p.key));
  const near = [...new Set([[0, 0], [-2, 0], [0, -2], [-2, -2]].map(([x, z]) => colKey(x, z)))];
  for (const k of near) assert.ok(first.has(k), "the middle is read in the first 24 reads");
  const ahead = plan.slice(0, 24).filter((p) => p.wx > 20).length;
  assert.ok(ahead >= 4, "and so is the ground ahead");
});

test("stale columns come after missing ones", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const at = { x: 0, z: 0 };
  w.put(store, 0, 0, ground(0, 0), 0);
  const plan = planScan({ world: w, store, at, heading: 0, north: true, radius: 24, half: HALF, lead: { x: 0, z: 0 }, now: 5000, maxAge: 2400 });
  assert.equal(plan.at(-1).key, colKey(0, 0));
});

test("the reading budget is shared evenly, and a column read for one viewer is free for the next", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const picks = (x0) => Array.from({ length: 100 }, (_, i) => ({ wx: x0 + i * 4, wz: 0, key: colKey(x0 + i * 4, 0) }));
  const plans = ["a", "b", "c", "d"].map((id, i) => ({ id, store, picks: picks(i * 20_000) }));
  let reads = 0;
  const spent = spendBudget(plans, 48, 24, 2, 7, (_p, p) => {
    reads++;
    w.put(store, p.wx, p.wz, ground(p.wx, p.wz), 7);
  });
  assert.equal(reads, 48);
  assert.deepEqual([...spent.values()], [12, 12, 12, 12]);
  // The same columns for two viewers in one store: the second reads other ones with the shared budget.
  const same = [{ id: "x", store: w.store("minecraft:nether", 20), picks: picks(500_000) }, { id: "y", store: w.store("minecraft:nether", 20), picks: picks(500_000) }];
  reads = 0;
  spendBudget(same, 20, 20, 0, 9, (_p, p) => {
    reads++;
    w.put(same[0].store, p.wx, p.wz, ground(p.wx, p.wz), 9);
  });
  assert.equal(reads, 20);
  assert.equal(same[0].store.cols.size, 20, "twenty distinct columns, none read twice");
  // A viewer with little to do leaves its share to the others.
  reads = 0;
  const few = [{ id: "p", store, picks: picks(900_000).slice(0, 2) }, { id: "q", store, picks: picks(950_000) }];
  const s2 = spendBudget(few, 48, 24, 0, 11, (_p, p) => {
    reads++;
    w.put(store, p.wx, p.wz, ground(p.wx, p.wz), 11);
  });
  assert.equal(s2.get("p"), 2);
  assert.equal(s2.get("q"), 24);
});

test("HISTORICAL published21/COL4: flying fast over changing ground: the view fills in each tick and shows the lake as it comes", () => {
  const api=historicalAPI(),{TerrainWorld,planScan,spendBudget,glyphAt}=api;const HALF=10;const unknownIn=(...args)=>historicalUnknown(api,...args);
  const w = new TerrainWorld();
  const store = w.store(OW);
  const radius = 24;
  let x = 0;
  const speed = 3.2; // blocks a tick, elytra with a rocket
  let worst = 0;
  let sawLake = false;
  for (let tick = 1; tick <= 300; tick++) {
    x += speed;
    const at = { x, z: 40 };
    const heading = 90;
    const plan = planScan({ world: w, store, at, heading, north: false, radius, half: HALF, lead: { x: speed * 8, z: 0 }, now: tick, maxAge: 2400 });
    spendBudget([{ id: "f", store, picks: plan }], 48, 48, 0, tick, read(w, store, tick));
    if (tick > 5) {
      const unknown = unknownIn(w, store, at, heading, false, radius);
      worst = Math.max(worst, unknown);
    }
    if (x > 260) sawLake ||= glyphAt(w, store, x + 20, 40) === G.Q_WATER;
  }
  assert.ok(worst <= 9, `at most 9 of 441 cells unknown on any tick (worst ${worst})`);
  assert.ok(sawLake, "the lake shows once flown over");
  assert.equal(glyphAt(w, store, 100, 40), G.Q_GRASS);
  assert.equal(glyphAt(w, store, 600, 40), G.Q_WATER, "terrain changed along the flight");
});

test("HISTORICAL published21/COL4: two fliers and a cave walker share the budget and never see each other's ground", () => {
  const api=historicalAPI(),{TerrainWorld,planScan,spendBudget,glyphAt}=api;const HALF=10;const unknownIn=(...args)=>historicalUnknown(api,...args);
  const w = new TerrainWorld();
  const surface = w.store(OW);
  const cave = w.store(OW, 20);
  const radius = 24;
  const fliers = [{ id: "f1", x: 0, z: 0, dx: 3, dz: 0, h: 90 }, { id: "f2", x: 400, z: 400, dx: 0, dz: 3, h: 180 }];
  let worst = 0;
  for (let tick = 1; tick <= 120; tick++) {
    const plans = fliers.map((f) => {
      f.x += f.dx;
      f.z += f.dz;
      return { id: f.id, store: surface, picks: planScan({ world: w, store: surface, at: f, heading: f.h, north: false, radius, half: HALF, lead: { x: f.dx * 8, z: f.dz * 8 }, now: tick, maxAge: 2400 }) };
    });
    plans.push({ id: "c", store: cave, picks: planScan({ world: w, store: cave, at: { x: 0, z: 0 }, heading: 0, north: false, radius, half: HALF, lead: { x: 0, z: 0 }, now: tick, maxAge: 2400 }) });
    spendBudget(plans, 96, 48, tick, tick, (plan, p) => { w.put(plan.store, p.wx, p.wz, plan.store === cave ? { kind: "cave_floor", y: 19, depth: 0 } : ground(p.wx, p.wz), tick, p.resolution); });
    if (tick > 40) for (const f of fliers) worst = Math.max(worst, unknownIn(w, surface, f, f.h, false, radius));
  }
  assert.ok(worst <= 12, `both fliers keep a full picture (worst ${worst} unknown)`);
  for (const f of fliers) for (const g of [0, 45, 90]) assert.notEqual(glyphAt(w, surface, f.x - g, f.z), G.Q_CAVE_FLOOR);
  assert.equal(glyphAt(w, surface, 0, 0), G.Q_GRASS, "the cave walker's floor did not replace the surface where they stand");
});

test("a finished scan is planned again after sub-block or sub-2-degree motion that the radar draws", async () => {
  const { scanMemo } = await import("../packs/map_bp/scripts/terrain.js");
  const base = { storeId: "d|s", ver: 1, at: { x: 3.8, z: 0 }, heading: 0, north: false, radius: 64, now: 10, lead: { x: 0, z: 0 } };
  assert.notEqual(scanMemo(base), scanMemo({ ...base, at: { x: 4.3, z: 0 } }));
  assert.notEqual(scanMemo(base), scanMemo({ ...base, heading: 0.6 }));
  assert.equal(scanMemo({ ...base, heading: 5 }), scanMemo({ ...base, north: false, heading: 5 }));
  assert.equal(scanMemo({ ...base, heading: 5 }) === scanMemo({ ...base, north: true, heading: 40 }), false);
  assert.equal(scanMemo({ ...base, north: true, heading: 5 }), scanMemo({ ...base, north: true, heading: 40 }));
});

test("a failed read stores nothing, keeps old data, retries in a few ticks and loads next tick", async () => {
  const { MISS_RETRY } = await import("../packs/map_bp/scripts/terrain.js");
  const w = new TerrainWorld(6000, 4);
  const s = w.store("minecraft:overworld", undefined);
  const o = { world: w, store: s, at: { x: 0, z: 0 }, heading: 0, north: true, radius: 64, half: 10, lead: { x: 0, z: 0 }, maxAge: 2400 };
  const first = planScan({ ...o, now: 100 });
  assert.ok(first.length > 0);
  w.put(s, 0, 0, { kind: "stone", y: 70, depth: 0 }, 100);
  const k = first.find((p) => p.key !== colKey(0, 0));
  w.miss(s, k.wx, k.wz, 100);
  assert.equal(s.cols.size, 1, "a miss stores no column");
  assert.ok(!planScan({ ...o, now: 100 + MISS_RETRY - 1 }).some((p) => p.key === k.key), "waits for the retry");
  assert.ok(planScan({ ...o, now: 100 + MISS_RETRY }).some((p) => p.key === k.key), "asked again");
  w.put(s, k.wx, k.wz, { kind: "grass", y: 65, depth: 0 }, 106);
  assert.equal(w.get(s, k.wx, k.wz).kind, "grass", "real data right after the chunk loads");
  assert.equal(s.miss.size, 0);
});

test("nearby one-block roofs have separate cache identities and deterministic samples", () => {
  assert.notEqual(colKey(2, 2, 1), colKey(3, 2, 1), "adjacent thin roofs cannot share a sample");
  assert.notEqual(colKey(2, 2, 1), colKey(2, 2, 4), "resolution is part of cache identity");
  const w = new TerrainWorld();
  const s = w.store(OW);
  const plan = planScan({ world: w, store: s, at: { x: 0.1, z: 0.1 }, heading: 0, north: true, radius: 24, half: HALF, lead: { x: 0, z: 0 }, now: 1, maxAge: 2400 });
  for (const p of plan) {
    assert.equal(p.wx, Math.floor(p.wx));
    assert.equal(p.wz, Math.floor(p.wz));
    assert.equal(colKey(p.wx, p.wz, p.resolution), p.key);
    if (p.resolution === terrain.COL) {
      assert.equal(((p.wx % 2) + 2) % 2, 1, "coarse samples always use the cell center");
      assert.equal(((p.wz % 2) + 2) % 2, 1);
    }
  }
  w.put(s, 2, 2, { kind: "path", y: 80, depth: 0 }, 1, 1);
  w.put(s, 3, 2, { kind: "brick", y: 90, depth: 0 }, 1, 1);
  assert.equal(w.get(s, 2, 2, 1).y, 80);
  assert.equal(w.get(s, 3, 2, 1).y, 90);
  assert.equal(w.invalidate(OW, 3, 2), 1);
  assert.equal(w.get(s, 3, 2, 1).tick, -Infinity, "last-good exact column stays stale, not deleted");
  assert.equal(w.get(s, 2, 2, 1).y, 80);
});

test("reusing shaded glyphs still responds to neighbor edits and removal at both resolutions", () => {
  for (const resolution of [1, 2]) {
    const w = new TerrainWorld();
    const s = w.store(OW);
    w.put(s, 0, 0, { kind: "stone", y: 80, depth: 0 }, 1, resolution);
    assert.equal(glyphAt(w, s, 0, 0, resolution), G.Q_STONE);
    w.put(s, -resolution, 0, { kind: "stone", y: 70, depth: 0 }, 2, resolution);
    assert.equal(glyphAt(w, s, 0, 0, resolution), G.Q_STONE_HI);
    w.put(s, -resolution, 0, { kind: "stone", y: 90, depth: 0 }, 3, resolution);
    assert.equal(glyphAt(w, s, 0, 0, resolution), G.Q_STONE_LO);
    w.invalidate(OW, -resolution, 0);
    assert.equal(glyphAt(w, s, 0, 0, resolution), G.Q_STONE);
  }
});

test("one budget turn is one real operation, including unfinished multi-operation columns", () => {
  const w = new TerrainWorld();
  const s = w.store(OW);
  const picks = Array.from({ length: 100 }, (_, i) => ({ key: colKey(i * 4, 0), wx: i * 4, wz: 0 }));
  const plans = ["a", "b", "c"].map((id) => ({ id, store: s, picks }));
  const stages = new Map();
  let operations = 0;
  const used = spendBudget(plans, 48, 24, 0, 10, (plan, p) => {
    operations++;
    const stage = (stages.get(p.key) ?? 0) + 1;
    stages.set(p.key, stage);
    if (stage < 2) return false;
    w.put(plan.store, p.wx, p.wz, { kind: "water", y: 64, depth: 3 }, 10);
    return true;
  });
  assert.equal(operations, 48);
  assert.deepEqual([...used.values()], [16, 16, 16]);
  assert.equal(s.cols.size, 24, "sharing includes partially completed columns");
  let n = 0;
  const single = { id: "single", store: w.store(OW, 12), picks: picks.slice(0, 1) };
  spendBudget([single], 48, 24, 0, 11, () => ++n >= 2);
  assert.equal(n, 2, "unfinished picks stay in the plan until their operations finish");
});

test("native-equivalent column reader yields each ray/block operation and visible materials", () => {
  assert.equal(typeof terrain.readColumn, "function", "surface reader is independently testable");
  const block = (id, y) => ({ typeId: `minecraft:${id}`, location: { y }, isAir: id === "air" });
  const run = (top, below = new Map(), layer) => {
    let operations = 0;
    const dim = {
      heightRange: { min: -64, max: 320 },
      getBlockFromRay(at, dir, opts) {
        operations++;
        assert.equal(opts.includeLiquidBlocks, true);
        assert.equal(opts.includePassableBlocks, true);
        assert.ok(opts.maxDistance <= 384);
        return { block: top };
      },
      getTopmostBlock() { operations++; return top; },
      getBlock(p) { operations++; return below.get(p.y); },
    };
    const reader = terrain.readColumn(dim, 2, 2, layer);
    let step = reader.next();
    while (!step.done) step = reader.next(step.value());
    return { value: step.value, operations };
  };
  assert.deepEqual(run(block("water", 64), new Map([[63, block("sand", 63)]])), { value: { kind: "water", y: 64, depth: 1 }, operations: 2 });
  assert.deepEqual(run(block("flowing_water", 64), new Map([[63, block("water", 63)], [61, block("seagrass", 61)]])), { value: { kind: "water", y: 64, depth: 3 }, operations: 3 });
  for (const id of ["seagrass", "kelp", "bubble_column"]) assert.equal(run(block(id, 64), new Map([[63, block("sand", 63)]])).value.kind, "water");
  assert.equal(run(block("sandstone", 80)).value.kind, "sandstone");
  assert.equal(run(block("red_sandstone", 80)).value.kind, "sandstone");
  assert.equal(run(block("sand", 64)).value.kind, "sand");
  assert.equal(run(block("gravel", 64)).value.kind, "stone");
  assert.equal(run(block("stone_brick_slab", 80)).value.kind, "brick");
  assert.equal(run(block("cherry_planks", 80)).value.kind, "path", "wood roofs are not blossom canopy");
  assert.equal(run(block("oak_slab", 64)).value.kind, "path", "waterlogged structure keeps its visible material");
  assert.equal(run(block("farmland", 64)).value.kind, "path");
  for (const id of ["wheat", "carrots", "potatoes", "beetroot"]) assert.equal(run(block(id, 65)).value.kind, "crop");
  assert.equal(run(block("white_concrete", 80)).value.kind, "snow");
  assert.equal(run(block("black_concrete", 80)).value.kind, "deepslate");
  assert.equal(run(block("gray_concrete", 80)).value.kind, "stone");
  assert.equal(run(block("short_grass", 65), new Map([[64, block("sand", 64)]])).value.kind, "sand");
  assert.equal(run(block("stone", 90), new Map([[21, block("air", 21)], [19, block("stone", 19)]]), 20).value.kind, "stone", "Overworld never switches to a cave floor");
  assert.throws(() => run(block("water", 64)), /unavailable/, "failed depth reads must retry, not invent depth");
});

test("actual current planner uses OW surface and Nether8; full lattice saturates without further fresh queries",t=>{const f=fixture(false,1,{profile:BALANCED}),p=f.initialPlayers[0],w=f.api.terrain,surface=w.store(OW);for(let i=0;i<6000;i++)w.put(surface,100000+i*2,100000,ground(0,0),0);p.state.at={x:.1,y:128,z:.1};for(let tick=1;tick<=400;tick++){const before=f.api.counters().scanReads;f.tick(tick);assert.ok(f.api.counters().scanReads-before<=BALANCED.ops);}assert.equal(f.api.playerStore.get(p.id),surface);const c=f.api.terrainBaseMemo.get(p.id).coverage;assert.equal(c.eligibleKnownCells,c.eligibleCells);assert.equal(c.totalCells,797);const reads=f.api.counters().scanReads;for(let tick=401;tick<=412;tick++)f.tick(tick);assert.equal(f.api.counters().scanReads,reads);p.state.dim=f.dims.nether;p.state.at.y=71.9;f.api.planFor(p,413);assert.ok(f.api.playerStore.get(p.id).id.endsWith("|layer68"));p.state.at.y=72.1;f.api.planFor(p,414);assert.ok(f.api.playerStore.get(p.id).id.endsWith("|layer68"),"2-block hysteresis keeps the previous layer just past the band edge");p.state.at.y=74;f.api.planFor(p,415);assert.ok(f.api.playerStore.get(p.id).id.endsWith("|layer76"));assert.ok(f.queries.some(q=>q[0]==="color"));t.diagnostic(JSON.stringify({eligible:c.eligibleCells,known:c.eligibleKnownCells,masked:292}));});

test("flowering and ordinary azalea leaves retain the same real canopy height", () => {
  for (const id of ["azalea_leaves", "flowering_azalea_leaves", "azalea_leaves_flowered"]) {
    let operations = 0;
    const reader = terrain.readColumn({
      heightRange: { min: -64, max: 320 },
      getBlockFromRay() { operations++; return { block: { typeId: `minecraft:${id}`, location: { y: 80 } } }; },
      getBlock() { operations++; return { typeId: "minecraft:air", location: { y: 79 } }; },
    }, 0, 0);
    let step = reader.next();
    while (!step.done) step = reader.next(step.value());
    assert.deepEqual(step.value, { kind: "birch", y: 80, depth: 0 }, id);
    assert.equal(operations, 1, "a solid canopy is not stripped as a passable flower");
  }
});

test("selected V1/V2 never create fine1 demand even if a legacy internal flag is set",()=>{for(const profile of[SPEED,BALANCED]){const f=fixture(false,1,{profile,config:{fineDetail:true}}),p=f.initialPlayers[0],plan=f.api.planFor(p,10);assert.ok(plan.picks.length>0);assert.ok(plan.picks.every(x=>x.resolution!==1));f.scan(11);assert.equal(f.api.terrain.store(OW).fine.size,0);}});

test("time budgets add their share each tick, save up to their most and spend at most their tick's most", async () => {
  const { Budget } = await import("../packs/map_bp/scripts/budget.js");
  const b = new Budget(0.5, 2, 1);
  assert.equal(b.left, 2, "starts with its savings full (a quiet server)");
  b.tick();
  assert.ok(b.ok);
  b.spend(1);
  assert.equal(b.ok, false, "a tick spends at most tickMax, whatever is saved");
  b.tick();
  assert.equal(b.left, 1.5);
  b.spend(3);
  assert.equal(b.left, -1.5, "a long piece of work is charged in full");
  b.tick();
  b.tick();
  b.tick();
  assert.equal(b.ok, false, "and paid back before more work");
  b.tick();
  assert.ok(b.ok && b.room > 0 && b.room <= 1);
  for (let i = 0; i < 20; i++) b.tick();
  assert.equal(b.left, 2, "savings stop at max");
  b.spend(3600000);
  assert.equal(b.left, -2, "a clock step or a long hitch leaves a debt of at most max");
  for (let i = 0; i < 5; i++) b.tick();
  assert.ok(b.ok, "so the work resumes within max / perTick ticks");
  b.tick();
  b.spend(-3600000);
  assert.ok(b.used >= 0 && b.left <= 2, "a clock step back gives nothing");
});

test("the ground ahead of a fast viewer is listed nearest that point first, at most `limit`, missing before stale", () => {
  const w = new TerrainWorld();
  const s = w.store(OW);
  const all = terrain.aheadPicks(s, 101.5, -40.2, 34, 3000, 2400, 9999);
  assert.ok(all.length > 200, `the whole reach (${all.length})`);
  for (const p of all) assert.equal(colKey(p.wx, p.wz), p.key, "keys are the store's own");
  assert.equal(all[0].key, colKey(101.5, -40.2), "the point itself first");
  w.put(s, all[0].wx, all[0].wz, { kind: "grass", y: 70, depth: 0 }, 3000);
  w.put(s, all[1].wx, all[1].wz, { kind: "grass", y: 70, depth: 0 }, 100);
  w.miss(s, all[2].wx, all[2].wz, 2998);
  const some = terrain.aheadPicks(s, 101.5, -40.2, 34, 3000, 2400, 5);
  assert.equal(some.length, 5);
  assert.ok(!some.some((p) => p.key === all[0].key), "a fresh column is not read again");
  assert.ok(!some.some((p) => p.key === all[2].key), "a column that just failed waits for its retry");
  const rest = terrain.aheadPicks(s, 101.5, -40.2, 34, 3000, 2400, 9999);
  assert.equal(rest.at(-1).key, all[1].key, "a stale column comes after every missing one");
});

test("current circle raster owns no demand queue; markers restore base and budget denial stays stale",()=>{const f=fixture(false,1),w=f.api.terrain,store=w.store(OW),at={x:40.4,z:-17.6};f.initialPlayers[0].state.at={...at,y:64};f.api.playerStore.set("p0",store);for(const p of circleAnchors(at,36,terrain.sampleCoord,colKey))w.put(store,p.x,p.z,ground(p.x,p.z),1,COL);const radar=f.api.radarOf;radar(37,[],36,true,at,OW,true,"p0",true,10);const memo=f.api.terrainBaseMemo.get("p0");assert.equal(memo.need.length,0);assert.equal(memo.coverage.sampled2,memo.coverage.eligibleCells);const a=radar(37,[{kind:"mob",x:at.x+5,z:at.z,clamp:true}],36,true,at,OW,true,"p0",true,12),b=radar(37,[{kind:"mob",x:at.x-9,z:at.z+4,clamp:true}],36,true,at,OW,true,"p0",true,12);assert.notEqual(a,b);assert.equal(b.split("\n").length,33);assert.equal(b[16*34+18],memo.base[16*34+18]);assert.equal(b[18*34+12],overlayGlyph(G.Q_MOB,memo.base[18*34+12]));const oldKey=memo.key;radar(81,[],36,true,{x:at.x+2,z:at.z},OW,true,"p0",false,13);assert.equal(memo.key,oldKey);});

test("current fine/two/preview4 numeric namespaces are exact and disjoint at odd negative/world-edge coordinates",()=>{for(const x of [-30000000,-9,-3,-1,0,1,3,5,30000000])for(const z of [-30000000,-3,-1,0,3,30000000]){const keys=[1,2,4].map(r=>colKey(x,z,r));assert.equal(new Set(keys).size,3);for(const k of keys)assert.ok(Number.isSafeInteger(k));assert.ok(keys[1]<2**50);assert.ok(keys[2]>=2**51&&keys[2]<2**52);assert.ok(keys[0]>=2**52);const oracle=2n**51n+(BigInt(Math.floor(x/4))+2n**23n)*2n**24n+BigInt(Math.floor(z/4))+2n**23n;assert.equal(BigInt(keys[2]),oracle);for(const r of [1,2,4])assert.equal(colKey(terrain.sampleCoord(x,r),terrain.sampleCoord(z,r),r),colKey(x,z,r));}assert.equal(terrain.PREVIEW,4);assert.equal(terrain.COL,2);});
test("solid native colors require two actual generator operations; Nether rays keep their local origin and reach the dimension floor",()=>{for(const id of [OW,"minecraft:the_end","minecraft:nether"]){let rays=0,colors=0,start,opts;const block={typeId:"minecraft:stone",location:{y:60},getComponent(){colors++;return undefined;}};const reader=terrain.readColumn({id,heightRange:{min:-64,max:320},getBlockFromRay(at,_dir,o){rays++;start=at;opts=o;return {block};}},3,-1,68,true);let step=reader.next();assert.equal(step.done,false);step=reader.next(step.value());assert.equal(step.done,false);assert.equal(rays,1);assert.equal(colors,0,"partial first ray cannot masquerade as complete colored data");step=reader.next(step.value());assert.equal(step.done,true);assert.equal(colors,1);assert.equal(step.value.kind,"stone");assert.equal(start.y,id==="minecraft:nether"?68.5:319.5);assert.equal(opts.maxDistance,id==="minecraft:nether"?132.5:384);}});
test("current profiles keep one global limit while flying and converge after stopping without outside-circle native rays",t=>{for(const profile of[SPEED,BALANCED]){const f=fixture(false,1,{profile}),p=f.initialPlayers[0],poses=new Map();let operations=0;for(let tick=1;tick<=350;tick++){p.state.at={x:Math.min(tick,150)*3.2,z:40,y:100};p.state.yaw=90;poses.set(tick,{...p.state.at});const before=f.api.counters().scanReads;f.tick(tick);const used=f.api.counters().scanReads-before;assert.ok(used<=profile.ops);operations+=used;}const c=f.api.terrainBaseMemo.get(p.id).coverage;assert.ok(operations>0);assert.equal(c.eligibleKnownCells,c.eligibleCells);for(const q of f.queries.filter(q=>q[0]==="ray")){const at=poses.get(q[1]),x=q[3].x-.5,z=q[3].z-.5;assert.ok((x-at.x)**2+(z-at.z)**2<=1296+1e-6);}t.diagnostic(JSON.stringify({profile:profile.id,eligible:c.eligibleCells,known:c.eligibleKnownCells,operations}));}const no=fixture(false,1,{profile:{...BALANCED,ops:0}});no.tick(1);no.tick(2);assert.equal(no.api.counters().scanReads,0);assert.equal(no.api.terrainBaseMemo.get("p0").coverage.eligibleKnownCells,0);});

test("typed north-up geometry preserves odd/negative exact fine source coordinates and reuses buffers",()=>{let old;for(const [x,z]of [[-3,-1],[1,3],[-1,1],[30000000,-30000000]]){const g=northUpRadarGeometry("s",x,z,36,16,old),ref=radarGeometry("s",x,z,0,true,36,16);if(old)assert.equal(g,old);for(const k of ["x","z","coarseKey","coarseX","coarseZ","fineKey","fineX","fineZ","distance"])assert.deepEqual([...g[k]],[...ref[k]],k);old=g;}});

test("both pinned profiles use genuine2 first with one global operation ceiling across three viewers",()=>{for(const profile of[SPEED,BALANCED]){const f=fixture(false,3,{profile});let peak=0;for(let tick=1;tick<=90;tick++){for(let i=0;i<f.roster.length;i++)f.roster[i].state.at={x:i*80+.2,y:64,z:.2};f.api.featureEnvelope.used=0;const before=f.api.counters().scanReads;f.scan(tick);const n=f.api.counters().scanReads-before;assert.ok(n<=profile.ops);peak=Math.max(peak,n);}assert.equal(peak,profile.ops);assert.equal(f.puts[0][5],COL);for(const p of f.api.scanPlans.values())assert.ok(p.picks.every(x=>x.resolution!==1));}});

test("V2 ray miss is loaded-empty only after a real AIR probe; unavailable or solid probe remains a failure",()=>{for(const state of ["air","unavailable","solid"]){let rays=0,probes=0;const reader=terrain.readColumn({id:OW,heightRange:{min:-64,max:320},getBlockFromRay(){rays++;return undefined;},getBlock(at){probes++;return state==="unavailable"?undefined:{typeId:state==="air"?"minecraft:air":"minecraft:stone",isAir:state==="air",location:at};}},3,-1,undefined,true);let step=reader.next();assert.equal(step.done,false);step=reader.next(step.value());assert.equal(step.done,false,"a missed ray alone is not loaded void");assert.equal(rays,1);assert.equal(probes,0);if(state==="air"){step=reader.next(step.value());assert.equal(step.done,true);assert.deepEqual(step.value,{kind:"empty",y:-64,depth:0});}else assert.throws(()=>reader.next(step.value()),terrain.TerrainUnavailableError);assert.equal(probes,1);}});
