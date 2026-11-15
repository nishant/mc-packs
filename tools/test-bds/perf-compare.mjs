#!/usr/bin/env node
// Compares perf soaks of a base and a head tree run back to back on the same machine (CI's PR perf check and the
// post-release A/B), because machines differ by 10-40% (perf-after-2026-10-20.md, F55) and only a same-machine pair
// says whether a change made things slower. Inputs are suite.mjs --perf --json reports; with several per side (a
// rerun, or validate.yml's base, head, head, base), each figure is read two ways: the side's lowest value and its mean.
// A change counts only when both cross the bars, so one noisy run can't fail a PR, and the mean catches a head that is
// slower every time but once (PIPE-07 (1)).
//   node tools/test-bds/perf-compare.mjs --base a.json [--base a2.json] --head b.json [--head b2.json]
//        [--rel 0.15] [--abs 0.5] [--pack-rel 0.5] [--pack-abs <ms>] [--markdown <out.md>]
// A regression: the steady-window bundle ms/tick is more than --rel higher AND more than --abs ms higher, or one
// pack's ms/tick is more than --pack-rel higher AND more than its absolute bar higher. Both bars must be crossed:
// relative alone flags cheap packs whose Date.now() figures are whole-ms noise, absolute alone flags heavy packs'
// ordinary jitter. The per-pack absolute bar is scaled to that clock noise (PIPE-07 (4)): a pack's figure is a sum of
// whole milliseconds, so over T ticks it moves by about sqrt(ms/tick x T) / T; the bar is
// max(0.03, 3 x sqrt(ms/tick x T) / T) with T the window's ticks (0.03 ms for most packs over 300 s), and a flat 0.1 ms
// when the window's length is unknown. --pack-abs sets a flat bar instead. Per pack means the steady figure of each
// script context, or, for the one-context Realm Bundle, its callbacks grouped by `scripts/<pack>/` path (whole run).
// A head whose soak scenario failed (a check, script errors) is red whatever its figures (status "failed").
// It prints a markdown table (and appends it to $GITHUB_STEP_SUMMARY when set).
// Exit 0: no regression; 1: regression or a failed head scenario; 2: a side has no valid measurement (INVALID soak:
// rerun, never a pass).
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{ valid: boolean, runs: number, bundle: number | null, bundleMean: number | null, tps: number | null, cpu: number | null,
 *   packs: Map<string, number>, packMeans: Map<string, number>, incomplete: Set<string>, ticks: number | null, byPath: boolean,
 *   failed: string[] }} Side
 */

