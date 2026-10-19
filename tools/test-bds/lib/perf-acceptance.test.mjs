import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { evaluateLegacyLog, evaluatePerf, evaluatePerfBudgets, WORKLOAD_SCHEMA } from "./perf-acceptance.mjs";
import { Profile } from "./profile-report.mjs";

const soakFile = path.join(import.meta.dirname, "..", "examples", "perf-soak.js");
const soak = (await import(pathToFileURL(soakFile).href)).default;

/** A stand-in for the harness's `t`: instant time, simulated players that can fail to spawn or drop out. */
function fakeHarness({ players, seconds, failSpawn = () => false, dropAt = () => Infinity, group = 5 }) {
  let tick = 0;
  const reports = [], checks = [], logs = [];
  let spawnedIndex = 0;
  const dim = { runCommand: () => ({ successCount: 1 }), getBlock: () => ({}) };
  const t = {
    args: { players: String(players), seconds: String(seconds), group: String(group), water: "2", nether: "2", commands: "0" },
    packs: [],
    get tick() { return tick; },
    world: { getDimension: () => dim, getDefaultSpawnLocation: () => ({ x: 163, y: 70, z: 170 }) },
    server: () => ({ ok: true }),
    cmd: () => ({ ok: true }),
    log: (...a) => logs.push(a.join(" ")),
    report: (name, data) => reports.push({ name, data: JSON.parse(JSON.stringify(data)) }),
    wait: async (n) => { tick += n; },
    waitUntil: async (fn) => fn(),
    loadArea: async () => ({ top: { location: { y: 64 } } }),
    async player(name, o) {
      if (failSpawn(name)) throw new Error(`chunk at ${o.x},${o.z} did not load in 400 ticks`);
      const index = ++spawnedIndex;
      return {
        location: { x: o.x ?? 0, y: o.y ?? 64, z: o.z ?? 0 },
        get isValid() { return tick < dropAt(index); },
        moveToLocation() {}, lookAtLocation() {}, jump() {}, stopMoving() {}, isSneaking: false,
      };
    },
    assert(cond, msg) { if (!cond) throw new Error(`assert: ${msg}`); },
    check(cond, msg) { checks.push({ cond: !!cond, msg }); return !!cond; },
  };
  return { t, reports, checks, logs, now: () => tick };
}

const profileFor = (h, extra = {}) => ({ ticks: h.now(), packs: [{ pack: "x_bp", startTick: 0, endTick: h.now() }], ...extra });

test("a soak that spawns every declared player and keeps them reports a complete workload", async () => {
  const h = fakeHarness({ players: 12, seconds: 10 });
  await soak(h.t);
  assert.ok(h.checks.every((c) => c.cond), JSON.stringify(h.checks.filter((c) => !c.cond)));
  const w = h.reports.at(-1).data;
  assert.equal(w.schema, WORKLOAD_SCHEMA);
  assert.equal(w.spawned, 12);
  assert.deepEqual([w.kinds.water, w.kinds.nether, w.kinds.land], [2, 2, 8]);
  assert.equal(w.retention.minValid, 12);
  assert.equal(w.soak.ticks, 200);
  const verdict = evaluatePerf({ args: h.t.args, workload: w, profile: profileFor(h) });
  assert.deepEqual(verdict.reasons, []);
  assert.equal(verdict.ok, true);
});

test("a short spawn (97 of 100 in the first W0 run) fails the soak, whose old made > 0 guard passed it", async () => {
  const h = fakeHarness({ players: 12, seconds: 10, failSpawn: (name) => ["Soak11", "Soak12", "Soak10"].includes(name) });
  await assert.rejects(() => soak(h.t), /all 12 declared players spawned \(9 did\)/);
  assert.equal(h.reports.at(-1).data.spawned, 9, "the partial workload is still reported");
  assert.equal(9 > 0, true, "the old guard (made > 0) accepted any positive count");
  const verdict = evaluatePerf({ args: h.t.args, workload: h.reports.at(-1).data, profile: profileFor(h) });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons[0], /population: spawned 9 of the 12 declared players/);
});

