#!/usr/bin/env node
// Runs behavior packs on a throwaway Bedrock Dedicated Server with simulated players.
// See README.md. Exit codes: 0 pass, 1 scenario failed, 2 script errors, 3 timeout,
// 4 server or harness problem, 64 bad arguments.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { HERE, IS_WIN, BDS_BIN, makeServerDir, writeProps, baseProps, freePort, startBds, stopBds, ensureTemplate, bdsDir } from "./lib/server.mjs";
import { findPacks, installBehaviorPack, installResourcePack, installHarnessPack, HARNESS_PACK } from "./lib/packs.mjs";
import { Profile } from "./lib/profile-report.mjs";

const USAGE = `usage: node run.mjs --packs <dir> [options]
  --packs <dir>        folder containing pack folders (default: ../../packs from this script, if present)
  --only a_bp,b_rp     install only these pack folders (default: every *_bp and *_rp)
  --scenario <file>    scenario module (default: idle, just watch startup)
  --ticks <n>          how long the idle scenario waits (default 200 = 10 s)
  --timeout <s>        give up after this many seconds in total (default 180)
  --seed <n>           world seed (default 1; each seed's world is generated once and cached)
  --flat               superflat world instead of a normal one
  --prop key=value     extra server.properties setting (repeatable)
  --allow-error <re>   do not fail on script errors matching this regex (repeatable)
  --strict             also fail on content log errors and on caught errors logged as warnings
  --no-shim            do not wrap packs with the shim (simulated players become invisible to them)
  --keep               keep the temp server folder
  --log <file>         log file (default logs/<time>-<pid>.log next to run.mjs)
  --quiet              print only harness lines, warnings and errors (the log has everything)
  --no-relay           do not relay pack messages to the scenario (t.messages stays empty; forms still work)
  --profile            time every pack's callbacks during the scenario and report per pack (see README)
  --profile-every <s>  with --profile: also print an interim report every s seconds (default 60, 0 = off)
  --profile-json <f>   with --profile: where to write the JSON report (default: the log file + .profile.json)`;

let args;
try {
  args = parseArgs({
    options: {
      packs: { type: "string" }, only: { type: "string" }, scenario: { type: "string" },
      ticks: { type: "string", default: "200" }, timeout: { type: "string", default: "180" },
      seed: { type: "string", default: "1" }, flat: { type: "boolean", default: false },
      prop: { type: "string", multiple: true, default: [] }, "allow-error": { type: "string", multiple: true, default: [] },
      strict: { type: "boolean", default: false }, "no-shim": { type: "boolean", default: false },
      keep: { type: "boolean", default: false }, log: { type: "string" }, quiet: { type: "boolean", default: false },
      "no-relay": { type: "boolean", default: false },
      profile: { type: "boolean", default: false }, "profile-every": { type: "string", default: "60" }, "profile-json": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  }).values;
} catch (e) {
  console.error(String(e.message) + "\n" + USAGE);
  process.exit(64);
}
if (args.help) { console.log(USAGE); process.exit(0); }

const defaultPacks = path.resolve(HERE, "..", "..", "packs");
const packsDir = path.resolve(args.packs || (fs.existsSync(defaultPacks) ? defaultPacks : ""));
if (!args.packs && !fs.existsSync(defaultPacks)) { console.error("--packs is required\n" + USAGE); process.exit(64); }
if (!fs.existsSync(packsDir)) { console.error(`no such packs folder: ${packsDir}`); process.exit(64); }
const scenarioFile = path.resolve(args.scenario || path.join(HERE, "lib", "idle-scenario.js"));
if (!fs.existsSync(scenarioFile)) { console.error(`no such scenario: ${scenarioFile}`); process.exit(64); }
const timeoutS = Number(args.timeout);
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);

const logFile = path.resolve(args.log || path.join(process.env.BDS_HARNESS_LOGS || path.join(HERE, "logs"), `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.log`));
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const logStream = fs.createWriteStream(logFile);
const say = (s) => { console.log(s); logStream.write(s + "\n"); };
const profile = args.profile ? new Profile({ say, everyS: Number(args["profile-every"]) || 0, json: path.resolve(args["profile-json"] || logFile.replace(/\.log$/, "") + ".profile.json"), scenario: scenarioFile }) : null;

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

