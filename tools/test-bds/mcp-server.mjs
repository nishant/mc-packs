#!/usr/bin/env node
// Local stdio MCP server for private Bedrock Dedicated Server (BDS) QA runs.
// Wraps tools/test-bds/run.mjs (--client-qa) with strict input validation,
// single-owned-instance lifecycle, exact git/staged pack SHA-256 provenance,
// correlated qa:cmd step ACKs, and redacted event/log tails.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HERE, IS_WIN, releasePortPair } from "./lib/server.mjs";

export const ALLOWLISTED_STEPS = /** @type {const} */ ([
  "overview",
  "map_bridge",
  "map_roof",
  "map_spire",
  "map_cave",
  "sidebar_long",
  "stash_fill",
  "stash_next",
  "stash_prev",
  "stash_open",
  "npc_5m",
  "npc_10m",
  "npc_15m",
  "npc_20m",
  "npc_25m",
  "npc_probe_always",
  "npc_probe_looked_at",
  "state_snapshot",
]);

const DEFAULT_CLIENT_QA_PACKS = ["map_bp", "stash_bp", "npc_bp", "hud_rp", "build_rp"];

/**
 * Redacts Xbox/PlayFab identities, JWT/auth tokens, and non-loopback client IPs from log lines.
 * Preserves local loopback addresses (127.0.0.1, 0.0.0.0, ::1, ::) for port diagnostics.
 * @param {string} line
 * @returns {string}
 */
