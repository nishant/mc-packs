import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { missingJobs, profileDetails, rssSummary, suiteSummary } from "./validate-report.mjs";

test("rssSummary reads start, 10 minutes, end, max and growth in MB", () => {
  const lines = Array.from({ length: 121 }, (_, i) => `${1000 + i * 10} ${1024 * (1000 + (i === 50 ? 900 : i))}`).join("\n");
  const s = rssSummary(`${lines}\ngarbage\n123\n`);
  assert.ok(s);
  assert.equal(s.samples, 121);
  assert.equal(s.minutes, 20);
  assert.equal(s.start, 1000);
  assert.equal(s.at10, 1060);
  assert.equal(s.end, 1120);
  assert.equal(s.max, 1900, "a spike counts in max");
  assert.equal(s.growth, 60);
  assert.equal(rssSummary(""), null);
});

test("suiteSummary adds shards up and is red only for fail or timeout", () => {
  const s = suiteSummary([
    { wallSeconds: 300, results: [{ name: "a", result: "pass", seconds: 20 }, { name: "b", result: "flaky", seconds: 40 }] },
    { wallSeconds: 900, results: [{ name: "c", result: "fail", seconds: 70, failure: "chest\n  placed" }, null] },
  ]);
  assert.deepEqual(s.counts, { pass: 1, flaky: 1, fail: 1 });
  assert.equal(s.wall, 900);
  assert.equal(s.red, true);
  assert.deepEqual(s.failures, ["c: fail - chest placed"]);
  assert.equal(s.results.length, 3);
  assert.equal(suiteSummary([{ results: [{ name: "a", result: "flaky", seconds: 1 }] }]).red, false);
});

/**
 * Runs validate-report.mjs on one memory-40 artifact (base always fine) and returns the status it writes.
 * @param {{ exit?: string, rss?: boolean }} o head side; an undefined exit means no head.exit file
 */
function memoryStatus(o) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vr-"));
  try {
    const at = path.join(tmp, "validate-memory-40");
    fs.mkdirSync(at);
    fs.writeFileSync(path.join(at, "name.txt"), "memory-40");
    const rss = Array.from({ length: 121 }, (_, i) => `${1000 + i * 10} ${1024 * 1000}`).join("\n");
    fs.writeFileSync(path.join(at, "base.rss"), rss);
    fs.writeFileSync(path.join(at, "base.exit"), "0\n");
    if (o.rss) fs.writeFileSync(path.join(at, "head.rss"), rss);
    if (o.exit !== undefined) fs.writeFileSync(path.join(at, "head.exit"), `${o.exit}
`);
    const out = path.join(tmp, "out.txt");
    fs.writeFileSync(out, "");
    const script = fileURLToPath(new URL("./validate-report.mjs", import.meta.url));
    execFileSync(process.execPath, [script, "--dir", tmp, "--out", path.join(tmp, "report.md")], { env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: "" }, stdio: "pipe" });
    return /status=(\w+)/.exec(fs.readFileSync(out, "utf8"))?.[1];
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test("a memory side is red when its soak exited non-zero or wrote no exit code, ok when it exited 0", () => {
  assert.equal(memoryStatus({ exit: "1", rss: true }), "red");
  assert.equal(memoryStatus({ rss: true }), "red", "a missing .exit file");
  assert.equal(memoryStatus({ exit: "0", rss: true }), "ok");
});

test("rssSummary judges the bedrock_server sampled longest, not the first one seen (PIPE-26)", () => {
  // pid 7 (the template generator) for 30 s, then pid 9 (the run) for 20 minutes.
  const lines = [
    ...Array.from({ length: 4 }, (_, i) => `${1000 + i * 10} 7 ${1024 * 300}`),
    ...Array.from({ length: 121 }, (_, i) => `${1040 + i * 10} 9 ${1024 * (1000 + i)}`),
  ].join("\n");
  const s = rssSummary(lines);
  assert.ok(s);
  assert.equal(s.samples, 121);
  assert.equal(s.start, 1000);
});

test("missingJobs names the planned jobs that uploaded nothing (PIPE-25)", () => {
  assert.deepEqual(missingJobs(["soak-10", "suite-1", "suite-2"], ["soak-10", "suite-1"]), ["suite-2"]);
  assert.deepEqual(missingJobs([], ["x"]), []);
});

