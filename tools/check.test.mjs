import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { STEPS_FILE, parseSteps, runSteps } from "./check.mjs";

const node = (/** @type {string} */ js) => `node -e "${js}"`;

test("parseSteps reads one command per line, '& ' as parallel, and skips comments and blank lines", () => {
  const steps = parseSteps("# a comment\n& tsc -p .\n\r\nnode a.mjs\n  node b.mjs --check  \n");
  assert.deepEqual(steps, [
    { cmd: "tsc -p .", parallel: true, index: 0 },
    { cmd: "node a.mjs", parallel: false, index: 1 },
    { cmd: "node b.mjs --check", parallel: false, index: 2 },
  ]);
});

test("the real step list runs tsc, check-stories and the unit tests in parallel, and check-versions last", () => {
  const steps = parseSteps(readFileSync(STEPS_FILE, "utf8"));
  assert.deepEqual(steps.filter((s) => s.parallel).map((s) => s.cmd), ["tsc -p .", "node tools/check-stories.mjs", "npm run --silent test"]);
  assert.equal(steps.filter((s) => !s.parallel).at(-1)?.cmd, "node tools/check-versions.mjs");
});

test("runSteps passes with exit code 0 when every step passes", async () => {
  let out = "";
  const r = await runSteps(parseSteps(`& ${node("console.log(1)")}\n${node("console.log(2)")}`), { write: (s) => (out += s) });
  assert.equal(r.code, 0);
  assert.match(out, /every step passed/);
});

test("the ordered lane stops at its first failure; parallel failures are collected and reported in file order", async () => {
  let out = "";
  const steps = parseSteps([`& ${node("console.log('tsc broke'); process.exit(2)")}`, node("console.log('first ok')"), node("console.log('docs broke'); process.exit(3)"), node("console.log('never runs')")].join("\n"));
  const r = await runSteps(steps, { write: (s) => (out += s) });
  assert.equal(r.code, 2, "the first failure in file order sets the exit code");
  assert.deepEqual(r.results.map((x) => x.code), [2, 0, 3, undefined]);
  assert.doesNotMatch(out, /never runs/);
  assert.match(out, /2 steps FAILED \(1 later ordered step not run\)/);
  assert.ok(out.indexOf("--- FAILED: node -e \"console.log('tsc broke')") < out.indexOf("--- FAILED: node -e \"console.log('docs broke')"));
  assert.match(out, /tsc broke[\s\S]*docs broke/);
});
