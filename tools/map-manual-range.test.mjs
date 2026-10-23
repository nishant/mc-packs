import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./map-movement-fixture.mjs";
import { SPEED, BALANCED } from "../packs/map_bp/scripts/map-profile.js";
import { COL, colKey, sampleCoord } from "../packs/map_bp/scripts/terrain.js";
import { circleAnchors, countCircleAnchors, MANUAL_SCAN_MAX_RADIUS } from "../packs/map_bp/scripts/terrain-work.js";

const nativeCalls = f => f.queries.filter(q => q[0] !== "entities").length;
const radarOff = (f, p) => f.context.setFor(p, "radar", false);

test("384 is a world-block radius, with exact reservation admission and no extra global capacity", () => {
  const f = fixture(2, { profile: SPEED }), scanner = f.api.manualScans, p = f.roster[0];
  for (const player of f.roster) radarOff(f, player);
  scanner.host.maxRadius = () => MANUAL_SCAN_MAX_RADIUS;
  const count = countCircleAnchors(p.location, 384, sampleCoord, colKey);
  assert.ok(count > 115000 && count < 116000);
  assert.equal(scanner.host.terrain.maxTotalCols, 131072);
  scanner.start(p, 384, 1);
  const c = scanner.contexts.get(p.id);
  assert.equal(c.job.total, count);
  assert.equal(c.job.spec.radius, 384);
  assert.equal(scanner.host.terrain.maxCols, count + 6000);
  assert.throws(() => scanner.start(f.roster[1], 128, 1), /capacity/);
  assert.equal(scanner.contexts.size, 1);
  assert.equal(nativeCalls(f), 0, "admission never performs native terrain work");
  scanner.cancel(p.id);
  scanner.host.terrain.maxTotalCols = count + 5999;
  assert.throws(() => scanner.start(p, 384, 2), /capacity/);
  assert.equal(scanner.contexts.size, 0);
  assert.equal(scanner.host.terrain.retained.size, 0);
});

test("growing ordinary viewer cohort cancels oversized scan rather than overcommitting global RAM", () => {
  const f = fixture(40, { profile: SPEED }), scanner = f.api.manualScans;
  for (const p of f.roster) radarOff(f, p);
  scanner.host.maxRadius = () => MANUAL_SCAN_MAX_RADIUS;
  scanner.start(f.roster[0], 384, 1);
  for (const p of f.roster) f.context.setFor(p, "radar", true);
  scanner.synchronize(f.roster, 2);
  assert.equal(scanner.contexts.size, 0);
  assert.equal(scanner.host.terrain.retained.size, 0);
  assert.ok(scanner.host.terrain.maxCols <= scanner.host.terrain.maxTotalCols);
  assert.equal(nativeCalls(f), 0);
});

test("new and reused counts are disjoint real samples, and status states radius and diameter", () => {
  const f = fixture(1, { profile: BALANCED }), scanner = f.api.manualScans, p = f.roster[0];
  radarOff(f, p);
  const store = scanner.host.snapshot(p).store;
  const first = circleAnchors(p.location, 8, sampleCoord, colKey).next().value;
  f.api.terrain.put(store, first.x, first.z, { kind: "stone", y: 64, depth: 0 }, 1, COL);
  scanner.start(p, 8, 1);
  const c = scanner.contexts.get(p.id);
  for (let tick = 2; tick < 100 && scanner.contexts.size; tick++) f.scan(tick);
  assert.equal(c.reused, 1);
  assert.equal(c.sampled, c.job.total - 1);
  assert.equal(c.job.mapped, c.reused + c.sampled);
  assert.equal(scanner.stats.sampled, c.sampled);
  assert.equal(scanner.stats.reused, c.reused);
  const summary = scanner.last.get(p.id);
  assert.match(summary, /radius 8 world blocks \(16 across\)/);
  assert.match(summary, /2-block samples/);
  assert.match(summary, /new, 1 reused/);
  assert.match(summary, /not force-loaded/);
  assert.match(summary, /Shared RAM only/);
});

