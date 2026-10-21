import assert from "node:assert/strict";
import { test } from "node:test";
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
