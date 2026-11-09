// Audit fixes for Easy Building clipboard, undo/redo, Land Claims and anchor capture (MCP-001, 004, 005, 006, 008, 010).
// Real pack modules through the offline @minecraft/server stand-in.
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
const { anchorPrevPerm } = await import("../packs/build_bp/scripts/main.js");
const { startPlacementQueue } = await import("../packs/build_bp/scripts/core/PlacementQueue.js");
startPlacementQueue();
const { captureClipboard, cutAndCapture, executePaste, copyTooBig, boxVolume } = await import("../packs/build_bp/scripts/core/Clipboard.js");
const { performUndo, performRedo, recordSnapshot, captureSnapshot } = await import("../packs/build_bp/scripts/core/UndoRedo.js");
const { getState } = await import("../packs/build_bp/scripts/core/PlayerState.js");
const { setMaxBlocks } = await import("../packs/build_bp/scripts/core/Settings.js");
const { saveSlot, loadSlot, loadSlotMeta, autoSaveToStore, saveToFreeSlot, MAX_CHUNKS } = await import("../packs/build_bp/scripts/utils/ClipboardStore.js");

const dim = mc.world.getDimension("minecraft:overworld");
const at = (x, y, z) => dim.getBlock({ x, y, z });
let seq = 0;
function player({ op = false, mode = "survival" } = {}) {
  const props = new Map();
  const p = {
    id: `aa${++seq}`, name: `Aa${seq}`, isValid: true, isOp: op, isSneaking: false, selectedSlotIndex: 0,
    dimension: dim, location: { x: 0, y: 64, z: 0 },
    getGameMode: () => mode, getRotation: () => ({ x: 0, y: 0 }),
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
    getComponent: () => ({ container: { size: 36, getItem: () => undefined, setItem() {}, addItem: (i) => i } }),
    sendMessage() {}, playSound() {}, onScreenDisplay: { setActionBar() {} }, hasTag: () => false,
  };
  mc.addPlayer(p);
  return p;
}
/** Land Claims stand-in: answers realm:claims_check with the given claim boxes. */
function claimsAnswer(claims) {
  mc.system.sendScriptEvent = (id, message) => {
    if (id !== "realm:claims_check") return;
    const q = JSON.parse(message);
    mc.fireEvent("system.after.scriptEventReceive", { id: "realm:claims_check_result", message: JSON.stringify({ id: q.id, claims }) });
  };
}
const noClaims = () => claimsAnswer([]);
noClaims();

test("MCP-001/010: a copy box over the block limit is refused before any block is read", () => {
  const p = player({ op: true });
  setMaxBlocks(p, 1000);
  let reads = 0;
  const real = dim.getBlock;
  dim.getBlock = (pos) => { reads++; return real.call(dim, pos); };
  try {
    const far = { x: 5000, y: 300, z: 5000 };
    assert.equal(boxVolume("minecraft:overworld", { x: 0, y: -64, z: 0 }, far) > 1000, true);
    assert.equal(copyTooBig(p, { x: 0, y: -64, z: 0 }, far), true);
    assert.equal(captureClipboard(p, { x: 0, y: -64, z: 0 }, far), 0);
    assert.equal(reads, 0);
    assert.equal(copyTooBig(p, { x: 0, y: 64, z: 0 }, { x: 9, y: 66, z: 9 }), false);
  } finally { dim.getBlock = real; }
});

test("MCP-010: a clipboard too big for storage is refused whole, and a slot never reads half old, half new", () => {
  const p = player({ op: true });
  const small = { blocks: [{ dx: 0, dy: 0, dz: 0, typeId: "minecraft:stone", permStates: {} }], dims: { x: 1, y: 1, z: 1 }, captureFacing: 0 };
  assert.equal(saveSlot(p, 3, small), true);
  const huge = { ...small, blocks: Array.from({ length: 30000 }, (_, i) => ({ dx: i, dy: 0, dz: 0, typeId: "minecraft:stone", permStates: { a: "b" } })) };
  assert.equal(JSON.stringify(huge.blocks).length > 24000 * MAX_CHUNKS, true);
  assert.equal(saveSlot(p, 3, huge), false);
  assert.equal(loadSlot(p, 3).blocks.length, 1, "the old slot is untouched by a refused save");
  assert.equal(autoSaveToStore(p, huge), null);
  assert.equal(loadSlotMeta(p, 0), null, "a refused auto save leaves no stale auto slot");
  const broken = player({ op: true });
  broken.setDynamicProperty = () => { throw new Error("boom"); };
  assert.equal(saveSlot(broken, 4, small), false);
});

