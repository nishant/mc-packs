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
  assert.equal(compare(base, sideOf([report(6, { map_bp: 3, new_bp: 0.3 })], "10")).regressions[0], "new_bp 0.000 -> 0.300 ms/tick (new)");
});

test("an invalid side is never a pass or a regression", () => {
  const base = sideOf([report(6, {})], "10");
  const r = compare(base, sideOf([report(6, {}, false)], "10"));
  assert.equal(r.status, "invalid");
  assert.match(markdown("10", base, sideOf([], "10"), r), /INVALID/);
});
