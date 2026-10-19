import assert from "node:assert/strict";
import { test } from "node:test";
import { afterTickingAreaAdd, radiusProblem, tickingAreaCommandProblem } from "./tickingarea.js";

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