export function redactLogLine(line) {
  if (typeof line !== "string") return "";
  return line
    // xuid patterns: xuid: 2535..., "xuid":"2535...", xuid=2535...
    .replace(/\b(xuid\s*[:=]\s*["']?)([0-9a-fA-F-]{8,36})(["']?)/gi, "$1[REDACTED_XUID]$3")
    .replace(/("xuid"\s*:\s*")([^"]+)(")/gi, "$1[REDACTED_XUID]$3")
    // pfid / PlayFab ID patterns
    .replace(/\b((?:pfid|playfabid)\s*[:=]\s*["']?)([0-9a-fA-F-]{8,36})(["']?)/gi, "$1[REDACTED_PFID]$3")
    .replace(/("(?:pfid|playfabId)"\s*:\s*")([^"]+)(")/gi, "$1[REDACTED_PFID]$3")
    // JWT / bearer / auth tokens
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b((?:access_token|authorization|session_token|device_id)\s*[:=]\s*["']?)([^\s"',}]+)(["']?)/gi, "$1[REDACTED_SECRET]$3")
    // Non-loopback IPv4 addresses (preserve 127.0.0.1 and 0.0.0.0, plus version strings like 1.26.52.3)
    .replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d{2,5})\b/g, (full, ip, portSuffix) => {
      if (ip === "127.0.0.1" || ip === "0.0.0.0") return full;
      return `[REDACTED_IP]${portSuffix}`;
    });
}

/**
 * Safely kills a single owned PID (and its child tree on Windows via /PID) without name-based kills.
 * @param {number | null | undefined} pid
 */
function killOwnedPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, 0);
  } catch {
    return;
  }
  try {
    if (IS_WIN) {
      spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {}
}

async function waitForPidExit(pid, timeoutMs = 1500) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Extracts a `QA_* {...}` message from either a BDS `[Scripting] HARNESS {"type":"log","msg":"..."}` line
 * or a formatted `[scenario] (log: )?QA_* {...}` line.
 * @param {string} rawLine
 * @returns {string | null}
 */
function extractScenarioMsg(rawLine) {
  if (!rawLine) return null;
  const harnessMatch = /\[Scripting\]\s*HARNESS\s*(\{.*\})\s*$/.exec(rawLine);
  if (harnessMatch) {
    try {
      const obj = JSON.parse(harnessMatch[1]);
      if (obj && obj.type === "log" && typeof obj.msg === "string") {
        return obj.msg;
      }
    } catch {}
  }
  const directMatch = /\[scenario\]\s*(?:log:\s*)?(QA_[A-Z_]+\s+\{.*\})\s*$/.exec(rawLine);
  if (directMatch) return directMatch[1];
  return null;
}

/**
 * Parses structured QA events from a harness log file.
 * @param {string} logText
 */
export function parseQaLogEvents(logText) {
  const lines = logText.split(/\r?\n/);
  const events = [];
  let fixtureManifest = null;
  const joinedPlayers = new Map();
  let lastStepAck = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const msg = extractScenarioMsg(rawLine);
    if (msg) {
      const m = /^(QA_FIXTURE_READY|QA_CLIENT_JOINED|QA_CLIENT_JOIN_ERROR|QA_STEP_APPLIED|QA_STEP_ERROR)\s+(\{.*\})$/.exec(msg);
      if (m) {
        try {
          const type = m[1];
          const data = JSON.parse(m[2]);
          if (type === "QA_FIXTURE_READY") {
            fixtureManifest = data;
          } else if (type === "QA_CLIENT_JOINED" && data.player) {
            joinedPlayers.set(data.player, data);
          } else if (type === "QA_STEP_APPLIED") {
            lastStepAck = { ok: true, ...data };
          } else if (type === "QA_STEP_ERROR") {
            lastStepAck = { ok: false, ...data };
          }
          events.push({ type, line: i + 1, data });
          continue;
        } catch {}
      }
    }
    if (/\[Scripting\]\[error\]/i.test(rawLine) || /\[ContentLog\]\[error\]/i.test(rawLine) || /\bERROR\]\s*\[Scripting\]/i.test(rawLine)) {
      events.push({ type: "SERVER_ERROR", line: i + 1, text: redactLogLine(rawLine) });
    }
  }

  return {
    events,
    fixtureManifest,
    joinedPlayers: [...joinedPlayers.values()],
    lastStepAck,
  };
}

export class BedrockQaMcpController {
  /**
   * @param {{
   *   packsDir?: string,
   *   logsDir?: string,
   *   spawnRunner?: (args: string[], opts: { logFile: string, evidenceFile: string, commandInboxFile: string }) => { pid: number, exitCode: number | null, kill: () => void, on: (ev: string, fn: (...a: any[]) => void) => void }
   * }} [options]
   */
  constructor(options = {}) {
    const defaultPacks = path.resolve(HERE, "..", "..", "packs");
    this.packsDir = path.resolve(options.packsDir || defaultPacks);
    this.logsDir = path.resolve(options.logsDir || process.env.BDS_HARNESS_LOGS || path.join(HERE, "logs"));
    this.spawnRunner = options.spawnRunner || null;
    /** @type {null | {
     *   runId: string,
     *   startedAt: number,
     *   proc: any,
     *   runnerPid: number | null,
     *   bdsPid: number | null,
     *   port: number | null,
     *   portV6: number | null,
     *   serverDir: string | null,
     *   logFile: string,
     *   evidenceFile: string,
     *   commandInboxFile: string,
     *   status: string,
     *   exitCode: number | null,
     *   stepSeq: number,
     *   lastStepAck: any,
     * }} */
    this.currentRun = null;
  }

  _isActiveRun(run = this.currentRun) {
    if (!run) return false;
    if (run.status === "stopped" || run.status === "failed" || run.status === "exited") return false;
    if (run.proc && run.proc.exitCode !== null && run.proc.exitCode !== undefined) {
      run.exitCode = run.proc.exitCode;
      run.status = "exited";
      return false;
    }
    return true;
  }

  _readEvidence(run = this.currentRun) {
    if (!run || !fs.existsSync(run.evidenceFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(run.evidenceFile, "utf8"));
    } catch {
      return null;
    }
  }

  _readLog(run = this.currentRun) {
    if (!run || !fs.existsSync(run.logFile)) return "";
    try {
      return fs.readFileSync(run.logFile, "utf8");
    } catch {
      return "";
    }
  }

  _getFixtureManifest(ev, parsed) {
    if (parsed?.fixtureManifest) return parsed.fixtureManifest;
    for (const line of ev?.scenario?.lines || []) {
      const m = /^QA_FIXTURE_READY\s+(\{.*\})$/.exec(line);
      if (m) {
        try {
          return JSON.parse(m[1]);
        } catch {}
      }
    }
    return null;
  }

  /**
   * Starts a single MCP-owned private `--client-qa` BDS instance and waits for `QA_FIXTURE_READY` + evidence JSON.
   */
  async start(params = {}) {
    if (this._isActiveRun()) {
      const r = this.currentRun;
      throw new Error(
        `An owned private BDS QA run is already active (runId=${r.runId}, runnerPid=${r.runnerPid}, bdsPid=${r.bdsPid}, port=${r.port}). Call bds_qa_stop before starting another run.`
      );
    }

    const onlyList = params.only && params.only.length ? params.only : DEFAULT_CLIENT_QA_PACKS;
    for (const folder of onlyList) {
      if (!/^[a-z0-9_]+$/.test(folder)) {
        throw new Error(`Invalid pack folder name "${folder}": must match /^[a-z0-9_]+$/`);
      }
      const candidate = path.join(this.packsDir, folder);
      if (!fs.existsSync(candidate)) {
        throw new Error(`Pack folder "${folder}" does not exist under ${this.packsDir}`);
      }
    }

    const seed = params.seed ?? 1;
    const flat = Boolean(params.flat ?? false);
    const timeoutSeconds = params.timeoutSeconds ?? 3600;
    const readyDeadlineMs = params.readyDeadlineMs ?? 90000;
    const retainOnFailure = Boolean(params.retainOnFailure ?? true);

    fs.mkdirSync(this.logsDir, { recursive: true });
    const runId = `mcp-qa-${Date.now()}-${process.pid}`;
    const logFile = path.join(this.logsDir, `${runId}.log`);
    const evidenceFile = `${logFile}.evidence.json`;
    const commandInboxFile = `${logFile}.commands.txt`;

    const cliArgs = [
      path.join(HERE, "run.mjs"),
      "--client-qa",
      "--packs",
      this.packsDir,
      "--only",
      onlyList.join(","),
      "--seed",
      String(seed),
      "--timeout",
      String(timeoutSeconds),
      "--log",
      logFile,
      "--evidence",
      evidenceFile,
      "--quiet",
    ];
    if (flat) cliArgs.push("--flat");
    if (retainOnFailure) cliArgs.push("--retain-on-failure");
    if (params.port !== undefined) cliArgs.push("--port", String(params.port));

    const proc = this.spawnRunner
      ? this.spawnRunner(cliArgs, { logFile, evidenceFile, commandInboxFile })
      : spawn(process.execPath, cliArgs, {
          cwd: path.resolve(HERE, "..", ".."),
          stdio: ["ignore", "ignore", "pipe"],
          windowsHide: true,
        });

    let stderrText = "";
    if (proc.stderr && typeof proc.stderr.on === "function") {
      proc.stderr.on("data", (chunk) => {
        stderrText += String(chunk);
      });
    }

    const run = {
      runId,
      startedAt: Date.now(),
      proc,
      runnerPid: proc.pid ?? null,
      bdsPid: null,
      port: params.port ?? null,
      portV6: params.port !== undefined ? params.port + 1 : null,
      serverDir: null,
      logFile,
      evidenceFile,
      commandInboxFile,
      status: "starting",
      exitCode: null,
      stepSeq: 0,
      lastStepAck: null,
    };
    this.currentRun = run;

    proc.on("exit", (code) => {
      run.exitCode = code;
      if (run.status !== "stopped") {
        run.status = "exited";
      }
    });

    const deadline = Date.now() + readyDeadlineMs;
    while (Date.now() < deadline) {
      const ev = this._readEvidence(run);
      if (ev) {
        run.bdsPid = ev.bds?.bdsPid ?? run.bdsPid;
        run.port = ev.bds?.port ?? run.port;
        run.portV6 = ev.bds?.portV6 ?? run.portV6;
        run.serverDir = ev.bds?.serverDir ?? run.serverDir;
        if (ev.status === "ready_waiting_for_client") {
          run.status = "ready_waiting_for_client";
          const parsed = parseQaLogEvents(this._readLog(run));
          return {
            runId: run.runId,
            status: run.status,
            host: "127.0.0.1",
            port: run.port,
            portV6: run.portV6,
            runnerPid: run.runnerPid,
            bdsPid: run.bdsPid,
            serverDir: run.serverDir,
            logFile: run.logFile,
            evidenceFile: run.evidenceFile,
            commandInboxFile: run.commandInboxFile,
            git: ev.git,
            stagedPacks: (ev.stagedPacks || []).map((p) => ({
              folder: p.folder,
              kind: p.kind,
              uuid: p.uuid,
              version: p.version,
              shimmed: p.shimmed,
              fileCount: p.fileCount,
              sourceSha256: p.sourceSha256,
              stagedSha256: p.stagedSha256,
            })),
            gates: ev.gates,
            timings: ev.timings,
            fixtureManifest: this._getFixtureManifest(ev, parsed),
          };
        }
        if (ev.status === "setup_failed" || (ev.status === "completed" && ev.exitCode !== 0)) {
          run.status = "failed";
          await this.stop({ retainArtifacts: true });
          throw new Error(
            `BDS QA startup failed (${ev.verdict || ev.status}, exitCode=${ev.exitCode}): ${ev.errors?.setupError || ev.scenario?.message || stderrText.trim() || "see log"}`
          );
        }
      }
      if (proc.exitCode !== null && proc.exitCode !== undefined) {
        const finalEv = this._readEvidence(run);
        run.status = "failed";
        await this.stop({ retainArtifacts: true });
        throw new Error(
          `BDS QA runner exited prematurely with code ${proc.exitCode}: ${finalEv?.errors?.setupError || stderrText.trim() || "see logFile"}`
        );
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    run.status = "failed";
    await this.stop({ retainArtifacts: true });
    throw new Error(`Timed out after ${readyDeadlineMs}ms waiting for BDS QA server readiness (runId=${runId}, logFile=${logFile})`);
  }

  /**
   * Returns current owned QA session status without side effects.
   */
  async status() {
    const run = this.currentRun;
    if (!run) {
      return {
        active: false,
        runId: null,
        status: "idle",
        gates: { server: "unverified", network: "unverified", visual: "unverified" },
      };
    }
    const active = this._isActiveRun(run);
    const ev = this._readEvidence(run);
    const parsed = parseQaLogEvents(this._readLog(run));
    if (ev?.bds) {
      run.bdsPid = ev.bds.bdsPid ?? run.bdsPid;
      run.port = ev.bds.port ?? run.port;
      run.portV6 = ev.bds.portV6 ?? run.portV6;
      run.serverDir = ev.bds.serverDir ?? run.serverDir;
    }
    return {
      active,
      runId: run.runId,
      status: active ? (ev?.status || run.status) : run.status,
      exitCode: run.exitCode ?? ev?.exitCode ?? null,
      host: "127.0.0.1",
      port: run.port,
      portV6: run.portV6,
      runnerPid: run.runnerPid,
      bdsPid: run.bdsPid,
      serverDir: run.serverDir,
      uptimeMs: Date.now() - run.startedAt,
      logFile: run.logFile,
      evidenceFile: run.evidenceFile,
      commandInboxFile: run.commandInboxFile,
      git: ev?.git ?? null,
      stagedPacks: (ev?.stagedPacks || []).map((p) => ({
        folder: p.folder,
        kind: p.kind,
        version: p.version,
        shimmed: p.shimmed,
        sourceSha256: p.sourceSha256,
        stagedSha256: p.stagedSha256,
      })),
      gates: ev?.gates ?? { server: "unverified", network: "unverified", visual: "unverified" },
      joinedPlayers: parsed.joinedPlayers,
      lastStepAck: run.lastStepAck ?? parsed.lastStepAck,
      errors: ev?.errors ?? null,
    };
  }

  /**
   * Dispatches an allowlisted `qa:cmd` step to `<log>.commands.txt` with a unique `correlationId`
   * and waits up to `deadlineMs` for correlated per-player `QA_STEP_APPLIED` / `QA_STEP_ERROR` log entries.
   */
  async step({ step, player, deadlineMs = 8000 }) {
    const run = this.currentRun;
    if (!this._isActiveRun(run)) {
      throw new Error("No active owned BDS QA run. Call bds_qa_start first.");
    }
    if (!ALLOWLISTED_STEPS.includes(step)) {
      throw new Error(`Step "${step}" is not in ALLOWLISTED_STEPS (${ALLOWLISTED_STEPS.join(", ")})`);
    }
    if (player !== undefined && player !== null && player !== "") {
      if (!/^[A-Za-z0-9_ -]{1,32}$/.test(player)) {
        throw new Error(`Invalid player filter "${player}": must match /^[A-Za-z0-9_ -]{1,32}$/`);
      }
    }

    run.stepSeq += 1;
    const correlationId = `req_${run.stepSeq}_${Date.now()}`;
    const targetToken = player ? encodeURIComponent(player.trim()) : "*";
    const startOffset = fs.existsSync(run.logFile) ? fs.statSync(run.logFile).size : 0;
    const cmdLine = `scriptevent qa:cmd ${step} ${targetToken} ${correlationId}\n`;
    const tStart = Date.now();
    fs.appendFileSync(run.commandInboxFile, cmdLine, "utf8");

    const resultsByIndex = new Map();
    let expectedCount = null;
    const deadline = tStart + deadlineMs;

    while (Date.now() < deadline) {
      if (!this._isActiveRun(run)) {
        throw new Error(`BDS QA server exited while waiting for step "${step}" (correlationId=${correlationId})`);
      }
      if (fs.existsSync(run.logFile)) {
        const buf = fs.readFileSync(run.logFile);
        const tailText = buf.subarray(Math.min(startOffset, buf.length)).toString("utf8");
        const lines = tailText.split(/\r?\n/);
        for (const line of lines) {
          const msg = extractScenarioMsg(line);
          if (!msg) continue;
          const m = /^(QA_STEP_APPLIED|QA_STEP_ERROR)\s+(\{.*\})$/.exec(msg);
          if (!m) continue;
          try {
            const isApplied = m[1] === "QA_STEP_APPLIED";
            const payload = JSON.parse(m[2]);
            if (payload.correlationId !== correlationId) continue;
            const idx = Number.isInteger(payload.targetIndex) ? payload.targetIndex : resultsByIndex.size;
            if (Number.isInteger(payload.targetCount) && payload.targetCount > 0) {
              expectedCount = payload.targetCount;
            } else if (expectedCount === null) {
              expectedCount = 1;
            }
            resultsByIndex.set(idx, {
              ok: isApplied,
              step: payload.step,
              player: payload.player,
              location: payload.location ?? null,
              detail: payload.detail ?? null,
              error: payload.error ?? null,
            });
          } catch {}
        }
        if (expectedCount !== null && resultsByIndex.size >= expectedCount) {
          const ordered = [...resultsByIndex.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, v]) => v);
          const allOk = ordered.every((r) => r.ok);
          const ev = this._readEvidence(run);
          const ack = {
            ok: allOk,
            step,
            correlationId,
            elapsedMs: Date.now() - tStart,
            results: ordered,
            gates: ev?.gates ?? {
              server: "verified",
              network: "nethernet_listening",
              visual: "unverified",
            },
          };
          run.lastStepAck = ack;
          if (!allOk) {
            const errMsg = ordered.filter((r) => !r.ok).map((r) => `${r.player}: ${r.error}`).join("; ");
            const err = new Error(`Step "${step}" failed (${correlationId}): ${errMsg}`);
            /** @type {any} */ (err).stepResult = ack;
            throw err;
          }
          return ack;
        }
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    const partial = [...resultsByIndex.values()];
    const timeoutAck = {
      ok: false,
      step,
      correlationId,
      elapsedMs: Date.now() - tStart,
      results: partial,
      error: `Timed out after ${deadlineMs}ms waiting for correlated QA_STEP_APPLIED/QA_STEP_ERROR ACK (${correlationId})`,
      gates: {
        server: "verified",
        network: "nethernet_listening",
        visual: "unverified",
      },
    };
    run.lastStepAck = timeoutAck;
    const err = new Error(timeoutAck.error);
    /** @type {any} */ (err).stepResult = timeoutAck;
    throw err;
  }

  /**
   * Reads structured fixture/world state and optionally triggers a correlated `state_snapshot` step.
   */
  async readState({ refreshInWorld = true, deadlineMs = 5000 } = {}) {
    const run = this.currentRun;
    if (!run) {
      throw new Error("No owned BDS QA run has been started in this MCP session.");
    }
    let liveSnapshot = null;
    if (refreshInWorld && this._isActiveRun(run)) {
      const ack = await this.step({ step: "state_snapshot", deadlineMs });
      liveSnapshot = ack.results[0]?.detail ?? null;
    }
    const ev = this._readEvidence(run);
    const parsed = parseQaLogEvents(this._readLog(run));
    return {
      runId: run.runId,
      active: this._isActiveRun(run),
      status: ev?.status || run.status,
      git: ev?.git ?? null,
      gates: ev?.gates ?? { server: "unverified", network: "unverified", visual: "unverified" },
      fixtureManifest: this._getFixtureManifest(ev, parsed),
      joinedPlayers: parsed.joinedPlayers,
      liveSnapshot,
      lastStepAck: run.lastStepAck ?? parsed.lastStepAck,
      errors: ev?.errors ?? null,
    };
  }

  /**
   * Returns structured QA events and a bounded, identity/auth-redacted log tail.
   */
  async events({ tailLines = 50, kind = "qa_only" } = {}) {
    const run = this.currentRun;
    if (!run) {
      throw new Error("No owned BDS QA run has been started in this MCP session.");
    }
    const rawLog = this._readLog(run);
    const parsed = parseQaLogEvents(rawLog);
    let filteredEvents = parsed.events;
    if (kind === "errors_only") {
      filteredEvents = parsed.events.filter((e) => e.type === "QA_STEP_ERROR" || e.type === "QA_CLIENT_JOIN_ERROR" || e.type === "SERVER_ERROR");
    } else if (kind === "qa_only") {
      filteredEvents = parsed.events.filter((e) => e.type.startsWith("QA_") || e.type === "SERVER_ERROR");
    }

    const allLines = rawLog.split(/\r?\n/).filter(Boolean);
    const sliced = allLines.slice(-Math.max(1, Math.min(200, tailLines)));
    const redactedTail = sliced.map((l) => redactLogLine(l));

    return {
      runId: run.runId,
      active: this._isActiveRun(run),
      kind,
      eventCount: filteredEvents.length,
      events: filteredEvents.slice(-100),
      logTail: redactedTail,
    };
  }

  /**
   * Stops the MCP-owned BDS QA instance and releases its owned port lock pair.
   */
  async stop({ retainArtifacts = true, retainServerDir = false } = {}) {
    const run = this.currentRun;
    if (!run) {
      return {
        stopped: true,
        wasActive: false,
        runId: null,
      };
    }

    const ev = this._readEvidence(run);
    if (ev?.bds) {
      run.bdsPid = ev.bds.bdsPid ?? run.bdsPid;
      run.port = ev.bds.port ?? run.port;
      run.portV6 = ev.bds.portV6 ?? run.portV6;
      run.serverDir = ev.bds.serverDir ?? run.serverDir;
    }

    const wasActive = this._isActiveRun(run);
    run.status = "stopped";

    if (run.proc && typeof run.proc.kill === "function") {
      try {
        run.proc.kill("SIGTERM");
      } catch {}
    }
    killOwnedPid(run.bdsPid);
    killOwnedPid(run.runnerPid);
    await Promise.all([waitForPidExit(run.bdsPid, 1500), waitForPidExit(run.runnerPid, 1500)]);

    if (run.port !== null && run.port !== undefined) {
      try {
        releasePortPair(run.port);
      } catch {}
    }
    if (fs.existsSync(run.commandInboxFile)) {
      try {
        fs.rmSync(run.commandInboxFile, { force: true });
      } catch {}
    }
    if (!retainServerDir && run.serverDir && fs.existsSync(run.serverDir)) {
      try {
        fs.rmSync(run.serverDir, { recursive: true, force: true });
      } catch {}
    }
    if (!retainArtifacts) {
      for (const f of [run.logFile, run.evidenceFile]) {
        if (f && fs.existsSync(f)) {
          try { fs.rmSync(f, { force: true }); } catch {}
        }
      }
    }

    return {
      stopped: true,
      wasActive,
      runId: run.runId,
      runnerPid: run.runnerPid,
      bdsPid: run.bdsPid,
      port: run.port,
      portV6: run.portV6,
      serverDirRetained: Boolean(retainServerDir && run.serverDir && fs.existsSync(run.serverDir)),
      logFile: retainArtifacts ? run.logFile : null,
      evidenceFile: retainArtifacts ? run.evidenceFile : null,
      gates: ev?.gates ?? { server: "unverified", network: "unverified", visual: "unverified" },
    };
  }
}

function jsonToolResponse(payload, isError = false) {
  return {
    isError,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

/**
 * Creates a configured `@modelcontextprotocol/sdk` `McpServer` bound to a `BedrockQaMcpController`.
 * @param {BedrockQaMcpController} [controller]
 */
export function createBedrockQaMcpServer(controller = new BedrockQaMcpController()) {
  const server = new McpServer({
    name: "bedrock-bds-qa",
    version: "1.0.0",
  });

  server.registerTool(
    "bds_qa_start",
    {
      title: "Start Private Bedrock QA Server",
      description:
        "Starts one MCP-owned private local Bedrock Dedicated Server (--client-qa) with exact git/staged pack SHA-256 verification and waits until QA_FIXTURE_READY.",
      inputSchema: {
        port: z.number().int().min(1024).max(65530).optional().describe("Explicit IPv4 port (also reserves port+1 for IPv6). Omit for a random free port pair."),
        only: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1).max(30).optional().describe("Pack folders to stage (defaults to map_bp, stash_bp, npc_bp, hud_rp, build_rp)."),
        seed: z.number().int().optional().describe("World seed (default 1)."),
        flat: z.boolean().optional().describe("Use superflat world template (default false)."),
        timeoutSeconds: z.number().int().min(30).max(7200).optional().describe("Total server lifetime limit in seconds (default 3600)."),
        readyDeadlineMs: z.number().int().min(500).max(180000).optional().describe("Deadline in ms to wait for QA_FIXTURE_READY (default 90000)."),
        retainOnFailure: z.boolean().optional().describe("Retain temp server directory if startup fails (default true)."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const res = await controller.start(args);
        return jsonToolResponse(res, false);
      } catch (err) {
        return jsonToolResponse({ ok: false, error: String(err?.message ?? err) }, true);
      }
    }
  );

  server.registerTool(
    "bds_qa_status",
    {
      title: "Get Private Bedrock QA Server Status",
      description:
        "Returns the status, owned PIDs, ports, exact git/staged pack SHA-256 digests, verification gates, connected players, and latest step ACK of the active QA run.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const res = await controller.status();
        return jsonToolResponse(res, false);
      } catch (err) {
        return jsonToolResponse({ ok: false, error: String(err?.message ?? err) }, true);
      }
    }
  );

  server.registerTool(
    "bds_qa_step",
    {
      title: "Execute Allowlisted QA Fixture Step and Wait for Correlated ACK",
      description:
        "Appends an allowlisted scriptevent qa:cmd step with a unique correlationId to the server inbox and waits for correlated per-player QA_STEP_APPLIED or QA_STEP_ERROR results.",
      inputSchema: {
        step: z.enum(ALLOWLISTED_STEPS).describe("Allowlisted fixture step to execute."),
        player: z.string().regex(/^[A-Za-z0-9_ -]{1,32}$/).optional().describe("Optional target player name; defaults to connected real players or QAFixtureBot."),
        deadlineMs: z.number().int().min(100).max(30000).optional().describe("Maximum wait time in ms for correlated QA_STEP_APPLIED ACK (default 8000)."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const res = await controller.step(args);
        return jsonToolResponse(res, false);
      } catch (err) {
        const payload = /** @type {any} */ (err)?.stepResult || {
          ok: false,
          step: args.step,
          error: String(err?.message ?? err),
        };
        return jsonToolResponse(payload, true);
      }
    }
  );

  server.registerTool(
    "bds_qa_read_state",
    {
      title: "Read Structured QA World & Fixture State",
      description:
        "Reads structured QA fixture state (and optionally runs a correlated state_snapshot step to inspect live player locations, Mara NPC state, active probe count, and stash page indicator).",
      inputSchema: {
        refreshInWorld: z.boolean().optional().describe("Dispatch correlated state_snapshot step before returning state (default true)."),
        deadlineMs: z.number().int().min(100).max(15000).optional().describe("Deadline in ms for in-world snapshot step (default 5000)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const res = await controller.readState(args);
        return jsonToolResponse(res, false);
      } catch (err) {
        return jsonToolResponse({ ok: false, error: String(err?.message ?? err) }, true);
      }
    }
  );

  server.registerTool(
    "bds_qa_events",
    {
      title: "Read Structured QA Events and Redacted Log Tail",
      description:
        "Returns parsed QA_FIXTURE_READY, QA_CLIENT_JOINED, QA_STEP_APPLIED, QA_STEP_ERROR, and SERVER_ERROR events plus a bounded log tail with XUIDs, PFIDs, tokens, and external IPs redacted.",
      inputSchema: {
        tailLines: z.number().int().min(1).max(200).optional().describe("Number of redacted log tail lines to include (default 50)."),
        kind: z.enum(["all", "qa_only", "errors_only"]).optional().describe("Event filter (default qa_only)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const res = await controller.events(args);
        return jsonToolResponse(res, false);
      } catch (err) {
        return jsonToolResponse({ ok: false, error: String(err?.message ?? err) }, true);
      }
    }
  );

  server.registerTool(
    "bds_qa_stop",
    {
      title: "Stop Owned Private Bedrock QA Server",
      description:
        "Stops the MCP-owned private BDS QA server process tree, releases its host-wide port lock pair, and returns final log/evidence paths.",
      inputSchema: {
        retainArtifacts: z.boolean().optional().describe("Keep log and evidence JSON files on disk after stopping (default true)."),
        retainServerDir: z.boolean().optional().describe("Keep the throwaway temp server directory on disk after stopping (default false)."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const res = await controller.stop(args);
        return jsonToolResponse(res, false);
      } catch (err) {
        return jsonToolResponse({ ok: false, error: String(err?.message ?? err) }, true);
      }
    }
  );

  return { server, controller };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const { values } = parseArgs({
    options: {
      packs: { type: "string" },
      logs: { type: "string" },
    },
    strict: false,
  });
  const controller = new BedrockQaMcpController({
    packsDir: typeof values.packs === "string" ? values.packs : undefined,
    logsDir: typeof values.logs === "string" ? values.logs : undefined,
  });
  const { server } = createBedrockQaMcpServer(controller);
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await controller.stop({ retainArtifacts: true });
    } catch {}
  };

  transport.onclose = () => {
    void shutdown();
  };
  process.stdin.on("end", () => {
    void shutdown();
  });
  process.stdin.on("close", () => {
    void shutdown();
  });
  process.on("SIGINT", async () => {
    await shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await shutdown();
    process.exit(0);
  });
  process.on("exit", () => {
    if (controller.currentRun) {
      killOwnedPid(controller.currentRun.bdsPid);
      killOwnedPid(controller.currentRun.runnerPid);
    }
  });

  await server.connect(transport);
}