test("a player who leaves mid-soak fails the retention check and the acceptance", async () => {
  const h = fakeHarness({ players: 12, seconds: 10, dropAt: (index) => (index === 5 ? 80 : Infinity) });
  await soak(h.t);
  assert.equal(h.checks.filter((c) => !c.cond).length, 1);
  assert.match(h.checks.find((c) => !c.cond).msg, /stayed in the world.*fewest at any second: 11, at the end: 11/);
  const verdict = evaluatePerf({ args: h.t.args, workload: h.reports.at(-1).data, profile: profileFor(h) });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.some((r) => /retention: only 11 of 12 players/.test(r)), verdict.reasons.join("\n"));
});

test("the acceptance needs the profile to cover the whole soak window", async () => {
  const h = fakeHarness({ players: 12, seconds: 10 });
  await soak(h.t);
  const w = h.reports.at(-1).data;
  const late = evaluatePerf({ args: h.t.args, workload: w, profile: { ticks: 200, packs: [{ pack: "a_bp", startTick: w.soak.startTick + 40, endTick: w.soak.endTick }] } });
  assert.match(late.reasons.join("\n"), /1 pack profile\(s\) started after the soak began \(first: a_bp\)/);
  const early = evaluatePerf({ args: h.t.args, workload: w, profile: { ticks: 200, packs: [{ pack: "a_bp", startTick: 0, endTick: w.soak.endTick - 20 }] } });
  assert.match(early.reasons.join("\n"), /ended before the soak did/);
  const shortSoak = evaluatePerf({ args: { players: "12", seconds: "10" }, workload: { ...w, soak: { ...w.soak, ticks: 150 } }, profile: profileFor(h) });
  assert.match(shortSoak.reasons.join("\n"), /ran 150 game ticks, not the 200 declared/);
  assert.equal(evaluatePerf({ args: {}, workload: undefined, profile: profileFor(h) }).ok, false);
  assert.match(evaluatePerf({ args: { players: "100" }, workload: w, profile: profileFor(h) }).reasons.join("\n"), /--arg players=100 but the soak declared 12/);
});

// Verbatim log lines of the two W0 100-player runs: the first run (97 spawned in a 325 s ramp) and the unchanged-default retry.
const W0_ORIGINAL = [
  "[scenario] spawned 97/100 players in 325 s (2 in water, 2 in the Nether, 20 groups)",
  "[scenario] soak 300 s: 97 players in the world, 9730 walks, 646 commands",
  "[scenario] soak done: 300 s, 97/97 players still in the world, 9730 walks, 646 commands",
].join("\n");
const W0_RETRY = [
  "[scenario] spawned 100/100 players in 126 s (2 in water, 2 in the Nether, 20 groups)",
  "[scenario] soak done: 300 s, 100/100 players still in the world, 9919 walks, 665 commands",
].join("\n");

test("the original W0 100-player observation stays invalid and the unchanged-default retry stays valid", () => {
  const original = evaluateLegacyLog(W0_ORIGINAL, { players: 100, seconds: 300 });
  assert.equal(original.ok, false);
  assert.match(original.reasons.join("\n"), /population: spawned 97 of the 100 declared players/);
  assert.match(original.reasons.join("\n"), /soak itself asked for 100|retention|population/);
  const retry = evaluateLegacyLog(W0_RETRY, { players: 100, seconds: 300 });
  assert.equal(retry.ok, true, retry.reasons.join("\n"));
  assert.match(retry.evidence, /log lines only/);
  assert.equal(evaluateLegacyLog(W0_RETRY, { players: 100, seconds: 600 }).ok, false, "a 300 s soak is not a declared 600 s window");
});

/** A profile JSON as Profile.write makes it, with steady-window figures; `bundle` and `packs` are ms per tick. */
const report = ({ bundle = 1, packs = { rain_bp: 0.05, map_bp: 0.5 }, accepted = true } = {}) => ({
  acceptance: accepted ? { ok: true, reasons: [] } : { ok: false, reasons: ["population: spawned 35 of the 40 declared players"] },
  bundle: { msPerTick: 0.01, steadyWindow: bundle === null ? null : { avg: bundle } },
  packs: Object.entries(packs).map(([pack, v]) => ({ pack, msPerTick: 0.01, steadyMsPerTick: v })),
});
const run = (entries, opts) => evaluatePerfBudgets(new Map(entries.map(([n, r, result = "pass"]) => [n, { result, report: r }])), opts);

