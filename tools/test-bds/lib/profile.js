// BDS harness profiler (run.mjs --profile). Injected, in the run's temp copy only, after the shim
// and before the pack's own entry. It wraps the callbacks the pack hands to the game and times them:
//  - system.run / runTimeout / runInterval / runJob (each generator step),
//  - every world/system beforeEvents and afterEvents subscribe,
//  - custom command callbacks (CustomCommandRegistry.registerCommand),
// and counts world/entity/item setDynamicProperty writes (and their string size), setActionBar,
// setTitle and runCommand calls, and script events by id: sent by this pack (system.sendScriptEvent) and handled by its
// scriptEventReceive listeners (calls and ms per id; which events a tick's listener time goes to). Callbacks are identified by kind plus the pack's file:line where they were handed
// over (new Error().stack). The pack's behavior is unchanged: wrappers call the original with the
// same this/arguments and return its result; exceptions pass through.
// Bedrock scripting has no high-resolution clock (no performance.now), so times are Date.now()
// differences in ms: one call reads 0 or 1 ms, but the sum over many calls is an unbiased estimate
// (the start falls at a random point inside a millisecond). Time after an `await` inside an async
// callback is not attributed (it runs as a promise continuation, outside the wrapper).
// Reports go to the console as "PROFILE {json}" lines when run.mjs sends
// `scriptevent harness:profile_dump`; `harness:profile_reset` starts a new window.
import { world, system, System, World, Entity, ItemStack, ScreenDisplay, Dimension, CustomCommandRegistry } from "@minecraft/server";

const PACK = __PACK__;
const now = Date.now;

let startTick = system.currentTick;
let startWall = now();
let ticks = []; // ms per tick, index = tick - startTick
let curTick = -1, curMs = 0;
/** key -> { ms, calls, max } */
let cbs = new Map();
let counters = { dynWrites: 0, dynBytes: 0, dynWorld: 0, dynEntity: 0, dynItem: 0, actionBar: 0, titles: 0, commands: 0 };
/** script event id -> times this pack sent it */
let sent = new Map();
/** script event id -> { calls, ms } of this pack's scriptEventReceive listeners */
let handled = new Map();

function reset() {
  startTick = system.currentTick;
  startWall = now();
  ticks = [];
  curTick = -1; curMs = 0;
  cbs = new Map();
  counters = { dynWrites: 0, dynBytes: 0, dynWorld: 0, dynEntity: 0, dynItem: 0, actionBar: 0, titles: 0, commands: 0 };
  sent = new Map();
  handled = new Map();
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
}

/** "file:line" of the first stack frame outside the harness files (and the pack's scripts/diag.js, which wraps the same calls). */
function site() {
  const stack = String(new Error().stack || "").split("\n");
  for (const l of stack) {
    // diag.js: the pack's own diagnostics wrapper (it hands the game its wrapper through these patched calls)
    if (!l.trim() || l.includes("__harness_") || l.includes("diag.js") || /\(native\)\s*$/.test(l)) continue;
    const m = /\(([^()]*)\)\s*$/.exec(l) || /at (\S+)\s*$/.exec(l);
    if (m) return m[1];
  }
  return "?";
}

const wrapped = new WeakMap(); // original callback -> wrapper (for unsubscribe)

function timed(fn, key, byEvent = false) {
  if (typeof fn !== "function") return fn;
  const w = byEvent
    ? function (...a) {
        const s = now();
        try { return fn.apply(this, a); } finally {
          const ms = now() - s;
          record(key, ms);
          const id = String(a[0] && a[0].id);
          let h = handled.get(id);
          if (!h) handled.set(id, (h = { calls: 0, ms: 0 }));
          h.calls++; h.ms += ms;
        }
      }
    : function (...a) {
        const s = now();
        try { return fn.apply(this, a); } finally { record(key, now() - s); }
      };
  wrapped.set(fn, w);
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

function patchSystem() {
  const proto = System.prototype;
  const orig = { run: proto.run, runTimeout: proto.runTimeout, runInterval: proto.runInterval, runJob: proto.runJob };
  proto.run = function (cb) { return orig.run.call(this, timed(cb, label("run", cb))); };
  proto.runTimeout = function (cb, t) { return orig.runTimeout.call(this, timed(cb, label("runTimeout", cb)), t); };
  proto.runInterval = function (cb, t) { return orig.runInterval.call(this, timed(cb, label(`runInterval(${t ?? 1})`, cb)), t); };
  proto.runJob = function (gen) {
    const key = label("runJob", undefined);
    function* step() {
      while (true) {
        const s = now();
        let r;
        try { r = gen.next(); } finally { record(key, now() - s); }
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
    try {
      const byEvent = name === "scriptEventReceive";
      sig.subscribe = function (cb, ...rest) { return sub.call(this, timed(cb, label(`${prefix}.${name}`, cb), byEvent), ...rest); };
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
  });
  if (final) {
    // Per-tick ms for the whole-bundle per-tick total (run.mjs sums the packs tick by tick).
    const s = per.map((v) => (v ? String(v) : "")).join(",");
    const MAX = 1500;
    const parts = Math.max(1, Math.ceil(s.length / MAX));
    for (let i = 0; i < parts; i++) out("PROFILE_TICKS", { pack: PACK, startTick, i, n: parts, d: s.slice(i * MAX, (i + 1) * MAX) });
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
