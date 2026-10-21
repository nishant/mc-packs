#!/usr/bin/env node
// Which BDS scenarios a change needs, and how to split them over CI runners, so a PR runs the scenarios that touch
// its packs instead of the whole suite (about 86 min at --jobs 2), and the post-release run splits the whole suite.
//   node tools/test-bds/affected.mjs [--base origin/master] [--all] [--shards 4] [--per-shard 8] [--times <suite json>]
//        prints JSON: { reason, packs, scenarios, shards: [{ index, filter, scenarios, seconds }] }
//   node tools/test-bds/affected.mjs ... --shard 2/4      prints only shard 2's --filter regex for suite.mjs
//   node tools/test-bds/affected.mjs ... --packs-changed  prints "true" or "false": did the change touch packs/
//   node tools/test-bds/affected.mjs ... --since <sha> --prev <dir>   a follow-up push: of the scenarios the PR needs,
//        run only those the last run didn't pass (its scenarios-* artifacts in <dir>: suite.json results, carried.json)
//        and those the commits since <sha> touch; the rest are carried as passed (written to "carried" in the JSON).
// A scenario is picked when its own file changed, a hook its header names changed, or the packs it runs (--only, a
// runner's fixed packs) meet the changed packs; scenarios that run every pack (smoke, restart, the bundle ones,
// perf-soak) are picked by any pack change. A harness change (tools/test-bds/lib, testpack, run.mjs, suite.mjs,
// setup.mjs, package.json) picks everything. Shards are balanced on each scenario's seconds from --times (a suite
// --json report), or 60 s each. The scenario list comes from `suite.mjs --list`, so it is the suite's own plan.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const ALL = "*";
/** Custom runners (suite.mjs SPECIAL) and the packs they install. Any other runner counts as every pack. */
const RUNNER_PACKS = { "build-beds.mjs": ["build_bp", "build_rp"], "stash-persistence.mjs": ["stash_bp"] };
const HARNESS = [/^tools\/test-bds\/(lib|testpack)\//, /^tools\/test-bds\/(run|suite|setup)\.mjs$/, /^package(-lock)?\.json$/];
const DEFAULT_SECONDS = 60;

/**
 * One `suite.mjs --list` line as { name, packs } (packs: folder names, or ALL), or null for a skipped scenario.
 * @param {string} line
 * @returns {{ name: string, packs: string[] | typeof ALL } | null}
 */
export function parseListLine(line) {
  const m = /^([\w.-]+): (.*)$/.exec(line.trim());
  if (!m) return null;
  const [, name, rest] = m;
  if (/^skipped\b|^no run command/.test(rest)) return null;
  const runner = /^node (\S+)/.exec(rest);
  if (runner) return { name, packs: RUNNER_PACKS[/** @type {keyof typeof RUNNER_PACKS} */ (path.basename(runner[1]))] ?? ALL };
  const only = /(?:^|\s)--only\s+(\S+)/.exec(rest);
  if (!only || /(?:^|\s)--bundle\s/.test(rest)) return { name, packs: ALL };
  return { name, packs: only[1].split(",").filter(Boolean) };
}

/**
 * What a list of changed paths means for the scenarios.
 * @param {string[]} files repo-relative, forward slashes
 */
export function classify(files) {
  const packs = new Set(), scenarios = new Set(), hooks = new Set();
  let harness = false;
  for (const f of files) {
    if (f.endsWith(".test.mjs")) continue;
    const pack = /^packs\/([^/]+)\//.exec(f);
    if (pack) packs.add(pack[1]);
    const ex = /^tools\/test-bds\/examples\/([^/]+)\.js$/.exec(f);
    if (ex) scenarios.add(ex[1]);
    const hook = /^tools\/test-bds\/hooks\/([^/]+)$/.exec(f);
    if (hook) hooks.add(hook[1]);
    if (HARNESS.some((r) => r.test(f))) harness = true;
  }
  return { packs, scenarios, hooks, harness };
}

/**
 * The scenarios a change needs, in suite order.
 * @param {{ name: string, packs: string[] | typeof ALL, hooks?: string[] }[]} plans
 * @param {ReturnType<typeof classify>} change
 * @param {{ all?: boolean }} [opts]
 */
export function select(plans, change, { all = false } = {}) {
  if (all || change.harness) return { reason: all ? "every scenario (--all)" : "the harness changed: every scenario", scenarios: plans.map((p) => p.name) };
  const picked = plans.filter((p) =>
    change.scenarios.has(p.name) ||
    (p.hooks ?? []).some((h) => change.hooks.has(h)) ||
    (change.packs.size > 0 && (p.packs === ALL || p.packs.some((x) => change.packs.has(x)))));
  const why = [change.packs.size ? `${change.packs.size} changed pack(s)` : "", change.scenarios.size ? `${change.scenarios.size} changed scenario(s)` : "", change.hooks.size ? `${change.hooks.size} changed hook(s)` : ""].filter(Boolean).join(", ");
  return { reason: why || "no pack, scenario, hook or harness change", scenarios: picked.map((p) => p.name) };
}

/**
 * Splits scenarios into at most `shards` groups of similar total seconds (longest first onto the lightest shard).
 * The shard count is the smallest that keeps about `perShard` scenarios each, capped at `shards`.
 * @param {string[]} names
 * @param {{ shards?: number, perShard?: number, times?: Map<string, number> }} [opts]
 */
export function shard(names, { shards = 4, perShard = 8, times = new Map() } = {}) {
  if (!names.length) return [];
  const n = Math.max(1, Math.min(shards, Math.ceil(names.length / Math.max(1, perShard))));
  const sec = (/** @type {string} */ x) => times.get(x) ?? DEFAULT_SECONDS;
  const groups = Array.from({ length: n }, (_, i) => ({ index: i + 1, scenarios: /** @type {string[]} */ ([]), seconds: 0 }));
  for (const name of [...names].sort((a, b) => sec(b) - sec(a) || a.localeCompare(b))) {
    const g = groups.reduce((lo, x) => (x.seconds < lo.seconds ? x : lo));
    g.scenarios.push(name);
    g.seconds += sec(name);
  }
  return groups.map((g) => ({ ...g, scenarios: g.scenarios.sort(), filter: `^(${g.scenarios.sort().map(escape).join("|")})$` }));
}

const escape = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A follow-up push's share of the needed scenarios: rerun what the last run didn't pass and what changed since it.
 * @param {string[]} needed what the whole PR needs (select against its base)
 * @param {Set<string>} passed what the last run passed or carried
 * @param {Set<string>} touched what the commits since the last run select
 */
export function incremental(needed, passed, touched) {
  return { run: needed.filter((n) => !passed.has(n) || touched.has(n)), carried: needed.filter((n) => passed.has(n) && !touched.has(n)) };
}

/**
 * The scenarios a previous pr-tests run passed or carried, from its downloaded scenarios-* artifacts: each folder's
 * suite.json (pass or flaky; a missing shard counts as not passed) and carried.json (the list it carried).
 * @param {string} dir
 */
export function readPassed(dir) {
  const passed = new Set();
  if (!dir || !fs.existsSync(dir)) return passed;
  for (const d of fs.readdirSync(dir)) {
    const at = path.join(dir, d);
    if (!fs.statSync(at).isDirectory()) continue;
    try {
      for (const r of JSON.parse(fs.readFileSync(path.join(at, "suite.json"), "utf8")).results ?? []) if (r && (r.result === "pass" || r.result === "flaky")) passed.add(r.name);
    } catch { /* no report: nothing passed there */ }
    try {
      for (const n of JSON.parse(fs.readFileSync(path.join(at, "carried.json"), "utf8"))) if (typeof n === "string") passed.add(n);
    } catch { /* not the carried artifact */ }
  }
  return passed;
}

/** The hook files a scenario's header names (tools/test-bds/hooks/<file>). @param {string} file */
function headerHooks(file) {
  const head = fs.readFileSync(file, "utf8").split("\n").filter((l) => /^\s*\/\//.test(l)).join("\n");
  return [...new Set([...head.matchAll(/tools\/test-bds\/hooks\/([\w.-]+)/g)].map((m) => m[1]))];
}

/** Scenario seconds from a suite --json report (the first run, not the retry). @param {string | undefined} file */
function readTimes(file) {
  const times = new Map();
  if (!file || !fs.existsSync(file)) return times;
  for (const r of JSON.parse(fs.readFileSync(file, "utf8")).results ?? []) if (r && typeof r.seconds === "number" && r.seconds > 0) times.set(r.name, r.seconds);
  return times;
}

function main() {
  const { values: a } = parseArgs({
    options: {
      base: { type: "string", default: "origin/master" }, all: { type: "boolean", default: false },
      shards: { type: "string", default: "4" }, "per-shard": { type: "string", default: "8" }, shard: { type: "string" },
      times: { type: "string" }, "packs-changed": { type: "boolean", default: false }, files: { type: "string" },
      since: { type: "string" }, prev: { type: "string" },
    },
  });
  // --files: a newline-separated list instead of git (tests, or a CI step that already has the diff).
  const diff = (/** @type {string} */ ref) => {
    const r = spawnSync("git", ["diff", "--name-only", `${ref}...HEAD`], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git diff ${ref}...HEAD failed: ${r.stderr.trim()}`);
    return r.stdout.split("\n").filter(Boolean);
  };
  const files = a.files !== undefined ? a.files.split("\n").map((x) => x.trim()).filter(Boolean) : diff(a.base);
  const change = classify(files);
  if (a["packs-changed"]) {
    console.log(String(change.packs.size > 0 || change.harness));
    return;
  }
  const list = spawnSync(process.execPath, [path.join(HERE, "suite.mjs"), "--list"], { cwd: ROOT, encoding: "utf8" });
  if (list.status !== 0) throw new Error(`suite.mjs --list failed: ${list.stderr.trim()}`);
  const plans = list.stdout.split("\n").map(parseListLine).filter((p) => p !== null).map((p) => {
    const file = path.join(HERE, "examples", `${p.name}.js`);
    return { ...p, hooks: fs.existsSync(file) ? headerHooks(file) : [] };
  });
  let { reason, scenarios } = select(plans, change, { all: a.all });
  /** @type {string[]} */
  let carried = [];
  if (a.since && a.prev) {
    const passed = readPassed(a.prev);
    const touched = new Set(select(plans, classify(diff(a.since))).scenarios);
    const inc = incremental(scenarios, passed, touched);
    reason += `; follow-up push: ${inc.run.length} to run (not passed last time, or touched since ${a.since.slice(0, 7)}), ${inc.carried.length} carried as passed`;
    scenarios = inc.run;
    carried = inc.carried;
  }
  const shards = shard(scenarios, { shards: Math.max(1, Math.min(8, Number(a.shards) || 4)), perShard: Number(a["per-shard"]) || 8, times: readTimes(a.times) });
  if (a.shard) {
    const [k, n] = a.shard.split("/").map(Number);
    if (n && n !== shards.length) throw new Error(`--shard ${a.shard}: this change has ${shards.length} shard(s)`);
    console.log(shards[k - 1]?.filter ?? "");
    return;
  }
  console.log(JSON.stringify({ reason, packs: [...change.packs].sort(), scenarios, carried, shards }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(String(/** @type {Error} */ (e).message));
    process.exit(1);
  }
}
