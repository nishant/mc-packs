import assert from "node:assert/strict";
import test from "node:test";
import { expandBeds, bedStates, directionFromYaw, bedPartnerPos, trimPlacement, placementItemCount, isBedType } from "../packs/build_bp/scripts/core/beds.js";
import { createIdleClock, idleDue, IDLE_EVERY } from "../packs/build_bp/scripts/utils/idle-cadence.js";
import { createToolGate } from "../packs/build_bp/scripts/utils/tool-gate.js";
import { resolveDefaultMaxBlocks, resolvePlayerMaxBlocks, applyBuildBonus, CONFIG_DEFAULT_MAX_BLOCKS } from "../packs/build_bp/scripts/core/block-limit.js";

const JAVA = ["minecraft:white_bed", "minecraft:red_bed", "minecraft:black_bed"];

test("a bed is two halves, one item, and no invented color", () => {
  for (const id of JAVA) assert.equal(isBedType(id), false);
  for (const dir of [0, 1, 2, 3]) {
    const expanded = expandBeds([{ x: 10, y: 64, z: 10, typeId: "minecraft:bed", direction: dir, states: {} }], () => true);
    assert.equal(expanded.positions.length, 2);
    assert.equal(placementItemCount(expanded.positions), 1);
    const [foot, head] = expanded.positions;
    assert.equal(foot._resolvedStates.direction, dir);
    assert.equal(foot._resolvedStates.head_piece_bit, false);
    assert.equal(head._resolvedStates.head_piece_bit, true);
    assert.equal(head._resolvedStates.occupied_bit, false);
    assert.equal("color" in foot._resolvedStates, false);
    assert.deepEqual(bedPartnerPos(foot, foot._resolvedStates), { x: head.x, y: head.y, z: head.z });
  }
  assert.equal(directionFromYaw(0), 0);
  assert.equal(directionFromYaw(90), 1);
  assert.equal(directionFromYaw(180), 2);
  assert.equal(directionFromYaw(270), 3);
});

test("straw beds use cardinal direction and a copied color is kept", () => {
  const expanded = expandBeds([{
    x: 0, y: 1, z: 0, typeId: "minecraft:straw_bed", direction: 3,
    states: { color: "blue", occupied_bit: true },
  }], () => true);
  const [foot, head] = expanded.positions;
  assert.equal(foot._resolvedStates["minecraft:cardinal_direction"], "east");
  assert.equal(head._resolvedStates.color, "blue");
  assert.equal(head._resolvedStates.occupied_bit, true);
  assert.equal(bedStates("minecraft:bed", 0, false, {}).color, undefined);
});

test("a blocked, overlapping, or over-cap bed is dropped whole", () => {
  const blocked = expandBeds([{ x: 1, y: 2, z: 3, typeId: "minecraft:bed", direction: 0 }], (p) => p.z !== 4);
  assert.equal(blocked.positions.length, 0);
  assert.equal(blocked.dropped, 1);
  const overlap = expandBeds([
    { x: 0, y: 0, z: 0, typeId: "minecraft:bed", direction: 0 },
    { x: 0, y: 0, z: 1, typeId: "minecraft:bed", direction: 2 },
  ], () => true);
  assert.equal(overlap.positions.length, 2);
  const trimmed = trimPlacement(expandBeds([
    { x: 0, y: 0, z: 0, typeId: "minecraft:bed", direction: 1 },
    { x: 5, y: 0, z: 0, typeId: "minecraft:bed", direction: 1 },
  ], () => true).positions, 2);
  assert.equal(trimmed.blocks, 2);
  assert.equal(trimmed.items, 1);
});

test("a paste that already has a head is not expanded again", () => {
  const pasted = expandBeds([
    { x: 0, y: 0, z: 0, typeId: "minecraft:bed", states: { direction: 0, head_piece_bit: false } },
    { x: 0, y: 0, z: 1, typeId: "minecraft:bed", states: { direction: 0, head_piece_bit: true } },
  ], () => true);
  assert.equal(pasted.positions.length, 2);
  assert.equal(placementItemCount(pasted.positions), 1);
  assert.equal(pasted.positions[0]._bedGroup, pasted.positions[1]._bedGroup);
  assert.equal(pasted.positions[1]._bedHead, true);
});

test("a period-5 loop services every idle index, including after a leave", () => {
  const clock = createIdleClock();
  const visits = [0, 0, 0, 0, 0];
  for (let world = 0; world < 50; world++) {
    if (world % 5 !== 0) continue;
    const phase = clock.tick();
    for (let i = 0; i < visits.length; i++) if (idleDue(i, phase, false, false)) visits[i]++;
  }
  assert.ok(visits.every((n) => n > 0), visits.join(","));
  const old = [0, 0, 0, 0, 0];
  for (let world = 0; world < 50; world++) {
    if (world % 5 !== 0) continue;
    for (let i = 0; i < old.length; i++) if ((world + i) % IDLE_EVERY === 0) old[i]++;
  }
  assert.ok(old.some((n) => n === 0));
  const left = [0, 0, 0, 0];
  for (let n = 0; n < 20; n++) {
    const phase = clock.tick();
    for (let i = 0; i < left.length; i++) if (idleDue(i, phase, false, false)) left[i]++;
  }
  assert.ok(left.every((n) => n > 0), left.join(","));
  assert.equal(idleDue(3, clock.phase(), true, false), true);
  assert.equal(idleDue(3, clock.phase(), false, true), true);
});

test("visualization stays off until somebody holds a tool, then wakes", () => {
  const gate = createToolGate();
  const players = [{ id: "a" }, { id: "b" }];
  assert.equal(gate.begin(players, () => false), false);
  assert.equal(gate.begin(players, () => false), false);
  gate.mark("b");
  assert.equal(gate.begin(players, (p) => p.id === "b"), true);
  gate.forget("b");
  assert.equal(gate.begin(players, () => false), false);
  assert.equal(gate.begin([{ id: "a" }, { id: "c" }], (p) => p.id === "c"), true);
  assert.ok(gate.stats().skipped >= 2);
});

test("an absent player limit stays at the default when the cap rises", () => {
  assert.equal(resolvePlayerMaxBlocks({ saved: undefined, fallback: 50000, cap: 100000 }), 50000);
  assert.equal(resolvePlayerMaxBlocks({ saved: "nope", fallback: CONFIG_DEFAULT_MAX_BLOCKS, cap: 80000 }), 50000);
  assert.equal(resolvePlayerMaxBlocks({ saved: 4000, fallback: 50000, cap: 100000 }), 4000);
  assert.equal(resolvePlayerMaxBlocks({ saved: 9000, fallback: 50000, cap: 2000 }), 2000);
  assert.equal(resolveDefaultMaxBlocks({ saved: undefined, configDefault: 50000, cap: 10000 }), 10000);
  assert.equal(resolveDefaultMaxBlocks({ saved: undefined, configDefault: 50000, cap: 100000 }), 50000);
  assert.equal(resolveDefaultMaxBlocks({ saved: 8000, configDefault: 50000, cap: 3000 }), 3000);
  assert.equal(applyBuildBonus(1000, 0), 1000);
  assert.equal(applyBuildBonus(1000, 10), 1100);
});
