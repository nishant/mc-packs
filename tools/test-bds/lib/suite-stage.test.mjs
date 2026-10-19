import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const harnessDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.resolve(harnessDir, "..", "..");

// The 13 recipes that failed on the first Windows run (hook paths) plus the other recipe scenarios.
const WINDOWS_FAILURES = [
  "admin-diag-bundle", "claims-bundle-taps", "elytra-jukebox-claims", "harness-event-limit", "maps-cleanup", "maps-leave", "rain-roof",
  "rain-seabed", "rainbow-race", "rook-map-race", "saga-world-events", "storm-rod-claims", "title-hold",
];

test("the suite stages every header recipe in a folder with spaces and an apostrophe, without starting BDS", (t) => {
  const cache = path.join(harnessDir, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(cache, "suite stage's "));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const json = path.join(fixture, "prepare.json");
  const before = new Set(fs.readdirSync(root));
  const r = spawnSync(process.execPath, [path.join(harnessDir, "suite.mjs"), "--prepare-only", "--json", json], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, BDS_HARNESS_TMP: fixture },
  });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const results = new Map(JSON.parse(fs.readFileSync(json, "utf8")).results.map((x) => [x.name, x]));
  for (const name of [...WINDOWS_FAILURES, "saga-graveyard-softlock", "saga-starfall-depleted", "stash-sneak-sort", "stats-ticker-personal"]) {
    assert.equal(results.get(name)?.status, "staged", `${name}: ${results.get(name)?.detail}`);
  }
  assert.deepEqual([...results.values()].filter((x) => x.status === "fail" || x.status === "skipped"), []);
  // A recipe that mangled its path used to leave stray folders in the repo root.
  assert.deepEqual(fs.readdirSync(root).filter((n) => !before.has(n)), []);
  assert.deepEqual(fs.readdirSync(fixture).filter((n) => n.startsWith("bds-suite-hooks-")), [], "the staged copies are removed afterwards");
});
