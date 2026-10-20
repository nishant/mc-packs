// O48: what Easy Building costs per tick while nobody builds, counted as native calls against the offline
// @minecraft/server stand-in with every loop of the pack running (main.js). This is a call count, not a timing: the
// BDS perf soak gives the ms/tick.
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
mc.setRespectPeriods(true);
await import("../packs/build_bp/scripts/main.js");

const HELD = ["minecraft:dirt", "minecraft:cobblestone", "minecraft:torch", "minecraft:diamond_sword", "minecraft:bread", null];
let reads = 0;
function idlePlayer(i) {
  const slots = new Map();
  const held = HELD[i % HELD.length];
  if (held) slots.set(0, new mc.ItemStack(held, 16));
  const props = new Map();
  const inv = { size: 36, getItem: (n) => slots.get(n), setItem: (n, it) => { if (it) slots.set(n, it); else slots.delete(n); } };
  const p = {
    id: `idle${i}`, name: `Idle${i}`, isValid: true, isOp: false, isSneaking: false, selectedSlotIndex: 0,
    dimension: mc.world.getDimension("minecraft:overworld"), location: { x: i * 4, y: 64, z: 0 },
    getGameMode: () => "survival", getRotation: () => ({ x: 0, y: 0 }),
    getHeadLocation: () => ({ x: i * 4 + 0.5, y: 65.6, z: 0.5 }), getViewDirection: () => ({ x: 0, y: 0, z: 1 }),
    getBlockFromViewDirection: () => undefined,
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
    getComponent: () => { reads++; return { container: inv }; },
    sendMessage() {}, playSound() {}, onScreenDisplay: { setActionBar() {} }, hasTag: () => false, addTag() {}, removeTag() {},
    runCommand() { return { successCount: 1 }; },
  };
  mc.addPlayer(p);
  return p;
}

test("O48: 40 survival players with building off cost almost no native calls per tick", () => {
  const getAll = mc.world.getAllPlayers;
  let lists = 0;
  mc.world.getAllPlayers = () => { lists++; return getAll(); };
  for (let i = 0; i < 40; i++) idlePlayer(i);
  mc.flushIntervals(100); // everyone's hand is learned once
  reads = 0;
  lists = 0;
  const TICKS = 400;
  mc.flushIntervals(TICKS);
  mc.world.getAllPlayers = getAll;
  const perTick = { inventoryReads: reads / TICKS, playerLists: lists / TICKS };
  console.log(`# idle cost per tick at 40 players: ${JSON.stringify(perTick)}`);
  assert.ok(perTick.inventoryReads <= 0.5, `inventory reads per tick ${perTick.inventoryReads}`);
  assert.ok(perTick.playerLists <= 0.1, `player list fetches per tick ${perTick.playerLists}`);
});
