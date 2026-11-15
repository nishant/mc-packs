import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, markdown, sideOf } from "./perf-compare.mjs";

/** A suite --perf --json report with one count. */
const report = (/** @type {number} */ bundle, /** @type {Record<string, number>} */ packs, ok = true, count = "10") => ({
  perf: { [count]: { acceptance: { ok }, bundle: { steadyWindow: { avg: bundle } }, server: { tps: 19.5 }, packs: Object.fromEntries(Object.entries(packs).map(([k, v]) => [k, { whole: v, steady: v }])) } },
});

test("sideOf takes the lowest figure over accepted runs and ignores rejected ones", () => {
  const s = sideOf([report(6, { map_bp: 3 }), report(5.5, { map_bp: 3.2 }), report(1, { map_bp: 0.1 }, false)], "10");
  assert.equal(s.valid, true);
  assert.equal(s.bundle, 5.5);
  assert.equal(s.packs.get("map_bp"), 3);
  assert.equal(sideOf([report(1, {}, false)], "10").valid, false);
  assert.equal(sideOf([report(1, {})], "40").valid, false, "a count the report lacks is not valid");
});

test("compare needs both the relative and the absolute bar for a regression", () => {
  const base = sideOf([report(6, { map_bp: 3, cheap_bp: 0.02 })], "10");
  assert.equal(compare(base, sideOf([report(6.4, { map_bp: 3, cheap_bp: 0.02 })], "10")).status, "ok", "+0.4 ms is under the 0.5 ms bar");
  assert.equal(compare(base, sideOf([report(7.2, { map_bp: 3, cheap_bp: 0.02 })], "10")).status, "regression", "+20% and +1.2 ms");
  assert.equal(compare(base, sideOf([report(6, { map_bp: 3, cheap_bp: 0.08 })], "10")).status, "ok", "cheap pack x4 but +0.06 ms is noise");
  const r = compare(base, sideOf([report(6, { map_bp: 4.6, cheap_bp: 0.02 })], "10"));
  assert.equal(r.status, "regression");
  assert.match(r.regressions[0], /^map_bp 3\.000 -> 4\.600/);
  assert.equal(compare(base, sideOf([report(6, { map_bp: 3, new_bp: 0.3 })], "10")).regressions[0], "new_bp 0.000 -> 0.300 ms/tick (new), bar 0.100");
});

test("an invalid side is never a pass or a regression", () => {
  const base = sideOf([report(6, {})], "10");
  const r = compare(base, sideOf([report(6, {}, false)], "10"));
  assert.equal(r.status, "invalid");
  assert.match(markdown("10", base, sideOf([], "10"), r), /INVALID/);
});

test("a pack the head lists without a figure is invalid, not 0 ms; a pack new on head is compared as before", () => {
  const base = sideOf([report(6, { map_bp: 3, cheap_bp: 0.02 })], "10");
  const gap = report(6, { cheap_bp: 0.02 });
  gap.perf["10"].packs.map_bp = { whole: 3 }; // listed, but no steady figure
  const head = sideOf([gap], "10");
  assert.deepEqual([...head.incomplete], ["map_bp"]);
  const r = compare(base, head);
  assert.equal(r.status, "invalid");
  assert.match(r.reason, /missing per-pack figure for map_bp/);
  assert.match(markdown("10", base, head, r), /INVALID[\s\S]*missing per-pack figure for map_bp/);
  // The gap on the base side counts too.
  assert.equal(compare(head, base).status, "invalid");
  // A pack absent from the head entirely (removed) or new on it keeps today's behavior.
  assert.equal(compare(base, sideOf([report(6, { cheap_bp: 0.02 })], "10")).status, "ok");
  assert.equal(compare(base, sideOf([report(6, { map_bp: 3, cheap_bp: 0.02, new_bp: 0.3 })], "10")).regressions[0], "new_bp 0.000 -> 0.300 ms/tick (new), bar 0.100");
});

/** A report whose steady window has `ticks` ticks (the per-pack bar is then scaled to the clock noise). */
const timed = (/** @type {number} */ bundle, /** @type {Record<string, number>} */ packs, ticks = 6000) => {
  const r = report(bundle, packs);
  r.perf["10"].bundle.steadyWindow.ticks = ticks;
  return r;
};

