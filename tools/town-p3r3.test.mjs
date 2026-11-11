// Town Projects, phase 3 round 3 wiring checks on packs/town_bp/scripts/main.js: a re-added removed town gets a fresh
// id (its town:gone entry stays), clearLife skips the write when nothing changed, untagResident's comment is honest.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const main = fs.readFileSync(path.join(import.meta.dirname, "../packs/town_bp/scripts/main.js"), "utf8");

test("addTown: a gone town's id is never reused and town:gone is not edited", () => {
  const add = main.slice(main.indexOf("function addTown("), main.indexOf("function addTown(") + 6000);
  assert.match(add, /goneIds\.includes\(id\)/);
  assert.doesNotMatch(add, /saveGone\(/);
});

test("clearLife: leftovers saved only when changed", () => {
  const f = main.slice(main.indexOf("function clearLife("), main.indexOf("const inRect"));
  assert.match(f, /!leftOnly \|\| JSON\.stringify\(w\) !== before/);
});

test("untagResident: comment names the kept resident behavior group", () => {
  assert.doesNotMatch(main, /it stays, an ordinary villager/);
  assert.match(main, /keeps its name and the realm:town_resident behavior group/);
});