test("a planned suite shard with no artifact counts as a failure in the report", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vr-"));
  try {
    const at = path.join(tmp, "validate-suite-1");
    fs.mkdirSync(at);
    fs.writeFileSync(path.join(at, "name.txt"), "suite-1");
    fs.writeFileSync(path.join(at, "suite.json"), JSON.stringify({ wallSeconds: 60, results: [{ name: "a", result: "pass", seconds: 10 }] }));
    const out = path.join(tmp, "out.txt");
    fs.writeFileSync(out, "");
    const matrix = JSON.stringify({ include: [{ name: "suite-1" }, { name: "suite-2" }] });
    const script = fileURLToPath(new URL("./validate-report.mjs", import.meta.url));
    execFileSync(process.execPath, [script, "--dir", tmp, "--matrix", matrix, "--out", path.join(tmp, "report.md")], { env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: "" }, stdio: "pipe" });
    assert.equal(/status=(\w+)/.exec(fs.readFileSync(out, "utf8"))?.[1], "red");
    const md = fs.readFileSync(path.join(tmp, "report.md"), "utf8");
    assert.match(md, /1 pass, 0 flaky, 1 fail/);
    assert.match(md, /suite-2: fail - the shard uploaded no artifact/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("profileDetails prints CPU, watchdog, the tick histogram, the worst ticks, phases and per-pack rows", () => {
  const mod = (m) => Array.from({ length: m }, (_, i) => (i === 0 ? 4 : 1));
  const histogram = { mod20: mod(20), mod40: mod(40), mod100: mod(100), mod200: mod(200), over5: 10, over5On20: 7, shareOver5On20: 0.7, peak20: 0, over5OnPeak20: 7, shareOver5OnPeak20: 0.7 };
  const worst = [{ tick: 120, ms: 14, calls: [{ pack: "realm_bundle", key: "runInterval(20) tick @ map_bp/main.js:10", ms: 9 }] }];
  const head = {
    process: { cpuMsPerTick: 12.5 }, watchdog: { count: 3, byKind: { spike: 3 }, first: ["[scenario] spike"] },
    server: { ticksOver50ms: 4, ticksOver55ms: 2, ticksOver100ms: 0, tickIntervalP95Ms: 51, tickIntervalP99Ms: 60, tickIntervalMaxMs: 90 },
    bundle: { steadyWindow: { ticks: 6000, histogram, worst }, phases: [{ name: "night", bundle: { ticks: 100, p95: 5, max: 14, worst } }], byPath: [{ pack: "map_bp", msPerTick: 0.9, callsPerTick: 3, max: 9, callbacks: 12 }] },
  };
  const md = profileDetails(head, { process: { cpuMsPerTick: 12 }, watchdog: { count: 0, byKind: {} } }).join("\n");
  assert.match(md, /CPU ms\/tick .*base 12\.000 \/ head 12\.500/);
  assert.match(md, /base 0 \/ head 3 \(3 spike\)/);
  assert.match(md, /4 over 50 ms \(2 over 55\)/);
  assert.match(md, /10 ticks over 5 ms, 7 of them on a multiple of 20 \(70%\), 7 on the busiest residue 0 \(70%\)/);
  assert.match(md, /\| ms \| 4\.00 \| 1\.00/);
  assert.match(md, /`% 200`: 0 4\.00/);
  assert.match(md, /\| 120 \| 14 \| realm_bundle: `runInterval\(20\) tick @ map_bp\/main\.js:10` 9 \|/);
  assert.match(md, /Phase night/);
  assert.match(md, /\| map_bp \| 0\.900 \| 3\.00 \| 9 \| 12 \|/);
  assert.deepEqual(profileDetails(undefined), []);
});

test("flaky scenarios are named with both durations, and the history keeps the last 20 runs (PIPE-16)", async () => {
  const { flakyHistory } = await import("./validate-report.mjs");
  const s = suiteSummary([{ results: [{ name: "town-life", result: "flaky", seconds: 300, failure: "villager\n not placed", retry: { seconds: 280 } }] }]);
  assert.deepEqual(s.flaky, ["town-life: failed in 300 s, passed alone in 280 s - villager not placed"]);
  assert.equal(s.red, false);
  const previous = { flakyRuns: Array.from({ length: 20 }, (_, i) => ({ date: "d", ran: 300, flaky: i % 2 ? ["a"] : ["a", "b"] })) };
  const h = flakyHistory(previous, ["b"], 314);
  assert.equal(h.runs.length, 20);
  assert.deepEqual(h.runs.at(-1).flaky, ["b"]);
  assert.deepEqual(h.top, [{ name: "a", times: 19 }, { name: "b", times: 10 }]);
  assert.deepEqual(flakyHistory(null, [], 10).top, []);
});
