import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { facesWay } from "./test-bds/examples/saga-escort.js";

const src = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");
const a = src.indexOf("/** Blocks one interact scan slice");
const b = src.indexOf("/**\n * The outlines of an objective's spot");
assert.ok(a >= 0 && b > a, "has the bounded scan");
const c = src.indexOf("/** Ends a scene: its characters");
const d = src.indexOf("/** The far-away timer");
assert.ok(c >= 0 && d > c, "has endScene and endScenesOf");

/** A world with a manual tick: runInterval handlers run once per tick(), as in the game. */
function world({ blocks = () => ({ typeId: "minecraft:air" }), valid = true, dimId = "minecraft:overworld" } = {}) {
  const timers = new Set();
  const scenes = new Map();
  const system = { currentTick: 100, runInterval: (fn) => { const t = { fn }; timers.add(t); return t; }, clearRun: (t) => timers.delete(t) };
  const reads = { n: 0, perTick: [] };
  const dim = { id: dimId, getBlock: (p) => { reads.n++; return blocks(p); } };
  const player = { id: "p1", isValid: valid, dimension: dim, location: { x: 0.5, y: 64, z: 0.5 } };
  const api = runInNewContext(
    `${src.slice(a, b).replaceAll("export ", "")}\n${src.slice(c, d).replaceAll("export ", "")}\n({ interactBlocks, endScene, endScenesOf, interactScanStats })`,
    {
      across: (p, l) => Math.hypot(p.x - l.x, p.z - l.z),
      radiusOf: (o) => o.radius ?? 12,
      groundAt: () => 64,
      scenes,
      sk: (pid, key) => `${pid}|${key}`,
      system,
      removeActors() {},
      tended: new Map(),
    },
  );
  const scene = { kind: "interact", pid: "p1", key: "k", seen: 0, data: {} };
  scenes.set("p1|k", scene);
  const tick = () => {
    const before = reads.n;
    system.currentTick++;
    for (const t of [...timers]) t.fn();
    reads.perTick.push(reads.n - before);
  };
  return { ...api, scenes, scene, player, dim, system, timers, tick, reads };
}

const obj = { type: "interact", blocks: ["minecraft:lever"], radius: 12 };
const loc = { dim: "minecraft:overworld", x: 0.5, y: 64, z: 0.5 };
const lever = (x, y, z) => (p) => ({ typeId: p.x === x && p.y === y && p.z === z ? "minecraft:lever" : "minecraft:air" });
const coords = (list) => [...list].map((f) => [f.x, f.y, f.z]);
const finish = (w) => {
  for (let i = 0; i < 200 && w.timers.size; i++) w.tick();
};

test("interactBlocks scans in the background one bounded slice a tick, never more than 256 blocks", () => {
  const w = world({ blocks: lever(3, 64, 2) });
  const first = w.interactBlocks(w.scene, w.player, obj, loc);
  assert.deepEqual(coords(first), [[0, 64, 0]], "the first draw uses the spot");
  assert.equal(w.reads.n, 0, "starting reads nothing: the work is on later ticks");
  finish(w);
  assert.ok(Math.max(...w.reads.perTick) <= 256, `most blocks read in one tick: ${Math.max(...w.reads.perTick)}`);
  assert.ok(w.reads.perTick.filter((n) => n > 0).length > 10, "the box took many ticks");
  assert.ok(w.interactScanStats.slices > 10);
  assert.deepEqual(coords(w.scene.data.interactBlocks).map((r) => [...r]), [[3, 64, 2]]);
  assert.equal(w.scene.data.interactJob, undefined);
  assert.equal(w.interactScanStats.active, 0);
});

test("scans in flight are capped, and the rest wait their turn", () => {
  const w = world();
  const list = [];
  for (let i = 0; i < 6; i++) {
    const s = { kind: "interact", pid: "p1", key: `k${i}`, seen: 0, data: {} };
    w.scenes.set(`p1|k${i}`, s);
    list.push(s);
    w.interactBlocks(s, w.player, obj, loc);
  }
  assert.equal(w.interactScanStats.active, 4);
  assert.ok(list[5].data.interactTry <= w.system.currentTick + 20, "the waiting scan tries again in 20 ticks");
  w.tick();
  assert.ok(w.reads.perTick[0] <= 4 * 256, `${w.reads.perTick[0]} reads in a tick`);
});

