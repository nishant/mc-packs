#!/usr/bin/env node
// The post-release report of .github/workflows/validate.yml: reads every validate-<name> artifact (soak, bundle and
// scenario pairs as suite --perf --json reports, base-<n>/head-<n> for repeats; memory RSS samples, one side per job
// for memory-<n>-base / -head; suite shard reports) and writes one markdown report:
// the same-runner comparisons (tools/test-bds/perf-compare.mjs), the head's budget lines, the memory curve and the
// scenario totals. It also writes the scenario seconds (--times, a suite --json shape) for pr-tests.yml's shards.
// Each soak also gets a details block from the head's profile: bedrock_server CPU, watchdog lines, the steady window's
// tick histogram and worst ticks, each phase's worst ticks and, for the one-context bundle, per-pack rows by path.
// --matrix (the plan's matrix JSON) names the jobs that uploaded nothing; a missing suite shard counts as a failure.
//   node tools/test-bds/validate-report.mjs --dir <artifacts> --base <sha> --head <sha> [--run <url>] [--matrix <json>] --out report.md [--times t.json]
// Sets `status` in $GITHUB_OUTPUT: ok, or red when a scenario failed or timed out, a pair regressed, a soak gave
// no valid measurement (an INVALID soak is never a pass), or a memory side has no RSS samples or an exit code that is
// missing or not 0.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { compare, markdown, sideOf } from "./perf-compare.mjs";

/**
 * Memory figures from "epochSeconds kB" lines: start, 10 minutes in, end, max (MB) and growth from 10 minutes.
 * @param {string} text
 */
export function rssSummary(text) {
  const all = text.split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => (r.length === 2 || r.length === 3) && r.every(Number.isFinite) && r[r.length - 1] > 0);
  // "epochSeconds pid kB" lines (every bedrock_server sampled): judge the pid sampled over the longest span, the
  // latest on a tie, not the first one seen (the template generator runs first on a cold runner).
  /** @type {Map<number, { first: number, last: number }>} */
  const span = new Map();
  for (const r of all) if (r.length === 3) { const x = span.get(r[1]); if (!x) span.set(r[1], { first: r[0], last: r[0] }); else x.last = r[0]; }
  let pid = null, best = -1, bestFirst = -Infinity;
  for (const [p, x] of span) { const d = x.last - x.first; if (d > best || (d === best && x.first > bestFirst)) [pid, best, bestFirst] = [p, d, x.first]; }
  const rows = all.filter((r) => r.length === 2 || r[1] === pid).map((r) => [r[0], r[r.length - 1]]);
  if (!rows.length) return null;
  const mb = (/** @type {number} */ kb) => kb / 1024;
  const t0 = rows[0][0];
  const at10 = rows.find((r) => r[0] - t0 >= 600) ?? rows[rows.length - 1];
  const end = rows[rows.length - 1];
  return { samples: rows.length, minutes: (end[0] - t0) / 60, start: mb(rows[0][1]), at10: mb(at10[1]), end: mb(end[1]), max: mb(Math.max(...rows.map((r) => r[1]))), growth: mb(end[1] - at10[1]) };
}

/**
 * Totals, failures and seconds over suite shard reports.
 * @param {any[]} reports suite --json reports
 */
export function suiteSummary(reports) {
  /** @type {Record<string, number>} */
  const counts = {};
  const failures = [];
  const flaky = [];
  const results = [];
  let wall = 0;
  for (const r of reports) {
    wall = Math.max(wall, r.wallSeconds ?? 0);
    for (const x of r.results ?? []) {
      if (!x) continue;
      counts[x.result] = (counts[x.result] ?? 0) + 1;
      results.push({ name: x.name, seconds: x.seconds });
      const why = (/** @type {any} */ f) => (f ? ` - ${String(f).replace(/\s+/g, " ").slice(0, 160)}` : "");
      if (x.result === "fail" || x.result === "timeout") failures.push(`${x.name}: ${x.result}${why(x.failure)}`);
      // A flaky scenario failed, then passed when rerun alone: both durations and the first failure.
      if (x.result === "flaky") flaky.push(`${x.name}: failed in ${Math.round(x.seconds ?? 0)} s, passed alone in ${Math.round(x.retry?.seconds ?? 0)} s${why(x.failure)}`);
    }
  }
  return { counts, failures, flaky, results, wall, red: failures.length > 0 };
}

/**
 * The flaky history kept in the cached times file: this run's flaky names appended to the last 20 runs, and the
 * scenarios flaky most often over them.
 * @param {any} previous the times file as it was (or null) @param {string[]} flakyNames @param {number} ran scenarios this run
 */
