#!/usr/bin/env node
// The post-release report of .github/workflows/validate.yml: reads every validate-<name> artifact (soak, bundle and
// scenario pairs as suite --perf --json reports, base-<n>/head-<n> for repeats; memory RSS samples, one side per job
// for memory-<n>-base / -head; suite shard reports) and writes one markdown report:
// the same-runner comparisons (tools/test-bds/perf-compare.mjs), the head's budget lines, the memory curve and the
// scenario totals. It also writes the scenario seconds (--times, a suite --json shape) for pr-tests.yml's shards.
//   node tools/test-bds/validate-report.mjs --dir <artifacts> --base <sha> --head <sha> [--run <url>] --out report.md [--times t.json]
// Sets `status` in $GITHUB_OUTPUT: ok, or red when a scenario failed or timed out, a pair regressed, or a soak gave
// no valid measurement (an INVALID soak is never a pass).
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
  const rows = text.split("\n").map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => r.length === 2 && r.every(Number.isFinite) && r[1] > 0);
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
  const results = [];
  let wall = 0;
  for (const r of reports) {
    wall = Math.max(wall, r.wallSeconds ?? 0);
    for (const x of r.results ?? []) {
      if (!x) continue;
      counts[x.result] = (counts[x.result] ?? 0) + 1;
      results.push({ name: x.name, seconds: x.seconds });
      if (x.result === "fail" || x.result === "timeout") failures.push(`${x.name}: ${x.result}${x.failure ? ` - ${String(x.failure).replace(/\s+/g, " ").slice(0, 160)}` : ""}`);
    }
  }
  return { counts, failures, results, wall, red: failures.length > 0 };
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
  const { values: a } = parseArgs({ options: { dir: { type: "string" }, base: { type: "string", default: "" }, head: { type: "string", default: "" }, run: { type: "string", default: "" }, out: { type: "string", default: "report.md" }, times: { type: "string" } } });
  const dir = path.resolve(a.dir ?? ".");
  const jobs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => d.startsWith("validate-")).sort() : [];
  const L = [`## Validation ${a.head.slice(0, 7)}`, "", `Base ${a.base.slice(0, 7) || "?"} vs head ${a.head.slice(0, 7) || "?"}, each pair back to back on one runner.${a.run ? ` [Run](${a.run})` : ""}`, ""];
  let red = false;
  const suites = [];
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
      if (!s) red = true;
    }
    L.push("");
  }
  if (suites.length) {
    const s = suiteSummary(suites);
    if (s.red) red = true;
    L.push(`### Scenarios: ${["pass", "flaky", "fail", "timeout", "skipped"].map((k) => `${s.counts[k] ?? 0} ${k}`).join(", ")} (${suites.length} shard(s), longest ${(s.wall / 60).toFixed(1)} min)`, "");
    for (const x of s.failures) L.push(`- ${x}`);
    if (s.failures.length) L.push("");
    if (a.times) fs.writeFileSync(a.times, JSON.stringify({ date: new Date().toISOString(), results: s.results }));
  }
  if (!jobs.length) {
    L.push("No results: every validation job failed before writing its artifact.");
    red = true;
  }
  const text = `${L.join("\n")}\n`;
  fs.writeFileSync(a.out, text);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${red ? "red" : "ok"}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
