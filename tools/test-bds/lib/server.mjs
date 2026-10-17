// Preparing and running throwaway copies of Bedrock Dedicated Server.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import dgram from "node:dgram";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readLevelDat, writeLevelDat, T } from "./nbt.mjs";

export const HERE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const IS_WIN = process.platform === "win32";
export const BDS_BIN = IS_WIN ? "bedrock_server.exe" : "bedrock_server";
export const BDS_VERSION = "1.26.52.3";

export function bdsDir() {
  return path.resolve(process.env.BDS_DIR || (IS_WIN ? path.join(os.homedir(), ".bds") : "/home/user/bds"));
}
export function cacheDir() {
  return path.resolve(process.env.BDS_HARNESS_CACHE || path.join(HERE, ".cache"));
}
export function tmpRoot() {
  return path.resolve(process.env.BDS_HARNESS_TMP || os.tmpdir());
}

/** Big read-only parts of BDS are linked (junctions on Windows); config files are copied. */
const LINKED = new Set([BDS_BIN, "behavior_packs", "resource_packs", "definitions", "data"]);
const SKIPPED = new Set(["worlds", "development_behavior_packs", "development_resource_packs", "bds.zip", "logs"]);

export function makeServerDir(prefix = "bds-run-") {
  const src = bdsDir();
  if (!fs.existsSync(path.join(src, BDS_BIN))) {
    throw new Error(`No BDS at ${src} (set BDS_DIR, or run setup.mjs to download it)`);
  }
  const dir = fs.mkdtempSync(path.join(tmpRoot(), prefix));
  for (const name of fs.readdirSync(src)) {
    if (SKIPPED.has(name) || name.endsWith(".zip")) continue;
    const from = path.join(src, name), to = path.join(dir, name);
    if (LINKED.has(name) || (IS_WIN && /\.dll$/i.test(name))) {
      if (IS_WIN) {
        try {
          if (fs.statSync(from).isDirectory()) fs.symlinkSync(from, to, "junction");
          else fs.linkSync(from, to);
        } catch {
          fs.cpSync(from, to, { recursive: true });
        }
      } else {
        const r = spawnSync("cp", ["-al", from, to]);
        if (r.status !== 0) fs.cpSync(from, to, { recursive: true });
      }
    } else {
      fs.cpSync(from, to, { recursive: true });
    }
  }
  fs.mkdirSync(path.join(dir, "development_behavior_packs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "development_resource_packs"), { recursive: true });
  return dir;
}

export function writeProps(dir, props) {
  const file = path.join(dir, "server.properties");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const left = new Map(Object.entries(props).map(([k, v]) => [k, String(v)]));
  const outLines = lines.map((l) => {
    const m = /^([a-z0-9-]+)=/.exec(l);
    if (m && left.has(m[1])) {
      const v = left.get(m[1]);
      left.delete(m[1]);
      return `${m[1]}=${v}`;
    }
    return l;
  });
  for (const [k, v] of left) outLines.push(`${k}=${v}`);
  fs.writeFileSync(file, outLines.join("\n"));
}

/** Properties every harness run uses. Nethernet listens on TCP server-port (raknet needs IPv6 here). */
export function baseProps(port, extra = {}) {
  return {
    "server-name": "BDS Harness",
    "level-name": "world",
    "gamemode": "survival",
    "difficulty": "easy",
    "allow-cheats": "true",
    "online-mode": "false",
    "allow-list": "false",
    "transport": "nethernet",
    "server-port": port,
    "server-portv6": port + 1,
    "enable-lan-visibility": "false",
    "view-distance": 10,
    "tick-distance": 4,
    "max-players": 20,
    "player-idle-timeout": 0,
    "content-log-console-output-enabled": "true",
    "content-log-level": "info",
    "default-player-permission-level": "member",
    "emit-server-telemetry": "false",
    ...extra,
  };
}

function tcpFree(port, host = "0.0.0.0") {
  const isV6 = host.includes(":");
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", (err) => resolve(isV6 && (err.code === "EAFNOSUPPORT" || err.code === "EADDRNOTAVAIL")));
    s.listen({ port, host, exclusive: true, ipv6Only: isV6 }, () => s.close(() => resolve(true)));
  });
}
function udpFree(port, host = "0.0.0.0") {
  const isV6 = host.includes(":");
  return new Promise((resolve) => {
    const s = dgram.createSocket({ type: isV6 ? "udp6" : "udp4", reuseAddr: false, ipv6Only: isV6 });
    s.once("error", (err) => {
      try { s.close(); } catch {}
      resolve(isV6 && (err.code === "EAFNOSUPPORT" || err.code === "EADDRNOTAVAIL"));
    });
    s.bind({ port, address: host, exclusive: true }, () => s.close(() => resolve(true)));
  });
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === "EPERM";
  }
}

