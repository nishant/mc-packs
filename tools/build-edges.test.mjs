// W8 (BSE-05, BSE-29, BSE-30): Easy Building's outlines as line segments along the block edges, and the mirror planes
// as six lines each. Pure geometry (packs/build_bp/scripts/utils/edges.js), plus the mirror's plane builder.
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { creaseSegments, boxSegments, capSegments } from "../packs/build_bp/scripts/utils/edges.js";

const mockUrl = pathToFileURL(path.resolve("tools/build-w9-mc-mock.mjs")).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@minecraft/server" || specifier === "@minecraft/server-ui") return { url: mockUrl, shortCircuit: true };
    return next(specifier, context);
  },
});
const { mirrorSegments } = await import("../packs/build_bp/scripts/core/ModifierVisualizer.js");

const box = (x1, x2, y1, y2, z1, z2, hollow = false) => {
  const out = [];
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) {
    const shell = x === x1 || x === x2 || y === y1 || y === y2 || z === z1 || z === z2;
    if (!hollow || shell) out.push({ x, y, z });
  }
  return out;
};
const sortSegs = (segs) => segs.map((s) => `${s.axis}|${s.x}|${s.y}|${s.z}|${s.len}`).sort();

test("a solid box of any size is its 12 edges", () => {
  for (const [dx, dy, dz] of [[1, 1, 1], [5, 5, 5], [20, 3, 7], [30, 1, 30]]) {
    const segs = creaseSegments(box(10, 10 + dx - 1, 64, 64 + dy - 1, -5, -5 + dz - 1));
    assert.equal(segs.length, 12, `${dx}x${dy}x${dz}`);
    assert.deepEqual(sortSegs(segs), sortSegs(boxSegments(10, 10 + dx - 1, 64, 64 + dy - 1, -5, -5 + dz - 1)));
  }
});

test("the lines run along block corners and cover the box", () => {
  const segs = boxSegments(0, 3, 0, 0, 0, 1);
  const xs = segs.filter((s) => s.axis === 0);
  assert.equal(xs.length, 4);
  for (const s of xs) { assert.equal(s.len, 4); assert.equal(s.x, 2); assert.ok([0, 1].includes(s.y) && [0, 2].includes(s.z)); }
});

test("a hollow box shows its outside edges only, like a solid one", () => {
  assert.equal(creaseSegments(box(0, 9, 0, 9, 0, 9, true)).length, 12);
});

test("an L shape draws its outer corners, not the inner one", () => {
  // Two 3x1x1 bars meeting at a corner: an L of 5 cells in one layer.
  const cells = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 }];
  const segs = creaseSegments(cells);
  // The concave vertical edge is at x=1, z=1: cells (0,0,0), (1,0,0) and (0,0,1) are filled, (1,0,1) is empty, three of
  // four, so it is left out.
  assert.ok(!segs.some((s) => s.axis === 1 && s.x === 1 && s.z === 1), "no line in the inside corner");
  assert.ok(segs.some((s) => s.axis === 1 && s.x === 0 && s.z === 0), "the outer corner is drawn");
  assert.ok(segs.length > 12 && segs.length < 30, `${segs.length} lines`);
});

test("two cubes touching along an edge draw that edge", () => {
  const segs = creaseSegments([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }]);
  assert.ok(segs.some((s) => s.axis === 2 && s.x === 1 && s.y === 1), "the shared edge");
});

test("rough ground stays under the cap: the longest lines are kept", () => {
  const cells = [];
  for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) {
    const h = (x * 7 + z * 13) % 4;
    for (let y = 0; y <= h; y++) cells.push({ x, y, z });
  }
  const all = creaseSegments(cells);
  assert.ok(all.length > 250, `rough ground makes many lines (${all.length})`);
  const kept = capSegments(all, 250);
  assert.equal(kept.length, 250);
  const shortestKept = Math.min(...kept.map((s) => s.len));
  assert.ok(all.filter((s) => s.len > shortestKept).every((s) => kept.includes(s)), "every longer line is kept");
});

test("a mirror draws six lines a plane, only for the planes that are on", () => {
  const m = { x: 10, y: 64, z: 20, axisX: true, axisY: false, axisZ: false, radius: 32 };
  const p = { x: 12, y: 70.2, z: 25 };
  assert.equal(mirrorSegments(m, p).length, 6);
  assert.equal(mirrorSegments({ ...m, axisZ: true }, p).length, 12);
  assert.equal(mirrorSegments({ ...m, axisX: false, axisY: true }, p).length, 6);
  // The X plane sits at x = 10, spans 24 blocks each way (the view clip), centered on the player's block height.
  for (const s of mirrorSegments(m, p)) {
    assert.equal(s.x, 10);
    assert.notEqual(s.axis, 0);
    assert.ok(s.len === 49, `length ${s.len}`);
  }
});
