#!/usr/bin/env node
// Compares perf soaks of a base and a head tree run back to back on the same machine (CI's PR perf check and the
// post-release A/B), because machines differ by 10-40% (perf-after-2026-10-20.md, F55) and only a same-machine pair
// says whether a change made things slower. Inputs are suite.mjs --perf --json reports; with several per side (a
// rerun), each figure takes the side's lowest value, so one noisy run can't fail a PR.
//   node tools/test-bds/perf-compare.mjs --base a.json [--base a2.json] --head b.json [--head b2.json]
//        [--rel 0.15] [--abs 0.5] [--pack-rel 0.5] [--pack-abs 0.1] [--markdown <out.md>]
// A regression: the steady-window bundle ms/tick is more than --rel higher AND more than --abs ms higher, or one
// pack's steady ms/tick is more than --pack-rel higher AND more than --pack-abs ms higher. Both bars must be crossed:
// relative alone flags cheap packs whose Date.now() figures are whole-ms noise, absolute alone flags heavy packs'
// ordinary jitter. It prints a markdown table (and appends it to $GITHUB_STEP_SUMMARY when set).
// Exit 0: no regression; 1: regression; 2: a side has no valid measurement (INVALID soak: rerun, never a pass).
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

/** @typedef {{ valid: boolean, bundle: number | null, tps: number | null, packs: Map<string, number> }} Side */

/**
 * One player count from several suite --perf --json reports: valid when any report's soak was accepted; figures are
 * the lowest over the valid reports.
 * @param {any[]} reports
 * @param {string} count
 * @returns {Side}
 */
export function sideOf(reports, count) {
  const runs = reports.map((r) => r?.perf?.[count]).filter((x) => x && x.acceptance?.ok === true);
  /** @type {Map<string, number>} */
  const packs = new Map();
  let bundle = null, tps = null;
  for (const run of runs) {
    const b = run.bundle?.steadyWindow?.avg;
    if (Number.isFinite(b)) bundle = bundle === null ? b : Math.min(bundle, b);
    const t = run.server?.tps;
    if (Number.isFinite(t)) tps = tps === null ? t : Math.max(tps, t);
    for (const [pack, f] of Object.entries(run.packs ?? {})) {
      const v = /** @type {any} */ (f)?.steady;
      if (Number.isFinite(v)) packs.set(pack, Math.min(packs.get(pack) ?? Infinity, v));
    }
  }
  return { valid: runs.length > 0 && bundle !== null, bundle, tps, packs };
}

/**
 * @param {Side} base
 * @param {Side} head
 * @param {{ rel?: number, abs?: number, packRel?: number, packAbs?: number }} [bars]
 */
export function compare(base, head, { rel = 0.15, abs = 0.5, packRel = 0.5, packAbs = 0.1 } = {}) {
  if (!base.valid || !head.valid) return { status: "invalid", regressions: [], rows: [] };
  const worse = (/** @type {number} */ b, /** @type {number} */ h, /** @type {number} */ r, /** @type {number} */ a) => h - b > a && h > b * (1 + r);
  const regressions = [];
  const rows = [];
  const bb = /** @type {number} */ (base.bundle), hb = /** @type {number} */ (head.bundle);
  const bundleWorse = worse(bb, hb, rel, abs);
  rows.push({ name: "whole bundle", base: bb, head: hb, worse: bundleWorse });
  if (bundleWorse) regressions.push(`whole bundle ${bb.toFixed(3)} -> ${hb.toFixed(3)} ms/tick (+${(100 * (hb / bb - 1)).toFixed(0)}%)`);
  const names = [...new Set([...base.packs.keys(), ...head.packs.keys()])];
  for (const name of names.sort((x, y) => (head.packs.get(y) ?? 0) - (head.packs.get(x) ?? 0))) {
    const b = base.packs.get(name) ?? 0, h = head.packs.get(name) ?? 0;
    const w = worse(b, h, packRel, packAbs);
    rows.push({ name, base: b, head: h, worse: w });
    if (w) regressions.push(`${name} ${b.toFixed(3)} -> ${h.toFixed(3)} ms/tick${b > 0 ? ` (+${(100 * (h / b - 1)).toFixed(0)}%)` : " (new)"}`);
  }
  return { status: regressions.length ? "regression" : "ok", regressions, rows };
}

/** @param {string} count @param {Side} base @param {Side} head @param {ReturnType<typeof compare>} result @param {number} [top] */
export function markdown(count, base, head, result, top = 15) {
  const f = (/** @type {number | null} */ v) => (v === null || !Number.isFinite(v) ? "-" : v.toFixed(3));
  const L = [`### ${count} players: ${result.status === "ok" ? "no regression" : result.status === "invalid" ? "INVALID (no accepted soak on a side)" : "REGRESSION"}`, ""];
  if (result.status === "invalid") {
    L.push(`base valid: ${base.valid}, head valid: ${head.valid}`, "");
    return L.join("\n");
  }
  L.push(`TPS base ${f(base.tps)} / head ${f(head.tps)}; steady soak window, lowest of the runs on each side.`, "");
  L.push("| | base ms/tick | head ms/tick | change | |", "|---|---:|---:|---:|---|");
  for (const r of result.rows.slice(0, top + 1)) {
    const d = r.head - r.base;
    L.push(`| ${r.name} | ${f(r.base)} | ${f(r.head)} | ${d >= 0 ? "+" : ""}${d.toFixed(3)}${r.base > 0 ? ` (${d >= 0 ? "+" : ""}${(100 * (r.head / r.base - 1)).toFixed(0)}%)` : ""} | ${r.worse ? "**slower**" : ""} |`);
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
      "pack-rel": { type: "string", default: "0.5" }, "pack-abs": { type: "string", default: "0.1" }, markdown: { type: "string" },
    },
  });
  const read = (/** @type {string[] | undefined} */ files) => (files ?? []).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const bases = read(a.base), heads = read(a.head);
  const counts = [...new Set([...bases, ...heads].flatMap((r) => Object.keys(r?.perf ?? {})))].sort((x, y) => Number(x) - Number(y));
  const bars = { rel: Number(a.rel), abs: Number(a.abs), packRel: Number(a["pack-rel"]), packAbs: Number(a["pack-abs"]) };
  let worst = counts.length ? 0 : 2;
  const out = [];
  for (const count of counts) {
    const base = sideOf(bases, count), head = sideOf(heads, count);
    const result = compare(base, head, bars);
    out.push(markdown(count, base, head, result));
    worst = Math.max(worst, result.status === "invalid" ? 2 : result.status === "regression" ? 1 : 0);
  }
  if (!counts.length) out.push("No perf report to compare (both sides missing).");
  const text = `${out.join("\n\n")}\n`;
  console.log(text);
  if (a.markdown) fs.writeFileSync(a.markdown, text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  process.exit(worst);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
