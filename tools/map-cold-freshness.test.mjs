// Actual production scanner: cold fill and repeated equal-value TTL renewal, not native timing.
import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./map-movement-fixture.mjs";
import { SPEED, BALANCED } from "../packs/map_bp/scripts/map-profile.js";
import { circleAnchors } from "../packs/map_bp/scripts/terrain-work.js";
import { colKey, sampleCoord } from "../packs/map_bp/scripts/terrain.js";

for (const profile of [SPEED, BALANCED]) for (const count of [10, 40]) {
  test(`${profile.id}/${count}: actual cold drain and equal-value TTL renewal leave finite complete-plan expiry`, t => {
    const f = fixture(count, { profile });
    f.emit("worldLoad");
    // worldLoad performs the one-time existing-player radar OFF migration. Each viewer now explicitly
    // turns its own radar ON through the same setFor path as /realm:prefs; compass and terrain stay
    // at their defaults (on). No fake zero-Active pass: the viewers are real active radar players.
    for (const p of f.roster) f.context.setFor(p, "radar", true);
    assert.equal(f.roster.filter(p => { const pref = f.api.prefsOf(p); return pref.radar && pref.terrain; }).length, count);
    const store = f.api.terrain.store("minecraft:overworld");
    const keys = [...circleAnchors(f.roster[0].state.at, 36, sampleCoord, colKey)].map(p => p.key);
    assert.equal(keys.length, 1024);
    assert.equal(store.cols.size, 0, "genuinely cold cache; never pre-seeded or glyph-only completion");
    let now = 0;
    const step = tick => {
      const before = f.api.queue.nativeAttempt;
      f.scan(tick); now = tick;
      assert.ok(f.api.queue.nativeAttempt - before <= profile.ops, "the actual shared operation ceiling is unchanged");
    };
    const allMappedSince = tick => keys.every(key => { const sample = store.cols.get(key); return sample?.valid !== false && sample?.source === "native" && sample.tick >= tick; });
    const allDrained = () => f.api.scanPlans.size === count && [...f.api.scanPlans.values()].every(p => p.pos >= p.picks.length);
    const drain = start => {
      const before = f.api.queue.nativeAttempt;
      let completed = false;
      for (let tick = start; tick < start + 240; tick++) {
        step(tick);
        if (allMappedSince(start) && allDrained() && f.api.pendingTerrain.size === 0) { completed = true; break; }
      }
      assert.ok(completed, "all actual canonical data and shared reader queues drain within the bounded fixture window");
      // Let the existing rotating checks observe completion for EVERY declared viewer.
      const settledAt = now + profile.checkEvery + 2;
      while (now < settledAt) step(now + 1);
      const states = f.roster.map(p => f.api.labPlans.get(p.id));
      assert.ok(states.every(Boolean));
      assert.ok(states.every(s => Number.isFinite(s.freshUntil) && s.freshUntil > now),
        "completed data must have finite sample-derived expiry, even when same-value renewal did not bump visual versions");
      assert.equal(store.demandVer, 0, "ordinary native fill/refresh is not a data-availability loss");
      const latest = Math.max(...keys.map(key => store.cols.get(key).tick));
      t.diagnostic(JSON.stringify({ kind: "VM logic only, not native CPU", profile: profile.id, viewers: count, phaseStart: start,
        completed: now, operations: f.api.queue.nativeAttempt - before, latestSample: latest,
        freshUntil: Math.min(...states.map(s => s.freshUntil)) }));
      return latest;
    };
    const coldLatest = drain(1);
    assert.ok(f.api.queue.nativeAttempt > 0, "real native-thunk acquisition ran for active viewers");
    // Jump beyond the newest sample so ALL entries are stale, then renew identical underlying terrain.
    const visualBeforeRenewal = store.ver;
    const refreshedLatest = drain(coldLatest + 2401);
    assert.equal(store.ver, visualBeforeRenewal, "equal-value TTL renewal must not depend on invented visual invalidation");
    drain(refreshedLatest + 2401);
    assert.equal(store.ver, visualBeforeRenewal);
    assert.deepEqual(f.warnings.filter(warning => !warning.includes("[map-lab]") && !warning.startsWith("[map] Oak terrain with marked display estimates")), []);
  });
}