export function portLockDir(env = process.env) {
  const dir = env.BDS_PORT_LOCK_DIR || path.join(os.tmpdir(), "bds-harness-port-locks");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function tryLockPortPair(port) {
  const dir = portLockDir();
  const files = [path.join(dir, `port-${port}.lock`), path.join(dir, `port-${port + 1}.lock`)];
  for (const f of files) {
    if (fs.existsSync(f)) {
      try {
        const data = JSON.parse(fs.readFileSync(f, "utf8"));
        if (isPidAlive(data.pid)) return false;
      } catch {}
      try { fs.rmSync(f, { force: true }); } catch {}
    }
  }
  const payload = JSON.stringify({ pid: process.pid, port, portV6: port + 1, at: new Date().toISOString() });
  try {
    for (const f of files) fs.writeFileSync(f, payload, { flag: "wx" });
    return true;
  } catch {
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(f, "utf8"));
        if (data.pid === process.pid) fs.rmSync(f, { force: true });
      } catch {}
    }
    return false;
  }
}

export function releasePortPair(port) {
  if (!Number.isInteger(port)) return;
  const dir = portLockDir();
  for (const p of [port, port + 1]) {
    const f = path.join(dir, `port-${p}.lock`);
    try {
      if (fs.existsSync(f)) {
        const data = JSON.parse(fs.readFileSync(f, "utf8"));
        if (!data.pid || data.pid === process.pid || !isPidAlive(data.pid)) fs.rmSync(f, { force: true });
      }
    } catch {
      try { fs.rmSync(f, { force: true }); } catch {}
    }
  }
}

export async function portPairFree(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65534) return false;
  for (const p of [port, port + 1]) {
    for (const host of ["0.0.0.0", "127.0.0.1", "::", "::1"]) {
      if (!(await tcpFree(p, host))) return false;
      if (!(await udpFree(p, host))) return false;
    }
  }
  return true;
}

export async function reservePortPair(requestedPort) {
  if (requestedPort !== undefined && requestedPort !== null) {
    const p = Number(requestedPort);
    if (!Number.isInteger(p) || p < 1024 || p > 65534) {
      throw new Error(`Invalid port ${requestedPort}: must be an integer in 1024..65534 (reserves port and port+1)`);
    }
    if (!(await portPairFree(p)) || !tryLockPortPair(p)) {
      throw new Error(`Port pair ${p}/${p + 1} is not free (TCP/UDP IPv4/IPv6 or reserved by another harness run)`);
    }
    return p;
  }
  for (let i = 0; i < 300; i++) {
    const p = 20000 + 2 * Math.floor(Math.random() * 19000);
    if ((await portPairFree(p)) && tryLockPortPair(p)) return p;
  }
  throw new Error("no free TCP/UDP port pair found");
}

export async function freePort() {
  return reservePortPair();
}

export function writeProcessIdentity(dir, info) {
  const file = path.join(dir, "harness-process.json");
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, runnerPid: process.pid, updatedAt: new Date().toISOString(), ...info }, null, 2));
  return file;
}

/**
 * Read-only feasibility check for local Windows Bedrock client visual QA.
 * Never launches Minecraft, never disconnects an active session, and never modifies OS/UWP settings.
 */
