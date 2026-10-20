// Story Questlines' defeatSpawnTick (packs/saga_bp/scripts/objectives.js), run for real in node: a night fight's mobs
// (a `defeat` with `spawn` and `night: true`) come on a world whose daylight cycle is stopped, where night never falls
// (F61). Counting already treats stopped time as night (nightMet); spawning used isNight(), so the step could never be
// finished there. SAGA_OBJECTIVES points the test at another copy of the file (to show the old code failing).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const file = process.env.SAGA_OBJECTIVES ?? path.join(import.meta.dirname, "..", "packs", "saga_bp", "scripts", "objectives.js");
const source = ts.createSourceFile("objectives.js", fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
/** @type {string[]} */
const parts = [];
(function visit(/** @type {import("typescript").Node} */ node) {
  if (ts.isFunctionDeclaration(node) && ["defeatSpawnTick", "timeMoves", "nightMet"].includes(node.name?.text ?? "")) parts.push(node.getText(source).replace(/^export /, ""));
  if (ts.isVariableStatement(node) && /export const isNight =/.test(node.getText(source))) parts.push(node.getText(source).replace(/^export /, ""));
  ts.forEachChild(node, visit);
})(source);
assert.equal(parts.length, 4, "the test runs the actual defeatSpawnTick, isNight, timeMoves and nightMet");

/** One defeatSpawnTick for a player standing in the middle of a night fight; returns how many mobs were asked for. */
function tick({ cycle, time }) {
  let spawned = 0;
  const scene = { pid: "ann", key: "s:c:0", data: {}, members: new Map() };
  const ctx = {
    world: { gameRules: { doDayLightCycle: cycle }, getTimeOfDay: () => time, getDimension: () => ({}) },
    system: { currentTick: 1000 },
    locate: () => ({ dim: "minecraft:overworld", x: 0, z: 0, label: "the fen" }),
    radiusOf: () => 32,
    across: (/** @type {any} */ a, /** @type {any} */ b) => Math.hypot(a.x - b.x, a.z - b.z),
    sceneFor: () => scene,
    actorsOf: () => [],
    membersOf: () => [],
    target: () => 6,
    progressOf: () => 0,
    withY: (/** @type {any} */ l) => ({ ...l, y: 64 }),
    spawnGroup: (/** @type {any} */ _p, /** @type {any} */ _d, /** @type {any} */ _c, /** @type {any} */ g) => {
      spawned += g.count;
      return [];
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${parts.join("\n")}\nthis.run = defeatSpawnTick;`, ctx);
  const player = { id: "ann", dimension: { id: "minecraft:overworld" }, location: { x: 1, y: 64, z: 1 }, sendMessage() {}, playSound() {} };
  const obj = { type: "defeat", label: "x", count: 6, night: true, spawn: { count: 3 } };
  /** @type {any} */ (ctx).run(player, { st: {} }, 0, obj);
  return spawned;
}

test("a night fight's mobs come at night, and with the daylight cycle stopped at any time", () => {
  assert.equal(tick({ cycle: true, time: 18000 }), 3, "night, time moving");
  assert.equal(tick({ cycle: true, time: 6000 }), 0, "day, time moving: they wait for night");
  assert.equal(tick({ cycle: false, time: 6000 }), 3, "time stopped at noon: night never comes, so they come now");
});
