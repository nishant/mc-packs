// T6: refunds respect stack size, partial removal keeps the stack, books report a full inventory, op ignores tags.
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
// Real stacks clamp to maxAmount (beds stack to 1); the shared mock does not, so clamp here.
const maxOf = (id) => (id === "minecraft:bed" ? 1 : 64);
Object.defineProperty(mc.ItemStack.prototype, "maxAmount", { get() { return maxOf(this.typeId); } });
Object.defineProperty(mc.ItemStack.prototype, "amount", {
  get() { return this._amount; },
  set(v) { this._amount = Math.min(v, maxOf(this.typeId)); },
});
mc.ItemStack.prototype.setLore = function (l) { this.lore = l; };

const { giveBlocks, removeBlocks } = await import("../packs/build_bp/scripts/utils/InventoryUtils.js");
const { giveBuildingBook } = await import("../packs/build_bp/scripts/utils/Items.js");
const { isOp } = await import("../packs/build_bp/scripts/utils/Permissions.js");

function makePlayer({ addItem, tags = [], perm } = {}) {
  const slots = new Map();
  const spawned = [];
  const container = {
    size: 36,
    getItem: (n) => slots.get(n),
    setItem: (n, it) => { if (it) slots.set(n, it); else slots.delete(n); },
    addItem: addItem ?? ((st) => { for (let i = 0; i < 36; i++) if (!slots.has(i)) { slots.set(i, st); return undefined; } return st; }),
  };
  return {
    slots, spawned,
    commandPermissionLevel: perm ?? 0,
    hasTag: (t) => tags.includes(t),
    getComponent: (id) => (id === "minecraft:inventory" ? { container } : undefined),
    dimension: { spawnItem: (st) => spawned.push(st) },
    location: { x: 0, y: 0, z: 0 },
  };
}

test("refunding 4 beds gives 4, one per stack", () => {
  const p = makePlayer({ addItem: (st) => st }); // full inventory: everything spawns
  giveBlocks(p, "minecraft:bed", 4);
  assert.equal(p.spawned.reduce((n, s) => n + s.amount, 0), 4);
  const q = makePlayer();
  giveBlocks(q, "minecraft:bed", 4);
  assert.equal([...q.slots.values()].reduce((n, s) => n + s.amount, 0), 4);
});

test("partial removeBlocks keeps the stack's nameTag", () => {
  const p = makePlayer();
  const st = new mc.ItemStack("minecraft:dirt", 10);
  st.nameTag = "Keep me";
  p.slots.set(0, st);
  assert.equal(removeBlocks(p, "minecraft:dirt", 4), 4);
  assert.equal(p.slots.get(0).amount, 6);
  assert.equal(p.slots.get(0).nameTag, "Keep me");
});

test("giveBuildingBook reports a full inventory", () => {
  assert.equal(giveBuildingBook(makePlayer({ addItem: (st) => st })), false);
  assert.equal(giveBuildingBook(makePlayer()), true);
});

test("isOp uses the permission level only, not the eb:admin tag", () => {
  assert.equal(isOp(makePlayer({ tags: ["eb:admin"], perm: 0 })), false);
  assert.equal(isOp(makePlayer({ perm: 3 })), true);
});
