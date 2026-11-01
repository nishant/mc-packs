import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modeOf, outputLines, parseArchive, summaryMarkdown, writeOutputs } from "./ci-release.mjs";

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
