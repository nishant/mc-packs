import { test } from "node:test";
import assert from "node:assert/strict";
import { placedBoxes } from "../packs/build_bp/scripts/utils/placed-boxes.js";

test("one position gives one 1x1x1 box", () => {
  assert.deepEqual(placedBoxes([{ x: 5, y: 70, z: -3 }]), [[5, 70, -3, 5, 70, -3]]);
});

test("a 100-block line splits at x=64", () => {
  const line = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 10, z: 0 }));
  const boxes = placedBoxes(line);
  assert.equal(boxes.length, 2);
  assert.deepEqual(boxes[0], [0, 10, 0, 63, 10, 0]);
  assert.deepEqual(boxes[1], [64, 10, 0, 99, 10, 0]);
});

test("negative coordinates group by floor", () => {
  assert.equal(placedBoxes([{ x: -1, y: 0, z: 0 }, { x: -64, y: 0, z: 0 }]).length, 1);
  assert.equal(placedBoxes([{ x: -1, y: 0, z: 0 }, { x: -65, y: 0, z: 0 }]).length, 2);
});

test("fractions are floored and every side is at most 64", () => {
  assert.deepEqual(placedBoxes([{ x: 1.7, y: 2.2, z: 3.9 }]), [[1, 2, 3, 1, 2, 3]]);
  const pts = [];
  for (let i = -200; i < 200; i += 7) pts.push({ x: i, y: i / 3, z: -i });
  for (const b of placedBoxes(pts)) {
    assert.ok(b[3] - b[0] + 1 <= 64 && b[4] - b[1] + 1 <= 64 && b[5] - b[2] + 1 <= 64);
  }
});
