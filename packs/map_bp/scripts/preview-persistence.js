// Preview ONLY: world-aligned 4- or 8-block cells, not the live 2-block terrain cache.
// Inject world dynamic-property get/set AFTER worldLoad. No game imports or timers.
// Fixed slots bound logical saved strings; engine RAM / physical world DB size is not promised.
import { knownPreviewGlyph } from "./preview-glyph.js";
const VERSION = 3; // Profile-stamped values keep the existing v2 resolution-qualified keys.
const MAX_PROPERTY_BYTES = 32767; // Strictly less than the engine limit.
const MAX_LOGICAL_BYTES = 256 * 1024;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** @typedef {"native"|"material"} Profile */
/** @typedef {{get:(key:string)=>unknown, set:(key:string,value:string)=>void}} Storage */
/** @typedef {{resolution?:4|8,maxSavedPages?:number,maxResidentPages?:number,maxPendingRequests?:number,maxAgeMs?:number,profile?:Profile}} Options */
/** @typedef {{storeId:string,px:number,pz:number,key:string}} Address */
/** @typedef {Address & {profile:Profile,cells:Uint16Array,loaded:boolean,dirty:boolean,revision:number,saved:number}} Page */
/** @typedef {{slot:number,storeId:string,px:number,pz:number,saved:number,bytes:number}} Record */
/** @typedef {{wx:number,wz:number,glyph:string}} Entry */
/** @typedef {{profile:Profile,page:Page,revision:number,record:Record,rows:Record[],value:string,index:string}} Transaction */

/** @param {string} s */
function utf8Bytes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n++;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
/** @param {unknown} n @param {number} lo @param {number} hi */
const integer = (n, lo, hi) => typeof n === "number" && Number.isSafeInteger(n) && n >= lo && n <= hi;
/** @param {unknown} profile */
const validProfile = profile => profile === "native" || profile === "material";
/** Only canonical internal terrain store IDs, never user-provided property key fragments. @param {unknown} s */
function validStore(s) {
  if (s === "minecraft:overworld|surface" || s === "minecraft:the_end|surface" || s === "minecraft:nether|surface") return true;
  if (typeof s !== "string") return false;
  const m = /^minecraft:nether\|layer(-?(?:0|[1-9][0-9]{0,3}))$/.exec(s);
  return !!m && m[1] !== "-0" && integer(Number(m[1]), -4096, 4096);
}
/** @param {string} storeId @param {number} px @param {number} pz */
const identity = (storeId, px, pz) => `${storeId}/${px}/${pz}`;
/** @param {string} storeId @param {number} wx @param {number} wz @param {number} pageSpan @returns {Address|undefined} */
function address(storeId, wx, wz, pageSpan) {
  if (!validStore(storeId) || !Number.isFinite(wx) || !Number.isFinite(wz) || Math.abs(wx) > 30000000 || Math.abs(wz) > 30000000) return undefined;
  const px = Math.floor(wx / pageSpan), pz = Math.floor(wz / pageSpan);
  return { storeId, px, pz, key: identity(storeId, px, pz) };
}
/** @param {Uint8Array|number[]} bytes */
function encode64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    out += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : "=") + (i + 2 < bytes.length ? BASE64[c & 63] : "=");
  }
  return out;
}
/** Strict canonical base64; no Buffer, atob or native dependency. @param {unknown} text @returns {Uint8Array|undefined} */
function decode64(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > 1024 || text.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) return undefined;
  const out = [];
  for (let i = 0; i < text.length; i += 4) {
    const a = BASE64.indexOf(text[i]), b = BASE64.indexOf(text[i + 1]);
    const c = BASE64.indexOf(text[i + 2]), d = BASE64.indexOf(text[i + 3]);
    out.push((a << 2) | (b >> 4));
    if (c >= 0) out.push(((b & 15) << 4) | (c >> 2));
    if (d >= 0) out.push(((c & 3) << 6) | d);
  }
  return encode64(out) === text ? new Uint8Array(out) : undefined;
}
/** 0 means unknown; 1..1536 encode exactly U+F300..U+F8FF. @param {Uint16Array} cells */
function pack(cells) {
  const raw = [], runs = [];
  for (let i = 0; i < 256; i++) raw.push(cells[i] >> 8, cells[i] & 255);
  for (let i = 0; i < 256;) {
    const value = cells[i];
    let end = i + 1;
    while (end < 256 && cells[end] === value) end++;
    runs.push(end - i - 1, value >> 8, value & 255);
    i = end;
  }
  return runs.length < raw.length ? ["r", encode64(runs)] : ["p", encode64(raw)];
}
/** @param {unknown} format @param {unknown} text @returns {Uint16Array|undefined} */
function unpack(format, text) {
  const bytes = decode64(text);
  if (!bytes || (format !== "p" && format !== "r")) return undefined;
  const out = new Uint16Array(256);
  if (format === "p") {
    if (bytes.length !== 512) return undefined;
    for (let i = 0; i < 256; i++) {
      const v = bytes[i * 2] * 256 + bytes[i * 2 + 1];
      if (v > 1536) return undefined;
      out[i] = v;
    }
  } else {
    if (bytes.length % 3 !== 0) return undefined;
    let n = 0;
    for (let i = 0; i < bytes.length; i += 3) {
      const count = bytes[i] + 1, v = bytes[i + 1] * 256 + bytes[i + 2];
      if (v > 1536 || n + count > 256) return undefined;
      out.fill(v, n, n + count); n += count;
    }
    if (n !== 256) return undefined;
  }
  return out;
}
/** @param {Record[]} rows @param {number} resolution @param {Profile} profile */
const serializeIndex = (rows, resolution, profile) => JSON.stringify([VERSION, resolution, 16, rows.map(r => [r.slot, r.storeId, r.px, r.pz, r.saved, r.bytes]), profile]);

