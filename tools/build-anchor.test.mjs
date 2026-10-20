// F8: a build anchor is kept while the player holds something else, and replaced only by starting over with a
// different block or a digging tool. Real main.js interaction handlers, fired through the offline stand-in.
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
await import("../packs/build_bp/scripts/main.js");
const { getState, setMode, setAnchor } = await import("../packs/build_bp/scripts/core/PlayerState.js");

let seq = 0;
function builder(gameMode, stacks) {
  const slots = new Map(stacks.map(([i, id]) => [i, new mc.ItemStack(id, id.includes("pickaxe") ? 1 : 64)]));
  const props = new Map();
  const p = {
    id: `an${++seq}`, name: `An${seq}`, isValid: true, isOp: true, isSneaking: false, selectedSlotIndex: 0,
    dimension: mc.world.getDimension("minecraft:overworld"), location: { x: 0, y: 64, z: 0 },
    getGameMode: () => gameMode, getRotation: () => ({ x: 0, y: 0 }),
    getHeadLocation: () => ({ x: 0.5, y: 65.6, z: 0.5 }), getViewDirection: () => ({ x: 1, y: 0, z: 0 }),
    getBlockFromViewDirection: () => undefined,
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
    getComponent: () => ({ container: { size: 36, getItem: (i) => slots.get(i), setItem: (i, it) => { if (it) slots.set(i, it); else slots.delete(i); } } }),
    sendMessage() {}, playSound() {}, onScreenDisplay: { setActionBar() {} }, hasTag: () => false, addTag() {}, removeTag() {},
    runCommand() { return { successCount: 1 }; },
  };
  mc.addPlayer(p);
  return p;
}
const dim = mc.world.getDimension("minecraft:overworld");
function click(p, typeId, at) {
  const ev = { player: p, itemStack: typeId ? new mc.ItemStack(typeId, 1) : undefined, block: dim.getBlock(at), blockFace: "Up", cancel: false };
  ev.block.location = at;
  return mc.fireEvent("world.before.playerInteractWithBlock", ev);
}
const wait = () => new Promise((r) => setTimeout(r, 260)); // the handlers' 200 ms click debounce

test("F8: clicking a block with a sword or food keeps the anchor and builds nothing", async () => {
  const p = builder("survival", [[0, "minecraft:stone"]]);
  setMode(p, "line");
  setAnchor(p, { x: 10, y: 64, z: 10 }, "minecraft:stone", {});
  await wait();
  dim.getBlock({ x: 14, y: 63, z: 10 }).setType("minecraft:grass_block");
  for (const other of ["minecraft:diamond_sword", "minecraft:apple"]) {
    const ev = click(p, other, { x: 14, y: 63, z: 10 });
    assert.equal(ev.cancel, false, `${other}: the click is left to the game`);
    assert.deepEqual(getState(p).anchor && { ...getState(p).anchor }, { x: 10, y: 64, z: 10, dimensionId: "minecraft:overworld" });
    assert.equal(getState(p).blockTypeId, "minecraft:stone");
  }
  mc.flushIntervals(5);
  assert.equal(dim.getBlock({ x: 12, y: 64, z: 10 }).typeId, "minecraft:air", "nothing was built");
});

test("F8: another block starts a new anchor, and a digging tool on a block anchor sets a destroy anchor", async () => {
  const p = builder("creative", [[0, "minecraft:stone"]]);
  setMode(p, "line");
  setAnchor(p, { x: 30, y: 64, z: 10 }, "minecraft:stone", {});
  await wait();
  click(p, "minecraft:oak_planks", { x: 34, y: 63, z: 10 });
  assert.equal(getState(p).anchor, null, "the stone anchor is replaced (the planks anchor is set when the block lands)");
  setAnchor(p, { x: 30, y: 64, z: 10 }, "minecraft:stone", {});
  await wait();
  dim.getBlock({ x: 34, y: 64, z: 10 }).setType("minecraft:dirt");
  const ev = click(p, "minecraft:diamond_pickaxe", { x: 34, y: 64, z: 10 });
  assert.equal(getState(p).blockTypeId, "eb:destroy", "a destroy anchor, not a stone build with a pickaxe");
  assert.deepEqual({ ...getState(p).anchor }, { x: 34, y: 64, z: 10, dimensionId: "minecraft:overworld" });
  assert.equal(ev.cancel, true);
  mc.flushIntervals(5);
  for (let x = 30; x <= 34; x++) assert.notEqual(dim.getBlock({ x, y: 64, z: 10 }).typeId, "minecraft:stone", `no stone at ${x}`);
});

test("an anchor from another dimension is dropped, never built from, by a click or a dimension change", async () => {
  const { confirmPlacement } = await import("../packs/build_bp/scripts/main.js");
  const nether = mc.world.getDimension("minecraft:nether");
  const p = builder("survival", [[0, "minecraft:stone"]]);
  setMode(p, "line");
  setAnchor(p, { x: 50, y: 64, z: 10 }, "minecraft:stone", {});
  await wait();
  // Through a portal with a sword in hand: the hand kept the anchor, and no dimension event has run yet.
  p.dimension = nether;
  confirmPlacement(p, { x: 54, y: 64, z: 10 });
  mc.flushIntervals(5);
  assert.equal(getState(p).anchor, null, "the overworld anchor is dropped");
  for (let x = 50; x <= 54; x++) {
    assert.notEqual(nether.getBlock({ x, y: 64, z: 10 }).typeId, "minecraft:stone", `no stone in the nether at ${x}`);
    assert.notEqual(dim.getBlock({ x, y: 64, z: 10 }).typeId, "minecraft:stone", `no stone in the overworld at ${x}`);
  }
  assert.equal(p.getComponent().container.getItem(0)?.amount, 64, "no stone charged");

  // The dimension change event drops it too, before any click.
  p.dimension = dim;
  setAnchor(p, { x: 50, y: 64, z: 20 }, "minecraft:stone", {});
  p.dimension = nether;
  mc.fireEvent("world.after.playerDimensionChange", { player: p, fromDimension: dim, toDimension: nether });
  assert.equal(getState(p).anchor, null, "dropped on the dimension change");
});
