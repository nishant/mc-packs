// Unit tests for tools/diag-shared.js (pack diagnostics, copied into each pack as diag-core.js and registered by its diag.js stub)
// with a fake @minecraft/server. Two copies loaded as
// two modules share one globalThis, like the packs of the Realm Bundle share one script context and one
// dynamic property storage: ownership of callbacks and keys, per-pack profiling, and a forget that removes
// one pack's keys only and then blocks that pack's writes. The single-pack path runs on BDS
// (tools/test-bds/examples/admin-diag.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { coreFor, diagFor } from "./lib/diag-sync.mjs";

const SRC = readFileSync(join(import.meta.dirname, "diag-shared.js"), "utf8");

function fakeServer() {
  let tick = 0;
  /** @type {{ at: number, fn: Function, every?: number }[]} */
  let queue = [];
  const signal = () => {
    const subs = [];
    return { subs, subscribe(cb) { subs.push(cb); return cb; }, unsubscribe(cb) { const i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); } };
  };
  const sent = [];
  class System {
    get currentTick() { return tick; }
    run(fn) { queue.push({ at: tick + 1, fn }); return 1; }
    runTimeout(fn, t = 1) { queue.push({ at: tick + Math.max(1, t), fn }); return 1; }
    runInterval(fn, t = 1) { queue.push({ at: tick + t, fn, every: t }); return 1; }
    runJob(gen) { queue.push({ at: tick + 1, fn: () => { for (const _ of gen); } }); return 1; }
    sendScriptEvent(id, message) {
      sent.push({ id, message });
      queue.push({ at: tick + 1, fn: () => { for (const cb of [...system.afterEvents.scriptEventReceive.subs]) cb({ id, message }); } });
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
  system.afterEvents = { scriptEventReceive: signal() };
  system.beforeEvents = { startup: signal() };
  const world = new World();
  world.afterEvents = { playerJoin: signal() };
  world.beforeEvents = { chatSend: signal() };
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
  return { System, World, CustomCommandRegistry, system, world, step, sent };
}

/** Writes one pack's diag-core.js and diag.js stub like sync-diag does and imports the stub. @param {string} dir @param {string} pack */
async function loadCopy(dir, pack, version = "1.0.0", prefixes = []) {
  const src = SRC.replace(/^import .* from "@minecraft\/server";$/m, "const { CustomCommandRegistry, System, World, system, world } = globalThis.__mcFake;");
  mkdirSync(join(dir, pack), { recursive: true });
  writeFileSync(join(dir, pack, "diag-core.js"), src);
  const file = join(dir, pack, "diag.js");
  writeFileSync(file, `import { registerPack } from "./diag-core.js";
registerPack({ pack: ${JSON.stringify(pack)}, name: ${JSON.stringify(pack.toUpperCase())}, version: ${JSON.stringify(version)}, prefixes: ${JSON.stringify(prefixes)} });
`);
  await import(pathToFileURL(file).href);
}

const pongs = (mc, id = "realm:diag_pong") => mc.sent.filter((s) => s.id === id).map((s) => JSON.parse(s.message));

test("two packs in one script context: keys, callbacks, profiling and forget stay per pack", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "diag-"));
  const { system, world } = mc;
  world.props.set("a:old", "x".repeat(30000)); // saved before this load, read by a at startup
  world.props.set("zz:stale", "1"); // nobody reads it: unclaimed

  await loadCopy(dir, "a_bp", "1.2.3");
  // a_bp's modules evaluate now.
  assert.equal(world.getDynamicProperty("a:old").length, 30000);
  let aRuns = 0;
  world.afterEvents.playerJoin.subscribe(() => {
    aRuns++;
    world.setDynamicProperty("a:join", String(aRuns));
    system.run(() => world.setDynamicProperty("a:later", "1")); // handed over inside a's callback: a's
  });
  await loadCopy(dir, "b_bp", "2.0.0");
  world.setDynamicProperty("b:cfg", "{}");
  let bEvents = 0;
  system.afterEvents.scriptEventReceive.subscribe(() => bEvents++, { namespaces: ["realm"] }); // carries the protocol
  let bRuns = 0;
  system.runInterval(() => {
    bRuns++;
    world.setDynamicProperty("b:tick", bRuns);
  }, 1);

  mc.step(1); // module evaluation is over
  assert.equal(system.afterEvents.scriptEventReceive.subs.length, 1, "no listener of diag's own: b's carries the protocol");
  for (const cb of world.afterEvents.playerJoin.subs) cb({});
  mc.step(2);
  assert.ok(world.props.has("a:later"));

  system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "q1" }));
  mc.step(2);
  const list = pongs(mc).filter((p) => p.id === "q1");
  const a = list.find((p) => p.pack === "a_bp");
  const b = list.find((p) => p.pack === "b_bp");
  assert.equal(list.length, 2, "one pong per pack");
  assert.ok(bEvents >= 1, "b's listener still gets the events");
  assert.equal(a.version, "1.2.3");
  assert.equal(a.name, "A_BP");
  assert.equal(a.props, 3, "a:old, a:join, a:later");
  assert.equal(b.props, 2, "b:cfg, b:tick");
  assert.equal(a.bigKey, "a:old");
  assert.ok(a.big >= 30000);
  assert.equal(a.shared, 2);
  assert.ok(a.total > a.bytes + b.bytes, "zz:stale is in the total but nobody's");
  assert.equal(a.unownedProps, 1);
  assert.equal(a.unowned, "zz:stale".length + 1);

  system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "q2", ticks: 10 }));
  mc.step(14);
  const prof = pongs(mc).filter((p) => p.id === "q2");
  assert.equal(prof.length, 2);
  const bp = prof.find((p) => p.pack === "b_bp");
  assert.ok(bp.calls >= 9 && bp.calls <= 11, `b's interval ran about 10 times in the window (${bp.calls})`);
  assert.equal(bp.ticks >= 10, true);
  assert.ok(bp.top.some((x) => /^runInterval\(1\)/.test(x.k)), JSON.stringify(bp.top));
  assert.equal(prof.find((p) => p.pack === "a_bp").calls, 0);

  // Refused without the exact confirmation.
  system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "f0", pack: "a_bp", confirm: "yes" }));
  mc.step(2);
  const refused = pongs(mc, "realm:diag_forgot").find((p) => p.id === "f0");
  assert.equal(refused.ok, false);
  assert.ok(world.props.has("a:old"));

  system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "f1", pack: "a_bp", confirm: "FORGET a_bp" }));
  mc.step(2);
  const done = pongs(mc, "realm:diag_forgot").find((p) => p.id === "f1");
  assert.equal(done.ok, true);
  assert.equal(done.removed, 3);
  assert.deepEqual([...world.props.keys()].sort(), ["b:cfg", "b:tick", "zz:stale"], "only a's keys are gone");

  // a's caches cannot write back (from its callback, or by its prefix from anywhere); b keeps saving.
  for (const cb of world.afterEvents.playerJoin.subs) cb({});
  mc.step(2);
  world.setDynamicProperty("a:brand_new", "1");
  assert.ok(!world.props.has("a:join") && !world.props.has("a:later") && !world.props.has("a:brand_new"));
  const before = world.props.get("b:tick");
  mc.step(2);
  assert.ok(world.props.get("b:tick") > before);
  assert.equal(pongs(mc, "realm:diag_forgot").filter((p) => p.id === "f1").length, 1, "only a_bp answered the forget");
});

