// O62: a confirmed realm:diag_forget for Expeditions deletes its own parcel structures (never another pack's or a
// player's structures), keeps every stash structure (players' own data still points at them), refuses new saves
// afterwards, and answers ONCE, after the clean-up. The real generated diag.js, the real gauntlet.js and the forget hook
// block of main.js run against one fake server. EXPEDITION_SRC points at another copy of the pack's scripts folder.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const scripts = new URL("../packs/expedition_bp/scripts/", import.meta.url);
const srcDir = process.env.EXPEDITION_SRC ? `${process.env.EXPEDITION_SRC}/` : undefined;
const read = (f) => readFileSync(srcDir ? `${srcDir}${f}` : new URL(f, scripts), "utf8");
const mainSource = read("main.js");
const gauntletSource = read("gauntlet.js");
const diagSource = readFileSync(new URL("diag.js", scripts), "utf8");

function fakeServer() {
  let tick = 0;
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
    constructor() { this.props = new Map(); this.players = []; }
    getDynamicProperty(k) { return this.props.get(k); }
    setDynamicProperty(k, v) { if (v === undefined) this.props.delete(k); else this.props.set(k, v); }
    getDynamicPropertyIds() { return [...this.props.keys()]; }
    getDynamicPropertyTotalByteCount() { let n = 0; for (const [k, v] of this.props) n += k.length + String(v).length; return n; }
    clearDynamicProperties() { this.props.clear(); }
    getAllPlayers() { return this.players; }
  }
  class CustomCommandRegistry { registerCommand() {} }
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

let n = 0;
async function setup({ ids, failDelete = [], keepAfterDelete = [], failList = false, handing = false }) {
  const mc = fakeServer();
  globalThis.__mcFake = mc;
  delete globalThis.__realmDiag;
  delete globalThis.__realmDiagWrapped;
  delete globalThis.__realmDiagForgetHooks;
  const structures = new Set(ids);
  const state = { handing, failDelete: [...failDelete] };
  mc.world.structureManager = {
    getWorldStructureIds: () => {
      if (failList) throw new Error("list failed");
      return [...structures];
    },
    get: (id) => (structures.has(id) ? {} : undefined),
    delete: (id) => {
      if (state.failDelete.includes(id)) throw new Error("locked");
      if (!keepAfterDelete.includes(id)) structures.delete(id);
    },
  };
  const ops = [];
  const warnings = [];
  mc.world.players = [{ id: "op", isOp: true, sendMessage: (m) => ops.push(m) }];

  const gctx = {
    EnchantmentType: {}, EquipmentSlot: {}, ItemStack: class {}, Player: class {}, StructureSaveMode: { World: "World" },
    CONFIG: {}, console, system: mc.system, world: mc.world,
  };
  vm.createContext(gctx);
  const gsrc = gauntletSource.replace(/^import .*$/gm, "").replace(/^export /gm, "");
  vm.runInContext(`${gsrc}\nglobalThis.api = { saveStash, saveParcel, forgetStructures, setSaving };`, gctx);

  const start = mainSource.indexOf("// forget hook begin");
  const end = mainSource.indexOf("// forget hook end");
  assert.ok(start >= 0 && end > start, "production forget hook block");
  const mctx = {
    console: { warn: (m) => warnings.push(String(m)) },
    String, Set,
    isOp: (p) => p.isOp,
    forgetStructures: gctx.api.forgetStructures,
    setSaving: gctx.api.setSaving,
    handingOver: () => state.handing,
    system: mc.system,
    world: mc.world,
  };
  vm.createContext(mctx);
  vm.runInContext(mainSource.slice(start, end), mctx);
  globalThis.__realmDiagForgetHooks = mctx.__realmDiagForgetHooks;

  const dir = mkdtempSync(join(tmpdir(), "o62-"));
  mkdirSync(join(dir, "expedition_bp"), { recursive: true });
  const file = join(dir, "expedition_bp", `diag${n++}.js`);
  writeFileSync(file, diagSource.replace(/^import .* from "@minecraft\/server";$/m, "const { CustomCommandRegistry, System, World, system, world } = globalThis.__mcFake;"));
  await import(pathToFileURL(file).href);
  mc.step(1);
  mc.world.setDynamicProperty("expedition:stash_next", 5);
  mc.world.setDynamicProperty("expedition:parcel_next", 4);
  const forget = (m = {}) => {
    mc.system.sendScriptEvent("realm:diag_forget", JSON.stringify({ id: "r1", pack: "expedition_bp", confirm: "FORGET expedition_bp", ...m }));
    mc.step(3);
  };
  const replies = () => mc.sent.filter((s) => s.id === "realm:diag_forgot").map((s) => JSON.parse(s.message));
  return { mc, structures, ops, warnings, state, api: gctx.api, forget, replies };
}

const STASH = ["expedition:stash_1", "expedition:stash_2"];
const PARCEL = ["expedition:parcel_1", "expedition:parcel_3"];
const FOREIGN = ["stash_bp:stash_1", "expedition:other_1", "expedition:stash_x", "expedition:parcel_1_old", "build:house", "myhouse"];

