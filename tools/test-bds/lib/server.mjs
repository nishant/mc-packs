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
/** The OS has the port (and the one above it, the IPv6 port) free for TCP and UDP. */
export async function portPairFree(p) {
  return (await tcpFree(p)) && (await udpFree(p)) && (await tcpFree(p + 1)) && (await udpFree(p + 1));
}
/** Whether a process with this id exists (signal 0 sends nothing). EPERM means it exists but is not ours. */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; }
}

const PORT_LOCK_STALE_MS = 12 * 3600 * 1000;
function portsDir() { return path.join(cacheDir(), "ports"); }

/** Takes a lock file with O_EXCL; a lock whose owner is gone (or very old) is replaced. Returns false when it is held. */
function takeLockFile(file, info, staleMs) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify(info), { flag: "wx" });
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let held;
      try { held = JSON.parse(fs.readFileSync(file, "utf8")); } catch { held = null; }
      const st = fs.statSync(file, { throwIfNoEntry: false });
      if (!st) continue; // released between our attempt and the look: try again
      const age = Date.now() - st.mtimeMs;
      const stale = held ? !pidAlive(held.pid) || age > staleMs : age > 5000;
      if (!stale) return false;
      fs.rmSync(file, { force: true });
    }
  }
  return false;
}

/**
 * Picks a TCP/UDP port pair (port, port + 1) that the OS has free and no other harness process has reserved: the
 * reservation is a lock file in the cache that names this process, so two runs that look at the same moment cannot
 * both take it. release() frees it. A reservation of a dead process is reused.
 */
export async function reservePort({ token = `${process.pid}`, isFree = portPairFree, random = Math.random, tries = 400, fixed = null } = {}) {
  fs.mkdirSync(portsDir(), { recursive: true });
  if (fixed !== null && !(Number.isInteger(fixed) && fixed >= 1024 && fixed <= 65534)) throw new Error(`server-port ${fixed} must be an integer from 1024 to 65534 (the next port is also used)`);
  let p = fixed ?? 20000 + 2 * Math.floor(random() * 19000);
  for (let i = 0; i < (fixed === null ? tries : 1); i++, p = p + 2 > 39998 ? 20000 : p + 2) {
    const a = path.join(portsDir(), `${p}.lock`), b = path.join(portsDir(), `${p + 1}.lock`);
    const info = { pid: process.pid, token, at: new Date().toISOString() };
    if (!takeLockFile(a, info, PORT_LOCK_STALE_MS)) continue;
    if (!takeLockFile(b, info, PORT_LOCK_STALE_MS)) { fs.rmSync(a, { force: true }); continue; }
    if (await isFree(p)) return { port: p, release: () => { fs.rmSync(a, { force: true }); fs.rmSync(b, { force: true }); } };
    fs.rmSync(a, { force: true });
    fs.rmSync(b, { force: true });
  }
  throw new Error(fixed === null ? "no free port found" : `port ${fixed} (and ${fixed + 1}) is in use or reserved by another harness run`);
}
export async function freePort() {
  const r = await reservePort();
  r.release();
  return r.port;
}

/** server.owner.json in a run's server folder: which harness process started which bedrock_server. */
export function recordOwner(dir, info) {
  fs.writeFileSync(path.join(dir, "server.owner.json"), JSON.stringify({ harnessPid: process.pid, startedAt: new Date().toISOString(), ...info }, null, 2));
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
  return { proc, send, exited, pid: proc.pid };
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
  if (flat) {
    r.Generator = { type: T.INT, value: 2 };
    setSpawn(r, FLAT_SPAWN);
  }
  fs.writeFileSync(file, writeLevelDat(d));
}

