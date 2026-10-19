// run.mjs --profile: drives the in-pack profiler (lib/profile.js) and the test pack's tick meter
// through script events, collects their "PROFILE ..." console lines, and prints/writes the report.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { evaluatePerf } from "./perf-acceptance.mjs";

const LINE = /^\[Scripting\] (?:\[[^\]]*\] )?(PROFILE|PROFILE_TICKS|PROFILE_SERVER) (\{.*\})\s*$/;

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

export class Profile {
  constructor({ say, everyS, json, scenario, args }) {
    Object.assign(this, { say, everyS, json, scenario, args });
    this.latest = new Map();
    this.final = new Map();
    this.tickParts = new Map();
    this.server = null;
    this.serverFinal = null;
    this.interval = null;
    this.cpu0 = this.cpu1 = null;
    this.startedAt = null;
    this.workload = null;
    this.acceptance = null;
  }

  /** The scenario's own account of its workload (perf-soak's `perf-workload` report). */
  setWorkload(workload) { this.workload = workload; }

  send(cmd) { try { this.bds.send(cmd); } catch (e) { /* server gone */ } }

  start(bds) {
    this.bds = bds;
    this.latest.clear(); this.final.clear(); this.tickParts.clear();
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
    } else if (m[1] === "PROFILE_TICKS") {
      let e = this.tickParts.get(obj.pack);
      if (!e) this.tickParts.set(obj.pack, (e = { startTick: obj.startTick, n: obj.n, parts: [] }));
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
    return { ticks: per.length, avg: per.reduce((a, b) => a + b, 0) / Math.max(1, per.length), p50: pct(sorted, 0.5), p95: pct(sorted, 0.95), p99: pct(sorted, 0.99), max: sorted[sorted.length - 1] || 0, over50: per.filter((x) => x > 50).length };
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

  report() {
    const rows = this.packRows(this.final);
    const L = [];
    if (!rows.length) {
      L.push("profile: no final report from the packs (the scenario did not finish?)");
      this.write(rows, null, null);
      return L;
    }
    const bundle = this.bundleTicks();
    const ticks = Math.max(...rows.map((r) => r.ticks));
    let cpu = null;
    if (this.cpu0 && this.cpu1) {
      const wall = this.cpu1.at - this.cpu0.at;
      cpu = { cpuMs: this.cpu1.cpuMs - this.cpu0.cpuMs, wallMs: wall, cpuPct: (100 * (this.cpu1.cpuMs - this.cpu0.cpuMs)) / Math.max(1, wall), cpuMsPerTick: (this.cpu1.cpuMs - this.cpu0.cpuMs) / Math.max(1, ticks), rssMB: this.cpu1.rssMB, threads: this.cpu1.threads };
    }
    const s = this.serverFinal || this.server;
    const totals = rows.reduce((a, r) => ({ ms: a.ms + r.totalMs, dyn: a.dyn + r.dynWrites, bytes: a.bytes + r.dynBytes, bar: a.bar + r.actionBar, ttl: a.ttl + r.titles, cmd: a.cmd + r.commands, calls: a.calls + r.calls }), { ms: 0, dyn: 0, bytes: 0, bar: 0, ttl: 0, cmd: 0, calls: 0 });
    L.push(`profile: ${rows.length} packs over ${ticks} ticks (${(ticks / 20).toFixed(0)} game s)`);
    L.push(`  bundle: ${f3(totals.ms / ticks)} ms/tick in pack callbacks${bundle ? `, per-tick p50 ${bundle.p50} / p95 ${bundle.p95} / p99 ${bundle.p99} / max ${bundle.max} ms, ${bundle.over50} ticks over 50 ms` : ""}; ${f2(totals.calls / ticks)} calls/tick; setDynamicProperty ${f3(totals.dyn / ticks)}/tick (${f2(totals.bytes / ticks)} chars/tick); setActionBar ${f2(totals.bar / ticks)}/tick; setTitle ${f2(totals.ttl / ticks)}/tick; runCommand ${f2(totals.cmd / ticks)}/tick`);
    if (s) L.push(`  server: ${f2(s.tps)} TPS; tick interval avg ${f2(s.tickIntervalAvgMs)} / p95 ${s.tickIntervalP95Ms} / p99 ${s.tickIntervalP99Ms} / max ${s.tickIntervalMaxMs} ms; ${s.ticksOver50ms} ticks over 55 ms, ${s.ticksOver100ms} over 100 ms`);
    if (cpu) L.push(`  bedrock_server process: ${f2(cpu.cpuMsPerTick)} CPU ms/tick (${cpu.cpuPct.toFixed(0)}% of one core), RSS ${cpu.rssMB?.toFixed(0)} MB, ${cpu.threads} threads`);
    L.push(...this.table(rows).map((l) => "  " + l));
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
    }
    L.push(`  profile JSON: ${this.json}`);
    this.write(rows, bundle, cpu, s, totals, ticks, steady);
    return L;
  }

  write(rows, bundle, cpu, server = null, totals = null, ticks = 0, steady = null) {
    try {
      fs.writeFileSync(this.json, JSON.stringify({
        date: new Date().toISOString(), scenario: this.scenario, args: this.args, ticks,
        server, process: cpu,
        workload: this.workload, acceptance: this.acceptance,
        // Every figure is time inside callbacks the packs handed to the game; time after an await in an async callback
        // is not attributed (see lib/profile.js), and a run of separate packs sums separate script contexts.
        measurement: { unattributed: ["time after an await inside an async callback"], contexts: rows.length },
        bundle: totals ? { msPerTick: totals.ms / ticks, perTick: bundle, steadyWindow: steady, callsPerTick: totals.calls / ticks, dynWritesPerTick: totals.dyn / ticks, dynCharsPerTick: totals.bytes / ticks, actionBarPerTick: totals.bar / ticks, setTitlePerTick: totals.ttl / ticks, runCommandPerTick: totals.cmd / ticks } : null,
        packs: rows.map((r) => ({ ...r, dynWritesPerTick: r.dynWrites / r.ticks, actionBarPerTick: r.actionBar / r.ticks, setTitlePerTick: r.titles / r.ticks, runCommandPerTick: r.commands / r.ticks })),
      }, null, 2));
    } catch (e) {
      this.say(`[profile] could not write ${this.json}: ${e}`);
    }
  }
}