let packs;
try {
  packs = findPacks(packsDir, args.only);
} catch (e) {
  console.error(String(e.message)); process.exit(64);
}
const bps = packs.filter((p) => p.kind === "bp"), rps = packs.filter((p) => p.kind === "rp");
const nameToFolder = new Map(packs.map((p) => [p.name, p.folder]));
nameToFolder.set(HARNESS_PACK.name, "harness test pack (scenario)");

say(`[harness] BDS ${bdsDir()} | packs ${packsDir}: ${bps.length} behavior, ${rps.length} resource | scenario ${scenarioFile}`);
say(`[harness] log ${logFile}`);

let serverDir, bds;
let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  if (bds && bds.proc.exitCode === null) {
    try { IS_WIN ? bds.proc.kill() : bds.proc.kill("SIGKILL"); } catch (e) { /* gone */ }
    await bds.exited;
  }
  if (serverDir && !args.keep) fs.rmSync(serverDir, { recursive: true, force: true });
}
process.on("SIGINT", async () => { say("[harness] interrupted"); await cleanup(); process.exit(130); });
process.on("SIGTERM", async () => { await cleanup(); process.exit(143); });

let port;
try {
  if (!fs.existsSync(path.join(bdsDir(), BDS_BIN))) {
    say(`[harness] no BDS at ${bdsDir()}: downloading it first`);
    (await import("./setup.mjs")).setup();
  }
  const template = await ensureTemplate({ seed: args.seed, flat: args.flat, log: say });
  serverDir = makeServerDir();
  port = await freePort();
  const extra = {};
  for (const kv of args.prop) { const i = kv.indexOf("="); if (i > 0) extra[kv.slice(0, i)] = kv.slice(i + 1); }
  writeProps(serverDir, baseProps(port, extra));
  const world = path.join(serverDir, "worlds", "world");
  fs.cpSync(template, world, { recursive: true });
  const bpList = bps.map((p) => installBehaviorPack(p, serverDir, { shim: !args["no-shim"], profile: !!profile, relay: !args["no-relay"] }));
  bpList.push(installHarnessPack(serverDir, scenarioFile));
  const rpList = rps.map((p) => installResourcePack(p, serverDir));
  fs.writeFileSync(path.join(world, "world_behavior_packs.json"), JSON.stringify(bpList, null, 2));
  fs.writeFileSync(path.join(world, "world_resource_packs.json"), JSON.stringify(rpList, null, 2));
} catch (e) {
  say(`[harness] setup failed: ${e.stack || e}`);
  await cleanup();
  process.exit(4);
}
say(`[harness] server ${serverDir} port ${port} (prepared in ${secs()} s)`);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const scriptErrors = []; // {phase, pack, text}
const contentErrors = [];
const warnErrors = []; // [Scripting] WARN lines that report a caught error
const watchdog = [];
const scenarioLines = [];
const allowPatterns = args["allow-error"].map((s) => new RegExp(s));
let phase = "startup";
let serverStarted = false, ready = false, startSent = false;
let done = null; // {ok, msg}
let lastRecord = null;
let fatal = "";
const timings = {};

const LINE = /^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d:\d+) (\w+)\] ?(.*)$/;
const NOISE = [/TELEMETRY|Telemetry is currently|emit-server-telemetry|telemetry helps|to the server\.properties file in the handheld|^=+$/i];
const BENIGN_ERRORS = [/NO LOG FILE/, /Missing id, won't persist permissions/];

function attribute(text) {
  let m = /^\[Scripting\] \[([^\]]+)\]/.exec(text) || /Plugin \[(.+?) - [\d.]+\]/.exec(text);
  if (m) return nameToFolder.get(m[1]) ?? m[1];
  m = /^\[Scripting\] \[(\w+)\]/.exec(text);
  return m ? m[1] : "unknown";
}

