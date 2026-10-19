import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/check.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const smoke = workflow.slice(workflow.indexOf("  bds-smoke:"));

test("BDS paths do not use runner context in job-level env before a runner exists", () => {
  const jobEnv = /^ {4}env:\n((?: {6}[^\n]*\n)*)/m.exec(smoke)?.[1] ?? "";
  assert.doesNotMatch(jobEnv, /\$\{\{\s*runner\./, "runner context is unavailable in jobs.<job>.env");
});

test("the allocated runner initializes the same four private paths through GITHUB_ENV", () => {
  for (const [key, suffix] of [
    ["BDS_DIR", "bds"],
    ["BDS_HARNESS_CACHE", "bds-harness-cache"],
    ["BDS_HARNESS_TMP", "bds-harness-tmp"],
    ["BDS_HARNESS_LOGS", "bds-harness-logs"],
  ]) {
    assert.ok(smoke.includes(`echo "${key}=$RUNNER_TEMP/${suffix}"`), `${key} stays inside RUNNER_TEMP`);
  }
  assert.match(smoke, /\}\s*>>\s*"\$GITHUB_ENV"/);
  assert.ok(smoke.indexOf('>> "$GITHUB_ENV"') < smoke.indexOf("node tools/test-bds/setup.mjs"));
  assert.ok(smoke.includes('path: ${{ runner.temp }}/bds'), "step-level runner context remains valid for the cache");
  assert.ok(smoke.includes("Realm Bundle smoke test (one script context)"));
});