test("a pack alone in its context owns its whole storage and clears all of it", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "diag-"));
  const { system, world } = mc;
  world.props.set("legacy_key_without_prefix", "1");
  await loadCopy(dir, "solo_bp");
  mc.step(1);
  world.setDynamicProperty("solo:x", "abc");
  system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "p" }));
  mc.step(2);
  const [p] = pongs(mc);
  assert.equal(p.props, 2);
  assert.equal(p.bytes, world.getDynamicPropertyTotalByteCount());
  assert.equal(p.shared, undefined);
  system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "f", pack: "solo_bp", confirm: "FORGET solo_bp" }));
  mc.step(2);
  assert.equal(world.props.size, 0);
  world.setDynamicProperty("solo:x", "again");
  assert.equal(world.props.size, 0, "writes are ignored until the next reload");
  world.setDynamicProperty("solo:x", undefined); // a delete is harmless
  assert.equal(system.afterEvents.scriptEventReceive.subs.length, 1, "with no pack listener, diag listens itself");
});

test("a pack's forget cleanup runs after its properties are gone and its writes are blocked, and the one answer reports it", async () => {
  for (const [label, hook, expect] of [
    ["none", undefined, { ok: true }],
    ["note", () => ({ note: "kept 2" }), { ok: true, note: "kept 2" }],
    ["error", () => ({ error: "1 structure couldn't be deleted" }), { ok: false, error: "saved data forgotten, but 1 structure couldn't be deleted" }],
    ["throws", () => { throw new Error("boom"); }, { ok: false, error: "saved data forgotten, but Error: boom" }],
  ]) {
    const mc = fakeServer();
    globalThis.__mcFake = mc;
    delete globalThis.__realmDiag;
    delete globalThis.__realmDiagWrapped;
    delete globalThis.__realmDiagForgetHooks;
    const dir = mkdtempSync(join(tmpdir(), "diag-"));
    const { system, world } = mc;
    await loadCopy(dir, "solo_bp");
    mc.step(1);
    world.setDynamicProperty("solo:x", "abc");
    const seen = [];
    if (hook) globalThis.__realmDiagForgetHooks = { solo_bp: (info) => { seen.push({ props: world.props.size, info }); world.setDynamicProperty("solo:y", "late"); seen.push({ blocked: world.props.size === 0 }); return hook(); } };
    system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "f", pack: "solo_bp", confirm: "FORGET solo_bp" }));
    mc.step(3);
    const replies = pongs(mc, "realm:diag_forgot");
    assert.equal(replies.length, 1, `${label}: exactly one answer`);
    assert.deepEqual({ ...replies[0], id: undefined, pack: undefined, removed: undefined, bytes: undefined }, { ...expect, id: undefined, pack: undefined, removed: undefined, bytes: undefined }, label);
    if (hook) {
      assert.equal(seen[0].props, 0, `${label}: properties were already gone`);
      assert.equal(seen[0].info.removed, 1);
      assert.equal(seen[1].blocked, true, `${label}: the pack's writes were already blocked`);
    }
  }
  delete globalThis.__realmDiagForgetHooks;
});

