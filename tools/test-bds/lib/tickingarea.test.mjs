import assert from "node:assert/strict";
import { test } from "node:test";
import { OWNED_AREAS_KEY, addOwnedArea, afterTickingAreaAdd, circleChunks, isOwnedAreaName, ownedAreaName, radiusProblem, readOwnedAreas, releaseOwnedAreas, tickingAreaCommandProblem } from "./tickingarea.js";

test("a circle area's chunks are the square BDS loads, around the chunk that holds the point", () => {
  assert.equal(circleChunks(163, 170, 1).length, 9);
  assert.equal(circleChunks(163, 170, 2).length, 25);
  assert.deepEqual(circleChunks(-81, 412, 1).map((c) => `${c.x},${c.z}`).sort(), ["-5,24", "-5,25", "-5,26", "-6,24", "-6,25", "-6,26", "-7,24", "-7,25", "-7,26"]);
  assert.deepEqual(circleChunks(-80, -1, 0), [{ x: -5, z: -1 }]);
});

test("accepts radius 1 to 4 and rejects everything else immediately", () => {
  for (const ok of [1, 2, 3, 4, "2", " 4 "]) assert.equal(radiusProblem(ok), null, String(ok));
  for (const bad of [0, 5, 6, -1, 2.5, "6", "abc", undefined, null, NaN]) assert.match(radiusProblem(bad) ?? "", /whole number from 1 to 4/, String(bad));
});

test("judges only tickingarea add circle commands, including after execute", () => {
  assert.equal(tickingAreaCommandProblem("tickingarea add circle 10 0 -20 4 area true"), null);
  assert.equal(tickingAreaCommandProblem("/tickingarea add circle 10 0 -20 2 area"), null);
  assert.match(tickingAreaCommandProblem("tickingarea add circle 10 0 -20 6 area true") ?? "", /got "6"/);
  assert.match(tickingAreaCommandProblem("/execute in nether run tickingarea add circle 0 64 0 7 nethertest") ?? "", /got "7"/);
  assert.equal(tickingAreaCommandProblem("tickingarea remove_all"), null);
  assert.equal(tickingAreaCommandProblem("tickingarea add 60 -61 -20 100 -61 20 sandarea"), null);
});

test("a rejected add fails at once with the game's message unless the chunk is already readable", () => {
  const bad = { ok: false, error: "You can only have 10 ticking areas" };
  const fail = afterTickingAreaAdd({ x: 5000.4, z: 5000, radius: 1, add: bad, readable: false });
  assert.equal(fail.action, "fail");
  assert.match(fail.message, /5000 0 5000 1 failed: You can only have 10 ticking areas/);
  assert.equal(afterTickingAreaAdd({ x: 0, z: 0, radius: 2, add: bad, readable: true }).action, "wait");
  assert.match(afterTickingAreaAdd({ x: 0, z: 0, radius: 2, add: bad, readable: true }).message, /already readable/);
  assert.equal(afterTickingAreaAdd({ x: 0, z: 0, radius: 2, add: { ok: true }, readable: false }).action, "wait");
  assert.match(afterTickingAreaAdd({ x: 0, z: 0, radius: 2, add: { ok: false }, readable: false }).message, /the command did not succeed/);
});

test("every phase names its areas differently, so an area saved with the world can never collide with a new one", () => {
  assert.equal(ownedAreaName(1, 1), "harness_1_1");
  assert.notEqual(ownedAreaName(1, 1), ownedAreaName(2, 1));
  for (const phase of [1, 2, 10]) for (const n of [1, 2, 99]) assert.equal(isOwnedAreaName(ownedAreaName(phase, n)), true);
  for (const bad of ["pool", "harness_1", "harness_", "harness_1_1x", "xharness_1_1", "harness_1_1 ; stop", "harness_a_b", "", undefined, 7, null]) {
    assert.equal(isOwnedAreaName(bad), false, String(bad));
  }
});

