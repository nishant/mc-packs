// Generated from tools/diag-shared.js by node tools/sync-diag.mjs: edit that file, not this copy.
// Pack diagnostics for operators: script cost and saved data per pack, and removing a pack's saved data.
// Synced into every behavior pack as scripts/diag.js by tools/sync-diag.mjs, with PACK, VERSION and NAME filled
// in from the pack's folder and manifest header (version, name). Each pack's main.js imports "./diag.js" FIRST: ES
// modules run in import order, so everything the pack's other modules hand to the game afterwards is wrapped.
//
// What it wraps (the same approach as tools/test-bds/lib/profile.js, which it runs inside of when present):
// system.run / runTimeout / runInterval / runJob (each generator step), every world/system beforeEvents and
// afterEvents subscribe, and custom command callbacks. While profiling is off a wrapper costs one boolean
// check (`S.track`) and a call. World.prototype.get/setDynamicProperty are wrapped too, to learn which pack
// owns which key (needed in a bundle) and to stop a forgotten pack writing its old data back.
//
// One script context can hold several packs: the Realm Bundle merges every behavior pack into one add-on,
// so they share one JS context and ONE dynamic property storage. The first copy to run installs the
// patches and keeps the state on globalThis; every copy registers its pack there. Ownership in a shared
// context: a callback belongs to the pack whose code handed it over (the pack being evaluated, or the
// pack whose wrapped callback is running; a registration from an `await` continuation falls back to the
// call stack's file path); a world property key belongs to the first pack that read or wrote it, else to
// the pack owning its prefix (text before the first ":"). Keys nobody touched since the last reload are
// "unclaimed". Alone in its context, a pack owns its whole storage.
//
// Protocol (realm: script events, JSON, every message under 2048 characters):
//   realm:diag_ping {id, ticks?}     every pack replies realm:diag_pong {id, pack, name, version, bytes, props,
//                                    big, bigKey, forgotten?, shared?, total?}; with ticks (1-1200) the
//                                    reply waits for a profiling window of that many ticks and adds
//                                    {ticks, ms, calls, mpt (ms per tick), top: [{k, ms, n}] (two biggest)}
//   realm:diag_forget {id, pack, confirm: "FORGET <pack>"}
//                                    that pack deletes its world saved data (clearDynamicProperties() when it
//                                    has the storage to itself, its own keys in a bundle), ignores its own
//                                    further setDynamicProperty writes until the next /reload or restart
//                                    (its caches in memory would write old data back), and replies
//                                    realm:diag_forgot {id, pack, ok, removed, bytes} or {id, pack, ok: false,
//                                    error}. Scoreboards, tags and data saved on players are not touched.
// Time is Date.now() (Bedrock has no finer clock): one call reads 0 or 1 ms, sums over many calls are fair.
// Time after an `await` inside an async callback is not counted (it runs outside the wrapper).
import { CustomCommandRegistry, System, World, system, world } from "@minecraft/server";

const PACK = "guilds_bp";
const VERSION = "1.1.5";
const NAME = "Guilds & Reputation";

const API = 1;
const MAX_TICKS = 1200;
/** @typedef {{ ms: number, calls: number }} Cb */
/**
 * @typedef {{ pack: string, name: string, version: string, ms: number, calls: number, cbs: Map<string, Cb>, forgotten: boolean, warned: boolean }} Rec
 * @typedef {{ start: number, end: number, ids: string[] }} Win
 * @typedef {{
 *   api: number, on: boolean, multi: boolean, track: boolean, cur: Rec | null, packs: Map<string, Rec>,
 *   keyOwner: Map<string, Rec>, prefixOwner: Map<string, Rec | null>, win: Win | null,
 *   orig: { run: Function, runTimeout: Function, get: Function, set: Function, ids: Function, clear: Function }
 * }} State
 */

const G = /** @type {any} */ (globalThis);
/** @type {State} */
const S = G.__realmDiag ?? (G.__realmDiag = install());
/** @type {Rec} */
const REC = S.packs.get(PACK) ?? { pack: PACK, name: NAME, version: VERSION, ms: 0, calls: 0, cbs: new Map(), forgotten: false, warned: false };
S.packs.set(PACK, REC);
S.multi = S.packs.size > 1;
S.track = S.on || S.multi;
S.cur = REC; // the rest of this pack's modules evaluate next: what they hand over is this pack's

