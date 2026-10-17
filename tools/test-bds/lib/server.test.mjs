import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import * as server from "./server.mjs";
import * as packs from "./packs.mjs";
import * as botAdapter from "./bot-adapter.mjs";
import { BDS_URL, setup } from "../setup.mjs";

const isWin = process.platform === "win32";
const binary = isWin ? "bedrock_server.exe" : "bedrock_server";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const harnessDir = path.dirname(HERE);

test("uses native file paths for the harness directory", () => {
  assert.equal(server.HERE, harnessDir);
});

test("selects the platform binary and download", () => {
  assert.equal(server.IS_WIN, isWin);
  assert.equal(server.BDS_BIN, binary);
  assert.equal(BDS_URL, `https://www.minecraft.net/bedrockdedicatedserver/bin-${isWin ? "win" : "linux"}/bedrock-server-${server.BDS_VERSION}.zip`);
});

test("defaults to the platform installation directory and honors BDS_DIR", (t) => {
  const previous = process.env.BDS_DIR;
  t.after(() => {
    if (previous === undefined) delete process.env.BDS_DIR;
    else process.env.BDS_DIR = previous;
  });
  delete process.env.BDS_DIR;
  assert.equal(server.bdsDir(), isWin ? path.join(os.homedir(), ".bds") : "/home/user/bds");
  process.env.BDS_DIR = path.join(harnessDir, "custom-bds");
  assert.equal(server.bdsDir(), process.env.BDS_DIR);
});

test("isolates writable server files while sharing runtime assets", async (t) => {
  const cache = path.join(harnessDir, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(cache, "server test-"));
  const src = path.join(fixture, "source");
  const runs = path.join(fixture, "runs");
  fs.mkdirSync(src);
  fs.mkdirSync(runs);
  const previous = { BDS_DIR: process.env.BDS_DIR, BDS_HARNESS_TMP: process.env.BDS_HARNESS_TMP };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  process.env.BDS_DIR = src;
  process.env.BDS_HARNESS_TMP = runs;
  fs.writeFileSync(path.join(src, binary), "binary");
  fs.writeFileSync(path.join(src, "runtime.dll"), "runtime");
  fs.writeFileSync(path.join(src, "server.properties"), "server-name=original\n");
  for (const name of ["behavior_packs", "resource_packs", "definitions", "data", "worlds"]) {
    fs.mkdirSync(path.join(src, name));
    fs.writeFileSync(path.join(src, name, "asset"), name);
  }
  const dir = server.makeServerDir();
  assert.equal(setup(), src);
  assert.equal(fs.readFileSync(path.join(dir, binary), "utf8"), "binary");
  assert.equal(fs.statSync(path.join(dir, binary)).ino, fs.statSync(path.join(src, binary)).ino);
  assert.equal(fs.readFileSync(path.join(dir, "runtime.dll"), "utf8"), "runtime");
  if (isWin) {
    assert.equal(fs.statSync(path.join(dir, "runtime.dll")).ino, fs.statSync(path.join(src, "runtime.dll")).ino);
    assert.ok(fs.lstatSync(path.join(dir, "data")).isSymbolicLink());
  }
  assert.ok(fs.statSync(path.join(dir, "development_behavior_packs")).isDirectory());
  assert.ok(fs.statSync(path.join(dir, "development_resource_packs")).isDirectory());
  assert.equal(fs.existsSync(path.join(dir, "worlds")), false);
  server.writeProps(dir, { "server-name": "test" });
  assert.equal(fs.readFileSync(path.join(src, "server.properties"), "utf8"), "server-name=original\n");
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(fs.readFileSync(path.join(src, "data", "asset"), "utf8"), "data");
  await t.test("copies runtime assets when Windows linking is unavailable", { skip: !isWin }, (t) => {
    const unavailable = () => { throw Object.assign(new Error("cross-device link"), { code: "EXDEV" }); };
    t.mock.method(fs, "linkSync", unavailable);
    t.mock.method(fs, "symlinkSync", unavailable);
    const copied = server.makeServerDir();
    assert.equal(fs.readFileSync(path.join(copied, binary), "utf8"), "binary");
    assert.equal(fs.readFileSync(path.join(copied, "runtime.dll"), "utf8"), "runtime");
    assert.equal(fs.readFileSync(path.join(copied, "data", "asset"), "utf8"), "data");
    assert.notEqual(fs.statSync(path.join(copied, binary)).ino, fs.statSync(path.join(src, binary)).ino);
    assert.equal(fs.lstatSync(path.join(copied, "data")).isSymbolicLink(), false);
    fs.rmSync(copied, { recursive: true, force: true });
    assert.equal(fs.readFileSync(path.join(src, "data", "asset"), "utf8"), "data");
  });
});

