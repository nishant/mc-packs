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
