// Watchdog and slow-tick lines from the BDS log (run.mjs counts them into the profile JSON and the validation report),
// and the watchdog settings every run writes into server.properties (PIPE-09), with max-players from the scenario (PIPE-27).
import assert from "node:assert/strict";
import test from "node:test";
import { isPerfWarning, watchdogKind, watchdogSummary } from "./watchdog.mjs";
import { baseProps, WATCHDOG_PROPS } from "./server.mjs";

test("watchdog lines are classified by kind; other lines are not", () => {
  assert.equal(watchdogKind("[Scripting] [Watchdog] High memory usage detected (120 MB)"), "memory");
  assert.equal(watchdogKind("[Scripting] [Watchdog] Script hang detected in map_bp"), "hang");
  assert.equal(watchdogKind("[Scripting] [Watchdog] Spike of 63 ms in realm_bundle"), "spike");
  assert.equal(watchdogKind("[Scripting] [Watchdog] Slow script: 12 ms over 20 ticks"), "slow");
  assert.equal(watchdogKind("[Scripting] [Watchdog] Slowdown from 'Realm Bundle' (12ms average)"), "slow");
  assert.equal(watchdogKind("[Scripting] [Watchdog] something new"), "other");
  assert.equal(watchdogKind("Can't keep up! Is the server overloaded?"), "slow-tick");
  assert.equal(watchdogKind("[Scripting] [elite] TypeError: x is undefined"), null);
  assert.equal(isPerfWarning("spike"), true);
  assert.equal(isPerfWarning("memory"), false);
});

test("watchdogSummary counts by kind and keeps the first five lines", () => {
  const lines = Array.from({ length: 7 }, (_, i) => ({ phase: "scenario", kind: i < 2 ? "memory" : "spike", text: `line ${i}` }));
  const s = watchdogSummary(lines);
  assert.equal(s.count, 7);
  assert.deepEqual(s.byKind, { memory: 2, spike: 5 });
  assert.equal(s.first.length, 5);
  assert.equal(s.first[0], "[scenario] line 0");
});

test("every run writes the watchdog settings and a max-players that fits the scenario", () => {
  const p = baseProps(19132, {}, { players: 40 });
  for (const [k, v] of Object.entries(WATCHDOG_PROPS)) assert.equal(p[k], v);
  assert.equal(p["script-watchdog-memory-limit"], 250);
  assert.equal(p["max-players"], 40);
  assert.equal(baseProps(19132)["max-players"], 20);
  assert.equal(baseProps(19132, { "script-watchdog-spike-threshold": "50" })["script-watchdog-spike-threshold"], "50", "--prop still wins");
});
