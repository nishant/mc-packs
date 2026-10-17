#!/usr/bin/env node
// Runs behavior packs on a throwaway Bedrock Dedicated Server with simulated players.
// See README.md. Exit codes: 0 pass, 1 scenario failed, 2 script errors, 3 timeout,
// 4 server or harness problem, 64 bad arguments.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  HERE, IS_WIN, BDS_BIN, BDS_VERSION, makeServerDir, writeProps, baseProps,
  reservePortPair, releasePortPair, writeProcessIdentity, checkClientFeasibility,
  startBds, stopBds, ensureTemplate, bdsDir,
} from "./lib/server.mjs";
import { findPacks, installBehaviorPack, installResourcePack, installHarnessPack, HARNESS_PACK, gitSourceInfo } from "./lib/packs.mjs";
import { probeNativeBedrockBot } from "./lib/bot-adapter.mjs";

const USAGE = `usage: node run.mjs --packs <dir> [options]
  --packs <dir>          folder containing pack folders (default: ../../packs from this script, if present)
  --only a_bp,b_rp       install only these pack folders (default: every *_bp and *_rp)
  --scenario <file>      scenario module (default: idle, just watch startup)
  --ticks <n>            how long the idle scenario waits (default 200 = 10 s)
  --timeout <s>          give up after this many seconds in total (default 180; 3600 in --client-qa)
  --seed <n>             world seed (default 1; each seed's world is generated once and cached)
  --flat                 superflat world instead of a normal one
  --port <n>             explicit IPv4 port (also reserves port+1 for IPv6 across TCP+UDP)
  --transport <mode>     nethernet (default) or raknet (default for --client-qa and --bot-qa)
  --prop key=value       extra server.properties setting (repeatable)
  --allow-error <re>     do not fail on script errors matching this regex (repeatable)
  --strict               also fail on content log errors and on caught errors logged as warnings
  --no-shim              do not wrap packs with the shim (simulated players become invisible to them)
  --keep                 keep the temp server folder unconditionally
  --retain-on-failure    keep the temp server folder only when the run fails
  --evidence <file>      JSON evidence manifest path (default: <log>.evidence.json)
  --client-qa            interactive private client QA server (raknet + client-qa-fixture.js; stays alive)
  --bot-qa               run native BDS RakNet network-bot capability probe against the live server
  --log <file>           log file (default logs/<time>-<pid>.log next to run.mjs)
  --quiet                print only harness lines, warnings and errors (the log has everything)`;

let args;
try {
  args = parseArgs({
    options: {
      packs: { type: "string" }, only: { type: "string" }, scenario: { type: "string" },
      ticks: { type: "string", default: "200" }, timeout: { type: "string" },
      seed: { type: "string", default: "1" }, flat: { type: "boolean", default: false },
      port: { type: "string" }, transport: { type: "string" },
      prop: { type: "string", multiple: true, default: [] }, "allow-error": { type: "string", multiple: true, default: [] },
      strict: { type: "boolean", default: false }, "no-shim": { type: "boolean", default: false },
      keep: { type: "boolean", default: false }, "retain-on-failure": { type: "boolean", default: false },
      evidence: { type: "string" }, "client-qa": { type: "boolean", default: false },
      "bot-qa": { type: "boolean", default: false },
      log: { type: "string" }, quiet: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  }).values;
} catch (e) {
  console.error(String(e.message) + "\n" + USAGE);
  process.exit(64);
}
if (args.help) { console.log(USAGE); process.exit(0); }

const isClientQa = Boolean(args["client-qa"]);
const isBotQa = Boolean(args["bot-qa"]);
const defaultPacks = path.resolve(HERE, "..", "..", "packs");
const packsDir = path.resolve(args.packs || (fs.existsSync(defaultPacks) ? defaultPacks : ""));
if (!args.packs && !fs.existsSync(defaultPacks)) { console.error("--packs is required\n" + USAGE); process.exit(64); }
if (!fs.existsSync(packsDir)) { console.error(`no such packs folder: ${packsDir}`); process.exit(64); }
const onlyArg = args.only || (isClientQa ? "map_bp,stash_bp,npc_bp,hud_rp,build_rp" : undefined);
const defaultScenario = isClientQa
  ? path.join(HERE, "examples", "client-qa-fixture.js")
  : path.join(HERE, "lib", "idle-scenario.js");
const scenarioFile = path.resolve(args.scenario || defaultScenario);
if (!fs.existsSync(scenarioFile)) { console.error(`no such scenario: ${scenarioFile}`); process.exit(64); }
const timeoutS = Number(args.timeout || (isClientQa ? "3600" : "180"));
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);

