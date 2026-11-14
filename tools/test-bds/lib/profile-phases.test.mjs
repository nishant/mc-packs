// run.mjs --profile: a scenario that reports named phases in its perf-workload (night-soak.js: dusk, early, mid, late,
// dawn) gets each pack's ms/tick average, p95 and max per phase, and the bundle's per phase, in the report and the JSON.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Profile } from "./profile-report.mjs";

test("per-phase figures come from each pack's per-tick data", () => {
  const json = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "phases-")), "p.json");
  const prof = new Profile({ say() {}, everyS: 0, json, scenario: "night-soak.js", args: {} });
  // Ticks 100-109: 0.1 ms each for the first five ticks (dusk), then 0.5, 0.5, 0.5, 0.5, 2 (night).
  const ticks = [0.1, 0.1, 0.1, 0.1, 0.1, 0.5, 0.5, 0.5, 0.5, 2];
  const line = (kind, obj) => assert.equal(prof.onLine(`[Scripting] ${kind} ${JSON.stringify(obj)}`), true);
  line("PROFILE_TICKS", { pack: "elite_bp", startTick: 100, i: 0, n: 1, d: ticks.join(",") });
  line("PROFILE", { pack: "elite_bp", final: true, startTick: 100, endTick: 110, ticks: 10, msPerTick: 0.47, totalMs: 4.7, calls: 10, callsPerTick: 1, p95TickMs: 2, maxTickMs: 2, dynWrites: 0, dynBytes: 0, actionBar: 0, titles: 0, commands: 0, top: [] });
  prof.setWorkload({ schema: 1, declared: { players: 1, seconds: 0 }, spawned: 1, retention: { samples: 1, minValid: 1, endValid: 1 }, soak: { startTick: 100, endTick: 110, ticks: 10 }, phases: [{ name: "dusk", startTick: 100, endTick: 105 }, { name: "mid", startTick: 105, endTick: 110 }] });
  const lines = prof.report();
  assert.ok(lines.some((l) => l.includes("phase mid (5 ticks)")), lines.join("\n"));
  const out = JSON.parse(fs.readFileSync(json, "utf8"));
  const elite = out.packs.find((r) => r.pack === "elite_bp");
  assert.ok(Math.abs(elite.phases.dusk.avg - 0.1) < 1e-9);
  assert.ok(Math.abs(elite.phases.mid.avg - 0.8) < 1e-9);
  assert.equal(elite.phases.mid.max, 2);
  assert.equal(out.bundle.phases.length, 2);
  assert.equal(out.bundle.phases[1].bundle.max, 2);
});

test("tick histograms, the worst ticks with their heavy calls, and per-pack figures of one context (PIPE-01, PIPE-02)", () => {
  const json = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "phases-")), "p.json");
  const prof = new Profile({ say() {}, everyS: 0, json, scenario: "perf-soak.js", args: {} });
  // One context (a bundle) over ticks 100-139: 1 ms a tick, 8 ms on every multiple of 20 (ticks 100 and 120), 6 ms at 105.
  const ticks = Array.from({ length: 40 }, (_, i) => ((100 + i) % 20 === 0 ? 8 : i === 5 ? 6 : 1));
  const callbacks = [
    { key: "runInterval(20) tick @ map_bp/main.js:10", ms: 16, calls: 2, max: 8 },
    { key: "world.after.entityDie @ stats_bp/scripts/main.js:5", ms: 6, calls: 1, max: 6 },
    { key: "run @ main.js:1", ms: 38, calls: 38, max: 1 },
  ];
  const cbText = JSON.stringify(callbacks);
  const heavy = "100:8:0,105:6:1,120:8:0";
  const line = (kind, obj) => assert.equal(prof.onLine(`[Scripting] ${kind} ${JSON.stringify(obj)}`), true);
  line("PROFILE", { pack: "realm_bundle", final: true, startTick: 100, endTick: 140, ticks: 40, msPerTick: 1.5, totalMs: 60, calls: 41, callsPerTick: 1, p95TickMs: 8, maxTickMs: 8, dynWrites: 0, dynBytes: 0, actionBar: 0, titles: 0, commands: 0, top: [], parts: { ticks: 1, callbacks: 2, heavy: 1 } });
  line("PROFILE_TICKS", { pack: "realm_bundle", startTick: 100, i: 0, n: 1, d: ticks.join(",") });
  line("PROFILE_CALLBACKS", { pack: "realm_bundle", startTick: 100, i: 0, n: 2, d: cbText.slice(0, 50) });
  assert.equal(prof.complete(1), false, "a part and the tick meter are still missing");
  line("PROFILE_CALLBACKS", { pack: "realm_bundle", startTick: 100, i: 1, n: 2, d: cbText.slice(50) });
  line("PROFILE_HEAVY", { pack: "realm_bundle", startTick: 100, i: 0, n: 1, d: heavy });
  prof.cpu1 = { cpuMs: 0, at: 0 }; // the final dump was requested
  line("PROFILE_SERVER", { tps: 20, ticksOver50ms: 1, ticksOver55ms: 0, ticksOver100ms: 0 });
  assert.equal(prof.complete(1), true);
  prof.setWatchdog({ count: 2, byKind: { spike: 2 }, first: ["[scenario] [Watchdog] spike"] });
  const lines = prof.report();
  assert.ok(lines.some((l) => l.includes("by scripts/<pack>/ path")), lines.join("\n"));
  assert.ok(lines.some((l) => l.includes("2 spike")), lines.join("\n"));
  const out = JSON.parse(fs.readFileSync(json, "utf8"));
  const whole = out.bundle.perTick;
  assert.equal(whole.histogram.mod20[0], 8);
  assert.equal(whole.histogram.mod20[5], 3.5, "ticks 105 (6 ms) and 125 (1 ms)");
  assert.equal(whole.histogram.mod20[1], 1);
  assert.equal(whole.histogram.mod200.length, 200);
  assert.equal(whole.histogram.over5, 3);
  assert.equal(whole.histogram.over5On20, 2);
  assert.deepEqual(whole.worst.slice(0, 3).map((w) => [w.tick, w.ms]), [[100, 8], [120, 8], [105, 6]]);
  assert.deepEqual(whole.worst[2].calls, [{ pack: "realm_bundle", key: callbacks[1].key, ms: 6 }]);
  assert.deepEqual(out.bundle.byPath.map((p) => [p.pack, p.ms]), [["(other)", 38], ["map_bp", 16], ["stats_bp", 6]]);
  assert.equal(out.watchdog.count, 2);
  assert.equal(out.packs[0].callbackList.length, 3);
});

test("reducedReport keeps process, workload, watchdog and each pack's top, slowest and counters", async () => {
  const { reducedReport } = await import("./profile-report.mjs");
  const r = reducedReport({ acceptance: { ok: true }, bundle: { msPerTick: 1 }, server: { tps: 20 }, process: { cpuMsPerTick: 9 }, workload: { soak: {} }, watchdog: { count: 0 }, packs: [{ pack: "a_bp", msPerTick: 0.2, steadyMsPerTick: 0.1, top: [{ key: "k" }], slowest: [{ key: "s" }], calls: 5, dynWrites: 1, callbackList: [{}] }] });
  assert.equal(r.process.cpuMsPerTick, 9);
  assert.deepEqual(r.workload, { soak: {} });
  assert.equal(r.watchdog.count, 0);
  assert.deepEqual(r.packs.a_bp, { whole: 0.2, steady: 0.1, top: [{ key: "k" }], slowest: [{ key: "s" }], counters: { calls: 5, dynWrites: 1 } });
});
