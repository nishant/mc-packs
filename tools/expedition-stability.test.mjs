// O62: the chat announcement of a clear starts from a chosen level (rewards unchanged), and a confirmed
// realm:diag_forget for Expeditions also deletes its own saved stash and parcel structures. The production
// finish() and gauntlet.js run in a vm; the forget listener block is the one from main.js. EXPEDITION_SRC points at
// another copy of packs/expedition_bp/scripts (the RED run reads the base commit's files).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const dir = process.env.EXPEDITION_SRC ? `${process.env.EXPEDITION_SRC}/` : new URL("../packs/expedition_bp/scripts/", import.meta.url).href;
const read = (f) => (process.env.EXPEDITION_SRC ? readFileSync(`${dir}${f}`, "utf8") : readFileSync(new URL(f, dir), "utf8"));
const mainSource = read("main.js");
const gauntletSource = read("gauntlet.js");
const { CONFIG } = await import(new URL("config.js", new URL("../packs/expedition_bp/scripts/", import.meta.url)).href);
const layout = await import(new URL("layout.js", new URL("../packs/expedition_bp/scripts/", import.meta.url)).href);

function fn(name) {
  const m = mainSource.match(new RegExp(`^(?:export )?function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `production ${name}`);
  return m[0];
}

// ---------------------------------------------------------------------------
// finish(): the clear announcement and everything else a clear does
// ---------------------------------------------------------------------------

function clear(level, from) {
  const log = { chat: [], pay: [], send: [], prog: [], tell: [] };
  const player = { id: "p1", name: "Ann", onScreenDisplay: { setTitle() {} }, playSound() {}, sendMessage() {} };
  const prog = { c: 0, b: -1, r: [], u: 0 };
  const own = {
    world: { sendMessage: (m) => log.chat.push(m) },
    system: { currentTick: 1000, sendScriptEvent() {} },
    CONFIG,
    get: (k) => (k === "announceFromLevel" ? from : k === "exitSeconds" ? 90 : undefined),
    gameMs: () => 61000,
    clock: () => "1:01",
    online: () => player,
    progressOf: () => prog,
    bestFor: () => ({}),
    payCrowns: (_p, n, why) => log.pay.push([n, why]),
    send: (id, m) => log.send.push([id, m.player, m.id ?? m.amount ?? m.entry ?? m.relic]),
    writePlayer: (_p, _k, v) => log.prog.push(JSON.stringify(v)),
    tell: (_r, m) => log.tell.push(m),
    hasFlag: () => false,
    maxTier: () => 20,
    readJson: () => undefined,
    dungeonLabel: (d, L) => `${d.name} (${layout.levelName(L)})`,
    levelName: layout.levelName,
    levelShort: layout.levelShort,
    levelKey: layout.levelKey,
    tierOf: layout.tierOf,
    Date: { now: () => 5 },
    Math: Object.assign(Object.create(Math), { random: () => 0.99 }),
  };
  const stubs = new Proxy(own, {
    has: () => true,
    get: (t, k) => (typeof k === "symbol" ? undefined : k in t ? t[k] : k in globalThis ? globalThis[k] : () => undefined),
  });
  const code = `(function () { with (__p) { ${fn("finish")}\n${mainSource.includes("function announceClear(") ? fn("announceClear") : ""}\nreturn finish; } })()`;
  const finish = vm.runInContext(code, vm.createContext({ __p: stubs }));
  const run = {
    phase: "active", started: 0, mobs: [], extra: [], hazards: [], lay: { n: 6 }, dungeon: CONFIG.dungeons[0], level: level, s: { crowns: 1, t: Math.max(0, level - 2), relic: 0, loot: 1 },
    members: new Map([["p1", { name: "Ann" }]]), affixes: [], cursed: false, long: false, leaderName: "Ann",
  };
  finish(run);
  return log;
}

test("every clear is announced by default (and for each level at or above the chosen one)", () => {
  for (const L of [0, 1, 2, 3, 5, 22]) assert.equal(clear(L, "0").chat.length, 1, `default, level ${L}`);
  for (const [from, L, count] of [["3", 2, 0], ["3", 3, 1], ["3", 22, 1], ["22", 21, 0], ["22", 22, 1], ["2", 1, 0], ["2", 2, 1]]) assert.equal(clear(L, from).chat.length, count, `from ${from}, level ${L}`);
});

test("a setting that is missing or unreadable keeps announcing every clear", () => {
  assert.equal(clear(0, undefined).chat.length, 1);
  assert.equal(clear(0, "junk").chat.length, 1);
});

test("the threshold changes the world chat line only: rewards, events, progress and the party message are the same", () => {
  for (const L of [0, 1, 2, 3, 7]) {
    const open = clear(L, "0");
    const shut = clear(L, "22");
    assert.equal(shut.chat.length, L >= 22 ? 1 : 0);
    assert.deepEqual({ ...shut, chat: [] }, { ...open, chat: [] }, `level ${L}`);
    assert.ok(open.pay.length === 1 && open.prog.length === 1 && open.tell.length === 1);
  }
});

// ---------------------------------------------------------------------------
// forget: the structures
// ---------------------------------------------------------------------------

function world({ ids, failDelete = [], keepAfterDelete = [], busy = false, stashOfOnline = [], failList = false, ops = true }) {
  const structures = new Set(ids);
  const events = [];
  const handlers = [];
  const messages = [];
  const warnings = [];
  const timers = [];
  const props = new Map([["expedition:stash_next", 5], ["expedition:parcel_next", 4]]);
  let blocked = false;
  const sm = {
    getWorldStructureIds: () => {
      if (failList) throw new Error("list failed");
      return [...structures];
    },
    get: (id) => (structures.has(id) ? {} : undefined),
    delete: (id) => {
      if (failDelete.includes(id)) throw new Error("locked");
      if (!keepAfterDelete.includes(id)) structures.delete(id);
    },
  };
  const players = [
    { id: "op", isOp: ops, sendMessage: (m) => messages.push(m), props: stashOfOnline[0] },
    ...stashOfOnline.map((id, i) => ({ id: `s${i}`, isOp: false, sendMessage() {}, props: id })),
  ];
  const gauntletCtx = {
    EnchantmentType: {}, EquipmentSlot: {}, ItemStack: class {}, Player: class {}, StructureSaveMode: { World: "World" }, CONFIG, console,
    system: { runTimeout: () => {}, currentTick: 1 },
    world: {
      structureManager: sm,
      getDynamicProperty: (k) => props.get(k),
      setDynamicProperty: (k, v) => {
        if (!blocked) (v === undefined ? props.delete(k) : props.set(k, v));
      },
    },
  };
  vm.createContext(gauntletCtx);
  const gsrc = gauntletSource.replace(/^import .*$/gm, "").replace(/^export /gm, "");
  vm.runInContext(`${gsrc}\nglobalThis.api = { saveStash, saveParcel, stashOf, forgetStructures: typeof forgetStructures === "function" ? forgetStructures : undefined, setSaving: typeof setSaving === "function" ? setSaving : () => {} };`, gauntletCtx);
  const api = gauntletCtx.api;
  const start = mainSource.indexOf("/** realm:diag_forget request ids");
  const end = mainSource.indexOf("/**\n * Actionbar text");
  const block = start >= 0 ? mainSource.slice(start, end) : "";
  const mainCtx = {
    console: { warn: (m) => warnings.push(String(m)) },
    JSON, String, Set, Map,
    runs: new Map(busy ? [[0, {}]] : []),
    pending: new Map(),
    isOp: (p) => p.isOp,
    stashOf: (p) => (p.props ? { id: p.props, tag: "t" } : undefined),
    forgetStructures: api.forgetStructures,
    setSaving: api.setSaving,
    system: { runTimeout: (f, n) => timers.push([f, n]), sendScriptEvent: (id, message) => events.push({ id, message }) },
    world: { getAllPlayers: () => players },
    onScriptEvent: (_ids, cb) => handlers.push(cb),
  };
  vm.createContext(mainCtx);
  vm.runInContext(block, mainCtx);
  const emit = (id, m) => handlers.forEach((h) => h({ id, message: JSON.stringify(m) }));
  return {
    structures, events, messages, warnings, timers, api, props,
    forget: (m = {}) => emit("realm:diag_forget", { id: "r1", pack: "expedition_bp", confirm: "FORGET expedition_bp", ...m }),
    // realm:diag's part: it forgets the world data before this pack hears the same request, then answers
    forgot: (m = {}) => {
      props.clear();
      blocked = true;
      emit("realm:diag_forgot", { id: "r1", pack: "expedition_bp", ok: true, removed: 3, bytes: 90, ...m });
    },
    saveOf: () => ({ stash: api.saveStash, parcel: api.saveParcel }),
  };
}

const ALL = ["expedition:stash_1", "expedition:stash_2", "expedition:parcel_1", "expedition:parcel_3"];
const FOREIGN = ["stash_bp:stash_1", "expedition:other_1", "expedition:stash_x", "expedition:parcel_1_old", "build:house", "myhouse"];

test("a confirmed forget deletes every own stash and parcel structure and no other structure", () => {
  const w = world({ ids: [...ALL, ...FOREIGN] });
  w.forget();
  w.forgot();
  assert.deepEqual([...w.structures].sort(), [...FOREIGN].sort());
  assert.ok(w.messages.some((m) => m.includes("deleted 4 saved structures")), w.messages.join("|"));
  assert.equal(w.events.length, 0, "no failure reply");
});

test("a forget that wasn't confirmed, or isn't for this pack, deletes nothing", () => {
  for (const bad of [{ confirm: "FORGET news_bp" }, { confirm: "" }, { pack: "stash_bp" }]) {
    const w = world({ ids: ALL });
    w.forget(bad);
    w.forgot();
    assert.equal(w.structures.size, 4, JSON.stringify(bad));
  }
});

test("a failed diag answer deletes nothing and a later answer for another request is ignored", () => {
  const w = world({ ids: ALL });
  w.forget();
  w.forgot({ ok: false, error: "x" });
  assert.equal(w.structures.size, 4);
  w.forgot({ id: "other" });
  assert.equal(w.structures.size, 4);
});

test("structures that can't be deleted are reported with the real count and error, not as ok", () => {
  const w = world({ ids: ALL, failDelete: ["expedition:parcel_1"], keepAfterDelete: ["expedition:stash_2"] });
  w.forget();
  w.forgot();
  assert.deepEqual([...w.structures].sort(), ["expedition:parcel_1", "expedition:stash_2"]);
  const reply = JSON.parse(w.events.at(-1).message);
  assert.equal(w.events.at(-1).id, "realm:diag_forgot");
  assert.equal(reply.ok, false);
  assert.match(reply.error, /2 saved structures couldn't be deleted/);
  assert.match(reply.error, /expedition:(parcel_1|stash_2)/);
  assert.ok(w.messages.some((m) => m.includes("couldn't be deleted")));
  assert.ok(w.warnings.some((m) => m.includes("couldn't be deleted")));
});

test("structures that can't be listed are reported, not as ok", () => {
  const w = world({ ids: ALL, failList: true });
  w.forget();
  w.forgot();
  const reply = JSON.parse(w.events.at(-1).message);
  assert.equal(reply.ok, false);
  assert.match(reply.error, /couldn't be listed/);
});

test("while an expedition runs the stashes stay (they hold players' own items) and the parcels go", () => {
  const w = world({ ids: ALL, busy: true });
  w.forget();
  w.forgot();
  assert.deepEqual([...w.structures].sort(), ["expedition:stash_1", "expedition:stash_2"]);
  assert.ok(w.messages.some((m) => m.includes("2 stash structures were kept")), w.messages.join("|"));
});

test("a stash an online player is still waiting for stays, the rest go", () => {
  const w = world({ ids: ALL, stashOfOnline: ["expedition:stash_2"] });
  w.forget();
  w.forgot();
  assert.deepEqual([...w.structures], ["expedition:stash_2"]);
});

// ---------------------------------------------------------------------------
// forget: no new saves while the world data can't be written
// ---------------------------------------------------------------------------

function carrier() {
  const inv = { size: 36, items: new Map([[0, "diamond"]]), getItem(k) { return this.items.get(k); }, setItem(k) { this.items.delete(k); } };
  return { inv, p: { getDynamicProperty: () => undefined, setDynamicProperty() {}, getComponent: (c) => (c === "minecraft:inventory" ? { container: inv } : { getEquipment: () => undefined, setEquipment() {} }) } };
}

test("after a confirmed forget no stash or parcel is made, and the inventory is left alone", () => {
  const w = world({ ids: [] });
  w.forget();
  const { p, inv } = carrier();
  const made = [];
  assert.equal(w.api.saveStash(p, { spawnEntity: (...a) => made.push(a) }, { x: 0, y: 0, z: 0 }), false);
  assert.equal(w.api.saveParcel("p1", "spoils", [{ getLore: () => [] }], { spawnEntity: (...a) => made.push(a) }, { x: 0, y: 0, z: 0 }), false);
  assert.equal(made.length, 0);
  assert.equal(w.structures.size, 0);
  assert.equal(inv.items.get(0), "diamond");
});

test("saving comes back when the forget fails or is never answered", () => {
  const failed = world({ ids: [] });
  failed.forget();
  failed.forgot({ ok: false });
  assert.equal(failed.api.saveParcel("p1", "spoils", [], {}, {}), true, "nothing to keep is still fine");
  const guarded = world({ ids: [] });
  guarded.forget();
  guarded.timers.forEach(([f]) => f());
  const { p } = carrier();
  assert.equal(guarded.api.saveStash(p, {}, { x: 0, y: 0, z: 0 }), false); // the fake dimension fails on purpose, after the counter write
  assert.equal(guarded.props.get("expedition:stash_next"), 6, "saving was allowed again: it reached the counter");
});
