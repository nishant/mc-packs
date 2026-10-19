#!/usr/bin/env node
// Runs every scenario in examples/ with the command from its own header comment, a few at a time,
// and prints a table: scenario | result | seconds | first failure line.
//   node tools/test-bds/suite.mjs [--jobs 2] [--filter <regex>] [--retry] [--json <out>] [--list] [--prepare-only]
//   node tools/test-bds/suite.mjs --perf 10,40 [--perf-seconds 120] [--perf-only a_bp,b_bp] [--json <out>]
// Results: pass, fail, flaky (failed, then passed when rerun alone with --retry), timeout, skipped.
// --prepare-only (offline, starts no BDS): stages every header recipe and checks the folder its run command points at.
// --perf runs only the perf-soak scenario once per player count (with run.mjs --profile, one after another) and
// prints ms/tick per pack side by side with the budget (whole bundle < 5 ms/tick at 40 players, a typical pack
// <= 0.15, the Minimap and HUD <= 1); --perf-only installs just those packs. A count whose soak did not spawn and
// keep every declared player for the whole window is marked INVALID (profile "acceptance"), and the run exits 1.
// Logs: tools/test-bds/logs/suite-<time>/<scenario>.out (run.mjs output) and .log (full BDS log).
// Exit code: 0 when nothing failed or timed out (flaky and skipped count as ok), 1 otherwise.
// Header recipes run in bash (Git for Windows' bash.exe on Windows, or BDS_HARNESS_BASH); see lib/recipe.mjs.
//
// Each scenario's command is the first "node tools/test-bds/run.mjs ..." line in its header; the
// scenario path is always the file itself, and a header whose command runs another file fails (a copy-paste
// slip). Scenarios whose header gives no plain command are handled in SPECIAL below. Headers that build a test
// copy of packs with a shell recipe (lines like "//   mkdir -p /tmp/x && cp -r packs/x_bp /tmp/x/", test hooks
// from tools/test-bds/hooks/) get the recipe run first, with /tmp/ replaced by a quoted folder of this suite run
// (spaces, quotes and Windows backslashes are fine) so parallel runs do not collide; a --packs header without
// such a recipe is skipped ("needs hook copy").
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { findBash, runRecipe, stageRecipe, stageWord } from "./lib/recipe.mjs";
import { findPacks } from "./lib/packs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EXAMPLES = path.join(HERE, "examples");

let args;
try {
  args = parseArgs({
    options: {
      jobs: { type: "string", default: "2" }, filter: { type: "string" }, retry: { type: "boolean", default: false },
      json: { type: "string" }, list: { type: "boolean", default: false }, help: { type: "boolean", short: "h", default: false },
      perf: { type: "string" }, "perf-seconds": { type: "string", default: "120" }, "perf-only": { type: "string" },
      "prepare-only": { type: "boolean", default: false },
    },
  }).values;
} catch (e) {
  console.error(String(e.message));
  process.exit(64);
}
if (args.help) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 14).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const JOBS = Math.max(1, Number(args.jobs) || 2);