test("MCP-005: a survival cut leaves bedrock and Land Claims cells alone", async () => {
  const p = player();
  for (let x = 100; x < 104; x++) at(x, 64, 100).setType("minecraft:stone");
  at(104, 64, 100).setType("minecraft:bedrock");
  claimsAnswer([{ n: "Bob", x1: 102, z1: 100, x2: 102, z2: 100 }]);
  const cut = await cutAndCapture(p, { x: 100, y: 64, z: 100 }, { x: 104, y: 64, z: 100 });
  noClaims();
  assert.equal(cut, 3, "100, 101 and 103 are cut");
  assert.equal(at(100, 64, 100).typeId, "minecraft:air");
  assert.equal(at(102, 64, 100).typeId, "minecraft:stone", "the claimed cell stays");
  assert.equal(at(104, 64, 100).typeId, "minecraft:bedrock");
  assert.equal(getState(p).clipboard.blocks.length, 3);
  assert.equal(getState(p).clipboard.isCut, true);
});

test("MCP-005: Destroy switched off blocks a cut", async () => {
  const { set } = await import("../packs/build_bp/scripts/settings.js");
  const p = player();
  at(110, 64, 110).setType("minecraft:stone");
  set("allowDestroy", false);
  try {
    assert.equal(await cutAndCapture(p, { x: 110, y: 64, z: 110 }, { x: 110, y: 64, z: 110 }), 0);
    assert.equal(at(110, 64, 110).typeId, "minecraft:stone");
  } finally { set("allowDestroy", true); }
});

test("MCP-006: undoing a cut ends its free paste, in memory and in every saved slot", async () => {
  const p = player();
  at(120, 64, 120).setType("minecraft:stone");
  const n = await cutAndCapture(p, { x: 120, y: 64, z: 120 }, { x: 120, y: 64, z: 120 });
  assert.equal(n, 1);
  const clip = getState(p).clipboard;
  assert.equal(autoSaveToStore(p, clip), 0);
  assert.equal(loadSlotMeta(p, 0).c, true);
  const copy = saveToFreeSlot(p, { ...clip, isCut: false, cutId: undefined });
  assert.equal(loadSlotMeta(p, copy).c, false, "a saved copy of a cut is charged like any copy");
  await performUndo(p);
  mc.flushIntervals();
  assert.equal(at(120, 64, 120).typeId, "minecraft:stone", "the cut came back");
  assert.equal(getState(p).clipboard, null, "the cut clipboard is gone");
  assert.equal(loadSlotMeta(p, 0), null, "and so is its saved slot");
  assert.notEqual(loadSlotMeta(p, copy), null, "the plain copy stays");
});

test("MCP-004: paste skips Land Claims cells", async () => {
  const p = player();
  getState(p).clipboard = {
    captureFacing: 0, dims: { x: 3, y: 1, z: 1 }, version: 1,
    blocks: [0, 1, 2].map((dx) => ({ dx, dy: 0, dz: 0, typeId: "minecraft:stone", permStates: {} })),
    isCut: true,
  };
  claimsAnswer([{ n: "Bob", x1: 131, z1: 130, x2: 131, z2: 130 }]);
  const placed = await executePaste(p, { x: 130, y: 64, z: 130 });
  noClaims();
  mc.flushIntervals();
  assert.equal(placed, 2);
  assert.equal(at(130, 64, 130).typeId, "minecraft:stone");
  assert.equal(at(131, 64, 130).typeId, "minecraft:air");
  assert.equal(at(132, 64, 130).typeId, "minecraft:stone");
});

test("MCP-004: redo and destroy-undo never overwrite what was built there since", async () => {
  const p = player({ mode: "creative" });
  const cells = [{ x: 140, y: 64, z: 140 }, { x: 141, y: 64, z: 140 }];
  const snap = captureSnapshot(dim, cells, "minecraft:stone", {}, null, 200);
  recordSnapshot(p, snap);
  for (const c of cells) at(c.x, c.y, c.z).setType("minecraft:stone");
  await performUndo(p);
  mc.flushIntervals();
  assert.equal(at(140, 64, 140).typeId, "minecraft:air");
  at(141, 64, 140).setType("minecraft:gold_block");
  await performRedo(p);
  mc.flushIntervals();
  assert.equal(at(140, 64, 140).typeId, "minecraft:stone", "the empty cell is redone");
  assert.equal(at(141, 64, 140).typeId, "minecraft:gold_block", "the cell built on since is kept");

  const q = player({ mode: "creative" });
  const bef = [150, 151].map((x) => ({ x, y: 64, z: 150, t: "stone", s: {} }));
  const aft = [150, 151].map((x) => ({ x, y: 64, z: 150, t: "air", s: {} }));
  recordSnapshot(q, { dim: "minecraft:overworld", bef, aft, destroy: true, survival: false });
  at(151, 64, 150).setType("minecraft:diamond_block");
  await performUndo(q);
  mc.flushIntervals();
  assert.equal(at(150, 64, 150).typeId, "minecraft:stone");
  assert.equal(at(151, 64, 150).typeId, "minecraft:diamond_block");
});