test("forget includes untouched saved keys from a declared namespace, not another pack or unknown data", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "diag-"));
  mc.world.props.set("a:untouched", "saved before startup");
  mc.world.props.set("b:untouched", "another pack");
  mc.world.props.set("unknown:legacy", "no declared owner");
  await loadCopy(dir, "a_bp", "1.0.0", ["a"]);
  await loadCopy(dir, "b_bp", "1.0.0", ["b"]);
  mc.step(1);
  mc.system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "untouched", pack: "a_bp", confirm: "FORGET a_bp" }));
  mc.step(2);
  assert.equal(mc.world.props.has("a:untouched"), false, "an untouched key is still part of a's data");
  assert.equal(mc.world.props.get("b:untouched"), "another pack");
  assert.equal(mc.world.props.get("unknown:legacy"), "no declared owner");
  assert.equal(pongs(mc, "realm:diag_forgot").find((p) => p.id === "untouched").removed, 1);
});

test("a foreign read during module startup cannot steal a declared namespace", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "diag-"));
  mc.world.props.set("b:old", "owned by b");
  await loadCopy(dir, "b_bp", "1.0.0", ["b"]);
  await loadCopy(dir, "a_bp", "1.0.0", ["a"]);
  assert.equal(mc.world.getDynamicProperty("b:old"), "owned by b");
  mc.step(1);
  mc.system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "foreign", pack: "a_bp", confirm: "FORGET a_bp" }));
  mc.step(2);
  assert.equal(mc.world.props.get("b:old"), "owned by b", "reading it did not transfer ownership to a");
});