const logFile = path.resolve(args.log || path.join(process.env.BDS_HARNESS_LOGS || path.join(HERE, "logs"), `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.log`));
const evidenceFile = path.resolve(args.evidence || `${logFile}.evidence.json`);
fs.mkdirSync(path.dirname(logFile), { recursive: true });
fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });
const logStream = fs.createWriteStream(logFile);
const say = (s) => { console.log(s); logStream.write(s + "\n"); };

// ---------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------

let packs;
try {
  packs = findPacks(packsDir, onlyArg);
} catch (e) {
  console.error(String(e.message)); process.exit(64);
}
const bps = packs.filter((p) => p.kind === "bp"), rps = packs.filter((p) => p.kind === "rp");
const nameToFolder = new Map(packs.map((p) => [p.name, p.folder]));
nameToFolder.set(HARNESS_PACK.name, "harness test pack (scenario)");
const gitInfo = gitSourceInfo(packsDir);
const transport = args.transport || (isBotQa && !isClientQa ? "raknet" : "nethernet");
const shimEnabled = !args["no-shim"];

say(`[harness] BDS ${bdsDir()} (${BDS_VERSION}) | git ${gitInfo.commit || "unknown"}${gitInfo.dirty ? " (dirty)" : ""} | packs ${packsDir}: ${bps.length} behavior, ${rps.length} resource | transport ${transport} | scenario ${scenarioFile}`);
say(`[harness] log ${logFile}`);
say(`[harness] evidence ${evidenceFile}`);

let serverDir, bds, port;
let retainedDir = false;
let cleaned = false;
const stagedPacks = [];
let botQaResult = null;
const clientFeasibility = isClientQa ? checkClientFeasibility() : null;
const phaseTimestamps = { t0 };

async function cleanup(exitCode = 0) {
  if (cleaned) return;
  cleaned = true;
  const tStop = Date.now();
  if (bds && bds.proc.exitCode === null) {
    await stopBds(bds);
  }
  phaseTimestamps.teardownMs = Date.now() - tStop;
  if (port !== undefined) releasePortPair(port);
  retainedDir = Boolean(args.keep || (args["retain-on-failure"] && exitCode !== 0));
  if (serverDir && !retainedDir) fs.rmSync(serverDir, { recursive: true, force: true });
}
process.on("SIGINT", async () => {
  say("[harness] interrupted");
  if (isClientQa && done) { await finish("signal"); return; }
  await cleanup(130);
  process.exit(130);
});
process.on("SIGTERM", async () => {
  if (isClientQa && done) { await finish("signal"); return; }
  await cleanup(143);
  process.exit(143);
});

try {
  if (!fs.existsSync(path.join(bdsDir(), BDS_BIN))) {
    say(`[harness] no BDS at ${bdsDir()}: downloading it first`);
    (await import("./setup.mjs")).setup();
  }
  const template = await ensureTemplate({ seed: args.seed, flat: args.flat, log: say });
  serverDir = makeServerDir();
  const extra = {};
  if (args.transport || isClientQa || isBotQa) extra["transport"] = transport;
  if (isClientQa) {
    extra["default-player-permission-level"] = "operator";
    extra["texturepack-required"] = "true";
    extra["enable-lan-visibility"] = "true";
    extra["server-name"] = "MC-Packs Private Client QA";
  }
  for (const kv of args.prop) { const i = kv.indexOf("="); if (i > 0) extra[kv.slice(0, i)] = kv.slice(i + 1); }
  const requestedPort = args.port
    ? Number(args.port)
    : (extra["server-port"] ? Number(extra["server-port"]) : undefined);
  port = await reservePortPair(requestedPort);
  delete extra["server-port"];
  delete extra["server-portv6"];
  writeProps(serverDir, baseProps(port, extra));
  const world = path.join(serverDir, "worlds", "world");
  fs.cpSync(template, world, { recursive: true });
  const bpList = [];
  for (const p of bps) {
    bpList.push(installBehaviorPack(p, serverDir, { shim: shimEnabled }));
    stagedPacks.push(p.stagedInfo);
  }
  bpList.push(installHarnessPack(serverDir, scenarioFile));
  const rpList = [];
  for (const p of rps) {
    rpList.push(installResourcePack(p, serverDir));
    stagedPacks.push(p.stagedInfo);
  }
  const mismatch = stagedPacks.find((m) => !m.verified);
  if (mismatch) {
    throw new Error(`staged pack verification failed for ${mismatch.folder}: sourceSha256=${mismatch.sourceSha256} stagedSha256=${mismatch.stagedSha256}`);
  }
  fs.writeFileSync(path.join(world, "world_behavior_packs.json"), JSON.stringify(bpList, null, 2));
  fs.writeFileSync(path.join(world, "world_resource_packs.json"), JSON.stringify(rpList, null, 2));
  phaseTimestamps.stagingDone = Date.now();
  phaseTimestamps.stagingMs = phaseTimestamps.stagingDone - t0;
} catch (e) {
  say(`[harness] setup failed: ${e.stack || e}`);
  await cleanup(4);
  process.exit(4);
}
say(`[harness] server ${serverDir} port ${port}/${port + 1} (${transport}, prepared in ${secs()} s, ${stagedPacks.length} packs SHA-256 verified)`);

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

