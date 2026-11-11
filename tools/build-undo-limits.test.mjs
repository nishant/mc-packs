// MCP-015/016: undo snapshots fit the 32 KB property limit, and in-memory history stays bounded.
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
const { performUndo, recordSnapshot, captureSnapshot } = await import("../packs/build_bp/scripts/core/UndoRedo.js");

const dim = mc.world.getDimension("minecraft:overworld");
const at = (x, y, z) => dim.getBlock({ x, y, z });
let seq = 0;
function player() {
  const props = new Map();
  const p = {
    id: `ul${++seq}`, name: `Ul${seq}`, isValid: true, isOp: false, isSneaking: false, selectedSlotIndex: 0,
    dimension: dim, location: { x: 0, y: 64, z: 0 },
    getGameMode: () => "creative", getRotation: () => ({ x: 0, y: 0 }),
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => {
      if (typeof v === "string" && v.length > 32767) throw new Error("property too large");
      if (v === undefined) props.delete(k); else props.set(k, v);
    },
    getComponent: () => ({ container: { size: 36, getItem: () => undefined, setItem() {}, addItem: (i) => i } }),
    sendMessage() {}, playSound() {}, onScreenDisplay: { setActionBar() {} }, hasTag: () => false,
  };
  mc.addPlayer(p);
  mc.system.sendScriptEvent = (id, message) => {
    if (id !== "realm:claims_check") return;
    const q = JSON.parse(message);
    mc.fireEvent("system.after.scriptEventReceive", { id: "realm:claims_check_result", message: JSON.stringify({ id: q.id, claims: [] }) });
  };
  return p;
}
const cells = (x0, z0, n) => Array.from({ length: n }, (_, i) => ({ x: x0 + (i % 100), y: 64, z: z0 + Math.floor(i / 100) }));
function build(p, x0, z0, n, threshold) {
  const pos = cells(x0, z0, n);
  const snap = captureSnapshot(dim, pos, "minecraft:stone", {}, null, threshold);
  for (const c of pos) at(c.x, c.y, c.z).setType("minecraft:stone");
  recordSnapshot(p, snap);
  return pos;
}

test("MCP-015: a 1000-block snapshot with threshold 1000 does not throw and can be undone", async () => {
  const p = player();
  const pos = build(p, 6000, 6000, 1000, 1000);
  assert.equal(at(pos[0].x, 64, pos[0].z).typeId, "minecraft:stone");
  await performUndo(p);
  mc.flushIntervals();
  assert.equal(at(pos[0].x, 64, pos[0].z).typeId, "minecraft:air");
  assert.equal(at(pos[999].x, 64, pos[999].z).typeId, "minecraft:air");
});

test("MCP-016: temp history stays bounded after 50 large builds, and undo after overflow still works", async () => {
  const p = player();
  const all = [];
  for (let i = 0; i < 50; i++) all.push(build(p, 7000, 7000 + i * 400, 3000, 500));
  let undone = 0;
  for (let i = 0; i < 60; i++) {
    const lastStone = (pos) => at(pos[0].x, 64, pos[0].z).typeId === "minecraft:stone";
    const before = all.filter(lastStone).length;
    await performUndo(p);
    mc.flushIntervals();
    if (all.filter(lastStone).length < before) undone++;
  }
  assert.equal(undone > 0 && undone <= 10, true, `undid ${undone}`);
  // the newest builds were the ones kept
  assert.equal(at(all[49][0].x, 64, all[49][0].z).typeId, "minecraft:air");
  assert.equal(at(all[0][0].x, 64, all[0][0].z).typeId, "minecraft:stone", "oldest builds were dropped");
});

test("MCP-016: history overflow of small persistent builds keeps undo working and never throws", async () => {
  const p = player();
  const builds = [];
  for (let i = 0; i < 14; i++) builds.push(build(p, 9000 + i * 5, 9000, 3, 200));
  for (let i = 0; i < 20; i++) { await performUndo(p); mc.flushIntervals(); }
  const undoneN = builds.filter((b) => at(b[0].x, 64, b[0].z).typeId === "minecraft:air").length;
  assert.equal(undoneN, 10);
});

test("MCP-016: a snapshot over 100,000 blocks is refused", () => {
  const huge = Array.from({ length: 100001 }, (_, i) => ({ x: i, y: 64, z: 0 }));
  assert.equal(captureSnapshot(dim, huge, "minecraft:stone", {}, null, 200), null);
});
