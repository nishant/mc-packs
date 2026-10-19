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

const oldShard = JSON.stringify({ "overworld:10,64,0": { t: [["diamond", 5]], at: 1700000000000, b: "chest" } });

test("migration: a world with only load-time data from other packs is new, so private", async () => {
  const w = await world({ props: { "diag:x": "1", "settings:y": "2", "news:z": "3" } });
  assert.equal(w.sim.props.get("find:cfg"), undefined);
  assert.equal(w.sim.props.get("find:mig"), 1);
});

test("migration: an existing world with no find shard (other packs' player data) keeps the world-wide index", async () => {
  const w = await world({ props: { "stats:p1": "{}" } });
  assert.equal(JSON.parse(w.sim.props.get("find:cfg")).privateIndex, false);
});

test("migration: saved find settings alone mean an existing world, other settings kept", async () => {
  const w = await world({ props: { "find:cfg": JSON.stringify({ maxResults: 10 }) } });
  assert.deepEqual(JSON.parse(w.sim.props.get("find:cfg")), { maxResults: 10, privateIndex: false });
});

test("migration: an operator's explicit choice is never overwritten, and it runs once", async () => {
  const w = await world({ shards: [oldShard], props: { "find:cfg": JSON.stringify({ privateIndex: true }) } });
  assert.equal(JSON.parse(w.sim.props.get("find:cfg")).privateIndex, true);
  w.sim.props.set("find:cfg", JSON.stringify({ privateIndex: true, maxResults: 5 }));
  w.sim.game.emit("world.after.worldLoad", {});
  assert.equal(JSON.parse(w.sim.props.get("find:cfg")).privateIndex, true);
});
test("O28 review: an owner or shared player who never opened the container finds it when an access answer says it is theirs", async () => {
  const shard = JSON.stringify({ "overworld:10,64,0": { t: [["diamond", 5]], at: 1700000000000, b: "chest" } });
  const w = await world({ shards: [shard], props: { "find:cfg": JSON.stringify({ privateIndex: true }) }, items: { 10: ["diamond"] } });
  const ann = w.mk("Ann");
  const bob = w.mk("Bob");
  w.setAnswer((spots, player) => (player === "id-Ann" ? { ours: [0] } : {}));
  assert.equal((await w.find(ann, "diamond"))?.form.buttons.length, 1);
  assert.equal(await w.find(bob, "diamond"), undefined);
});

test("O28 review: a container in someone else's claim is never shown, even to its viewer; and 'ours' needs a live answer", async () => {
  const w = await world({ items: { 10: ["diamond"] } });
  const ann = w.mk("Ann");
  w.open(ann, 10);
  w.setAnswer(() => ({ closed: [0] }));
  assert.equal(await w.find(ann, "diamond"), undefined);
  w.setAnswer(undefined);
  assert.ok(await w.find(ann, "diamond"));
});

test("O28 review: a placed container is the placer's; many viewers never push the placer out", async () => {
  const w = await world({ items: { 10: ["diamond"] } });
  const ann = w.mk("Ann");
  w.place(ann, 10);
  for (let i = 0; i < 12; i++) w.open(w.mk(`V${i}`), 10);
  const bob = w.mk("Bob");
  assert.ok(await w.find(ann, "diamond"), "the placer still finds it");
  assert.equal(await w.find(bob, "diamond"), undefined);
  w.sim.step(700);
  const e = JSON.parse(w.sim.props.get("find:idx:0"))["overworld:10,64,0"];
  assert.deepEqual(e.o, ["id-Ann"]);
  assert.ok(e.w.length <= 8);
});

test("O28 review: a delayed look for a player who opened a container later replaced at the same spot is dropped", async () => {
  const w = await world({ items: { 10: ["diamond"] } });
  const ann = w.mk("Ann");
  const bob = w.mk("Bob");
  w.open(ann, 10);
  w.breakAt(ann, 10);
  w.replace(10, "chest", ["diamond"]);
  w.place(bob, 10);
  w.sim.step(1300); // both the 200 and the 1200 tick looks run
  assert.equal(await w.find(ann, "diamond"), undefined, "Ann does not inherit the new container");
  assert.ok(await w.find(bob, "diamond"));
});

test("O28 review: a container replaced by another type without a break event does not keep its viewers", async () => {
  const w = await world({ items: { 10: ["diamond"] } });
  const ann = w.mk("Ann");
  const bob = w.mk("Bob");
  w.open(ann, 10);
  w.replace(10, "barrel", ["diamond"]);
  w.open(bob, 10);
  assert.equal(await w.find(ann, "diamond"), undefined);
  assert.ok(await w.find(bob, "diamond"));
});