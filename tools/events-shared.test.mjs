// One native scriptEventReceive listener per behavior pack (O54). Three layers:
// 1. tools/events-shared.js (scripts/script-events.js in every pack) with a fake server: dispatch by id, registration order,
//    error isolation and reporting, unsubscribe, one native subscription;
// 2. every pack's source: no direct subscriptions left, the shared copy everywhere, each registration lists every id
//    its handler compares, every pack still answers /realm:help;
// 3. two packs and their diag.js in one script context (the Realm Bundle): the diagnostics protocol still rides the
//    first realm: listener and a pack's script event time is attributed to that pack, also for a late registration.
// The real server (one context, 67 packs) is tools/test-bds/examples/script-events-dispatch.js.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const SHARED = join(root, "tools", "events-shared.js");
const walk = (/** @type {string} */ dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const relPath = (/** @type {string} */ f) => relative(root, f).split(sep).join("/");
const packs = readdirSync(join(root, "packs")).filter((f) => existsSync(join(root, "packs", f, "scripts", "main.js"))).sort();

// ---------------------------------------------------------------------------
// A fake server
// ---------------------------------------------------------------------------

function fakeServer() {
  let tick = 0;
  /** @type {{ at: number, fn: Function, every?: number }[]} */
  let queue = [];
  const natives = {
    /** @type {{ cb: Function, options: any }[]} */
    subs: [],
    subscribed: 0,
    unsubscribed: 0,
    subscribe(/** @type {Function} */ cb, /** @type {any} */ options) {
      natives.subs.push({ cb, options });
      natives.subscribed++;
      return cb;
    },
    unsubscribe(/** @type {Function} */ cb) {
      const i = natives.subs.findIndex((s) => s.cb === cb);
      if (i >= 0) natives.subs.splice(i, 1);
      natives.unsubscribed++;
    },
  };
  const sent = [];
  /** Delivers like the game: only listeners whose namespaces option admits the id. */
  const deliver = (/** @type {string} */ id, /** @type {string} */ message = "", /** @type {any} */ extra = {}) => {
    for (const { cb, options } of [...natives.subs]) {
      const ns = id.slice(0, id.indexOf(":"));
      if (options?.namespaces && !options.namespaces.includes(ns)) continue;
      cb({ id, message, ...extra });
    }
  };
  class System {
    get currentTick() { return tick; }
    run(fn) { queue.push({ at: tick + 1, fn }); return 1; }
    runTimeout(fn, t = 1) { queue.push({ at: tick + Math.max(1, t), fn }); return 1; }
    runInterval(fn, t = 1) { queue.push({ at: tick + t, fn, every: t }); return 1; }
    runJob(gen) { queue.push({ at: tick + 1, fn: () => { for (const _ of gen); } }); return 1; }
    sendScriptEvent(id, message) {
      sent.push({ id, message });
      queue.push({ at: tick + 1, fn: () => deliver(id, message) });
    }
  }
  class World {
    constructor() { this.props = new Map(); }
    getDynamicProperty(k) { return this.props.get(k); }
    setDynamicProperty(k, v) { if (v === undefined) this.props.delete(k); else this.props.set(k, v); }
    getDynamicPropertyIds() { return [...this.props.keys()]; }
    getDynamicPropertyTotalByteCount() { let n = 0; for (const [k, v] of this.props) n += k.length + String(v).length; return n; }
    clearDynamicProperties() { this.props.clear(); }
  }
  class CustomCommandRegistry { registerCommand(def, cb) { this.cb = cb; } }
  const system = new System();
  const startup = { subscribe(cb) { return cb; }, unsubscribe() {} };
  system.afterEvents = { scriptEventReceive: natives };
  system.beforeEvents = { startup };
  const world = new World();
  world.afterEvents = {};
  world.beforeEvents = {};
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++;
      const due = queue.filter((q) => q.at <= tick);
      queue = queue.filter((q) => q.at > tick);
      for (const q of due) {
        q.fn();
        if (q.every) queue.push({ ...q, at: tick + q.every });
      }
    }
  };
  return { System, World, CustomCommandRegistry, system, world, step, sent, natives, deliver };
}