test("the saved list of the areas the harness added is read strictly", () => {
  const over = "minecraft:overworld";
  assert.equal(OWNED_AREAS_KEY, "harness:tickingAreas");
  for (const none of [undefined, null]) assert.deepEqual(readOwnedAreas(none), { areas: [], problems: [] });
  assert.deepEqual(readOwnedAreas("[]"), { areas: [], problems: [] });
  const ok = readOwnedAreas(JSON.stringify([{ name: "harness_2_1", dimension: over }, { name: "harness_2_1", dimension: over }, { name: "harness_2_2", dimension: "minecraft:nether" }]));
  assert.deepEqual(ok, { areas: [{ name: "harness_2_1", dimension: over }, { name: "harness_2_2", dimension: "minecraft:nether" }], problems: [] });
  assert.match(readOwnedAreas("{ nope").problems[0], /not valid JSON/);
  assert.match(readOwnedAreas(42).problems[0], /not valid JSON/);
  assert.match(readOwnedAreas('{"name":"harness_1_1"}').problems[0], /not a list/);
  const bad = readOwnedAreas(JSON.stringify([{ name: "pool", dimension: over }, null, 7, { name: "harness_1_1" }, { name: "harness_1_1", dimension: "minecraft:elsewhere" }, { name: "harness_1_1; stop", dimension: over }]));
  assert.deepEqual(bad.areas, []);
  assert.equal(bad.problems.length, 6);
  for (const p of bad.problems) assert.match(p, /^refused .*: not a ticking area the harness added$/);
});

test("releasing removes each valid area once, leaves every other name alone, and reports each failure", () => {
  const over = "minecraft:overworld";
  const raw = JSON.stringify([{ name: "harness_1_1", dimension: over }, { name: "harness_1_2", dimension: "minecraft:nether" }, { name: "pool", dimension: over }, { name: "harness_1_3", dimension: over }]);
  const asked = [];
  const result = releaseOwnedAreas(raw, (area) => {
    asked.push(`${area.dimension} ${area.name}`);
    if (area.name === "harness_1_2") return { ok: false, error: "no such area" };
    if (area.name === "harness_1_3") throw new Error("boom");
    return { ok: true };
  });
  assert.deepEqual(asked, [`${over} harness_1_1`, "minecraft:nether harness_1_2", `${over} harness_1_3`]);
  assert.deepEqual(result.removed, [{ name: "harness_1_1", dimension: over }]);
  assert.equal(result.problems.length, 3);
  assert.match(result.problems.find((p) => /harness_1_2/.test(p)) ?? "", /could not remove harness_1_2 \(minecraft:nether\): no such area/);
  assert.match(result.problems.find((p) => /harness_1_3/.test(p)) ?? "", /could not remove harness_1_3 \(minecraft:overworld\): boom/);
  assert.match(result.problems.find((p) => /pool/.test(p)) ?? "", /refused .*pool/);
  assert.match(releaseOwnedAreas(JSON.stringify([{ name: "harness_1_1", dimension: over }]), () => ({ ok: false })).problems[0], /the command did not succeed/);
  assert.deepEqual(releaseOwnedAreas(undefined, () => assert.fail("nothing to remove")), { removed: [], problems: [] });
});

test("adding an area to the saved list keeps one entry per area and refuses names the harness would not remove", () => {
  const over = "minecraft:overworld";
  const one = addOwnedArea([], { name: "harness_1_1", dimension: over });
  assert.deepEqual(one, [{ name: "harness_1_1", dimension: over }]);
  assert.deepEqual(addOwnedArea(one, { name: "harness_1_1", dimension: over }), one);
  assert.equal(addOwnedArea(one, { name: "harness_1_1", dimension: "minecraft:nether" }).length, 2);
  assert.equal(one.length, 1, "the list it was given is not changed");
  assert.throws(() => addOwnedArea(one, { name: "pool", dimension: over }), /harness_<phase>_<n>/);
  assert.throws(() => addOwnedArea(one, { name: "harness_1_2", dimension: "minecraft:elsewhere" }), /dimension/);
});
