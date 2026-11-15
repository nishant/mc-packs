import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIVE_RETRY_WAITS, liveLine, mergeArgs, mergeGate, modeOf, outputLines, parseArchive, retryLive, summaryMarkdown, writeOutputs } from "./ci-release.mjs";

const base = { rows: [], used: [], changed: false };

test("the summary renders the archive line once, and omits it when there is none", () => {
  const md = summaryMarkdown({ ...base, archive: "12 versions moved to GitHub Releases" });
  assert.equal(md.split("\n").filter((l) => l.startsWith("Archive:")).length, 1);
  assert.match(md, /^Archive: 12 versions moved to GitHub Releases$/m);
  assert.match(summaryMarkdown({ ...base, archive: "skipped (no tools/archive-packs.mjs in hosting)" }), /^Archive: skipped \(no tools\/archive-packs\.mjs in hosting\)$/m);
  assert.doesNotMatch(summaryMarkdown(base), /Archive:/);
});

test("a failure tells the reader to rerun the workflow, not to finish by hand", () => {
  const md = summaryMarkdown({ ...base, failed: { step: "archive-packs --prune", output: "boom" } });
  assert.match(md, /Failed at archive-packs --prune/);
  assert.match(md, /rerun it \(Actions > release > Run workflow\)/);
  assert.doesNotMatch(md, /by hand/);
});

test("parseArchive reads the archived count from archive-packs' total line", () => {
  const out = ["afk-smart-sleep  uploaded 0, archived 3, kept 5", "realm-bundle  uploaded 2, archived 4, kept 5", "creeper-guard  uploaded 0, archived 0, kept 5", "total  uploaded 2, archived 7, kept 15, 3.1 MB freed"].join("\n");
  assert.equal(parseArchive(out), 7);
  assert.equal(parseArchive(""), 0);
});

test("modeOf picks all-in-one, --open-pr or --merge-pr <branch>, and refuses both flags or an empty branch", () => {
  assert.deepEqual(modeOf({}), { mode: "all" });
  assert.deepEqual(modeOf({ "open-pr": true }), { mode: "open-pr" });
  assert.deepEqual(modeOf({ "merge-pr": " release/mc-packs-abc " }), { mode: "merge-pr", branch: "release/mc-packs-abc" });
  assert.match(/** @type {any} */ (modeOf({ "open-pr": true, "merge-pr": "x" })).error, /exclude each other/);
  assert.match(/** @type {any} */ (modeOf({ "merge-pr": "  " })).error, /needs a branch/);
});

test("outputLines writes key=value lines, an empty branch as 'branch=', and keeps one line per value", () => {
  assert.equal(outputLines({ branch: "release/x", pr: "https://github.com/nishant/hosting/pull/9" }), "branch=release/x\npr=https://github.com/nishant/hosting/pull/9\n");
  assert.equal(outputLines({ branch: "" }), "branch=\n");
  assert.equal(outputLines({ branch: "a", pr: undefined }), "branch=a\n");
  assert.equal(outputLines({ pr: "line one\nline two" }), "pr=line one\n");
});

