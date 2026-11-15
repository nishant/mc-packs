#!/usr/bin/env node
// The post-release report of .github/workflows/validate.yml: reads every validate-<name> artifact (soak, bundle and
// scenario pairs as suite --perf --json reports, base-<n>/head-<n> for repeats; memory RSS samples, one side per job
// for memory-<n>-base / -head; suite shard reports) and writes one markdown report:
// the same-runner comparisons (tools/test-bds/perf-compare.mjs), the head's budget lines, the memory curve and the
// scenario totals. It also writes the scenario seconds (--times, a suite --json shape) for pr-tests.yml's shards.
// Each soak also gets a details block from the head's profile: bedrock_server CPU, watchdog lines, the steady window's
// tick histogram and worst ticks, each phase's worst ticks and, for the one-context bundle, per-pack rows by path; a
// soak with phases (perf-soak phases=1) gets a phase table, and the suite's profiled scenarios a table each (PIPE-10).
// --matrix (the plan's matrix JSON) names the jobs that uploaded nothing; a missing suite shard counts as a failure.
//   node tools/test-bds/validate-report.mjs --dir <artifacts> --base <sha> --head <sha> [--run <url>] [--matrix <json>] --out report.md [--times t.json]
// Sets `status` in $GITHUB_OUTPUT: ok, or red when a scenario failed or timed out, a pair regressed, a soak gave
// no valid measurement (an INVALID soak is never a pass), or a memory side has no RSS samples or an exit code that is
// missing or not 0.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { compare, markdown, sideOf, spreadOf } from "./perf-compare.mjs";

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
      // A profiled scenario's figures (PIPE-10): the clean rerun's when it was retried.
      const perf = x.retry?.perf ?? x.perf;
      results.push({ name: x.name, seconds: x.seconds, ...(perf ? { perf } : {}) });
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

const ms = (/** @type {any} */ v) => (typeof v === "number" && Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "-");

/**
 * Every phase of one soak (perf-soak phases=1: empty, one, ramp, steady, churn, night) as a table: players, ticks, the
 * base's and the head's average, and the head's percentiles and slowest tick, plus the pinned world and the churn
 * counts. The steady window is the one the comparison above and acceptance judge.
 * @param {any} head one player count of a suite --perf --json report (head side) @param {any} [base]
 */
export function phaseTable(head, base = null) {
  const phases = head?.bundle?.phases ?? [];
  if (!phases.length) return [];
  const baseOf = (/** @type {string} */ n) => (base?.bundle?.phases ?? []).find((/** @type {any} */ p) => p.name === n)?.bundle?.avg ?? (n === "steady" ? base?.bundle?.steadyWindow?.avg : undefined);
  const L = ["| phase | players | ticks | base avg | head avg | p50 | p95 | p99 | max | ticks over 50 ms |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"];
  for (const ph of phases) {
    const b = ph.bundle ?? {};
    L.push(`| ${ph.name}${ph.name === "steady" ? " (judged)" : ""} | ${ph.players ?? "-"} | ${b.ticks ?? "-"} | ${n3(baseOf(ph.name))} | ${n3(b.avg)} | ${ms(b.p50)} | ${ms(b.p95)} | ${ms(b.p99)} | ${ms(b.max)} | ${b.over50 ?? "-"} |`);
  }
  const w = head.workload ?? {};
  const world = w.world;
  if (world) L.push("", `World: time ${world.time >= 0 ? world.time : "running"}, weather ${world.weather}; over the steady window the time went ${world.start?.timeOfDay ?? "?"} -> ${world.end?.timeOfDay ?? "?"} and the weather ${world.start?.weather ?? "?"} -> ${world.end?.weather ?? "?"}.`);
  const c = w.churn;
  if (c) L.push("", `Churn (not judged; its players are not counted against retention): ${c.left} left and ${c.rejoined} rejoined${c.rejoinFailed ? ` (${c.rejoinFailed} could not)` : ""}, ${c.deaths} deaths and ${c.respawns} respawns, ${c.dimensionChanges} dimension changes, ${c.broken} blocks broken and ${c.placed} placed, ${c.mobsKilled} of ${c.mobsSummoned} summoned mobs killed, menus ${(c.menus ?? []).join(", ") || "none"}; fewest players in the world ${c.minValid}, at the end ${c.endValid}.`);
  if (w.night) L.push("", `Night: ${w.night.start?.timeOfDay ?? "?"} -> ${w.night.end?.timeOfDay ?? "?"}, weather ${w.night.start?.weather ?? "?"} -> ${w.night.end?.weather ?? "?"}, fewest players ${w.night.minValid}.`);
  return L;
}

