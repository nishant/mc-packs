#!/usr/bin/env node
// One profiled run of a BDS scenario in a given tree, written as a suite --perf --json report so perf-compare.mjs and
// validate-report.mjs read it like a soak: validate.yml's "scenario" jobs run it on the base tree and on the head
// tree back to back on one runner, for the per-pack perf scenarios (gear-perf, build-holders-perf, saga-perf-quests,
// expedition-perf, ...) that suite.mjs --perf doesn't cover.
//   node tools/test-bds/scenario-soak.mjs --root <tree> --spec "<name> [run.mjs args]" --json <out>
// The run command is the tree's own plan for the scenario (its `suite.mjs --list` line: the header command or the
// suite's SPECIAL entry), plus --profile --profile-every 0 --profile-json, plus the spec's extra arguments (e.g.
// `gear-perf --arg players=40 --arg seconds=120` for the header's heavier measurement); a later --arg wins. Scenarios
// that need a header recipe or a custom runner aren't supported (exit 64). Figures: the steady window when the
// scenario reports one, else the whole run. The run counts (acceptance.ok) only when run.mjs passed and the
// scenario's own acceptance, if any, is ok. Exit code: run.mjs's.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

/** Splits a spec or a --list line into words (no quoting: scenario names and args have no spaces). @param {string} s */
export const words = (s) => s.trim().split(/\s+/).filter(Boolean);

/**
 * The run.mjs arguments for a scenario from its `suite.mjs --list` line, with the profiler and the extra arguments.
 * @param {string} line the scenario's --list line
 * @param {string[]} extra
 * @param {string} profileJson
 * @param {string} scenarioFile absolute path in the tree
 * @returns {string[] | string} the arguments, or why the scenario can't be run this way
 */
export function runArgs(line, extra, profileJson, scenarioFile) {
  const m = /^[\w.-]+: (.*)$/.exec(line.trim());
  if (!m) return "no plan line";
  const rest = m[1];
  if (/^node /.test(rest)) return "it has a custom runner";
  if (/^skipped\b|^no run command/.test(rest)) return "the suite skips it";
  if (/\(after header recipe\)/.test(rest)) return "it needs a header recipe (a --packs test copy)";
  if (!rest.startsWith("run.mjs ")) return "no run.mjs command";
  const out = [];
  const w = words(rest.replace(/\s\[[^\]]*\]$/, "").slice("run.mjs ".length));
  for (let i = 0; i < w.length; i++) {
    if (["--scenario", "--profile-json", "--profile-every"].includes(w[i])) { i++; continue; }
    if (w[i] === "--profile") continue;
    out.push(w[i]);
  }
  return [...out, ...extra, "--profile", "--profile-every", "0", "--profile-json", profileJson, "--scenario", scenarioFile];
}

/**
 * A run.mjs profile JSON as a suite --perf --json report under `label`.
 * @param {any} prof
 * @param {string} label
 * @param {boolean} passed run.mjs exit 0
 */
export function asReport(prof, label, passed) {
  const steady = prof?.bundle?.steadyWindow?.avg;
  const packs = Object.fromEntries((prof?.packs ?? []).map((/** @type {any} */ x) => [x.pack, { whole: x.msPerTick, steady: Number.isFinite(x.steadyMsPerTick) ? x.steadyMsPerTick : x.msPerTick }]));
  const ok = passed && prof !== null && (prof.acceptance ? prof.acceptance.ok === true : true);
  return {
    date: new Date().toISOString(),
    perf: { [label]: { acceptance: { ok, reasons: ok ? [] : [passed ? "the scenario's acceptance failed" : "the scenario did not pass"] }, bundle: { ...(prof?.bundle ?? {}), steadyWindow: { avg: Number.isFinite(steady) ? steady : prof?.bundle?.msPerTick ?? null } }, server: prof?.server ?? null, packs } },
  };
}

function main() {
  const { values: a } = parseArgs({ options: { root: { type: "string", default: "." }, spec: { type: "string" }, json: { type: "string" }, label: { type: "string" } } });
  const root = path.resolve(a.root ?? ".");
  const [name, ...extra] = words(a.spec ?? "");
  if (!name || !a.json) {
    console.error("usage: scenario-soak.mjs --root <tree> --spec \"<name> [run.mjs args]\" --json <out>");
    process.exit(64);
  }
  const list = spawnSync(process.execPath, [path.join(root, "tools/test-bds/suite.mjs"), "--list", "--filter", `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`], { cwd: root, encoding: "utf8" });
  const line = list.stdout.split("\n").find((l) => l.startsWith(`${name}: `));
  const scenarioFile = path.join(root, "tools/test-bds/examples", `${name}.js`);
  const profileJson = path.join(fs.mkdtempSync(path.join(process.env.BDS_HARNESS_TMP || os.tmpdir(), "scenario-soak-")), "profile.json");
  const args = line && fs.existsSync(scenarioFile) ? runArgs(line, extra, profileJson, scenarioFile) : `no scenario ${name} in ${root}`;
  if (typeof args === "string") {
    console.error(`scenario-soak: ${name}: ${args}`);
    process.exit(64);
  }
  console.log(`[scenario-soak] ${path.basename(root)}: run.mjs ${args.join(" ")}`);
  const run = spawnSync(process.execPath, [path.join(root, "tools/test-bds/run.mjs"), ...args], { cwd: root, stdio: "inherit" });
  let prof = null;
  try {
    prof = JSON.parse(fs.readFileSync(profileJson, "utf8"));
  } catch (e) {
    console.error(`scenario-soak: no profile report (${/** @type {Error} */ (e).message})`);
  }
  fs.mkdirSync(path.dirname(path.resolve(a.json)), { recursive: true });
  fs.writeFileSync(a.json, JSON.stringify(asReport(prof, a.label ?? a.spec ?? name, run.status === 0), null, 2));
  process.exit(run.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
