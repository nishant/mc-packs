// run.mjs --profile (or --meter, the tick meter and CPU alone): drives the in-pack profiler (lib/profile.js) and the test pack's tick meter
// through script events, collects their "PROFILE ..." console lines, and prints/writes the report.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { evaluatePerf } from "./perf-acceptance.mjs";

const LINE = /^\[Scripting\] (?:\[[^\]]*\] )?(PROFILE|PROFILE_TICKS|PROFILE_CALLBACKS|PROFILE_HEAVY|PROFILE_SERVER) (\{.*\})\s*$/;

/** Tick residues the histograms use: the intervals of 20 to 200 ticks the packs start in their load tick line up on these. */
export const HISTOGRAM_MODS = [20, 40, 100, 200];

/**
 * Average ms by `tick % m` for each m in HISTOGRAM_MODS, and how many ticks over 5 ms fall on a multiple of 20.
 * @param {number[]} per ms per tick @param {number} start the absolute tick of per[0]
 */
export function tickHistogram(per, start) {
  /** @type {Record<string, number[]>} */
  const byMod = {};
  for (const m of HISTOGRAM_MODS) {
    const sum = new Array(m).fill(0), n = new Array(m).fill(0);
    per.forEach((v, i) => { const r = (((start + i) % m) + m) % m; sum[r] += v; n[r]++; });
    byMod[`mod${m}`] = sum.map((s, r) => (n[r] ? Math.round((1000 * s) / n[r]) / 1000 : 0));
  }
  // The comb of 20-tick timers has a fixed offset against currentTick, not always 0: also name the busiest residue
  // and the share of slow ticks that fall on it.
  const peak20 = byMod.mod20.reduce((best, v, r, a) => (v > a[best] ? r : best), 0);
  let over5 = 0, over5On20 = 0, over5OnPeak20 = 0;
  per.forEach((v, i) => { if (v > 5) { over5++; const r = (start + i) % 20; if (r === 0) over5On20++; if (r === peak20) over5OnPeak20++; } });
  return { ...byMod, over5, over5On20, shareOver5On20: over5 ? over5On20 / over5 : 0, peak20, over5OnPeak20, shareOver5OnPeak20: over5 ? over5OnPeak20 / over5 : 0 };
}

/**
 * The n slowest ticks with the single calls of 1 ms or more that ran in them (every pack's).
 * @param {number[]} per @param {number} start @param {Map<number, { pack: string, key: string, ms: number }[]>} heavy @param {number} [n]
 */
export function worstTicks(per, start, heavy, n = 10) {
  return per.map((ms, i) => ({ tick: start + i, ms })).filter((x) => x.ms > 0).sort((a, b) => b.ms - a.ms || a.tick - b.tick).slice(0, n)
    .map((x) => ({ ...x, calls: [...(heavy.get(x.tick) ?? [])].sort((a, b) => b.ms - a.ms) }));
}

/**
 * One script context's callbacks (the Realm Bundle) grouped by the `<pack>_bp/` folder in their file:line, so the
 * one-context run has per-pack figures of its own. Callbacks with no pack folder in their site are "(other)".
 * @param {{ key: string, ms: number, calls: number, max: number }[]} callbacks @param {number} ticks
 */
