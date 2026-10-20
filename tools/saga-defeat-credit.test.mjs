// Story Questlines' defeatCredit (packs/saga_bp/scripts/objectives.js), run for real in node: what one kill adds to a
// `defeat` step. A story mob that came for a `defeat` with `spawn` counts only for that step and only for the player,
// party or mate it was spawned for (F62); before, any story mob of the right kind counted for every such step anywhere.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const file = path.join(import.meta.dirname, "..", "packs", "saga_bp", "scripts", "objectives.js");
const source = ts.createSourceFile("objectives.js", fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
/** @type {string | undefined} */
let fn;
(function visit(/** @type {import("typescript").Node} */ node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "defeatCredit") fn = node.getText(source);
  ts.forEachChild(node, visit);
})(source);
assert.ok(fn, "the test runs the actual defeatCredit");

const ctx = {
  objKey: (/** @type {any} */ e, /** @type {number} */ i) => `${e.story.id}:${e.chapter.id}:${i}`,
  // The step's area: 32 blocks around 0,0 in the Overworld.
  inArea: (/** @type {any} */ _obj, /** @type {any} */ at, /** @type {string} */ dim) => dim === "minecraft:overworld" && Math.hypot(at.x, at.z) <= 32,
};
vm.createContext(ctx);
vm.runInContext(`${fn}\nthis.credit = defeatCredit;`, ctx);
/** @type {(obj: any, e: any, i: number, kill: any) => number} */
const credit = /** @type {any} */ (ctx).credit;

const e = { story: { id: "act2_choir" }, chapter: { id: "pattern" } };
const KEY = "act2_choir:pattern:3";
const fight = { type: "defeat", mobs: ["minecraft:pillager", "minecraft:vindicator"], count: 6, spawn: { count: 3 } };
const plain = { type: "defeat", mobs: ["minecraft:zombie"], count: 5 };
const owners = () => new Set(["ann", "party|realm_party:abc", "bob"]);
const kill = (/** @type {any} */ o) => ({ type: "minecraft:pillager", night: false, at: { x: 0, y: 64, z: 0 }, dim: "minecraft:overworld", add: undefined, owners, ...o });

test("a story mob spawned for the step counts for its player and party, even past the edge", () => {
  assert.equal(credit(fight, e, 3, kill({ add: { owner: "ann", key: KEY } })), 1);
  assert.equal(credit(fight, e, 3, kill({ add: { owner: "party|realm_party:abc", key: KEY } })), 1, "the party's shared group");
  assert.equal(credit(fight, e, 3, kill({ add: { owner: "bob", key: KEY } })), 1, "a party mate's own group");
  assert.equal(credit(fight, e, 3, kill({ add: { owner: "ann", key: KEY }, at: { x: 200, y: 64, z: 0 } })), 1, "the fight drifted past the edge");
});

test("a story mob spawned for someone else or for something else counts for nobody's spawn step", () => {
  assert.equal(credit(fight, e, 3, kill({ add: { owner: "dan", key: KEY } })), 0, "another player's fight, in the area");
  assert.equal(credit(fight, e, 3, kill({ add: { owner: "dan", key: KEY }, at: { x: 300, y: 64, z: 0 } })), 0, "another player's fight, far away");
  assert.equal(credit(fight, e, 3, kill({ add: { owner: "ann", key: "realm:saga:sky_seal" } })), 0, "a champion's adds");
  assert.equal(credit(fight, e, 3, kill({ add: { owner: "ann", key: "act2_choir:pattern:1" } })), 0, "another step's ambush");
});

test("other mobs count inside the area only, and only of the right kind", () => {
  assert.equal(credit(fight, e, 3, kill({})), 1, "a pillager in the area");
  assert.equal(credit(fight, e, 3, kill({ at: { x: 100, y: 64, z: 0 } })), 0, "a pillager outside");
  assert.equal(credit(fight, e, 3, kill({ type: "minecraft:zombie" })), 0, "the wrong kind");
  assert.equal(credit(plain, e, 0, kill({ type: "minecraft:zombie", add: { owner: "dan", key: "x" } })), 1, "a step without spawn counts any story mob in its area");
  assert.equal(credit({ ...fight, night: true }, e, 3, kill({ add: { owner: "ann", key: KEY } })), 0, "a night step by day");
  assert.equal(credit({ ...fight, champion: { tag: "realm:x" } }, e, 3, kill({ add: { owner: "ann", key: KEY } })), 0, "champion steps count elsewhere");
});
