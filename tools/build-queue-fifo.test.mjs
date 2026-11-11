// MCP-014: the placement queue is a per-player FIFO (no splice) and keeps entries whose chunk is not loaded yet.
// MCP-030: ticking areas are remembered in a world property and removed again on the next world load.
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mockUrl = pathToFileURL(path.resolve("tools/build-w9-mc-mock.mjs")).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@minecraft/server" || specifier === "@minecraft/server-ui") return { url: mockUrl, shortCircuit: true };
    return next(specifier, context);
  },
});

const mc = await import("./build-w9-mc-mock.mjs");
const { startPlacementQueue, enqueue, setPlayerBuildSpeed, queueSize } = await import("../packs/build_bp/scripts/core/PlacementQueue.js");
const { ensureChunkLoaders, releaseChunkLoaders } = await import("../packs/build_bp/scripts/core/ChunkLoader.js");
startPlacementQueue();

const dim = mc.world.getDimension("minecraft:overworld");
const perm = mc.BlockPermutation.resolve("minecraft:stone");

test("20,000 queued entries drain in order, quickly", () => {
  const order = [];
  const realGet = dim.getBlock;
  dim.getBlock = (pos) => {
    const b = realGet.call(dim, pos);
    if (!b.__wrapped) {
      const set = b.setPermutation;
      b.setPermutation = (p) => { order.push(pos.x); set(p); };
      b.__wrapped = true;
    }
    return b;
  };
  try {
    setPlayerBuildSpeed("fifo1", 100000);
    for (let x = 0; x < 20000; x++) enqueue("fifo1", "minecraft:overworld", { x, y: 70, z: 900 }, perm);
    assert.equal(queueSize(), 20000);
    const t0 = Date.now();
    for (let n = 0; n < 500 && queueSize() > 0; n++) mc.flushIntervals(1);
    assert.equal(queueSize(), 0);
    assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0} ms`);
    assert.equal(order.length, 20000);
    for (let i = 0; i < order.length; i++) if (order[i] !== i) assert.fail(`out of order at ${i}: ${order[i]}`);
  } finally {
    dim.getBlock = realGet;
  }
});

test("an entry in an unloaded chunk is retried, not dropped", () => {
  const realGet = dim.getBlock;
  let calls = 0;
  dim.getBlock = (pos) => {
    if (pos.z === 777) {
      calls++;
      if (calls <= 3) {
        const e = new Error("unloaded");
        e.name = "LocationInUnloadedChunkError";
        throw e;
      }
    }
    return realGet.call(dim, pos);
  };
  try {
    enqueue("fifo2", "minecraft:overworld", { x: 1, y: 70, z: 777 }, perm);
    mc.flushIntervals(1);
    assert.equal(queueSize(), 1, "kept after the first failure");
    mc.flushIntervals(10);
    assert.equal(queueSize(), 0);
    assert.equal(realGet.call(dim, { x: 1, y: 70, z: 777 }).typeId, "minecraft:stone");
    assert.equal(calls, 4);
  } finally {
    dim.getBlock = realGet;
  }
});

test("an entry that never loads is dropped after 200 attempts", () => {
  const realGet = dim.getBlock;
  dim.getBlock = (pos) => (pos.z === 778 ? undefined : realGet.call(dim, pos));
  try {
    enqueue("fifo3", "minecraft:overworld", { x: 1, y: 70, z: 778 }, perm);
    mc.flushIntervals(150);
    assert.equal(queueSize(), 1);
    mc.flushIntervals(100);
    assert.equal(queueSize(), 0);
  } finally {
    dim.getBlock = realGet;
  }
});

test("MCP-030: ticking areas are saved, removed on release and cleaned on worldLoad", () => {
  const cmds = [];
  const realRun = dim.runCommand;
  dim.runCommand = (c) => { cmds.push(c); return { successCount: 1 }; };
  try {
    ensureChunkLoaders("tapl1", "minecraft:overworld", [{ pos: { x: 5, y: 70, z: 5 } }]);
    const saved = JSON.parse(mc.world.getDynamicProperty("eb:tickingAreas"));
    assert.equal(saved.length, 1);
    assert.equal(saved[0].dimensionId, "minecraft:overworld");
    const name = saved[0].name;
    releaseChunkLoaders("tapl1");
    assert.equal(mc.world.getDynamicProperty("eb:tickingAreas"), undefined);
    ensureChunkLoaders("tapl1", "minecraft:overworld", [{ pos: { x: 5, y: 70, z: 5 } }]);
    cmds.length = 0;
    mc.fireEvent("world.after.worldLoad", {});
    assert.deepEqual(cmds, [`tickingarea remove ${name}`]);
    assert.equal(mc.world.getDynamicProperty("eb:tickingAreas"), undefined);
  } finally {
    dim.runCommand = realRun;
  }
});