export function byPackPath(callbacks, ticks) {
  const n = Math.max(1, ticks);
  /** @type {Map<string, { pack: string, ms: number, calls: number, max: number, callbacks: number, top: string }>} */
  const by = new Map();
  for (const c of callbacks) {
    const site = c.key.slice(c.key.lastIndexOf(" @ ") + 3);
    const m = /(?:^|[\s(/\\])([A-Za-z0-9_]+_bp)[/\\]/.exec(site);
    const pack = m ? m[1] : "(other)";
    let e = by.get(pack);
    if (!e) by.set(pack, (e = { pack, ms: 0, calls: 0, max: 0, callbacks: 0, top: c.key }));
    e.ms += c.ms; e.calls += c.calls; e.callbacks++;
    if (c.max > e.max) e.max = c.max;
  }
  return [...by.values()].map((e) => ({ ...e, msPerTick: e.ms / n, callsPerTick: e.calls / n })).sort((a, b) => b.ms - a.ms || b.calls - a.calls);
}

const COUNTERS = ["ticks", "calls", "callsPerTick", "callbacks", "dynWrites", "dynBytes", "dynWorld", "dynEntity", "dynItem", "actionBar", "titles", "commands", "stacks", "particles", "p95TickMs", "maxTickMs"];
/**
 * suite.mjs --perf --json's form of one profile JSON: the bundle, server, process, workload and watchdog figures, and
 * each pack's whole and steady ms/tick with its top and slowest callbacks and counters (the full JSON is uploaded too).
 * @param {any} r
 */
export function reducedReport(r) {
  return {
    acceptance: r.acceptance ?? null, bundle: r.bundle, server: r.server, process: r.process ?? null, workload: r.workload ?? null, watchdog: r.watchdog ?? null,
    packs: Object.fromEntries((r.packs ?? []).map((/** @type {any} */ x) => [x.pack, {
      whole: x.msPerTick, steady: x.steadyMsPerTick ?? null, top: x.top ?? [], slowest: x.slowest ?? [],
      counters: Object.fromEntries(COUNTERS.filter((k) => x[k] !== undefined).map((k) => [k, x[k]])),
    }])),
  };
}

const r4 = (/** @type {any} */ v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null);
/** One window's bundle figures (bundleTicks' shape) cut to what a table needs. @param {any} b */
const windowFigures = (b) => (b ? { ticks: b.ticks, avg: r4(b.avg), p50: r4(b.p50), p95: r4(b.p95), p99: r4(b.p99), max: r4(b.max), over50: b.over50 ?? null } : null);

/**
 * What the suite keeps of a profiled scenario's run (PIPE-10): the bundle's whole-run and steady figures, each phase's,
 * bedrock_server CPU and the 8 dearest packs (by their steady figure when the scenario has a window). Null without rows.
 * @param {any} r a run.mjs profile JSON
 */
export function scenarioPerf(r) {
  const rows = Array.isArray(r?.packs) ? r.packs : [];
  if (!rows.length) return null;
  const fig = (/** @type {any} */ x) => (Number.isFinite(x.steadyMsPerTick) ? x.steadyMsPerTick : x.msPerTick ?? 0);
  return {
    ticks: r.ticks ?? null, msPerTick: r4(r.bundle?.msPerTick), acceptance: r.acceptance ? r.acceptance.ok === true : null,
    cpuMsPerTick: r4(r.process?.cpuMsPerTick), whole: windowFigures(r.bundle?.perTick), steady: windowFigures(r.bundle?.steadyWindow),
    phases: (r.bundle?.phases ?? []).map((/** @type {any} */ ph) => ({ name: ph.name, players: ph.players ?? null, ...windowFigures(ph.bundle) })),
    packs: [...rows].sort((a, b) => fig(b) - fig(a)).slice(0, 8).map((x) => ({ pack: x.pack, msPerTick: r4(x.msPerTick), steady: r4(x.steadyMsPerTick), p95: x.p95TickMs ?? null, max: x.maxTickMs ?? null })),
  };
}

/** A complete set of parts joined, or null while one is missing. @param {{ n: number, parts: (string | undefined)[] } | undefined} e */
function joined(e) {
  if (!e || e.parts.filter((x) => x !== undefined).length < e.n) return null;
  return e.parts.join("");
}

// The process figures below come from /proc, so only Linux has them (and only Linux has getconf: elsewhere the
// call printed a "not recognized" error line into every run's output).
let CLK_TCK = 100;
if (process.platform === "linux") {
  try { CLK_TCK = Number(execSync("getconf CLK_TCK", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()) || 100; } catch (e) { /* default */ }
}

/** bedrock_server's CPU time (ms) and resident memory (MB), Linux only. */
function procStats(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const f = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const cpuMs = ((Number(f[11]) + Number(f[12])) * 1000) / CLK_TCK;
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const rss = /VmRSS:\s+(\d+)/.exec(status);
    const threads = /Threads:\s+(\d+)/.exec(status);
    return { cpuMs, rssMB: rss ? Number(rss[1]) / 1024 : null, threads: threads ? Number(threads[1]) : null, at: Date.now() };
  } catch (e) {
    return null;
  }
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
const f2 = (x) => (x === null || x === undefined || Number.isNaN(x) ? "-" : Number(x).toFixed(2));
const f3 = (x) => (x === null || x === undefined || Number.isNaN(x) ? "-" : Number(x).toFixed(3));

/**
 * Script events across the packs, per tick: how often each id was sent (by which packs), and how many listener calls and
 * ms each id cost the packs that handle it. Ids sorted by how often they are sent (handled: by ms).
 * @param {any[]} rows @param {number} ticks
 */
export function scriptEventTotals(rows, ticks) {
  const n = Math.max(1, ticks);
  /** @type {Map<string, { sent: number, by: Record<string, number> }>} */
  const sent = new Map();
  /** @type {Map<string, { calls: number, ms: number }>} */
  const handled = new Map();
  for (const r of rows) {
    for (const [id, c] of Object.entries(r.scriptEventsSent ?? {})) {
      let e = sent.get(id);
      if (!e) sent.set(id, (e = { sent: 0, by: {} }));
      e.sent += c;
      e.by[r.pack] = (e.by[r.pack] ?? 0) + c;
    }
    for (const [id, h] of Object.entries(r.scriptEventsHandled ?? {})) {
      let e = handled.get(id);
      if (!e) handled.set(id, (e = { calls: 0, ms: 0 }));
      e.calls += h.calls;
      e.ms += h.ms;
    }
  }
  const bySent = [...sent].sort((a, b) => b[1].sent - a[1].sent);
  return {
    sentTotalPerTick: bySent.reduce((a, [, e]) => a + e.sent, 0) / n,
    sentPerTick: Object.fromEntries(bySent.map(([id, e]) => [id, e.sent / n])),
    senders: Object.fromEntries(bySent.map(([id, e]) => [id, e.by])),
    handledPerTick: Object.fromEntries([...handled].sort((a, b) => b[1].ms - a[1].ms || b[1].calls - a[1].calls).map(([id, e]) => [id, { calls: e.calls / n, ms: e.ms / n }])),
  };
}

export class Profile {
  /** meterOnly (run.mjs --meter without --profile): no pack is wrapped; only the tick meter and bedrock_server CPU. */
  constructor({ say, everyS, json, scenario, args, meterOnly = false }) {
    Object.assign(this, { say, everyS, json, scenario, args, meterOnly });
    this.latest = new Map();
    this.final = new Map();
    this.tickParts = new Map();
    this.cbParts = new Map();
    this.heavyParts = new Map();
    this.watchdog = null;
    this.server = null;
    this.serverFinal = null;
    this.interval = null;
    this.cpu0 = this.cpu1 = null;
    this.startedAt = null;
    this.workload = null;
    this.acceptance = null;
    /** Every t.report(name, data) of the scenario (the meter JSON keeps them). @type {Record<string, any>} */
    this.reports = {};
  }

  /** The scenario's own account of its workload (perf-soak's `perf-workload` report). */
  setWorkload(workload) { this.workload = workload; }

  /** Watchdog and slow-tick lines from the server log (lib/watchdog.mjs watchdogSummary). */
  setWatchdog(summary) { this.watchdog = summary; }

  /** True when `packs` final rows, each with every part it announced, and the tick meter's final line have arrived. */
  complete(packs) {
    if (this.final.size < packs || !this.serverFinal) return false;
    for (const [pack, row] of this.final) {
      const want = row.parts;
      if (!want) continue; // an older profiler: no part counts to wait for
      const have = (/** @type {Map<string, any>} */ m) => m.get(pack)?.parts.filter((x) => x !== undefined).length ?? 0;
      if (have(this.tickParts) < want.ticks || have(this.cbParts) < want.callbacks || have(this.heavyParts) < want.heavy) return false;
    }
    return true;
  }

  /** A pack's every timed callback (the final PROFILE_CALLBACKS), or null. */
  callbacksOf(pack) {
    const s = joined(this.cbParts.get(pack));
    if (s === null) return null;
    try { return JSON.parse(s); } catch { return null; }
  }

  /** tick -> the single calls of 1 ms or more in it, over every pack. */
  heavyByTick() {
    /** @type {Map<number, { pack: string, key: string, ms: number }[]>} */
    const by = new Map();
    for (const pack of this.heavyParts.keys()) {
      const s = joined(this.heavyParts.get(pack));
      const cbs = this.callbacksOf(pack);
      if (!s || !cbs) continue;
      for (const item of s.split(",")) {
        const [tick, ms, idx] = item.split(":").map(Number);
        if (!Number.isFinite(tick)) continue;
        let l = by.get(tick);
        if (!l) by.set(tick, (l = []));
        l.push({ pack, key: cbs[idx]?.key ?? "?", ms });
      }
    }
    return by;
  }

  send(cmd) { try { this.bds.send(cmd); } catch (e) { /* server gone */ } }

  start(bds) {
    this.bds = bds;
    this.latest.clear(); this.final.clear(); this.tickParts.clear(); this.cbParts.clear(); this.heavyParts.clear();
    this.heavy = null;
    this.send("scriptevent harness:profile_reset {}");
    this.cpu0 = procStats(bds.proc.pid);
    this.startedAt = Date.now();
    if (this.interval) clearInterval(this.interval);
    if (this.everyS > 0) {
      this.interval = setInterval(() => {
        this.send('scriptevent harness:profile_dump {"final":false}');
        setTimeout(() => this.interim(), 3000);
      }, this.everyS * 1000);
    }
  }

  finalDump() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (this.bds) this.cpu1 = procStats(this.bds.proc.pid);
    this.send('scriptevent harness:profile_dump {"final":true}');
  }

  stop() { if (this.interval) clearInterval(this.interval); this.interval = null; }

  /** Returns true when the console line was a profiler line (consumed). */
  onLine(text) {
    const m = LINE.exec(text);
    if (!m) return false;
    let obj;
    try { obj = JSON.parse(m[2]); } catch (e) { return true; }
    if (m[1] === "PROFILE") {
      this.latest.set(obj.pack, obj);
      if (obj.final) this.final.set(obj.pack, obj);
    } else if (m[1] === "PROFILE_TICKS" || m[1] === "PROFILE_CALLBACKS" || m[1] === "PROFILE_HEAVY") {
      const map = m[1] === "PROFILE_TICKS" ? this.tickParts : m[1] === "PROFILE_CALLBACKS" ? this.cbParts : this.heavyParts;
      let e = map.get(obj.pack);
      if (!e) map.set(obj.pack, (e = { startTick: obj.startTick, n: obj.n, parts: [] }));
      e.parts[obj.i] = obj.d;
    } else if (m[1] === "PROFILE_SERVER") {
      if (this.finalRequested()) this.serverFinal = obj;
      this.server = obj;
    }
    return true;
  }

  finalRequested() { return this.cpu1 !== null; }

  packRows(map) {
    return [...map.values()].sort((a, b) => b.msPerTick - a.msPerTick || b.callsPerTick - a.callsPerTick);
  }

  table(rows, limit = rows.length) {
    const L = [];
    const w = Math.max(10, ...rows.map((r) => r.pack.length));
    L.push(`${"pack".padEnd(w)} | ms/tick |  p95 |  max | calls/t | dynW/t | bar/t | ttl/t | cmd/t | top callback (ms, calls)`);
    for (const r of rows.slice(0, limit)) {
      const t = (r.top || [])[0];
      const n = r.ticks || 1;
      L.push(`${r.pack.padEnd(w)} | ${f3(r.msPerTick).padStart(7)} | ${String(r.p95TickMs).padStart(4)} | ${String(r.maxTickMs).padStart(4)} | ${f2(r.callsPerTick).padStart(7)} | ${f3(r.dynWrites / n).padStart(6)} | ${f2(r.actionBar / n).padStart(5)} | ${f2(r.titles / n).padStart(5)} | ${f2(r.commands / n).padStart(5)} | ${t ? `${t.key} (${t.ms}, ${t.calls})` : "-"}`);
    }
    return L;
  }

  interim() {
    const rows = this.packRows(this.latest).filter((r) => !r.final);
    if (!rows.length) return;
    const total = rows.reduce((a, r) => a + r.msPerTick, 0);
    const s = this.server;
    const L = [`[profile] interim at ${((Date.now() - this.startedAt) / 1000).toFixed(0)} s: ${rows.length} packs, ${f3(total)} ms/tick in pack callbacks${s ? `; server ${f2(s.tps)} TPS, tick interval p95 ${s.tickIntervalP95Ms} ms` : ""}`];
    L.push(...this.table(rows, 12).map((l) => "[profile]   " + l));
    this.say(L.join("\n"));
  }

  /** Whole-bundle per-tick ms (sum over packs, tick by tick); from/to limit it to a window (the steady soak). */
  bundleTicks(from, to) {
    const sum = new Map();
    for (const [pack, e] of this.tickParts) {
      if (e.parts.filter((x) => x !== undefined).length < e.n) continue;
      const vals = e.parts.join("").split(",");
      vals.forEach((v, i) => { if (v) sum.set(e.startTick + i, (sum.get(e.startTick + i) || 0) + Number(v)); });
    }
    const final = [...this.final.values()];
    if (!final.length) return null;
    const start = from ?? Math.min(...final.map((r) => r.startTick)), end = to ?? Math.max(...final.map((r) => r.endTick));
    const per = [];
    for (let t = start; t < end; t++) per.push(sum.get(t) || 0);
    const sorted = [...per].sort((a, b) => a - b);
    this.heavy ??= this.heavyByTick();
    return {
      ticks: per.length, startTick: start, endTick: end, avg: per.reduce((a, b) => a + b, 0) / Math.max(1, per.length), p50: pct(sorted, 0.5), p95: pct(sorted, 0.95), p99: pct(sorted, 0.99), max: sorted[sorted.length - 1] || 0, over50: per.filter((x) => x > 50).length,
      // Which tick residues the time falls on (timers started in one tick line up), and the 10 worst ticks with the calls of 1 ms or more in them.
      histogram: tickHistogram(per, start),
      worst: worstTicks(per, start, this.heavy),
    };
  }

  /** One pack's average ms/tick over a tick window from its already collected per-tick data; null if its data is incomplete. */
  packWindowAvg(pack, from, to) {
    const e = this.tickParts.get(pack);
    if (!e || to <= from || e.parts.filter((x) => x !== undefined).length < e.n) return null;
    let sum = 0;
    e.parts.join("").split(",").forEach((v, i) => {
      const tick = e.startTick + i;
      if (v && tick >= from && tick < to) sum += Number(v);
    });
    return sum / (to - from);
  }

  /** One pack's ms/tick average, p95 and max over a tick window; null if its per-tick data is incomplete. */
  packWindowStats(pack, from, to) {
    const e = this.tickParts.get(pack);
    if (!e || to <= from || e.parts.filter((x) => x !== undefined).length < e.n) return null;
    const vals = e.parts.join("").split(",");
    const per = [];
    for (let tick = from; tick < to; tick++) per.push(Number(vals[tick - e.startTick]) || 0);
    const sorted = [...per].sort((a, b) => a - b);
    return { avg: per.reduce((a, b) => a + b, 0) / per.length, p95: pct(sorted, 0.95), max: sorted[sorted.length - 1] || 0 };
  }

  /** bedrock_server CPU between start() and finalDump(), per tick of `ticks`; null without both samples. @param {number} ticks */
  cpuOver(ticks) {
    if (!this.cpu0 || !this.cpu1) return null;
    const wall = this.cpu1.at - this.cpu0.at, used = this.cpu1.cpuMs - this.cpu0.cpuMs;
    return { cpuMs: used, wallMs: wall, cpuPct: (100 * used) / Math.max(1, wall), cpuMsPerTick: used / Math.max(1, ticks), rssMB: this.cpu1.rssMB, threads: this.cpu1.threads };
  }

  /**
   * The meter alone (--meter without --profile): tick interval percentiles and bedrock_server CPU ms/tick of an
   * unprofiled run, so a profiled and an unprofiled run of one workload can be compared (PIPE-03). The ticks are the tick
   * meter's, from the scenario's start to its end.
   */
  meterReport() {
    const s = this.serverFinal || this.server;
    const ticks = s?.ticks ?? 0;
    const cpu = this.cpuOver(ticks);
    const L = [];
    if (!s) L.push("meter: no reading from the tick meter (the scenario did not finish?)");
    else {
      L.push(`meter (no profiler): ${ticks} ticks (${(ticks / 20).toFixed(0)} game s)`);
      L.push(`  server: ${f2(s.tps)} TPS; tick interval avg ${f2(s.tickIntervalAvgMs)} / p50 ${s.tickIntervalP50Ms ?? "-"} / p95 ${s.tickIntervalP95Ms} / p99 ${s.tickIntervalP99Ms} / max ${s.tickIntervalMaxMs} ms; ${s.ticksOver50ms} ticks over 50 ms, ${s.ticksOver100ms} over 100 ms`);
    }
    if (cpu) L.push(`  bedrock_server process: ${f3(cpu.cpuMsPerTick)} CPU ms/tick (${cpu.cpuPct.toFixed(0)}% of one core), RSS ${cpu.rssMB?.toFixed(0)} MB, ${cpu.threads} threads`);
    if (this.watchdog) L.push(`  watchdog and slow-tick lines: ${this.watchdog.count}`);
    L.push(`  meter JSON: ${this.json}`);
    try {
      fs.writeFileSync(this.json, JSON.stringify({ date: new Date().toISOString(), scenario: this.scenario, args: this.args, meter: true, ticks, server: s ?? null, process: cpu, watchdog: this.watchdog, workload: this.workload, reports: this.reports }, null, 2));
    } catch (e) {
      this.say(`[meter] could not write ${this.json}: ${e}`);
    }
    return L;
  }

  report() {
    if (this.meterOnly) return this.meterReport();
    const rows = this.packRows(this.final);
    const L = [];
    if (!rows.length) {
      L.push("profile: no final report from the packs (the scenario did not finish?)");
      this.write(rows, null, null);
      return L;
    }
    this.heavy = null;
    const bundle = this.bundleTicks();
    const ticks = Math.max(...rows.map((r) => r.ticks));
    for (const r of rows) r.callbacksAll = this.callbacksOf(r.pack);
    // One script context (the Realm Bundle): per-pack figures from the callbacks' scripts/<pack>/ paths.
    const byPath = rows.length === 1 && rows[0].callbacksAll ? byPackPath(rows[0].callbacksAll, rows[0].ticks) : null;
    const cpu = this.cpuOver(ticks);
    const s = this.serverFinal || this.server;
    const totals = rows.reduce((a, r) => ({ ms: a.ms + r.totalMs, dyn: a.dyn + r.dynWrites, bytes: a.bytes + r.dynBytes, bar: a.bar + r.actionBar, ttl: a.ttl + r.titles, cmd: a.cmd + r.commands, calls: a.calls + r.calls }), { ms: 0, dyn: 0, bytes: 0, bar: 0, ttl: 0, cmd: 0, calls: 0 });
    L.push(`profile: ${rows.length} packs over ${ticks} ticks (${(ticks / 20).toFixed(0)} game s)`);
    L.push(`  bundle: ${f3(totals.ms / ticks)} ms/tick in pack callbacks${bundle ? `, per-tick p50 ${bundle.p50} / p95 ${bundle.p95} / p99 ${bundle.p99} / max ${bundle.max} ms, ${bundle.over50} ticks over 50 ms` : ""}; ${f2(totals.calls / ticks)} calls/tick; setDynamicProperty ${f3(totals.dyn / ticks)}/tick (${f2(totals.bytes / ticks)} chars/tick); setActionBar ${f2(totals.bar / ticks)}/tick; setTitle ${f2(totals.ttl / ticks)}/tick; runCommand ${f2(totals.cmd / ticks)}/tick`);
    if (s) L.push(`  server: ${f2(s.tps)} TPS; tick interval avg ${f2(s.tickIntervalAvgMs)} / p95 ${s.tickIntervalP95Ms} / p99 ${s.tickIntervalP99Ms} / max ${s.tickIntervalMaxMs} ms; ${s.ticksOver50ms} ticks over 50 ms${s.ticksOver55ms !== undefined ? ` (${s.ticksOver55ms} over 55)` : ""}, ${s.ticksOver100ms} over 100 ms`);
    if (cpu) L.push(`  bedrock_server process: ${f2(cpu.cpuMsPerTick)} CPU ms/tick (${cpu.cpuPct.toFixed(0)}% of one core), RSS ${cpu.rssMB?.toFixed(0)} MB, ${cpu.threads} threads`);
    if (this.watchdog) L.push(`  watchdog and slow-tick lines: ${this.watchdog.count}${this.watchdog.count ? ` (${Object.entries(this.watchdog.byKind).map(([k, n]) => `${n} ${k}`).join(", ")})` : ""}`);
    L.push(...this.table(rows).map((l) => "  " + l));
    if (byPath) {
      L.push(`  one script context, by scripts/<pack>/ path (${byPath.length} groups):`);
      for (const p of byPath.slice(0, 15)) L.push(`    ${p.pack.padEnd(16)} ${f3(p.msPerTick)} ms/tick, ${f2(p.callsPerTick)} calls/tick, max ${p.max} ms, ${p.callbacks} callbacks`);
    }
    let steady = null;
    if (this.workload) {
      const win = this.workload.soak;
      if (win && Number.isFinite(win.startTick) && Number.isFinite(win.endTick)) {
        steady = this.bundleTicks(win.startTick, win.endTick);
        for (const r of rows) r.steadyMsPerTick = this.packWindowAvg(r.pack, win.startTick, win.endTick);
      }
      this.acceptance = evaluatePerf({ args: this.args, workload: this.workload, profile: { ticks, packs: rows } });
      L.push(`  perf acceptance: ${this.acceptance.ok ? "VALID" : "INVALID"} for ${this.acceptance.declared?.players ?? "?"} players over ${this.acceptance.declared?.seconds ?? "?"} s${this.acceptance.ok ? "" : ` - ${this.acceptance.reasons.join("; ")}`}`);
      if (steady) L.push(`  steady soak window only (${steady.ticks} ticks): ${f3(steady.avg)} ms/tick summed over packs, p95 ${steady.p95} / p99 ${steady.p99} / max ${steady.max} ms`);
      // A scenario may split its window into named phases (night-soak.js: dusk, early, mid and late night, dawn): each
      // pack's ms/tick and the bundle's per-tick figures per phase, to see how a cost grows through the window.
      const phases = Array.isArray(this.workload.phases) ? this.workload.phases.filter((ph) => ph && typeof ph.name === "string" && Number.isFinite(ph.startTick) && Number.isFinite(ph.endTick) && ph.endTick > ph.startTick) : [];
      if (phases.length) {
        for (const r of rows) r.phases = Object.fromEntries(phases.map((ph) => [ph.name, this.packWindowStats(r.pack, ph.startTick, ph.endTick)]));
        this.phaseBundle = phases.map((ph) => ({ ...ph, bundle: this.bundleTicks(ph.startTick, ph.endTick) }));
        for (const ph of this.phaseBundle) L.push(`  phase ${ph.name} (${ph.bundle?.ticks ?? 0} ticks${Number.isFinite(ph.players) ? `, ${ph.players} players` : ""}): ${f3(ph.bundle?.avg)} ms/tick summed over packs, p50 ${ph.bundle?.p50 ?? "-"} / p95 ${ph.bundle?.p95 ?? "-"} / p99 ${ph.bundle?.p99 ?? "-"} / max ${ph.bundle?.max ?? "-"} ms; ${rows.slice(0, 8).map((r) => `${r.pack} ${f3(r.phases[ph.name]?.avg)} (p95 ${r.phases[ph.name]?.p95 ?? "-"}, max ${r.phases[ph.name]?.max ?? "-"})`).join(", ")}`);
      }
    }
    const slow = steady ?? bundle;
    if (slow?.histogram) {
      const h = slow.histogram;
      L.push(`  ${steady ? "steady window" : "whole run"}, ms by tick % 20: ${h.mod20.map((v) => v.toFixed(2)).join(" ")}; ${h.over5} ticks over 5 ms, ${h.over5On20} of them on a multiple of 20 (${(100 * h.shareOver5On20).toFixed(0)}%), ${h.over5OnPeak20} on the busiest residue ${h.peak20} (${(100 * h.shareOver5OnPeak20).toFixed(0)}%)`);
      for (const w of slow.worst.slice(0, 3)) L.push(`  worst tick ${w.tick} (${w.ms} ms): ${w.calls.slice(0, 4).map((c) => `${c.key} ${c.ms}`).join("; ") || "no single call of 1 ms or more"}`);
    }
    const events = scriptEventTotals(rows, ticks);
    const topSent = Object.entries(events.sentPerTick).slice(0, 8);
    if (topSent.length) L.push(`  script events sent/tick: ${f3(events.sentTotalPerTick)} (${topSent.map(([id, n]) => `${id} ${f3(n)}`).join(", ")})`);
    L.push(`  profile JSON: ${this.json}`);
    this.write(rows, bundle, cpu, s, totals, ticks, steady, events, byPath);
    return L;
  }

  write(rows, bundle, cpu, server = null, totals = null, ticks = 0, steady = null, events = scriptEventTotals(rows, ticks), byPath = null) {
    try {
      fs.writeFileSync(this.json, JSON.stringify({
        date: new Date().toISOString(), scenario: this.scenario, args: this.args, ticks,
        server, process: cpu, watchdog: this.watchdog,
        workload: this.workload, acceptance: this.acceptance,
        // Every figure is time inside callbacks the packs handed to the game; time after an await in an async callback
        // is not attributed (see lib/profile.js), and a run of separate packs sums separate script contexts.
        measurement: { unattributed: ["time after an await inside an async callback"], contexts: rows.length },
        bundle: totals ? { msPerTick: totals.ms / ticks, perTick: bundle, steadyWindow: steady, phases: this.phaseBundle ?? undefined, callsPerTick: totals.calls / ticks, dynWritesPerTick: totals.dyn / ticks, dynCharsPerTick: totals.bytes / ticks, actionBarPerTick: totals.bar / ticks, setTitlePerTick: totals.ttl / ticks, runCommandPerTick: totals.cmd / ticks, scriptEvents: events, byPath: byPath ?? undefined } : null,
        packs: rows.map(({ callbacksAll, ...r }) => ({ ...r, callbackList: callbacksAll ?? undefined, dynWritesPerTick: r.dynWrites / r.ticks, actionBarPerTick: r.actionBar / r.ticks, setTitlePerTick: r.titles / r.ticks, runCommandPerTick: r.commands / r.ticks, particlesPerTick: (r.particles ?? 0) / r.ticks })),
      }, null, 2));
    } catch (e) {
      this.say(`[profile] could not write ${this.json}: ${e}`);
    }
  }
}