test("MCP-004: a destroy-undo skips Land Claims cells for a player who may not build there", async () => {
  const p = player();
  const bef = [160, 161].map((x) => ({ x, y: 64, z: 160, t: "stone", s: {}, u: 0 }));
  const aft = [160, 161].map((x) => ({ x, y: 64, z: 160, t: "air", s: {} }));
  recordSnapshot(p, { dim: "minecraft:overworld", bef, aft, destroy: true, survival: false });
  claimsAnswer([{ n: "Bob", x1: 161, z1: 160, x2: 161, z2: 160 }]);
  await performUndo(p);
  noClaims();
  mc.flushIntervals();
  assert.equal(at(160, 64, 160).typeId, "minecraft:stone");
  assert.equal(at(161, 64, 160).typeId, "minecraft:air");
});

test("MCP-008: the anchor restores only the cell that really received the block", () => {
  const clicked = { x: 5, y: 5, z: 5, perm: "snow" };
  const face = { x: 5, y: 6, z: 5, perm: "diamond" };
  assert.equal(anchorPrevPerm([clicked, face], { x: 5, y: 5, z: 5 }), "snow");
  assert.equal(anchorPrevPerm([clicked, face], { x: 5, y: 6, z: 5 }), "diamond");
  assert.equal(anchorPrevPerm([clicked, face], { x: 9, y: 9, z: 9 }), undefined, "an unknown cell is cleared, never given a neighbour's block");
});

test("review 1: a survival cut too big for one saved slot is refused and destroys nothing", async () => {
  const p = player();
  setMaxBlocks(p, 50000);
  for (let x = 0; x < 150; x++) for (let z = 0; z < 100; z++) at(2000 + x, 64, 2000 + z).setType("minecraft:stone");
  const n = await cutAndCapture(p, { x: 2000, y: 64, z: 2000 }, { x: 2149, y: 64, z: 2099 });
  assert.equal(n, 0);
  assert.equal(getState(p).clipboard, null);
  assert.equal(at(2000, 64, 2000).typeId, "minecraft:stone", "nothing was cut");
  assert.equal(at(2149, 64, 2099).typeId, "minecraft:stone");
  const c = player({ mode: "creative" });
  setMaxBlocks(c, 50000);
  assert.equal(await cutAndCapture(c, { x: 2000, y: 64, z: 2000 }, { x: 2149, y: 64, z: 2099 }) > 0, true, "creative cuts are free, so they may exceed a slot");
});

test("review 1: redoing an undone survival cut refunds the blocks and a later undo charges them", async () => {
  const p = player();
  const given = [];
  p.getComponent = () => ({ container: { size: 36, getItem: () => undefined, setItem() {}, addItem: (i) => { given.push(i); return undefined; } } });
  at(2300, 64, 2300).setType("minecraft:stone");
  assert.equal(await cutAndCapture(p, { x: 2300, y: 64, z: 2300 }, { x: 2300, y: 64, z: 2300 }), 1);
  await performUndo(p);
  mc.flushIntervals();
  assert.equal(at(2300, 64, 2300).typeId, "minecraft:stone");
  const before = given.length;
  await performRedo(p);
  mc.flushIntervals();
  assert.equal(at(2300, 64, 2300).typeId, "minecraft:air", "redo cuts again");
  assert.equal(given.length > before, true, "and gives the stone back");
});

test("review 1: undoing a destroy restores cells that water moved into", async () => {
  const p = player({ mode: "creative" });
  const bef = [{ x: 2400, y: 64, z: 2400, t: "stone", s: {}, u: 0 }];
  const aft = [{ x: 2400, y: 64, z: 2400, t: "air", s: {} }];
  recordSnapshot(p, { dim: "minecraft:overworld", bef, aft, destroy: true, survival: false });
  at(2400, 64, 2400).setType("minecraft:water");
  await performUndo(p);
  mc.flushIntervals();
  assert.equal(at(2400, 64, 2400).typeId, "minecraft:stone");
});

test("review 1: Array dedupes overlapping copies before the block cap", async () => {
  const { applyArray } = await import("../packs/build_bp/scripts/modifiers/ArrayModifier.js");
  const line = Array.from({ length: 4 }, (_, i) => ({ x: i, y: 64, z: 0 }));
  // offset 1 overlaps: 4 cells + 5 steps of 1 new cell each = 9 distinct cells.
  const out = applyArray(line, { ox: 1, oy: 0, oz: 0, count: 5 }, 10);
  assert.equal(out.length, 9);
  assert.equal(new Set(out.map((q) => `${q.x},${q.y},${q.z}`)).size, 9);
});