test("VM manual128 center-out warms nearby loaded terrain before the unchanged row-major control", t => {
  function firstMapped(rowMajor) {
    // Isolate iterator ordering: both sides intentionally receive the same8-credit global fixture.
    const f = fixture(1, { profile: {...SPEED,ops:8} }), p = f.roster[0], scanner = f.api.manualScans;
    radarOff(f, p);
    const ray = f.dims.overworld.getBlockFromRay;
    f.dims.overworld.getBlockFromRay = at => {
      if (Math.abs(at.x - p.location.x) <= 64 && Math.abs(at.z - p.location.z) <= 64) return ray(at);
      f.queries.push(["ray", f.context.system.currentTick, "unloaded", at]);
      const error = new Error("Fixture column is unloaded"); error.name = "LocationInUnloadedChunkError"; throw error;
    };
    scanner.start(p, 128, 1);
    const c = scanner.contexts.get(p.id);
    if (rowMajor) c.job.cursor = circleAnchors(c.job.spec.center, 128, sampleCoord, colKey);
    let first;
    const put = f.api.terrain.put.bind(f.api.terrain);
    f.api.terrain.put = (...args) => {
      const result = put(...args);
      if (!first && c.plan.store.cols.size > 0) first = { ticks: f.context.system.currentTick - 1, nativeOps: nativeCalls(f) };
      return result;
    };
    for (let tick = 2; tick < 2000 && !first; tick++) {
      const before = nativeCalls(f); f.scan(tick);
      assert.ok(nativeCalls(f) - before <= 8, "ordering never creates a second manual budget");
    }
    assert.ok(first); assert.ok(c.sampled > 0);
    scanner.cancel(p.id);
    return first;
  }
  const rowMajor = firstMapped(true), centerOut = firstMapped(false);
  assert.equal(centerOut.ticks, 1);
  assert.equal(centerOut.nativeOps, 2);
  assert.ok(rowMajor.ticks > 100);
  assert.ok(rowMajor.nativeOps > 1000);
  t.diagnostic(JSON.stringify({ modelOnlyNotNativeCPU: true, rowMajor, centerOut }));
});

test("unloaded cells are finite unavailable outcomes, then moving and rescanning warms newly loaded shared data", () => {
  const f = fixture(1, { profile: BALANCED }), p = f.roster[0], scanner = f.api.manualScans;
  radarOff(f, p);
  const ray = f.dims.overworld.getBlockFromRay;
  f.dims.overworld.getBlockFromRay = at => {
    if (Math.abs(at.x - p.location.x) <= 8 && Math.abs(at.z - p.location.z) <= 8) return ray(at);
    f.queries.push(["ray", f.context.system.currentTick, "unloaded", at]);
    const error = new Error("Fixture column is unloaded"); error.name = "LocationInUnloadedChunkError"; throw error;
  };
  scanner.start(p, 64, 1);
  const first = scanner.contexts.get(p.id);
  let tick = 2;
  for (; tick < 2000 && scanner.contexts.size; tick++) f.scan(tick);
  assert.equal(scanner.contexts.size, 0);
  assert.ok(first.job.unavailable > first.job.mapped);
  assert.ok(first.job.mapped > 0);
  assert.equal(first.job.failed, 0);
  assert.equal(first.job.total, first.job.mapped + first.job.unavailable);
  const store = first.plan.store, originKey = colKey(p.location.x, p.location.z, COL);
  assert.equal(store.cols.get(originKey).valid, true);
  p.state.at = { x: 20.2, y: 64, z: -0.2 };
  const targetKey = colKey(p.location.x, p.location.z, COL);
  assert.equal(store.cols.has(targetKey), false);
  scanner.start(p, 8, tick);
  const second = scanner.contexts.get(p.id);
  for (tick++; tick < 2200 && scanner.contexts.size; tick++) f.scan(tick);
  assert.equal(scanner.contexts.size, 0);
  assert.equal(second.job.mapped, second.job.total);
  assert.equal(second.job.unavailable, 0);
  assert.equal(second.plan.store, store);
  assert.equal(store.cols.get(targetKey).valid, true);
  assert.equal(store.cols.get(originKey).valid, true, "previous completed shared data remains usable until edits or eviction");
});

test("processing estimate is finite, labels its assumptions, and pauses rather than promising stalled work", () => {
  const f = fixture(1, { profile: BALANCED }), scanner = f.api.manualScans, p = f.roster[0];
  radarOff(f, p); scanner.start(p, 64, 1);
  const c = scanner.contexts.get(p.id);
  assert.doesNotMatch(scanner.describe(c), /Est\.|Infinity|NaN/);
  f.scan(2);
  c.now = 81; c.lastProgress = 81;
  assert.match(scanner.describe(c), /Est\. processing left: \d+[sm] at observed pace \(20 TPS\)/);
  c.now = 161;
  assert.match(scanner.describe(c), /Estimate paused until work resumes/);
  assert.doesNotMatch(scanner.describe(c), /Infinity|NaN/);
  scanner.cancel(p.id);
  assert.doesNotMatch(scanner.describe(c), /Est\.|Estimate paused/);
});

