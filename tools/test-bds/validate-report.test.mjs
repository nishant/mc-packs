import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { rssSummary, suiteSummary } from "./validate-report.mjs";

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