/** A copy of tools/events-shared.js at its own path (one module instance per pack, like a bundle). @param {string} dir @param {string} pack */
async function loadRouter(dir, pack) {
  const src = readFileSync(SHARED, "utf8").replace(/^import .* from "@minecraft\/server";$/m, "const { system } = globalThis.__mcFake;");
  mkdirSync(join(dir, pack), { recursive: true });
  const file = join(dir, pack, "script-events.js");
  writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

/** Loads diag-shared.js as one pack's diag.js. */
async function loadDiag(dir, pack) {
  const src = readFileSync(join(root, "tools", "diag-shared.js"), "utf8")
    .replace(/^import .* from "@minecraft\/server";$/m, "const { CustomCommandRegistry, System, World, system, world } = globalThis.__mcFake;")
    .replace('const PACK = "__PACK__";', `const PACK = ${JSON.stringify(pack)};`)
    .replace('const VERSION = "__VERSION__";', 'const VERSION = "1.0.0";')
    .replace('const NAME = "__NAME__";', `const NAME = ${JSON.stringify(pack.toUpperCase())};`);
  mkdirSync(join(dir, pack), { recursive: true });
  const file = join(dir, pack, "diag.js");
  writeFileSync(file, src);
  await import(pathToFileURL(file).href);
}

let fresh = 0;
async function router() {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  const dir = mkdtempSync(join(tmpdir(), "events-"));
  const api = await loadRouter(dir, `p${fresh++}_bp`);
  return { mc, ...api };
}

// ---------------------------------------------------------------------------
// 1. The router
// ---------------------------------------------------------------------------

test("any number of handlers share one native subscription for the realm namespace", async () => {
  const { mc, onScriptEvent } = await router();
  assert.equal(mc.natives.subs.length, 0, "nothing subscribed until a handler registers");
  for (let i = 0; i < 12; i++) onScriptEvent(`realm:e${i}`, () => {});
  onScriptEvent(["realm:a", "realm:b"], () => {});
  onScriptEvent("*", () => {});
  assert.equal(mc.natives.subs.length, 1);
  assert.equal(mc.natives.subscribed, 1);
  assert.deepEqual(mc.natives.subs[0].options, { namespaces: ["realm"] });
});

test("an event reaches the handlers of its id and the wildcards, in registration order", async () => {
  const { mc, onScriptEvent } = await router();
  const log = [];
  onScriptEvent("realm:a", () => log.push("a1"));
  onScriptEvent("*", () => log.push("any1"));
  onScriptEvent(["realm:a", "realm:b"], () => log.push("ab"));
  onScriptEvent("realm:b", () => log.push("b"));
  onScriptEvent("*", () => log.push("any2"));
  onScriptEvent("realm:a", () => log.push("a2"));
  mc.deliver("realm:a", "m");
  assert.deepEqual(log.splice(0), ["a1", "any1", "ab", "any2", "a2"]);
  mc.deliver("realm:b");
  assert.deepEqual(log.splice(0), ["any1", "ab", "b", "any2"]);
  mc.deliver("realm:nobody");
  assert.deepEqual(log.splice(0), ["any1", "any2"]);
  mc.deliver("other:a");
  assert.deepEqual(log, [], "the native listener only asks for realm: events");
});

test("handlers get the whole event, source fields included", async () => {
  const { mc, onScriptEvent } = await router();
  let seen;
  onScriptEvent("realm:x_test", (event) => {
    seen = event;
  });
  mc.deliver("realm:x_test", "{}", { sourceType: "Server", sourceEntity: undefined });
  assert.equal(seen.id, "realm:x_test");
  assert.equal(seen.message, "{}");
  assert.equal(seen.sourceType, "Server");
});

test("a throwing handler does not stop the others; its error is rethrown after every handler ran", async () => {
  const { mc, onScriptEvent } = await router();
  const log = [];
  onScriptEvent("realm:a", () => log.push("first"));
  onScriptEvent("realm:a", () => {
    throw new Error("boom one");
  });
  onScriptEvent("*", () => log.push("wild"));
  onScriptEvent("realm:a", () => {
    throw new Error("boom two");
  });
  onScriptEvent("realm:a", () => log.push("last"));
  const errors = [];
  const original = console.error;
  console.error = (/** @type {string} */ line) => errors.push(line);
  try {
    assert.throws(() => mc.deliver("realm:a"), /boom one/);
  } finally {
    console.error = original;
  }
  assert.deepEqual(log, ["first", "wild", "last"], "the handlers after the throwing ones still ran");
  assert.equal(errors.length, 1, "the second error is logged, not lost");
  assert.match(errors[0], /realm:a.*boom two/);
});

test("offScriptEvent removes a handler from every id; the last one unsubscribes and a new one subscribes again", async () => {
  const { mc, onScriptEvent, offScriptEvent } = await router();
  const log = [];
  const both = onScriptEvent(["realm:a", "realm:b"], () => log.push("both"));
  const wild = onScriptEvent("*", () => log.push("wild"));
  assert.equal(offScriptEvent(both), true);
  assert.equal(offScriptEvent(both), false, "already gone");
  mc.deliver("realm:a");
  mc.deliver("realm:b");
  assert.deepEqual(log.splice(0), ["wild", "wild"]);
  assert.equal(mc.natives.subs.length, 1, "a wildcard keeps the listener");
  assert.equal(offScriptEvent(wild), true);
  assert.equal(mc.natives.subs.length, 0, "no handler left: the native listener is dropped");
  assert.equal(mc.natives.unsubscribed, 1);
  onScriptEvent("realm:a", () => log.push("again"));
  assert.equal(mc.natives.subs.length, 1);
  assert.equal(mc.natives.subscribed, 2);
  mc.deliver("realm:a");
  assert.deepEqual(log, ["again"]);
});

test("handlers can register and unregister while an event is being delivered", async () => {
  const { mc, onScriptEvent, offScriptEvent } = await router();
  const log = [];
  /** @type {any} */
  let late;
  const victim = () => log.push("victim");
  onScriptEvent("realm:a", () => {
    log.push("first");
    offScriptEvent(victim);
    late = onScriptEvent("realm:a", () => log.push("late"));
  });
  onScriptEvent("realm:a", victim);
  onScriptEvent("realm:a", () => log.push("third"));
  mc.deliver("realm:a");
  assert.deepEqual(log.splice(0), ["first", "victim", "third"], "this event still sees the handlers it started with");
  mc.deliver("realm:a");
  assert.deepEqual(log, ["first", "third", "late"], "the next one sees the change");
  assert.equal(typeof late, "function");
});

test("registering the same handler for several ids calls it once per event", async () => {
  const { mc, onScriptEvent } = await router();
  let n = 0;
  onScriptEvent(["realm:a", "realm:b", "realm:a"], () => n++);
  mc.deliver("realm:a");
  mc.deliver("realm:b");
  assert.equal(n, 2);
});

test("ids outside the realm: namespace, empty lists and non-functions are refused when they register", async () => {
  const { mc, onScriptEvent } = await router();
  assert.throws(() => onScriptEvent("harness:x", () => {}), TypeError);
  assert.throws(() => onScriptEvent("realm:", () => {}), TypeError);
  assert.throws(() => onScriptEvent("realm", () => {}), TypeError);
  assert.throws(() => onScriptEvent([], () => {}), TypeError);
  assert.throws(() => onScriptEvent("realm:a", /** @type {any} */ (null)), TypeError);
  assert.equal(mc.natives.subs.length, 0, "a refused registration subscribes nothing");
});

test("the shared file sends no script events and imports nothing but the server module", () => {
  const src = readFileSync(SHARED, "utf8");
  assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ""), /sendScriptEvent/);
  assert.deepEqual([...src.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]), ["@minecraft/server"]);
});

