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
