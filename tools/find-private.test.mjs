// Chest Finder private index (audit O28): a player finds only the containers they opened; existing worlds keep the
// world-wide index until an operator turns "Private index" on. Drives the real /realm:find and block events.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

function chest(dim, x, items) {
  const c = {
    typeId: "minecraft:chest",
    x, y: 64, z: 0,
    location: { x, y: 64, z: 0 },
    dimension: dim,
    permutation: { getAllStates: () => ({}) },
    offset: () => undefined,
    getComponent: () => ({ container: { size: 27, getItem: (i) => items[i] } }),
  };
  return c;
}

async function world({ shards, items = {} } = {}) {
  const sim = createSim();
  if (shards) shards.forEach((s, i) => sim.props.set(`find:idx:${i}`, s));
  const blocks = new Map();
  const dim = {
    id: "minecraft:overworld",
    heightRange: { min: -64, max: 320 },
    getBlock: (p) => blocks.get(p.x),
    getBlocks: () => ({ getBlockLocationIterator: () => [] }),
  };
  for (const [x, list] of Object.entries(items)) blocks.set(Number(x), chest(dim, Number(x), list.map((id) => ({ typeId: `minecraft:${id}`, amount: 3 }))));
  let server;
  Object.defineProperty(sim, "server", {
    get: () => server,
    set: (v) => {
      server = v;
      v.BlockTypes = { get: () => ({}) };
    },
  });
  await sim.load("find_bp");
  sim.boot();
  const mk = (n) => {
    const p = sim.join(n, { id: `id-${n}` });
    p.dimension = dim;
    return p;
  };
  const open = (p, x) => sim.game.emit("world.after.playerInteractWithBlock", { player: p, block: blocks.get(x) });
  const find = async (p, q) => {
    p.messages.length = 0;
    sim.run("realm:find", p, q);
    await sim.settle(8);
    sim.step(60);
    await sim.settle(3);
    return sim.pending.length ? sim.pending.shift() : undefined;
  };
  return { sim, mk, open, find, blocks, dim };
}

test("new world: a player finds only the container they opened", async () => {
  const w = await world({ items: { 10: ["diamond"], 20: ["diamond"] } });
  const ann = w.mk("Ann");
  const bob = w.mk("Bob");
  w.open(ann, 10);
  w.open(bob, 20);
  const f = await w.find(ann, "diamond");
  assert.ok(f, "Ann gets a result list");
  assert.equal(f.form.buttons.length, 1);
  assert.match(f.form.buttons[0], /10|blocks/);
});

test("new world: nothing opened means nothing found, with a private-index message", async () => {
  const w = await world({ items: { 10: ["diamond"] } });
  const ann = w.mk("Ann");
  const bob = w.mk("Bob");
  w.open(bob, 10);
  const f = await w.find(ann, "diamond");
  assert.equal(f, undefined);
  assert.ok(ann.messages.some((m) => /private/.test(m)), ann.messages.join("|"));
});

test("existing world keeps the world-wide index, old entries still found", async () => {
  const old = JSON.stringify({ "overworld:10,64,0": { t: [["diamond", 5]], at: 1700000000000, b: "chest" }, "overworld:20,64,0": { t: [["diamond", 5]], at: 1700000000000, b: "chest", extra: 1 } });
  const w = await world({ shards: [old] });
  const ann = w.mk("Ann");
  w.sim.step(1);
  const f = await w.find(ann, "diamond");
  assert.ok(f);
  assert.equal(f.form.buttons.length, 2);
  assert.equal(JSON.parse(w.sim.props.get("find:cfg")).privateIndex, false);
  assert.equal(w.sim.props.get("find:mig"), 1);
});

test("an operator can switch an existing world to private; old entries then wait for their owners", async () => {
  const old = JSON.stringify({ "overworld:10,64,0": { t: [["diamond", 5]], at: 1700000000000, b: "chest" } });
  const w = await world({ shards: [old] });
  const ann = w.mk("Ann");
  w.sim.props.set("find:cfg", JSON.stringify({ privateIndex: true }));
  const f = await w.find(ann, "diamond");
  assert.equal(f, undefined);
});

test("opening a container records the player once, kept across saves with unknown fields", async () => {
  const old = JSON.stringify({ "overworld:10,64,0": { t: [["diamond", 5]], at: 1700000000000, b: "chest", keep: "me" } });
  const w = await world({ shards: [old], items: { 10: ["diamond"] } });
  const ann = w.mk("Ann");
  w.open(ann, 10);
  w.open(ann, 10);
  w.sim.step(700);
  const saved = JSON.parse(w.sim.props.get("find:idx:0"));
  assert.deepEqual(saved["overworld:10,64,0"].w, ["id-Ann"]);
  assert.equal(saved["overworld:10,64,0"].keep, "me");
});