export function flakyHistory(previous, flakyNames, ran) {
  const runs = [...(Array.isArray(previous?.flakyRuns) ? previous.flakyRuns : []), { date: new Date().toISOString(), ran, flaky: flakyNames }].slice(-20);
  /** @type {Map<string, number>} */
  const n = new Map();
  for (const r of runs) for (const name of r.flaky ?? []) n.set(name, (n.get(name) ?? 0) + 1);
  const top = [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, times]) => ({ name, times }));
  return { runs, top };
}

const n3 = (/** @type {any} */ v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "-");
const kinds = (/** @type {any} */ w) => (w ? `${w.count}${w.count ? ` (${Object.entries(w.byKind ?? {}).map(([k, n]) => `${n} ${k}`).join(", ")})` : ""}` : "-");

/**
 * The worst ticks of one window as a markdown table (with the calls of 1 ms or more in each).
 * @param {any[]} worst @param {number} [limit]
 */
function worstTable(worst, limit = 10) {
  const L = ["| tick | ms | calls of 1 ms or more (pack: callback ms) |", "|---:|---:|---|"];
  for (const w of worst.slice(0, limit)) L.push(`| ${w.tick} | ${w.ms} | ${(w.calls ?? []).slice(0, 4).map((/** @type {any} */ c) => `${c.pack}: \`${String(c.key).replace(/\|/g, "/").slice(0, 90)}\` ${c.ms}`).join("<br>") || "-"} |`);
  return L;
}

/**
 * What the head's profile of one soak shows beyond the comparison: bedrock_server CPU, watchdog lines, the tick
 * histograms and worst ticks of the steady window and each phase, and per-pack figures of a one-context bundle.
 * @param {any} head one player count of a suite --perf --json report (head side) @param {any} [base] the same of the base side
 */
export function profileDetails(head, base = null) {
  if (!head) return [];
  const L = [];
  const cpu = (/** @type {any} */ r) => n3(r?.process?.cpuMsPerTick);
  const s = head.server;
  L.push(`- bedrock_server CPU ms/tick (whole run, engine included): base ${cpu(base)} / head ${cpu(head)}`);
  L.push(`- watchdog and slow-tick lines: base ${kinds(base?.watchdog)} / head ${kinds(head.watchdog)}${head.watchdog?.first?.length ? `; first: ${head.watchdog.first.slice(0, 2).map((/** @type {string} */ x) => `\`${x.slice(0, 120)}\``).join(", ")}` : ""}`);
  if (s) L.push(`- server ticks: ${s.ticksOver50ms ?? "-"} over 50 ms${s.ticksOver55ms !== undefined ? ` (${s.ticksOver55ms} over 55)` : ""}, ${s.ticksOver100ms ?? "-"} over 100 ms; tick interval p95 ${s.tickIntervalP95Ms ?? "-"} / p99 ${s.tickIntervalP99Ms ?? "-"} / max ${s.tickIntervalMaxMs ?? "-"} ms`);
  const steady = head.bundle?.steadyWindow ?? head.bundle?.perTick;
  const h = steady?.histogram;
  if (h) {
    L.push("", `Steady window (${steady.ticks} ticks), average ms by \`tick % 20\`; ${h.over5} ticks over 5 ms, ${h.over5On20} of them on a multiple of 20 (${(100 * h.shareOver5On20).toFixed(0)}%)${h.peak20 !== undefined ? `, ${h.over5OnPeak20} on the busiest residue ${h.peak20} (${(100 * h.shareOver5OnPeak20).toFixed(0)}%)` : ""}:`, "");
    L.push(`| % 20 | ${h.mod20.map((/** @type {number} */ _, /** @type {number} */ i) => i).join(" | ")} |`, `|---|${h.mod20.map(() => "---:").join("|")}|`, `| ms | ${h.mod20.map((/** @type {number} */ v) => v.toFixed(2)).join(" | ")} |`);
    const tops = ["mod40", "mod100", "mod200"].filter((k) => Array.isArray(h[k])).map((k) => `\`% ${k.slice(3)}\`: ${h[k].map((/** @type {number} */ v, /** @type {number} */ i) => [i, v]).sort((/** @type {number[]} */ a, /** @type {number[]} */ b) => b[1] - a[1]).slice(0, 5).map((/** @type {number[]} */ [i, v]) => `${i} ${v.toFixed(2)}`).join(", ")}`);
    if (tops.length) L.push("", `Highest residues (residue ms): ${tops.join("; ")}`);
  }
  if (steady?.worst?.length) L.push("", "The 10 worst ticks of the steady window:", "", ...worstTable(steady.worst));
  for (const ph of head.bundle?.phases ?? []) {
    if (!ph?.bundle?.worst?.length) continue;
    L.push("", `Phase ${ph.name} (${ph.bundle.ticks} ticks, p95 ${ph.bundle.p95} / max ${ph.bundle.max} ms), worst ticks:`, "", ...worstTable(ph.bundle.worst, 5));
  }
  const byPath = head.bundle?.byPath;
  if (Array.isArray(byPath) && byPath.length) {
    L.push("", `One script context by \`scripts/<pack>/\` path (whole run; ${byPath.length} groups):`, "", "| pack | ms/tick | calls/tick | max ms | callbacks |", "|---|---:|---:|---:|---:|");
    for (const p of byPath.slice(0, 25)) L.push(`| ${p.pack} | ${n3(p.msPerTick)} | ${Number(p.callsPerTick).toFixed(2)} | ${p.max} | ${p.callbacks} |`);
    if (byPath.length > 25) L.push("", `${byPath.length - 25} cheaper group(s) not shown.`);
  }
  return L;
}