/** @returns {State} */
function install() {
  const sp = /** @type {any} */ (System.prototype);
  const wp = /** @type {any} */ (World.prototype);
  /** @type {State} */
  const st = {
    api: API, on: false, multi: false, track: false, cur: null, packs: new Map(), keyOwner: new Map(), prefixOwner: new Map(), win: null,
    orig: { run: sp.run, runTimeout: sp.runTimeout, get: wp.getDynamicProperty, set: wp.setDynamicProperty, ids: wp.getDynamicPropertyIds, clear: wp.clearDynamicProperties },
  };
  // Subscribed before the signals are wrapped, so it is never timed. One listener answers for every pack here.
  system.afterEvents.scriptEventReceive.subscribe((ev) => {
    if (ev.id === "realm:diag_ping" || ev.id === "realm:diag_forget") handle(st, ev.id, ev.message);
  }, { namespaces: ["realm"] });
  try {
    patchSystem(st);
    for (const [owner, prefix] of /** @type {[any, string][]} */ ([[world.beforeEvents, "world.before"], [world.afterEvents, "world.after"], [system.beforeEvents, "system.before"], [system.afterEvents, "system.after"]])) patchSignals(st, owner, prefix);
    patchCommands(st);
    patchProps(st);
  } catch (e) {
    console.warn(`[diag] could not install: ${e}`);
  }
  // Module evaluation is over by the first tick: from then on only a running callback says whose code runs.
  st.orig.run.call(system, () => {
    if (st.multi) st.cur = null;
  });
  return st;
}

// ---------------------------------------------------------------------------
// Wrapping
// ---------------------------------------------------------------------------

/** @type {WeakMap<Function, Function>} original callback -> wrapper (for unsubscribe) */
const wrapped = G.__realmDiagWrapped ?? (G.__realmDiagWrapped = new WeakMap());

/** "file:line" of the first stack frame outside this file and the test harness. */
function site() {
  for (const l of String(new Error().stack || "").split("\n")) {
    if (!l.trim() || l.includes("diag.js") || l.includes("__harness_")) continue;
    const m = /\(([^()]*)\)\s*$/.exec(l) || /at (\S+)\s*$/.exec(l);
    if (m) return m[1];
  }
  return "?";
}

/**
 * The pack handing a callback over right now. `rare`: a long-lived registration (an interval, a subscription,
 * a command), worth a stack walk when nothing else says.
 * @param {State} st @param {boolean} rare @param {string} where
 */
function owner(st, rare, where) {
  if (st.cur) return st.cur;
  if (st.packs.size === 1) return st.packs.values().next().value ?? null;
  if (!rare && !st.on) return null;
  for (const [name, rec] of st.packs) if (where.includes(`${name}/`)) return rec;
  return null;
}

/** @param {Rec} rec @param {string} key @param {number} ms */
function note(rec, key, ms) {
  rec.ms += ms;
  rec.calls++;
  let c = rec.cbs.get(key);
  if (!c) rec.cbs.set(key, (c = { ms: 0, calls: 0 }));
  c.ms += ms;
  c.calls++;
}

/**
 * @param {State} st @param {Function} fn @param {Rec | null} rec @param {string} key
 * @returns {Function}
 */
function wrap(st, fn, rec, key) {
  if (typeof fn !== "function") return fn;
  /** @this {any} @param {any[]} a */
  const w = function (...a) {
    if (!st.track) return fn.apply(this, a);
    const prev = st.cur;
    if (rec) st.cur = rec;
    if (!st.on || !rec) {
      try {
        return fn.apply(this, a);
      } finally {
        st.cur = prev;
      }
    }
    const t = Date.now();
    try {
      return fn.apply(this, a);
    } finally {
      note(rec, key, Date.now() - t);
      st.cur = prev;
    }
  };
  return w;
}

