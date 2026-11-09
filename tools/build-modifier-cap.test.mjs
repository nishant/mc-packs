// Easy Building: Array count and Radial slices are clamped, and the modifier pipeline stops at the block cap (MCP-007, MCP-009).
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

const PS = await import("../packs/build_bp/scripts/core/PlayerState.js");
const { applyModifiers, applyModifiersToEntries } = await import("../packs/build_bp/scripts/core/ModifierPipeline.js");
const { getMaxBlocks } = await import("../packs/build_bp/scripts/core/Settings.js");

let seq = 0;
function player(saved) {
  const props = new Map();
  if (saved) props.set("eb:modifiers", JSON.stringify(saved));
  return {
    id: `mc${++seq}`, name: `Mc${seq}`, isValid: true, isOp: false,
    getDynamicProperty: (k) => props.get(k), setDynamicProperty: (k, v) => { if (v === undefined) props.delete(k); else props.set(k, v); },
    hasTag: () => false,
  };
}
const wall = (n) => Array.from({ length: n }, (_, i) => ({ x: i, y: 64, z: 0 }));

test("setters clamp count, slices and radius", () => {
  const p = player();
  PS.setArrayState(p, { count: 10_000_000 });
  assert.equal(PS.getArrayState(p).count, PS.MAX_ARRAY_COUNT);
  PS.setArrayState(p, { count: -5 });
  assert.equal(PS.getArrayState(p).count, 1);
  PS.setRadialState(p, { slices: 999999, radius: 1e9 });
  assert.equal(PS.getRadialState(p).slices, 16);
  assert.equal(PS.getRadialState(p).radius, PS.MAX_MODIFIER_RADIUS);
  PS.setRadialState(p, { slices: 0 });
  assert.equal(PS.getRadialState(p).slices, 2);
  PS.setArrayState(p, { ox: 3 });
  assert.equal(PS.getArrayState(p).count, 1, "an update without count leaves it alone");
});

test("old saved modifiers load clamped", () => {
  const p = player({ array: { enabled: true, count: 5_000_000 }, radial: { enabled: true, slices: 900, radius: 123456789 }, mirror: { radius: 99999999 } });
  assert.equal(PS.getArrayState(p).count, 64);
  assert.equal(PS.getRadialState(p).slices, 16);
  assert.equal(PS.getRadialState(p).radius, PS.MAX_MODIFIER_RADIUS);
  assert.equal(PS.getMirrorState(p).radius, PS.MAX_MODIFIER_RADIUS);
});

test("the pipeline stops generating at the block cap", () => {
  const p = player();
  const cap = getMaxBlocks(p);
  const a = PS.getArrayState(p);
  Object.assign(a, { enabled: true, count: 64, oy: 1 }); // bypass the setter to model a bad state
  const out = applyModifiers(p, wall(cap));
  assert.equal(out.length, cap + 1, "reports over the limit, no more");
  const entries = wall(cap).map((pos) => ({ pos, typeId: "minecraft:stone", permStates: {} }));
  assert.equal(applyModifiersToEntries(p, entries).length, cap + 1);
  a.enabled = false;
  Object.assign(PS.getRadialState(p), { enabled: true, slices: 16, radius: 9999 });
  assert.ok(applyModifiers(p, wall(cap)).length <= cap + 1);
});

test("small results are unchanged", () => {
  const p = player();
  PS.setArrayState(p, { enabled: true, ox: 0, oy: 1, oz: 0, count: 3 });
  assert.equal(applyModifiers(p, wall(2)).length, 8);
});
