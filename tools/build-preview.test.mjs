// Easy Building's live preview loop against the offline @minecraft/server stand-in: what it draws, how many native
// reads it costs, and when it keeps or drops the build anchor (F7, F8, F9, F48, O48).
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
const { getState, setMode, setAnchor } = await import("../packs/build_bp/scripts/core/PlayerState.js");
const Preview = await import("../packs/build_bp/scripts/core/Preview.js");
Preview.startPreviewLoop();

const dim = mc.world.getDimension("minecraft:overworld");
const particles = [];
dim.spawnParticle = (id, at) => { particles.push({ id, at }); };

let seq = 0;
/** A survival player at x0 standing at (x0, 64, 0) looking east along +x, holding `held` in slot 0. */
function builder(x0, held, gameMode = "survival") {
  const slots = new Map();
  if (held) slots.set(0, new mc.ItemStack(held, 64));
  const props = new Map();
  const bars = [];
  const p = {
    id: `pv${++seq}`, name: `Pv${seq}`, isValid: true, isOp: true, isSneaking: false, selectedSlotIndex: 0,
    dimension: dim, location: { x: x0, y: 64, z: 0 },
    getGameMode: () => gameMode, getRotation: () => ({ x: 0, y: -90 }),
    getHeadLocation: () => ({ x: x0 + 0.5, y: 65.6, z: 0.5 }),
    getViewDirection: () => ({ x: 1, y: 0, z: 0 }),
    getBlockFromViewDirection: () => undefined,
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
    getComponent: () => ({ container: { size: 36, getItem: (i) => slots.get(i), setItem: (i, it) => { if (it) slots.set(i, it); else slots.delete(i); } } }),
    sendMessage() {}, playSound() {}, onScreenDisplay: { setActionBar: (text) => bars.push(text) }, hasTag: () => false,
  };
  p.bars = bars;
  p.slots = slots;
  mc.addPlayer(p);
  return p;
}
const text = (bar) => JSON.stringify(bar);

test("a stone line preview outlines its blocks and counts them", () => {
  const p = builder(0, "minecraft:stone");
  setMode(p, "line");
  setAnchor(p, { x: 2, y: 64, z: 0 }, "minecraft:stone", {});
  particles.length = 0;
  mc.flushIntervals(40);
  const last = text(p.bars.at(-1));
  const count = Number(/§f(\d+) blocks/.exec(last)?.[1]);
  assert.ok(count > 1, `the bar counts the line's blocks: ${last}`);
  assert.ok(particles.length > 0, "the line is drawn");
});

/** Counts dim.getBlock and getAllStates calls while fn runs. */
function countReads(fn) {
  const getBlock = dim.getBlock;
  let blocks = 0, states = 0;
  const wrapped = new WeakSet();
  dim.getBlock = (pos) => {
    blocks++;
    const b = getBlock.call(dim, pos);
    if (b && !wrapped.has(b.permutation)) {
      const perm = b.permutation;
      const all = perm.getAllStates;
      perm.getAllStates = () => { states++; return all.call(perm); };
      wrapped.add(perm);
    }
    return b;
  };
  try { fn(); } finally { dim.getBlock = getBlock; }
  return { blocks, states };
}

test("F9: a destroy preview reads each block once, and states only for beds", () => {
  const x0 = 200;
  const p = builder(x0, "minecraft:diamond_pickaxe", "creative");
  setMode(p, "line");
  for (let x = x0 + 2; x <= x0 + 30; x++) dim.getBlock({ x, y: 65, z: 0 }).setType("minecraft:stone");
  dim.getBlock({ x: x0 + 10, y: 65, z: 0 }).setPermutation(mc.BlockPermutation.resolve("minecraft:bed", { direction: 0, head_piece_bit: false }));
  dim.getBlock({ x: x0 + 10, y: 65, z: 1 }).setPermutation(mc.BlockPermutation.resolve("minecraft:bed", { direction: 0, head_piece_bit: true }));
  p.getHeadLocation = () => ({ x: x0 + 0.5, y: 65.6, z: 0.5 });
  setAnchor(p, { x: x0 + 2, y: 65, z: 0 }, "eb:destroy", {});
  let worst = { blocks: 0, states: 0 };
  let drawnBeds = 0;
  for (let i = 0; i < 40; i++) {
    particles.length = 0;
    const r = countReads(() => mc.flushIntervals(1));
    if (r.blocks > worst.blocks) worst = r;
    drawnBeds = Math.max(drawnBeds, particles.filter((q) => Math.floor(q.at.x) === x0 + 10 && Math.floor(q.at.z) === 1).length);
  }
  const shape = 24; // anchor x0+2 to the 24-block view target
  assert.ok(worst.blocks >= shape - 1, `the preview read the shape (${worst.blocks})`);
  assert.ok(worst.blocks <= shape + 2, `one read per block, not two (${worst.blocks} reads for ${shape} blocks)`);
  assert.ok(worst.states <= 2, `states read only for the bed (${worst.states})`);
  assert.ok(drawnBeds > 0, "the bed's other half is outlined too");
});