function onHarness(obj) {
  switch (obj.type) {
    case "ready": ready = true; maybeStart(); return "";
    case "start": timings.scenarioStart = secs(); if (profile) profile.start(bds); return `[scenario] started at ${secs()} s`;
    case "log": scenarioLines.push(obj.msg); return `[scenario] ${obj.msg}`;
    case "check": scenarioLines.push(`${obj.ok ? "ok" : "FAILED"}: ${obj.msg}`); return `[scenario] ${obj.ok ? "ok" : "FAILED"}: ${obj.msg}`;
    case "player": return `[scenario] spawned simulated player ${obj.name} at ${obj.location.x} ${obj.location.y} ${obj.location.z}${obj.standingOn ? ` on ${obj.standingOn}` : ""}`;
    case "cmd": return `[scenario] ${obj.as} ran /${String(obj.cmd).replace(/^\//, "")} -> ${obj.ok ? "ok" : "not ok"}${obj.error ? ` (${obj.error})` : ""}`;
    case "console": bds.send(obj.cmd); return `[scenario] console: ${obj.cmd}`;
    case "msg": return `[msg ${obj.kind} ${obj.pack} -> ${obj.to}] ${String(obj.text).replace(/\n/g, " | ")}`;
    case "form": return `[form ${obj.form} ${obj.pack} -> ${obj.player}] "${obj.title}"${obj.buttons && obj.buttons.length ? " buttons: " : ""}${(obj.buttons || []).filter((b) => b !== null).map((b) => String(b).replace(/\n/g, " / ")).join(" | ")}${obj.elements ? ` inputs: ${obj.elements.filter((e) => "default" in e).map((e) => `${e.kind}:${e.label}`).join(", ")}` : ""}`;
    case "form_answer": return `[form answer ${obj.player}] "${obj.title}" -> ${JSON.stringify(obj.response)}`;
    case "allow_error": allowPatterns.push(new RegExp(obj.pattern, obj.flags)); return `[scenario] allowing errors matching /${obj.pattern}/`;
    case "error": scenarioLines.push(`harness error: ${obj.msg}`); return `[scenario] harness error: ${obj.msg}`;
    case "done":
      if (obj.restart && runPhase < MAX_PHASES) {
        setTimeout(restartServer, 500);
        return `[scenario] phase ${obj.phase} done: ${obj.msg}; restarting the server`;
      }
      done = obj;
      timings.scenarioDone = secs();
      if (profile) { profile.finalDump(); setTimeout(finish, 5000); } else setTimeout(finish, 1000);
      return `[scenario] done: ${obj.ok ? "PASS" : "FAIL"} - ${obj.msg}`;
    default: return `[scenario] ${JSON.stringify(obj)}`;
  }
}

function maybeStart() {
  if (startSent || !serverStarted || !ready) return;
  startSent = true;
  phase = runPhase > 1 ? `scenario ${runPhase}` : "scenario";
  const cfg = { packs: packs.map((p) => p.folder), idleTicks: Number(args.ticks), phase: runPhase };
  bds.send(`scriptevent harness:start ${JSON.stringify(cfg)}`);
}

function onLine(line) {
  logStream.write(line + "\n");
  if (!line.trim()) return;
  const m = LINE.exec(line);
  if (!m) {
    // Continuation of the previous record (stack traces).
    if (lastRecord) { lastRecord.text += "\n" + line; }
    if (!args.quiet) console.log(line);
    return;
  }
  const [, , level, text] = m;
  lastRecord = null;
  if (NOISE.some((r) => r.test(text))) return;
  if (profile && profile.onLine(text)) return;
  const h = /\[Scripting\] HARNESS (\{.*\})\s*$/.exec(text);
  if (h) {
    let obj;
    try { obj = JSON.parse(h[1]); } catch (e) { console.log(line); return; }
    const s = onHarness(obj);
    if (s) console.log(s);
    return;
  }
  if (text.includes("Server started.")) {
    serverStarted = true; timings.serverStarted = secs(); maybeStart();
    const p = runPhase;
    setTimeout(() => { if (!startSent && runPhase === p && !finished) { fatal ||= "the harness test pack never reported ready (did it load?)"; finish("exit"); } }, 20000);
  }
  if (/may be in use by another process|Exiting program/.test(text)) fatal = text;
  let show = !args.quiet;
  if (level === "ERROR" && !BENIGN_ERRORS.some((r) => r.test(text))) {
    show = true;
    if (text.startsWith(`[Scripting] Plugin [${HARNESS_PACK.name} - `)) {
      fatal = `the scenario or test pack failed to load: ${text}`;
      setTimeout(() => finish("exit"), 300);
    }
    if (text.startsWith("[Scripting]")) {
      // "Plugin [x] - [main.js] ran with error" repeats the error just reported.
      if (!/^\[Scripting\] Plugin \[/.test(text)) { lastRecord = { phase, pack: attribute(text), text }; scriptErrors.push(lastRecord); }
    } else {
      lastRecord = { phase, text };
      contentErrors.push(lastRecord);
    }
  } else if (text.startsWith("[Scripting]") && /\b(error|exception)\b/i.test(text) && level === "WARN") {
    lastRecord = { phase, pack: attribute(text), text };
    warnErrors.push(lastRecord);
    show = true;
  } else if (/watchdog/i.test(text)) {
    watchdog.push({ phase, text });
    show = true;
  } else if (level === "WARN" && !text.startsWith("[Scripting]")) {
    show = true;
  }
  if (show) console.log(line);
}

let finished = false, restarting = false, runPhase = 1;
const MAX_PHASES = 10;
function launch() {
  const me = startBds(serverDir, onLine);
  bds = me;
  me.exited.then((code) => {
    if (!finished && !restarting && bds === me) { fatal ||= `server exited unexpectedly (code ${code})`; finish("exit"); }
  });
}
async function restartServer() {
  restarting = true;
  await stopBds(bds);
  runPhase++;
  serverStarted = false; ready = false; startSent = false; phase = `restart ${runPhase - 1}`;
  say(`[harness] restarting the server (phase ${runPhase})`);
  restarting = false;
  if (!finished) launch();
}
launch();
const timer = setTimeout(() => finish("timeout"), timeoutS * 1000 - (Date.now() - t0));

async function finish(reason) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (profile) profile.stop();
  if (bds.proc.exitCode === null) await stopBds(bds);
  summary(reason);
}