/** @param {string} kind @param {Function | undefined} fn @param {string} where */
const label = (kind, fn, where) => `${kind}${fn && fn.name && fn.name !== "anonymous" ? ` ${fn.name}` : ""}${where ? ` @ ${where}` : ""}`;

/** @param {State} st */
function patchSystem(st) {
  const proto = /** @type {any} */ (System.prototype);
  const o = { run: proto.run, runTimeout: proto.runTimeout, runInterval: proto.runInterval, runJob: proto.runJob };
  /** @param {string} kind @param {Function} cb @param {boolean} rare */
  const w = (kind, cb, rare) => {
    // A short-lived run/runTimeout handed over while profiling is off is named by its kind only: no stack
    // walk or string building on a call the packs make many times a tick.
    const where = rare || st.on ? site() : "";
    return wrap(st, cb, owner(st, rare, where), rare || st.on ? label(kind, cb, where) : kind);
  };
  proto.run = function (/** @type {Function} */ cb) {
    return o.run.call(this, w("run", cb, false));
  };
  proto.runTimeout = function (/** @type {Function} */ cb, /** @type {number | undefined} */ t) {
    return o.runTimeout.call(this, w("runTimeout", cb, false), t);
  };
  proto.runInterval = function (/** @type {Function} */ cb, /** @type {number | undefined} */ t) {
    return o.runInterval.call(this, w(`runInterval(${t ?? 1})`, cb, true), t);
  };
  proto.runJob = function (/** @type {any} */ gen) {
    if (!gen || typeof gen.next !== "function") return o.runJob.call(this, gen);
    const where = st.on ? site() : "";
    const rec = owner(st, false, where);
    const key = label("runJob", undefined, where);
    function* step() {
      while (true) {
        let r;
        if (!st.track) r = gen.next();
        else {
          const prev = st.cur;
          if (rec) st.cur = rec;
          const t = st.on && rec ? Date.now() : -1;
          try {
            r = gen.next();
          } finally {
            if (t >= 0 && rec) note(rec, key, Date.now() - t);
            st.cur = prev;
          }
        }
        if (r.done) return r.value;
        yield r.value;
      }
    }
    return o.runJob.call(this, step());
  };
}

/** @param {State} st @param {any} owner_ @param {string} prefix */
function patchSignals(st, owner_, prefix) {
  if (!owner_) return;
  const names = new Set([...Object.getOwnPropertyNames(Object.getPrototypeOf(owner_)), ...Object.getOwnPropertyNames(owner_)]);
  for (const name of names) {
    if (name === "constructor") continue;
    let sig;
    try {
      sig = owner_[name];
    } catch {
      continue;
    }
    if (!sig || typeof sig.subscribe !== "function") continue;
    const sub = sig.subscribe;
    const unsub = sig.unsubscribe;
    try {
      sig.subscribe = function (/** @type {Function} */ cb, /** @type {any[]} */ ...rest) {
        const where = site();
        const w = wrap(st, cb, owner(st, true, where), label(`${prefix}.${name}`, cb, where));
        if (typeof cb === "function") wrapped.set(cb, w);
        return sub.call(this, w, ...rest);
      };
      if (typeof unsub === "function") {
        sig.unsubscribe = function (/** @type {Function} */ cb, /** @type {any[]} */ ...rest) {
          return unsub.call(this, (cb && wrapped.get(cb)) || cb, ...rest);
        };
      }
    } catch (e) {
      console.warn(`[diag] could not wrap ${prefix}.${name}: ${e}`);
    }
  }
}

/** @param {State} st */
function patchCommands(st) {
  const proto = /** @type {any} */ (CustomCommandRegistry && CustomCommandRegistry.prototype);
  if (!proto || typeof proto.registerCommand !== "function") return;
  const o = proto.registerCommand;
  proto.registerCommand = function (/** @type {any} */ def, /** @type {Function} */ cb) {
    const where = site();
    return o.call(this, def, wrap(st, cb, owner(st, true, where), `command ${def && def.name}`));
  };
}

// ---------------------------------------------------------------------------
// Saved data: who owns which key, and forgetting
// ---------------------------------------------------------------------------