/** Flat worlds get a random world spawn (261,5 on one cache, 0,0 on another); scenarios that need 0,0 want it fixed. */
export const FLAT_SPAWN = { x: 0, y: -60, z: 0 };
function setSpawn(root, spawn) {
  root.SpawnX = { type: T.INT, value: spawn.x };
  root.SpawnY = { type: T.INT, value: spawn.y };
  root.SpawnZ = { type: T.INT, value: spawn.z };
}
export function readSpawn(file) {
  const r = readLevelDat(fs.readFileSync(file)).root;
  return r.SpawnX && r.SpawnY && r.SpawnZ ? { x: r.SpawnX.value, y: r.SpawnY.value, z: r.SpawnZ.value } : null;
}
/** Writes the world spawn into a level.dat. */
export function pinSpawn(file, spawn = FLAT_SPAWN) {
  const d = readLevelDat(fs.readFileSync(file));
  setSpawn(d.root, spawn);
  fs.writeFileSync(file, writeLevelDat(d));
}

export const TEMPLATE_SCHEMA = 2;
const MARKER = "template.ready.json";
export const templateKey = ({ seed, flat }) => (flat ? "flat" : `seed-${seed}`);
export const templatePath = (key) => path.join(cacheDir(), "worlds", `${BDS_VERSION}-${key}`);

function readMarker(dest) {
  try { return JSON.parse(fs.readFileSync(path.join(dest, MARKER), "utf8")); } catch { return null; }
}
function writeMarker(dir, info) {
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify({ schema: TEMPLATE_SCHEMA, bds: BDS_VERSION, createdAt: new Date().toISOString(), ...info }, null, 2));
}

/** A template is only used when its ready marker says it was finished, and (flat) its spawn is the pinned one. */
export function isTemplateReady(dest, { flat = false } = {}) {
  const m = readMarker(dest);
  if (!m || m.schema !== TEMPLATE_SCHEMA || m.bds !== BDS_VERSION) return false;
  const level = path.join(dest, "level.dat");
  if (!fs.existsSync(level)) return false;
  if (flat) {
    try {
      const s = readSpawn(level);
      return !!s && s.x === FLAT_SPAWN.x && s.y === FLAT_SPAWN.y && s.z === FLAT_SPAWN.z;
    } catch { return false; }
  }
  return true;
}

/** Copies a ready template into a run's world folder (not its ready marker) and pins a flat world's spawn there too. */
export function copyTemplate(template, world, { flat = false } = {}) {
  fs.cpSync(template, world, { recursive: true, filter: (src) => path.basename(src) !== MARKER });
  if (flat) {
    pinSpawn(path.join(world, "level.dat"), FLAT_SPAWN);
    const s = readSpawn(path.join(world, "level.dat"));
    if (!s || s.x !== FLAT_SPAWN.x || s.z !== FLAT_SPAWN.z) throw new Error(`could not pin the flat world spawn (read back ${JSON.stringify(s)})`);
  }
}

