// A moving viewer with a long unread queue is rolled in time proportional to the move (map-radar-perf: a whole-queue
// roll of about 1,000 picks took about 7 ms on BDS, every tick, and left the scanner no time to read).
import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./map-movement-fixture.mjs";
import { SPEED } from "../packs/map_bp/scripts/map-profile.js";
import { ROLL_WALK_MAX, rollIncremental } from "../packs/map_bp/scripts/rolling-demand.js";
import { circleAnchors } from "../packs/map_bp/scripts/terrain-work.js";
import { colKey, sampleCoord } from "../packs/map_bp/scripts/terrain.js";

test("rollIncremental appends the entering edge and touches nothing already queued", () => {
  const f = fixture(1, { profile: SPEED }), p = f.roster[0], plan = f.api.planFor(p, 1);
  assert.ok(plan.picks.length > ROLL_WALK_MAX);
  const before = plan.picks.slice(), previous = { x: p.state.at.x, z: p.state.at.z }, current = { x: previous.x + 1, z: previous.z };
  const out = rollIncremental({ store: plan.store, picks: plan.picks, pos: plan.pos, at: plan.at, previous, current, radius: 36, now: 5, maxAge: 2400, missRetry: 5 });
  assert.equal(out.stats.tailVisited, 0);
  assert.ok(out.stats.rawChecks <= out.stats.entered + 9);
  const kept = plan.picks.slice(out.stats.nearPromoted, out.stats.nearPromoted + before.length);
  assert.deepEqual(kept, before, "the queue is the same objects in the same order");
  const old = new Set(circleAnchors(previous, 36, sampleCoord, colKey).map((a) => a.key));
  const queued = new Set(plan.picks.map((q) => q.key));
  for (const a of circleAnchors(current, 36, sampleCoord, colKey)) if (!old.has(a.key)) assert.ok(queued.has(a.key), "every entering column is queued");
});

test("a flier's long queue is rolled incrementally every tick and still converges once it stops", () => {
  const f = fixture(1, { profile: { ...SPEED, ops: 24 } }), p = f.roster[0];
  for (let tick = 1; tick <= 400; tick++) {
    p.state.at = { x: Math.min(tick, 120) * 1, y: 64, z: 0.5 };
    f.tick(tick);
  }
  const c = f.api.terrainBaseMemo.get(p.id).coverage;
  assert.equal(c.eligibleKnownCells, c.eligibleCells, "every cell of the stopped radar is read");
});
