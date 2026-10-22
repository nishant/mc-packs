// The minimap's terrain data, with no game imports so tools/map-terrain.test.mjs can run it in Node.
// World data is kept per surface store, except the Nether which uses a local-altitude store. A store keeps canonical
// 2 x 2 samples
// and exact block columns within six blocks of a viewer (thin roofs must not alias their neighbors), by an exact
// numeric key (no wrapping: a far or negative column never lands on another's key). Players only share a store
// when what is stored in it means the same thing to both of them.
import { G, paletteGlyph } from "./glyphs.js";
import { paletteForBlock } from "./palette-source.js";
import { shadePaletteIndex } from "./purepalette.js";
import { knownPreviewGlyph } from "./preview-glyph.js";

export const COL = 2;
/** Fast, flat terrain preview. Its cache is separate from native 2 x 2 and exact 1 x 1 data. */
export const PREVIEW = 4;
/** `since`: stored at or after this tick counts as done (default: when the plan was made). @typedef {{ wx: number, wz: number, key: number, resolution?: number, store?: Store, since?: number, stale?: boolean, queuedAt?: number }} Pick */
/** @typedef {{ kind: string, y: number, depth: number, palette?: number, tick: number, valid?: boolean, source?: string, acquiredAtMs?: number, persistedRevision?: number, glyph?: string, wx?: number, wz?: number, visible?: boolean }} Col */
/** @typedef {{ glyph: string, tick: number, wx: number, wz: number, visible?: boolean }} PreviewCol */
/** `regions`: visual versions by region. `demandVer`: per-Store availability losses only; acquisition never restarts a partial scan. @typedef {{ id: string, cols: Map<number, Col>, preview: Map<number, PreviewCol>, previewCap: number, fine: Set<number>, coarse: Set<number>, ver: number, demandVer: number, used: number, miss: Map<number, number>, previewMiss: Map<number, number>, regions: Map<number, number> }} Store */

/** Ticks before a column whose chunk wasn't loaded is read again. */
export const MISS_RETRY = 5;
/** Blocks a side of one region version (Store.regions). */
export const REGION = 64;
/** @param {number} wx @param {number} wz */
const regionKey = (wx, wz) => (Math.floor(wx / REGION) + 2 ** 20) * 2 ** 21 + (Math.floor(wz / REGION) + 2 ** 20);
/** @param {Store} s @param {number} wx @param {number} wz @param {number} resolution */
function bumpStoreRegions(s, wx, wz, resolution) {
  s.ver++;
  for (const k of new Set([regionKey(wx, wz), regionKey(wx + resolution, wz), regionKey(wx, wz + resolution)])) s.regions.set(k, (s.regions.get(k) ?? 0) + 1);
}

const BIAS = 2 ** 24; // the world is 60 million blocks wide: 7.5 million columns a side, far less than 2^24
const SPAN = 2 ** 25;
/** colKey's coarse key is (floor(wx / COL) + KEY_BIAS) * KEY_SPAN + floor(wz / COL) + KEY_BIAS (for callers that inline it). */
export const KEY_BIAS = BIAS;
export const KEY_SPAN = SPAN;
/**
 * The key of the canonical COL x COL column holding a block position, or -1 when it is beyond any real world (nothing is stored).
 * @param {number} wx @param {number} wz
 */
