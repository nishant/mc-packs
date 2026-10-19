import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mockUrl = pathToFileURL(path.resolve("tools/build-w9-mc-mock.mjs")).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@minecraft/server" || specifier === "@minecraft/server-ui") {
      return { url: mockUrl, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const mc = await import("./build-w9-mc-mock.mjs");
const { placeBlocks } = await import("../packs/build_bp/scripts/core/BlockPlacer.js");
const { startPlacementQueue } = await import("../packs/build_bp/scripts/core/PlacementQueue.js");
startPlacementQueue();
const { destroyBlocks, UNBREAKABLE } = await import("../packs/build_bp/scripts/core/BlockDestroyer.js");
const { performUndo, performRedo } = await import("../packs/build_bp/scripts/core/UndoRedo.js");
const { executePaste } = await import("../packs/build_bp/scripts/core/Clipboard.js");
const { getState, setAnchor } = await import("../packs/build_bp/scripts/core/PlayerState.js");
const { holdsBuildTool } = await import("../packs/build_bp/scripts/utils/build-tool.js");
const { getPlacementStatesFromAir } = await import("../packs/build_bp/scripts/modes/AirBuildMode.js");
const { expandForClaims, dropIncompleteBeds } = await import("../packs/build_bp/scripts/core/beds.js");
const { get, set, getFor } = await import("../packs/build_bp/scripts/settings.js");
const { setMaxBlocks } = await import("../packs/build_bp/scripts/core/Settings.js");
const { startPreviewLoop } = await import("../packs/build_bp/scripts/core/Preview.js");

function inventory(stacks) {
  const slots = new Map(stacks);
  return {
    size: 36,
    getItem(i) { return slots.get(i); },
    setItem(i, item) { if (!item) slots.delete(i); else slots.set(i, item); },
    addItem(item) {
      for (let i = 0; i < 36; i++) {
        const cur = slots.get(i);
        if (cur?.typeId === item.typeId && cur.amount + item.amount <= 64) { cur.amount += item.amount; return undefined; }
        if (!cur) { slots.set(i, item); return undefined; }
      }
      return item;
    },
  };
}
function player(mode, stacks = []) {
  const props = new Map();
  const inv = inventory(stacks);
  const p = {
    id: `p${players}`,
    name: "Tester",
    isValid: true,
    isOp: true,
    selectedSlotIndex: 0,
    dimension: mc.world.getDimension("minecraft:overworld"),
    location: { x: 0, y: 64, z: 0 },
    getGameMode: () => mode,
    getRotation: () => ({ x: 0, y: 0 }),
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
    getComponent: () => ({ container: inv }),
    sendMessage() {},
    playSound() {},
    onScreenDisplay: { setActionBar() {} },
    hasTag: () => false,
  };
  players++;
  mc.addPlayer(p);
  return p;
}
let players = 1;

function count(p, id) {
  const c = p.getComponent().container;
  let n = 0;
  for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) n += c.getItem(i).amount;
  return n;
}
function at(x, y, z) {
  return mc.world.getDimension("minecraft:overworld").getBlock({ x, y, z });
}

test("survival place of one bed charges one item and undo/redo keeps both halves", () => {
  const p = player("survival", [[0, new mc.ItemStack("minecraft:bed", 1)]]);
  const placed = placeBlocks(p, [{ x: 4, y: 64, z: 4 }], { x: 4, y: 64, z: 4 }, "minecraft:bed", { direction: 0 }, { immediate: true });
  assert.equal(placed, 2);
  assert.equal(count(p, "minecraft:bed"), 0);
  assert.equal(at(4, 64, 4).typeId, "minecraft:bed");
  assert.equal(at(4, 64, 5).typeId, "minecraft:bed");
  assert.equal(at(4, 64, 5).permutation.getAllStates().head_piece_bit, true);
  performUndo(p);
  assert.equal(count(p, "minecraft:bed"), 1);
  assert.equal(at(4, 64, 4).typeId, "minecraft:air");
  assert.equal(at(4, 64, 5).typeId, "minecraft:air");
  performRedo(p);
  mc.flushIntervals();
  assert.equal(count(p, "minecraft:bed"), 0);
  assert.equal(at(4, 64, 4).typeId, "minecraft:bed");
  assert.equal(at(4, 64, 5).typeId, "minecraft:bed");
});

