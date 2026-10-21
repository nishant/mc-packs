import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, parseListLine, select, shard } from "./affected.mjs";

test("parseListLine reads --only, every-pack runs, runners and skips", () => {
  assert.deepEqual(parseListLine("afk-tag: run.mjs --quiet --only afk_bp,stats_bp --scenario tools/test-bds/examples/afk-tag.js"), { name: "afk-tag", packs: ["afk_bp", "stats_bp"] });
  assert.deepEqual(parseListLine("smoke: run.mjs --quiet --timeout 300 --scenario tools/test-bds/examples/smoke.js [every pack (default)]"), { name: "smoke", packs: "*" });
  assert.deepEqual(parseListLine("bundle-smoke: run.mjs --quiet --flat --bundle dist/realm_bundle.mcpack --only x_bp --scenario s.js"), { name: "bundle-smoke", packs: "*" });
  assert.deepEqual(parseListLine("stash-recover-worn: node stash-persistence.mjs --scenario tools/test-bds/examples/stash-recover-worn.js"), { name: "stash-recover-worn", packs: ["stash_bp"] });
  assert.deepEqual(parseListLine("odd: node other-runner.mjs"), { name: "odd", packs: "*" });
  assert.equal(parseListLine("maps-x: skipped: needs hook copy (no shell recipe in the header)"), null);
  assert.equal(parseListLine("[suite] noise"), null);
});

test("classify sorts changed files into packs, scenarios, hooks and harness", () => {
  const c = classify(["packs/map_bp/scripts/main.js", "tools/test-bds/examples/map.js", "tools/test-bds/hooks/stash-loads.mjs", "docs/PACKS.md", "tools/test-bds/lib/x.test.mjs"]);
  assert.deepEqual([...c.packs], ["map_bp"]);
  assert.deepEqual([...c.scenarios], ["map"]);
  assert.deepEqual([...c.hooks], ["stash-loads.mjs"]);
  assert.equal(c.harness, false);
  assert.equal(classify(["tools/test-bds/lib/shim.js"]).harness, true);
  assert.equal(classify(["package-lock.json"]).harness, true);
  assert.equal(classify(["tools/test-bds/lib/shim.test.mjs"]).harness, false, "a unit test is not the harness");
});

const plans = [
  { name: "smoke", packs: /** @type {"*"} */ ("*") },
  { name: "map", packs: ["map_bp"] },
  { name: "stash-loads", packs: ["stash_bp"], hooks: ["stash-loads.mjs"] },
  { name: "afk-tag", packs: ["afk_bp", "stats_bp"] },
];

test("select picks by pack, scenario file, hook; every-pack scenarios only for a pack change", () => {
  assert.deepEqual(select(plans, classify(["packs/stats_bp/scripts/main.js"])).scenarios, ["smoke", "afk-tag"]);
  assert.deepEqual(select(plans, classify(["tools/test-bds/examples/map.js"])).scenarios, ["map"]);
  assert.deepEqual(select(plans, classify(["tools/test-bds/hooks/stash-loads.mjs"])).scenarios, ["stash-loads"]);
  assert.deepEqual(select(plans, classify(["docs/NEWS.md", "README.md"])).scenarios, []);
  assert.deepEqual(select(plans, classify(["tools/test-bds/run.mjs"])).scenarios, plans.map((p) => p.name));
  assert.deepEqual(select(plans, classify([]), { all: true }).scenarios, plans.map((p) => p.name));
});

test("shard balances seconds, sizes the shard count to the work, and builds anchored filters", () => {
  assert.deepEqual(shard([]), []);
  assert.equal(shard(["a", "b", "c"], { shards: 4, perShard: 8 }).length, 1, "few scenarios: one runner");
  assert.equal(shard(Array.from({ length: 40 }, (_, i) => `s${i}`), { shards: 4, perShard: 8 }).length, 4, "capped at --shards");
  const times = new Map([["long", 600], ["a", 100], ["b", 100], ["c", 100], ["d", 100], ["e", 100], ["f", 100]]);
  const s = shard([...times.keys()], { shards: 2, perShard: 1, times });
  assert.deepEqual(s.map((x) => x.seconds), [600, 600]);
  assert.deepEqual(s[0].scenarios, ["long"]);
  assert.equal(s[1].filter, "^(a|b|c|d|e|f)$");
  assert.ok(new RegExp(shard(["x.y"])[0].filter).test("x.y") && !new RegExp(shard(["x.y"])[0].filter).test("xzy"), "names are escaped");
  const all = shard(Array.from({ length: 30 }, (_, i) => `s${i}`), { shards: 3, perShard: 5 }).flatMap((x) => x.scenarios);
  assert.equal(new Set(all).size, 30, "every scenario lands in exactly one shard");
});

test("incremental reruns what didn't pass and what changed since, and carries the rest", async () => {
  const { incremental } = await import("./affected.mjs");
  const r = incremental(["a", "b", "c", "d"], new Set(["a", "b", "c"]), new Set(["b"]));
  assert.deepEqual(r.run, ["b", "d"], "b changed since, d never passed");
  assert.deepEqual(r.carried, ["a", "c"]);
  assert.deepEqual(incremental(["a"], new Set(), new Set()).run, ["a"], "no previous run: everything");
});

test("readPassed reads pass and flaky results and carried lists, and ignores the rest", async () => {
  const { readPassed } = await import("./affected.mjs");
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "affected-prev-"));
  fs.mkdirSync(path.join(dir, "scenarios-1"));
  fs.writeFileSync(path.join(dir, "scenarios-1", "suite.json"), JSON.stringify({ results: [{ name: "a", result: "pass" }, { name: "b", result: "flaky" }, { name: "c", result: "fail" }, { name: "d", result: "timeout" }, null] }));
  fs.mkdirSync(path.join(dir, "scenarios-carried"));
  fs.writeFileSync(path.join(dir, "scenarios-carried", "carried.json"), JSON.stringify(["e", 7]));
  fs.mkdirSync(path.join(dir, "scenarios-2")); // a shard that wrote nothing
  assert.deepEqual([...readPassed(dir)].sort(), ["a", "b", "e"]);
  assert.equal(readPassed(path.join(dir, "missing")).size, 0);
});