/** @param {string} k */
const prefixOf = (k) => {
  const i = k.indexOf(":");
  return i > 0 ? k.slice(0, i) : "";
};

/** @param {State} st @param {string} k @param {Rec} rec */
function learn(st, k, rec) {
  st.keyOwner.set(k, rec);
  const p = prefixOf(k);
  if (!p) return;
  const had = st.prefixOwner.get(p);
  if (had === undefined) st.prefixOwner.set(p, rec);
  else if (had && had !== rec) st.prefixOwner.set(p, null); // two packs use it: no guessing by prefix
}

/** The pack owning a world property key here, if known. @param {State} st @param {string} k @returns {Rec | null} */
function ownerOfKey(st, k) {
  if (st.packs.size === 1) return st.packs.values().next().value ?? null;
  return st.keyOwner.get(k) ?? st.prefixOwner.get(prefixOf(k)) ?? null;
}

/** @param {State} st */
function patchProps(st) {
  const wp = /** @type {any} */ (World.prototype);
  wp.getDynamicProperty = function (/** @type {string} */ k) {
    const c = st.cur;
    if (c && !st.keyOwner.has(k)) learn(st, k, c);
    return st.orig.get.call(this, k);
  };
  wp.setDynamicProperty = function (/** @type {string} */ k, /** @type {any} */ v) {
    let o = st.keyOwner.get(k);
    if (!o) {
      o = st.cur ?? ownerOfKey(st, k) ?? undefined;
      if (o) learn(st, k, o);
    }
    if (o && o.forgotten && v !== undefined) {
      if (!o.warned) {
        o.warned = true;
        console.warn(`[diag] ${o.pack}: its saved data was forgotten, so it saves nothing until /reload or a restart (first blocked key: ${k}).`);
      }
      return;
    }
    return st.orig.set.call(this, k, v);
  };
}

/** Rough stored size of one property: its key plus its value (UTF-8 for text). @param {string} k @param {unknown} v */
function sizeOf(k, v) {
  let n = k.length;
  if (typeof v === "string") {
    n += v.length;
    if (/[^\x00-\x7f]/.test(v)) for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) > 0x7f) n += v.charCodeAt(i) > 0x7ff ? 2 : 1;
  } else if (typeof v === "number") n += 8;
  else if (typeof v === "boolean") n += 1;
  else if (v) n += 24;
  return n;
}

/** Calls an original World method (not the wrapped one). @param {Function} fn @param {any[]} a */
const call = (fn, ...a) => fn.call(world, ...a);

/** Saved data per pack (one pass over the storage). @param {State} st */
function storage(st) {
  /** @type {Map<Rec, { bytes: number, props: number, big: number, bigKey: string, keys: string[] }>} */
  const per = new Map();
  for (const rec of st.packs.values()) per.set(rec, { bytes: 0, props: 0, big: 0, bigKey: "", keys: [] });
  let total = 0;
  /** @type {string[]} */
  let ids = [];
  try {
    ids = call(st.orig.ids);
    total = Number(world.getDynamicPropertyTotalByteCount()) || 0;
  } catch {
    // the world isn't loaded yet
  }
  for (const k of ids) {
    const rec = ownerOfKey(st, k);
    const e = rec && per.get(rec);
    if (!e) continue;
    let v;
    try {
      v = call(st.orig.get, k);
    } catch {
      continue;
    }
    const n = sizeOf(k, v);
    e.bytes += n;
    e.props++;
    e.keys.push(k);
    if (n > e.big) {
      e.big = n;
      e.bigKey = k;
    }
  }
  if (st.packs.size === 1) for (const e of per.values()) e.bytes = total; // the exact count when the storage is this pack's alone
  return { per, total };
}

/** @param {string} id @param {object} msg */
function send(id, msg) {
  let s = JSON.stringify(msg);
  if (s.length > 2000) s = JSON.stringify({ ...msg, top: [], bigKey: "" });
  system.sendScriptEvent(id, s);
}