async function maybeRunBotProbe() {
  if (!isBotQa || botQaResult) return;
  const tProbe = Date.now();
  const transportErrorLogged = contentErrors.some((e) => /TRANSPORT TYPE ERROR|only supported transport type/i.test(e.text));
  say(`[bot-qa] probing native BDS (${transport}) on 127.0.0.1:${port} ...`);
  botQaResult = await probeNativeBedrockBot({
    host: "127.0.0.1",
    port,
    transport,
    bdsVersion: BDS_VERSION,
    transportErrorLogged,
  });
  phaseTimestamps.botProbeMs = Date.now() - tProbe;
  say(`[bot-qa] gate=${botQaResult.gate} | ${botQaResult.summary}`);
}

function buildEvidence({ status, exitCode, verdict }) {
  const allowed = (e) => allowPatterns.some((r) => r.test(e.text));
  const errs = scriptErrors.filter((e) => !allowed(e));
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    status,
    verdict,
    exitCode,
    mode: isClientQa ? "client-qa" : (isBotQa ? "bot-qa" : "headless"),
    git: gitInfo,
    bds: {
      version: BDS_VERSION,
      dir: bdsDir(),
      serverDir,
      retained: retainedDir,
      runnerPid: process.pid,
      bdsPid: bds?.proc?.pid ?? null,
      transport,
      shimEnabled,
      host: "127.0.0.1",
      port,
      portV6: port + 1,
    },
    scenario: {
      file: scenarioFile,
      ok: done ? Boolean(done.ok) : false,
      message: done?.msg ?? null,
      lines: scenarioLines,
    },
    stagedPacks,
    gates: {
      server: exitCode === 0 && done?.ok ? "verified" : (status === "ready_waiting_for_client" && done?.ok ? "verified" : "failed"),
      network: botQaResult ? botQaResult.gate : (isClientQa && serverStarted ? "nethernet_listening" : "unverified"),
      visual: "unverified",
      visualNote: "Headless BDS and RakNet protocol probes never render JSON UI, terrain pixels, or entity nameplates; visual gate requires real client capture.",
    },
    timings: {
      stagingMs: phaseTimestamps.stagingMs ?? null,
      serverBootMs: phaseTimestamps.serverBootMs ?? null,
      readinessMs: phaseTimestamps.readinessMs ?? null,
      scenarioMs: phaseTimestamps.scenarioMs ?? null,
      botProbeMs: phaseTimestamps.botProbeMs ?? null,
      teardownMs: phaseTimestamps.teardownMs ?? null,
      totalMs: Date.now() - t0,
    },
    errors: {
      scriptErrors: errs,
      warnErrors,
      contentErrors,
      watchdog,
    },
    botQa: botQaResult,
    clientFeasibility,
    logFile,
    evidenceFile,
  };
}

function writeEvidence(info) {
  const doc = buildEvidence(info);
  fs.writeFileSync(evidenceFile, JSON.stringify(doc, null, 2));
  return doc;
}