// ---------------------------------------------------------------------------
// 2. Every pack
// ---------------------------------------------------------------------------

/** The text of a call's arguments from its "(" (strings, comments and brackets skipped); -1 when it doesn't close. @param {string} src @param {number} open */
function closeOf(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2) + 1;
    } else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c) && --depth === 0) return i;
  }
  return -1;
}

/** Top-level arguments. @param {string} text */
function splitArgs(text) {
  /** @type {string[]} */
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.filter((s) => s.trim());
}

/** Every onScriptEvent(...) call in a source file: its ids text, its handler text and its line. @param {string} src */
function registrations(src) {
  /** @type {{ ids: string, handler: string, line: number }[]} */
  const out = [];
  for (const m of src.matchAll(/(?<![\w$.])onScriptEvent\s*\(/g)) {
    const open = /** @type {number} */ (m.index) + m[0].length - 1;
    const close = closeOf(src, open);
    if (close < 0) continue;
    const [ids = "", handler = ""] = splitArgs(src.slice(open + 1, close));
    const before = src.slice(Math.max(0, /** @type {number} */ (m.index) - 20), m.index);
    if (/(?:function|export)\s*$/.test(before)) continue;
    out.push({ ids: ids.trim(), handler: handler.trim(), line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

const scriptFiles = packs.flatMap((folder) => walk(join(root, "packs", folder, "scripts")).filter((f) => f.endsWith(".js")).map((file) => ({ folder, file, name: relPath(file) })));

test("no pack subscribes to scriptEventReceive itself outside its shared script-events.js and diag.js", () => {
  const direct = scriptFiles
    .filter(({ file }) => !/\/scripts\/(script-events|diag)\.js$/.test(file.split(sep).join("/")))
    .filter(({ file }) => /scriptEventReceive\s*\.\s*subscribe\s*\(/.test(readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1")))
    .map(({ name }) => name);
  assert.deepEqual(direct, [], `${direct.length} files still hold their own native listener`);
});

test("every behavior pack has a script-events.js identical to tools/events-shared.js", () => {
  const shared = readFileSync(SHARED, "utf8");
  const stale = packs.filter((folder) => !existsSync(join(root, "packs", folder, "scripts", "script-events.js")) || readFileSync(join(root, "packs", folder, "scripts", "script-events.js"), "utf8") !== shared);
  assert.deepEqual(stale, []);
  assert.ok(packs.length >= 60, `${packs.length} behavior packs found`);
});

test("only the admin setup waiter registers for every realm: event; everything else registers its ids", () => {
  const wild = [];
  let total = 0;
  for (const { file, name } of scriptFiles) {
    if (/\/scripts\/script-events\.js$/.test(name)) continue;
    for (const r of registrations(readFileSync(file, "utf8"))) {
      total++;
      if (/"\*"/.test(r.ids)) wild.push(`${name}:${r.line}`);
    }
  }
  assert.ok(total >= 200, `${total} registrations found (a pack's help responder, settings, zones, side and its own handlers)`);
  assert.equal(wild.length, 1, wild.join(", "));
  assert.match(wild[0], /^packs\/admin_bp\/scripts\/setup\.js:\d+$/);
});

test("every registration lists each id its handler compares, so none is silently dropped", () => {
  const problems = [];
  for (const { file, name } of scriptFiles) {
    if (/\/scripts\/script-events\.js$/.test(name)) continue;
    for (const r of registrations(readFileSync(file, "utf8"))) {
      if (/"\*"/.test(r.ids)) continue;
      const listed = new Set([...r.ids.matchAll(/"(realm:[a-z0-9_]+)"/g)].map((m) => m[1]));
      const spread = /\.\.\.\s*([A-Z_]+)/.exec(r.ids)?.[1];
      const compared = [...r.handler.matchAll(/(?<![\w$.])(?:id|ev\.id|event\.id|e\.id)\s*[!=]==\s*"(realm:[a-z0-9_]+)"/g)].map((m) => m[1]);
      for (const id of compared) if (!listed.has(id) && !spread) problems.push(`${name}:${r.line}: the handler compares ${id} but the registration doesn't list it`);
      if (!listed.size && !spread) problems.push(`${name}:${r.line}: no ids`);
    }
  }
  assert.deepEqual(problems, []);
});

test("every pack's main.js answers /realm:help through the router with its own folder name", () => {
  const problems = [];
  for (const folder of packs) {
    const src = readFileSync(join(root, "packs", folder, "scripts", "main.js"), "utf8");
    const helps = registrations(src).filter((r) => /"realm:help_ping"/.test(r.ids));
    if (helps.length !== 1) problems.push(`${folder}: ${helps.length} help_ping registrations in main.js`);
    else if (!helps[0].handler.includes(`"realm:help_pong", "${folder}"`) && folder !== "help_bp" && folder !== "admin_bp") problems.push(`${folder}: its help responder doesn't reply with its folder name`);
    if (!/import \{[^}]*\bonScriptEvent\b[^}]*\} from "\.\/script-events\.js";/.test(src)) problems.push(`${folder}: main.js doesn't import onScriptEvent from ./script-events.js`);
    const lines = src.split("\n");
    const firstImport = lines.findIndex((l) => l.startsWith("import "));
    if (lines[firstImport] !== 'import "./diag.js";') problems.push(`${folder}: ./diag.js must stay the first import`);
  }
  assert.deepEqual(problems, []);
});

test("console and test hooks that check the event source are registered by id, never for every event", () => {
  const hooks = [];
  for (const { file, name } of scriptFiles) {
    for (const r of registrations(readFileSync(file, "utf8"))) if (/ScriptEventSource\.Server/.test(r.handler)) hooks.push(`${name}: ${r.ids}`);
  }
  assert.ok(hooks.length >= 10, `${hooks.length} console hooks found`);
  assert.deepEqual(hooks.filter((h) => /"\*"/.test(h) || !/"realm:[a-z0-9_]+"/.test(h)), []);
  assert.ok(hooks.some((h) => /realm:storm_test/.test(h)) && hooks.some((h) => /realm:maps_test/.test(h)), "the hooks the BDS scenarios send to are still there");
});

// ---------------------------------------------------------------------------
// 3. Two packs and diag.js in one context
// ---------------------------------------------------------------------------

const pongs = (/** @type {any} */ mc, id = "realm:diag_pong") => mc.sent.filter((s) => s.id === id).map((s) => JSON.parse(s.message));

test("in one script context each pack keeps one listener, diag's protocol rides the first and callbacks stay attributed", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "events-bundle-"));
  const { system } = mc;

  await loadDiag(dir, "a_bp");
  const a = await loadRouter(dir, "a_bp");
  const aSeen = [];
  a.onScriptEvent("realm:help_ping", () => system.sendScriptEvent("realm:help_pong", "a_bp"));
  a.onScriptEvent("realm:a_only", ({ message }) => aSeen.push(message));
  a.onScriptEvent(["realm:shared_x", "realm:shared_y"], ({ id }) => aSeen.push(id));

  await loadDiag(dir, "b_bp");
  const b = await loadRouter(dir, "b_bp");
  const bSeen = [];
  b.onScriptEvent("realm:help_ping", () => system.sendScriptEvent("realm:help_pong", "b_bp"));
  b.onScriptEvent("realm:shared_x", () => {
    const until = Date.now() + 4;
    while (Date.now() < until); // a busy handler: a few ms of b's time
    bSeen.push("x");
  });

  mc.step(1); // module evaluation is over
  assert.equal(mc.natives.subs.length, 2, "one native listener per pack and none of diag's own: the first pack's carries the protocol");

  system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "q1" }));
  system.sendScriptEvent("realm:help_ping", "");
  mc.step(2);
  assert.deepEqual(pongs(mc).filter((p) => p.id === "q1").map((p) => p.pack).sort(), ["a_bp", "b_bp"], "every pack answers the diagnostics ping");
  assert.deepEqual(mc.sent.filter((s) => s.id === "realm:help_pong").map((s) => s.message).sort(), ["a_bp", "b_bp"], "and /realm:help");

  system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "q2", ticks: 6 }));
  mc.step(1);
  for (let i = 0; i < 5; i++) {
    system.sendScriptEvent("realm:shared_x", "");
    mc.step(1);
  }
  mc.step(4);
  const prof = pongs(mc).filter((p) => p.id === "q2");
  assert.equal(prof.length, 2);
  const pa = prof.find((p) => p.pack === "a_bp");
  const pb = prof.find((p) => p.pack === "b_bp");
  assert.ok(pb.ms >= 15, `b's busy handler is b's time (${pb.ms} ms)`);
  assert.ok(pa.ms < pb.ms, "and not a's");
  assert.ok(pa.calls >= 5 && pb.calls >= 5, "each pack's one listener ran once per event");
  assert.equal(pb.top[0].k.startsWith("system.after.scriptEventReceive scriptEvents @"), true, pb.top[0].k);
  assert.match(pb.top[0].k, /b_bp/, "the label names the pack's own file");
  assert.equal(bSeen.length, 5);
  assert.equal(aSeen.filter((x) => x === "realm:shared_x").length, 5);
});