test("endScene and endScenesOf stop the scan at once and it never writes into the ended scene", () => {
  for (const end of [(w) => w.endScene("p1", "k"), (w) => w.endScenesOf("p1")]) {
    const w = world({ blocks: lever(3, 64, 2) });
    w.interactBlocks(w.scene, w.player, obj, loc);
    w.tick();
    const reads = w.reads.n;
    end(w);
    assert.equal(w.scene.data.interactJob, undefined, "the job token is cleared");
    w.tick();
    assert.equal(w.reads.n, reads, "no more blocks are read after the scene ended");
    assert.equal(w.timers.size, 0);
    assert.equal(w.interactScanStats.active, 0);
    assert.equal(w.scene.data.interactBlocks, undefined);
  }
});

test("a scene that is replaced, a player who left, or another dimension also stops the scan", () => {
  const replaced = world();
  replaced.interactBlocks(replaced.scene, replaced.player, obj, loc);
  replaced.scenes.set("p1|k", { kind: "interact", pid: "p1", key: "k", seen: 0, data: {} });
  replaced.tick();
  assert.equal(replaced.timers.size, 0);
  assert.equal(replaced.reads.n, 0);

  const left = world();
  left.interactBlocks(left.scene, left.player, obj, loc);
  left.player.isValid = false;
  left.tick();
  assert.equal(left.timers.size, 0);

  const moved = world();
  moved.interactBlocks(moved.scene, moved.player, obj, loc);
  moved.player.dimension = { id: "minecraft:nether", getBlock: () => assert.fail("must not read the other dimension") };
  moved.tick();
  assert.equal(moved.timers.size, 0);
  assert.equal(moved.interactScanStats.active, 0);
});

test("an unloaded or throwing block keeps the matches already found and does not abort the scan or retry in 40 ticks", () => {
  const w = world({
    blocks: (p) => {
      if (p.x === 5) throw new Error("chunk not loaded");
      if (p.x === 6) return undefined;
      return { typeId: p.x === 3 && p.y === 64 && p.z === 2 ? "minecraft:lever" : "minecraft:air" };
    },
  });
  w.interactBlocks(w.scene, w.player, obj, loc);
  finish(w);
  assert.deepEqual(coords(w.scene.data.interactBlocks).map((r) => [...r]), [[3, 64, 2]], "the lever found before the bad blocks is kept");
  assert.ok(w.scene.data.interactTry > w.system.currentTick + 50, "a scan that found something does not retry in 40 ticks");
  assert.ok(w.reads.n > 5000, "the whole box was still read past the bad blocks");
});

test("an incomplete scan with nothing found keeps the spot and retries in 40 ticks", () => {
  const w = world({ blocks: () => undefined });
  w.interactBlocks(w.scene, w.player, obj, loc);
  finish(w);
  assert.deepEqual(coords(w.scene.data.interactBlocks).map((r) => [...r]), [[0, 64, 0]]);
  assert.equal(w.scene.data.interactTry, w.system.currentTick + 40);
});

test("matches found are kept: up to the 4 nearest", () => {
  const w = world({ blocks: (p) => ({ typeId: p.y === 64 && p.z === 0 && p.x > 0 && p.x < 8 ? "minecraft:lever" : "minecraft:air" }) });
  w.interactBlocks(w.scene, w.player, obj, loc);
  finish(w);
  assert.deepEqual([...w.scene.data.interactBlocks.map((f) => f.x)], [1, 2, 3, 4]);
});

test("a villager head turned to a close player still counts as walking the way he goes", () => {
  const move = { dx: 0.4, dz: 0 }; // east
  assert.equal(facesWay(-90, move, { dx: 3, dz: 0 }), true);
  assert.equal(facesWay(0, move, { dx: 0, dz: 3 }), true, "looking at the player south of the trail");
  assert.equal(facesWay(90, move, { dx: 3, dz: 0 }), false, "facing away from both");
});