test("a confirmed forget deletes own parcels, keeps every stash and foreign structure, and answers once, after the clean-up", async () => {
  const w = await setup({ ids: [...STASH, ...PARCEL, ...FOREIGN] });
  w.forget();
  assert.deepEqual([...w.structures].sort(), [...STASH, ...FOREIGN].sort());
  const r = w.replies();
  assert.equal(r.length, 1, "exactly one answer");
  assert.equal(r[0].ok, true);
  assert.match(r[0].note, /2 parcel structures deleted/);
  assert.match(r[0].note, /2 stash structures stay/);
  assert.equal(w.mc.world.props.size, 0, "the saved world data is gone");
});

test("structures that can't be deleted turn the one answer into a failure with the real count and error", async () => {
  const w = await setup({ ids: [...STASH, ...PARCEL], failDelete: ["expedition:parcel_1"] });
  w.forget();
  const r = w.replies();
  assert.equal(r.length, 1, "no second, conflicting answer");
  assert.equal(r[0].ok, false);
  assert.match(r[0].error, /saved data forgotten, but 1 parcel structure couldn't be deleted/);
  assert.match(r[0].error, /locked|expedition:parcel_1/);
  assert.deepEqual([...w.structures].sort(), [...STASH, "expedition:parcel_1"].sort());
  assert.equal(w.mc.world.props.size, 0);
});

test("a structure that stays after its delete is reported, and structures that can't be listed too", async () => {
  const a = await setup({ ids: PARCEL, keepAfterDelete: ["expedition:parcel_3"] });
  a.forget();
  assert.equal(a.replies().length, 1);
  assert.equal(a.replies()[0].ok, false);
  const b = await setup({ ids: PARCEL, failList: true });
  b.forget();
  assert.equal(b.replies().length, 1);
  assert.equal(b.replies()[0].ok, false);
  assert.match(b.replies()[0].error, /couldn't list/);
});

test("a forget that isn't confirmed or isn't for this pack deletes nothing and answers nothing", async () => {
  for (const bad of [{ confirm: "FORGET news_bp" }, { confirm: "" }, { pack: "stash_bp" }]) {
    const w = await setup({ ids: [...STASH, ...PARCEL] });
    w.forget(bad);
    assert.equal(w.structures.size, 4, JSON.stringify(bad));
    assert.equal(w.mc.world.props.size, 2);
    assert.equal(w.api.saveParcel("p1", "spoils", [], {}, {}), true, "saving still works");
  }
});

test("a parcel hand-over in flight defers the parcel sweep; it finishes by itself and tells the operators", async () => {
  const w = await setup({ ids: [...STASH, ...PARCEL], handing: true });
  w.forget();
  const r = w.replies();
  assert.equal(r.length, 1);
  assert.equal(r[0].ok, true);
  assert.match(r[0].note, /2 waiting for a hand-over to end/);
  assert.equal(w.structures.size, 4, "nothing under a running hand-over is deleted");
  w.mc.step(200);
  assert.equal(w.structures.size, 4, "still waiting");
  w.state.handing = false;
  w.mc.step(60);
  assert.deepEqual([...w.structures].sort(), STASH);
  assert.equal(w.replies().length, 1, "no second answer");
  assert.ok(w.ops.some((m) => m.includes("parcel clean-up finished") && m.includes("2 more")), w.ops.join("|"));
});

test("a deferred sweep that fails is reported to the operators, not dropped", async () => {
  const w = await setup({ ids: PARCEL, handing: true, failDelete: ["expedition:parcel_3"] });
  w.forget();
  w.state.handing = false;
  w.mc.step(60);
  assert.ok(w.ops.some((m) => m.includes("parcel clean-up failed") && m.includes("1 parcel structure")), w.ops.join("|"));
  assert.ok(w.warnings.some((m) => m.includes("parcel clean-up failed")));
});

function carrier() {
  const inv = { items: new Map([[0, "diamond"]]), setItem(k) { this.items.delete(k); } };
  return { inv, p: { getDynamicProperty: () => undefined, setDynamicProperty() { throw new Error("must not write"); }, getComponent: () => ({ container: inv }) } };
}

test("after a confirmed forget no stash or parcel is made and the inventory is left alone", async () => {
  const w = await setup({ ids: [] });
  w.forget();
  const { p, inv } = carrier();
  const made = [];
  assert.equal(w.api.saveStash(p, { spawnEntity: (...a) => made.push(a) }, { x: 0, y: 0, z: 0 }), false);
  assert.equal(w.api.saveParcel("p1", "spoils", [{ getLore: () => [] }], { spawnEntity: (...a) => made.push(a) }, { x: 0, y: 0, z: 0 }), false);
  assert.equal(made.length, 0);
  assert.equal(w.structures.size, 0);
  assert.equal(inv.items.get(0), "diamond");
  assert.equal(w.mc.world.props.size, 0, "no counter was written");
});
