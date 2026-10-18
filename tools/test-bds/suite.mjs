#!/usr/bin/env node
// Runs every scenario in examples/ with the command from its own header comment, a few at a time,
// and prints a table: scenario | result | seconds | first failure line.
//   node tools/test-bds/suite.mjs [--jobs 2] [--filter <regex>] [--retry] [--json <out>] [--list]
// Results: pass, fail, flaky (failed, then passed when rerun alone with --retry), timeout, skipped.
// Logs: tools/test-bds/logs/suite-<time>/<scenario>.out (run.mjs output) and .log (full BDS log).
// Exit code: 0 when nothing failed or timed out (flaky and skipped count as ok), 1 otherwise.
//
// Each scenario's command is the first "node tools/test-bds/run.mjs ..." line in its header; the
// scenario path is always the file itself. Scenarios whose header gives no plain command are
// handled in SPECIAL below. Headers that build a test copy of packs with a shell recipe (lines like
// "//   mkdir -p /tmp/x && cp -r packs/x_bp /tmp/x/") get the recipe run first, with /tmp/ moved to a
// folder of this suite run so parallel runs do not collide; those whose test hook is only described
// in prose are skipped ("needs hook copy").
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const EXAMPLES = path.join(HERE, "examples");

let args;
try {
  args = parseArgs({
    options: {
      jobs: { type: "string", default: "2" }, filter: { type: "string" }, retry: { type: "boolean", default: false },
      json: { type: "string" }, list: { type: "boolean", default: false }, help: { type: "boolean", short: "h", default: false },
    },
  }).values;
} catch (e) {
  console.error(String(e.message));
  process.exit(64);
}
if (args.help) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 15).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
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
  "stash-pages-persistence": { runner: "stash-persistence.mjs", note: "custom runner stash-persistence.mjs" },
};
// Headers whose test copy is a plain shell recipe: it is run first. Other --packs scenarios
// (maps-cleanup, maps-leave, rainbow-race: hook described in prose) are skipped.
const RECIPES = new Set(["claims-bundle-taps", "storm-rod-claims", "rain-roof", "rain-seabed", "title-hold", "rook-map-race", "saga-world-events"]);
const RECIPE_START = /^\/\/ {3}(S=|mkdir |rm |cp |sed |cat |printf |for |node -e )/;

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
    if (sp.runner) { p.runner = sp.runner; return p; }
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
    if (recipeStart < 0 || !RECIPES.has(name)) { p.skip = "skipped: needs hook copy (hook described in prose)"; return p; }
    const recipeLines = header.slice(recipeStart, cmdIdx);
    if (!recipeLines.every((l) => l.startsWith("//   "))) { p.skip = "skipped: needs hook copy (recipe not plain shell)"; return p; }
    const tmp = path.join(hookRoot, name) + "/";
    let recipe = recipeLines.map((l) => l.slice(5)).join("\n").replace(/\/tmp\//g, tmp);
    const sVar = /(?:^|[\s;&])S=(\S+?)(?=[;&\s]|$)/m.exec(recipe);
    words = words.map((w) => w.replace(/\/tmp\//g, tmp).replace(/\$S\b/g, sVar ? sVar[1] : "$S"));
    p.recipe = recipe;
    p.notes.push("test copy built from header recipe");
  }
  const si = words.indexOf("--scenario");
  if (si >= 0) {
    const given = path.resolve(ROOT, words[si + 1]);
    if (given !== file) p.notes.push(`header runs ${path.relative(ROOT, given)}; ran ${name}.js instead`);
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
      const r = spawnSync("bash", ["-e", "-c", p.recipe], { cwd: ROOT, encoding: "utf8" });
      if (r.status !== 0) {
        fs.writeFileSync(base + ".out", `recipe failed:\n${p.recipe}\n${r.stdout}\n${r.stderr}`);
        resolve({ result: "fail", code: 4, seconds: (Date.now() - t0) / 1000, failure: `test copy recipe failed: ${(r.stderr || "").trim().split("\n")[0]}` });
        return;
      }
    }
    const argv = p.runner
      ? [path.join(HERE, p.runner), "--port", String(19400 + Math.floor(Math.random() * 400) * 2)]
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

fs.mkdirSync(logDir, { recursive: true });
console.log(`[suite] ${plans.length} scenarios, ${JOBS} at a time${args.retry ? ", failures retried alone" : ""}; logs ${logDir}`);
const t0 = Date.now();
const results = new Map();
let doneCount = 0;
const runnable = plans.filter((p) => !p.skip);
for (const p of plans.filter((p) => p.skip)) results.set(p.name, { name: p.name, result: "skipped", seconds: 0, failure: p.skip, notes: p.notes });

await pool(runnable, JOBS, async (p) => {
  const r = await runOne(p, logDir);
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
