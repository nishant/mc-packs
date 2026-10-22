// Queue bookkeeping/actual-production VM logic only. No native server or CPU acceptance claim.
import assert from "node:assert/strict";
import test from "node:test";
import { COL, PREVIEW, TerrainWorld, colKey, spendBudget } from "../packs/map_bp/scripts/terrain.js";
import { SPEED } from "../packs/map_bp/scripts/map-profile.js";
import { fixture } from "./map-movement-fixture.mjs";
const OW = "minecraft:overworld";
const raw = { kind: "stone", y: 64, depth: 0 };
const pick = (x, z = 1, resolution = COL, extra = {}) => ({ wx: x, wz: z, resolution, key: colKey(x, z, resolution), since: 90, queuedAt: 1, ...extra });
const plan = (store, picks, id = "p") => ({ id, store, picks, pos: 0, at: 90 });
const metrics = () => ({ completeSkips: 0, coolingSkips: 0 });

test("cooling observer receives exact plan/pick/stamp once without consuming a native credit", () => {
  const world = new TerrainWorld(), store = world.store(OW), cooled = pick(1), ready = pick(3);
  store.miss.set(cooled.key, 90);
  const p = plan(store, [cooled, ready]), cost = metrics(), events = [];
  const spent = spendBudget([p], 1, 1, 0, 93, (current, ticket) => {
    events.push(["read", current, ticket]); world.put(store, ticket.wx, ticket.wz, raw, 93, COL);
  }, cost, undefined, undefined, undefined, (current, ticket, missedAt) => events.push(["cool", current, ticket, missedAt]));
  assert.equal(events.length, 2); assert.equal(events[0][0], "cool"); assert.equal(events[1][0], "read");
  assert.equal(events[0][1], p); assert.equal(events[0][2], cooled); assert.equal(events[0][3], 90);
  assert.equal(events[1][2], ready); assert.equal(p.pos, 2);
  assert.deepEqual([...spent], [["p", 1]]); assert.deepEqual(cost, { completeSkips: 0, coolingSkips: 1 });
});

test("no cooling notification for out-of-range, complete, prepare-known or prepare-deferred work", () => {
  const world = new TerrainWorld(), store = world.store(OW);
  const outside = pick(1), complete = pick(3), known = pick(5), deferred = pick(7);
  store.miss.set(outside.key, 90); world.put(store, complete.wx, complete.wz, raw, 93, COL); store.miss.set(complete.key, 90);
  const p = plan(store, [outside, complete, known, deferred]), cost = metrics(), notifications = [];
  const spent = spendBudget([p], 4, 4, 0, 93, () => assert.fail("no native read expected"), cost,
    (_p, ticket) => ticket !== outside, undefined,
    (_p, ticket) => ticket === known ? "known" : "defer",
    (...args) => notifications.push(args));
  assert.deepEqual(notifications, []); assert.equal(p.pos, 3); assert.equal(spent.size, 0);
  assert.deepEqual(cost, { completeSkips: 1, coolingSkips: 0 });
});

test("misses older than request-since or at exact5tick expiry are actual reads, never cooling notifications", () => {
  for (const [missedAt, now] of [[89, 93], [90, 95]]) {
    const world = new TerrainWorld(), store = world.store(OW), ticket = pick(1), p = plan(store, [ticket]);
    store.miss.set(ticket.key, missedAt); let reads = 0, notifications = 0;
    const cost = metrics();
    const spent = spendBudget([p], 1, 1, 0, now, () => { reads++; return false; }, cost,
      undefined, undefined, undefined, () => notifications++);
    assert.equal(reads, 1); assert.equal(notifications, 0); assert.equal(p.pos, 0, "an actual continuation still owns its ticket");
    assert.deepEqual([...spent], [["p", 1]]); assert.deepEqual(cost, { completeSkips: 0, coolingSkips: 0 });
  }
});

test("optional observer preserves native dispatch order, queue positions, operation ledger and existing metrics", () => {
  function run(observe) {
    const world = new TerrainWorld(), store = world.store(OW);
    const a = plan(store, [pick(1), pick(3), pick(5)], "a"), b = plan(store, [pick(1), pick(7), pick(9)], "b");
    store.miss.set(a.picks[0].key, 90); store.miss.set(b.picks[2].key, 92); world.put(store, 5, 1, raw, 93, COL);
    const cost = metrics(), dispatched = [], observed = [];
    const observer = observe ? (p, ticket, stamp) => observed.push([p.id, ticket.key, stamp]) : undefined;
    const spent = spendBudget([a, b], 3, 2, 1, 93, (p, ticket) => dispatched.push([p.id, ticket.key]), cost,
      undefined, undefined, undefined, observer);
    return { dispatched, spent: [...spent], positions: [a.pos, b.pos], cost, observed };
  }
  const baseline = run(false), withObserver = run(true);
  assert.deepEqual(withObserver.dispatched, baseline.dispatched); assert.deepEqual(withObserver.spent, baseline.spent);
  assert.deepEqual(withObserver.positions, baseline.positions); assert.deepEqual(withObserver.cost, baseline.cost);
  assert.equal(withObserver.observed.length, 3); assert.equal(baseline.observed.length, 0);
});