export class PreviewPersistence {
  /** No storage IO here (safe before worldLoad). @param {Storage} storage @param {Options} [options] */
  constructor(storage, options = {}) {
    if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") throw new TypeError("preview storage requires get/set");
    this.storage = storage;
    if (options.profile !== undefined && !validProfile(options.profile)) throw new RangeError("preview profile must be native or material");
    this.profile = options.profile ?? "native";
    this.generation = {};
    if (options.resolution !== undefined && options.resolution !== 4 && options.resolution !== 8) throw new RangeError("preview resolution must be 4 or 8");
    this.resolution = options.resolution ?? 8;
    this.anchor = this.resolution / 2 + 1; // +3/+5: a genuine canonical odd 2-block sample.
    this.pageSpan = 16 * this.resolution;
    this.maxPage = Math.floor(30000000 / this.pageSpan);
    this.prefix = `map:preview:v2:r${this.resolution}:`;
    this.indexKey = `${this.prefix}index`;
    const bounded = (/** @type {number|undefined} */ n, /** @type {number} */ fallback, /** @type {number} */ max) => n === undefined ? fallback : integer(n, 1, max) ? n : (() => { throw new RangeError("preview limit out of range"); })();
    this.maxSavedPages = bounded(options.maxSavedPages, 128, 128);
    this.maxResidentPages = bounded(options.maxResidentPages, 16, 32);
    this.maxPendingRequests = bounded(options.maxPendingRequests, 64, 128);
    this.maxAgeMs = bounded(options.maxAgeMs, WEEK, WEEK);
    /** @type {Map<string,Page>} */ this.pages = new Map();
    /** @type {Map<string,Address & {profile:Profile}>} */ this.pending = new Map();
    /** @type {Record[]} */ this.index = [];
    /** @type {Transaction|undefined} */ this.transaction = undefined;
    this.ready = false;
    this.indexBytes = 0;
    this.counts = { reads: 0, writes: 0, bytesRead: 0, bytesWritten: 0, corrupt: 0, stale: 0, profileMisses: 0, rejectedNotes: 0, rejectedRequests: 0, errors: 0, evictions: 0 };
  }
  /** Atomically discard only this cache, with ZERO adapter IO. Same-profile calls preserve all work. @param {Profile} profile */
  setProfile(profile) {
    if (!validProfile(profile)) throw new RangeError("preview profile must be native or material");
    if (profile === this.profile) return false;
    this.profile = profile; this.generation = {};
    this.pages.clear(); this.pending.clear(); this.index = [];
    this.transaction = undefined; this.indexBytes = 0; this.ready = false;
    return true;
  }
  /** Enqueue only; no IO, no duplicate page requests. @param {string} storeId @param {number} wx @param {number} wz */
  request(storeId, wx, wz) {
    const a = address(storeId, wx, wz, this.pageSpan);
    if (!a) return false;
    // Resident loaded pages may need to hydrate a replacement terrain cache.
    // Share one bounded FIFO with cold requests so render replays cannot starve them.
    if (this.pending.has(a.key) || this.pages.get(a.key)?.loaded === false) return false;
    if (this.pending.size >= this.maxPendingRequests) { this.counts.rejectedRequests++; return false; }
    this.pending.set(a.key, { ...a, profile: this.profile }); return true;
  }
  /** Actual preview anchors ONLY: floor(w/resolution)*resolution+anchor, including negatives. Returns false on backpressure; caller may retry, never hidden IO.
   * @param {string} storeId @param {number} wx @param {number} wz @param {string} glyph @param {number} nowMs */
  note(storeId, wx, wz, glyph, nowMs) {
    const a = address(storeId, wx, wz, this.pageSpan);
    const code = typeof glyph === "string" && glyph.length === 1 ? glyph.charCodeAt(0) : -1;
    if (!a || !integer(nowMs, 0, Number.MAX_SAFE_INTEGER) || !Number.isInteger(wx) || !Number.isInteger(wz) || ((wx % this.resolution) + this.resolution) % this.resolution !== this.anchor || ((wz % this.resolution) + this.resolution) % this.resolution !== this.anchor || !knownPreviewGlyph(glyph)) {
      this.counts.rejectedNotes++; return false;
    }
    const p = this.pages.get(a.key) ?? this.makeRoom(a);
    if (!p || p.profile !== this.profile) { this.counts.rejectedNotes++; return false; }
    const i = Math.floor((wz - a.pz * this.pageSpan) / this.resolution) * 16 + Math.floor((wx - a.px * this.pageSpan) / this.resolution);
    const value = code - 0xf300 + 1;
    // Reconfirming unchanged terrain must not become a write for every sample.
    // Refresh its wall TTL only at half-life, or when a glyph actually changes.
    if (p.cells[i] === value && (p.dirty || (p.loaded && nowMs - p.saved < this.maxAgeMs / 2))) {
      this.touch(p); return true;
    }
    p.cells[i] = value;
    p.dirty = true; p.revision++; p.saved = nowMs;
    this.touch(p); return true;
  }
  /** First call reads only the manifest; later calls read at most ONE page, or replay resident cells with ZERO IO. No writes. @param {number} [nowMs] @returns {{storeId:string,entries:Entry[]}|undefined} */
  loadOne(nowMs = Date.now()) {
    if (!integer(nowMs, 0, Number.MAX_SAFE_INTEGER)) return undefined;
    const generation = this.generation;
    if (!this.ready) { this.loadIndex(); return undefined; }
    let p = [...this.pages.values()].find(page => !page.loaded);
    if (!p) {
      const a = this.pending.values().next().value;
      if (!a) return undefined;
      if (a.profile !== this.profile) { this.pending.delete(a.key); this.counts.profileMisses++; return undefined; }
      const resident = this.pages.get(a.key);
      if (resident?.loaded && resident.profile === this.profile) {
        this.pending.delete(a.key);
        if (nowMs - resident.saved > this.maxAgeMs || resident.saved > nowMs) { this.counts.stale++; return undefined; }
        this.touch(resident);
        return this.entries(resident);
      }
      p = this.makeRoom(a);
      if (!p) return undefined; // All residents dirty: retry after flush, never drop a dirty page.
      this.pending.delete(a.key);
    }
    const row = this.index.find(r => identity(r.storeId, r.px, r.pz) === p.key);
    if (!row) { p.loaded = true; return undefined; }
    if (nowMs - row.saved > this.maxAgeMs || row.saved > nowMs) { p.loaded = true; this.counts.stale++; return undefined; }
    let raw;
    try { raw = this.get(`${this.prefix}p:${row.slot}`); } catch { return undefined; }
    if (generation !== this.generation || p.profile !== this.profile) return undefined;
    const cells = this.decodePage(raw, row, nowMs);
    p.loaded = true;
    if (!cells) return undefined;
    // Notes may precede the disk read: actual fresh samples win over saved preview.
    for (let i = 0; i < 256; i++) if (p.cells[i]) cells[i] = p.cells[i];
    p.cells = cells;
    if (!p.dirty) p.saved = row.saved;
    this.touch(p);
    return this.entries(p);
  }
  /** Snapshot only: never changes loaded/dirty state or starts a write. @param {Page} p */
  entries(p) {
    if (p.profile !== this.profile) return undefined;
    const entries = [];
    for (let i = 0; i < 256; i++) if (p.cells[i]) entries.push({ wx: p.px * this.pageSpan + (i % 16) * this.resolution + this.anchor, wz: p.pz * this.pageSpan + Math.floor(i / 16) * this.resolution + this.anchor, glyph: String.fromCharCode(0xf300 + p.cells[i] - 1) });
    return entries.length ? { storeId: p.storeId, entries } : undefined;
  }
  /** At most ONE set, zero get. A page write and its index commit take two calls. A crash between them loses only preview, never exposes mismatched data.
   * Call loadOne after worldLoad first; flush waits until manifest and dirty-page merges are loaded. @param {number} nowMs */
  flushOne(nowMs) {
    if (!this.ready || !integer(nowMs, 0, Number.MAX_SAFE_INTEGER)) return false;
    const generation = this.generation;
    if (this.transaction) {
      const tx = this.transaction;
      if (tx.profile !== this.profile || tx.page.profile !== this.profile) { this.transaction = undefined; this.counts.profileMisses++; return false; }
      if (!this.set(this.indexKey, tx.index)) return false;
      if (generation !== this.generation) return true;
      this.index = tx.rows; this.indexBytes = tx.index.length;
      if (tx.page.revision === tx.revision) tx.page.dirty = false;
      this.transaction = undefined; return true;
    }
    const p = [...this.pages.values()].find(page => page.profile === this.profile && page.loaded && page.dirty);
    if (!p) return false;
    const packed = pack(p.cells);
    const value = JSON.stringify([VERSION, this.resolution, 16, p.storeId, p.px, p.pz, p.saved, packed[0], packed[1], this.profile]);
    const bytes = utf8Bytes(value);
    let row = this.index.find(r => identity(r.storeId, r.px, r.pz) === p.key);
    if (!row) {
      const used = new Set(this.index.map(r => r.slot));
      let slot = 0;
      while (used.has(slot) && slot < 128) slot++;
      if (this.index.length >= this.maxSavedPages || slot === 128) row = this.index.reduce((old, r) => r.saved < old.saved ? r : old);
      else row = { slot, storeId: p.storeId, px: p.px, pz: p.pz, saved: p.saved, bytes };
    }
    const record = { slot: row.slot, storeId: p.storeId, px: p.px, pz: p.pz, saved: p.saved, bytes };
    const rows = this.index.filter(r => r.slot !== record.slot).concat(record);
    // Honor a reduced configured cap on the next commit without extra IO/deletes.
    while (rows.length > this.maxSavedPages) {
      const oldest = rows.filter(r => r !== record).reduce((old, r) => r.saved < old.saved ? r : old);
      rows.splice(rows.indexOf(oldest), 1);
    }
    const index = serializeIndex(rows, this.resolution, this.profile);
    if (bytes >= MAX_PROPERTY_BYTES || index.length >= MAX_PROPERTY_BYTES || rows.reduce((n, r) => n + r.bytes, index.length) > MAX_LOGICAL_BYTES) { this.counts.errors++; return false; }
    if (!this.set(`${this.prefix}p:${record.slot}`, value)) return false;
    if (generation !== this.generation) return true;
    this.transaction = { profile: this.profile, page: p, revision: p.revision, record, rows, value, index };
    return true;
  }
  stats() {
    return { ...this.counts, profile: this.profile, residentPages: this.pages.size, dirtyPages: [...this.pages.values()].filter(p => p.dirty).length, pending: this.pending.size + [...this.pages.values()].filter(p => !p.loaded).length, savedPages: this.index.length, persistedBytes: this.index.reduce((n, r) => n + r.bytes, this.indexBytes), pendingCommit: !!this.transaction, ready: this.ready };
  }
  /** @param {Page} p */
  touch(p) { this.pages.delete(p.key); this.pages.set(p.key, p); }
  /** @param {Address} a @returns {Page|undefined} */
  makeRoom(a) {
    if (this.pages.size >= this.maxResidentPages) {
      const clean = [...this.pages.values()].find(p => !p.dirty);
      if (!clean) return undefined;
      // A queued memory replay must not become an unexpected disk reread.
      this.pending.delete(clean.key);
      this.pages.delete(clean.key); this.counts.evictions++;
    }
    const p = { ...a, profile: this.profile, cells: new Uint16Array(256), loaded: false, dirty: false, revision: 0, saved: 0 };
    this.pages.set(a.key, p); this.pending.delete(a.key); return p;
  }
  /** @param {string} key */
  get(key) {
    this.counts.reads++;
    try {
      const raw = this.storage.get(key);
      if (typeof raw === "string") this.counts.bytesRead += utf8Bytes(raw);
      return raw;
    } catch (error) { this.counts.errors++; throw error; }
  }
  /** @param {string} key @param {string} value */
  set(key, value) {
    try { this.storage.set(key, value); } catch { this.counts.errors++; return false; }
    this.counts.writes++; this.counts.bytesWritten += utf8Bytes(value); return true;
  }
  loadIndex() {
    let raw;
    const generation = this.generation;
    try { raw = this.get(this.indexKey); } catch { return; }
    if (generation !== this.generation) return;
    if (raw === undefined) { this.ready = true; return; }
    try {
      if (typeof raw !== "string" || utf8Bytes(raw) >= MAX_PROPERTY_BYTES) throw new Error();
      const data = JSON.parse(raw);
      if (!Array.isArray(data) || data.length !== 5 || data[0] !== VERSION || data[1] !== this.resolution || data[2] !== 16 || !Array.isArray(data[3]) || data[3].length > 128 || !validProfile(data[4])) throw new Error();
      if (data[4] !== this.profile) { this.counts.profileMisses++; this.ready = true; return; }
      /** @type {Record[]} */ const rows = [];
      const slots = new Set(), keys = new Set();
      for (const r of data[3]) {
        if (!Array.isArray(r) || r.length !== 6 || !integer(r[0], 0, 127) || !validStore(r[1]) || !integer(r[2], -this.maxPage, this.maxPage) || !integer(r[3], -this.maxPage, this.maxPage) || !integer(r[4], 0, Number.MAX_SAFE_INTEGER) || !integer(r[5], 1, 2048)) throw new Error();
        const key = identity(r[1], r[2], r[3]);
        if (slots.has(r[0]) || keys.has(key)) throw new Error();
        slots.add(r[0]); keys.add(key);
        rows.push({ slot: r[0], storeId: r[1], px: r[2], pz: r[3], saved: r[4], bytes: r[5] });
      }
      if (rows.reduce((n, r) => n + r.bytes, raw.length) > MAX_LOGICAL_BYTES) throw new Error();
      // A smaller test/configuration limit still honors existing slots; next commits retire old rows.
      this.index = rows; this.indexBytes = raw.length;
    } catch { this.counts.corrupt++; this.index = []; }
    this.ready = true;
  }
  /** @param {unknown} raw @param {Record} row @param {number} nowMs @returns {Uint16Array|undefined} */
  decodePage(raw, row, nowMs) {
    try {
      if (typeof raw !== "string" || utf8Bytes(raw) !== row.bytes || row.bytes >= MAX_PROPERTY_BYTES) throw new Error();
      const d = JSON.parse(raw);
      if (!Array.isArray(d) || d.length !== 10 || d[0] !== VERSION || d[1] !== this.resolution || d[2] !== 16 || d[3] !== row.storeId || d[4] !== row.px || d[5] !== row.pz || d[6] !== row.saved || !validStore(d[3]) || !integer(d[4], -this.maxPage, this.maxPage) || !integer(d[5], -this.maxPage, this.maxPage) || !integer(d[6], 0, nowMs) || nowMs - d[6] > this.maxAgeMs) throw new Error();
      if (!validProfile(d[9])) throw new Error();
      if (d[9] !== this.profile) { this.counts.profileMisses++; return undefined; }
      const cells = unpack(d[7], d[8]);
      if (!cells) throw new Error();
      for (let i = 0; i < 256; i++) if (cells[i] && (!knownPreviewGlyph(String.fromCharCode(0xf300 + cells[i] - 1)) || Math.abs(row.px * this.pageSpan + (i % 16) * this.resolution + this.anchor) > 30000000 || Math.abs(row.pz * this.pageSpan + Math.floor(i / 16) * this.resolution + this.anchor) > 30000000)) throw new Error();
      return cells;
    } catch { this.counts.corrupt++; return undefined; }
  }
}