test("the per-pack bar follows the clock noise: 0.03 ms for a cheap pack over 300 s, more for a heavy one or a short window (PIPE-07 (4))", async () => {
  const { packBar } = await import("./perf-compare.mjs");
  assert.equal(packBar(0.05, 6000), 0.03);
  assert.ok(Math.abs(packBar(1, 6000) - 3 * Math.sqrt(6000) / 6000) < 1e-12);
  assert.ok(packBar(1, 1200) > packBar(1, 6000));
  assert.equal(packBar(1, null), 0.1, "unknown window: the old flat bar");
  // The creep the flat 0.1 ms bar let through: 0.05 -> 0.14 ms/tick (+180%, +0.09 ms) is a regression now.
  const r = compare(sideOf([timed(2, { a_bp: 0.05 })], "10"), sideOf([timed(2, { a_bp: 0.14 })], "10"));
  assert.equal(r.status, "regression");
  assert.match(r.regressions[0], /^a_bp 0\.050 -> 0\.140/);
  // Under the relative bar it is still noise however many ms.
  assert.equal(compare(sideOf([timed(2, { a_bp: 1 })], "10"), sideOf([timed(2, { a_bp: 1.2 })], "10")).status, "ok");
  // A flat --pack-abs overrides the scaled bar.
  assert.equal(compare(sideOf([timed(2, { a_bp: 0.05 })], "10"), sideOf([timed(2, { a_bp: 0.14 })], "10"), { packAbs: 0.1 }).status, "ok");
});

test("base, head, head, base: a change counts only when the lows and the means both cross the bars (PIPE-07 (1))", () => {
  // One slow head run out of two: the low is unchanged, the mean moves: not a regression.
  const base = sideOf([report(2, {}), report(2.05, {})], "10");
  const once = sideOf([report(2, {}), report(4, {})], "10");
  const r = compare(base, once);
  assert.equal(r.status, "ok");
  assert.equal(r.rows[0].headMean, 3);
  // Slower in both runs: both cross.
  assert.equal(compare(base, sideOf([report(2.8, {}), report(2.9, {})], "10")).status, "regression");
  // One fast head run hides a slow mean only when the low stays under the bar too.
  assert.equal(compare(base, sideOf([report(2.1, {}), report(9, {})], "10")).status, "ok");
  assert.match(markdown("10", base, once, r), /base mean \| head mean/);
});

test("a head whose soak scenario failed is red whatever its figures; a failed base is only noted", () => {
  const failed = report(2, {});
  /** @type {any} */ (failed).runs = { 10: { result: "fail", code: 2, failure: "[scenario] map_bp: TypeError" } };
  const ok = report(2, {});
  const r = compare(sideOf([ok], "10"), sideOf([failed], "10"));
  assert.equal(r.status, "failed");
  assert.match(r.reason, /fail \(exit 2\): \[scenario\] map_bp: TypeError/);
  assert.match(markdown("10", sideOf([ok], "10"), sideOf([failed], "10"), r), /FAILED/);
  const back = compare(sideOf([failed], "10"), sideOf([ok], "10"));
  assert.equal(back.status, "ok");
  assert.match(markdown("10", sideOf([failed], "10"), sideOf([ok], "10"), back), /The base's soak scenario failed too/);
});

test("the one-context bundle is compared per pack by scripts/<pack>/ path", () => {
  const bundled = (/** @type {number} */ map) => ({
    perf: { 10: { acceptance: { ok: true }, bundle: { steadyWindow: { avg: 2, ticks: 6000 }, perTick: { ticks: 9000 }, byPath: [{ pack: "map_bp", msPerTick: map }, { pack: "(other)", msPerTick: 0.01 }] }, packs: { realm_bundle: { whole: 2, steady: 2 } } } },
  });
  const s = sideOf([bundled(0.5)], "10");
  assert.equal(s.byPath, true);
  assert.equal(s.ticks, 9000);
  assert.deepEqual([...s.packs.keys()].sort(), ["(other)", "map_bp"]);
  assert.equal(compare(s, sideOf([bundled(0.9)], "10")).status, "regression");
});

test("spreadOf keeps an A/A comparison's noise and spreadLine prints it", async () => {
  const { spreadOf, spreadLine } = await import("./perf-compare.mjs");
  const r = compare(sideOf([report(2, { a_bp: 0.1 })], "10"), sideOf([report(2.1, { a_bp: 0.12 })], "10"));
  const s = spreadOf(r);
  assert.ok(s);
  assert.ok(Math.abs(s.bundlePct - 5) < 1e-9);
  assert.ok(Math.abs(s.packMaxMs - 0.02) < 1e-9);
  assert.match(spreadLine({ date: "2026-11-15T00:00:00Z", spread: s }), /A\/A spread \(identical trees, 2026-11-15\): whole bundle \+5% by lows/);
  assert.match(spreadLine(null), /none yet/);
  assert.equal(spreadOf({ status: "invalid", rows: [], regressions: [], reason: "" }), null);
});