/** A template folder from before the ready marker existed: finished (it was published by one rename), so keep it. */
function adoptLegacyTemplate(dest, { flat, key }) {
  const level = path.join(dest, "level.dat");
  if (!fs.existsSync(level)) return false;
  try { readLevelDat(fs.readFileSync(level)); } catch { return false; }
  if (!flat && !fs.existsSync(path.join(dest, "db", "CURRENT"))) return false;
  if (flat) pinSpawn(level, FLAT_SPAWN);
  writeMarker(dest, { key, flat, adoptedLegacy: true, ...(flat ? { spawn: FLAT_SPAWN } : {}) });
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function removeDir(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

/**
 * The template generator that crashed (or was killed) left its lock behind: remove it, its staging folder and its
 * temp server folder, but never a process (a bedrock_server it started is only reported: stop it by its pid).
 */
function reapStaleLock(lock, dest, { staleLockMs, log }) {
  let owner = null;
  try { owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8")); } catch { owner = null; }
  const st = fs.statSync(lock, { throwIfNoEntry: false });
  if (!st) return true; // released while we looked
  const age = Date.now() - st.mtimeMs;
  if (owner ? pidAlive(owner.pid) : age < staleLockMs) return false;
  log(`[harness] removing the stale template lock ${lock} (${owner ? `owner pid ${owner.pid} is gone` : "no owner record"})`);
  if (owner?.staging && owner.staging.startsWith(`${dest}.tmp-`)) removeDir(owner.staging);
  if (owner?.serverDir && path.resolve(path.dirname(owner.serverDir)) === tmpRoot() && path.basename(owner.serverDir).startsWith("bds-template-")) removeDir(owner.serverDir);
  if (owner?.bdsPid && pidAlive(owner.bdsPid)) log(`[harness] warning: template bedrock_server pid ${owner.bdsPid} from the dead owner may still be running; stop that pid yourself (nothing is stopped by name)`);
  removeDir(lock);
  return true;
}

/** Generates a world with a throwaway BDS and copies the finished, patched world into staging. */
async function generateTemplateWorld({ seed, flat, staging, log, onProgress }) {
  const dir = makeServerDir("bds-template-");
  onProgress({ serverDir: dir });
  const reservation = await reservePort();
  try {
    const port = reservation.port;
    writeProps(dir, baseProps(port, { "level-seed": flat ? "" : String(seed) }));
    let started = false, failed = "";
    const bds = startBds(dir, (line) => {
      if (line.includes("Server started.")) started = true;
      if (/ERROR\].*(Exiting program|may be in use)/.test(line)) failed = line;
    });
    onProgress({ bdsPid: bds.proc.pid, port });
    recordOwner(dir, { role: "template", bdsPid: bds.proc.pid, port });
    const t0 = Date.now();
    while (!started && !failed && Date.now() - t0 < 120000 && bds.proc.exitCode === null) await sleep(200);
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
    fs.cpSync(world, staging, { recursive: true });
  } finally {
    reservation.release();
    removeDir(dir);
  }
}

/**
 * Returns the cached world template for (seed, flat), generating it when needed. One process generates at a time
 * (an exclusive lock folder with an owner record); the others wait and use its result. The finished template is built
 * in a staging folder, marked ready, and published with one rename, so a half-built template is never consumed. A
 * lock left by a crashed owner is cleaned up (its staging folder and temp server folder too).
 * `generate({ staging, seed, flat, log, onProgress })` fills the staging folder; tests pass their own.
 */
export async function ensureTemplate({ seed, flat, log = () => {}, generate = generateTemplateWorld, lockTimeoutMs = 20 * 60 * 1000, pollMs = 200, staleLockMs = 30000, token = `${process.pid}-${Date.now().toString(36)}` }) {
  const key = templateKey({ seed, flat });
  const dest = templatePath(key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const lock = `${dest}.lock`;
  const deadline = Date.now() + lockTimeoutMs;
  for (;;) {
    if (isTemplateReady(dest, { flat })) return dest;
    try {
      fs.mkdirSync(lock);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (reapStaleLock(lock, dest, { staleLockMs, log })) continue;
      if (Date.now() > deadline) throw new Error(`timed out after ${Math.round(lockTimeoutMs / 1000)} s waiting for the template lock ${lock} (owner record: ${path.join(lock, "owner.json")})`);
      await sleep(pollMs);
      continue;
    }
    const staging = `${dest}.tmp-${token}`;
    const owner = { pid: process.pid, token, key, startedAt: new Date().toISOString(), staging };
    const save = () => fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify(owner));
    try {
      save();
      if (isTemplateReady(dest, { flat })) return dest;
      if (fs.existsSync(dest)) {
        if (adoptLegacyTemplate(dest, { flat, key })) { log(`[harness] adopted the existing world template ${key} (${dest})`); return dest; }
        log(`[harness] removing an unfinished or unusable world template folder ${dest}`);
        removeDir(dest);
      }
      removeDir(staging);
      log(`[harness] generating world template ${key} (once; cached in ${dest})`);
      await generate({ staging, seed, flat, log, onProgress: (info) => { Object.assign(owner, info); save(); } });
      if (!fs.existsSync(path.join(staging, "level.dat"))) throw new Error(`the template generator left no level.dat in ${staging}`);
      if (flat) pinSpawn(path.join(staging, "level.dat"), FLAT_SPAWN);
      writeMarker(staging, { key, flat, ownerPid: process.pid, token, ...(flat ? { spawn: FLAT_SPAWN } : {}) });
      fs.renameSync(staging, dest);
      return dest;
    } finally {
      removeDir(staging);
      removeDir(lock);
    }
  }
}