/**
 * The profiled scenarios of the suite shards (PIPE-10), one table each: the bundle's whole-run and steady figures, the
 * previous validation's figure for the same scenario (another runner: a trend line, not a gate), each phase, and the
 * dearest packs.
 * @param {{ name: string, perf?: any }[]} results @param {any} [previous] the times file as it was
 */
export function scenarioPerfTables(results, previous = null) {
  const before = new Map((previous?.results ?? []).filter((/** @type {any} */ r) => r?.perf).map((/** @type {any} */ r) => [r.name, r.perf]));
  const L = [];
  for (const r of [...results].filter((x) => x.perf).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = r.perf, prev = before.get(r.name);
    const main = p.steady ?? p.whole;
    const prevMain = prev ? (prev.steady ?? prev.whole)?.avg : undefined;
    L.push(`**${r.name}**: ${n3(main?.avg)} ms/tick ${p.steady ? "over the steady window" : "over the whole run"} (p95 ${ms(main?.p95)} / p99 ${ms(main?.p99)} / max ${ms(main?.max)} ms, ${main?.ticks ?? "-"} ticks); whole run ${n3(p.msPerTick)}; previous validation ${n3(prevMain)}; bedrock_server ${n3(p.cpuMsPerTick)} CPU ms/tick${p.acceptance === false ? "; its acceptance FAILED" : ""}`, "");
    if (p.phases?.length) L.push(`Phases: ${p.phases.map((/** @type {any} */ ph) => `${ph.name} ${n3(ph.avg)} (p95 ${ms(ph.p95)}, max ${ms(ph.max)})`).join("; ")}`, "");
    L.push("| pack | ms/tick | steady | p95 | max |", "|---|---:|---:|---:|---:|");
    for (const x of p.packs ?? []) L.push(`| ${x.pack} | ${n3(x.msPerTick)} | ${n3(x.steady)} | ${x.p95 ?? "-"} | ${x.max ?? "-"} |`);
    L.push("");
  }
  return L;
}

/**
 * The listener job (examples/listener-cost.js under --meter): each side's mean bedrock_server CPU ms/tick for idle,
 * noop: and realm: events, and from them one send and one listener wake-up in microseconds (PIPE-03 (2), XC-01).
 * @param {{ side: string, variant: string, json: any }[]} runs meter JSONs, `<side>-<variant>-<r>.json`
 */
export function listenerCost(runs) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const side of ["base", "head"]) {
    /** @type {Record<string, number[]>} */
    const cpu = { idle: [], noop: [], realm: [] };
    let rate = 0, members = 0;
    for (const r of runs.filter((x) => x.side === side)) {
      const c = r.json?.process?.cpuMsPerTick;
      const rep = r.json?.reports?.["listener-cost"];
      if (!Number.isFinite(c) || !rep || !(r.variant in cpu)) continue;
      cpu[r.variant].push(c);
      if (rep.rate > 0) rate = rep.rate;
      if (rep.members > 0) members = rep.members;
    }
    const m = (/** @type {number[]} */ xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const idle = m(cpu.idle), noop = m(cpu.noop), realm = m(cpu.realm);
    const wakeUs = realm !== null && noop !== null && rate > 0 && members > 0 ? (1000 * (realm - noop)) / (rate * members) : null;
    const sendUs = noop !== null && idle !== null && rate > 0 ? (1000 * (noop - idle)) / rate : null;
    out[side] = { idle, noop, realm, rate, members, wakeUs, sendUs, runs: { idle: cpu.idle.length, noop: cpu.noop.length, realm: cpu.realm.length } };
  }
  return out;
}

/** @param {ReturnType<typeof listenerCost>} c */
export function listenerTable(c) {
  const us = (/** @type {any} */ v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "-");
  const L = ["| side | idle | noop: events | realm: events | one send (us) | one listener wake-up (us) | listeners | runs |", "|---|---:|---:|---:|---:|---:|---:|---|"];
  for (const side of ["base", "head"]) {
    const s = c[side];
    if (s) L.push(`| ${side} | ${n3(s.idle)} | ${n3(s.noop)} | ${n3(s.realm)} | ${us(s.sendUs)} | ${us(s.wakeUs)} | ${s.members || "-"} | ${s.runs.idle}/${s.runs.noop}/${s.runs.realm} |`);
  }
  const h = c.head;
  if (h && Number.isFinite(h.wakeUs)) L.push("", `One script event wakes ${h.members} listeners in the bundle: ${us(h.wakeUs)} us each, ${n3((h.wakeUs * h.members) / 1000)} ms per event sent (head). An event sent once a tick costs that much per tick.`);
  return L;
}