test("reserves and releases IPv4/IPv6 TCP+UDP port pairs and detects occupied ports", async (t) => {
  const port = await server.reservePortPair();
  t.after(() => server.releasePortPair(port));
  assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65534);

  // While locked in .cache/ports, a second reservation for the same port must fail.
  await assert.rejects(() => server.reservePortPair(port), /not free|reserved/);
  server.releasePortPair(port);

  // Occupying UDP port+1 (the IPv6 companion port) must cause portPairFree(port) to return false.
  const udp6 = dgram.createSocket("udp4");
  await new Promise((resolve) => udp6.bind(port + 1, "127.0.0.1", resolve));
  t.after(() => { try { udp6.close(); } catch {} });
  assert.equal(await server.portPairFree(port), false);
});

test("writes process identity and verifies staged pack SHA-256 hashes", (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bds-pack-hash-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const idFile = server.writeProcessIdentity(tmp, { bdsPid: 12345, port: 29132, transport: "nethernet" });
  const idDoc = JSON.parse(fs.readFileSync(idFile, "utf8"));
  assert.equal(idDoc.runnerPid, process.pid);
  assert.equal(idDoc.bdsPid, 12345);
  assert.equal(idDoc.port, 29132);

  const srcPack = path.join(tmp, "sample_bp");
  fs.mkdirSync(path.join(srcPack, "scripts"), { recursive: true });
  const manifest = {
    format_version: 2,
    header: { name: "Sample", uuid: "11111111-2222-3333-4444-555555555555", version: [1, 0, 0], min_engine_version: [1, 21, 100] },
    modules: [{ type: "script", language: "javascript", uuid: "11111111-2222-3333-4444-555555555556", version: [1, 0, 0], entry: "scripts/main.js" }],
    dependencies: [{ module_name: "@minecraft/server", version: "2.1.0" }],
  };
  fs.writeFileSync(path.join(srcPack, "manifest.json"), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(srcPack, "scripts", "main.js"), 'console.log("hi");\n');

  const serverDir = path.join(tmp, "server");
  fs.mkdirSync(path.join(serverDir, "development_behavior_packs"), { recursive: true });
  const packObj = { folder: "sample_bp", dir: srcPack, manifest, kind: "bp", name: "Sample" };
  packs.installBehaviorPack(packObj, serverDir, { shim: true });
  assert.equal(packObj.stagedInfo.verified, true);
  assert.equal(packObj.stagedInfo.shimApplied, true);
  assert.equal(packObj.stagedInfo.fileCount, 2);

  // Tampering with shimmed manifest.json must throw a SHA-256 verification error.
  const destDir = path.join(serverDir, "development_behavior_packs", "sample_bp");
  const stagedManifestPath = path.join(destDir, "manifest.json");
  const origStagedManifest = fs.readFileSync(stagedManifestPath, "utf8");
  const tamperedManifest = JSON.parse(origStagedManifest);
  tamperedManifest.header.uuid = "99999999-9999-9999-9999-999999999999";
  fs.writeFileSync(stagedManifestPath, JSON.stringify(tamperedManifest, null, 2));
  assert.throws(
    () => packs.inspectStagedPack(packObj, destDir, true),
    /Staged file hash mismatch.*manifest\.json/
  );
  fs.writeFileSync(stagedManifestPath, origStagedManifest);

  // Injecting an unexpected extra file into the staged pack must be rejected.
  const extraFile = path.join(destDir, "scripts", "injected.js");
  fs.writeFileSync(extraFile, "export const hacked = true;\n");
  assert.throws(
    () => packs.inspectStagedPack(packObj, destDir, true),
    /Unexpected extra file in staged pack/
  );
  fs.rmSync(extraFile, { force: true });

  // Tampering with a staged file must throw a SHA-256 verification error.
  const stagedMain = path.join(destDir, "scripts", "main.js");
  fs.writeFileSync(stagedMain, 'console.log("stale");\n');
  assert.throws(
    () => packs.inspectStagedPack(packObj, destDir, true),
    /Staged file hash mismatch/
  );
});

