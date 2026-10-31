import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArchive, summaryMarkdown } from "./ci-release.mjs";

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

test("parseArchive adds up the archived counts of archive-packs' per-pack lines", () => {
  const out = ["afk-smart-sleep  uploaded 0, archived 3, kept 5", "realm-bundle  uploaded 2, archived 4, kept 5", "creeper-guard  uploaded 0, archived 0, kept 5", "total: archived 7, 312.5 MB freed"].join("\n");
  assert.equal(parseArchive(out), 7);
  assert.equal(parseArchive(""), 0);
});