test("observer uses the overridden Store and correct canonical or preview miss map", () => {
  for (const resolution of [COL, PREVIEW]) {
    const world = new TerrainWorld(), defaultStore = world.store(OW), actualStore = world.store("minecraft:the_end");
    const ticket = pick(3, 3, resolution, { store: actualStore }), p = plan(defaultStore, [ticket]);
    (resolution === PREVIEW ? defaultStore.previewMiss : defaultStore.miss).set(ticket.key, 90);
    (resolution === PREVIEW ? actualStore.previewMiss : actualStore.miss).set(ticket.key, 92);
    const observed = [], cost = metrics();
    const spent = spendBudget([p], 1, 1, 0, 94, () => assert.fail("cooling is not a native read"), cost,
      undefined, undefined, undefined, (current, currentPick, stamp) => observed.push([current, currentPick, stamp]));
    assert.equal(observed.length, 1); assert.equal(observed[0][0], p); assert.equal(observed[0][1], ticket); assert.equal(observed[0][2], 92);
    assert.equal(p.pos, 1); assert.equal(spent.size, 0); assert.equal(cost.coolingSkips, 1);
  }
});

test("actual two-viewer shared failure retries at5 for a moving consumer after provider exit, preserving original age", () => {
  const f = fixture(2, { profile: SPEED }); f.emit("worldLoad");
  // The one-time radar OFF migration runs at worldLoad; turn each viewer's radar explicitly ON again.
  for (const p of f.roster) f.context.setFor(p, "radar", true);
  const [provider, consumer] = f.roster;
  const providerPlan = f.api.planFor(provider, 1), consumerPlan = f.api.planFor(consumer, 1);
  const target = providerPlan.picks[0], consumerTarget = consumerPlan.picks[0];
  assert.equal(target.key, consumerTarget.key); assert.equal(consumerTarget.queuedAt, 1);
  const failureTicks = [];
  f.failWhen((at, tick) => {
    if (Math.floor(at.x) !== target.wx || Math.floor(at.z) !== target.wz) return false;
    failureTicks.push(tick); return true;
  });
  f.scan(2);
  const historyKey = providerPlan.store.id + "|" + target.key;
  assert.deepEqual(failureTicks, [2]); assert.ok(providerPlan.failed?.has(historyKey), "real native-thunk failure belongs to provider");
  assert.ok(f.api.queue.coolingSkips > 0, "the other viewer actually consumed shared miss cooldown");
  const consumerDeadline = f.api.labPlans.get(consumer.id).retryDeadline;
  const consumerRetry = f.api.retryAt.get(consumer.id);
  const consumerAge = f.api.scanPlans.get(consumer.id).failed?.get(historyKey)?.queuedAt;
  f.leave(provider);
  assert.equal(f.api.scanPlans.has(provider.id), false);
  for (let tick = 3; tick < 7; tick++) {
    consumer.state.at = { ...consumer.state.at, x: consumer.state.at.x + 0.25 };
    f.scan(tick);
    assert.deepEqual(failureTicks, [2], "no retry before exact shared cooldown expiry");
    const live = f.api.scanPlans.get(consumer.id); assert.ok(live.pos < live.picks.length, "consumer still has a genuinely long partial moving tail");
  }
  consumer.state.at = { ...consumer.state.at, x: consumer.state.at.x + 0.25 }; f.scan(7);
  assert.deepEqual(failureTicks, [2, 7], "remaining moving consumer retries even though provider is gone");
  assert.equal(consumerDeadline, 7, "consumer must own the same exact deadline despite no actual failure");
  assert.equal(consumerRetry, 7); assert.equal(consumerAge, 1);
  const renewed = f.api.scanPlans.get(consumer.id).failed?.get(historyKey);
  assert.equal(renewed?.queuedAt, 1, "shared cooling cannot rejuvenate the original request age");
  assert.equal(f.api.retryAt.get(consumer.id), 12);
  assert.equal(providerPlan.store.demandVer, 0, "missing-column failure is not an available-data loss workaround");
});