test("a claimed head drops the whole bed, and an unbreakable partner is not destroyed", () => {
  const expanded = expandForClaims([{ x: 8, y: 64, z: 8 }], "minecraft:bed", { direction: 0 }, 0);
  assert.equal(expanded.length, 2);
  const claimed = expanded.filter((pos) => pos.z !== 9);
  assert.equal(dropIncompleteBeds(claimed).length, 0);
  const p = player("creative");
  const dim = p.dimension;
  dim.getBlock({ x: 8, y: 70, z: 8 }).setPermutation(mc.BlockPermutation.resolve("minecraft:bed", { direction: 0, head_piece_bit: false, occupied_bit: false }));
  dim.getBlock({ x: 8, y: 70, z: 9 }).setType("minecraft:end_gateway");
  assert.equal(UNBREAKABLE.has("minecraft:end_gateway"), true);
  destroyBlocks(p, [{ x: 8, y: 70, z: 8 }]);
  mc.flushIntervals();
  assert.equal(at(8, 70, 8).typeId, "minecraft:bed");
  assert.equal(at(8, 70, 9).typeId, "minecraft:end_gateway");
});

test("air facing stays cardinal for beds, and a lost tool clears the anchor", () => {
  const lookingUp = player("survival");
  lookingUp.getRotation = () => ({ x: -80, y: 90 });
  const states = getPlacementStatesFromAir("minecraft:bed", lookingUp);
  assert.equal(states.direction, 1);
  assert.equal(states["minecraft:cardinal_direction"], undefined);
  assert.equal(states.head_piece_bit, false);
  const straw = getPlacementStatesFromAir("minecraft:straw_bed", lookingUp);
  assert.equal(straw["minecraft:cardinal_direction"], "west");
  const idle = player("survival");
  getState(idle).mode = "disable";
  setAnchor(idle, { x: 1, y: 2, z: 3 }, "minecraft:stone", {});
  assert.equal(holdsBuildTool(idle), false);
  const paste = player("survival");
  getState(paste).mode = "copy_paste";
  assert.equal(holdsBuildTool(paste), true);
  startPreviewLoop();
  mc.flushIntervals(2);
  assert.equal(getState(idle).anchor, null);
});

test("live cap clamps the default and a saved player choice without raising the config default", () => {
  mc.world.setDynamicProperty("eb:adminMaxBlocksCap", 2000);
  assert.equal(get("defaultMaxBlocks"), 2000);
  assert.equal(set("defaultMaxBlocks", 50000), "must be 64 to 2000");
  assert.equal(get("defaultMaxBlocks"), 2000);
  const p = player("survival");
  p.setDynamicProperty("eb:maxBlocks", 50000);
  assert.equal(getFor(p, "maxBlocks") <= 2000, true);
  setMaxBlocks(p, 90000);
  assert.equal(p.getDynamicProperty("eb:maxBlocks") <= 2000, true);
});

test("clipboard paste charges one bed and does not slice the pair off", () => {
  const p = player("survival", [[0, new mc.ItemStack("minecraft:bed", 1)]]);
  setMaxBlocks(p, 1);
  getState(p).clipboard = {
    isCut: false,
    captureFacing: 0,
    blocks: [
      { dx: 0, dy: 0, dz: 0, typeId: "minecraft:bed", permStates: { direction: 0, head_piece_bit: false, occupied_bit: false } },
      { dx: 0, dy: 0, dz: 1, typeId: "minecraft:bed", permStates: { direction: 0, head_piece_bit: true, occupied_bit: false } },
      { dx: 3, dy: 0, dz: 0, typeId: "minecraft:stone", permStates: {} },
    ],
  };
  const n = executePaste(p, { x: 20, y: 64, z: 20 });
  mc.flushIntervals();
  assert.equal(n, 2);
  assert.equal(count(p, "minecraft:bed"), 0);
  assert.equal(at(20, 64, 20).typeId, "minecraft:bed");
  assert.equal(at(20, 64, 21).typeId, "minecraft:bed");
  assert.equal(at(23, 64, 20).typeId, "minecraft:air");
});