function onHarness(obj) {
  switch (obj.type) {
    case "ready":
      ready = true;
      phaseTimestamps.readyAt = Date.now();
      phaseTimestamps.readinessMs = phaseTimestamps.readyAt - (phaseTimestamps.serverStartedAt || phaseTimestamps.launchAt || t0);
      maybeStart();
      return "";
    case "start":
      phaseTimestamps.scenarioStartAt = Date.now();
      timings.scenarioStart = secs();
      return `[scenario] started at ${secs()} s`;
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
      phaseTimestamps.scenarioDoneAt = Date.now();
      phaseTimestamps.scenarioMs = phaseTimestamps.scenarioDoneAt - (phaseTimestamps.scenarioStartAt || phaseTimestamps.readyAt || t0);
      timings.scenarioDone = secs();
      Promise.resolve()
        .then(() => maybeRunBotProbe())
        .then(() => {
          if (isClientQa && done.ok) {
            writeProcessIdentity(serverDir, {
              status: "ready_waiting_for_client",
              bdsPid: bds?.proc?.pid ?? null,
              port,
              portV6: port + 1,
              transport,
              logFile,
              evidenceFile,
              scenarioFile,
            });
            writeEvidence({ status: "ready_waiting_for_client", exitCode: 0, verdict: "CLIENT_QA_READY" });
            say(`[client-qa] READY on 127.0.0.1:${port} (IPv6 ${port + 1}, transport=${transport}) | BDS PID ${bds?.proc?.pid} | Runner PID ${process.pid}`);
            say(`[client-qa] live evidence manifest: ${evidenceFile}`);
            if (clientFeasibility && !clientFeasibility.uwpLoopbackExempt) {
              say(`[client-qa] NOTE: ${clientFeasibility.loopbackNote}`);
            }
          } else {
            setTimeout(finish, 800);
          }
        });
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
  const h = /\[Scripting\] HARNESS (\{.*\})\s*$/.exec(text);
  if (h) {
    let obj;
    try { obj = JSON.parse(h[1]); } catch (e) { console.log(line); return; }
    const s = onHarness(obj);
    if (s) console.log(s);
    return;
  }
  if (text.includes("Server started.")) {
    serverStarted = true;
    phaseTimestamps.serverStartedAt = Date.now();
    phaseTimestamps.serverBootMs = phaseTimestamps.serverStartedAt - (phaseTimestamps.launchAt || t0);
    timings.serverStarted = secs();
    maybeStart();
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
  phaseTimestamps.launchAt = Date.now();
  const me = startBds(serverDir, onLine);
  bds = me;
  writeProcessIdentity(serverDir, {
    status: "starting",
    bdsPid: me.proc.pid,
    port,
    portV6: port + 1,
    transport,
    logFile,
    evidenceFile,
    scenarioFile,
  });
  me.exited.then((code) => {
    if (!finished && !restarting && bds === me) { fatal ||= `server exited unexpectedly (code ${code})`; finish("exit"); }
  });
}
if (isClientQa && process.stdin.readable) {
  let stdinBuf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    stdinBuf += chunk;
    const parts = stdinBuf.split(/\r?\n/);
    stdinBuf = parts.pop();
    for (const cmd of parts) {
      if (cmd.trim() && bds && bds.proc.exitCode === null) bds.send(cmd.trim());
    }
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
  const tStop = Date.now();
  if (bds.proc.exitCode === null) await stopBds(bds);
  phaseTimestamps.teardownMs = Date.now() - tStop;
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

  retainedDir = Boolean(args.keep || (args["retain-on-failure"] && code !== 0));
  const evidenceDoc = writeEvidence({ status: "completed", exitCode: code, verdict });

  const L = [];
  L.push("");
  L.push("=".repeat(72));
  L.push(`RESULT: ${verdict}`);
  L.push(`gates: server=${evidenceDoc.gates.server} | network=${evidenceDoc.gates.network} | visual=${evidenceDoc.gates.visual}`);
  L.push(`scenario: ${done ? `${done.ok ? "passed" : "failed"} - ${done.msg}` : "no result"}`);
  L.push(`time: ${secs()} s total (staging ${evidenceDoc.timings.stagingMs ?? "-"} ms, boot ${evidenceDoc.timings.serverBootMs ?? "-"} ms, ready ${evidenceDoc.timings.readinessMs ?? "-"} ms, scenario ${evidenceDoc.timings.scenarioMs ?? "-"} ms, teardown ${evidenceDoc.timings.teardownMs ?? "-"} ms)`);
  L.push(`packs: ${bps.length} behavior, ${rps.length} resource (git ${gitInfo.commit ? gitInfo.commit.slice(0, 12) : "unknown"}${gitInfo.dirty ? " dirty" : ""})`);
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
  L.push(`log: ${logFile}`);
  L.push(`evidence: ${evidenceFile}`);
  if (retainedDir) L.push(`server folder kept: ${serverDir}`);
  L.push("=".repeat(72));
  say(L.join("\n"));
  logStream.end(async () => {
    await cleanup(code);
    process.exit(code);
  });
}
