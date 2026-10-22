// Shared raw TWO-BLOCK cache, not preview glyphs. No game imports, timers or adapter IO outside loadOne/flushOne.
// The host MUST share one load/write pump with legacy preview persistence; do not give each family an IO budget.
// Fixed slots bound logical properties, not all engine RAM/LevelDB history. Dirty write-back RAM is not yet durable.
const PREFIX = "map:detail:v1:";
const INDEX_KEY = `${PREFIX}index`;
const VERSION = 1, CELLS = 1024, MASK = 128, STRIDE = 18, HEADER = MASK * 2;
export const DETAIL_PAGE_RAW_BYTES = HEADER + CELLS * STRIDE;
const ENCODED_BYTES = Math.ceil(DETAIL_PAGE_RAW_BYTES / 3) * 4;
const PROPERTY_LIMIT = 32767, LOGICAL_LIMIT = 4 * 1024 * 1024;
const WEEK = 7 * 86400000, MAX_REV = 0xffffffff, ABSENT_PALETTE = 65535;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export const DETAIL_KINDS = Object.freeze(["empty", "grass", "stone", "water", "sand", "sandstone", "snow", "path", "mesa", "forest", "brick", "lava", "cave", "cave_floor", "cave_wall", "cherry", "birch", "spruce", "savanna", "swamp", "deepslate", "crop", "warped", "ice", "nether", "end"]);
/** @typedef {"native"|"material"} Profile */
/** @typedef {{get:(key:string)=>unknown,set:(key:string,value:string)=>void}} Adapter */
/** @typedef {{kind:string,y:number,depth:number,palette?:number}} Raw */
/** @typedef {{kind:string,y:number,depth:number,palette?:number,acquiredAtMs:number,revision:number}} Sample */
/** @typedef {{state:"known",sample:Sample,provenance:"persisted"}|{state:"unknown"|"pending"|"invalid",revision?:number,provenance:"persisted"}} Lookup */
/** @typedef {{ready?:boolean,profile?:Profile,maxResidentPages?:number,maxSavedPages?:number,maxPendingRequests?:number,ttlMs?:number}} Options */
/** @typedef {{storeId:string,px:number,pz:number,key:string,i:number}} Address */
/** @typedef {{storeId:string,px:number,pz:number,key:string,bytes:Uint8Array,view:DataView,changed:Uint8Array,loaded:boolean,dirty:boolean,dirtySince:number,saved:number,revision:number}} Page */
/** @typedef {{slot:number,storeId:string,px:number,pz:number,saved:number,bytes:number,hash:number}} Row */
/** @typedef {{page:Page,revision:number,rows:Row[],index:string}} Transaction */
const integer = (/** @type {unknown} */ n, /** @type {number} */ lo, /** @type {number} */ hi) => typeof n === "number" && Number.isSafeInteger(n) && n >= lo && n <= hi;
const validProfile = (/** @type {unknown} */ p) => p === "native" || p === "material";
const bit = (/** @type {Uint8Array} */ a, /** @type {number} */ i, offset = 0) => (a[offset + (i >> 3)] >> (i & 7)) & 1;
function setBit(/** @type {Uint8Array} */ a, /** @type {number} */ i, /** @type {boolean} */ value, offset = 0) {
  const at = offset + (i >> 3), mask = 1 << (i & 7);
  if (value) a[at] |= mask; else a[at] &= ~mask;
}
const offset = (/** @type {number} */ i) => HEADER + i * STRIDE;
const identity = (/** @type {string} */ store, /** @type {number} */ x, /** @type {number} */ z) => `${store}/${x}/${z}`;
function validStore(/** @type {unknown} */ s) {
  if (s === "minecraft:overworld|surface" || s === "minecraft:the_end|surface") return true;
  if (typeof s !== "string") return false;
  const m = /^minecraft:nether\|layer(-?(?:0|[1-9][0-9]{0,3}))$/.exec(s);
  return !!m && m[1] !== "-0" && integer(Number(m[1]), -4096, 4096) && ((Number(m[1]) % 8) + 8) % 8 === 4;
}
export { validStore as isDetailStore };
/** @returns {Address|undefined} */
function address(/** @type {string} */ storeId, /** @type {number} */ wx, /** @type {number} */ wz) {
  if (!validStore(storeId) || !Number.isFinite(wx) || !Number.isFinite(wz) || Math.abs(wx) > 30000000 || Math.abs(wz) > 30000000) return undefined;
  const x = Math.floor(wx / 2) * 2 + 1, z = Math.floor(wz / 2) * 2 + 1;
  if (Math.abs(x) > 30000000 || Math.abs(z) > 30000000) return undefined;
  const px = Math.floor(x / 64), pz = Math.floor(z / 64);
  return { storeId, px, pz, key: identity(storeId, px, pz), i: ((z - pz * 64 - 1) / 2) * 32 + (x - px * 64 - 1) / 2 };
}
function encode64(/** @type {Uint8Array} */ bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    out += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : "=") + (i + 2 < bytes.length ? BASE64[c & 63] : "=");
  }
  return out;
}
function decode64(/** @type {unknown} */ text) {
  if (typeof text !== "string" || text.length !== ENCODED_BYTES || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw new Error("detail base64");
  const out = new Uint8Array(DETAIL_PAGE_RAW_BYTES); let at = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = BASE64.indexOf(text[i]), b = BASE64.indexOf(text[i + 1]), c = BASE64.indexOf(text[i + 2]), d = BASE64.indexOf(text[i + 3]);
    out[at++] = (a << 2) | (b >> 4);
    if (c >= 0) out[at++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[at++] = ((c & 3) << 6) | d;
  }
  if (at !== out.length || encode64(out) !== text) throw new Error("detail base64 canonical");
  return out;
}
function hash(/** @type {string} */ s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
const serializeIndex = (/** @type {Row[]} */ rows, /** @type {Profile} */ profile) => JSON.stringify([VERSION, 2, 32, profile, rows.map(r => [r.slot, r.storeId, r.px, r.pz, r.saved, r.bytes, r.hash])]);

export class DetailPersistence {
  /** Constructor/lookup/note/invalidate/readiness/profile changes are IO-free. @param {Adapter} adapter @param {Options} [options] */
  constructor(adapter, options = {}) {
    if (!adapter || typeof adapter.get !== "function" || typeof adapter.set !== "function") throw new TypeError("detail adapter requires get/set");
    if (options.ready !== undefined && typeof options.ready !== "boolean") throw new TypeError("detail readiness must be boolean");
    if (options.profile !== undefined && !validProfile(options.profile)) throw new RangeError("detail profile must be native or material");
    const limit = (/** @type {number|undefined} */ v, /** @type {number} */ fallback, /** @type {number} */ max) => v === undefined ? fallback : integer(v, 1, max) ? v : (() => { throw new RangeError("detail limit out of range"); })();
    this.adapter = adapter; this.profile = options.profile ?? "native"; this._ready = options.ready ?? false;
    this.maxResidentPages = limit(options.maxResidentPages, 16, 32); this.maxSavedPages = limit(options.maxSavedPages, 128, 128);
    this.maxPendingRequests = limit(options.maxPendingRequests, 64, 128); this.ttlMs = limit(options.ttlMs, WEEK, WEEK);
    /** @type {Map<string,Page>} */ this.pages = new Map();
    /** @type {Map<string,Address>} */ this.pending = new Map();
    /** @type {Row[]} */ this.index = [];
    /** @type {Map<string,Row>} */ this.indexRows = new Map();
    /** @type {Readonly<{storeId:string,px:number,pz:number,knownCount:number,readVersion:number,profile:Profile,generation:object}>|undefined} */ this._loadedPage = undefined;
    /** @type {Transaction|undefined} */ this.transaction = undefined;
    this.generation = {}; this.indexLoaded = false; this.indexCompatible = false; this.indexBytes = 0; this.dirtyCount = 0; this.unloadedCount = 0;
    this.readVersion = 0; // Applied successful reads only; never an IO-attempt or clock counter.
    /** @type {Map<string,{failures:number,retryAt:number}>} */ this.readRetry = new Map();
    this.counts = { reads: 0, writes: 0, writeAttempts: 0, bytesRead: 0, bytesWritten: 0, readErrors: 0, writeErrors: 0, corrupt: 0, profileMisses: 0, rejectedNotes: 0, rejectedInvalidations: 0, rejectedRequests: 0, evictions: 0 };
  }
  /** External world-IO gate, NOT manifest-loaded state. */
  get ready() { return this._ready; }
  /** Allocation-free notification for the current loadOne call only; never a manifest/miss/error notification. */
  get loadedPage() { return this._loadedPage; }
  get needsLoad() { return this._ready && (!this.indexLoaded || this.unloadedCount > 0 || this.pending.size > 0); }
  get needsFlush() { return this._ready && this.indexLoaded && (!!this.transaction || this.dirtyCount > 0); }
  /** Pausing preserves dirty RAM and pending commits. @param {boolean} ready */
  setReady(ready) {
    if (typeof ready !== "boolean") throw new TypeError("detail readiness must be boolean");
    if (ready === this._ready) return false;
    this._ready = ready; this.generation = {}; this._loadedPage = undefined; return true;
  }
  /** Same-profile no-op; changed profile discards only this cache, never deletes properties. @param {Profile} profile */
  setProfile(profile) {
    if (!validProfile(profile)) throw new RangeError("detail profile must be native or material");
    if (profile === this.profile) return false;
    this.profile = profile; this.generation = {}; this.pages.clear(); this.pending.clear(); this.index = []; this.indexRows.clear(); this._loadedPage = undefined; this.readRetry.clear();
    this.transaction = undefined; this.indexLoaded = false; this.indexCompatible = false; this.indexBytes = this.dirtyCount = this.unloadedCount = 0; return true;
  }
  /** Returned samples have wall acquisition time, never restart-unsafe game ticks. @param {string} storeId @param {number} wx @param {number} wz @param {number} wallMs @returns {Lookup} */
  lookup(storeId, wx, wz, wallMs) {
    const a = address(storeId, wx, wz);
    if (!a || !integer(wallMs, 0, Number.MAX_SAFE_INTEGER)) return { state: "invalid", provenance: "persisted" };
    const p = this.pages.get(a.key);
    if (!p) {
      // A decoded compatible manifest proves this tile has no saved override/tombstone. Never allocate it.
      if (this.indexLoaded && !this.indexRows.has(a.key)) return { state: "unknown", provenance: "persisted" };
      if (!this.pending.has(a.key)) {
        // Backpressure is still unresolved detail, not proof that an old tombstone/override is absent.
        if (this.pending.size >= this.maxPendingRequests) { this.counts.rejectedRequests++; return { state: "pending", provenance: "persisted" }; }
        this.pending.set(a.key, a);
      }
      return { state: "pending", provenance: "persisted" };
    }
    this._touch(p);
    const o = offset(a.i), at = p.view.getFloat64(o + 6, true), revision = p.view.getUint32(o + 14, true);
    // Tombstones block stale atlas/legacy fallback while this bounded tile exists, even when sample TTL ages out.
    if (bit(p.bytes, a.i, MASK)) return { state: "invalid", revision, provenance: "persisted" };
    if (bit(p.bytes, a.i) && at <= wallMs && wallMs - at <= this.ttlMs) {
      const palette = p.view.getUint16(o + 4, true);
      return { state: "known", sample: { kind: DETAIL_KINDS[p.bytes[o]], y: p.view.getInt16(o + 2, true), depth: p.bytes[o + 1], ...(palette === ABSENT_PALETTE ? {} : { palette }), acquiredAtMs: at, revision }, provenance: "persisted" };
    }
    return { state: p.loaded || bit(p.changed, a.i) ? "unknown" : "pending", provenance: "persisted" };
  }
  /** Caller supplies ONLY a completed genuine canonical 2-block native sample. @param {string} storeId @param {number} wx @param {number} wz @param {Raw} raw @param {number} wallMs */
  note(storeId, wx, wz, raw, wallMs) {
    const a = address(storeId, wx, wz);
    if (!a || !Number.isInteger(wx) || !Number.isInteger(wz) || ((wx % 2) + 2) % 2 !== 1 || ((wz % 2) + 2) % 2 !== 1 || !integer(wallMs, 0, Number.MAX_SAFE_INTEGER) || !raw || typeof raw !== "object" || Array.isArray(raw) || !DETAIL_KINDS.includes(raw.kind) || !integer(raw.y, -32768, 32767) || !integer(raw.depth, 0, 255) || (raw.palette !== undefined && !integer(raw.palette, 0, 511)) || (raw.kind === "empty" && (raw.depth !== 0 || raw.palette !== undefined))) { this.counts.rejectedNotes++; return false; }
    const p = this.pages.get(a.key) ?? this._makeRoom(a);
    if (!p || p.view.getUint32(offset(a.i) + 14, true) === MAX_REV) { this.counts.rejectedNotes++; return false; }
    const o = offset(a.i);
    p.bytes[o] = DETAIL_KINDS.indexOf(raw.kind); p.bytes[o + 1] = raw.depth;
    p.view.setInt16(o + 2, raw.y, true); p.view.setUint16(o + 4, raw.palette ?? ABSENT_PALETTE, true);
    this._mutate(p, a.i, wallMs, false); return true;
  }
  /** World block positions canonicalize to their odd 2-block anchor. False is explicit backpressure. @param {string} storeId @param {number} wx @param {number} wz @param {number} wallMs */
  invalidate(storeId, wx, wz, wallMs) {
    const a = address(storeId, wx, wz);
    if (!a || !integer(wallMs, 0, Number.MAX_SAFE_INTEGER)) { this.counts.rejectedInvalidations++; return false; }
    // There is no raw override to invalidate in a proven absent, nonresident tile. Do not manufacture dirty pages.
    if (this.indexLoaded && this.indexCompatible && !this.indexRows.has(a.key) && !this.pages.has(a.key) && this.transaction?.page.key !== a.key) return true;
    const p = this.pages.get(a.key) ?? this._makeRoom(a);
    if (!p || p.view.getUint32(offset(a.i) + 14, true) === MAX_REV) { this.counts.rejectedInvalidations++; return false; }
    const o = offset(a.i); p.bytes[o] = p.bytes[o + 1] = 0; p.view.setInt16(o + 2, 0, true); p.view.setUint16(o + 4, ABSENT_PALETTE, true);
    this._mutate(p, a.i, wallMs, true); return true;
  }
  /** @param {Page} p @param {number} i @param {number} wallMs @param {boolean} tombstone */
  _mutate(p, i, wallMs, tombstone) {
    const o = offset(i); p.view.setFloat64(o + 6, wallMs, true); p.view.setUint32(o + 14, p.view.getUint32(o + 14, true) + 1, true);
    setBit(p.bytes, i, !tombstone); setBit(p.bytes, i, tombstone, MASK); setBit(p.changed, i, true);
    if (!p.dirty) { p.dirty = true; p.dirtySince = wallMs; this.dirtyCount++; }
    p.revision++; p.saved = Math.max(p.saved, wallMs); this._touch(p);
  }
  /** Bool means ONE adapter read attempt was consumed, including errors. Zero writes. @param {number} nowMs */
  loadOne(nowMs) {
    this._loadedPage = undefined;
    if (!this._ready || !integer(nowMs, 0, Number.MAX_SAFE_INTEGER)) return false;
    const generation = this.generation;
    if (!this.indexLoaded) {
      if (nowMs < (this.readRetry.get(INDEX_KEY)?.retryAt ?? 0)) return false;
      let raw; try { raw = this._get(INDEX_KEY); } catch { if (generation === this.generation) this._backoff(INDEX_KEY, nowMs); return true; }
      if (generation !== this.generation) return true;
      this.readRetry.delete(INDEX_KEY);
      if (this._loadIndex(raw)) this.readVersion++;
      return true;
    }
    let p = [...this.pages.values()].find(page => !page.loaded);
    if (!p) { const a = this.pending.values().next().value; if (!a) return false; p = this._makeRoom(a); if (!p) return false; }
    const row = this.indexRows.get(p.key);
    if (!row) { this._loaded(p); return false; }
    const key = `${PREFIX}p:${row.slot}`;
    if (nowMs < (this.readRetry.get(key)?.retryAt ?? 0)) return false;
    let raw; try { raw = this._get(key); } catch { if (generation === this.generation) this._backoff(key, nowMs); return true; }
    if (generation !== this.generation) return true;
    this.readRetry.delete(key);
    const bytes = this._decodePage(raw, row, nowMs);
    if (bytes) {
      for (let i = 0; i < CELLS; i++) if (!bit(p.changed, i)) {
        const o = offset(i); p.bytes.set(bytes.subarray(o, o + STRIDE), o);
        setBit(p.bytes, i, !!bit(bytes, i)); setBit(p.bytes, i, !!bit(bytes, i, MASK), MASK);
      }
      p.saved = Math.max(p.saved, row.saved);
      this.readVersion++;
      let knownCount = 0;
      for (let i = 0; i < CELLS; i++) if (bit(p.bytes, i)) { const at = p.view.getFloat64(offset(i) + 6, true); if (at <= nowMs && nowMs - at <= this.ttlMs) knownCount++; }
      if (knownCount) this._loadedPage = Object.freeze({ storeId: p.storeId, px: p.px, pz: p.pz, knownCount, readVersion: this.readVersion, profile: this.profile, generation: this.generation });
    }
    this._loaded(p); return true;
  }
  /** Bool means ONE adapter write attempt was consumed, including errors. Page/index phases never share a call. @param {number} nowMs */
  flushOne(nowMs) {
    if (!this._ready || !this.indexLoaded || !integer(nowMs, 0, Number.MAX_SAFE_INTEGER)) return false;
    const generation = this.generation;
    if (this.transaction) {
      const tx = this.transaction;
      if (!this._set(INDEX_KEY, tx.index)) return true;
      if (generation !== this.generation) return true;
      this._installIndex(tx.rows); this.indexBytes = tx.index.length;
      if (tx.page.revision === tx.revision) { tx.page.dirty = false; this.dirtyCount--; tx.page.changed.fill(0); }
      this.transaction = undefined; return true;
    }
    const p = [...this.pages.values()].filter(page => page.loaded && page.dirty).sort((a, b) => a.dirtySince - b.dirtySince)[0];
    if (!p) return false;
    const revision = p.revision;
    const body = [VERSION, 2, 32, this.profile, p.storeId, p.px, p.pz, p.saved, encode64(p.bytes)];
    const checksum = hash(JSON.stringify(body)), value = JSON.stringify([...body, checksum]);
    let row = this.indexRows.get(p.key);
    if (!row) {
      const used = new Set(this.index.map(r => r.slot)); let slot = 0; while (used.has(slot) && slot < 128) slot++;
      if (this.index.length >= this.maxSavedPages || slot === 128) {
        // Protect decoded active tiles where possible; otherwise the hard saved cap still wins.
        const inactive = this.index.filter(r => !this.pages.has(identity(r.storeId, r.px, r.pz)));
        row = (inactive.length ? inactive : this.index).reduce((a, b) => a.saved <= b.saved ? a : b);
      }
      else row = { slot, storeId: p.storeId, px: p.px, pz: p.pz, saved: p.saved, bytes: value.length, hash: checksum };
    }
    const record = { slot: row.slot, storeId: p.storeId, px: p.px, pz: p.pz, saved: p.saved, bytes: value.length, hash: checksum };
    const rows = this.index.filter(r => r.slot !== row.slot).concat(record);
    while (rows.length > this.maxSavedPages) { const old = rows.filter(r => r !== record).reduce((a, b) => a.saved <= b.saved ? a : b); rows.splice(rows.indexOf(old), 1); }
    const index = serializeIndex(rows, this.profile);
    if (value.length >= PROPERTY_LIMIT || index.length >= PROPERTY_LIMIT || rows.reduce((n, r) => n + r.bytes, index.length) > LOGICAL_LIMIT) { this.counts.writeErrors++; return false; }
    if (!this._set(`${PREFIX}p:${record.slot}`, value)) return true;
    if (generation !== this.generation) return true;
    this.transaction = { page: p, revision, rows, index }; return true;
  }
  /** Debug only: do not call from the hot shared IO pump. @param {number} [nowMs] */
  stats(nowMs = Date.now()) {
    const dirty = [...this.pages.values()].filter(p => p.dirty);
    return { ...this.counts, ready: this._ready, indexLoaded: this.indexLoaded, profile: this.profile, residentPages: this.pages.size, savedPages: this.index.length, pending: this.pending.size + this.unloadedCount, dirtyPages: this.dirtyCount, dirtyBytes: dirty.length * DETAIL_PAGE_RAW_BYTES, oldestDirtyAgeMs: dirty.length ? Math.max(0, nowMs - Math.min(...dirty.map(p => p.dirtySince))) : 0, persistedBytes: this.index.reduce((n, r) => n + r.bytes, this.indexBytes), pendingCommit: !!this.transaction, pageRawBytes: DETAIL_PAGE_RAW_BYTES, pageEncodedBytes: ENCODED_BYTES, maxLogicalBytes: LOGICAL_LIMIT };
  }
  /** @param {Page} p */
  _touch(p) { this.pages.delete(p.key); this.pages.set(p.key, p); }
  /** @param {Page} p */
  _loaded(p) { if (!p.loaded) { p.loaded = true; this.unloadedCount--; } this._touch(p); }
  /** @param {Address} a @returns {Page|undefined} */
  _makeRoom(a) {
    if (this.pages.size >= this.maxResidentPages) {
      const clean = [...this.pages.values()].find(p => !p.dirty);
      if (!clean) return undefined;
      this.pages.delete(clean.key); if (!clean.loaded) this.unloadedCount--; this.counts.evictions++;
    }
    const bytes = new Uint8Array(DETAIL_PAGE_RAW_BYTES), view = new DataView(bytes.buffer);
    for (let i = 0; i < CELLS; i++) view.setUint16(offset(i) + 4, ABSENT_PALETTE, true);
    const loaded = this.indexLoaded && !this.indexRows.has(a.key);
    const p = { storeId: a.storeId, px: a.px, pz: a.pz, key: a.key, bytes, view, changed: new Uint8Array(MASK), loaded, dirty: false, dirtySince: 0, saved: 0, revision: 0 };
    this.pages.set(a.key, p); this.pending.delete(a.key); if (!loaded) this.unloadedCount++; return p;
  }
  /** Synchronize only a decoded/committed manifest; adapter failures never call this. @param {Row[]} rows */
  _installIndex(rows, compatible = true) {
    this.index = rows; this.indexCompatible = compatible; this.indexRows.clear();
    for (const row of rows) this.indexRows.set(identity(row.storeId, row.px, row.pz), row);
    this.indexLoaded = true;
    // Pre-manifest requests whose tiles are absent need neither a resident allocation nor a page read.
    for (const key of this.pending.keys()) if (!this.indexRows.has(key)) this.pending.delete(key);
    // Preserve resident native notes/tombstones; only resolve their no-disk-merge readiness.
    for (const page of this.pages.values()) if (!page.loaded && !this.indexRows.has(page.key)) { page.loaded = true; this.unloadedCount--; }
  }
  /** Per physical key: at most129 entries. No retry limit converts unread data/tombstones to absence. @param {string} key @param {number} nowMs */
  _backoff(key, nowMs) {
    const failures = Math.min(7, (this.readRetry.get(key)?.failures ?? 0) + 1);
    this.readRetry.set(key, { failures, retryAt: Math.min(Number.MAX_SAFE_INTEGER, nowMs + Math.min(5000, 100 * 2 ** (failures - 1))) });
  }
  /** @param {string} key */
  _get(key) {
    this.counts.reads++;
    try { const raw = this.adapter.get(key); if (typeof raw === "string") this.counts.bytesRead += raw.length; return raw; }
    catch (error) { this.counts.readErrors++; throw error; }
  }
  /** @param {string} key @param {string} value */
  _set(key, value) {
    this.counts.writeAttempts++;
    try { this.adapter.set(key, value); this.counts.writes++; this.counts.bytesWritten += value.length; return true; }
    catch { this.counts.writeErrors++; return false; }
  }
  /** @param {unknown} raw */
  _loadIndex(raw) {
    try {
      if (raw === undefined) { this._installIndex([]); this.indexBytes = 0; return true; }
      if (typeof raw !== "string" || raw.length >= PROPERTY_LIMIT) throw new Error();
      const d = JSON.parse(raw);
      if (!Array.isArray(d) || d.length !== 5 || d[0] !== VERSION || d[1] !== 2 || d[2] !== 32 || !validProfile(d[3]) || !Array.isArray(d[4]) || d[4].length > 128) throw new Error();
      if (d[3] !== this.profile) { this.counts.profileMisses++; this._installIndex([], false); this.indexBytes = 0; return true; }
      /** @type {Row[]} */ const rows = []; const slots = new Set(), keys = new Set();
      for (const r of d[4]) {
        if (!Array.isArray(r) || r.length !== 7 || !integer(r[0], 0, 127) || !validStore(r[1]) || !integer(r[2], -468750, 468750) || !integer(r[3], -468750, 468750) || !integer(r[4], 0, Number.MAX_SAFE_INTEGER) || !integer(r[5], 1, PROPERTY_LIMIT - 1) || !integer(r[6], 0, MAX_REV)) throw new Error();
        const key = identity(r[1], r[2], r[3]); if (keys.has(key) || slots.has(r[0])) throw new Error(); keys.add(key); slots.add(r[0]);
        rows.push({ slot: r[0], storeId: r[1], px: r[2], pz: r[3], saved: r[4], bytes: r[5], hash: r[6] });
      }
      if (rows.reduce((n, r) => n + r.bytes, raw.length) > LOGICAL_LIMIT) throw new Error();
      this._installIndex(rows); this.indexBytes = raw.length; return true;
    } catch { this.counts.corrupt++; this._installIndex([], false); this.indexBytes = 0; return false; }
  }
  /** @param {unknown} raw @param {Row} row @param {number} nowMs @returns {Uint8Array|undefined} */
  _decodePage(raw, row, nowMs) {
    try {
      if (typeof raw !== "string" || raw.length !== row.bytes || raw.length >= PROPERTY_LIMIT) throw new Error();
      const d = JSON.parse(raw);
      if (!Array.isArray(d) || d.length !== 10 || d[0] !== VERSION || d[1] !== 2 || d[2] !== 32 || !validProfile(d[3]) || d[4] !== row.storeId || d[5] !== row.px || d[6] !== row.pz || d[7] !== row.saved || !integer(d[7], 0, nowMs) || d[9] !== row.hash || hash(JSON.stringify(d.slice(0, 9))) !== row.hash) throw new Error();
      if (d[3] !== this.profile) { this.counts.profileMisses++; return undefined; }
      const bytes = decode64(d[8]), view = new DataView(bytes.buffer);
      for (let i = 0; i < CELLS; i++) {
        const valid = bit(bytes, i), tomb = bit(bytes, i, MASK), o = offset(i), kind = bytes[o], depth = bytes[o + 1], y = view.getInt16(o + 2, true), palette = view.getUint16(o + 4, true), at = view.getFloat64(o + 6, true), revision = view.getUint32(o + 14, true);
        if (valid && tomb) throw new Error();
        if (valid || tomb) {
          if (!integer(at, 0, Math.min(nowMs, row.saved)) || revision < 1 || kind >= DETAIL_KINDS.length || (palette !== ABSENT_PALETTE && palette > 511) || Math.abs(row.px * 64 + (i % 32) * 2 + 1) > 30000000 || Math.abs(row.pz * 64 + Math.floor(i / 32) * 2 + 1) > 30000000) throw new Error();
          if ((tomb || kind === 0) && (depth !== 0 || palette !== ABSENT_PALETTE || (tomb && (kind !== 0 || y !== 0)))) throw new Error();
        } else if (kind !== 0 || depth !== 0 || y !== 0 || palette !== ABSENT_PALETTE || at !== 0 || revision !== 0) throw new Error();
      }
      return bytes;
    } catch { this.counts.corrupt++; return undefined; }
  }
}