test("a handler registered from a continuation after startup is still attributed to its pack", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "events-late-"));
  const { system } = mc;
  await loadDiag(dir, "a_bp");
  const a = await loadRouter(dir, "a_bp");
  a.onScriptEvent("realm:help_ping", () => {});
  await loadDiag(dir, "b_bp");
  const b = await loadRouter(dir, "b_bp"); // b registers nothing while its modules load
  mc.step(2);
  await Promise.resolve();
  b.onScriptEvent("realm:late", () => {
    const until = Date.now() + 4;
    while (Date.now() < until);
  });
  system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "w", ticks: 5 }));
  mc.step(1);
  for (let i = 0; i < 4; i++) {
    system.sendScriptEvent("realm:late", "");
    mc.step(1);
  }
  mc.step(3);
  const prof = pongs(mc).filter((p) => p.id === "w");
  assert.ok(prof.find((p) => p.pack === "b_bp").ms >= 12, JSON.stringify(prof));
  assert.ok(prof.find((p) => p.pack === "a_bp").ms < 4, "the late registration is b's, not the pack evaluated last or none");
});

test("dropping a pack's last handler hands the diagnostics protocol back to diag.js, and a new handler takes it again", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "events-carrier-"));
  const { system } = mc;
  await loadDiag(dir, "solo_bp");
  const solo = await loadRouter(dir, "solo_bp");
  const handler = solo.onScriptEvent("realm:x", () => {});
  mc.step(1);
  assert.equal(mc.natives.subs.length, 1);
  solo.offScriptEvent(handler);
  assert.equal(mc.natives.subs.length, 1, "diag.js listens itself now");
  system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "z" }));
  mc.step(2);
  assert.equal(pongs(mc).filter((p) => p.id === "z").length, 1);
  solo.onScriptEvent("realm:x", () => {});
  assert.equal(mc.natives.subs.length, 1, "the router's listener carries the protocol again and diag's own is gone");
  system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "z2" }));
  mc.step(2);
  assert.equal(pongs(mc).filter((p) => p.id === "z2").length, 1);
});

