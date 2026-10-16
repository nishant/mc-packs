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

function tcpFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "0.0.0.0", () => s.close(() => resolve(true)));
  });
}
function udpFree(port) {
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    s.once("error", () => resolve(false));
    s.bind(port, "0.0.0.0", () => s.close(() => resolve(true)));
  });
}
export async function freePort() {
  for (let i = 0; i < 200; i++) {
    const p = 20000 + 2 * Math.floor(Math.random() * 19000);
    if ((await tcpFree(p)) && (await udpFree(p)) && (await tcpFree(p + 1)) && (await udpFree(p + 1))) return p;
  }
  throw new Error("no free port found");
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

export async function ensureTemplate({ seed, flat, log = () => {} }) {
  const key = flat ? "flat" : `seed-${seed}`;
  const dest = path.join(cacheDir(), "worlds", `${BDS_VERSION}-${key}`);
  if (fs.existsSync(path.join(dest, "level.dat"))) return dest;
  log(`[harness] generating world template ${key} (once; cached in ${dest})`);
  const dir = makeServerDir("bds-template-");
  try {
    const port = await freePort();
    writeProps(dir, baseProps(port, { "level-seed": flat ? "" : String(seed) }));
    let started = false, failed = "";
    const bds = startBds(dir, (line) => {
      if (line.includes("Server started.")) started = true;
      if (/ERROR\].*(Exiting program|may be in use)/.test(line)) failed = line;
    });
    const t0 = Date.now();
    while (!started && !failed && Date.now() - t0 < 120000 && bds.proc.exitCode === null) await new Promise((r) => setTimeout(r, 200));
    if (!started) {
      try { IS_WIN ? bds.proc.kill() : bds.proc.kill("SIGKILL"); } catch (e) { /* gone */ }
      await bds.exited;
      throw new Error(`template server did not start ${failed}`);
    }
    await stopBds(bds);
    const world = path.join(dir, "worlds", "world");
    patchLevelDat(path.join(world, "level.dat"), { flat });
    fs.rmSync(path.join(world, "level.dat_old"), { force: true });
    if (flat) fs.rmSync(path.join(world, "db"), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const staging = `${dest}.tmp-${process.pid}`;
    fs.cpSync(world, staging, { recursive: true });
    try { fs.renameSync(staging, dest); } catch (e) { fs.rmSync(staging, { recursive: true, force: true }); if (!fs.existsSync(dest)) throw e; }
    return dest;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
