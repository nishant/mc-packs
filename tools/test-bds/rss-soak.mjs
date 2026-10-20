// Memory soak sampler (O4, F57): runs one tools/test-bds/run.mjs command and samples the resident memory (VmRSS) of
// the bedrock_server it starts every few seconds, without the profiler, then says whether memory keeps growing.
//   node tools/test-bds/rss-soak.mjs --every 5 --out <file.json> -- --quiet --no-relay --flat \
//     --scenario tools/test-bds/examples/perf-soak.js --arg players=40 --arg seconds=3600 --timeout 4500
// Everything after `--` goes to run.mjs unchanged (add `--only a_bp,b_bp` to bisect). Linux only (/proc).
// The JSON has every sample { t (s since the first), pid, rssMiB, hwmMiB } and `summary` (see summarize()).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Median of numbers. @param {number[]} v */
const median = (v) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** Least-squares slope of y over x. @param {number[]} x @param {number[]} y */
const slope = (x, y) => {
  const n = x.length;
  if (n < 2) return NaN;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  return den ? num / den : NaN;
};

/**
 * What the samples say. The first `warmupS` seconds (the spawn ramp, chunk loading) are left out. Medians per
 * `binS` window; the slope (MiB/min) over the first and the second half of the rest; `growing` is true when the
 * second half still rises by more than `flatMiBPerMin` and its last bin is the highest. "leveled" means the second
 * half is flat within that tolerance. With less than 30 minutes after the warm-up there is no verdict.
 * @param {{ t: number, rssMiB: number }[]} samples
 */
export function summarize(samples, { warmupS = 300, binS = 600, flatMiBPerMin = 0.5 } = {}) {
  const rest = samples.filter((s) => s.t >= warmupS && Number.isFinite(s.rssMiB));
  const out = {
    samples: samples.length,
    firstMiB: samples[0]?.rssMiB ?? null,
    lastMiB: samples.at(-1)?.rssMiB ?? null,
    peakMiB: samples.reduce((a, s) => Math.max(a, s.rssMiB ?? 0), 0) || null,
    durationS: samples.length ? samples.at(-1).t - samples[0].t : 0,
    /** @type {{ fromS: number, toS: number, medianMiB: number }[]} */
    bins: [],
    slopeFirstHalf: NaN,
    slopeSecondHalf: NaN,
    verdict: "too short",
  };
  for (let from = warmupS; ; from += binS) {
    const inBin = rest.filter((s) => s.t >= from && s.t < from + binS).map((s) => s.rssMiB);
    if (!inBin.length) break;
    out.bins.push({ fromS: from, toS: from + binS, medianMiB: median(inBin) });
  }
  if (!rest.length || rest.at(-1).t - rest[0].t < 1800) return out;
  const mid = (rest[0].t + rest.at(-1).t) / 2;
  const a = rest.filter((s) => s.t < mid);
  const b = rest.filter((s) => s.t >= mid);
  out.slopeFirstHalf = slope(a.map((s) => s.t / 60), a.map((s) => s.rssMiB));
  out.slopeSecondHalf = slope(b.map((s) => s.t / 60), b.map((s) => s.rssMiB));
  const medians = out.bins.map((x) => x.medianMiB);
  const lastIsHighest = medians.length > 1 && medians.at(-1) >= Math.max(...medians.slice(0, -1));
  out.verdict = out.slopeSecondHalf > flatMiBPerMin && lastIsHighest ? "growing" : Math.abs(out.slopeSecondHalf) <= flatMiBPerMin ? "leveled" : "falling or noisy";
  return out;
}

/** Every process under `root` (children, grandchildren...). @param {number} root */
function descendants(root) {
  /** @type {Map<number, number[]>} */
  const kids = new Map();
  for (const d of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, "utf8");
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(Number(d));
    } catch {
      // gone
    }
  }
  const out = [];
  const todo = [root];
  while (todo.length) for (const k of kids.get(todo.pop()) ?? []) out.push(k), todo.push(k);
  return out;
}

/** @param {number} pid */
function memOf(pid) {
  try {
    if (!fs.readFileSync(`/proc/${pid}/comm`, "utf8").startsWith("bedrock_server")) return null;
    const st = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const rss = /VmRSS:\s+(\d+)/.exec(st);
    const hwm = /VmHWM:\s+(\d+)/.exec(st);
    return rss ? { rssMiB: Number(rss[1]) / 1024, hwmMiB: hwm ? Number(hwm[1]) / 1024 : null } : null;
  } catch {
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  if (sep < 0) throw new Error("usage: rss-soak.mjs --every <s> --out <file.json> -- <run.mjs arguments>");
  const own = argv.slice(0, sep);
  const runArgs = argv.slice(sep + 1);
  const opt = (k, d) => (own.includes(k) ? own[own.indexOf(k) + 1] : d);
  const every = Math.max(1, Number(opt("--every", 5)));
  const outFile = path.resolve(opt("--out", `rss-soak-${Date.now()}.json`));
  const here = path.dirname(new URL(import.meta.url).pathname);
  const child = spawn(process.execPath, [path.join(here, "run.mjs"), ...runArgs], { stdio: "inherit" });
  const t0 = Date.now();
  /** @type {{ t: number, pid: number, rssMiB: number, hwmMiB: number | null }[]} */
  const samples = [];
  const write = () => {
    const summary = summarize(samples);
    fs.writeFileSync(outFile, JSON.stringify({ date: new Date(t0).toISOString(), every, run: runArgs, summary, samples }, null, 1));
    return summary;
  };
  const timer = setInterval(() => {
    for (const pid of descendants(child.pid)) {
      const m = memOf(pid);
      if (m) samples.push({ t: Math.round((Date.now() - t0) / 100) / 10, pid, ...m });
    }
    if (samples.length && samples.length % 60 === 0) write(); // a run that dies keeps what it had
  }, every * 1000);
  const code = await new Promise((res) => child.on("exit", (c) => res(c ?? 1)));
  clearInterval(timer);
  const s = write();
  const mib = (v) => (v == null ? "-" : v.toFixed(0));
  console.log(`[rss-soak] ${samples.length} samples, ${mib(s.firstMiB)} -> ${mib(s.lastMiB)} MiB (peak ${mib(s.peakMiB)}), slope ${s.slopeFirstHalf.toFixed(2)} then ${s.slopeSecondHalf.toFixed(2)} MiB/min: ${s.verdict}; 10-minute medians ${s.bins.map((b) => b.medianMiB.toFixed(0)).join(", ")}`);
  console.log(`[rss-soak] ${outFile}`);
  process.exit(code);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