test("writeOutputs appends to the $GITHUB_OUTPUT file, and prints when there is none", () => {
  const dir = mkdtempSync(join(tmpdir(), "ci-release-"));
  try {
    const file = join(dir, "out");
    writeFileSync(file, "earlier=1\n");
    writeOutputs({ branch: "b" }, file);
    assert.equal(readFileSync(file, "utf8"), "earlier=1\nbranch=b\n");
    /** @type {string[]} */
    const printed = [];
    writeOutputs({ branch: "" }, undefined, (x) => printed.push(x));
    assert.deepEqual(printed, ["branch=\n"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the summary says whether the hosting PR is merged or waiting for the merge job", () => {
  assert.match(summaryMarkdown({ ...base, changed: true, pr: "https://x/pull/1" }), /open, not merged: the merge job merges it after the upload job/);
  assert.match(summaryMarkdown({ ...base, changed: true, pr: "https://x/pull/1", merged: true }), /merged: deploying/);
  assert.match(summaryMarkdown({ ...base, fetch: "skipped (no tools/fetch-packs.mjs in hosting)" }), /^fetch-packs: skipped \(no tools\/fetch-packs\.mjs in hosting\)$/m);
});

test("mergeArgs makes a merge commit, pinned to the pushed head when it is known", () => {
  assert.deepEqual(mergeArgs("release/x"), ["pr", "merge", "release/x", "--merge"]);
  assert.deepEqual(mergeArgs("release/x", "abc123"), ["pr", "merge", "release/x", "--merge", "--match-head-commit", "abc123"]);
});

test("mergeGate merges only on CLEAN, waits while checks run, and stops on conflicts or a block", () => {
  assert.equal(mergeGate("CLEAN"), "merge");
  assert.equal(mergeGate("HAS_HOOKS"), "merge");
  for (const s of ["UNSTABLE", "UNKNOWN", ""]) assert.equal(mergeGate(s), "wait", s);
  for (const s of ["DIRTY", "BEHIND", "BLOCKED", "DRAFT"]) assert.equal(mergeGate(s), "stop", s);
});

test("retryLive passes at once without waiting, and retries a failed check-live after 60 s and then 120 s", () => {
  const slept = [];
  const once = retryLive(() => ({ ok: true }), { sleep: (s) => slept.push(s) });
  assert.deepEqual([once.attempts, slept], [1, []]);
  const outcomes = [false, true];
  const second = retryLive((n) => ({ ok: outcomes[n - 1], n }), { sleep: (s) => slept.push(s) });
  assert.deepEqual([second.attempts, second.result.n, slept], [2, 2, [60]]);
  slept.length = 0;
  const calls = [];
  const real = retryLive((n) => (calls.push(n), { ok: false, out: `fail ${n}` }), { sleep: (s) => slept.push(s) });
  assert.deepEqual([real.attempts, real.result.out, calls, slept], [3, "fail 3", [1, 2, 3], LIVE_RETRY_WAITS]);
  assert.deepEqual(LIVE_RETRY_WAITS, [60, 120]);
});

test("the check-live line says which attempt passed, and the summary still reports the site as up to date", () => {
  assert.equal(liveLine(true, 1), "passed");
  assert.equal(liveLine(true, 3), "passed on attempt 3");
  assert.equal(liveLine(false, 3), "FAILED (3 attempts)");
  const md = summaryMarkdown({ ...base, bundle: "2026.1114.1", resources: "2026.1114.1", live: liveLine(true, 2) });
  assert.match(md, /^check-live: passed on attempt 2$/m);
  assert.match(md, /^Site up to date: Realm Bundle 2026\.1114\.1/m);
});
test("both release jobs that need Chromium take it from the cached, time-limited Playwright action (PIPE-12)", () => {
  const wf = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  for (const name of ["release", "merge"]) {
    const start = wf.indexOf(`\n  ${name}:\n`);
    const end = wf.slice(start + 1).search(/\n {2}[a-z]+:\n/);
    const body = end === -1 ? wf.slice(start) : wf.slice(start, start + 1 + end);
    assert.match(body, /uses: \.\/mc-packs\/\.github\/actions\/playwright\n\s+timeout-minutes: 10\n\s+with:\n\s+working-directory: hosting\/minecraft\n/, `${name} job`);
    assert.match(body, /hosting\/minecraft\/package-lock\.json/, `${name} job caches hosting's npm packages too`);
  }
  assert.doesNotMatch(wf, /playwright install --with-deps/);
  const action = readFileSync(new URL("../.github/actions/playwright/action.yml", import.meta.url), "utf8");
  assert.match(action, /path: ~\/\.cache\/ms-playwright\n\s+key: playwright-chromium-\$\{\{ runner\.os \}\}-\$\{\{ steps\.version\.outputs\.version \}\}/);
  assert.match(action, /timeout 240 "\$@" \|\| \{[^}]*timeout 240 "\$@"; \}/, "a 4-minute limit and one retry");
});