// Scenarios with no runnable plain command in their header (or a wrong one).
const SPECIAL = {
  smoke: { args: ["--timeout", "300"], note: "every pack (default)" },
  restart: { args: ["--timeout", "300"], note: "every pack (default)" },
  forms: { args: ["--only", "nick_bp"] },
  "domt-champion": { args: ["--only", "domt_bp,elite_bp", "--timeout", "600"], note: "header also asks for a run with --only domt_bp" },
  "npc-name-capability": { args: ["--flat", "--only", "npc_bp,build_rp", "--strict"], note: "capability probe (header's native run)" },
  "saga-lighthouse": { args: ["--flat", "--only", "saga_bp", "--timeout", "300"], note: "no command in header" },
  "perf-soak": { args: ["--no-relay", "--profile", "--profile-every", "0", "--arg", "players=6", "--arg", "seconds=60", "--timeout", "400"], note: "short soak (6 players, 60 s)" },
  "stash-pages-persistence": { runner: "stash-persistence.mjs", note: "custom runner stash-persistence.mjs" },
  "stash-recover-restart": { runner: "stash-persistence.mjs", runnerArgs: ["--scenario", path.join(EXAMPLES, "stash-recover-restart.js")], note: "owning-addon pending journal recovery across a restart" },
  "build-beds": { runner: "build-beds.mjs", note: "native main-pipeline proof, not simulated second-input or physical acceptance" },
  "bundle-smoke": { args: ["--flat", "--bundle", "dist/realm_bundle.mcpack", "--timeout", "300"], prepare: ["tools/bundle.mjs", "--all"], note: "builds the Realm Bundle first (dist/realm_bundle.mcpack), runs it as one script context" },
  "full-bundle-protocols": { fullBundle: true, note: "builds and stages the genuine 67-member cancellation bundle" },
  "stash-page-transfer-restart": { runner: "stash-persistence.mjs", runnerArgs: ["--scenario", path.join(EXAMPLES, "stash-page-transfer-restart.js")], note: "moved native row across two physical restarts" },
};
// A --packs header's test copy is built by the plain shell lines just above its command (run first).
const RECIPE_START = /^\/\/ {3}(S=|mkdir |rm |cp |sed |cat |printf |for |grep |node -e )/;

function headerComments(text) {
  const lines = text.split("\n");
  const out = [];
  for (const l of lines.slice(0, 60)) {
    if (/^\s*(\/\/|\/\*|\*)/.test(l) || !l.trim()) out.push(l);
    else if (/^import\b/.test(l)) continue;
    else break;
  }
  return out;
}

/** Minimal shell word splitter (quotes, no expansion). */
function shellSplit(s) {
  const out = [];
  let cur = "", q = null, any = false;
  for (const c of s) {
    if (q) { if (c === q) q = null; else cur += c; continue; }
    if (c === "'" || c === '"') { q = c; any = true; continue; }
    if (/\s/.test(c)) { if (cur || any) out.push(cur); cur = ""; any = false; continue; }
    cur += c;
  }
  if (cur || any) out.push(cur);
  return out;
}

