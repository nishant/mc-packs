// MCP-085: exact-id hits in containers a player may not see must not hide their own partial matches. Drives the real
// /realm:find with the private index on (same harness as find-private.test.mjs).
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

async function world({ shards, items = {}, props = {}, load = true } = {}) {
  const sim = createSim();
  for (const [k, v] of Object.entries(props)) sim.props.set(k, v);
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
  if (load) sim.game.emit("world.after.worldLoad", {});
  const mk = (n) => {
    const p = sim.join(n, { id: `id-${n}` });
    p.dimension = dim;
    return p;
  };
  const open = (p, x) => sim.game.emit("world.after.playerInteractWithBlock", { player: p, block: blocks.get(x) });
  /** Answers Chest Finder's access question the way Land Claims or Stash would: `answer(spots, playerId) -> { closed, ours }`. */
  let answer;
  const push = sim.game.sent.push.bind(sim.game.sent);
  sim.game.sent.push = (s) => {
    const n = push(s);
    if (answer && s.id === "realm:access_check") {
      const ask = JSON.parse(s.message);
      if (ask.id !== "hello") {
        const { closed = [], ours = [] } = answer(ask.spots, ask.player);
        sim.game.deliver("realm:access_check_result", JSON.stringify({ id: ask.id, from: "claims_bp", closed, ours }));
      }
    }
    return n;
  };
  const find = async (p, q) => {
    p.messages.length = 0;
    sim.run("realm:find", p, q);
    await sim.settle(8);
    sim.step(60);
    await sim.settle(3);
    return sim.pending.length ? sim.pending.shift() : undefined;
  };
  const place = (p, x) => sim.game.emit("world.after.playerPlaceBlock", { player: p, block: blocks.get(x) });
  const breakAt = (p, x) => sim.game.emit("world.after.playerBreakBlock", { player: p, block: blocks.get(x), brokenBlockPermutation: { type: { id: blocks.get(x).typeId } } });
  const replace = (x, id, list) => blocks.set(x, { ...chest(dim, x, list.map((n) => ({ typeId: `minecraft:${n}`, amount: 3 }))), typeId: `minecraft:${id}` });
  return { sim, mk, open, find, blocks, dim, place, breakAt, replace, setAnswer: (f) => (answer = f) };
}


test("private index: another player's exact match does not hide my partial match", async () => {
  const w = await world({ items: { 10: ["diamond"], 20: ["diamond_sword"] } });
  const ann = w.mk("Ann");
  const bob = w.mk("Bob");
  w.open(bob, 10);
  w.open(ann, 20);
  const f = await w.find(ann, "diamond");
  assert.ok(f, "Ann still gets a result list");
  assert.equal(f.form.buttons.length, 1);
});

test("an exact match still wins over partial ones when both are visible", async () => {
  const w = await world({ items: { 10: ["diamond"], 20: ["diamond_sword"] } });
  const ann = w.mk("Ann");
  w.open(ann, 10);
  w.open(ann, 20);
  const f = await w.find(ann, "diamond");
  assert.ok(f);
  assert.equal(f.form.buttons.length, 1);
});