export function colKey(wx, wz, resolution = COL) {
  if (resolution === COL) {
    const qx = Math.floor(wx / COL) + BIAS;
    const qz = Math.floor(wz / COL) + BIAS;
    if (!(qx >= 0 && qx < SPAN && qz >= 0 && qz < SPAN)) return -1;
    return qx * SPAN + qz;
  }
  if (resolution === PREVIEW) {
    // 4-block cells need +/-7.5 million indices at the real +/-30M boundary.
    // 24-bit axes fit that range exactly; the whole 48-bit payload remains in
    // [2^51, 2^52), disjoint from 2 x 2 keys (< 2^50) and fine keys (>= 2^52).
    const span = 2 ** 24;
    const qx = Math.floor(wx / PREVIEW) + 2 ** 23;
    const qz = Math.floor(wz / PREVIEW) + 2 ** 23;
    if (!(qx >= 0 && qx < span && qz >= 0 && qz < span)) return -1;
    return 2 ** 51 + qx * span + qz;
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
export const sampleCoord = (/** @type {number} */ w, resolution = COL) => {
  const size = resolution === PREVIEW ? PREVIEW : resolution === COL ? COL : 1;
  return Math.floor(w / size) * size + (size === PREVIEW ? PREVIEW / 2 + 1 : Math.floor(size / 2));
};

/** @param {Store} store @param {number} resolution */
const cacheFor = (store, resolution) => resolution === PREVIEW ? store.preview : store.cols;
/** Mark a visible entry for a cheap, bounded second-chance eviction. @param {Store} store @param {number} key @param {number} now */
export function retainVisible(store, key, now) {
  const value = key >= 2 ** 51 && key < 2 ** 52 ? store.preview.get(key) : store.cols.get(key);
  if (value) value.visible = true;
  void now;
}

export class TerrainWorld {
  /** @param {number} [maxCols] native 2 x 2 and fine cache per store @param {number} [maxLayers] Nether bands @param {number} [maxPreview] separate 4-block preview cache per store @param {number} [maxTotalCols] hard global native-detail limit */
  constructor(maxCols = 6000, maxLayers = 24, maxPreview = 2000, maxTotalCols = 131072) {
    this.maxCols = Math.max(0, Math.floor(maxCols));
    this.maxLayers = maxLayers;
    this.maxPreview = Math.max(0, Math.floor(maxPreview));
    /** @type {Map<string, Store>} */
    this.stores = new Map();
    this.clock = 0;
    this.maxTotalCols=Math.max(0,Math.floor(maxTotalCols));
    /** @type {Map<string,{store:Store,center:{x:number,z:number},radius:number}>} */
    this.retained=new Map();this.evictionCursor=0;
  }
  get totalCols(){let n=0;for(const s of this.stores.values())n+=s.cols.size;return n;}
  /** @param {string} owner @param {Store} store @param {{x:number,z:number}} center @param {number} radius */
  protect(owner,store,center,radius){if(!Number.isFinite(center.x)||!Number.isFinite(center.z)||!Number.isFinite(radius)||radius<0)throw new RangeError("Invalid retention footprint");this.retained.set(owner,{store,center:{...center},radius});}
  /** @param {string} owner */
  unprotect(owner){this.retained.delete(owner);}
  /** @param {Store} store @param {{wx?:number,wz?:number}} value */
  isRetained(store,value){if(value.wx===undefined||value.wz===undefined)return false;for(const p of this.retained.values())if(p.store===store&&(value.wx-p.center.x)**2+(value.wz-p.center.z)**2<=p.radius*p.radius)return true;return false;}
  /** Admission before native work may evict only unretained data. Bounded search; refusal is not success.
   * @param {Store} s @param {number} wx @param {number} wz @param {number} resolution @param {number} tick */
  makeRoom(s,wx,wz,resolution,tick){
    if(s.cols.has(colKey(wx,wz,resolution)))return true;
    if(this.maxCols<=0||this.maxTotalCols<=0)return false;
    if(s.cols.size>=this.maxCols)this.#evictNative(s,resolution===COL?COL:1,tick);
    if(s.cols.size>=this.maxCols)return false;
    if(this.totalCols<this.maxTotalCols)return true;
    const stores=[...this.stores.values()];
    for(let i=0;i<Math.min(4,stores.length);i++){const other=stores[this.evictionCursor++%stores.length];this.#evictNative(other,COL,tick);if(this.totalCols<this.maxTotalCols)return true;}
    return false;
  }
  /** @param {string} dimId @param {number | undefined} layer Nether altitude-band center; other dimensions always use surface */
  store(dimId, layer) {
    const altitude = dimId === "minecraft:nether" ? layer : undefined;
    const id = altitude === undefined ? `${dimId}|surface` : `${dimId}|layer${Math.floor(altitude)}`;
    let s = this.stores.get(id);
    if (!s) {
      if (altitude !== undefined && !this.#dropOldLayer()) throw new Error("All terrain layer slots are retained");
      s = { id, cols: new Map(), preview: new Map(), previewCap: this.maxPreview, fine: new Set(), coarse: new Set(), ver: 0, demandVer: 0, used: 0, miss: new Map(), previewMiss: new Map(), regions: new Map() };
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
      if ([...this.retained.values()].some(p=>p.store===s))continue;
      if (!oldest || s.used < oldest.used) oldest = s;
    }
    if(layers<this.maxLayers)return true;
    if(!oldest)return false;
    let lost = oldest.preview.size > 0;
    if (!lost) for (const key of oldest.coarse) {
      const value = oldest.cols.get(key);
      if (value && value.valid !== false) { lost = true; break; }
    }
    if (lost) oldest.demandVer++;
    this.stores.delete(oldest.id);return true;
  }
  /** @param {Store} s @param {number} wx @param {number} wz */
  get(s, wx, wz, resolution = COL, retain = false) {
    const k = colKey(wx, wz, resolution);
    const value = k < 0 ? undefined : cacheFor(s, resolution).get(k);
    if (value && retain) retainVisible(s, k, this.clock);
    return value;
  }
  /**
   * Stores a real native column. Preview reads use their own map and also seed one canonical 2 x 2 sample.
   * @param {Store} s @param {number} wx @param {number} wz @param {{ kind: string, y: number, depth: number, palette?: number }} d @param {number} tick
   * @returns {boolean} whether the stored glyph or native terrain changed
   */
  put(s, wx, wz, d, tick, resolution = COL) {
    if (resolution === PREVIEW) {
      const changed = this.#putPreview(s, wx, wz, d, tick);
      // A preview native read is also a genuine sample at the 2 x 2 anchor. Copy it: glyph caching must never alias.
      const x = sampleCoord(wx, PREVIEW), z = sampleCoord(wz, PREVIEW);
      const detailChanged = /** @type {boolean} */ (this.put(s, x, z, { kind: d.kind, y: d.y, depth: d.depth, ...(d.palette === undefined ? {} : { palette: d.palette }) }, tick, COL));
      return changed || detailChanged;
    }
    const k = colKey(wx, wz, resolution);
    if (k < 0 || this.maxCols <= 0) return false;
    const old = s.cols.get(k);
    s.miss.delete(k);
    if (old && old.kind === d.kind && old.y === d.y && old.depth === d.depth && old.palette === d.palette) {
      const wasStale = old.tick === -Infinity;
      old.tick = tick;
      old.valid = true; old.source = "native";
      if (wasStale) {
        old.glyph = undefined;
        const sx = sampleCoord(wx, resolution), sz = sampleCoord(wz, resolution);
        this.#shadeNeighbors(s, sx, sz, resolution);
        this.#bump(s, sx, sz, resolution);
      }
      return wasStale;
    }
    if (!old && !this.makeRoom(s,wx,wz,resolution,tick)) return false;
    const sx = sampleCoord(wx, resolution), sz = sampleCoord(wz, resolution);
    s.cols.set(k, { kind: d.kind, y: d.y, depth: d.depth, tick, valid: true, source: "native", wx: sx, wz: sz, ...(d.palette === undefined ? {} : { palette: d.palette }) });
    if (resolution === COL) s.coarse.add(k);
    else s.fine.add(k);
    this.#shadeNeighbors(s, sx, sz, resolution);
    this.#bump(s, sx, sz, resolution);
    return true;
  }
  /** Restore independently validated raw detail, never a preview glyph. Local ticks encode its existing wall age.
   * @param {Store} s @param {number} wx @param {number} wz
   * @param {{kind:string,y:number,depth:number,palette?:number,acquiredAtMs:number,revision:number}} d
   * @param {number} nowTick @param {number} nowMs
   */
  restoreDetail(s, wx, wz, d, nowTick, nowMs) {
    const key = colKey(wx, wz, COL);
    if (key < 0 || s.cols.has(key) || !Number.isFinite(d.acquiredAtMs) || d.acquiredAtMs > nowMs) return false;
    const ageTicks = Math.max(0, Math.floor((nowMs - d.acquiredAtMs) / 50));
    this.put(s, wx, wz, d, nowTick - ageTicks, COL);
    const c = s.cols.get(key); if (!c) return false;
    c.source = "persisted"; c.valid = true; c.acquiredAtMs = d.acquiredAtMs; c.persistedRevision = d.revision;
    return true;
  }
  /** @param {Store} s @param {number} wx @param {number} wz @param {{ kind: string, y: number, depth: number, palette?: number }} d @param {number} tick */
  #putPreview(s, wx, wz, d, tick) {
    const k = colKey(wx, wz, PREVIEW);
    if (k < 0) return false;
    const old = s.preview.get(k);
    s.previewMiss.delete(k);
    if (old) {
      const prev = old.glyph;
      const next = previewGlyph(d);
      const wasStale = old.tick === -Infinity;
      old.tick = tick;
      if (prev === next) return wasStale;
    } else if (this.maxPreview <= 0) return false;
    else if (s.preview.size >= this.maxPreview) {
      this.#evictPreview(s, tick);
      if (s.preview.size >= this.maxPreview) return false;
    }
    const x = sampleCoord(wx, PREVIEW), z = sampleCoord(wz, PREVIEW);
    s.preview.set(k, { glyph: previewGlyph(d), tick, wx: x, wz: z });
    this.#bump(s, x, z, PREVIEW);
    return true;
  }
  /** Bounded second-chance scan; at most eight visible entries are skipped before a fallback eviction. @param {Store} s @param {1 | 2} resolution @param {number} tick */
  #evictNative(s, resolution, tick) {
    const reserve = Math.max(1, Math.floor(this.maxCols / 3));
    const preferred = resolution === 1
      ? (s.fine.size >= reserve ? s.fine : s.coarse)
      : (s.coarse.size >= this.maxCols - reserve ? s.coarse : s.fine);
    const alternate = preferred === s.fine ? s.coarse : s.fine;
    const before=s.cols.size;
    this.#evictFrom(s, preferred.size ? preferred : alternate, tick, false);
    if(s.cols.size===before&&preferred.size&&alternate.size)this.#evictFrom(s,alternate,tick,false);
  }
  /** @param {Store} s @param {Set<number>} queue @param {number} tick @param {boolean} preview */
  #evictFrom(s, queue, tick, preview) {
    const entries = preview ? s.preview : s.cols;
    let fallback;
    for (let n = 0; n < (this.retained.size?64:8); n++) {
      const key = queue.values().next().value;
      if (key === undefined) break;
      const value = entries.get(key);
      if (!value) { queue.delete(key); continue; }
      if(!preview&&this.isRetained(s,value)){queue.delete(key);queue.add(key);continue;}
      if (fallback === undefined) fallback = key;
      if (value.visible) {
        value.visible = false;
        queue.delete(key);
        queue.add(key);
        continue;
      }
      fallback = key;
      break;
    }
    if (fallback === undefined) return;
    const value = entries.get(fallback);
    entries.delete(fallback);
    if (!preview) { s.fine.delete(fallback); s.coarse.delete(fallback); }
    queue.delete(fallback);
    (preview ? s.previewMiss : s.miss).delete(fallback);
    if (value) {
      // Fine-only and already invalid native records were not available canonical demand.
      if (preview || (fallback < 2 ** 52 && (!("valid" in value) || value.valid !== false))) s.demandVer++;
      if (!preview) this.#shadeNeighbors(s, value.wx ?? 0, value.wz ?? 0, fallback >= 2 ** 52 ? 1 : COL);
      this.#bump(s, value.wx ?? 0, value.wz ?? 0, preview ? PREVIEW : (fallback >= 2 ** 52 ? 1 : COL));
    }
  }
  /** @param {Store} s @param {number} tick */
  #evictPreview(s, tick) {
    let fallback;
    for (let n = 0; n < 8; n++) {
      const key = s.preview.keys().next().value;
      if (key === undefined) break;
      const value = s.preview.get(key);
      if (fallback === undefined) fallback = key;
      if (value && value.visible) {
        value.visible = false;
        s.preview.delete(key);
        s.preview.set(key, value);
        continue;
      }
      fallback = key;
      break;
    }
    if (fallback === undefined) return;
    const value = s.preview.get(fallback);
    s.preview.delete(fallback);
    s.previewMiss.delete(fallback);
    if (value) { s.demandVer++; this.#bump(s, value.wx, value.wz, PREVIEW); }
  }
  /** A changed sample and the east/south glyphs shaded from it bump their own regions. @param {Store} s @param {number} wx @param {number} wz @param {number} resolution */
  #bump(s, wx, wz, resolution) { bumpStoreRegions(s, wx, wz, resolution); }
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
    const misses = resolution === PREVIEW ? s.previewMiss : s.miss;
    if (misses.size > 4000) misses.clear();
    misses.set(k, tick);
  }
  /** A block changed: retain last-good glyphs as stale until the fresh native sample arrives. @param {string} dimId @param {number} wx @param {number} wz */
  invalidate(dimId, wx, wz) {
    const resolutions = [1, COL, PREVIEW];
    let n = 0;
    for (const s of this.stores.values()) {
      if (!s.id.startsWith(`${dimId}|`)) continue;
      let changed = false, demandChanged = false;
      for (const resolution of resolutions) {
        const k = colKey(wx, wz, resolution);
        if (k < 0) continue;
        const entry = resolution === PREVIEW ? s.preview.get(k) : s.cols.get(k);
        (resolution === PREVIEW ? s.previewMiss : s.miss).delete(k);
        if (!entry || entry.tick === -Infinity) continue;
        if (resolution === PREVIEW || (resolution === COL && (!("valid" in entry) || entry.valid !== false))) demandChanged = true;
        entry.tick = -Infinity;
        if (resolution !== PREVIEW) {
          /** @type {Col} */ (entry).valid = false;
          entry.glyph = undefined;
          this.#shadeNeighbors(s, entry.wx ?? sampleCoord(wx, resolution), entry.wz ?? sampleCoord(wz, resolution), resolution);
        }
        this.#bump(s, entry.wx ?? sampleCoord(wx, resolution), entry.wz ?? sampleCoord(wz, resolution), resolution);
        changed = true;
      }
      if (demandChanged) s.demandVer++;
      if (changed) n++;
    }
    return n;
  }
  /** Only east/south samples depend on this sample's height for glyph shading. @param {Store} s @param {number} wx @param {number} wz @param {number} resolution */
  #shadeNeighbors(s, wx, wz, resolution) {
    if (resolution === PREVIEW) return;
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

/** Geometry used by every radar cell, cached independently from terrain contents and staleness. @param {string} storeId @param {number} tx @param {number} tz @param {number} heading @param {boolean} north @param {number} radius @param {number} half */
export function radarGeometry(storeId, tx, tz, heading, north, radius, half) {
  const key = `${storeId}|${tx}|${tz}|${heading}|${north ? 1 : 0}|${radius}|${half}`;
  const size = 2 * half + 1;
  const count = size * size;
  const x = new Float64Array(count);
  const z = new Float64Array(count);
  const coarseKey = new Float64Array(count);
  const fineKey = new Float64Array(count);
  const coarseX = new Int32Array(count);
  const coarseZ = new Int32Array(count);
  const fineX = new Int32Array(count);
  const fineZ = new Int32Array(count);
  const distance = new Float64Array(count);
  const cell = radius / half;
  const h = (heading * Math.PI) / 180;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  let i = 0;
  for (let row = -half; row <= half; row++) {
    const sy = row * cell;
    for (let col = -half; col <= half; col++, i++) {
      const sx = col * cell;
      const d = sx * sx + sy * sy;
      const wx = north ? tx + sx : tx + sx * cos - sy * sin;
      const wz = north ? tz + sy : tz + sx * sin + sy * cos;
      x[i] = wx;
      z[i] = wz;
      // Keep the exact coarse-key arithmetic used by radarOf, including out-of-world keys.
      coarseKey[i] = (Math.floor(wx / COL) + BIAS) * SPAN + Math.floor(wz / COL) + BIAS;
      coarseX[i] = sampleCoord(wx);
      coarseZ[i] = sampleCoord(wz);
      if (d <= 36) {
        fineKey[i] = colKey(wx, wz, 1);
        fineX[i] = sampleCoord(wx, 1);
        fineZ[i] = sampleCoord(wz, 1);
      } else fineKey[i] = -1;
      distance[i] = d;
    }
  }
  return { key, x, z, coarseKey, fineKey, coarseX, coarseZ, fineX, fineZ, distance };
}

/**
 * North-up geometry owned by one viewer. Refill its buffers on movement; distances are a radius/half template.
 * Axis arithmetic is separable, but key additions deliberately retain radarGeometry/colKey's evaluation order:
 * fine keys above 2^52 can round differently if the bias is regrouped. Never share this mutable result between viewers.
 * @param {string} storeId @param {number} tx @param {number} tz @param {number} radius @param {number} half
 * @param {ReturnType<typeof radarGeometry> | (ReturnType<typeof radarGeometry> & { northAxes: Float64Array, radius: number, half: number })} [previous]
 * @returns {ReturnType<typeof radarGeometry> & { northAxes: Float64Array, radius: number, half: number }}
 */
export function northUpRadarGeometry(storeId, tx, tz, radius, half, previous) {
  const size = 2 * half + 1;
  const count = size * size;
  const cell = radius / half;
  const reusable = previous && "northAxes" in previous && previous.radius === radius && previous.half === half;
  const geometry = reusable ? previous : {
    key: "", radius, half, northAxes: new Float64Array(size * 5),
    x: new Float64Array(count), z: new Float64Array(count),
    coarseKey: new Float64Array(count), fineKey: new Float64Array(count),
    coarseX: new Int32Array(count), coarseZ: new Int32Array(count),
    fineX: new Int32Array(count), fineZ: new Int32Array(count), distance: new Float64Array(count),
  };
  geometry.key = `${storeId}|${tx}|${tz}|0|1|${radius}|${half}`;
  const axes = geometry.northAxes;
  const fineSpan = SPAN * 2;
  for (let col = 0; col < size; col++) {
    const wx = tx + (col - half) * cell;
    const fx = Math.floor(wx);
    const qx = fx + BIAS * 2;
    axes[col] = wx;
    axes[size + col] = sampleCoord(wx);
    axes[2 * size + col] = (Math.floor(wx / COL) + BIAS) * SPAN;
    axes[3 * size + col] = fx;
    axes[4 * size + col] = qx >= 0 && qx < fineSpan ? 2 ** 52 + qx * fineSpan : -1;
  }
  let i = 0;
  for (let row = -half; row <= half; row++) {
    const sy = row * cell;
    const wz = tz + sy;
    const cz = sampleCoord(wz);
    const coarseZ = Math.floor(wz / COL);
    const fz = Math.floor(wz);
    const qz = fz + BIAS * 2;
    const fineZValid = qz >= 0 && qz < fineSpan;
    for (let col = 0; col < size; col++, i++) {
      if (!reusable) {
        const sx = (col - half) * cell;
        geometry.distance[i] = sx * sx + sy * sy;
      }
      geometry.x[i] = axes[col];
      geometry.z[i] = wz;
      geometry.coarseKey[i] = axes[2 * size + col] + coarseZ + BIAS;
      geometry.coarseX[i] = axes[size + col];
      geometry.coarseZ[i] = cz;
      if (geometry.distance[i] <= 36) {
        const fineX = axes[4 * size + col];
        geometry.fineKey[i] = fineX >= 0 && fineZValid ? fineX + qz : -1;
        geometry.fineX[i] = axes[3 * size + col];
        geometry.fineZ[i] = fz;
      } else if (!reusable) geometry.fineKey[i] = -1;
    }
  }
  return geometry;
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
    const have = cacheFor(store, resolution).get(key);
    if (have && now - have.tick <= maxAge) return;
    if (seen.has(key)) return;
    seen.add(key);
    const missed = (resolution === PREVIEW ? store.previewMiss : store.miss).get(key);
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

export function scanQueueCounters() {
  return { ticks: 0, envelopeMs: 0, candidateRetryMs: 0, planForMs: 0, viewerPruneMs: 0, dispatchMs: 0, cleanupMs: 0, chargedMs: 0,
    viewerChecks: 0, pruneRuns: 0, pruneReused: 0, pruneVisited: 0, pruneCopied: 0, pruneRemoved: 0, remainingPeak: 0,
    completeSkips: 0, coolingSkips: 0, nativeAttempt: 0, nativeSuccess: 0, nativeMiss: 0, nativeContinuation: 0, nativePuts: 0,
    admissionVisited: 0, rangeSkips: 0, invalidPlans: 0, deferredPlans: 0, mergeVisited: 0, mergeRangeSkips: 0, failedPeak: 0, historyRetired: 0 };
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
 * @param {{ completeSkips: number, coolingSkips: number }} [metrics] counts only; no clock reads in the pick loop
 * @param {(plan: P, pick: Pick) => boolean} [admit] false: discard without native credit; checked before cache skips and every operation
 * @param {(plan: P, pick: Pick) => boolean} [canContinue] deadline checked at the first and at most every16 inspected picks, plus before every actual Native operation
 * @param {(plan: P, pick: Pick) => ("known"|"defer"|undefined)} [prepare] cache hydration never consumes a Native credit
 * @param {(plan: P, pick: Pick, missedAt: number) => void} [onCoolingSkip] bookkeeping before a real cooling skip advances; no Native credit, queue mutation or call for other skip kinds
 * @returns {Map<string, number>} reads per viewer
 */
export function spendBudget(plans, total, each, first, now, read, metrics, admit, canContinue, prepare, onCoolingSkip) {
  /** @type {Map<string, number>} */
  const spent = new Map();
  const next = plans.map((p) => p.pos ?? 0);
  let left = total;
  let progress = true;
  let inspectionsUntilCheck = 0;
  outer: while (left > 0 && progress) {
    progress = false;
    for (let n = 0; n < plans.length && left > 0; n++) {
      const i = (first + n) % plans.length;
      const plan = plans[i];
      const used = spent.get(plan.id) ?? 0;
      if (used >= each) continue;
      while (next[i] < plan.picks.length) {
        const pick = plan.picks[next[i]];
        if (canContinue) {
          if (inspectionsUntilCheck === 0) {
            if (!canContinue(plan, pick)) break outer;
            inspectionsUntilCheck = 16;
          }
          inspectionsUntilCheck--;
        }
        if (admit && !admit(plan, pick)) {
          next[i] = Math.min(next[i] + 1, plan.picks.length);
          continue;
        }
        const store = pick.store ?? plan.store;
        const since = pick.since ?? plan.at ?? now;
        const resolution = pick.resolution ?? COL;
        const misses = resolution === PREVIEW ? store.previewMiss : store.miss;
        if ((cacheFor(store, resolution).get(pick.key)?.tick ?? -Infinity) >= since) {
          if (metrics) metrics.completeSkips++;
          next[i]++;
          continue;
        }
        const missedAt = misses.get(pick.key) ?? -Infinity;
        if (missedAt >= since && now - missedAt < MISS_RETRY) {
          if (metrics) metrics.coolingSkips++;
          onCoolingSkip?.(plan, pick, missedAt);
          next[i]++;
          continue;
        }
        const preparation = prepare?.(plan, pick);
        if (preparation === "known") { next[i]++; continue; }
        if (preparation === "defer") break;
        if (canContinue && !canContinue(plan, pick)) break outer;
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

/** An unshaded preview glyph from real native column data; unknown height-neighbor shading is never invented. @param {{ kind: string, depth: number, palette?: number }} col */
export function previewGlyph(col) {
  if (col.kind === "empty") return G.Q_EMPTY;
  if (col.palette !== undefined) return paletteGlyph(shadePaletteIndex(col.palette, 0) ?? col.palette);
  if (col.kind === "water") return col.depth <= 1 ? G.Q_WATER_SHALLOW : col.depth >= 3 ? G.Q_WATER_DEEP : G.Q_WATER;
  const flat = FLAT[col.kind];
  if (flat) return flat;
  return (LIT[col.kind] ?? LIT.grass)[0];
}
/** Hydrate only a validated glyph into the separate preview cache; disk pages never fabricate 2 x 2 detail. @param {Store} store @param {number} wx @param {number} wz @param {string} glyph @param {number} tick */
export function hydratePreview(store, wx, wz, glyph, tick) {
  if (!knownPreviewGlyph(glyph)) return false;
  void tick;
  const key = colKey(wx, wz, PREVIEW);
  if (key < 0 || store.preview.has(key)) return false;
  const cap = Math.max(0, store.previewCap ?? 2000);
  if (!cap) return false;
  if (store.preview.size >= cap) {
    let fallback;
    for (let n = 0; n < 8; n++) {
      const candidate = store.preview.keys().next().value;
      if (candidate === undefined) break;
      const value = store.preview.get(candidate);
      if (fallback === undefined) fallback = candidate;
      if (value?.visible) {
        value.visible = false;
        store.preview.delete(candidate);
        store.preview.set(candidate, value);
        continue;
      }
      fallback = candidate;
      break;
    }
    if (fallback === undefined) return false;
    const retired = store.preview.get(fallback);
    store.preview.delete(fallback);
    store.previewMiss.delete(fallback);
    if (retired) { store.demandVer++; bumpStoreRegions(store, retired.wx, retired.wz, PREVIEW); }
  }
  const sx = sampleCoord(wx, PREVIEW), sz = sampleCoord(wz, PREVIEW);
  store.preview.set(key, { glyph, tick: -Infinity, wx: sx, wz: sz });
  bumpStoreRegions(store, sx, sz, PREVIEW);
  return true;
}

/**
 * The radar glyph of a stored column, shaded by how much higher it is than the columns north and west of it.
 * A column nobody has read yet is G.Q_EMPTY (unknown), never made-up ground.
 * @param {TerrainWorld} world @param {Store} store @param {number} wx @param {number} wz
 */
export function glyphAt(world, store, wx, wz, resolution = COL) {
  if (resolution === PREVIEW) {
    // A real fine or canonical sample always wins over the lower-resolution preview.
    if (world.get(store, wx, wz, 1)) return glyphAt(world, store, wx, wz, 1);
    if (world.get(store, wx, wz, COL)) return glyphAt(world, store, wx, wz, COL);
    return world.get(store, wx, wz, PREVIEW)?.glyph ?? G.Q_EMPTY;
  }
  const cur = /** @type {Col | undefined} */ (world.get(store, wx, wz, resolution));
  if (!cur && resolution === 1) return glyphAt(world, store, wx, wz);
  if (!cur || cur.kind === "empty") return G.Q_EMPTY;
  if (cur.glyph) return cur.glyph;
  if (cur.palette !== undefined) {
    let shade = 0;
    if (cur.kind === "water") shade = cur.depth <= 1 ? 1 : cur.depth >= 3 ? -1 : 0;
    else {
      const north = /** @type {Col | undefined} */ (world.get(store, wx, wz - resolution, resolution));
      const west = /** @type {Col | undefined} */ (world.get(store, wx - resolution, wz, resolution));
      const shadeNorth = north?.tick === -Infinity ? undefined : north;
      const shadeWest = west?.tick === -Infinity ? undefined : west;
      const delta = cur.y - (shadeNorth?.y ?? cur.y) + (cur.y - (shadeWest?.y ?? cur.y));
      shade = delta >= 2 ? 1 : delta <= -2 ? -1 : 0;
    }
    return cur.glyph = paletteGlyph(shadePaletteIndex(cur.palette, shade) ?? cur.palette);
  }
  if (cur.kind === "water") return cur.glyph = cur.depth <= 1 ? G.Q_WATER_SHALLOW : cur.depth >= 3 ? G.Q_WATER_DEEP : G.Q_WATER;
  const flat = FLAT[cur.kind];
  if (flat) return cur.glyph = flat;
  const north = /** @type {Col | undefined} */ (world.get(store, wx, wz - resolution, resolution));
  const west = /** @type {Col | undefined} */ (world.get(store, wx - resolution, wz, resolution));
  const shadeNorth = north?.tick === -Infinity ? undefined : north;
  const shadeWest = west?.tick === -Infinity ? undefined : west;
  const dh = cur.y - (shadeNorth?.y ?? cur.y) + (cur.y - (shadeWest?.y ?? cur.y));
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
export class TerrainUnavailableError extends Error {}
/** @param {import("@minecraft/server").Block | undefined} block @returns {import("@minecraft/server").Block} */
function available(block) {
  if (!block) throw new TerrainUnavailableError("terrain block unavailable");
  // Reading a returned block can itself throw in an unloaded chunk.
  void block.typeId;
  return block;
}

/**
 * Each yield is exactly one native block query or bounded ray. The scheduler advances only one yield per budget
 * turn, shares unfinished work, and never commits a partial result. Overworld and End always read their surface;
 * Nether readers ray downward from a bounded local altitude instead of sampling the bedrock ceiling.
 * @param {import("@minecraft/server").Dimension} dim @param {number} x @param {number} z @param {number} [layer] Nether altitude-band center only
 * @returns {Generator<() => import("@minecraft/server").Block | undefined, { kind: string, y: number, depth: number }, import("@minecraft/server").Block | undefined>}
 */
export function* readColumn(dim, x, z, layer, nativeColors = false) {
  const range = dim.heightRange;
  const nether = dim.id === "minecraft:nether" && layer !== undefined;
  const startY = nether ? Math.min(layer + 0.5, range.max - 0.5) : range.max - 0.5;
  // Stay below the local layer/roof, but reach actual lava/floor below deep open caverns.
  const maxDistance = nether ? startY - range.min : range.max - range.min;
  let block = yield () => dim.getBlockFromRay(
    { x: x + 0.5, y: startY, z: z + 0.5 }, { x: 0, y: -1, z: 0 },
    { includeLiquidBlocks: true, includePassableBlocks: !nether, maxDistance },
  )?.block;
  if (!block) {
    const probeY = Math.max(range.min, Math.floor(startY - maxDistance + 1));
    const probe = available(yield () => dim.getBlock({ x, y: probeY, z }));
    if (probe.isAir) return { kind: "empty", y: probeY, depth: 0 };
    throw new TerrainUnavailableError("terrain ray did not establish a surface");
  }
  // At most two passable plant blocks; no column-height JS scan or recursion.
  for (let i = 0; i < 2 && plant(block.typeId); i++) {
    const y = block.location.y - 1;
    block = available(yield () => dim.getBlock({ x, y, z }));
  }
  const y = Math.floor(block.location.y);
  const id = block.typeId;
  /** @type {number | undefined} */
  let palette;
  if (nativeColors) {
    // This optional component query consumes a scheduler turn like every other native terrain operation.
    const sampled = block;
    yield () => { palette = paletteForBlock(sampled, kindOf(id)); return sampled; };
  }
  const color = palette === undefined ? {} : { palette };
  if (water(id)) {
    const b1 = available(yield () => dim.getBlock({ x, y: y - 1, z }));
    if (!water(b1.typeId)) return { kind: "water", y, depth: 1, ...color };
    const b3 = available(yield () => dim.getBlock({ x, y: y - 3, z }));
    return { kind: "water", y, depth: water(b3.typeId) ? 3 : 2, ...color };
  }
  return { kind: kindOf(id), y, depth: 0, ...color };
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
