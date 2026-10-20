// Wanderers of the Wilds' isOurTurnedWanderer (packs/wander_bp/scripts/main.js), run for real: lightning makes a witch
// of a road wanderer, and the 1-second upkeep may spawn the wanderer again in the same tick, before the witch is
// checked. The witch still wears that wanderer's unique marker and must be recognized as ours (removed), not left
// standing with their name (wander-walk's flaky "no named witch left").
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as labels from "./name-labels-shared.js";

const file = process.env.WANDER_MAIN ?? path.join(import.meta.dirname, "..", "packs", "wander_bp", "scripts", "main.js");
const text = fs.readFileSync(file, "utf8");
const source = ts.createSourceFile("main.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
/** @type {string[]} */
const parts = [];
const visit = (/** @type {import("typescript").Node} */ node) => {
  if (ts.isFunctionDeclaration(node) && (node.name?.text === "isOurTurnedWanderer" || node.name?.text === "ourNames")) parts.push(node.getText(source));
  if (ts.isVariableStatement(node) && /\b(wandererLabel|wandererMarker) = /.test(node.getText(source))) parts.push(node.getText(source));
  ts.forEachChild(node, visit);
};
visit(source);
assert.ok(parts.some((p) => p.includes("function isOurTurnedWanderer")), "the test runs the actual isOurTurnedWanderer");

function load(live, alive) {
  const ctx = {
    live,
    camps: {},
    NAMED: [],
    NAMED_BY_ID: new Map(),
    entityById: (id) => (alive.has(id) ? { id } : undefined),
    ...labels,
  };
  vm.createContext(ctx);
  vm.runInContext(`${parts.join("\n")}\nthis.isOurs = isOurTurnedWanderer;`, ctx);
  return ctx.isOurs;
}

test("a witch with a road wanderer's marker is ours even after the wanderer was spawned again", () => {
  const live = { s1: { w: "s1", n: "Ada the Pilgrim", d: "minecraft:overworld", e: "new-villager" } };
  const marker = labels.encodeHiddenMarker("b4", "road:s1");
  const witch = { nameTag: marker, dimension: { id: "minecraft:overworld" } };
  // The wanderer's new villager already exists (the upkeep ran in between): still ours.
  assert.equal(load(live, new Set(["new-villager"]))(witch), true);
  // And as before, with no new villager yet.
  assert.equal(load(live, new Set())(witch), true);
  // Someone else's witch is never ours.
  assert.equal(load(live, new Set())({ nameTag: "Bob's witch", dimension: { id: "minecraft:overworld" } }), false);
});
