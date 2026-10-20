// O47: beds through the real main pipeline (confirmPlacement -> claims filter -> placeBlocks) in every build mode,
// with and without modifiers, against the offline @minecraft/server stand-in. Every bed that lands has both halves,
// one item is charged per bed, and nothing else is charged or lost.
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
const { getState, setMode, setAnchor, setMirrorState, setArrayState, setRadialState } = await import("../packs/build_bp/scripts/core/PlayerState.js");
const { MODE_LIST, getModeHandler } = await import("../packs/build_bp/scripts/modes/ModeRegistry.js");
const { confirmPlacement, placeAir } = await import("../packs/build_bp/scripts/main.js");
const { bedPartnerPos } = await import("../packs/build_bp/scripts/core/beds.js");

let seq = 0;
function bedPlayer(beds) {
  const slots = new Map();
  for (let i = 0; i < beds; i++) slots.set(i, new mc.ItemStack("minecraft:bed", 1));
  const props = new Map();
  const inv = {
    size: 36,
    getItem: (i) => slots.get(i),
    setItem: (i, item) => { if (!item || item.amount <= 0) slots.delete(i); else slots.set(i, item); },
    addItem: (item) => { for (let i = 0; i < 36; i++) if (!slots.get(i)) { slots.set(i, item); return undefined; } return item; },
  };
  const p = {
    id: `bm${++seq}`, name: `Bed${seq}`, isValid: true, isOp: true, isSneaking: false, selectedSlotIndex: 0,
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
const beds = (p) => {
  const c = p.getComponent().container;
  let n = 0;
  for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === "minecraft:bed") n += c.getItem(i).amount;
  return n;
};
const settle = async () => {
  for (let i = 0; i < 5; i++) { await new Promise((r) => setImmediate(r)); mc.flushIntervals(40); }
};

/** Every bed block in the box; each must have a bed partner pointing back at it with the other half bit. */
function auditBeds(box) {
  const dim = mc.world.getDimension("minecraft:overworld");
  let feet = 0, heads = 0;
  const orphans = [];
  for (let x = box.x1; x <= box.x2; x++) for (let y = box.y1; y <= box.y2; y++) for (let z = box.z1; z <= box.z2; z++) {
    const b = dim.getBlock({ x, y, z });
    if (b.typeId !== "minecraft:bed") continue;
    const s = b.permutation.getAllStates();
    if (s.head_piece_bit === true) heads++; else feet++;
    const partner = bedPartnerPos({ x, y, z }, s);
    const o = partner && dim.getBlock(partner);
    const os = o?.permutation.getAllStates();
    if (!o || o.typeId !== "minecraft:bed" || os.head_piece_bit === s.head_piece_bit || os.direction !== s.direction)
      orphans.push({ x, y, z, s });
  }
  return { feet, heads, orphans };
}

const SHAPE_MODES = MODE_LIST.map((m) => m.id).filter((id) => getModeHandler(id) && id !== "air_build");

let originX = 1000;
async function buildBeds(mode, setup) {
  const p = bedPlayer(36);
  setMode(p, mode);
  setup?.(p);
  const ox = (originX += 100);
  const anchor = { x: ox, y: 64, z: 0 };
  setAnchor(p, anchor, "minecraft:bed", { direction: 0 });
  const handler = getModeHandler(mode);
  const target = { x: ox + 3, y: 64, z: 2 };
  if (handler.steps === 3) {
    confirmPlacement(p, target);
    assert.ok(getState(p).secondAnchor, `${mode}: the second click locks the footprint`);
    confirmPlacement(p, { x: ox + 3, y: 66, z: 2 });
  } else {
    confirmPlacement(p, target);
  }
  await settle();
  assert.equal(getState(p).anchor, null, `${mode}: the anchor is used up`);
  const audit = auditBeds({ x1: ox - 40, x2: ox + 40, y1: 60, y2: 72, z1: -40, z2: 40 });
  return { p, audit, charged: 36 - beds(p) };
}

for (const mode of SHAPE_MODES) {
  test(`beds in ${mode}: whole beds only, one item each`, async () => {
    const { audit, charged } = await buildBeds(mode);
    assert.deepEqual(audit.orphans, [], `${mode}: no half bed`);
    assert.ok(audit.feet >= 1, `${mode}: at least one bed placed`);
    assert.equal(audit.feet, audit.heads, `${mode}: one head per foot`);
    assert.equal(charged, audit.feet, `${mode}: one item per bed`);
  });
}

for (const [name, setup] of [
  ["mirror on X and Z", (p) => setMirrorState(p, { enabled: true, x: 0, y: 64, z: 0, axisX: true, axisZ: true, radius: 300 })],
  ["array", (p) => setArrayState(p, { enabled: true, ox: 0, oy: 2, oz: 0, count: 2 })],
  ["radial", (p) => setRadialState(p, { enabled: true, x: 0, y: 64, z: 0, slices: 4, radius: 300 })],
]) {
  test(`beds in line and cube with ${name}: whole beds only, one item each`, async () => {
    for (const mode of ["line", "cube"]) {
      const { p, audit, charged } = await buildBeds(mode, (pl) => {
        setup(pl);
        const s = getState(pl).modifiers;
        if (s.mirror.enabled) { s.mirror.x = originX + 100 + 8; s.mirror.z = 8; }
        if (s.radial.enabled) { s.radial.x = originX + 100 + 8; s.radial.z = 8; }
      });
      assert.deepEqual(audit.orphans, [], `${mode} ${name}: no half bed`);
      assert.ok(audit.feet >= 1, `${mode} ${name}: placed`);
      assert.equal(audit.feet, audit.heads, `${mode} ${name}: one head per foot`);
      assert.equal(charged, audit.feet, `${mode} ${name}: one item per bed`);
      setMirrorState(p, { enabled: false }); setArrayState(p, { enabled: false }); setRadialState(p, { enabled: false });
    }
  });
}

test("beds in air_build: one bed, both halves, one item", async () => {
  const p = bedPlayer(2);
  setMode(p, "air_build");
  const at = { x: 5000, y: 70, z: 0 };
  const placed = await placeAir(p, at, "minecraft:bed", { direction: 1, head_piece_bit: false });
  await settle();
  assert.equal(placed, 2);
  const audit = auditBeds({ x1: 4995, x2: 5005, y1: 70, y2: 70, z1: -3, z2: 3 });
  assert.deepEqual(audit.orphans, []);
  assert.equal(audit.feet, 1);
  assert.equal(beds(p), 1);
});