// ---------------------------------------------------------------------------
// 4. Every real pack, run
// ---------------------------------------------------------------------------

/** Anything else the game offers: callable, constructible, every property another one of itself. */
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => /** @type {any} */ (anything),
  has: () => false,
});

/** A game for one pack: signals that record their subscribers, the script event bus and saved data. */
function wholeGame() {
  /** @type {Map<string, any[]>} */
  const subs = new Map();
  const signal = (/** @type {string} */ key) => ({
    subscribe(/** @type {Function} */ cb, /** @type {any} */ options) {
      if (!subs.has(key)) subs.set(key, []);
      /** @type {any[]} */ (subs.get(key)).push(Object.assign(cb, { options }));
      return cb;
    },
    unsubscribe(/** @type {Function} */ cb) {
      const list = subs.get(key) ?? [];
      if (list.includes(cb)) list.splice(list.indexOf(cb), 1);
    },
  });
  const group = (/** @type {string} */ prefix) => new Proxy({}, { get: (target, name) => /** @type {any} */ (target)[name] ?? (/** @type {any} */ (target)[name] = signal(`${prefix}.${String(name)}`)) });
  const props = new Map();
  /** @type {{ id: string, message: string }[]} */
  const sent = [];
  /** @type {{ at: number, fn: Function }[]} */
  let timers = [];
  let tick = 0;
  const open = (/** @type {object} */ base) => new Proxy(base, { get: (target, key) => (key in target ? /** @type {any} */ (target)[key] : anything) });
  const system = open({
    get currentTick() {
      return tick;
    },
    run: (/** @type {Function} */ fn) => timers.push({ at: tick + 1, fn }),
    runTimeout: (/** @type {Function} */ fn, /** @type {number} */ t = 1) => timers.push({ at: tick + Math.max(1, t), fn }),
    runInterval: () => 1,
    runJob: () => 1,
    clearRun: () => {},
    waitTicks: () => Promise.resolve(),
    sendScriptEvent: (/** @type {string} */ id, /** @type {string} */ message) => {
      sent.push({ id, message });
    },
    beforeEvents: group("system.before"),
    afterEvents: group("system.after"),
  });
  const world = open({
    beforeEvents: group("world.before"),
    afterEvents: group("world.after"),
    getDynamicProperty: (/** @type {string} */ k) => props.get(k),
    setDynamicProperty: (/** @type {string} */ k, /** @type {unknown} */ v) => (v === undefined ? props.delete(k) : props.set(k, v)),
    getDynamicPropertyIds: () => [...props.keys()],
    getAllPlayers: () => [],
    getTimeOfDay: () => 6000,
    getDay: () => 1,
  });
  const deliver = (/** @type {string} */ id, /** @type {string} */ message = "{}") => {
    for (const cb of [...(subs.get("system.after.scriptEventReceive") ?? [])]) {
      if (cb.options?.namespaces && !cb.options.namespaces.includes(id.slice(0, id.indexOf(":")))) continue;
      cb({ id, message, sourceType: "Server" });
    }
  };
  const step = (/** @type {number} */ n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++;
      const due = timers.filter((t) => t.at <= tick);
      timers = timers.filter((t) => t.at > tick);
      for (const t of due) t.fn();
    }
  };
  return { system, world, sent, subs, deliver, step, natives: () => subs.get("system.after.scriptEventReceive") ?? [] };
}