/** Works out how to run one scenario file. */
function plan(file, hookRoot) {
  const name = path.basename(file, ".js");
  const text = fs.readFileSync(file, "utf8");
  const header = headerComments(text);
  const p = { name, file, args: null, recipe: null, notes: [] };
  const sp = SPECIAL[name];
  if (sp) {
    if (sp.note) p.notes.push(sp.note);
    if (sp.fullBundle) {
      const stage = path.join(hookRoot, name);
      p.prepareSteps = [
        ["tools/bundle.mjs", "--all"],
        ["tools/test-bds/hooks/full-bundle-protocols.mjs", "--from", path.join(ROOT, "dist", "realm_bundle.mcpack"), "--out", stage],
      ];
      p.args = ["--quiet", "--strict", "--flat", "--bundle", path.join(stage, "realm_bundle"), "--timeout", "1200", "--scenario", file];
      return p;
    }
    if (sp.runner) { p.runner = sp.runner; return p; }
    if (sp.prepare) p.prepare = sp.prepare;
    p.args = ["--quiet", ...sp.args, "--scenario", file];
    return p;
  }
  const cmdIdx = header.findIndex((l) => /node tools\/test-bds\/run\.mjs/.test(l));
  if (cmdIdx < 0) { p.skip = "no run command in header"; return p; }
  const cmdLine = header[cmdIdx].replace(/^.*?node tools\/test-bds\/run\.mjs/, "");
  let words = shellSplit(cmdLine.replace(/\s+#.*$/, ""));
  const recipeStart = header.findIndex((l, i) => i < cmdIdx && RECIPE_START.test(l));
  const packsIdx = words.indexOf("--packs");
  if (packsIdx >= 0) {
    if (recipeStart < 0) { p.skip = "skipped: needs hook copy (no shell recipe in the header)"; return p; }
    const recipeLines = header.slice(recipeStart, cmdIdx);
    if (!recipeLines.every((l) => l.startsWith("//   "))) { p.skip = "skipped: needs hook copy (recipe not plain shell)"; return p; }
    const tmp = path.join(hookRoot, name);
    const recipeText = recipeLines.map((l) => l.slice(5)).join("\n");
    p.stage = tmp;
    p.recipe = stageRecipe(recipeText, tmp);
    words = words.map((w) => stageWord(w, recipeText, tmp));
    p.notes.push("test copy built from header recipe");
  }
  const si = words.indexOf("--scenario");
  if (si >= 0) {
    const given = path.resolve(ROOT, words[si + 1]);
    if (given !== file) { p.headerBug = `header runs ${path.relative(ROOT, given)}, not ${name}.js: fix the header`; p.notes.push(p.headerBug); }
    words.splice(si, 2);
  }
  if (!words.includes("--quiet")) words.unshift("--quiet");
  p.args = [...words, "--scenario", file];
  return p;
}

function firstFailure(out, code) {
  const lines = out.split("\n");
  const scen = lines.find((l) => l.startsWith("scenario: failed"));
  const res = lines.find((l) => l.startsWith("RESULT: "));
  if (code === 2) {
    const i = lines.findIndex((l) => /^script errors: [1-9]/.test(l));
    if (i >= 0) { const e = lines.slice(i + 1).find((l) => /^ {4}\[/.test(l)); if (e) return e.trim(); }
    if (res) return res.slice(8);
  }
  if (scen) return scen.replace(/^scenario: failed - /, "");
  const failed = lines.find((l) => /FAILED:|harness error|setup failed|Error:/.test(l));
  if (failed) return failed.trim();
  return res ? res.slice(8) : lines.filter(Boolean).slice(-1)[0] || "";
}

function verdict(code, timedOut) {
  if (timedOut || code === 3) return "timeout";
  return code === 0 ? "pass" : "fail";
}

let bashPath;
const prepared = new Map();
/** Runs a scenario's prepare command (node <argv>) once per suite run, however many scenarios or retries need it. */
function prepareOnce(argv) {
  const key = argv.join(" ");
  if (!prepared.has(key)) prepared.set(key, spawnSync(process.execPath, argv, { cwd: ROOT, encoding: "utf8" }));
  return prepared.get(key);
}
/** Builds a scenario's test copy by running its staged header recipe; the run command's --packs folder must exist after it. */
function stageScenario(p) {
  let detail = "";
  try {
    bashPath ??= findBash();
    fs.mkdirSync(p.stage, { recursive: true });
    const r = runRecipe(p.recipe, { cwd: ROOT, bash: bashPath });
    if (r.status !== 0) return { ok: false, detail: `${r.stderr || r.error || ""}${r.stdout || ""}` || `exit ${r.status}` };
    const i = p.args.indexOf("--packs");
    const packsDir = i >= 0 ? path.resolve(p.args[i + 1]) : null;
    if (!packsDir || !fs.existsSync(packsDir)) return { ok: false, detail: `the recipe did not create the packs folder ${packsDir} (the run command's --packs)` };
    const only = p.args.indexOf("--only") >= 0 ? p.args[p.args.indexOf("--only") + 1] : undefined;
    const found = findPacks(packsDir, only);
    if (!found.length) return { ok: false, detail: `no pack folders with a manifest.json in ${packsDir}` };
    return { ok: true, detail, packs: found.map((f) => f.folder) };
  } catch (e) {
    return { ok: false, detail: String(e?.message ?? e) };
  }
}

/** Timeout (s) the run asked for, plus slack for setup, to kill a hung run. */
function hardLimit(p) {
  const i = p.args ? p.args.indexOf("--timeout") : -1;
  const s = i >= 0 ? Number(p.args[i + 1]) : p.runner ? 240 : 180;
  return (s + 120) * 1000;
}

function runOne(p, logDir, tag = "") {
  return new Promise((resolve) => {
    const base = path.join(logDir, p.name + tag);
    const t0 = Date.now();
    if (p.recipe) {
      const staged = stageScenario(p);
      if (!staged.ok) {
        fs.writeFileSync(base + ".out", `recipe failed:\n${p.recipe}\n${staged.detail}`);
        resolve({ result: "fail", code: 4, seconds: (Date.now() - t0) / 1000, failure: `test copy recipe failed: ${staged.detail.trim().split("\n")[0]}` });
        return;
      }
    }
    for (const preparation of p.prepareSteps ?? (p.prepare ? [p.prepare] : [])) {
      const r = prepareOnce(preparation);
      if (r.status !== 0) {
        fs.writeFileSync(base + ".out", `preparing the scenario failed: node ${preparation.join(" ")}\n${r.stdout}\n${r.stderr}`);
        resolve({ result: "fail", code: 4, seconds: (Date.now() - t0) / 1000, failure: `preparing failed (node ${preparation.join(" ")}): ${(r.stderr || r.stdout || "").trim().split("\n").at(-1)}` });
        return;
      }
    }
    const argv = p.runner
      ? [path.join(HERE, p.runner), ...(p.runnerArgs ?? []), "--port", String(19400 + Math.floor(Math.random() * 400) * 2)]
      : [path.join(HERE, "run.mjs"), ...p.args, "--log", base + ".log"];
    const child = spawn(process.execPath, argv, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    const outStream = fs.createWriteStream(base + ".out");
    outStream.write(`$ node ${argv.map((a) => path.isAbsolute(a) ? path.relative(ROOT, a) || "." : a).join(" ")}\n`);
    let out = "";
    const take = (d) => { const s = d.toString(); out += s; if (out.length > 4e6) out = out.slice(-2e6); outStream.write(s); };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    let timedOut = false;
    const kill = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 10000); }, hardLimit(p));
    child.on("close", (code) => {
      clearTimeout(kill);
      outStream.end();
      const result = verdict(code, timedOut);
      resolve({ result, code, seconds: (Date.now() - t0) / 1000, failure: result === "pass" ? "" : timedOut ? "killed by suite (hung)" : firstFailure(out, code) });
    });
  });
}

/** --perf: perf-soak once per player count, one at a time, then ms/tick per pack side by side against the budget. */
async function perf() {
  const counts = String(args.perf).split(",").map((x) => Math.max(1, Math.floor(Number(x)))).filter(Number.isFinite);
  const seconds = Math.max(10, Number(args["perf-seconds"]) || 120);
  fs.mkdirSync(logDir, { recursive: true });
  const soak = path.join(EXAMPLES, "perf-soak.js");
  /** @type {Map<number, any>} */
  const reports = new Map();
  const invalid = [];
  for (const n of counts) {
    const json = path.join(logDir, `perf-${n}.json`);
    // Spawning takes about a second per player on top of the soak itself; ticks run slow under load.
    const timeout = Math.round(120 + n * 2 + seconds * 6);
    const p = { name: `perf-${n}`, args: ["--quiet", "--no-relay", "--profile", "--profile-every", "0", "--profile-json", json, ...(args["perf-only"] ? ["--only", args["perf-only"]] : []), "--arg", `players=${n}`, "--arg", `seconds=${seconds}`, "--timeout", String(timeout), "--scenario", soak], notes: [] };
    console.log(`[suite] perf: ${n} players, ${seconds} s of game time${args["perf-only"] ? `, packs ${args["perf-only"]}` : ""}`);
    const r = await runOne(p, logDir);
    console.log(`[suite] perf ${n}: ${r.result} (${r.seconds.toFixed(0)} s)${r.failure ? ` - ${r.failure.slice(0, 160)}` : ""}`);
    try {
      const rep = JSON.parse(fs.readFileSync(json, "utf8"));
      reports.set(n, rep);
      if (!rep.acceptance?.ok) {
        invalid.push(n);
        console.log(`[suite] perf ${n}: INVALID as a ${n}-player measurement - ${rep.acceptance ? rep.acceptance.reasons.join("; ") : "the profile has no acceptance verdict (no perf-workload report)"}`);
      }
    } catch (e) { invalid.push(n); console.log(`[suite] perf ${n}: no profile report (${e.message})`); }
  }
  if (!reports.size) process.exit(1);
  const ns = [...reports.keys()];
  const packs = new Set();
  for (const rep of reports.values()) for (const pk of rep.packs) packs.add(pk.pack);
  const ms = (rep, pack) => rep?.packs.find((x) => x.pack === pack)?.msPerTick;
  const last = reports.get(ns[ns.length - 1]);
  const rows = [...packs].sort((a, b) => (ms(last, b) ?? 0) - (ms(last, a) ?? 0));
  const HEAVY = new Set(["map_bp", "hud_bp"]);
  const budget = (pack) => (HEAVY.has(pack) ? 1 : 0.15);
  const f3 = (x) => (x === undefined ? "-" : x.toFixed(3));
  const w = Math.max(12, ...rows.map((r) => r.length));
  const L = ["", `${"pack".padEnd(w)} | ${ns.map((n) => `@${n} ms/tick`.padStart(13)).join(" | ")} | budget | over at`, `${"-".repeat(w)}-|${ns.map(() => "-".repeat(15)).join("|")}|--------|--------`];
  L.push(`${"whole bundle".padEnd(w)} | ${ns.map((n) => f3(reports.get(n).bundle?.msPerTick).padStart(13)).join(" | ")} | ${"5".padStart(6)} | ${ns.filter((n) => n >= 40 && reports.get(n).bundle?.msPerTick > 5).join(",") || "-"}`);
  L.push(`${"server TPS".padEnd(w)} | ${ns.map((n) => (reports.get(n).server?.tps ?? 0).toFixed(1).padStart(13)).join(" | ")} |        |`);
  for (const pack of rows) {
    const over = ns.filter((n) => (ms(reports.get(n), pack) ?? 0) > budget(pack));
    L.push(`${pack.padEnd(w)} | ${ns.map((n) => f3(ms(reports.get(n), pack)).padStart(13)).join(" | ")} | ${String(budget(pack)).padStart(6)} | ${over.join(",") || "-"}`);
  }
  L.push("", `reports: ${ns.map((n) => path.join(logDir, `perf-${n}.json`)).join(", ")}`);
  if (invalid.length) L.push(`INVALID player counts (not comparators, whatever their numbers): ${invalid.join(", ")}`);
  console.log(L.join("\n"));
  if (args.json) {
    fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
    fs.writeFileSync(args.json, JSON.stringify({ date: new Date().toISOString(), seconds, only: args["perf-only"] ?? null, invalid, perf: Object.fromEntries([...reports].map(([n, r]) => [n, { acceptance: r.acceptance ?? null, bundle: r.bundle, server: r.server, packs: Object.fromEntries(r.packs.map((x) => [x.pack, x.msPerTick])) }])) }, null, 2));
  }
  if (invalid.length) process.exitCode = 1;
}

async function pool(items, n, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logDir = path.join(process.env.BDS_HARNESS_LOGS || path.join(HERE, "logs"), `suite-${stamp}`);
const hookRoot = args.list ? path.join(os.tmpdir(), "bds-suite-hooks-XXXXXX") : fs.mkdtempSync(path.join(process.env.BDS_HARNESS_TMP || os.tmpdir(), "bds-suite-hooks-"));
const filter = args.filter ? new RegExp(args.filter) : null;
const files = fs.readdirSync(EXAMPLES).filter((f) => f.endsWith(".js")).sort().map((f) => path.join(EXAMPLES, f));
const plans = files.map((f) => plan(f, hookRoot)).filter((p) => !filter || filter.test(p.name));

if (args.list) {
  for (const p of plans) console.log(`${p.name}: ${p.skip ? p.skip : p.runner ? `node ${p.runner}` : `run.mjs ${p.args.map((a) => a === p.file ? path.relative(ROOT, a) : a).join(" ")}`}${p.recipe ? " (after header recipe)" : ""}${p.notes.length ? ` [${p.notes.join("; ")}]` : ""}`);
  process.exit(0);
}

if (args["prepare-only"]) {
  // Offline: stage every header recipe and check the folder its run command points at, without starting BDS.
  const rows = plans.map((p) => {
    if (p.skip) return { name: p.name, status: "skipped", detail: p.skip };
    if (p.headerBug) return { name: p.name, status: "fail", detail: p.headerBug };
    if (!p.recipe) return { name: p.name, status: "no recipe", detail: "needs no staging" };
    const staged = stageScenario(p);
    return staged.ok ? { name: p.name, status: "staged", detail: `${p.stage}: ${staged.packs.join(", ")}` } : { name: p.name, status: "fail", detail: staged.detail.trim().split("\n")[0] };
  });
  for (const r of rows.filter((x) => x.status !== "no recipe")) console.log(`${r.name}: ${r.status} - ${r.detail}`);
  console.log(`[suite] prepare-only: ${rows.filter((x) => x.status === "staged").length} staged, ${rows.filter((x) => x.status === "no recipe").length} need no staging, ${rows.filter((x) => x.status === "fail").length} failed, ${rows.filter((x) => x.status === "skipped").length} skipped`);
  if (args.json) {
    fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
    fs.writeFileSync(args.json, JSON.stringify({ date: new Date().toISOString(), prepareOnly: true, results: rows }, null, 2));
  }
  fs.rmSync(hookRoot, { recursive: true, force: true });
  process.exit(rows.some((r) => r.status === "fail" || r.status === "skipped") ? 1 : 0);
}

if (args.perf) {
  await perf();
  process.exit(process.exitCode ?? 0);
}

fs.mkdirSync(logDir, { recursive: true });
console.log(`[suite] ${plans.length} scenarios, ${JOBS} at a time${args.retry ? ", failures retried alone" : ""}; logs ${logDir}`);
const t0 = Date.now();
const results = new Map();
let doneCount = 0;
const runnable = plans.filter((p) => !p.skip);
for (const p of plans.filter((p) => p.skip)) results.set(p.name, { name: p.name, result: "skipped", seconds: 0, failure: p.skip, notes: p.notes });

await pool(runnable, JOBS, async (p) => {
  const r = p.headerBug ? { result: "fail", code: 64, seconds: 0, failure: p.headerBug } : await runOne(p, logDir);
  results.set(p.name, { name: p.name, ...r, notes: p.notes });
  console.log(`[suite] ${++doneCount}/${runnable.length} ${p.name}: ${r.result} (${r.seconds.toFixed(0)} s)${r.failure ? ` - ${r.failure.slice(0, 160)}` : ""}`);
});

if (args.retry) {
  const again = runnable.filter((p) => ["fail", "timeout"].includes(results.get(p.name).result));
  if (again.length) console.log(`[suite] retrying ${again.length} alone`);
  for (const p of again) {
    const first = results.get(p.name);
    const r = await runOne(p, logDir, ".retry");
    const result = r.result === "pass" ? "flaky" : first.result;
    results.set(p.name, { ...first, result, retry: r });
    console.log(`[suite] retry ${p.name}: ${r.result} (${r.seconds.toFixed(0)} s)${r.failure ? ` - ${r.failure.slice(0, 160)}` : ""}`);
  }
}

const rows = plans.map((p) => results.get(p.name));
const counts = {};
for (const r of rows) counts[r.result] = (counts[r.result] || 0) + 1;
const w = Math.max(8, ...rows.map((r) => r.name.length));
const L = ["", `${"scenario".padEnd(w)} | result  | seconds | first failure line`, `${"-".repeat(w)}-|---------|---------|-------------------`];
for (const r of rows) L.push(`${r.name.padEnd(w)} | ${r.result.padEnd(7)} | ${String(Math.round(r.seconds)).padStart(7)} | ${(r.failure || "").replace(/\s+/g, " ").slice(0, 200)}`);
L.push("");
L.push(`total ${rows.length}: ${["pass", "flaky", "fail", "timeout", "skipped"].map((k) => `${counts[k] || 0} ${k}`).join(", ")}; wall ${((Date.now() - t0) / 60000).toFixed(1)} min; logs ${logDir}`);
console.log(L.join("\n"));
if (args.json) {
  fs.mkdirSync(path.dirname(path.resolve(args.json)), { recursive: true });
  fs.writeFileSync(args.json, JSON.stringify({ date: new Date().toISOString(), jobs: JOBS, retry: args.retry, wallSeconds: (Date.now() - t0) / 1000, counts, logDir, results: rows }, null, 2));
}
fs.rmSync(hookRoot, { recursive: true, force: true });
process.exit((counts.fail || 0) + (counts.timeout || 0) ? 1 : 0);
