// Audit C: palette survival builds charge exactly what is placed per block type (MCP-003), and Destroy drops never
// use the Fortune level as an item count (MCP-002).
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
const { startPlacementQueue } = await import("../packs/build_bp/scripts/core/PlacementQueue.js");
startPlacementQueue();
const { placeBlocks } = await import("../packs/build_bp/scripts/core/BlockPlacer.js");
const { trimPlacementByType } = await import("../packs/build_bp/scripts/core/beds.js");
const { getBlockDrop } = await import("../packs/build_bp/scripts/core/BlockDestroyer.js");

let seq = 0;
function pal(counts) {
  const slots = new Map();
  Object.entries(counts).forEach(([t, n], i) => slots.set(i, new mc.ItemStack(t, n)));
  const props = new Map([["eb:palette", "all"], ["eb:palette_weight", "unique"]]);
  const inv = {
    size: 36,
    getItem: (i) => slots.get(i),
    setItem: (i, item) => { if (!item || item.amount <= 0) slots.delete(i); else slots.set(i, item); },
    addItem: (item) => { for (let i = 0; i < 36; i++) if (!slots.get(i)) { slots.set(i, item); return undefined; } return item; },
  };
  const p = {
    id: `cb${++seq}`, name: `CB${seq}`, isValid: true, isOp: true, isSneaking: false, selectedSlotIndex: 0,
    dimension: mc.world.getDimension("minecraft:overworld"), location: { x: 0, y: 64, z: 0 },
    getGameMode: () => "survival", getRotation: () => ({ x: 0, y: 0 }),
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
    getComponent: () => ({ container: inv }),
    sendMessage() {}, playSound() {}, onScreenDisplay: { setActionBar() {} }, hasTag: () => false,
  };
  mc.addPlayer(p);
  return p;
}
const have = (p, t) => {
  const c = p.getComponent().container;
  let n = 0;
  for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === t) n += c.getItem(i).amount;
  return n;
};

test("trimPlacementByType keeps bed halves together and skips what cannot be paid", () => {
  const e = [
    { x: 0, typeId: "a" }, { x: 1, typeId: "a" },
    { x: 2, typeId: "b", _bedGroup: 1 }, { x: 3, typeId: "b", _bedGroup: 1, _bedHead: true },
    { x: 4, typeId: "b", _bedGroup: 2 }, { x: 5, typeId: "b", _bedGroup: 2, _bedHead: true },
    { x: 6, typeId: "a" },
  ];
  const r = trimPlacementByType(e, (x) => x.typeId, new Map([["a", 2], ["b", 1]]));
  assert.deepEqual(r.positions.map((x) => x.x), [0, 1, 2, 3]);
  assert.equal(r.charged.get("a"), 2);
  assert.equal(r.charged.get("b"), 1);
});

test("MCP-003: a palette with a scarce type places only what is owned of each type", async () => {
  const p = pal({ "minecraft:diamond_block": 1, "minecraft:cobblestone": 40 });
  const positions = [];
  for (let x = 0; x < 100; x++) positions.push({ x: 5000 + x, y: 64, z: 0 });
  const placed = placeBlocks(p, positions, { x: 5000, y: 64, z: 0 }, "minecraft:diamond_block", {}, { immediate: true });
  const dim = mc.world.getDimension("minecraft:overworld");
  const count = {};
  for (const pos of positions) { const t = dim.getBlock(pos).typeId; count[t] = (count[t] ?? 0) + 1; }
  assert.ok((count["minecraft:diamond_block"] ?? 0) <= 1, JSON.stringify(count));
  assert.ok((count["minecraft:cobblestone"] ?? 0) <= 40, JSON.stringify(count));
  assert.equal(have(p, "minecraft:diamond_block") + (count["minecraft:diamond_block"] ?? 0), 1);
  assert.equal(have(p, "minecraft:cobblestone") + (count["minecraft:cobblestone"] ?? 0), 40);
  assert.equal(placed, (count["minecraft:diamond_block"] ?? 0) + (count["minecraft:cobblestone"] ?? 0));
});

test("MCP-002: a default-branch drop asks for one item, whatever the Fortune level", () => {
  let asked;
  const block = { typeId: "minecraft:diamond_block", getItemStack: (n) => { asked = n; return { typeId: "minecraft:diamond_block", amount: n ?? 1 }; } };
  const drop = getBlockDrop(block, false, 3);
  assert.equal(asked, 1);
  assert.equal(drop.amount, 1);
});
