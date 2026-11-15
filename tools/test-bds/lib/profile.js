// BDS harness profiler (run.mjs --profile). Injected, in the run's temp copy only, after the shim
// and before the pack's own entry. It wraps the callbacks the pack hands to the game and times them:
//  - system.run / runTimeout / runInterval / runJob (each generator step),
//  - every world/system beforeEvents and afterEvents subscribe,
//  - custom command callbacks (CustomCommandRegistry.registerCommand),
// and counts world/entity/item setDynamicProperty writes (and their string size), setActionBar,
// setTitle and runCommand calls, and script events by id: sent by this pack (system.sendScriptEvent) and handled by its
// scriptEventReceive listeners (calls and ms per id; which events a tick's listener time goes to). Callbacks are identified by kind plus the pack's file:line where they were handed
// over (new Error().stack). A `system.run` or `runTimeout` made inside a timed callback (most of them: deferring work
// to a later tick) takes its parent's file:line instead, with no stack capture: a capture costs tens of us and was
// charged to the pack that defers work (PIPE-08). `stacks` in each PROFILE row counts the captures. The pack's behavior is unchanged: wrappers call the original with the
// same this/arguments and return its result; exceptions pass through.
// Bedrock scripting has no high-resolution clock (no performance.now), so times are Date.now()
// differences in ms: one call reads 0 or 1 ms, but the sum over many calls is an unbiased estimate
// (the start falls at a random point inside a millisecond). Time after an `await` inside an async
// callback is not attributed (it runs as a promise continuation, outside the wrapper).
// Reports go to the console as "PROFILE {json}" lines when run.mjs sends
// `scriptevent harness:profile_dump`; `harness:profile_reset` starts a new window. The final dump also sends, in
// 1,500-character parts: PROFILE_TICKS (ms per tick), PROFILE_CALLBACKS (every callback that took any time, as a JSON
// list) and PROFILE_HEAVY (every single call of 1 ms or more as "tick:ms:index" into that list, for the worst ticks).
import { world, system, System, World, Entity, ItemStack, ScreenDisplay, Dimension, CustomCommandRegistry } from "@minecraft/server";

const PACK = __PACK__;
const now = Date.now;

let startTick = system.currentTick;
let startWall = now();
let ticks = []; // ms per tick, index = tick - startTick
let curTick = -1, curMs = 0;
/** key -> { ms, calls, max } */
let cbs = new Map();
let counters = { dynWrites: 0, dynBytes: 0, dynWorld: 0, dynEntity: 0, dynItem: 0, actionBar: 0, titles: 0, commands: 0, stacks: 0 };
/** The key of the timed callback running now (null outside one): a deferred call made inside it takes its site. */
let current = null;
/** key -> its "file:line" part, so a deferred label costs no string search after the first. */
const siteOfKey = new Map();
/** script event id -> times this pack sent it */
let sent = new Map();
/** script event id -> { calls, ms } of this pack's scriptEventReceive listeners */
let handled = new Map();
/** Single calls of 1 ms or more: [tick, key, ms] (the host joins them to its worst ticks). */
let heavy = [];
const HEAVY_MAX = 100000;
let heavyDropped = 0;

function reset() {
  startTick = system.currentTick;
  startWall = now();
  ticks = [];
  curTick = -1; curMs = 0;
  cbs = new Map();
  counters = { dynWrites: 0, dynBytes: 0, dynWorld: 0, dynEntity: 0, dynItem: 0, actionBar: 0, titles: 0, commands: 0, stacks: 0 };
  sent = new Map();
  handled = new Map();
  heavy = [];
  heavyDropped = 0;
}

function flushTick() {
  if (curTick >= startTick) ticks[curTick - startTick] = (ticks[curTick - startTick] || 0) + curMs;
}

function record(key, ms) {
  const tick = system.currentTick;
  if (tick !== curTick) { flushTick(); curTick = tick; curMs = 0; }
  curMs += ms;
  let c = cbs.get(key);
  if (!c) cbs.set(key, (c = { ms: 0, calls: 0, max: 0 }));
  c.ms += ms; c.calls++;
  if (ms > c.max) c.max = ms;
  if (ms >= 1) { if (heavy.length < HEAVY_MAX) heavy.push([tick, key, ms]); else heavyDropped++; }
}