test("shares port locks across different BDS_HARNESS_CACHE directories and enforces ensureTemplate lock ownership", async (t) => {
  const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), "bds-cache-a-"));
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), "bds-cache-b-"));
  const oldCache = process.env.BDS_HARNESS_CACHE;
  t.after(() => {
    if (oldCache === undefined) delete process.env.BDS_HARNESS_CACHE;
    else process.env.BDS_HARNESS_CACHE = oldCache;
    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
  });

  process.env.BDS_HARNESS_CACHE = tmpA;
  const port = await server.reservePortPair();
  t.after(() => server.releasePortPair(port));

  // Switching BDS_HARNESS_CACHE to a second worktree/cache directory must still see the same host-wide port lock.
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { reservePortPair } from ${JSON.stringify(pathToFileURL(path.join(HERE, "server.mjs")).href)};
       process.env.BDS_HARNESS_CACHE = ${JSON.stringify(tmpB)};
       try { await reservePortPair(${port}); process.exit(0); } catch { process.exit(42); }`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 42, `expected cross-cache port lock contention exit 42, got ${child.status}: ${child.stderr}`);

  // ensureTemplate lock held by a live PID must time out rather than building unlocked or deleting owner's lock.
  process.env.BDS_HARNESS_CACHE = tmpA;
  const worldsDir = path.join(tmpA, "worlds");
  fs.mkdirSync(worldsDir, { recursive: true });
  const lockFile = path.join(worldsDir, `${server.BDS_VERSION}-seed-99999.lock`);
  const ownerPayload = JSON.stringify({ pid: process.pid, token: "owner-token-1", key: "seed-99999", at: new Date().toISOString() });
  fs.writeFileSync(lockFile, ownerPayload);
  await assert.rejects(
    () => server.ensureTemplate({ seed: 99999, flat: false, lockTimeoutMs: 120 }),
    /Timed out.*waiting for world template lock/
  );
  assert.equal(fs.existsSync(lockFile), true, "contender must not delete active owner's template lock");
  assert.equal(fs.readFileSync(lockFile, "utf8"), ownerPayload);
});

test("bot-adapter verifies RakNet + NetworkSettings handshake when server speaks RakNet and reports unsupported on NetherNet-only BDS", async (t) => {
  // 1. Mock RakNet UDP responder speaking UnconnectedPong -> OCR1 -> OCR2 -> ConnReqAccepted -> NetworkSettings (0x8f)
  const mockServer = dgram.createSocket("udp4");
  await new Promise((resolve) => mockServer.bind(0, "127.0.0.1", resolve));
  t.after(() => { try { mockServer.close(); } catch {} });
  const mockPort = mockServer.address().port;

  mockServer.on("message", (msg, rinfo) => {
    const id = msg[0];
    if (id === 0x01) {
      const ad = "MCPE;Dedicated Server;944;1.26.52;0;10;123456789;world;Survival;1;19132;19133;";
      const adBuf = Buffer.from(ad, "utf8");
      const pong = Buffer.alloc(35 + adBuf.length);
      pong[0] = 0x1c;
      pong.writeBigInt64BE(1n, 1);
      pong.writeBigUInt64BE(0x123456789abcdef0n, 9);
      botAdapter.RAKNET_MAGIC.copy(pong, 17);
      pong.writeUInt16BE(adBuf.length, 33);
      adBuf.copy(pong, 35);
      mockServer.send(pong, rinfo.port, rinfo.address);
    } else if (id === 0x05) {
      const reply1 = Buffer.alloc(28);
      reply1[0] = 0x06;
      botAdapter.RAKNET_MAGIC.copy(reply1, 1);
      reply1.writeBigUInt64BE(0x123456789abcdef0n, 17);
      reply1[25] = 0;
      reply1.writeUInt16BE(1400, 26);
      mockServer.send(reply1, rinfo.port, rinfo.address);
    } else if (id === 0x07) {
      const reply2 = Buffer.alloc(35);
      reply2[0] = 0x08;
      botAdapter.RAKNET_MAGIC.copy(reply2, 1);
      reply2.writeBigUInt64BE(0x123456789abcdef0n, 17);
      reply2.writeUInt16BE(1400, 31);
      mockServer.send(reply2, rinfo.port, rinfo.address);
    } else if (id === 0x84) {
      const innerId = msg[10];
      if (innerId === 0x09) {
        // Frame wrapping 0x10 ConnectionRequestAccepted
        const frame = Buffer.from([0x84, 0x00, 0x00, 0x00, 0x40, 0x00, 0x08, 0x00, 0x00, 0x00, 0x10]);
        mockServer.send(frame, rinfo.port, rinfo.address);
      } else if (innerId === 0xfe) {
        // Frame wrapping 0xfe + len(8) + VarInt(0x8f = 0x8f, 0x01) + threshold(1) + algo(0) + throttle(0)
        const game = Buffer.from([0xfe, 0x08, 0x8f, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
        const hdr = Buffer.from([0x84, 0x01, 0x00, 0x00, 0x40, 0x00, game.length * 8, 0x01, 0x00, 0x00]);
        mockServer.send(Buffer.concat([hdr, game]), rinfo.port, rinfo.address);
      }
    }
  });

  const okProbe = await botAdapter.probeNativeBedrockBot({ host: "127.0.0.1", port: mockPort, transport: "raknet", timeoutMs: 1000 });
  assert.equal(okProbe.capabilities.raknetPing, "verified");
  assert.equal(okProbe.capabilities.raknetOpenConnection, "verified");
  assert.equal(okProbe.capabilities.raknetSessionAccepted, "verified");
  assert.equal(okProbe.capabilities.bedrockNetworkSettings, "verified");
  assert.equal(okProbe.capabilities.raknetHandshake, "verified");
  assert.equal(okProbe.capabilities.modalFormResponse, "unverified");
  assert.equal(okProbe.capabilities.nativeInventoryRequest, "unverified");
  assert.equal(okProbe.bedrockProtocolStatus.bdsRejectsRaknet, false);
  assert.equal(okProbe.advertisement.protocol, 944);
  assert.equal(okProbe.gate, "unsupported");
  assert.equal(okProbe.capabilities.visualRendering, "unsupported_by_protocol_bot");

  // 2. Non-RakNet port with observed BDS TRANSPORT TYPE ERROR (NetherNet-only BDS 1.26.52.3)
  const silentSock = dgram.createSocket("udp4");
  await new Promise((resolve) => silentSock.bind(0, "127.0.0.1", resolve));
  t.after(() => { try { silentSock.close(); } catch {} });
  const nethernetProbe = await botAdapter.probeNativeBedrockBot({
    host: "127.0.0.1",
    port: silentSock.address().port,
    transport: "nethernet",
    transportErrorLogged: true,
    timeoutMs: 200,
  });
  assert.equal(nethernetProbe.gate, "unsupported");
  assert.equal(nethernetProbe.bedrockProtocolStatus.bdsRejectsRaknet, true);
  assert.equal(nethernetProbe.capabilities.raknetPing, "unsupported_nethernet_only_bds");
  assert.equal(nethernetProbe.capabilities.modalFormResponse, "unverified");
  assert.equal(nethernetProbe.capabilities.nativeInventoryRequest, "unverified");

  // 3. Silent RakNet UDP timeout WITHOUT transportErrorLogged must report gate="failed" and bdsRejectsRaknet=false
  const timeoutProbe = await botAdapter.probeNativeBedrockBot({
    host: "127.0.0.1",
    port: silentSock.address().port,
    transport: "raknet",
    transportErrorLogged: false,
    timeoutMs: 200,
  });
  assert.equal(timeoutProbe.gate, "failed");
  assert.equal(timeoutProbe.bedrockProtocolStatus.bdsRejectsRaknet, false);
  assert.equal(timeoutProbe.capabilities.raknetPing, "unverified");
  assert.equal(timeoutProbe.capabilities.raknetHandshake, "failed_timeout");

  // 4. Partial responder that answers only UnconnectedPong (0x1c) must NOT claim full handshake verified
  const pingOnlyServer = dgram.createSocket("udp4");
  await new Promise((resolve) => pingOnlyServer.bind(0, "127.0.0.1", resolve));
  t.after(() => { try { pingOnlyServer.close(); } catch {} });
  pingOnlyServer.on("message", (msg, rinfo) => {
    if (msg[0] === 0x01) {
      const ad = "MCPE;Dedicated Server;944;1.26.52;0;10;123456789;world;Survival;1;19132;19133;";
      const adBuf = Buffer.from(ad, "utf8");
      const pong = Buffer.alloc(35 + adBuf.length);
      pong[0] = 0x1c;
      pong.writeBigInt64BE(1n, 1);
      pong.writeBigUInt64BE(0x123456789abcdef0n, 9);
      botAdapter.RAKNET_MAGIC.copy(pong, 17);
      pong.writeUInt16BE(adBuf.length, 33);
      adBuf.copy(pong, 35);
      pingOnlyServer.send(pong, rinfo.port, rinfo.address);
    }
  });
  const partialProbe = await botAdapter.probeNativeBedrockBot({
    host: "127.0.0.1",
    port: pingOnlyServer.address().port,
    transport: "raknet",
    transportErrorLogged: false,
    timeoutMs: 250,
  });
  assert.equal(partialProbe.capabilities.raknetPing, "verified");
  assert.equal(partialProbe.capabilities.raknetOpenConnection, "unverified");
  assert.equal(partialProbe.capabilities.raknetHandshake, "partial_failed");
  assert.equal(partialProbe.gate, "failed");
});

test("run.mjs writes structured evidence manifest on setup failure (exit 4)", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bds-setup-fail-"));
  const port = await server.reservePortPair();
  t.after(() => {
    server.releasePortPair(port);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const logFile = path.join(tmp, "setup-fail.log");
  const evFile = path.join(tmp, "setup-fail.evidence.json");
  const runScript = path.join(harnessDir, "run.mjs");
  const child = spawnSync(
    process.execPath,
    [runScript, "--only", "help_bp", "--port", String(port), "--log", logFile, "--evidence", evFile, "--quiet"],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 4);
  assert.equal(fs.existsSync(evFile), true, "expected setup failure to write evidence JSON");
  const ev = JSON.parse(fs.readFileSync(evFile, "utf8"));
  assert.equal(ev.status, "setup_failed");
  assert.equal(ev.exitCode, 4);
  assert.equal(ev.gates.server, "failed");
  assert.match(ev.errors.setupError, /not free/);
});