test("perf budgets: a valid 40-player run under budget passes", () => {
  const v = run([[40, report({ bundle: 4.999, packs: { rain_bp: 0.15, map_bp: 1 } })]]);
  assert.equal(v.ok, true, [...v.invalid, ...v.over].join("\n"));
});

test("perf budgets: over budget at 40 fails, and the whole bundle fails at exactly 5", () => {
  assert.equal(run([[40, report({ bundle: 5 })]]).over.length, 1);
  assert.match(run([[40, report({ bundle: 5.01 })]]).over[0], /whole bundle @40/);
  const pack = run([[40, report({ packs: { rain_bp: 0.151, map_bp: 1.001 } })]]);
  assert.equal(pack.ok, false);
  assert.equal(pack.over.length, 2);
  assert.match(pack.over.join("\n"), /rain_bp @40.*budget 0\.15/);
  assert.match(pack.over.join("\n"), /map_bp @40.*budget 1\b/);
});

test("perf budgets: a valid 100-player run has no 40-player gate and no 5 ms bundle budget", () => {
  const v = run([[10, report()], [40, report()], [100, report({ bundle: 9, packs: { rain_bp: 0.9, map_bp: 3 } })]]);
  assert.equal(v.ok, true, [...v.invalid, ...v.over].join("\n"));
  assert.equal(v.steady.get(100).bundle, 9);
});

test("perf budgets: missing, null or NaN figures are invalid, never zero", () => {
  for (const bad of [null, NaN, undefined]) {
    const v = run([[40, report({ packs: { rain_bp: bad, map_bp: 0.5 } })]]);
    assert.equal(v.ok, false);
    assert.match(v.invalid.join("\n"), /no steady-window figure for rain_bp/);
    assert.equal(v.over.length, 0);
  }
  const noBundle = run([[40, report({ bundle: null })]]);
  assert.equal(noBundle.ok, false);
  assert.match(noBundle.invalid.join("\n"), /no steady-window bundle figure/);
  const missingPack = run([[10, report()], [40, report({ packs: { rain_bp: 0.05 } })]]);
  assert.match(missingPack.invalid.join("\n"), /40 players: no steady-window figure for map_bp/);
  assert.match(run([[40, report({ packs: { rain_bp: 0.05 } })]], { only: ["rain_bp", "ghost_bp"] }).invalid.join("\n"), /ghost_bp/);
  assert.equal(run([[40, undefined]]).ok, false);
});

test("perf budgets: an invalid population or a failed scenario is INVALID, never over budget", () => {
  const popBad = run([[40, report({ accepted: false, bundle: 50 })]]);
  assert.equal(popBad.ok, false);
  assert.equal(popBad.over.length, 0);
  assert.match(popBad.invalid.join("\n"), /spawned 35 of the 40/);
  const failed = run([[40, report({ bundle: 50 }), "fail"]]);
  assert.equal(failed.ok, false);
  assert.equal(failed.over.length, 0);
  assert.match(failed.invalid.join("\n"), /40 players: the scenario fail/);
  assert.equal(run([]).ok, false, "no counts is not a pass");
});

test("the profile reports each pack's steady-window average from its collected tick arrays, null when incomplete", () => {
  const p = new Profile({ say() {}, everyS: 0, json: "x.json", scenario: "s", args: {} });
  p.tickParts.set("rain_bp", { startTick: 100, n: 1, parts: ["9,9,1,,1,9"] });
  p.tickParts.set("half_bp", { startTick: 100, n: 2, parts: ["1"] });
  assert.equal(p.packWindowAvg("rain_bp", 102, 104), 0.5, "ticks 102 (1) and 103 (none): the ramp's 9s are outside");
  assert.equal(p.packWindowAvg("half_bp", 100, 101), null);
  assert.equal(p.packWindowAvg("nobody_bp", 100, 101), null);
  assert.equal(p.packWindowAvg("rain_bp", 105, 105), null);
});