export function checkClientFeasibility() {
  if (!IS_WIN) {
    return {
      platform: process.platform,
      supported: false,
      multiInstanceSupported: false,
      reason: "Windows Bedrock client (Microsoft.MinecraftUWP) requires win32",
    };
  }
  const runPs = (cmd) => {
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8", timeout: 8000 });
    return r.status === 0 ? r.stdout.trim() : "";
  };
  let packages = [];
  try {
    const raw = runPs("Get-AppxPackage *Minecraft* | Select-Object Name,Version,PackageFullName | ConvertTo-Json -Compress");
    if (raw) {
      const parsed = JSON.parse(raw);
      packages = Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch {}
  let runningPids = [];
  try {
    const raw = runPs("Get-Process -Name 'Minecraft.Windows' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id | ConvertTo-Json -Compress");
    if (raw) {
      const parsed = JSON.parse(raw);
      runningPids = (Array.isArray(parsed) ? parsed : [parsed]).map(Number).filter(Number.isInteger);
    }
  } catch {}
  let loopbackExempt = false;
  try {
    const lo = spawnSync("CheckNetIsolation.exe", ["LoopbackExempt", "-s"], { encoding: "utf8", timeout: 5000 });
    const text = (lo.stdout || "") + (lo.stderr || "");
    loopbackExempt = /minecraftuwp|S-1-15-2-2551677095/i.test(text);
  } catch {}
  const uwp = packages.find((p) => p.Name === "Microsoft.MinecraftUWP");
  const preview = packages.find((p) => /MinecraftWindowsBeta/i.test(p.Name || ""));
  return {
    platform: "win32",
    uwpInstalled: !!uwp,
    uwpVersion: uwp?.Version ?? null,
    previewInstalled: !!preview,
    previewVersion: preview?.Version ?? null,
    runningPids,
    activeClientRunning: runningPids.length > 0,
    multiInstanceSupported: !!preview,
    multiInstanceReason: preview
      ? "Retail UWP and Preview UWP are separate AppX packages, though each package is single-instance per Windows user session."
      : "Microsoft.MinecraftUWP is a single-instance packaged UWP app per Windows user session; Windows cannot launch a second concurrent retail Minecraft.Windows.exe instance in the same user session.",
    uiInputNote:
      "Minecraft.Windows.exe renders a DirectX/GameInput UWP canvas where coordinate clicks report done without actuating controls; bare keyboard keys (Tab, Left/Right/Up/Down, Return, Space on modal warnings, [ and ] for Play tabs) plus type_text targeted at window element_index 0 navigate menus after fresh screenshot verification without shell focus workarounds.",
    uwpLoopbackExempt: loopbackExempt,
    loopbackNote: loopbackExempt
      ? "UWP loopback exemption detected for Minecraft.Windows."
      : "Microsoft.MinecraftUWP is not in CheckNetIsolation LoopbackExempt; empirically, local NetherNet connections to 127.0.0.1 succeed without LoopbackExempt.",
  };
}

/**
 * Starts bedrock_server in dir. onLine(line) gets every output line.
 * Returns { proc, send(cmd), exited: Promise<code> }.
 */
export function startBds(dir, onLine) {
  const proc = spawn(IS_WIN ? path.join(dir, BDS_BIN) : "./bedrock_server", [], {
    cwd: dir,
    env: { ...process.env, LD_LIBRARY_PATH: "." },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buf = "";
  const feed = (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      onLine(line);
    }
  };
  proc.stdout.on("data", feed);
  proc.stderr.on("data", feed);
  const exited = new Promise((resolve) => proc.on("exit", (code, sig) => { if (buf) onLine(buf); buf = ""; resolve(code ?? (sig ? 128 : 0)); }));
  const send = (cmd) => { try { proc.stdin.write(cmd + "\n"); } catch (e) { /* closed */ } };
  return { proc, send, exited };
}

export async function stopBds(bds, graceMs = 15000) {
  bds.send("stop");
  const t = setTimeout(() => { try { IS_WIN ? bds.proc.kill() : bds.proc.kill("SIGKILL"); } catch (e) { /* gone */ } }, graceMs);
  const code = await bds.exited;
  clearTimeout(t);
  return code;
}

// ---------------------------------------------------------------------------
// World templates: generated once per (seed, flat), then patched to enable the
// Beta APIs experiment (needed for @minecraft/server-gametest) and cheats.
// ---------------------------------------------------------------------------

export function patchLevelDat(file, { flat = false } = {}) {
  const d = readLevelDat(fs.readFileSync(file));
  const r = d.root;
  const byte = (v) => ({ type: T.BYTE, value: v });
  const exp = r.experiments?.value ?? {};
  exp.gametest = byte(1); // "Beta APIs"
  exp.experiments_ever_used = byte(1);
  exp.saved_with_toggled_experiments = byte(1);
  r.experiments = { type: T.COMPOUND, value: exp };
  r.cheatsEnabled = byte(1);
  r.commandsEnabled = byte(1);
  r.commandblockoutput = byte(0);
  r.LANBroadcast = byte(0);
  r.LANBroadcastIntent = byte(0);
  if (flat) r.Generator = { type: T.INT, value: 2 };
  fs.writeFileSync(file, writeLevelDat(d));
}

export async function ensureTemplate({ seed, flat, retainOnFailure = false, lockTimeoutMs = 30000, log = () => {} }) {
  const key = flat ? "flat" : `seed-${seed}`;
  const dest = path.join(cacheDir(), "worlds", `${BDS_VERSION}-${key}`);
  if (fs.existsSync(path.join(dest, "level.dat"))) return dest;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const lockFile = `${dest}.lock`;
  const lockToken = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + lockTimeoutMs;
  let ownsLock = false;
  while (!ownsLock) {
    if (fs.existsSync(path.join(dest, "level.dat"))) return dest;
    try {
      fs.writeFileSync(
        lockFile,
        JSON.stringify({ pid: process.pid, token: lockToken, key, at: new Date().toISOString() }),
        { flag: "wx" },
      );
      ownsLock = true;
      break;
    } catch (err) {
      if (err && err.code !== "EEXIST") throw err;
    }
    if (fs.existsSync(path.join(dest, "level.dat"))) return dest;
    try {
      const holder = JSON.parse(fs.readFileSync(lockFile, "utf8"));
      if (holder && holder.pid && !isPidAlive(holder.pid)) {
        fs.rmSync(lockFile, { force: true });
        continue;
      }
    } catch {}
    if (Date.now() >= deadline) {
      if (fs.existsSync(path.join(dest, "level.dat"))) return dest;
      throw new Error(`Timed out after ${lockTimeoutMs}ms waiting for world template lock: ${lockFile}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(200, Math.max(10, deadline - Date.now()))));
  }
  if (fs.existsSync(path.join(dest, "level.dat"))) {
    try {
      const cur = JSON.parse(fs.readFileSync(lockFile, "utf8"));
      if (cur.token === lockToken) fs.rmSync(lockFile, { force: true });
    } catch {}
    return dest;
  }
  log(`[harness] generating world template ${key} (once; cached in ${dest})`);
  let lastErr;
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dir = makeServerDir("bds-template-");
      const templateLogFile = path.join(dir, "template-server.log");
      let port;
      let keepFailedDir = false;
      try {
        port = await reservePortPair();
        writeProps(dir, baseProps(port, { "level-seed": flat ? "" : String(seed) }));
        let started = false, failed = "";
        const bds = startBds(dir, (line) => {
          try { fs.appendFileSync(templateLogFile, line + "\n"); } catch {}
          if (line.includes("Server started.")) started = true;
          if (/ERROR\].*(Exiting program|may be in use| occupied|bind)/i.test(line)) failed = line;
        });
        writeProcessIdentity(dir, { bdsPid: bds.proc.pid, port, portV6: port + 1, role: "template", key, attempt });
        const t0 = Date.now();
        while (!started && !failed && Date.now() - t0 < 120000 && bds.proc.exitCode === null) await new Promise((r) => setTimeout(r, 200));
        if (!started) {
          try { IS_WIN ? bds.proc.kill() : bds.proc.kill("SIGKILL"); } catch (e) { /* gone */ }
          await bds.exited;
          throw new Error(`template server did not start (attempt ${attempt}, port ${port}): ${failed}`);
        }
        await stopBds(bds);
        const world = path.join(dir, "worlds", "world");
        patchLevelDat(path.join(world, "level.dat"), { flat });
        fs.rmSync(path.join(world, "level.dat_old"), { force: true });
        if (flat) fs.rmSync(path.join(world, "db"), { recursive: true, force: true });
        const staging = `${dest}.tmp-${process.pid}`;
        fs.cpSync(world, staging, { recursive: true });
        try { fs.renameSync(staging, dest); } catch (e) { fs.rmSync(staging, { recursive: true, force: true }); if (!fs.existsSync(dest)) throw e; }
        return dest;
      } catch (e) {
        if (retainOnFailure && attempt === 3) {
          keepFailedDir = true;
          e.retainedTemplateDir = dir;
          e.templateLogFile = templateLogFile;
        }
        lastErr = e;
      } finally {
        if (port !== undefined) releasePortPair(port);
        if (!keepFailedDir) fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    throw lastErr;
  } finally {
    if (ownsLock) {
      try {
        const cur = JSON.parse(fs.readFileSync(lockFile, "utf8"));
        if (cur.token === lockToken) fs.rmSync(lockFile, { force: true });
      } catch {}
    }
  }
}