/**
 * A/A spreads and the drift baseline kept between runs (perf-history.json, cached like suite-times.json): this run's
 * spreads replace the stored ones when it is an A/A run, and its heads become the baseline when none is pinned yet or
 * `pin` is set.
 * @param {any} previous @param {{ aa: boolean, pin: boolean, sha: string, run: string, spreads: Record<string, any>, heads: Record<string, any> }} o
 */
export function nextHistory(previous, o) {
  const date = new Date().toISOString();
  const aa = { ...(previous?.aa ?? {}) };
  if (o.aa) for (const [k, spread] of Object.entries(o.spreads)) if (spread) aa[k] = { sha: o.sha, date, run: o.run, spread };
  const pinNow = (o.pin || !previous?.baseline?.jobs) && Object.keys(o.heads).length > 0;
  const baseline = pinNow ? { sha: o.sha, date, run: o.run, jobs: o.heads } : previous?.baseline ?? null;
  return { aa, baseline, pinned: pinNow };
}

/**
 * Drift of this run's heads from the pinned baseline (another runner, so a trend, never a gate; PIPE-07 (3)): the
 * whole bundle, CPU and the packs that moved most, flagged when the change is beyond the A/A spread.
 * @param {any} baseline @param {Record<string, any>} heads @param {Record<string, any>} aa
 */