/** @param {State} st @param {string} rid @param {number | undefined} ticks */
function pongAll(st, rid, ticks) {
  const { per, total } = storage(st);
  for (const [rec, e] of per) {
    /** @type {Record<string, unknown>} */
    const msg = { id: rid, pack: rec.pack, name: rec.name.slice(0, 40), version: rec.version, bytes: e.bytes, props: e.props, big: e.big, bigKey: e.bigKey.slice(0, 80) };
    if (rec.forgotten) msg.forgotten = true;
    if (st.packs.size > 1) {
      msg.shared = st.packs.size;
      msg.total = total;
    }
    if (ticks !== undefined) {
      const top = [...rec.cbs.entries()].sort((a, b) => b[1].ms - a[1].ms || b[1].calls - a[1].calls).slice(0, 2);
      Object.assign(msg, {
        ticks,
        ms: rec.ms,
        calls: rec.calls,
        mpt: Math.round((rec.ms / Math.max(1, ticks)) * 1000) / 1000,
        top: top.map(([k, c]) => ({ k: k.slice(0, 120), ms: c.ms, n: c.calls })),
      });
    }
    send("realm:diag_pong", msg);
  }
}

/** @param {State} st */
function startWindow(st) {
  for (const rec of st.packs.values()) {
    rec.ms = 0;
    rec.calls = 0;
    rec.cbs.clear();
  }
  st.on = true;
  st.track = true;
}

/** @param {State} st */
function endWindow(st) {
  const win = st.win;
  if (!win) return;
  const left = win.end - system.currentTick;
  if (left > 0) return void st.orig.runTimeout.call(system, () => endWindow(st), left);
  st.win = null;
  st.on = false;
  st.track = st.multi;
  const ticks = Math.max(1, system.currentTick - win.start);
  for (const id of win.ids) pongAll(st, id, ticks);
}

/** @param {State} st @param {string} rid @param {unknown} pack @param {unknown} confirm */
function forget(st, rid, pack, confirm) {
  const rec = typeof pack === "string" ? st.packs.get(pack) : undefined;
  if (!rec) return; // another add-on's pack: it answers itself
  if (confirm !== `FORGET ${rec.pack}`) return void send("realm:diag_forgot", { id: rid, pack: rec.pack, ok: false, error: `not confirmed: confirm must be "FORGET ${rec.pack}"` });
  const e = storage(st).per.get(rec);
  const removed = e?.props ?? 0;
  const bytes = e?.bytes ?? 0;
  try {
    if (st.packs.size === 1) call(st.orig.clear);
    else for (const k of e?.keys ?? []) call(st.orig.set, k, undefined);
  } catch (err) {
    return void send("realm:diag_forgot", { id: rid, pack: rec.pack, ok: false, error: String(err).slice(0, 200) });
  }
  rec.forgotten = true;
  console.warn(`[diag] ${rec.pack}: forgot ${removed} saved world entries (${bytes} bytes). It saves nothing more until /reload or a restart.`);
  send("realm:diag_forgot", { id: rid, pack: rec.pack, ok: true, removed, bytes });
}

/** @param {State} st @param {string} id @param {string} message */
function handle(st, id, message) {
  /** @type {any} */
  let m;
  try {
    m = JSON.parse(message || "{}");
  } catch {
    m = {};
  }
  if (!m || typeof m !== "object") m = {};
  const rid = String(m.id ?? "").slice(0, 40);
  const prev = st.cur;
  st.cur = null; // reading every key for the totals must not claim them
  try {
    if (id === "realm:diag_forget") return forget(st, rid, m.pack, m.confirm);
    const n = Math.floor(Number(m.ticks));
    if (!(n > 0)) return pongAll(st, rid, undefined);
    const ticks = Math.min(MAX_TICKS, n);
    if (st.win) {
      st.win.end = Math.max(st.win.end, system.currentTick + ticks);
      st.win.ids.push(rid);
      return;
    }
    startWindow(st);
    st.win = { start: system.currentTick, end: system.currentTick + ticks, ids: [rid] };
    st.orig.runTimeout.call(system, () => endWindow(st), ticks);
  } finally {
    st.cur = prev;
  }
}
