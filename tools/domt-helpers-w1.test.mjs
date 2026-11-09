// Deck of Many Things helpers (audit MCP-074/075/076): the shared safe zones copy, the bounded restore index and a
// far teleport that throws, through the real packs/domt_bp/scripts/helpers.js.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

/** A dimension whose columns are loaded unless listed in `unloaded`. */
function fakeDim(id = "minecraft:overworld", unloaded = new Set()) {
  return {
    id,
    heightRange: { min: -64, max: 320 },
    reads: 0,
    getBlock(loc) {
      this.reads++;
      if (unloaded.has(`${loc.x},${loc.z}`)) return undefined;
      return { typeId: "minecraft:stone", isAir: false, isLiquid: false, setType() {} };
    },
  };
}

async function load() {
  const sim = createSim();
  const helpers = await sim.load("domt_bp", "helpers.js");
  const dims = { "minecraft:overworld": fakeDim() };
  sim.server.world.getDimension = (id) => dims[id] ?? (dims[id] = fakeDim(id));
  return { sim, helpers, dims };
}

const task = (id, x, at = 0) => ({ id, dim: "minecraft:overworld", at, types: ["minecraft:dirt", "minecraft:stone"], blocks: [[x, 64, 0, 0, 1]] });

test("MCP-075: zones sent numbered from 0 and with a short dimension id are honored", async () => {
  const { sim, helpers } = await load();
  const send = (m) => {
    sim.game.deliver("realm:zones", JSON.stringify(m));
  };
  send({ src: "x", part: 0, parts: 2, zones: [{ id: "a", dim: "overworld", x: 100, z: 100, r: 10 }] });
  assert.equal(helpers.zoneCount(), 0, "incomplete until the second part");
  send({ src: "x", part: 1, parts: 2, zones: [{ id: "b", dim: "minecraft:overworld", x: 500, z: 0, r: 5, shape: "square" }] });
  assert.equal(helpers.zoneCount(), 2);
  assert.equal(helpers.inZone("minecraft:overworld", 105, 100, 0), true);
  assert.equal(helpers.inZone("minecraft:overworld", 130, 100, 0), false);
  assert.equal(helpers.inZone("minecraft:overworld", 130, 100, 25), true, "the pad grows the box");
  assert.equal(helpers.inZone("minecraft:nether", 100, 100, 0), false);
});

test("MCP-076: the restore index is bounded and an old plain-id index still loads", async () => {
  const { sim, helpers } = await load();
  for (let i = 0; i < 70; i++) helpers.saveTask(task(`t${i}`, i, Date.now() + 1e9));
  const index = JSON.parse(sim.props.get("domt:tasks"));
  assert.equal(index.length, 64);
  assert.equal(index[0].id, "t6", "the oldest were dropped");
  assert.deepEqual(Object.keys(index[0]).sort(), ["at", "dim", "id", "x", "y", "z"]);
  assert.equal(sim.props.has("domt:task:t0"), false, "a dropped task's data goes too");
  assert.equal(helpers.pendingTasks(), 64);

  // An index saved by the older version: plain ids.
  sim.props.clear();
  sim.props.set("domt:tasks", JSON.stringify(["old1"]));
  sim.props.set("domt:task:old1", JSON.stringify(task("old1", 3)));
  assert.equal(helpers.pendingTasks(), 1);
  assert.equal(helpers.restoreDue(), 1, "restored and dropped");
  assert.equal(helpers.pendingTasks(), 0);
});

test("MCP-076: a due task in an unloaded place is skipped without reading the task", async () => {
  const { sim, helpers, dims } = await load();
  dims["minecraft:overworld"] = fakeDim("minecraft:overworld", new Set(["9,0"]));
  helpers.saveTask(task("far", 9, 0));
  sim.counts.get = 0;
  assert.equal(helpers.restoreDue(), 0);
  assert.equal(sim.counts.get, 1, "only the index was read");
  assert.equal(helpers.pendingTasks(), 1, "kept for when the place loads");
  dims["minecraft:overworld"] = fakeDim();
  assert.equal(helpers.restoreDue(), 1);
  assert.equal(helpers.pendingTasks(), 0);
});

test("MCP-074: standable says no for a column that throws on read", async () => {
  const { helpers } = await load();
  const dim = { heightRange: { min: -64, max: 320 }, getBlock: () => ({ get isAir() { throw new Error("LocationInUnloadedChunkError"); } }) };
  assert.equal(helpers.standable(dim, 0, 64, 0), false);
});