test("no manual jobs means no manual viewer-handle reads or retention churn, preserving normal capacity", () => {
  const f = fixture(40, { profile: SPEED }), scanner = f.api.manualScans;
  let snapshots = 0, visible = 0, protections = 0;
  const snapshot = scanner.host.snapshot, isVisible = scanner.host.visible, protect = scanner.host.terrain.protect;
  scanner.host.snapshot = p => { snapshots++; return snapshot(p); };
  scanner.host.visible = p => { visible++; return isVisible(p); };
  scanner.host.terrain.protect = function (...args) { protections++; return protect.apply(this, args); };
  for (let tick = 1; tick <= 100; tick++) scanner.synchronize(f.roster, tick);
  assert.equal(snapshots, 0);
  assert.equal(visible, 0);
  assert.equal(protections, 0);
  assert.equal(scanner.host.terrain.retained.size, 0);
  assert.ok(scanner.host.terrain.maxCols >= 48000, "forty ordinary viewers retain their existing headroom");
  const highWater = scanner.host.terrain.maxCols;
  scanner.synchronize(f.roster.slice(0, 1), 101);
  assert.equal(scanner.host.terrain.maxCols, highWater, "idle cleanup never shrinks the high-water cache limit");
});

test("active scans protect all ordinary viewers and final cancellation releases only manual pins once", () => {
  const f = fixture(3, { profile: BALANCED }), scanner = f.api.manualScans, p = f.roster[0];
  scanner.start(p, 8, 1);
  scanner.synchronize(f.roster, 2);
  assert.ok(scanner.host.terrain.retained.has("scan:" + p.id));
  for (const other of f.roster) assert.ok(scanner.host.terrain.retained.has("viewer:" + other.id));
  const store = scanner.contexts.get(p.id).plan.store;
  scanner.host.terrain.protect("unrelated", store, { x: 100, z: 100 }, 8);
  const highWater = scanner.host.terrain.maxCols;
  scanner.cancel(p.id);
  assert.deepEqual([...scanner.host.terrain.retained.keys()], ["unrelated"]);
  scanner.synchronize(f.roster, 3);
  assert.equal(scanner.host.terrain.maxCols, highWater);
  assert.deepEqual([...scanner.host.terrain.retained.keys()], ["unrelated"]);
});

for (const profile of [SPEED, BALANCED]) test(profile.id + " completed manual fill is reused by another traveling viewer's actual raster", () => {
  const f = fixture(2, { profile }), [owner, viewer] = f.roster;
  for (const p of f.roster) radarOff(f, p);
  f.api.manualScans.start(owner, 64, 1);
  const context = f.api.manualScans.contexts.get(owner.id);
  let tick = 2;
  for (; tick < 2000 && f.api.manualScans.contexts.size; tick++) f.scan(tick);
  assert.equal(f.api.manualScans.contexts.size, 0);
  assert.equal(context.job.progress().mapped, context.job.total);
  assert.equal(context.job.progress().unavailable, 0);
  const store = context.plan.store, filled = store.cols.size;
  assert.equal(filled, context.job.total);
  const queriesBefore = nativeCalls(f);
  for (const at of [{ x: 20.2, y: 64, z: -0.2 }, { x: -18.2, y: 64, z: 2.2 }, owner.state.at]) {
    viewer.state.at = { ...at };
    f.api.playerStore.set(viewer.id, store);
    f.api.radarOf(0, [], 36, true, viewer.state.at, viewer.state.dim.id, true, viewer.id, true, tick);
    const memo = f.api.terrainBaseMemo.get(viewer.id);
    assert.equal(memo.coverage.sampled2, memo.coverage.eligibleCells, "shared genuine2 terrain covers the moved raster");
    assert.equal(memo.coverage.unknownCells, 0);
    assert.equal(memo.coverage.previewCells, 0);
    assert.ok(store.cols.get(colKey(at.x, at.z, COL)).valid);
  }
  assert.equal(nativeCalls(f), queriesBefore, "render/revisit performs no extra native queries");
  assert.equal(store.cols.size, filled);
  assert.equal(f.io.filter(x => String(x[1]).startsWith("map:detail:")).length, 0, "shared RAM warming is not a durability claim");
});
