import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ALLOWLISTED_STEPS,
  BedrockQaMcpController,
  createBedrockQaMcpServer,
  redactLogLine,
  parseQaLogEvents,
} from "../mcp-server.mjs";
import { HERE, writeProcessIdentity } from "./server.mjs";

async function connectInMemoryMcp(controllerOptions = {}) {
  const controller = new BedrockQaMcpController(controllerOptions);
  const { server } = createBedrockQaMcpServer(controller);
  const client = new Client({ name: "mcp-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { controller, server, client, clientTransport, serverTransport };
}

test("redactLogLine scrubs XUIDs, PFIDs, JWT tokens, secrets, and external IPs while preserving loopback and versions", () => {
  const raw =
    '[2026-10-17 INFO] Player connected: MytGFX, xuid: 2535412345678901, "pfid":"9988776655443322", addr 203.0.113.42:54321 -> 127.0.0.1:19132 BDS 1.26.52.3 token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c session_token=my_secret_123';
  const redacted = redactLogLine(raw);
  assert.doesNotMatch(redacted, /2535412345678901/);
  assert.doesNotMatch(redacted, /9988776655443322/);
  assert.doesNotMatch(redacted, /203\.0\.113\.42/);
  assert.doesNotMatch(redacted, /eyJhbGciOi/);
  assert.doesNotMatch(redacted, /my_secret_123/);
  assert.match(redacted, /\[REDACTED_XUID\]/);
  assert.match(redacted, /\[REDACTED_PFID\]/);
  assert.match(redacted, /\[REDACTED_IP\]:54321/);
  assert.match(redacted, /127\.0\.0\.1:19132/);
  assert.match(redacted, /1\.26\.52\.3/);
  assert.match(redacted, /\[REDACTED_TOKEN\]/);
  assert.match(redacted, /\[REDACTED_SECRET\]/);
});

test("MCP initialize, listTools, schema validation, correlated ACKs, deadlines, and error handling work with mock runner", async (t) => {
  const tmpLogs = fs.mkdtempSync(path.join(os.tmpdir(), "bds-mcp-unit-"));
  t.after(() => fs.rmSync(tmpLogs, { recursive: true, force: true }));

  let mockBehaviour = "normal"; // "normal" | "hang_start" | "hang_step"
  let watchTimer = null;

  const { client, controller } = await connectInMemoryMcp({
    logsDir: tmpLogs,
    spawnRunner(_cliArgs, { logFile, evidenceFile, commandInboxFile }) {
      const proc = new EventEmitter();
      proc.pid = 999991;
      proc.exitCode = null;
      proc.stderr = new EventEmitter();
      proc.kill = () => {
        proc.exitCode = 0;
        if (watchTimer) clearInterval(watchTimer);
        proc.emit("exit", 0);
      };

      fs.writeFileSync(commandInboxFile, "", "utf8");
      if (mockBehaviour === "hang_start") {
        fs.writeFileSync(logFile, "[harness] starting...\n", "utf8");
        return proc;
      }

      const fixtureManifest = {
        fixtureReady: true,
        visualGate: "unverified",
        center: { x: 200, y: 69, z: 200 },
        commands: ALLOWLISTED_STEPS.map((s) => `scriptevent qa:cmd ${s}`),
      };
      fs.writeFileSync(
        logFile,
        `[2026-10-17 INFO] Player Spawned: MytGFX xuid: 2535499999999999 from 198.51.100.7:61234\n` +
          `[scenario] log: QA_FIXTURE_READY ${JSON.stringify(fixtureManifest)}\n` +
          `[scenario] log: QA_CLIENT_JOINED ${JSON.stringify({ player: "MytGFX", location: { x: 210.5, y: 69, z: 200.5 } })}\n`,
        "utf8"
      );
      fs.writeFileSync(
        evidenceFile,
        JSON.stringify(
          {
            schemaVersion: 1,
            status: "ready_waiting_for_client",
            verdict: "READY",
            exitCode: null,
            git: { commit: "deadbeef1234", branch: "test-branch", dirty: false, dirtyFiles: [] },
            bds: {
              bdsPid: 999992,
              runnerPid: 999991,
              port: 29132,
              portV6: 29133,
              serverDir: path.join(tmpLogs, "fake-server"),
              transport: "nethernet",
            },
            stagedPacks: [
              {
                folder: "npc_bp",
                kind: "bp",
                uuid: "11111111-2222-3333-4444-555555555555",
                version: [1, 0, 0],
                shimmed: true,
                fileCount: 3,
                sourceSha256: "aaa111",
                stagedSha256: "bbb222",
                verified: true,
              },
              { folder: "map_bp", kind: "bp", uuid: "22222222-2222-3333-4444-555555555555", version: [1, 0, 0], shimmed: true, fileCount: 3, sourceSha256: "a2", stagedSha256: "b2", verified: true },
              { folder: "stash_bp", kind: "bp", uuid: "33333333-2222-3333-4444-555555555555", version: [1, 0, 0], shimmed: true, fileCount: 3, sourceSha256: "a3", stagedSha256: "b3", verified: true },
              { folder: "hud_rp", kind: "rp", uuid: "44444444-2222-3333-4444-555555555555", version: [1, 0, 0], shimmed: false, fileCount: 3, sourceSha256: "a4", stagedSha256: "a4", verified: true },
              { folder: "build_rp", kind: "rp", uuid: "55555555-2222-3333-4444-555555555555", version: [1, 0, 0], shimmed: false, fileCount: 3, sourceSha256: "a5", stagedSha256: "a5", verified: true },
            ],
            gates: {
              server: "verified",
              network: "nethernet_listening",
              visual: "unverified",
            },
            timings: { stagingMs: 12, serverBootMs: 100, readinessMs: 150, totalMs: 262 },
            errors: { setupError: null, scriptErrors: [], warnErrors: [], contentErrors: [], watchdog: [] },
          },
          null,
          2
        ),
        "utf8"
      );

      let inboxOffset = 0;
      watchTimer = setInterval(() => {
        if (mockBehaviour === "hang_step" || !fs.existsSync(commandInboxFile)) return;
        const buf = fs.readFileSync(commandInboxFile);
        if (buf.length <= inboxOffset) return;
        const chunk = buf.subarray(inboxOffset).toString("utf8");
        inboxOffset = buf.length;
        for (const line of chunk.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
          const m = line.match(/^scriptevent\s+qa:cmd\s+(\S+)\s+(\S+)\s+(\S+)$/);
          if (!m) continue;
          const [, step, targetToken, correlationId] = m;
          const target = targetToken === "*" ? "MytGFX" : decodeURIComponent(targetToken);
          if (target === "GhostPlayer") {
            fs.appendFileSync(
              logFile,
              `[scenario] log: QA_STEP_ERROR ${JSON.stringify({
                step,
                player: target,
                correlationId,
                targetIndex: 0,
                targetCount: 1,
                error: `Target player "${target}" not found`,
              })}\n`,
              "utf8"
            );
          } else {
            fs.appendFileSync(
              logFile,
              `[scenario] log: QA_STEP_APPLIED ${JSON.stringify({
                step,
                player: target,
                correlationId,
                targetIndex: 0,
                targetCount: 1,
                location: { x: 215.5, y: 69, z: 200.5 },
                detail: { ok: true, view: step },
              })}\n`,
              "utf8"
            );
          }
        }
      }, 20);

      return proc;
    },
  });
  t.after(async () => {
    if (watchTimer) clearInterval(watchTimer);
    await controller.stop({ retainArtifacts: false });
  });

  // 1. Verify tools list and annotations
  const { tools } = await client.listTools();
  const toolNames = tools.map((tl) => tl.name).sort();
  assert.deepEqual(toolNames, [
    "bds_qa_events",
    "bds_qa_read_state",
    "bds_qa_start",
    "bds_qa_status",
    "bds_qa_step",
    "bds_qa_stop",
  ]);
  const statusTool = tools.find((tl) => tl.name === "bds_qa_status");
  assert.equal(statusTool.annotations?.readOnlyHint, true);
  const stopTool = tools.find((tl) => tl.name === "bds_qa_stop");
  assert.equal(stopTool.annotations?.destructiveHint, true);

  // 2. Verify schema / bad args rejection before start
  const badFolderRes = await client.callTool({
    name: "bds_qa_start",
    arguments: { only: ["nonexistent_pack_bp"] },
  });
  assert.equal(badFolderRes.isError, true);
  assert.match(badFolderRes.content[0].text, /does not exist|Missing required client-QA fixture packs/);

  const missingRequiredPacksRes = await client.callTool({
    name: "bds_qa_start",
    arguments: { only: ["npc_bp"] },
  });
  assert.equal(missingRequiredPacksRes.isError, true);
  assert.match(missingRequiredPacksRes.content[0].text, /Missing required client-QA fixture packs/);

  // 3. Startup deadline timeout
  mockBehaviour = "hang_start";
  const timeoutStartRes = await client.callTool({
    name: "bds_qa_start",
    arguments: { readyDeadlineMs: 500 },
  });
  assert.equal(timeoutStartRes.isError, true);
  assert.match(timeoutStartRes.content[0].text, /Timed out after 500ms/);

  // 4. Normal start + single-active-instance guard
  mockBehaviour = "normal";
  const startRes = await client.callTool({
    name: "bds_qa_start",
    arguments: { readyDeadlineMs: 5000 },
  });
  assert.ok(!startRes.isError, startRes.content[0].text);
  const startData = JSON.parse(startRes.content[0].text);
  assert.equal(startData.status, "ready_waiting_for_client");
  assert.equal(startData.git.commit, "deadbeef1234");
  assert.equal(startData.gates.server, "verified");
  assert.equal(startData.gates.visual, "unverified");
  assert.equal(startData.stagedPacks[0].sourceSha256, "aaa111");

  const dupStartRes = await client.callTool({
    name: "bds_qa_start",
    arguments: {},
  });
  assert.equal(dupStartRes.isError, true);
  assert.match(dupStartRes.content[0].text, /already active/);

  // 5. Correlated step ACK
  const stepRes = await client.callTool({
    name: "bds_qa_step",
    arguments: { step: "npc_5m", deadlineMs: 2000 },
  });
  assert.ok(!stepRes.isError, stepRes.content[0].text);
  const stepData = JSON.parse(stepRes.content[0].text);
  assert.equal(stepData.ok, true);
  assert.equal(stepData.step, "npc_5m");
  assert.match(stepData.correlationId, /^req_1_/);
  assert.equal(stepData.results[0].player, "MytGFX");
  assert.equal(stepData.gates.visual, "unverified");

  // 6. Correlated QA_STEP_ERROR on missing player
  const errStepRes = await client.callTool({
    name: "bds_qa_step",
    arguments: { step: "npc_5m", player: "GhostPlayer", deadlineMs: 2000 },
  });
  assert.equal(errStepRes.isError, true);
  const errStepData = JSON.parse(errStepRes.content[0].text);
  assert.equal(errStepData.ok, false);
  assert.match(errStepData.results[0].error, /Target player "GhostPlayer" not found/);

  // 7. Step deadline timeout
  mockBehaviour = "hang_step";
  const hangStepRes = await client.callTool({
    name: "bds_qa_step",
    arguments: { step: "npc_20m", deadlineMs: 250 },
  });
  assert.equal(hangStepRes.isError, true);
  assert.match(hangStepRes.content[0].text, /Timed out after 250ms/);
  mockBehaviour = "normal";

  // 8. Events + redaction verification
  const eventsRes = await client.callTool({
    name: "bds_qa_events",
    arguments: { tailLines: 20, kind: "all" },
  });
  assert.ok(!eventsRes.isError);
  const eventsData = JSON.parse(eventsRes.content[0].text);
  assert.ok(eventsData.events.some((e) => e.type === "QA_FIXTURE_READY"));
  assert.ok(eventsData.events.some((e) => e.type === "QA_CLIENT_JOINED"));
  assert.ok(eventsData.logTail.some((l) => l.includes("[REDACTED_XUID]") && l.includes("[REDACTED_IP]:61234")));

  // 9. Stop cleans up active state
  const stopRes = await client.callTool({
    name: "bds_qa_stop",
    arguments: { retainArtifacts: false },
  });
  assert.ok(!stopRes.isError);
  const stopData = JSON.parse(stopRes.content[0].text);
  assert.equal(stopData.stopped, true);
  assert.equal(stopData.wasActive, true);
});

test("review regressions: PID ownership/graceful stop, retainOnFailure + serverDir containment, unverified gate fallback, and disconnect tracking", async (t) => {
  const tmpLogs = fs.mkdtempSync(path.join(os.tmpdir(), "bds-mcp-reg-"));
  const ownedServerDir = fs.mkdtempSync(path.join(os.tmpdir(), "bds-run-regtest-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "not-a-bds-dir-"));
  const outsideSentinel = path.join(outsideDir, "keep.txt");
  fs.writeFileSync(outsideSentinel, "do-not-delete", "utf8");

  t.after(() => {
    fs.rmSync(tmpLogs, { recursive: true, force: true });
    fs.rmSync(ownedServerDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  // 1. Setup failure with retainOnFailure: true must retain owned bds-run-* serverDir
  let killSignals = 0;
  const { client: failClient } = await connectInMemoryMcp({
    logsDir: tmpLogs,
    spawnRunner(_cliArgs, { evidenceFile }) {
      const proc = new EventEmitter();
      proc.pid = 888881;
      proc.exitCode = 4;
      proc.stderr = new EventEmitter();
      proc.kill = () => {
        killSignals += 1;
      };
      fs.writeFileSync(
        evidenceFile,
        JSON.stringify({
          schemaVersion: 1,
          status: "setup_failed",
          verdict: "SETUP FAILED: synthetic failure",
          exitCode: 4,
          bds: { serverDir: ownedServerDir, runnerPid: 888881, bdsPid: null, port: 29990, portV6: 29991 },
          errors: { setupError: "synthetic failure" },
        }),
        "utf8"
      );
      return proc;
    },
  });

  const failStart = await failClient.callTool({
    name: "bds_qa_start",
    arguments: { retainOnFailure: true, readyDeadlineMs: 1000 },
  });
  assert.equal(failStart.isError, true);
  assert.equal(fs.existsSync(ownedServerDir), true, "retainOnFailure: true must preserve owned bds-run-* serverDir on setup failure");
  assert.equal(killSignals, 0, "stop() must not signal a runner process whose exitCode is already non-null");

  // 2. Containment guard: tampered evidence.json pointing outside bds-run-* must never be deleted by stop()
  let activeKillCount = 0;
  const { client: guardClient, controller: guardCtrl } = await connectInMemoryMcp({
    logsDir: tmpLogs,
    spawnRunner(_cliArgs, { logFile, evidenceFile, commandInboxFile }) {
      const proc = new EventEmitter();
      proc.pid = 888882;
      proc.exitCode = null;
      proc.stderr = new EventEmitter();
      proc.kill = () => {
        activeKillCount += 1;
        setTimeout(() => {
          proc.exitCode = 0;
          proc.emit("exit", 0);
        }, 30);
      };
      fs.writeFileSync(commandInboxFile, "", "utf8");
      fs.writeFileSync(
        logFile,
        `[scenario] log: QA_FIXTURE_READY {"fixtureReady":true}\n` +
          `[scenario] log: QA_CLIENT_JOINED {"player":"MytGFX","location":{"x":200,"y":69,"z":200}}\n` +
          `[2026-10-17 INFO] Player disconnected: MytGFX, xuid: 2535411111111111\n`,
        "utf8"
      );
      fs.writeFileSync(
        evidenceFile,
        JSON.stringify({
          schemaVersion: 1,
          status: "ready_waiting_for_client",
          bds: { serverDir: outsideDir, runnerPid: 888882, bdsPid: process.pid, port: 29992, portV6: 29993 },
          stagedPacks: [
            { folder: "map_bp", verified: true },
            { folder: "stash_bp", verified: true },
            { folder: "npc_bp", verified: true },
            { folder: "hud_rp", verified: true },
            { folder: "build_rp", verified: true },
          ],
          gates: { server: "verified", network: "nethernet_listening", visual: "unverified" },
        }),
        "utf8"
      );
      return proc;
    },
  });

  const guardStart = await guardClient.callTool({ name: "bds_qa_start", arguments: { readyDeadlineMs: 2000 } });
  assert.ok(!guardStart.isError, guardStart.content[0].text);

  // Verify disconnected player was removed from joinedPlayers
  const statusAfterLeave = await guardClient.callTool({ name: "bds_qa_status", arguments: {} });
  const statusData = JSON.parse(statusAfterLeave.content[0].text);
  assert.equal(statusData.joinedPlayers.length, 0, "disconnected player must be removed from joinedPlayers");

  // Delete evidence file and trigger step timeout: gates must fall back to "unverified", never fabricated "verified"
  fs.rmSync(guardCtrl.currentRun.evidenceFile, { force: true });
  const noEvTimeout = await guardClient.callTool({
    name: "bds_qa_step",
    arguments: { step: "npc_5m", deadlineMs: 150 },
  });
  assert.equal(noEvTimeout.isError, true);
  const noEvData = JSON.parse(noEvTimeout.content[0].text);
  assert.equal(noEvData.gates.server, "unverified", "missing evidence must not fabricate gates.server=verified");
  assert.equal(noEvData.gates.network, "unverified", "missing evidence must not fabricate gates.network=nethernet_listening");
  assert.equal(noEvData.stepGate, "failed");

  // Stop: must NOT delete outsideDir (not matching bds-run-*), must NOT kill bdsPid=process.pid (no matching harness-process.json), and repeated stop() must not re-signal
  const firstStop = await guardClient.callTool({ name: "bds_qa_stop", arguments: { retainArtifacts: false, retainServerDir: false } });
  assert.ok(!firstStop.isError);
  assert.equal(fs.existsSync(outsideSentinel), true, "containment guard must refuse to delete directory not matching <tmpRoot>/bds-run-*");
  assert.equal(activeKillCount, 1);

  const secondStop = await guardClient.callTool({ name: "bds_qa_stop", arguments: { retainArtifacts: false } });
  assert.ok(!secondStop.isError);
  assert.equal(activeKillCount, 1, "repeated bds_qa_stop must not re-signal already terminated process");

  // 4. Crashed runner with retained bds-run-* + matching harness-process.json:
  //    (a) Dead runner while ev.status === "ready_waiting_for_client" must report unverified gates (not verified).
  //    (b) Recycled PID (mismatched bdsBirthId) on first stop after crash must be REFUSED (must not kill process.pid).
  //    (c) Live owned orphan process with matching OS birth identity must be stopped cleanly and its bds-run-* dir removed.
  //    (d) Large log (>370 KB) must preserve middle QA_CLIENT_JOINED + true line index across incremental reads.
  const crashedServerDir = fs.mkdtempSync(path.join(os.tmpdir(), "bds-run-crashed-"));
  const recycledServerDir = fs.mkdtempSync(path.join(os.tmpdir(), "bds-run-recycled-"));
  const orphanChild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  t.after(() => {
    try { orphanChild.kill(); } catch {}
    fs.rmSync(crashedServerDir, { recursive: true, force: true });
    fs.rmSync(recycledServerDir, { recursive: true, force: true });
  });

  // 4a + 4b + 4d: Runner crashes after writing >370KB log (with middle join) and harness-process.json with recycled PID (process.pid, mismatched birthId)
  let crashedProcRef = null;
  const { client: recycledClient } = await connectInMemoryMcp({
    logsDir: tmpLogs,
    spawnRunner: (_cliArgs, { logFile, evidenceFile }) => {
      const proc = new EventEmitter();
      proc.pid = 77702;
      proc.exitCode = null;
      proc.stderr = new EventEmitter();
      proc.kill = () => { proc.exitCode = 0; proc.emit("exit", 0); };
      crashedProcRef = proc;

      // Build >370KB log: line 1 = QA_FIXTURE_READY, line 2 = old QA_STEP_APPLIED, lines 3..1001 = 70KB filler, line 1002 = QA_CLIENT_JOINED MiddleHero, lines 1003..5002 = 300KB filler
      const filler70k = Array.from({ length: 999 }, (_, i) => `[2026-10-17 18:00:00:000 INFO] filler head line ${i} ${"x".repeat(55)}`).join("\n");
      const filler300k = Array.from({ length: 4000 }, (_, i) => `[2026-10-17 18:00:01:000 INFO] filler tail line ${i} ${"y".repeat(60)}`).join("\n");
      fs.writeFileSync(
        logFile,
        `[2026-10-17 18:00:00:000 WARN] [Scripting] HARNESS {"type":"log","msg":"QA_FIXTURE_READY {\\"fixtureReady\\":true}"}\n` +
          `[2026-10-17 18:00:00:100 WARN] [Scripting] HARNESS {"type":"log","msg":"QA_STEP_APPLIED {\\"step\\":\\"npc_5m\\",\\"player\\":\\"QAFixtureBot\\",\\"correlationId\\":\\"req_1_old\\",\\"targetIndex\\":0,\\"targetCount\\":1}"}\n` +
          filler70k + "\n" +
          `[2026-10-17 18:00:00:500 WARN] [Scripting] HARNESS {"type":"log","msg":"QA_CLIENT_JOINED {\\"player\\":\\"MiddleHero\\",\\"isSimulated\\":false}"}\n` +
          filler300k + "\n",
        "utf8"
      );
      fs.writeFileSync(
        path.join(recycledServerDir, "harness-process.json"),
        JSON.stringify({
          runnerPid: 77702,
          bdsPid: process.pid,
          bdsBirthId: "win32:999999999999999999",
          status: "ready_waiting_for_client",
        }),
        "utf8"
      );
      fs.writeFileSync(
        evidenceFile,
        JSON.stringify({
          status: "ready_waiting_for_client",
          verdict: "READY_WAITING_FOR_CLIENT",
          exitCode: null,
          git: { commit: "deadbeef", branch: "test", dirty: false },
          bds: { runnerPid: 77702, bdsPid: process.pid, port: 44100, portV6: 44101, serverDir: recycledServerDir },
          stagedPacks: [
            { folder: "map_bp", verified: true },
            { folder: "stash_bp", verified: true },
            { folder: "npc_bp", verified: true },
            { folder: "hud_rp", verified: true },
            { folder: "build_rp", verified: true },
          ],
          gates: { server: "verified", network: "nethernet_listening", visual: "unverified" },
        }),
        "utf8"
      );
      return proc;
    },
  });

  const recStart = await recycledClient.callTool({ name: "bds_qa_start", arguments: { readyDeadlineMs: 2000 } });
  assert.ok(!recStart.isError, recStart.content[0].text);

  // Check >370KB log preserved middle QA_CLIENT_JOINED and its exact line number (1002)
  const bigStatus = JSON.parse((await recycledClient.callTool({ name: "bds_qa_status", arguments: {} })).content[0].text);
  assert.equal(bigStatus.joinedPlayers.length, 1, "middle QA_CLIENT_JOINED in >370KB log must not be lost");
  assert.equal(bigStatus.joinedPlayers[0].player, "MiddleHero");
  const bigEvents = JSON.parse((await recycledClient.callTool({ name: "bds_qa_events", arguments: { tailLines: 10 } })).content[0].text);
  const joinEv = bigEvents.events.find((e) => e.type === "QA_CLIENT_JOINED");
  assert.ok(joinEv, "QA_CLIENT_JOINED event must be retained in parsed events across >370KB log");
  assert.equal(joinEv.line, 1002, "QA_CLIENT_JOINED line index must be exact (1002), not shifted by head+tail splice");

  // Old ACK at line 2 must NOT satisfy a new step request
  const stepNoReplay = await recycledClient.callTool({ name: "bds_qa_step", arguments: { step: "npc_5m", deadlineMs: 120 } });
  assert.equal(stepNoReplay.isError, true, "old ACK in >370KB log must not be replayed for new step");

  // Simulate runner crash while evidence still says ready_waiting_for_client
  crashedProcRef.exitCode = 1;
  crashedProcRef.emit("exit", 1);

  const crashedStatus = JSON.parse((await recycledClient.callTool({ name: "bds_qa_status", arguments: {} })).content[0].text);
  assert.equal(crashedStatus.active, false);
  assert.equal(crashedStatus.gates.server, "unverified", "dead runner with ready_waiting_for_client evidence must report server=unverified");
  assert.equal(crashedStatus.gates.network, "unverified", "dead runner with ready_waiting_for_client evidence must report network=unverified");

  // First stop after crash with recycled PID (process.pid with wrong bdsBirthId): must NOT kill process.pid!
  const recStop = await recycledClient.callTool({ name: "bds_qa_stop", arguments: { retainArtifacts: false, retainServerDir: false } });
  assert.ok(!recStop.isError, recStop.content[0].text);
  assert.equal(fs.existsSync(recycledServerDir), false, "owned bds-run-* dir should still be cleaned up when retainServerDir=false");

  // 4c: Runner crashes leaving actual owned orphan child process with matching OS birth identity in bds-run-crashed-*
  let orphanRunnerRef = null;
  const { client: orphanClient } = await connectInMemoryMcp({
    logsDir: tmpLogs,
    spawnRunner: (_cliArgs, { logFile, evidenceFile }) => {
      const proc = new EventEmitter();
      proc.pid = 77703;
      proc.exitCode = null;
      proc.stderr = new EventEmitter();
      proc.kill = () => { proc.exitCode = 0; proc.emit("exit", 0); };
      orphanRunnerRef = proc;

      fs.writeFileSync(
        logFile,
        `[2026-10-17 18:00:00:000 WARN] [Scripting] HARNESS {"type":"log","msg":"QA_FIXTURE_READY {\\"fixtureReady\\":true}"}\n`,
        "utf8"
      );
      writeProcessIdentity(crashedServerDir, {
        runnerPid: 77703,
        bdsPid: orphanChild.pid,
        status: "ready_waiting_for_client",
      });
      fs.writeFileSync(
        evidenceFile,
        JSON.stringify({
          status: "ready_waiting_for_client",
          verdict: "READY_WAITING_FOR_CLIENT",
          exitCode: null,
          git: { commit: "deadbeef", branch: "test", dirty: false },
          bds: { runnerPid: 77703, bdsPid: orphanChild.pid, port: 44102, portV6: 44103, serverDir: crashedServerDir },
          stagedPacks: [
            { folder: "map_bp", verified: true },
            { folder: "stash_bp", verified: true },
            { folder: "npc_bp", verified: true },
            { folder: "hud_rp", verified: true },
            { folder: "build_rp", verified: true },
          ],
          gates: { server: "verified", network: "nethernet_listening", visual: "unverified" },
        }),
        "utf8"
      );
      return proc;
    },
  });

  const orphStart = await orphanClient.callTool({ name: "bds_qa_start", arguments: { readyDeadlineMs: 2000 } });
  assert.ok(!orphStart.isError, orphStart.content[0].text);
  orphanRunnerRef.exitCode = 1;
  orphanRunnerRef.emit("exit", 1);

  const orphStop = await orphanClient.callTool({ name: "bds_qa_stop", arguments: { retainArtifacts: false, retainServerDir: false } });
  assert.ok(!orphStop.isError, orphStop.content[0].text);
  assert.equal(fs.existsSync(crashedServerDir), false, "crashed bds-run-* dir must be cleaned up on stop(retainServerDir=false)");
  let orphanStillAlive = false;
  try {
    process.kill(orphanChild.pid, 0);
    orphanStillAlive = true;
  } catch {}
  assert.equal(orphanStillAlive, false, "verified owned orphan bdsPid with matching OS birth identity must be terminated by stop()");
});

test("live stdio MCP server starts private BDS fixture, executes correlated steps, reads live state, and stops cleanly", async (t) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(HERE, "mcp-server.mjs")],
    cwd: path.resolve(HERE, "..", ".."),
    stderr: "pipe",
  });
  const client = new Client({ name: "mcp-live-integration-test", version: "1.0.0" });
  await client.connect(transport);

  t.after(async () => {
    try {
      await client.callTool({ name: "bds_qa_stop", arguments: { retainArtifacts: true, retainServerDir: false } });
    } catch {}
    try {
      await client.close();
    } catch {}
  });

  // 1. Start live private BDS fixture (random free port pair)
  const startRes = await client.callTool({
    name: "bds_qa_start",
    arguments: {
      readyDeadlineMs: 120000,
    },
  });
  assert.ok(!startRes.isError, `bds_qa_start failed: ${startRes.content[0]?.text}`);
  const startInfo = JSON.parse(startRes.content[0].text);
  assert.equal(startInfo.status, "ready_waiting_for_client");
  assert.ok(Number.isInteger(startInfo.port) && startInfo.port >= 1024);
  assert.ok(Number.isInteger(startInfo.bdsPid) && startInfo.bdsPid > 0);
  assert.equal(startInfo.gates.server, "verified");
  assert.equal(startInfo.gates.network, "nethernet_listening");
  assert.equal(startInfo.gates.visual, "unverified");
  assert.equal(startInfo.fixtureManifest?.fixtureReady, true);
  assert.ok(startInfo.stagedPacks.length >= 5);

  // 2. Step: npc_20m -> npc_probe_always -> npc_5m -> npc_probe_looked_at -> map_bridge
  const stepProbeOn = await client.callTool({
    name: "bds_qa_step",
    arguments: { step: "npc_probe_always", deadlineMs: 10000 },
  });
  assert.ok(!stepProbeOn.isError, stepProbeOn.content[0]?.text);
  const probeOnAck = JSON.parse(stepProbeOn.content[0].text);
  assert.equal(probeOnAck.ok, true);
  assert.equal(probeOnAck.stepGate, "verified");
  assert.equal(probeOnAck.results[0].player, "QAFixtureBot");
  assert.equal(probeOnAck.results[0].detail.count, 1);

  const step5m = await client.callTool({
    name: "bds_qa_step",
    arguments: { step: "npc_5m", deadlineMs: 10000 },
  });
  assert.ok(!step5m.isError, step5m.content[0]?.text);
  const step5mAck = JSON.parse(step5m.content[0].text);
  assert.equal(step5mAck.ok, true);
  assert.equal(step5mAck.results[0].detail.distanceMeters, 5);

  const stepProbeOff = await client.callTool({
    name: "bds_qa_step",
    arguments: { step: "npc_probe_looked_at", deadlineMs: 10000 },
  });
  assert.ok(!stepProbeOff.isError, stepProbeOff.content[0]?.text);
  const probeOffAck = JSON.parse(stepProbeOff.content[0].text);
  assert.equal(probeOffAck.ok, true);
  assert.equal(probeOffAck.results[0].detail.count, 0);

  // 3. Read in-world live state snapshot
  const stateRes = await client.callTool({
    name: "bds_qa_read_state",
    arguments: { refreshInWorld: true, deadlineMs: 10000 },
  });
  assert.ok(!stateRes.isError, stateRes.content[0]?.text);
  const stateData = JSON.parse(stateRes.content[0].text);
  assert.equal(stateData.active, true);
  assert.equal(stateData.liveSnapshot?.view, "state_snapshot");
  assert.equal(stateData.liveSnapshot?.probeCount, 0);
  assert.ok(stateData.liveSnapshot?.npc?.nameTag?.includes("Mara"));

  // 4. Stop server and verify BDS PID exits while retaining log + evidence JSON
  const stopRes = await client.callTool({
    name: "bds_qa_stop",
    arguments: { retainArtifacts: true, retainServerDir: false },
  });
  assert.ok(!stopRes.isError, stopRes.content[0]?.text);
  const stopData = JSON.parse(stopRes.content[0].text);
  assert.equal(stopData.stopped, true);
  assert.equal(stopData.wasActive, true);
  assert.equal(stopData.serverDirRetained, false);
  assert.ok(stopData.logFile && fs.existsSync(stopData.logFile), "Expected retained logFile on disk");
  assert.ok(stopData.evidenceFile && fs.existsSync(stopData.evidenceFile), "Expected retained evidenceFile on disk");

  await new Promise((r) => setTimeout(r, 300));
  let bdsAlive = false;
  try {
    process.kill(startInfo.bdsPid, 0);
    bdsAlive = true;
  } catch {}
  assert.equal(bdsAlive, false, `Expected owned BDS PID ${startInfo.bdsPid} to be terminated after bds_qa_stop`);
});
