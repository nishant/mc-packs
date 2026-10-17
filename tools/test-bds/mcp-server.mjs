#!/usr/bin/env node
// Local stdio MCP server for private Bedrock Dedicated Server (BDS) QA runs.
// Wraps tools/test-bds/run.mjs (--client-qa) with strict input validation,
// single-owned-instance lifecycle, exact git/staged pack SHA-256 provenance,
// correlated qa:cmd step ACKs, and redacted event/log tails.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HERE, IS_WIN, releasePortPair, isPidAlive, getProcessBirthId } from "./lib/server.mjs";

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

async function waitForProcExit(proc, timeoutMs = 1200) {
  if (!proc || (proc.exitCode !== null && proc.exitCode !== undefined)) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null && proc.exitCode !== undefined) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return proc.exitCode !== null && proc.exitCode !== undefined;
}

/**
 * Strict containment check ensuring `dir` is a harness-created `<tmpRoot>/bds-run-*` folder.
 * @param {string | null | undefined} dir
 * @returns {boolean}
 */
export function isOwnedTempServerDir(dir) {
  if (typeof dir !== "string" || !dir.trim()) return false;
  const tmpRoot = path.resolve(process.env.BDS_HARNESS_TMP || os.tmpdir());
  const resolved = path.resolve(dir);
  const parent = path.dirname(resolved);
  const base = path.basename(resolved);
  const sameParent = IS_WIN ? parent.toLowerCase() === tmpRoot.toLowerCase() : parent === tmpRoot;
  return sameParent && base.startsWith("bds-run-") && base.length > "bds-run-".length;
}

/**
 * Reads newly appended bytes from `filePath` starting at `offset` (up to `maxBytes` per call).
 * @param {string} filePath
 * @param {number} offset
 * @param {number} [maxBytes]
 * @returns {{ text: string, nextOffset: number }}
 */