const mean = (/** @type {number[]} */ xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * One player count from several suite --perf --json reports: valid when any report's soak was accepted; figures are
 * the lowest (and the mean) over the valid reports. `failed` names the runs whose scenario did not pass (suite.mjs
 * records how each soak ended in `runs`), accepted or not.
 * @param {any[]} reports
 * @param {string} count
 * @returns {Side}
 */
export function sideOf(reports, count) {
  const failed = reports.map((r) => r?.runs?.[count]).filter((x) => x && x.result && x.result !== "pass").map((x) => `${x.result}${x.code !== null && x.code !== undefined ? ` (exit ${x.code})` : ""}${x.failure ? `: ${String(x.failure).replace(/\s+/g, " ").slice(0, 160)}` : ""}`);
  const runs = reports.map((r) => r?.perf?.[count]).filter((x) => x && x.acceptance?.ok === true);
  /** @type {Map<string, number[]>} */
  const perPack = new Map();
  /** Pack names a run lists, with or without a finite figure. */
  const listed = new Set();
  const bundles = [], cpus = [], tpss = [], tickList = [];
  let byPath = false;
  for (const run of runs) {
    const c = run.process?.cpuMsPerTick;
    if (Number.isFinite(c)) cpus.push(c);
    const b = run.bundle?.steadyWindow?.avg;
    if (Number.isFinite(b)) bundles.push(b);
    const t = run.server?.tps;
    if (Number.isFinite(t)) tpss.push(t);
    // The one-context bundle lists one script context: its per-pack figures are the callbacks by scripts/<pack>/ path.
    const paths = Array.isArray(run.bundle?.byPath) && Object.keys(run.packs ?? {}).length <= 1 ? run.bundle.byPath : null;
    if (paths) {
      byPath = true;
      const ticks = run.bundle?.perTick?.ticks;
      if (Number.isFinite(ticks)) tickList.push(ticks);
      for (const p of paths) {
        listed.add(p.pack);
        if (Number.isFinite(p.msPerTick)) perPack.set(p.pack, [...(perPack.get(p.pack) ?? []), p.msPerTick]);
      }
      continue;
    }
    const ticks = run.bundle?.steadyWindow?.ticks;
    if (Number.isFinite(ticks)) tickList.push(ticks);
    for (const [pack, f] of Object.entries(run.packs ?? {})) {
      listed.add(pack);
      const v = /** @type {any} */ (f)?.steady;
      if (Number.isFinite(v)) perPack.set(pack, [...(perPack.get(pack) ?? []), v]);
    }
  }
  /** @type {Map<string, number>} */
  const packs = new Map(), packMeans = new Map();
  for (const [pack, vs] of perPack) { packs.set(pack, Math.min(...vs)); packMeans.set(pack, /** @type {number} */ (mean(vs))); }
  const incomplete = new Set([...listed].filter((n) => !packs.has(n)));
  return {
    valid: runs.length > 0 && bundles.length > 0, runs: runs.length,
    bundle: bundles.length ? Math.min(...bundles) : null, bundleMean: mean(bundles),
    tps: tpss.length ? Math.max(...tpss) : null, cpu: cpus.length ? Math.min(...cpus) : null,
    packs, packMeans, incomplete, ticks: tickList.length ? Math.min(...tickList) : null, byPath, failed,
  };
}

/**
 * The per-pack absolute bar: max(0.03, 3 x sqrt(ms/tick x ticks) / ticks), or 0.1 when the window is unknown.
 * @param {number} msPerTick the larger side's figure @param {number | null} ticks
 */
export function packBar(msPerTick, ticks) {
  if (!Number.isFinite(ticks) || !ticks) return 0.1;
  return Math.max(0.03, (3 * Math.sqrt(Math.max(0, msPerTick) * /** @type {number} */ (ticks))) / /** @type {number} */ (ticks));
}

/**
 * @param {Side} base
 * @param {Side} head
 * @param {{ rel?: number, abs?: number, packRel?: number, packAbs?: number | null }} [bars] packAbs: a flat per-pack bar (null: scaled to the clock noise)
 */
export function compare(base, head, { rel = 0.15, abs = 0.5, packRel = 0.5, packAbs = null } = {}) {
  if (head.failed?.length) return { status: "failed", regressions: [], rows: [], reason: `the head's soak scenario failed: ${head.failed.join("; ")}` };
  if (!base.valid || !head.valid) return { status: "invalid", regressions: [], rows: [], reason: "no accepted soak on a side" };
  // A pack with a figure on one side that the other side lists without one is a gap, not 0 ms. A pack not listed at all is new or removed.
  const gaps = [...new Set([...base.packs.keys(), ...head.packs.keys()])].filter((n) => (base.packs.has(n) && head.incomplete.has(n)) || (head.packs.has(n) && base.incomplete.has(n))).sort();
  if (gaps.length) return { status: "invalid", regressions: [], rows: [], reason: `missing per-pack figure for ${gaps.join(", ")}` };
  const worse = (/** @type {number} */ b, /** @type {number} */ h, /** @type {number} */ r, /** @type {number} */ a) => h - b > a && h > b * (1 + r);
  const regressions = [];
  const rows = [];
  const bb = /** @type {number} */ (base.bundle), hb = /** @type {number} */ (head.bundle);
  const bm = base.bundleMean ?? bb, hm = head.bundleMean ?? hb;
  const bundleWorse = worse(bb, hb, rel, abs) && worse(bm, hm, rel, abs);
  rows.push({ name: "whole bundle", base: bb, head: hb, baseMean: bm, headMean: hm, bar: abs, worse: bundleWorse });
  if (bundleWorse) regressions.push(`whole bundle ${bb.toFixed(3)} -> ${hb.toFixed(3)} ms/tick (+${(100 * (hb / bb - 1)).toFixed(0)}%; means ${bm.toFixed(3)} -> ${hm.toFixed(3)})`);
  const ticks = base.ticks !== null && head.ticks !== null ? Math.min(base.ticks, head.ticks) : base.ticks ?? head.ticks;
  const names = [...new Set([...base.packs.keys(), ...head.packs.keys()])];
  for (const name of names.sort((x, y) => (head.packs.get(y) ?? 0) - (head.packs.get(x) ?? 0))) {
    const b = base.packs.get(name) ?? 0, h = head.packs.get(name) ?? 0;
    const bMean = base.packMeans.get(name) ?? b, hMean = head.packMeans.get(name) ?? h;
    const bar = packAbs ?? packBar(Math.max(b, h, bMean, hMean), ticks);
    const w = worse(b, h, packRel, bar) && worse(bMean, hMean, packRel, bar);
    rows.push({ name, base: b, head: h, baseMean: bMean, headMean: hMean, bar, worse: w });
    if (w) regressions.push(`${name} ${b.toFixed(3)} -> ${h.toFixed(3)} ms/tick${b > 0 ? ` (+${(100 * (h / b - 1)).toFixed(0)}%)` : " (new)"}, bar ${bar.toFixed(3)}`);
  }
  return { status: regressions.length ? "regression" : "ok", regressions, rows, reason: "" };
}

/**
 * The A/A noise of one comparison (validate.yml with base equal to head): each figure's head minus base, by lows and
 * by means. Stored by the report and printed next to every later comparison of the same job and count (PIPE-07 (2)).
 * @param {ReturnType<typeof compare>} result
 */
export function spreadOf(result) {
  if (result.status !== "ok" && result.status !== "regression") return null;
  const w = result.rows[0];
  const pct = (/** @type {number} */ b, /** @type {number} */ h) => (b > 0 ? 100 * (h / b - 1) : 0);
  const packs = result.rows.slice(1).map((r) => Math.max(Math.abs(r.head - r.base), Math.abs(r.headMean - r.baseMean)));
  return {
    bundlePct: pct(w.base, w.head), bundleMeanPct: pct(w.baseMean, w.headMean), bundleMs: w.head - w.base,
    packMaxMs: packs.length ? Math.max(...packs) : 0, packs: result.rows.length - 1,
    packOver: Object.fromEntries(result.rows.slice(1).filter((r) => Math.abs(r.head - r.base) >= 0.01).map((r) => [r.name, Math.round((r.head - r.base) * 1e4) / 1e4])),
  };
}

const sign = (/** @type {number} */ v, d = 0) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;

/** @param {any} aa a stored spread: { sha, date, run, spread } */
export function spreadLine(aa) {
  if (!aa?.spread) return "A/A spread: none yet (the weekly A/A run of validate.yml, base equal to head, sets it).";
  const s = aa.spread;
  return `A/A spread (identical trees, ${aa.date ? String(aa.date).slice(0, 10) : "?"}${aa.run ? `, [run](${aa.run})` : ""}): whole bundle ${sign(s.bundlePct)}% by lows, ${sign(s.bundleMeanPct)}% by means; the largest pack difference ${s.packMaxMs.toFixed(3)} ms over ${s.packs} pack(s). Read a change against this.`;
}

/**
 * @param {string} count @param {Side} base @param {Side} head @param {ReturnType<typeof compare>} result @param {number} [top]
 * @param {any} [aa] the stored A/A spread of this job and count
 */
export function markdown(count, base, head, result, top = 15, aa = undefined) {
  const f = (/** @type {number | null} */ v) => (v === null || !Number.isFinite(v) ? "-" : v.toFixed(3));
  const status = { ok: "no regression", invalid: "INVALID (no accepted soak on a side)", failed: "FAILED (the head's soak scenario failed)", regression: "REGRESSION" }[result.status] ?? result.status;
  const L = [`### ${/^\d+$/.test(count) ? `${count} players` : count}: ${status}`, ""];
  if (result.status === "invalid" || result.status === "failed") {
    L.push(`base valid: ${base.valid}, head valid: ${head.valid}`, "");
    if (result.reason) L.push(`Reason: ${result.reason}`, "");
    return L.join("\n");
  }
  if (base.failed?.length) L.push(`The base's soak scenario failed too (not judged): ${base.failed.join("; ")}`, "");
  const many = base.runs > 1 || head.runs > 1;
  L.push(`TPS base ${f(base.tps)} / head ${f(head.tps)}; bedrock_server CPU ms/tick (engine included, whole run) base ${f(base.cpu ?? null)} / head ${f(head.cpu ?? null)}; ${head.byPath ? "the bundle row over the steady window, packs by `scripts/<pack>/` path over the whole run" : "steady soak window"}, ${many ? `lowest and mean of ${base.runs} base and ${head.runs} head run(s); a change counts when both cross the bars` : "one run each"}.`, "");
  if (aa !== undefined) L.push(spreadLine(aa), "");
  if (many) {
    L.push("| | base ms/tick | head ms/tick | change | base mean | head mean | change | bar | |", "|---|---:|---:|---:|---:|---:|---:|---:|---|");
  } else {
    L.push("| | base ms/tick | head ms/tick | change | bar | |", "|---|---:|---:|---:|---:|---|");
  }
  const ch = (/** @type {number} */ b, /** @type {number} */ h) => `${sign(h - b, 3)}${b > 0 ? ` (${sign(100 * (h / b - 1))}%)` : ""}`;
  for (const r of result.rows.slice(0, top + 1)) {
    const mid = many ? ` | ${f(r.baseMean)} | ${f(r.headMean)} | ${ch(r.baseMean, r.headMean)}` : "";
    L.push(`| ${r.name} | ${f(r.base)} | ${f(r.head)} | ${ch(r.base, r.head)}${mid} | ${r.bar.toFixed(3)} | ${r.worse ? "**slower**" : ""} |`);
  }
  const rest = result.rows.length - top - 1;
  if (rest > 0) L.push("", `${rest} cheaper pack(s) not shown.`);
  for (const x of result.regressions) L.push("", `- REGRESSION: ${x}`);
  return L.join("\n");
}

function main() {
  const { values: a } = parseArgs({
    options: {
      base: { type: "string", multiple: true }, head: { type: "string", multiple: true },
      rel: { type: "string", default: "0.15" }, abs: { type: "string", default: "0.5" },
      "pack-rel": { type: "string", default: "0.5" }, "pack-abs": { type: "string" }, markdown: { type: "string" },
      top: { type: "string", default: "15" },
    },
  });
  const read = (/** @type {string[] | undefined} */ files) => (files ?? []).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const bases = read(a.base), heads = read(a.head);
  const counts = [...new Set([...bases, ...heads].flatMap((r) => Object.keys(r?.perf ?? {})))].sort((x, y) => Number(x) - Number(y));
  const bars = { rel: Number(a.rel), abs: Number(a.abs), packRel: Number(a["pack-rel"]), packAbs: a["pack-abs"] === undefined ? null : Number(a["pack-abs"]) };
  let worst = counts.length ? 0 : 2;
  const out = [];
  for (const count of counts) {
    const base = sideOf(bases, count), head = sideOf(heads, count);
    const result = compare(base, head, bars);
    out.push(markdown(count, base, head, result, Number(a.top) || 15));
    worst = Math.max(worst, result.status === "invalid" ? 2 : result.status === "regression" || result.status === "failed" ? 1 : 0);
  }
  if (!counts.length) out.push("No perf report to compare (both sides missing).");
  const text = `${out.join("\n\n")}\n`;
  console.log(text);
  if (a.markdown) fs.writeFileSync(a.markdown, text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  process.exit(worst);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
