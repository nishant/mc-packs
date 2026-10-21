// Expedition build steps (O10): every fill a dungeon build or reset makes is split into slabs of at most STEP_BLOCKS
// blocks, so no runJob step holds a tick for long (a 16 x 16 x 20 seal fill was 20 ms and a big room's walls 26 ms at
// 40 players), and together the slabs fill exactly the box the single fill did.
//   node --test tools/expedition-slabs.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STEP_BLOCKS, STEP_MS, slabs } from "../packs/expedition_bp/scripts/slabs.js";

const vol = (s) => (s.to.x - s.from.x + 1) * (s.to.y - s.from.y + 1) * (s.to.z - s.from.z + 1);

function covered(list) {
  const seen = new Map();
  for (const s of list)
    for (let x = s.from.x; x <= s.to.x; x++)
      for (let y = s.from.y; y <= s.to.y; y++)
        for (let z = s.from.z; z <= s.to.z; z++) {
          const k = `${x},${y},${z}`;
          seen.set(k, (seen.get(k) ?? 0) + 1);
        }
  return seen;
}

test("a seal column, a big room's walls and a thin floor become slabs of at most STEP_BLOCKS that cover the box once", () => {
  const boxes = [
    [{ x: 0, y: -1, z: 0 }, { x: 15, y: 40, z: 15 }], // a seal column (16 x 16, the box's full height)
    [{ x: 100, y: 10, z: 100 }, { x: 78, y: 21, z: 78 }], // a big room's walls, corners in the other order
    [{ x: 0, y: 5, z: 0 }, { x: 60, y: 5, z: 60 }], // one layer wider than STEP_BLOCKS: kept whole
  ];
  for (const [from, to] of boxes) {
    const list = slabs(from, to);
    const area = (Math.abs(to.x - from.x) + 1) * (Math.abs(to.z - from.z) + 1);
    for (const s of list) assert.ok(vol(s) <= Math.max(STEP_BLOCKS, area), `a slab of ${vol(s)} blocks`);
    const seen = covered(list);
    assert.equal(seen.size, (Math.abs(to.y - from.y) + 1) * area, "every block of the box");
    assert.ok([...seen.values()].every((n) => n === 1), "each block once");
  }
});

test("the dungeon build splits its fills into slabs and takes a room's parts in turns of STEP_MS", () => {
  const src = readFileSync(new URL("../packs/expedition_bp/scripts/main.js", import.meta.url), "utf8");
  assert.ok(STEP_MS > 0 && STEP_MS <= 12);
  // The seal/reset columns and the room walls and air go through fillSteps (slabs), not one fill per box.
  const build = src.slice(src.indexOf("function fillBoxSteps("), src.indexOf("function* buildParts("));
  assert.doesNotMatch(build, /y \+= 20/, "no 20-layer seal fills");
  assert.match(build, /steps\.push\(\.\.\.fillSteps\(dim, \{ x: c\.x - w/, "the room walls in slabs");
  assert.match(build, /steps\.push\(\.\.\.fillSteps\(dim, \{ x: c\.x - rm\.r, y: F \+ 1/, "the room's air in slabs");
  assert.match(src, /function\* buildParts\(/, "a room's parts are placed by a generator");
  assert.match(src, /if \(more && typeof more\.next === "function"\)/, "runSteps runs a generator step a slice at a time");
});