test("a declared namespace collision never guesses the owner of an untouched key", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "diag-"));
  mc.world.props.set("shared:untouched", "keep ambiguous data");
  await loadCopy(dir, "a_bp", "1.0.0", ["shared"]);
  await loadCopy(dir, "b_bp", "1.0.0", ["shared"]);
  mc.step(1);
  mc.system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "shared", pack: "a_bp", confirm: "FORGET a_bp" }));
  mc.step(2);
  assert.equal(mc.world.props.get("shared:untouched"), "keep ambiguous data");
});

test("F23: a key in a namespace two packs declare stays unowned when one of them writes it; an unknown one is the writer's", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "diag-"));
  await loadCopy(dir, "a_bp", "1.0.0", ["shared"]);
  await loadCopy(dir, "b_bp", "1.0.0", ["shared"]);
  // b's module is the one being evaluated: what it writes now is b's, unless the namespace says otherwise.
  mc.world.setDynamicProperty("shared:new", "ambiguous");
  mc.world.setDynamicProperty("mystery:z", "b wrote it");
  mc.step(1);
  mc.system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "f23", pack: "b_bp", confirm: "FORGET b_bp" }));
  mc.step(2);
  assert.equal(mc.world.props.get("shared:new"), "ambiguous", "two packs declare 'shared': nobody owns it, so forgetting b keeps it");
  assert.equal(mc.world.props.has("mystery:z"), false, "an undeclared namespace belongs to the pack that first wrote it");
  // Writing it again after b's forget is not blocked either: it was never b's.
  mc.world.setDynamicProperty("shared:new", "still writable");
  assert.equal(mc.world.props.get("shared:new"), "still writable");
});

test("generated diagnostics declare world namespaces, not item-only namespaces", () => {
  for (const [pack, expected] of [
    ["map_bp", ["map"]],
    ["build_bp", ["build", "eb"]],
    ["relics_bp", ["relics"]],
    ["settings_bp", []],
  ]) {
    const declaration = /^registerPack\(\{ pack: "[^"]+", name: "[^"]*", version: "[^"]+", prefixes: (\[.*\]) \}\);$/m.exec(diagFor(pack));
    assert.ok(declaration, `${pack} declares its ownership metadata`);
    assert.deepEqual(JSON.parse(declaration[1]), expected, pack);
  }
});

test("the generated stub is three lines naming the pack, and the core is the shared file", () => {
  const stub = diagFor("afk_bp");
  assert.equal(stub.trimEnd().split("\n").length, 3);
  assert.match(stub, /^\/\/ Generated by tools\/sync-diag\.mjs from tools\/diag-shared\.js: never edit by hand\.\nimport \{ registerPack \} from "\.\/diag-core\.js";\nregisterPack\(\{ pack: "afk_bp", /);
  assert.equal(coreFor(), SRC);
  assert.equal(readFileSync(join(import.meta.dirname, "..", "packs", "afk_bp", "scripts", "diag-core.js"), "utf8"), SRC);
});

test("two packs registered through two copies of the core share one state and both appear in it", async () => {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  const dir = mkdtempSync(join(tmpdir(), "diag-"));
  await loadCopy(dir, "a_bp", "1.0.0", ["a"]);
  const state = globalThis.__realmDiag;
  await loadCopy(dir, "b_bp", "2.0.0", ["b"]);
  assert.ok(state, "the first core installed the shared state");
  assert.equal(globalThis.__realmDiag, state, "the second core reuses it");
  assert.deepEqual([...state.packs.keys()].sort(), ["a_bp", "b_bp"]);
  assert.equal(state.multi, true);
  assert.equal(state.cur.pack, "b_bp", "the last registered pack is current while its modules evaluate");
  assert.equal(state.prefixOwner.get("a").pack, "a_bp");
  assert.equal(state.prefixOwner.get("b").pack, "b_bp");
  mc.step(1);
  mc.system.sendScriptEvent("realm:diag_ping", JSON.stringify({ id: "both" }));
  mc.step(2);
  assert.deepEqual(pongs(mc).filter((p) => p.id === "both").map((p) => p.pack).sort(), ["a_bp", "b_bp"]);
});
