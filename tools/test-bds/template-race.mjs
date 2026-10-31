#!/usr/bin/env node
// Cold-cache world template race: N processes ask for the same template at the same moment (what `suite.mjs --jobs 2`
// does on a fresh cache). Exactly one may generate it, nobody may use a half-built template, and every process must end
// up with the same ready folder, no lock or staging folder left behind.
//   node tools/test-bds/template-race.mjs [--workers 3] [--flat] [--seed 1] [--cache <empty dir>] [--json <out>]
//     offline: the template generator is a stand-in that writes a level.dat with a random (261,5) spawn, so it needs no BDS
//   node tools/test-bds/template-race.mjs --real [--workers 2] [--flat] --cache <empty dir>
//     native: the real generator (one throwaway BDS) with a cold cache; lead-scheduled, it starts bedrock_server once
// Exit code: 0 when the race behaved, 1 otherwise (the reasons are printed and in --json).
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { ensureTemplate, isTemplateReady, readSpawn, templateKey, templatePath, FLAT_SPAWN } from "./lib/server.mjs";
import { T, writeLevelDat } from "./lib/nbt.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    workers: { type: "string", default: "3" }, flat: { type: "boolean", default: false }, seed: { type: "string", default: "1" },
    cache: { type: "string" }, real: { type: "boolean", default: false }, json: { type: "string" }, worker: { type: "boolean", default: false },
    "gen-ms": { type: "string", default: "600" },
  },
});

/** Writes a finished-looking world with the random flat spawn the real generator can produce. */
async function standInGenerator({ staging, flat }) {
  await new Promise((r) => setTimeout(r, Number(args["gen-ms"])));
  fs.mkdirSync(path.join(staging, "db"), { recursive: true });
  fs.writeFileSync(path.join(staging, "db", "CURRENT"), "MANIFEST-000001\n");
  const root = {
    LevelName: { type: T.STRING, value: "world" },
    SpawnX: { type: T.INT, value: 261 }, SpawnY: { type: T.INT, value: 5 }, SpawnZ: { type: T.INT, value: 5 },
    Generator: { type: T.INT, value: flat ? 2 : 1 },
  };
  fs.writeFileSync(path.join(staging, "level.dat"), writeLevelDat({ version: 10, rootName: "", root }));
}

if (args.worker) {
  const lines = [];
  const dest = templatePath(templateKey({ seed: args.seed, flat: args.flat }));
  let sawUnready = false;
  const watcher = setInterval(() => { if (fs.existsSync(dest) && !isTemplateReady(dest, { flat: args.flat })) sawUnready = true; }, 3);
  const t0 = Date.now();
  const got = await ensureTemplate({ seed: args.seed, flat: args.flat, log: (l) => lines.push(l), pollMs: 25, ...(args.real ? {} : { generate: standInGenerator }) });
  clearInterval(watcher);
  const spawnAt = args.flat ? readSpawn(path.join(got, "level.dat")) : null;
  console.log(JSON.stringify({ pid: process.pid, dest: got, ms: Date.now() - t0, generated: lines.some((l) => /generating world template/.test(l)), sawUnready, ready: isTemplateReady(got, { flat: args.flat }), spawn: spawnAt }));
  process.exit(0);
}

const workers = Math.max(2, Number(args.workers));
if (!args.cache) fs.mkdirSync(path.join(HERE, ".cache"), { recursive: true });
const cache = path.resolve(args.cache ?? fs.mkdtempSync(path.join(HERE, ".cache", "race-")));
fs.mkdirSync(cache, { recursive: true });
const problems = [];
if (fs.readdirSync(cache).length) problems.push(`the cache ${cache} is not empty: a race needs a cold cache`);
const childArgs = [fileURLToPath(import.meta.url), "--worker", "--seed", args.seed, "--gen-ms", args["gen-ms"], ...(args.flat ? ["--flat"] : []), ...(args.real ? ["--real"] : [])];
const results = await Promise.all(Array.from({ length: workers }, () => new Promise((resolve) => {
  const child = spawn(process.execPath, childArgs, { env: { ...process.env, BDS_HARNESS_CACHE: cache }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err += d));
  child.on("close", (code) => {
    let json = null;
    try { json = JSON.parse(out.trim().split("\n").at(-1)); } catch { /* reported below */ }
    resolve({ code, json, err: err.trim() });
  });
})));

for (const [i, r] of results.entries()) if (r.code !== 0 || !r.json) problems.push(`worker ${i} failed (exit ${r.code}): ${r.err || "no result"}`);
const ok = results.filter((r) => r.json).map((r) => r.json);
const generators = ok.filter((r) => r.generated).length;
if (generators !== 1) problems.push(`${generators} processes generated the template, not exactly 1`);
if (new Set(ok.map((r) => r.dest)).size > 1) problems.push(`the processes got different template folders: ${[...new Set(ok.map((r) => r.dest))].join(", ")}`);
for (const r of ok) {
  if (!r.ready) problems.push(`pid ${r.pid} was handed a template that is not ready`);
  if (r.sawUnready) problems.push(`pid ${r.pid} saw a template folder that was not ready (a consumer could have used it)`);
  if (args.flat && (!r.spawn || r.spawn.x !== FLAT_SPAWN.x || r.spawn.z !== FLAT_SPAWN.z)) problems.push(`pid ${r.pid}: flat spawn is ${JSON.stringify(r.spawn)}, not pinned to ${FLAT_SPAWN.x},${FLAT_SPAWN.z}`);
}
const leftovers = fs.existsSync(path.join(cache, "worlds")) ? fs.readdirSync(path.join(cache, "worlds")).filter((n) => /\.(lock|tmp-.*)$/.test(n)) : [];
if (leftovers.length) problems.push(`left behind: ${leftovers.join(", ")}`);

const summary = { workers, flat: args.flat, real: args.real, cache, generators, results: ok, problems };
if (args.json) fs.writeFileSync(path.resolve(args.json), JSON.stringify(summary, null, 2));
console.log(`template race: ${workers} workers, ${generators} generated, ${problems.length ? `PROBLEMS:\n  ${problems.join("\n  ")}` : "ok (one generation, one ready folder, no leftovers)"}`);
if (!args.cache) fs.rmSync(cache, { recursive: true, force: true });
process.exit(problems.length ? 1 : 0);
