import assert from "node:assert/strict";
import { test } from "node:test";
import { asReport, runArgs } from "./scenario-soak.mjs";

test("runArgs keeps the plan, drops its profiler and scenario, appends the extras, then the profiler", () => {
  const line = "gear-perf: run.mjs --quiet --no-relay --profile --profile-every 0 --only silly_bp,admin_bp --arg players=6 --arg seconds=60 --timeout 400 --scenario tools/test-bds/examples/gear-perf.js [short gear soak (6 players, 60 s)]";
  assert.deepEqual(runArgs(line, ["--arg", "players=40"], "/t/p.json", "/r/x.js"), [
    "--quiet", "--no-relay", "--only", "silly_bp,admin_bp", "--arg", "players=6", "--arg", "seconds=60", "--timeout", "400",
    "--arg", "players=40", "--profile", "--profile-every", "0", "--profile-json", "/t/p.json", "--scenario", "/r/x.js",
  ]);
});

test("runArgs refuses runners, recipes and skips", () => {
  assert.match(String(runArgs("stash-x: node stash-persistence.mjs --scenario s.js", [], "p", "s")), /custom runner/);
  assert.match(String(runArgs("maps-x: run.mjs --packs /tmp/x --only maps_bp --scenario s.js (after header recipe)", [], "p", "s")), /header recipe/);
  assert.match(String(runArgs("maps-y: skipped: needs hook copy", [], "p", "s")), /skips/);
});

test("asReport reads the steady window when there is one, else the whole run", () => {
  const prof = { acceptance: { ok: true }, bundle: { msPerTick: 2, steadyWindow: { avg: 1.5 } }, server: { tps: 20 }, packs: [{ pack: "a_bp", msPerTick: 1, steadyMsPerTick: 0.8 }, { pack: "b_bp", msPerTick: 0.3 }] };
  const r = asReport(prof, "gear-perf", true).perf["gear-perf"];
  assert.equal(r.acceptance.ok, true);
  assert.equal(r.bundle.steadyWindow.avg, 1.5);
  assert.deepEqual(r.packs, { a_bp: { whole: 1, steady: 0.8 }, b_bp: { whole: 0.3, steady: 0.3 } });
  assert.equal(asReport({ ...prof, bundle: { msPerTick: 2 } }, "x", true).perf.x.bundle.steadyWindow.avg, 2);
  assert.equal(asReport(prof, "x", false).perf.x.acceptance.ok, false, "a failed scenario never counts");
  assert.equal(asReport({ ...prof, acceptance: { ok: false } }, "x", true).perf.x.acceptance.ok, false);
  assert.equal(asReport(null, "x", true).perf.x.acceptance.ok, false);
});