/** "file:line" of the first stack frame outside the harness files (and the pack's scripts/diag-core.js and diag.js, which wrap the same calls, and the bundle's shared folder). */
function site() {
  counters.stacks++;
  const stack = String(new Error().stack || "").split("\n");
  for (const l of stack) {
    // diag.js: the pack's own diagnostics wrapper (it hands the game its wrapper through these patched calls)
    if (!l.trim() || l.includes("__harness_") || l.includes("diag-core.js") || /(^|[\s(/\\])diag\.js:/.test(l) || /(^|[\s(/\\])_shared[/\\]/.test(l) || /\(native\)\s*$/.test(l)) continue;
    const m = /\(([^()]*)\)\s*$/.exec(l) || /at (\S+)\s*$/.exec(l);
    if (m) return m[1];
  }
  return "?";
}

function timed(fn, key, byEvent = false) {
  if (typeof fn !== "function") return fn;
  const w = byEvent
    ? function (...a) {
        const prev = current;
        current = key;
        const s = now();
        try { return fn.apply(this, a); } finally {
          const ms = now() - s;
          current = prev;
          record(key, ms);
          const id = String(a[0] && a[0].id);
          let h = handled.get(id);
          if (!h) handled.set(id, (h = { calls: 0, ms: 0 }));
          h.calls++; h.ms += ms;
        }
      }
    : function (...a) {
        const prev = current;
        current = key;
        const s = now();
        try { return fn.apply(this, a); } finally { const ms = now() - s; current = prev; record(key, ms); }
      };
  return w;
}

// A pack's scripts/diag.js wraps callbacks before they get here: it records its wrapper -> the pack's own
// function while this flag is set, so labels keep the pack's function name.
/** @type {any} */ (globalThis).__harnessProfile = true;
const inner = (fn) => (fn && globalThis.__realmDiagInner?.get(fn)) || fn;

function label(kind, fn) {
  fn = inner(fn);
  const name = fn && fn.name && fn.name !== "anonymous" ? " " + fn.name : "";
  return `${kind}${name} @ ${site()}`;
}

/** A label for run / runTimeout: inside a timed callback, its parent's site (no stack capture); outside one, label(). */
function deferredLabel(kind, fn) {
  if (current === null) return label(kind, fn);
  let at = siteOfKey.get(current);
  if (at === undefined) siteOfKey.set(current, (at = current.slice(current.lastIndexOf(" @ ") + 3)));
  fn = inner(fn);
  const name = fn && fn.name && fn.name !== "anonymous" ? " " + fn.name : "";
  return `${kind}${name} @ ${at}`;
}

function patchSystem() {
  const proto = System.prototype;
  const orig = { run: proto.run, runTimeout: proto.runTimeout, runInterval: proto.runInterval, runJob: proto.runJob };
  proto.run = function (cb) { return orig.run.call(this, timed(cb, deferredLabel("run", cb))); };
  proto.runTimeout = function (cb, t) { return orig.runTimeout.call(this, timed(cb, deferredLabel("runTimeout", cb)), t); };
  proto.runInterval = function (cb, t) { return orig.runInterval.call(this, timed(cb, label(`runInterval(${t ?? 1})`, cb)), t); };
  proto.runJob = function (gen) {
    const key = label("runJob", undefined);
    function* step() {
      while (true) {
        const prev = current;
        current = key;
        const s = now();
        let r;
        try { r = gen.next(); } finally { const ms = now() - s; current = prev; record(key, ms); }
        if (r.done) return r.value;
        yield r.value;
      }
    }
    return orig.runJob.call(this, gen && typeof gen.next === "function" ? step() : gen);
  };
}

function patchSignals(owner, prefix) {
  if (!owner) return;
  const proto = Object.getPrototypeOf(owner);
  const names = new Set([...Object.getOwnPropertyNames(proto), ...Object.getOwnPropertyNames(owner)]);
  for (const name of names) {
    if (name === "constructor") continue;
    let sig;
    try { sig = owner[name]; } catch (e) { continue; }
    if (!sig || typeof sig.subscribe !== "function") continue;
    const sub = sig.subscribe, unsub = sig.unsubscribe;
    // This signal's own map of original callback -> wrapper: with one map for every signal, a function subscribed to
    // two signals kept only its newest wrapper and could not be unsubscribed from the first.
    const wrapped = new WeakMap();
    try {
      const byEvent = name === "scriptEventReceive";
      sig.subscribe = function (cb, ...rest) {
        const w = timed(cb, label(`${prefix}.${name}`, cb), byEvent);
        if (typeof cb === "function") wrapped.set(cb, w);
        return sub.call(this, w, ...rest);
      };
      if (typeof unsub === "function") sig.unsubscribe = function (cb, ...rest) { return unsub.call(this, (cb && wrapped.get(cb)) || cb, ...rest); };
    } catch (e) { console.warn(`[harness-profile] could not wrap ${prefix}.${name}: ${e}`); }
  }
}

function patchCommands() {
  const proto = CustomCommandRegistry && CustomCommandRegistry.prototype;
  if (!proto || typeof proto.registerCommand !== "function") return;
  const orig = proto.registerCommand;
  proto.registerCommand = function (def, cb) { return orig.call(this, def, timed(cb, `command ${def && def.name} @ ${site()}`)); };
}

function count(proto, method, fn) {
  const orig = proto && proto[method];
  if (typeof orig !== "function") return;
  proto[method] = function (...a) { fn(a); return orig.apply(this, a); };
}

function patchCounters() {
  const dyn = (where) => (a) => {
    counters.dynWrites++; counters[where]++;
    const v = a[1];
    counters.dynBytes += String(a[0] ?? "").length + (typeof v === "string" ? v.length : v === undefined ? 0 : 8);
  };
  count(World.prototype, "setDynamicProperty", dyn("dynWorld"));
  count(Entity.prototype, "setDynamicProperty", dyn("dynEntity"));
  if (ItemStack) count(ItemStack.prototype, "setDynamicProperty", dyn("dynItem"));
  if (ScreenDisplay) count(ScreenDisplay.prototype, "setActionBar", () => counters.actionBar++);
  if (ScreenDisplay) count(ScreenDisplay.prototype, "setTitle", () => counters.titles++);
  count(Entity.prototype, "runCommand", () => counters.commands++);
  if (Dimension) count(Dimension.prototype, "runCommand", () => counters.commands++);
  count(System.prototype, "sendScriptEvent", (a) => {
    const id = String(a[0]);
    sent.set(id, (sent.get(id) || 0) + 1);
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function out(type, obj) { console.warn(type + " " + JSON.stringify(obj)); }

const PART = 1500;
/** A long string as console-sized parts { pack, startTick, i, n, d }. */
function parts(s) {
  const n = Math.max(1, Math.ceil(s.length / PART));
  const L = [];
  for (let i = 0; i < n; i++) L.push({ pack: PACK, startTick, i, n, d: s.slice(i * PART, (i + 1) * PART) });
  return L;
}

function dump(final) {
  flushTick(); curTick = -1; curMs = 0;
  const end = system.currentTick;
  const n = Math.max(1, end - startTick);
  const per = [];
  for (let i = 0; i < n; i++) per.push(ticks[i] || 0);
  const sorted = [...per].sort((a, b) => a - b);
  let total = 0, calls = 0;
  for (const v of per) total += v;
  const list = [...cbs.entries()].map(([key, c]) => ({ key, ms: c.ms, calls: c.calls, max: c.max }));
  for (const c of list) calls += c.calls;
  list.sort((a, b) => b.ms - a.ms || b.calls - a.calls);
  let chunks = null;
  if (final) {
    // Per-tick ms for the whole-bundle per-tick total (run.mjs sums the packs tick by tick).
    const tickParts = parts(per.map((v) => (v ? String(v) : "")).join(","));
    const timedList = list.filter((c) => c.ms > 0 || c.max > 0);
    const index = new Map(timedList.map((c, i) => [c.key, i]));
    const cbParts = parts(JSON.stringify(timedList.map((c) => ({ key: c.key.slice(0, 160), ms: c.ms, calls: c.calls, max: c.max }))));
    const heavyParts = parts(heavy.filter((h) => h[0] >= startTick && index.has(h[1])).map((h) => `${h[0]}:${h[2]}:${index.get(h[1])}`).join(","));
    chunks = { tickParts, cbParts, heavyParts };
  }
  out("PROFILE", {
    pack: PACK, final, startTick, endTick: end, ticks: n, wallMs: now() - startWall,
    totalMs: total, msPerTick: total / n, p95TickMs: percentile(sorted, 0.95), p99TickMs: percentile(sorted, 0.99), maxTickMs: sorted[sorted.length - 1] || 0,
    calls, callsPerTick: calls / n, callbacks: list.length,
    ...counters,
    top: list.slice(0, 5).map((c) => ({ key: c.key.slice(0, 160), ms: c.ms, calls: c.calls, max: c.max })),
    // The longest single calls (hitches: a runJob step, a big fill), whatever their total.
    slowest: [...list].sort((a, b) => b.max - a.max || b.ms - a.ms).slice(0, 5).map((c) => ({ key: c.key.slice(0, 160), max: c.max, ms: c.ms, calls: c.calls })),
    scriptEventsSent: Object.fromEntries(sent),
    scriptEventsHandled: Object.fromEntries([...handled].map(([id, h]) => [id, { calls: h.calls, ms: h.ms }])),
    // How many parts of each kind follow, so the host knows when the final dump has fully arrived.
    ...(chunks ? { parts: { ticks: chunks.tickParts.length, callbacks: chunks.cbParts.length, heavy: chunks.heavyParts.length }, heavyCalls: heavy.length, heavyDropped } : {}),
  });
  if (chunks) {
    for (const p of chunks.tickParts) out("PROFILE_TICKS", p);
    for (const p of chunks.cbParts) out("PROFILE_CALLBACKS", p);
    for (const p of chunks.heavyParts) out("PROFILE_HEAVY", p);
  }
}

// The profiler's own listener is subscribed before the signals are wrapped, so it is never timed.
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "harness:profile_reset") reset();
  else if (ev.id === "harness:profile_dump") {
    let final = false;
    try { final = !!JSON.parse(ev.message || "{}").final; } catch (e) { /* ignore */ }
    dump(final);
  }
}, { namespaces: ["harness"] });

try {
  patchSystem();
  patchSignals(world.beforeEvents, "world.before");
  patchSignals(world.afterEvents, "world.after");
  patchSignals(system.beforeEvents, "system.before");
  patchSignals(system.afterEvents, "system.after");
  patchCommands();
  patchCounters();
} catch (e) {
  console.warn(`[harness-profile] ${PACK}: could not install: ${e}`);
}