/** A pack's scripts (diag.js left out: the other tests cover it) written under `into` and run against a game of its own. @param {string} folder @param {string} into */
async function runPack(folder, into) {
  const game = wholeGame();
  const g = /** @type {any} */ (globalThis);
  g.__wholeGame = { WeatherType: { Clear: "Clear", Rain: "Rain", Thunder: "Thunder" }, ScriptEventSource: { Server: "Server", Entity: "Entity", Block: "Block", NPCDialogue: "NPCDialogue" }, system: game.system, world: game.world, anything };
  const from = join(root, "packs", folder, "scripts");
  const out = join(into, folder);
  const files = walk(from).filter((f) => f.endsWith(".js"));
  const names = (/** @type {string} */ src, /** @type {string} */ spec) => [...src.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${spec}"`, "g"))].flatMap((m) => m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  const sources = files.map((f) => readFileSync(f, "utf8"));
  mkdirSync(out, { recursive: true });
  const stub = (/** @type {string} */ name, /** @type {string[]} */ list) => {
    writeFileSync(join(out, name), `const g = globalThis.__wholeGame; ${[...new Set(list)].map((n) => `export const ${n} = g[${JSON.stringify(n)}] ?? g.anything;`).join("\n")}\n`);
    return JSON.stringify(pathToFileURL(join(out, name)).href);
  };
  const server = stub("__server.mjs", sources.flatMap((s) => names(s, "@minecraft/server")));
  const ui = stub("__ui.mjs", sources.flatMap((s) => names(s, "@minecraft/server-ui")));
  files.forEach((f, i) => {
    const target = join(out, relative(from, f));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, sources[i].replace('import "./diag.js";', "").replaceAll('"@minecraft/server"', server).replaceAll('"@minecraft/server-ui"', ui));
  });
  await import(pathToFileURL(join(out, "main.js")).href);
  return game;
}

