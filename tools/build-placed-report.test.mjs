import { test } from "node:test";
import assert from "node:assert/strict";
import { placedBoxes } from "../packs/build_bp/scripts/utils/placed-boxes.js";

test("one position gives one 1x1x1 box", () => {
  assert.deepEqual(placedBoxes([{ x: 5, y: 70, z: -3 }]), [[5, 70, -3, 5, 70, -3]]);
});

test("a 100-block line splits at every 16 blocks", () => {
  const line = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 10, z: 0 }));
  const boxes = placedBoxes(line);
  assert.equal(boxes.length, 7);
  assert.deepEqual(boxes[0], [0, 10, 0, 15, 10, 0]);
  assert.deepEqual(boxes[6], [96, 10, 0, 99, 10, 0]);
});

test("two blocks at opposite corners of a 64-block volume stay two small boxes", () => {
  assert.equal(placedBoxes([{ x: 0, y: 0, z: 0 }, { x: 63, y: 63, z: 63 }]).length, 2);
});

test("negative coordinates group by floor", () => {
  assert.equal(placedBoxes([{ x: -1, y: 0, z: 0 }, { x: -16, y: 0, z: 0 }]).length, 1);
  assert.equal(placedBoxes([{ x: -1, y: 0, z: 0 }, { x: -17, y: 0, z: 0 }]).length, 2);
});

test("fractions are floored and every side is at most 16", () => {
  assert.deepEqual(placedBoxes([{ x: 1.7, y: 2.2, z: 3.9 }]), [[1, 2, 3, 1, 2, 3]]);
  const pts = [];
  for (let i = -200; i < 200; i += 7) pts.push({ x: i, y: i / 3, z: -i });
  for (const b of placedBoxes(pts)) {
    assert.ok(b[3] - b[0] + 1 <= 16 && b[4] - b[1] + 1 <= 16 && b[5] - b[2] + 1 <= 16);
  }
});

test("natural-kinds.js equals Town Projects' NATURAL and WILD", async () => {
  const a = await import("../packs/build_bp/scripts/utils/natural-kinds.js");
  const b = await import("../packs/town_bp/scripts/sites.js");
  assert.deepEqual([...a.NATURAL].sort(), [...b.NATURAL].sort());
  assert.deepEqual([...a.WILD].sort(), [...b.WILD].sort());
});