function summary(reason) {
  const allowed = (e) => allowPatterns.some((r) => r.test(e.text));
  const errs = scriptErrors.filter((e) => !allowed(e));
  const ignored = scriptErrors.length - errs.length;
  let code = 0, verdict = "PASS";
  if (reason === "timeout") { code = 3; verdict = `TIMEOUT after ${timeoutS} s${startSent ? "" : " (scenario never started)"}`; }
  else if (!done) { code = 4; verdict = `SERVER PROBLEM: ${fatal || "no result from the scenario"}`; }
  else if (!done.ok) { code = 1; verdict = "FAIL (scenario)"; }
  if (code === 0 && errs.length) { code = 2; verdict = "FAIL (script errors)"; }
  if (code === 0 && args.strict && (contentErrors.length || warnErrors.length)) { code = 2; verdict = "FAIL (strict: content errors or caught errors)"; }

  const L = [];
  L.push("");
  L.push("=".repeat(72));
  L.push(`RESULT: ${verdict}`);
  L.push(`scenario: ${done ? `${done.ok ? "passed" : "failed"} - ${done.msg}` : "no result"}`);
  L.push(`time: ${secs()} s total; server started at ${timings.serverStarted ?? "-"} s; scenario ${timings.scenarioStart ?? "-"} -> ${timings.scenarioDone ?? "-"} s`);
  L.push(`packs: ${bps.length} behavior, ${rps.length} resource`);
  const group = (list) => {
    const by = new Map();
    for (const e of list) { const k = e.pack ?? "-"; if (!by.has(k)) by.set(k, []); by.get(k).push(e); }
    return by;
  };
  const short = (t) => t.replace(/^\[Scripting\] /, "").split("\n").map((l) => l.trim()).filter(Boolean).join(" | ").slice(0, 400);
  L.push(`script errors: ${errs.length}${ignored ? ` (+${ignored} allowed by --allow-error/t.allowError)` : ""}`);
  for (const [pack, list] of group(errs)) {
    L.push(`  ${pack}: ${list.length}`);
    for (const e of list.slice(0, 5)) L.push(`    [${e.phase}] ${short(e.text)}`);
    if (list.length > 5) L.push(`    ... ${list.length - 5} more`);
  }
  if (warnErrors.length) {
    L.push(`caught errors logged as warnings: ${warnErrors.length}`);
    for (const e of warnErrors.slice(0, 15)) L.push(`    [${e.phase}] ${short(e.text)}`);
  }
  if (contentErrors.length) {
    L.push(`content log errors: ${contentErrors.length}`);
    for (const e of contentErrors.slice(0, 15)) L.push(`    [${e.phase}] ${short(e.text)}`);
  }
  if (watchdog.length) {
    L.push(`watchdog: ${watchdog.length}`);
    for (const e of watchdog.slice(0, 5)) L.push(`    [${e.phase}] ${short(e.text)}`);
  }
  if (scenarioLines.length) {
    L.push("scenario messages:");
    for (const s of scenarioLines.slice(-40)) L.push(`  ${s}`);
  }
  if (profile) L.push(...profile.report());
  L.push(`log: ${logFile}`);
  if (args.keep) L.push(`server folder kept: ${serverDir}`);
  L.push("=".repeat(72));
  say(L.join("\n"));
  logStream.end(async () => {
    await cleanup();
    process.exit(code);
  });
}
