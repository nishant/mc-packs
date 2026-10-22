// Canonical two-block terrain sampling: grid alignment, cache identities, fine overrides, and bounded reads.
//   node --test tools/map-two-block-sampling.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG } from "../packs/map_bp/scripts/config.js";
import { COL, colKey, glyphAt, planScan, radarGeometry, readColumn, sampleCoord, sampleResolution, spendBudget, TerrainWorld } from "../packs/map_bp/scripts/terrain.js";

test("33-cell grid keeps distinct two-block samples at a 32-block reference edge range", () => {
  assert.equal(COL, 2);
  assert.equal(CONFIG.radarCells, 33);
  assert.equal(CONFIG.radarRadius, 36);
  assert.equal(CONFIG.revealRadius, 36);
  const half = 16;
  const geometry = radarGeometry("overworld|surface", 128, -128, 0, true, 32, half);
  const row = half * 33;
  const center = row + half;
  assert.equal(geometry.coarseX[center], sampleCoord(128));
  assert.equal(geometry.coarseZ[center], sampleCoord(-128));
  for (let col = 0; col < 32; col++) {
    const i = row + col;
    assert.equal(geometry.x[i + 1] - geometry.x[i], 2, "adjacent default radar cells are two blocks apart");
    assert.equal(geometry.coarseX[i + 1] - geometry.coarseX[i], 2, "their canonical sample centers stay distinct");
    assert.notEqual(geometry.coarseKey[i], geometry.coarseKey[i + 1]);
  }
  for (let r = 0; r < 32; r++) {
    const i = r * 33 + half;
    assert.equal(geometry.coarseZ[i + 33] - geometry.coarseZ[i], 2);
    assert.notEqual(geometry.coarseKey[i], geometry.coarseKey[i + 33]);
  }
});

test("coarse keys split neighboring two-block samples while fine keys remain exact", () => {
  assert.equal(colKey(0, 0), colKey(1, 0), "positions in one two-block cell share its canonical sample");
  assert.notEqual(colKey(0, 0), colKey(2, 0), "neighboring two-block cells do not alias within an old four-block bucket");
  assert.notEqual(colKey(0, 0), colKey(4, 0));
  assert.notEqual(colKey(1, 1, 1), colKey(1, 1, COL), "resolution is part of cache identity");

  assert.equal(sampleCoord(-1), -1);
  assert.equal(sampleCoord(-2), -1);
  assert.equal(colKey(-1, -1), colKey(-2, -2), "negative positions share the correct floored two-block cell");
  assert.equal(sampleCoord(-3), -3);
  assert.notEqual(colKey(-1, -1), colKey(-3, -3), "negative neighboring cells never skew or alias");

  const world = new TerrainWorld(12);
  const store = world.store("overworld");
  const sx = sampleCoord(0), sz = sampleCoord(0);
  world.put(store, sx, sz, { kind: "stone", y: 70, depth: 0 }, 1, COL);
  world.put(store, sx, sz, { kind: "forest", y: 80, depth: 0 }, 2, 1);
  assert.equal(world.get(store, sx, sz, COL).kind, "stone");
  assert.notEqual(glyphAt(world, store, sx, sz, 1), glyphAt(world, store, sx, sz, COL), "fine terrain overrides, without replacing, coarse terrain");
  for (let i = 0; i < 24; i++) world.put(store, i * COL + 100, 100, { kind: "grass", y: 65, depth: 0 }, i + 3, COL);
  assert.ok(store.cols.size <= 12, "both resolutions remain within the configured cache bound");
});

test("near-field sampling stays one-block exact, and the reading budget stays capped", () => {
  assert.equal(sampleResolution(0, 0), 1);
  assert.equal(sampleResolution(6, 0), 1);
  assert.equal(sampleResolution(6.01, 0), COL);
  const world = new TerrainWorld();
  const store = world.store("overworld");
  const picks = planScan({ world, store, at: { x: 128, z: -128 }, heading: 0, north: true, radius: 32, half: 16, lead: { x: 0, z: 0 }, now: 1, maxAge: 2400 });
  assert.ok(picks.some((pick) => pick.resolution === 1));
  assert.ok(picks.some((pick) => pick.resolution === COL));
  for (const pick of picks) assert.equal(colKey(pick.wx, pick.wz, pick.resolution), pick.key);

  let operations = 0;
  const spent = spendBudget([{ id: "viewer", store, picks }], 6, 6, 0, 1, (_plan, pick) => {
    operations++;
    world.put(store, pick.wx, pick.wz, { kind: "stone", y: 70, depth: 0 }, 1, pick.resolution);
  });
  assert.equal(spent.get("viewer"), 6);
  assert.equal(operations, 6, "two-block coarse picks consume the same per-read budget as fine picks");
  assert.equal(store.cols.size, 6);
});

test("the native column sampler still performs one bounded terrain query for solid ground", () => {
  let calls = 0;
  const block = { typeId: "minecraft:stone", location: { y: 70 }, isAir: false };
  const dim = {
    heightRange: { min: -64, max: 320 },
    getBlockFromRay() { calls++; return { block }; },
  };
  const reader = readColumn(dim, sampleCoord(0), sampleCoord(0));
  let step = reader.next();
  while (!step.done) step = reader.next(step.value());
  assert.equal(step.value.kind, "stone");
  assert.equal(calls, 1, "changing coarse spacing does not add sampler operations");
});
