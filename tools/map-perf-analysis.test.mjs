import assert from "node:assert/strict";
import test from "node:test";
import { BALANCED, SPEED } from "../packs/map_bp/scripts/map-profile.js";
import { EVIDENCE_KIND, instrumentMain, invocationSnapshotReader, runPlannerProbe, runRetentionProbe, sourceProvenance } from "./map-perf-analysis.mjs";

for (const count of [10, 40]) for (const profile of [SPEED, BALANCED]) {
  test(`perf analysis labels ${profile.id}/${count} active stationary viewers without claiming native CPU`, () => {
    const result = runPlannerProbe({ count, profile, ticks: 16 });
    assert.equal(result.kind, EVIDENCE_KIND);
    assert.equal(result.viewers, count);
    assert.equal(result.radarTerrainOn, count);
    assert.equal(result.nativeOperations, 0, "complete fresh footprint needs no terrain operation");
    assert.equal(result.pendingPicks, 0);
    assert.ok(result.nativeCols >= 1000, "real complete canonical circle is seeded, not zero-viewer work");
    assert.ok(result.planCalls >= count);
    assert.ok(result.planBuilds >= count, "each real viewer was actually planned");
    assert.ok(result.planAddVisits > 0);
    assert.match(result.mainSha256, /^[a-f0-9]{64}$/);
  });
  test(`retention analysis preserves ${profile.id}/${count} normal capacity with and without a manual job`, () => {
    for (const activeJob of [false, true]) {
      const result = runRetentionProbe({ count, profile, ticks: 4, activeJob });
      assert.equal(result.radarTerrainOn, count);
      assert.ok(result.maxCols >= count * 1200, "normal cache capacity must not vanish behind an idle fast path");
      assert.equal(result.nativeOperations, 0, "synchronizing retention never dispatches terrain work");
      assert.equal(result.activeJobs, Number(activeJob));
      if (activeJob) assert.equal(result.retainedFootprints, count + 1, "normal viewers and fixed-origin job stay protected");
    }
  });
}

test("instrumentation modifies only the parsed planner body and nested add arrow", () => {
  const source = "const x='function planFor fake'; function planFor(p,now){const add=(key)=>{return key};return add(p)} function unrelated(){return 3}";
  const result = instrumentMain(source);
  assert.deepEqual(result.found, { planFor: 1, planAdd: 1, labCoverage: 0, radarOf: 0 });
  assert.ok(result.source.includes("function unrelated(){return 3}"));
  assert.equal((result.source.match(/planAddVisits\+\+/g) ?? []).length, 1);
});

test("snapshot proposal shares one native materialization and cached failure within an invocation", () => {
  let locationReads = 0, dimensionReads = 0, validReads = 0;
  const player = {
    get location() { locationReads++; return { x: 1, y: 64, z: 3 }; },
    get dimension() { dimensionReads++; return { id: "minecraft:overworld" }; },
    get isValid() { validReads++; return true; },
  };
  const snapshot = invocationSnapshotReader(p => {
    const at = p.location, dim = p.dimension;
    return { x: at.x, y: at.y, z: at.z, dimId: dim.id };
  });
  assert.equal(snapshot(player), snapshot(player));
  assert.deepEqual(snapshot(player), { x: 1, y: 64, z: 3, dimId: "minecraft:overworld" });
  assert.equal(locationReads, 1);
  assert.equal(dimensionReads, 1);
  assert.equal(validReads, 0);
  let failedReads = 0;
  const failure = invocationSnapshotReader(() => { failedReads++; throw new Error("player left"); });
  assert.equal(failure(player), undefined);
  assert.equal(failure(player), undefined);
  assert.equal(failedReads, 1, "cache absence as well as success");
});

test("a new invocation in the SAME tick sees movement/dimension change instead of a stale tick cache", () => {
  const player = { at: { x: 1, y: 64, z: 1 }, dimId: "minecraft:overworld" };
  const read = p => ({ ...p.at, dimId: p.dimId });
  const firstInvocation = invocationSnapshotReader(read);
  const first = firstInvocation(player);
  player.at = { x: 200, y: 80, z: -2 }; player.dimId = "minecraft:nether";
  assert.equal(firstInvocation(player), first, "the first dispatch owns a stable local snapshot");
  const secondInvocation = invocationSnapshotReader(read);
  assert.deepEqual(secondInvocation(player), { x: 200, y: 80, z: -2, dimId: "minecraft:nether" });
});

test("probe rejects unapproved populations and unbounded loops", () => {
  assert.throws(() => runPlannerProbe({ count: 0 }), /10\/40/);
  assert.throws(() => runRetentionProbe({ count: 40, ticks: 1001 }), /bounded/);
  const provenance = sourceProvenance();
  for (const key of ["mainSha256", "mainNormalizedSha256", "fixtureSha256"]) assert.match(provenance[key], /^[a-f0-9]{64}$/);
});