export function driftTable(baseline, heads, aa) {
  if (!baseline?.jobs) return [];
  const L = [`Against the pinned baseline ${String(baseline.sha ?? "?").slice(0, 7)} (${String(baseline.date ?? "?").slice(0, 10)}${baseline.run ? `, [run](${baseline.run})` : ""}): the head of each job then and now, on different runners (runners differ by 10-40%: a trend, not a gate). "beyond A/A" marks a change larger than that job's A/A spread.`, "", "| job | figure | baseline | now | change | |", "|---|---|---:|---:|---:|---|"];
  const pct = (/** @type {number} */ b, /** @type {number} */ h) => (b > 0 ? `${h >= b ? "+" : ""}${(100 * (h / b - 1)).toFixed(0)}%` : "new");
  for (const [k, now] of Object.entries(heads)) {
    const then = baseline.jobs[k];
    if (!then) continue;
    const s = aa?.[k]?.spread;
    const beyond = (/** @type {number} */ b, /** @type {number} */ h, /** @type {boolean} */ pack) => (s ? (pack ? Math.abs(h - b) > Math.max(0.01, s.packMaxMs) : b > 0 && Math.abs(100 * (h / b - 1)) > Math.max(Math.abs(s.bundlePct), Math.abs(s.bundleMeanPct))) : false);
    if (Number.isFinite(then.bundle) && Number.isFinite(now.bundle)) L.push(`| ${k} | whole bundle | ${n3(then.bundle)} | ${n3(now.bundle)} | ${pct(then.bundle, now.bundle)} | ${beyond(then.bundle, now.bundle, false) ? "beyond A/A" : ""} |`);
    if (Number.isFinite(then.cpu) && Number.isFinite(now.cpu)) L.push(`| ${k} | CPU ms/tick | ${n3(then.cpu)} | ${n3(now.cpu)} | ${pct(then.cpu, now.cpu)} | |`);
    const names = [...new Set([...Object.keys(then.packs ?? {}), ...Object.keys(now.packs ?? {})])];
    const moved = names.map((n) => ({ n, b: then.packs?.[n] ?? 0, h: now.packs?.[n] ?? 0 })).filter((x) => Math.abs(x.h - x.b) >= 0.01).sort((x, y) => Math.abs(y.h - y.b) - Math.abs(x.h - x.b)).slice(0, 8);
    for (const x of moved) L.push(`| ${k} | ${x.n} | ${n3(x.b)} | ${n3(x.h)} | ${pct(x.b, x.h)} | ${beyond(x.b, x.h, true) ? "beyond A/A" : ""} |`);
  }
  return L.length > 4 ? L : [];
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
  const { values: a } = parseArgs({ options: { dir: { type: "string" }, base: { type: "string", default: "" }, head: { type: "string", default: "" }, run: { type: "string", default: "" }, out: { type: "string", default: "report.md" }, times: { type: "string" }, matrix: { type: "string" }, span: { type: "string", default: "" }, "base-from": { type: "string", default: "" }, history: { type: "string" }, aa: { type: "boolean", default: false }, pin: { type: "boolean", default: false } } });
  // --history: A/A spreads and the pinned drift baseline (read, then written back with this run's); --aa: this run's
  // base is its head, so every pair is noise and its differences become the A/A spread; --pin: re-pin the baseline here.
  const history = a.history ? json(a.history) : null;
  /** @type {Record<string, any>} */
  const spreads = {};
  /** @type {Record<string, any>} */
  const headFigures = {};
  const dir = path.resolve(a.dir ?? ".");
  const jobs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((d) => d.startsWith("validate-")).sort() : [];
  const span = Number(a.span);
  const spanText = Number.isFinite(span) && span > 0 ? ` The pair spans ${span} commit${span === 1 ? "" : "s"} on master's first-parent line${span > 1 ? " (merges whose own validation was canceled are included)" : ""}.` : "";
  const L = [`## ${a.aa ? "A/A validation" : "Validation"} ${a.head.slice(0, 7)}`, "", ...(a.aa ? ["An A/A run: the base is the head itself, so every difference below is noise. Its spreads are printed next to every later comparison of the same job.", ""] : []), `Base ${a.base.slice(0, 7) || "?"}${a["base-from"] ? ` (${a["base-from"]})` : ""} vs head ${a.head.slice(0, 7) || "?"}, each pair back to back on one runner.${spanText}${a.run ? ` [Run](${a.run})` : ""}`, ""];
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
  /** @type {Map<string, { name: string, base: ReturnType<typeof rssSummary>, head: ReturnType<typeof rssSummary>, exits: string[], meters: any[] }>} */
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
      const m = memory.get(key) ?? { name: key, base: null, head: null, exits: ["", ""], meters: [null, null] };
      for (const [i, side] of /** @type {const} */ (["base", "head"]).entries()) {
        const s = rssSummary(read(path.join(at, `${side}.rss`)));
        if (s) m[side] = s;
        const exit = read(path.join(at, `${side}.exit`)).trim();
        if (exit) m.exits[i] = exit;
        // run.mjs --meter (PIPE-03 (1)): the unprofiled run's TPS, tick interval and CPU.
        const meter = json(path.join(at, `${side}.meter.json`));
        if (meter) m.meters[i] = meter;
      }
      memory.set(key, m);
      continue;
    }
    const files = fs.readdirSync(at);
    if (name.startsWith("listener")) {
      // <side>-<variant>-<r>.json meter reports of examples/listener-cost.js, and native.out (the --native-profile pass).
      const runs = files.map((f) => /^(base|head)-(idle|noop|realm)-\d+\.json$/.exec(f)).filter((m) => m !== null).map((m) => ({ side: m[1], variant: m[2], json: json(path.join(at, m[0])) }));
      const c = listenerCost(runs);
      L.push(`### ${name}: script event listener wake-up (bedrock_server CPU ms/tick, unprofiled, idle bundle)`, "", ...listenerTable(c), "");
      if (!Number.isFinite(c.head?.wakeUs)) { L.push("No wake-up figure for the head (a run failed: see the job's .out files).", ""); red = true; }
      const native = read(path.join(at, "native.out")).split("\n");
      const from = native.findIndex((l) => l.startsWith("native profile:"));
      if (from >= 0) L.push("<details><summary>Native script profiler and watchdog statistics (--native-profile)</summary>", "", "```", ...native.slice(from, from + 60).filter((l) => /^(native profile:| {2}[|]| {2}file| {2}cpuprofile| {4})/.test(l)).map((l) => l.slice(0, 400)), "```", "", "</details>", "");
      continue;
    }
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
      const key = `${name}/${count}`;
      // An A/A regression is the bars catching noise (said in the text, not red); a failed or invalid soak is red.
      if (result.status !== "ok" && !(a.aa && result.status === "regression")) red = true;
      if (a.aa) spreads[key] = spreadOf(result);
      if (h.valid) headFigures[key] = { bundle: h.bundle, cpu: h.cpu, packs: Object.fromEntries([...h.packs].map(([k, v]) => [k, Math.round(v * 1e4) / 1e4])) };
      L.push(markdown(count, b, h, result, 15, a.history ? history?.aa?.[key] ?? null : undefined).replace(/^### /, `### ${name}, `), "");
      const phases = phaseTable(heads[0]?.perf?.[count], bases[0]?.perf?.[count]);
      if (phases.length) L.push(`Phases of ${name}, ${count} players (the head's figures; ms/tick summed over packs):`, "", ...phases, "");
      const details = profileDetails(heads[0]?.perf?.[count], bases[0]?.perf?.[count]);
      if (details.length) L.push(`<details><summary>${name}, ${count}: CPU, watchdog, tick histogram, worst ticks${heads[0]?.perf?.[count]?.bundle?.byPath ? ", per pack" : ""}</summary>`, "", ...details, "", "</details>", "");
    }
    const headOut = files.filter((f) => /^head(-\d+)?\.out$/.test(f)).sort()[0];
    const over = (headOut ? read(path.join(at, headOut)) : "").split("\n").filter((l) => /^(OVER BUDGET|INVALID)/.test(l));
    if (over.length) L.push("<details><summary>Head against the budget</summary>", "", ...over.map((l) => `- ${l}`), "", "</details>", "");
  }
  if (memory.size) {
    const f = (/** @type {number | undefined} */ v) => (v === undefined ? "-" : v.toFixed(0));
    L.push("### Memory (bedrock_server RSS, MB, unprofiled)", "", "| run | side | minutes | start | at 10 min | end | max | growth from 10 min | exit | CPU ms/tick | TPS | tick p95 / p99 / max ms |", "|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|");
    for (const m of memory.values()) for (const [i, side] of /** @type {const} */ (["base", "head"]).entries()) {
      const s = m[side];
      L.push(`| ${m.name} | ${side} | ${s ? s.minutes.toFixed(0) : "-"} | ${f(s?.start)} | ${f(s?.at10)} | ${f(s?.end)} | ${f(s?.max)} | ${s ? `${s.growth >= 0 ? "+" : ""}${s.growth.toFixed(0)}` : "-"} | ${m.exits[i] || "-"} | ${n3(m.meters[i]?.process?.cpuMsPerTick)} | ${m.meters[i]?.server ? m.meters[i].server.tps.toFixed(1) : "-"} | ${m.meters[i]?.server ? `${m.meters[i].server.tickIntervalP95Ms} / ${m.meters[i].server.tickIntervalP99Ms} / ${m.meters[i].server.tickIntervalMaxMs}` : "-"} |`);
      if (!s || m.exits[i] !== "0") red = true;
    }
    L.push("");
  }
  if (a.history) {
    const next = nextHistory(history, { aa: a.aa, pin: a.pin, sha: a.head, run: a.run, spreads, heads: headFigures });
    if (!a.aa) {
      const drift = driftTable(history?.baseline, headFigures, next.aa);
      if (drift.length) L.push("### Drift since the pinned baseline", "", ...drift, "");
    }
    if (next.pinned) L.push(`The drift baseline is pinned at this run (${a.head.slice(0, 7)}): later reports compare their heads with it.`, "");
    if (a.aa && Object.keys(spreads).length) L.push("These A/A spreads are stored: every later comparison of the same job prints them.", "");
    fs.writeFileSync(a.history, JSON.stringify(next, null, 2));
  }
  if (suites.length) {
    const s = suiteSummary(suites);
    if (s.red) red = true;
    L.push(`### Scenarios: ${["pass", "flaky", "fail", "timeout", "skipped"].map((k) => `${s.counts[k] ?? 0} ${k}`).join(", ")} (${suites.length} shard(s), longest ${(s.wall / 60).toFixed(1)} min)`, "");
    for (const x of s.failures) L.push(`- ${x}`);
    if (s.failures.length) L.push("");
    if (s.flaky.length) L.push("Flaky (failed, then passed rerun alone):", "", ...s.flaky.map((x) => `- ${x}`), "");
    const previous = a.times ? json(a.times) : null;
    const perfTables = scenarioPerfTables(s.results, previous);
    if (perfTables.length) L.push(`<details><summary>Scenario perf: ${s.results.filter((x) => x.perf).length} profiled scenarios of the suite (one run each on its shard's runner: a trend against the previous validation, not a gate)</summary>`, "", ...perfTables, "</details>", "");
    const history = flakyHistory(previous, s.flaky.map((x) => x.split(":")[0]), s.results.length);
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