function readLogIncremental(filePath, offset, maxBytes = 64 * 1024) {
  if (!fs.existsSync(filePath)) return { text: "", nextOffset: offset };
  let fd = null;
  try {
    const st = fs.statSync(filePath);
    if (st.size <= offset) return { text: "", nextOffset: offset };
    const toRead = Math.min(st.size - offset, maxBytes);
    const buf = Buffer.allocUnsafe(toRead);
    fd = fs.openSync(filePath, "r");
    const bytesRead = fs.readSync(fd, buf, 0, toRead, offset);
    return {
      text: buf.subarray(0, bytesRead).toString("utf8"),
      nextOffset: offset + bytesRead,
    };
  } catch {
    return { text: "", nextOffset: offset };
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
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

function consumeQaLogLine(state, rawLine, lineNo, maxEvents = Infinity) {
  if (!rawLine) return;
  const msg = extractScenarioMsg(rawLine);
  if (msg) {
    const m = /^(QA_FIXTURE_READY|QA_CLIENT_JOINED|QA_CLIENT_JOIN_ERROR|QA_STEP_APPLIED|QA_STEP_ERROR)\s+(\{.*\})$/.exec(msg);
    if (m) {
      try {
        const type = m[1];
        const data = JSON.parse(m[2]);
        if (type === "QA_FIXTURE_READY") {
          state.fixtureManifest = data;
        } else if (type === "QA_CLIENT_JOINED" && data.player) {
          state.joinedPlayers.set(data.player, data);
        } else if (type === "QA_STEP_APPLIED") {
          state.lastStepAck = { ok: true, ...data };
        } else if (type === "QA_STEP_ERROR") {
          state.lastStepAck = { ok: false, ...data };
        }
        state.events.push({ type, line: lineNo, data });
        if (state.events.length > maxEvents) state.events.shift();
        return;
      } catch {}
    }
  }
  if (/\[Scripting\]\[error\]/i.test(rawLine) || /\[ContentLog\]\[error\]/i.test(rawLine) || /\bERROR\]\s*\[Scripting\]/i.test(rawLine)) {
    state.events.push({ type: "SERVER_ERROR", line: lineNo, text: redactLogLine(rawLine) });
    if (state.events.length > maxEvents) state.events.shift();
    return;
  }
  const discMatch = /Player disconnected:\s*([^,\r\n]+)/i.exec(rawLine);
  if (discMatch) {
    const leftName = discMatch[1].trim();
    if (leftName) state.joinedPlayers.delete(leftName);
  }
}

/**
 * Parses structured QA events from a harness log file.
 * @param {string} logText
 */
export function parseQaLogEvents(logText) {
  const lines = logText.split(/\r?\n/);
  const state = {
    events: [],
    fixtureManifest: null,
    joinedPlayers: new Map(),
    lastStepAck: null,
  };

  for (let i = 0; i < lines.length; i++) {
    consumeQaLogLine(state, lines[i], i + 1);
  }

  return {
    events: state.events,
    fixtureManifest: state.fixtureManifest,
    joinedPlayers: [...state.joinedPlayers.values()],
    lastStepAck: state.lastStepAck,
  };
}

export class BedrockQaMcpController {
  /**
   * @param {{
   *   packsDir?: string,
   *   logsDir?: string,
   *   getProcessBirthId?: (pid: number) => string | null,
   *   spawnRunner?: (args: string[], opts: { logFile: string, evidenceFile: string, commandInboxFile: string }) => { pid: number, exitCode: number | null, kill: () => void, on: (ev: string, fn: (...a: any[]) => void) => void }
   * }} [options]
   */
  constructor(options = {}) {
    const defaultPacks = path.resolve(HERE, "..", "..", "packs");
    this.packsDir = path.resolve(options.packsDir || defaultPacks);
    this.logsDir = path.resolve(options.logsDir || process.env.BDS_HARNESS_LOGS || path.join(HERE, "logs"));
    this.spawnRunner = options.spawnRunner || null;
    this.getProcessBirthId = options.getProcessBirthId || getProcessBirthId;
    /** @type {null | {
     *   runId: string,
     *   startedAt: number,
     *   proc: any,
     *   runnerPid: number | null,
     *   bdsPid: number | null,
     *   bdsBirthId?: string | null,
     *   port: number | null,
     *   portV6: number | null,
     *   serverDir: string | null,
     *   logFile: string,
     *   evidenceFile: string,
     *   commandInboxFile: string,
     *   status: string,
     *   exitCode: number | null,
     *   terminated?: boolean,
     *   stepSeq: number,
     *   lastStepAck: any,
     *   logState?: {
     *     offset: number,
     *     lineNo: number,
     *     events: any[],
     *     fixtureManifest: any,
     *     joinedPlayers: Map<string, any>,
     *     lastStepAck: any,
     *     tailLines: string[],
     *   },
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

  _syncLogState(run = this.currentRun) {
    if (!run) {
      return { events: [], fixtureManifest: null, joinedPlayers: [], lastStepAck: null, tailLines: [] };
    }
    if (!run.logState) {
      run.logState = {
        offset: 0,
        lineNo: 0,
        events: [],
        fixtureManifest: null,
        joinedPlayers: new Map(),
        lastStepAck: null,
        tailLines: [],
      };
    }
    const stState = run.logState;
    if (!fs.existsSync(run.logFile)) {
      return {
        events: stState.events,
        fixtureManifest: stState.fixtureManifest,
        joinedPlayers: [...stState.joinedPlayers.values()],
        lastStepAck: stState.lastStepAck,
        tailLines: stState.tailLines,
      };
    }
    let fd = null;
    try {
      const st = fs.statSync(run.logFile);
      if (st.size < stState.offset) {
        stState.offset = 0;
        stState.lineNo = 0;
        stState.events = [];
        stState.fixtureManifest = null;
        stState.joinedPlayers.clear();
        stState.lastStepAck = null;
        stState.tailLines = [];
      }
      if (st.size > stState.offset) {
        fd = fs.openSync(run.logFile, "r");
        const chunkBuf = Buffer.allocUnsafe(64 * 1024);
        while (stState.offset < st.size) {
          const toRead = Math.min(chunkBuf.length, st.size - stState.offset);
          const bytesRead = fs.readSync(fd, chunkBuf, 0, toRead, stState.offset);
          if (bytesRead <= 0) break;
          const slice = chunkBuf.subarray(0, bytesRead);
          const lastNl = slice.lastIndexOf(0x0a); // '\n'
          if (lastNl < 0) {
            if (stState.offset + bytesRead < st.size) {
              // Single line longer than 64KB without newline: consume chunk to prevent stall
              const text = slice.toString("utf8").replace(/\r$/, "");
              stState.offset += bytesRead;
              stState.lineNo += 1;
              if (text) {
                stState.tailLines.push(text);
                if (stState.tailLines.length > 200) stState.tailLines.shift();
              }
              consumeQaLogLine(stState, text, stState.lineNo, 500);
            }
            break;
          }
          const completeSlice = slice.subarray(0, lastNl + 1);
          stState.offset += completeSlice.length;
          const lines = completeSlice.toString("utf8").split("\n");
          // Last element after split("\n") on buffer ending in "\n" is ""
          lines.pop();
          for (const raw of lines) {
            const clean = raw.replace(/\r$/, "");
            stState.lineNo += 1;
            if (clean) {
              stState.tailLines.push(clean);
              if (stState.tailLines.length > 200) stState.tailLines.shift();
            }
            consumeQaLogLine(stState, clean, stState.lineNo, 500);
          }
          if (lastNl + 1 < bytesRead && stState.offset >= st.size) {
            break;
          }
        }
      }
    } catch {} finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch {}
      }
    }
    return {
      events: stState.events,
      fixtureManifest: stState.fixtureManifest,
      joinedPlayers: [...stState.joinedPlayers.values()],
      lastStepAck: stState.lastStepAck,
      tailLines: stState.tailLines,
    };
  }

  _deriveGates(run, ev) {
    const unverified = { server: "unverified", network: "unverified", visual: "unverified" };
    if (!run || !ev || !ev.gates || typeof ev.gates !== "object") {
      return unverified;
    }
    const completedOk = ev.status === "completed" && (ev.exitCode === 0 || ev.verdict === "PASS");
    if (!this._isActiveRun(run) && !completedOk) {
      return unverified;
    }
    return {
      server: ev.gates.server || "unverified",
      network: ev.gates.network || "unverified",
      visual: ev.gates.visual || "unverified",
      ...(ev.gates.visualNote ? { visualNote: ev.gates.visualNote } : {}),
    };
  }

  _isVerifiedOwnedBdsPid(run) {
    if (!run || !Number.isInteger(run.bdsPid) || run.bdsPid <= 0) return false;
    if (!isOwnedTempServerDir(run.serverDir)) return false;
    const idFile = path.join(run.serverDir, "harness-process.json");
    if (!fs.existsSync(idFile)) return false;
    try {
      const idData = JSON.parse(fs.readFileSync(idFile, "utf8"));
      if (idData.status === "stopped") return false;
      if (idData.bdsPid !== run.bdsPid || idData.runnerPid !== run.runnerPid) return false;
      const expectedBirthId = run.bdsBirthId || idData.bdsBirthId;
      if (typeof expectedBirthId !== "string" || !expectedBirthId) return false;
      const actualBirthId = this.getProcessBirthId(run.bdsPid);
      return actualBirthId !== null && actualBirthId === expectedBirthId;
    } catch {
      return false;
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
    const missingRequired = DEFAULT_CLIENT_QA_PACKS.filter((req) => !onlyList.includes(req));
    if (missingRequired.length > 0) {
      throw new Error(
        `Missing required client-QA fixture packs in "only": ${missingRequired.join(", ")} (client-qa-fixture.js requires ${DEFAULT_CLIENT_QA_PACKS.join(", ")})`
      );
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
      bdsBirthId: null,
      port: params.port ?? null,
      portV6: params.port !== undefined ? params.port + 1 : null,
      serverDir: null,
      logFile,
      evidenceFile,
      commandInboxFile,
      status: "starting",
      exitCode: null,
      terminated: false,
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
          const stagedList = Array.isArray(ev.stagedPacks) ? ev.stagedPacks : [];
          const stagedFolders = new Set(stagedList.filter((p) => p.verified !== false).map((p) => p.folder));
          const missingStaged = onlyList.filter((req) => !stagedFolders.has(req));
          if (missingStaged.length > 0) {
            run.status = "failed";
            await this.stop({ retainArtifacts: true, retainServerDir: retainOnFailure });
            throw new Error(`Staged pack verification missing required packs: ${missingStaged.join(", ")}`);
          }
          run.status = "ready_waiting_for_client";
          if (!run.bdsBirthId && isOwnedTempServerDir(run.serverDir)) {
            try {
              const idFile = path.join(run.serverDir, "harness-process.json");
              if (fs.existsSync(idFile)) {
                const idData = JSON.parse(fs.readFileSync(idFile, "utf8"));
                if (typeof idData.bdsBirthId === "string" && idData.bdsBirthId) {
                  run.bdsBirthId = idData.bdsBirthId;
                }
              }
            } catch {}
          }
          const parsed = this._syncLogState(run);
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
            stagedPacks: stagedList.map((p) => ({
              folder: p.folder,
              kind: p.kind,
              uuid: p.uuid,
              version: p.version,
              shimmed: p.shimmed,
              fileCount: p.fileCount,
              sourceSha256: p.sourceSha256,
              stagedSha256: p.stagedSha256,
            })),
            gates: this._deriveGates(run, ev),
            timings: ev.timings,
            fixtureManifest: this._getFixtureManifest(ev, parsed),
          };
        }
        if (ev.status === "setup_failed" || (ev.status === "completed" && ev.exitCode !== 0)) {
          run.status = "failed";
          await this.stop({ retainArtifacts: true, retainServerDir: retainOnFailure });
          throw new Error(
            `BDS QA startup failed (${ev.verdict || ev.status}, exitCode=${ev.exitCode}): ${ev.errors?.setupError || ev.scenario?.message || stderrText.trim() || "see log"}`
          );
        }
      }
      if (proc.exitCode !== null && proc.exitCode !== undefined) {
        const finalEv = this._readEvidence(run);
        if (finalEv?.bds) {
          run.bdsPid = finalEv.bds.bdsPid ?? run.bdsPid;
          run.port = finalEv.bds.port ?? run.port;
          run.portV6 = finalEv.bds.portV6 ?? run.portV6;
          run.serverDir = finalEv.bds.serverDir ?? run.serverDir;
        }
        run.status = "failed";
        await this.stop({ retainArtifacts: true, retainServerDir: retainOnFailure });
        throw new Error(
          `BDS QA runner exited prematurely with code ${proc.exitCode}: ${finalEv?.errors?.setupError || stderrText.trim() || "see logFile"}`
        );
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    run.status = "failed";
    await this.stop({ retainArtifacts: true, retainServerDir: retainOnFailure });
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
    const parsed = this._syncLogState(run);
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
      gates: this._deriveGates(run, ev),
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
    let readOffset = fs.existsSync(run.logFile) ? fs.statSync(run.logFile).size : 0;
    let carry = "";
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
        const { text: newChunk, nextOffset } = readLogIncremental(run.logFile, readOffset);
        readOffset = nextOffset;
        if (newChunk) {
          const combined = carry + newChunk;
          const parts = combined.split(/\r?\n/);
          carry = parts.pop() ?? "";
          for (const line of parts) {
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
            stepGate: allOk ? "verified" : "failed",
            results: ordered,
            gates: this._deriveGates(run, ev),
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
    const ev = this._readEvidence(run);
    const timeoutAck = {
      ok: false,
      step,
      correlationId,
      elapsedMs: Date.now() - tStart,
      stepGate: "failed",
      results: partial,
      error: `Timed out after ${deadlineMs}ms waiting for correlated QA_STEP_APPLIED/QA_STEP_ERROR ACK (${correlationId})`,
      gates: this._deriveGates(run, ev),
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
    const parsed = this._syncLogState(run);
    return {
      runId: run.runId,
      active: this._isActiveRun(run),
      status: ev?.status || run.status,
      git: ev?.git ?? null,
      gates: this._deriveGates(run, ev),
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
    const parsed = this._syncLogState(run);
    let filteredEvents = parsed.events;
    if (kind === "errors_only") {
      filteredEvents = parsed.events.filter((e) => e.type === "QA_STEP_ERROR" || e.type === "QA_CLIENT_JOIN_ERROR" || e.type === "SERVER_ERROR");
    } else if (kind === "qa_only") {
      filteredEvents = parsed.events.filter((e) => e.type.startsWith("QA_") || e.type === "SERVER_ERROR");
    }

    const sliced = parsed.tailLines.slice(-Math.max(1, Math.min(200, tailLines)));
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

    if (!run.terminated) {
      const procRunning = run.proc && (run.proc.exitCode === null || run.proc.exitCode === undefined);
      if (procRunning && typeof run.proc.kill === "function") {
        if (run.commandInboxFile) {
          try {
            fs.appendFileSync(run.commandInboxFile, "stop\n", "utf8");
          } catch {}
        }
        if (process.platform !== "win32" || this.spawnRunner) {
          try {
            run.proc.kill("SIGTERM");
          } catch {}
        }
        const exitedGracefully = await waitForProcExit(run.proc, this.spawnRunner ? 1200 : 2500);
        if (!exitedGracefully) {
          try {
            run.proc.kill("SIGTERM");
          } catch {}
          killOwnedPid(run.runnerPid);
          await waitForPidExit(run.runnerPid, 1500);
        }
      }
      if (this._isVerifiedOwnedBdsPid(run) && isPidAlive(run.bdsPid)) {
        killOwnedPid(run.bdsPid);
        await waitForPidExit(run.bdsPid, 1500);
      }
      if (isOwnedTempServerDir(run.serverDir)) {
        const idFile = path.join(run.serverDir, "harness-process.json");
        if (fs.existsSync(idFile)) {
          try {
            const idData = JSON.parse(fs.readFileSync(idFile, "utf8"));
            fs.writeFileSync(idFile, JSON.stringify({ ...idData, status: "stopped", stoppedAt: new Date().toISOString() }, null, 2));
          } catch {}
        }
      }
      run.terminated = true;
    }

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
    if (!retainServerDir && isOwnedTempServerDir(run.serverDir) && fs.existsSync(run.serverDir)) {
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
      serverDirRetained: Boolean(isOwnedTempServerDir(run.serverDir) && fs.existsSync(run.serverDir)),
      logFile: retainArtifacts ? run.logFile : null,
      evidenceFile: retainArtifacts ? run.evidenceFile : null,
      gates: this._deriveGates(run, ev),
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
        readOnlyHint: false,
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
    const r = controller.currentRun;
    if (r && !r.terminated) {
      if (controller._isVerifiedOwnedBdsPid(r)) {
        killOwnedPid(r.bdsPid);
      }
      if (r.proc && (r.proc.exitCode === null || r.proc.exitCode === undefined)) {
        killOwnedPid(r.runnerPid);
      }
      r.terminated = true;
    }
  });

  await server.connect(transport);
}
