// Easy Building: mirror/array/radial keep state flags, and flips cover the string state names (MCP-018, MCP-019).
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

const { applyArray } = await import("../packs/build_bp/scripts/modifiers/ArrayModifier.js");
const { applyRadial } = await import("../packs/build_bp/scripts/modifiers/RadialMirrorModifier.js");
const { modifiedStates, hasStateMods } = await import("../packs/build_bp/scripts/modifiers/MirrorModifier.js");

test("applyArray keeps the mirror flags on copies", () => {
  const out = applyArray([{ x: 0, y: 0, z: 0, _mx: true }], { ox: 2, oy: 0, oz: 0, count: 2 });
  assert.equal(out.length, 3);
  assert.ok(out.every((p) => p._mx === true));
});

test("applyRadial with 4 slices sets _rot 0..3", () => {
  const out = applyRadial([{ x: 3, y: 0, z: 0 }], { x: 0, z: 0, slices: 4, radius: 10, alternate: false });
  assert.equal(out.length, 4);
  const rots = out.map((p) => p._rot ?? 0).sort();
  assert.deepEqual(rots, [0, 1, 2, 3]);
});

test("applyRadial alternate sets _alt on odd slices", () => {
  const out = applyRadial([{ x: 3, y: 0, z: 1 }], { x: 0, z: 0, slices: 4, radius: 10, alternate: true });
  assert.equal(out.filter((p) => p._alt).length, 2);
});

test("modifiedStates returns raw when nothing is set", () => {
  const raw = { a: 1 };
  assert.equal(modifiedStates(raw, { x: 0 }), raw);
  assert.equal(hasStateMods({ x: 0 }), false);
  assert.equal(hasStateMods({ _rot: 2 }), true);
});

test("Y mirror flips vertical_half", () => {
  assert.equal(modifiedStates({ "minecraft:vertical_half": "top" }, { _my: true })["minecraft:vertical_half"], "bottom");
  assert.equal(modifiedStates({ "minecraft:vertical_half": "bottom" }, { _my: true })["minecraft:vertical_half"], "top");
});

test("X mirror flips torch_facing_direction and string facing_direction", () => {
  assert.equal(modifiedStates({ torch_facing_direction: "east" }, { _mx: true }).torch_facing_direction, "west");
  assert.equal(modifiedStates({ "minecraft:facing_direction": "east" }, { _mx: true })["minecraft:facing_direction"], "west");
  assert.equal(modifiedStates({ "minecraft:facing_direction": 4 }, { _mx: true })["minecraft:facing_direction"], 5);
});

test("door hinge flips on one axis, stays on X+Z", () => {
  assert.equal(modifiedStates({ door_hinge_bit: false }, { _mx: true }).door_hinge_bit, true);
  assert.equal(modifiedStates({ door_hinge_bit: false }, { _mx: true, _mz: true }).door_hinge_bit, false);
});

test("_rot rotates cardinal direction", () => {
  const s = modifiedStates({ "minecraft:cardinal_direction": "north" }, { _rot: 1 });
  assert.notEqual(s["minecraft:cardinal_direction"], "north");
});