test("every behavior pack runs against a fake game with exactly one native script event listener, which answers /realm:help", async () => {
  const into = mkdtempSync(join(root, "tools", ".tmp-events-test-"));
  const problems = [];
  let loaded = 0;
  try {
    for (const folder of packs) {
      try {
        const game = await runPack(folder, into);
        loaded++;
        const natives = game.natives();
        if (natives.length !== 1) problems.push(`${folder}: ${natives.length} native scriptEventReceive listeners`);
        else if (JSON.stringify(natives[0].options) !== '{"namespaces":["realm"]}') problems.push(`${folder}: its listener asks for ${JSON.stringify(natives[0].options)}`);
        game.deliver("realm:help_ping", "");
        game.step(2);
        const pongs = game.sent.filter((s) => s.id === "realm:help_pong").map((s) => s.message);
        if (pongs.length !== 1) problems.push(`${folder}: ${pongs.length} /realm:help answers`);
        else if (folder !== "help_bp" && pongs[0] !== folder) problems.push(`${folder}: answers /realm:help as "${pongs[0]}"`);
        if (folder !== "settings_bp") {
          game.deliver("realm:cfg_ping", JSON.stringify({ id: "t1" }));
          const schemas = game.sent.filter((s) => s.id === "realm:cfg_schema");
          if (!schemas.length) problems.push(`${folder}: doesn't answer realm:cfg_ping`);
          else if (JSON.parse(schemas[0].message).pack !== folder) problems.push(`${folder}: its settings answer names another pack`);
        }
      } catch (e) {
        problems.push(`${folder}: couldn't run its main.js against the fake game: ${e}`);
      }
    }
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
  assert.deepEqual(problems, []);
  assert.equal(loaded, packs.length);
});