/**
 * Jobs the plan started that uploaded no artifact (a failed upload or a job that died first).
 * @param {string[]} expected job names from the plan's matrix @param {string[]} present job names with an artifact
 */
export function missingJobs(expected, present) {
  const have = new Set(present);
  return expected.filter((n) => !have.has(n));
}

const read = (/** @type {string} */ f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");
const json = (/** @type {string} */ f) => {
  try {
    return JSON.parse(read(f));
  } catch {
    return null;
  }
};

function main() {
  const { values: a } = parseArgs({ options: { dir: { type: "string" }, base: { type: "string", default: "" }, head: { type: "string", default: "" }, run: { type: "string", default: "" }, out: { type: "string", default: "report.md" }, times: { type: "string" }, matrix: { type: "string" }, span: { type: "string", default: "" }, "base-from": { type: "string", default: "" } } });
  const dir = path.resolve(a.dir ?? ".");
  const jobs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => d.startsWith("validate-")).sort() : [];
  const span = Number(a.span);
  const spanText = Number.isFinite(span) && span > 0 ? ` The pair spans ${span} commit${span === 1 ? "" : "s"} on master's first-parent line${span > 1 ? " (merges whose own validation was canceled are included)" : ""}.` : "";
  const L = [`## Validation ${a.head.slice(0, 7)}`, "", `Base ${a.base.slice(0, 7) || "?"}${a["base-from"] ? ` (${a["base-from"]})` : ""} vs head ${a.head.slice(0, 7) || "?"}, each pair back to back on one runner.${spanText}${a.run ? ` [Run](${a.run})` : ""}`, ""];
  let red = false;
  const suites = [];
  // The plan's matrix (--matrix, its JSON): a job that uploaded nothing is named, and a missing suite shard counts as a failure.
  /** @type {string[]} */
  let expected = [];
  try { expected = a.matrix ? (JSON.parse(a.matrix).include ?? []).map((/** @type {any} */ j) => String(j.name)) : []; } catch { expected = []; }
  const missing = missingJobs(expected, jobs.map((d) => read(path.join(dir, d, "name.txt")).trim() || d.replace(/^validate-/, "")));
  for (const name of missing) {
    if (name.startsWith("suite-")) suites.push({ results: [{ name, result: "fail", failure: "the shard uploaded no artifact" }] });
    else { L.push(`### ${name}: no artifact (the job failed before uploading)`, ""); red = true; }
  }
  /** @type {Map<string, { name: string, base: ReturnType<typeof rssSummary>, head: ReturnType<typeof rssSummary>, exits: string[] }>} */
  const memory = new Map();
  for (const d of jobs) {
    const at = path.join(dir, d);
    const name = read(path.join(at, "name.txt")).trim() || d.replace(/^validate-/, "");
    if (name.startsWith("suite-")) {
      const r = json(path.join(at, "suite.json"));
      suites.push(r ?? { results: [{ name, result: "fail", failure: "the shard wrote no report" }] });
      continue;
    }
    if (name.startsWith("memory-")) {
      // One job per side (memory-40-base, memory-40-head) or both sides in one job (memory-40).
      const key = name.replace(/-(base|head)$/, "");
      const m = memory.get(key) ?? { name: key, base: null, head: null, exits: ["", ""] };
      for (const [i, side] of /** @type {const} */ (["base", "head"]).entries()) {
        const s = rssSummary(read(path.join(at, `${side}.rss`)));
        if (s) m[side] = s;
        const exit = read(path.join(at, `${side}.exit`)).trim();
        if (exit) m.exits[i] = exit;
      }
      memory.set(key, m);
      continue;
    }
    const files = fs.readdirSync(at);
    const side = (/** @type {string} */ s) => files.filter((f) => new RegExp(`^${s}(-\\d+)?\\.json$`).test(f)).map((f) => json(path.join(at, f))).filter(Boolean);
    const bases = side("base"), heads = side("head");
    const counts = [...new Set([...bases, ...heads].flatMap((r) => Object.keys(r.perf ?? {})))];
    if (!counts.length) {
      L.push(`### ${name}: no report (the soak did not finish)`, "");
      red = true;
      continue;
    }
    for (const count of counts) {
      const b = sideOf(bases, count), h = sideOf(heads, count);
      const result = compare(b, h);
      if (result.status !== "ok") red = true;
      L.push(markdown(count, b, h, result).replace(/^### /, `### ${name}, `), "");
      const details = profileDetails(heads[0]?.perf?.[count], bases[0]?.perf?.[count]);
      if (details.length) L.push(`<details><summary>${name}, ${count}: CPU, watchdog, tick histogram, worst ticks${heads[0]?.perf?.[count]?.bundle?.byPath ? ", per pack" : ""}</summary>`, "", ...details, "", "</details>", "");
    }
    const over = (read(path.join(at, "head.out")) || read(path.join(at, "head-1.out"))).split("\n").filter((l) => /^(OVER BUDGET|INVALID)/.test(l));
    if (over.length) L.push("<details><summary>Head against the budget</summary>", "", ...over.map((l) => `- ${l}`), "", "</details>", "");
  }
  if (memory.size) {
    const f = (/** @type {number | undefined} */ v) => (v === undefined ? "-" : v.toFixed(0));
    L.push("### Memory (bedrock_server RSS, MB, unprofiled)", "", "| run | side | minutes | start | at 10 min | end | max | growth from 10 min | exit |", "|---|---|---:|---:|---:|---:|---:|---:|---|");
    for (const m of memory.values()) for (const [i, side] of /** @type {const} */ (["base", "head"]).entries()) {
      const s = m[side];
      L.push(`| ${m.name} | ${side} | ${s ? s.minutes.toFixed(0) : "-"} | ${f(s?.start)} | ${f(s?.at10)} | ${f(s?.end)} | ${f(s?.max)} | ${s ? `${s.growth >= 0 ? "+" : ""}${s.growth.toFixed(0)}` : "-"} | ${m.exits[i] || "-"} |`);
      if (!s || m.exits[i] !== "0") red = true;
    }
    L.push("");
  }
  if (suites.length) {
    const s = suiteSummary(suites);
    if (s.red) red = true;
    L.push(`### Scenarios: ${["pass", "flaky", "fail", "timeout", "skipped"].map((k) => `${s.counts[k] ?? 0} ${k}`).join(", ")} (${suites.length} shard(s), longest ${(s.wall / 60).toFixed(1)} min)`, "");
    for (const x of s.failures) L.push(`- ${x}`);
    if (s.failures.length) L.push("");
    if (s.flaky.length) L.push("Flaky (failed, then passed rerun alone):", "", ...s.flaky.map((x) => `- ${x}`), "");
    const history = flakyHistory(a.times ? json(a.times) : null, s.flaky.map((x) => x.split(":")[0]), s.results.length);
    if (history.top.length) L.push(`Flaky most often over the last ${history.runs.length} validation(s): ${history.top.map((t) => `${t.name} (${t.times})`).join(", ")}`, "");
    if (a.times) fs.writeFileSync(a.times, JSON.stringify({ date: new Date().toISOString(), results: s.results, flakyRuns: history.runs }));
  }
  if (!jobs.length) {
    L.push("No results: every validation job failed before writing its artifact.");
    red = true;
  }
  let text = `${L.join("\n")}\n`;
  // An issue body holds 65,536 characters: past that, keep the comparisons and drop the profile details.
  if (text.length > 64000) text = `${text.replace(/<details><summary>[^<\n]*: CPU, watchdog[\s\S]*?<\/details>\n\n/g, "")}\nProfile details left out (the issue would be too long): see the run's artifacts.\n`;
  fs.writeFileSync(a.out, text);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${red ? "red" : "ok"}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
