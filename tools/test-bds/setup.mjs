#!/usr/bin/env node
// Downloads and unpacks the native Bedrock Dedicated Server into BDS_DIR unless it
// is already there. run.mjs calls this automatically when BDS_DIR has no server binary.
//   node setup.mjs [--force]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bdsDir, BDS_VERSION, BDS_BIN, IS_WIN } from "./lib/server.mjs";

export const BDS_URL = `https://www.minecraft.net/bedrockdedicatedserver/bin-${IS_WIN ? "win" : "linux"}/bedrock-server-${BDS_VERSION}.zip`;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status ?? r.error})`);
}

export function setup({ force = false } = {}) {
  const dir = bdsDir();
  const binary = path.join(dir, BDS_BIN);
  if (!force && fs.existsSync(binary)) {
    console.log(`[setup] BDS already at ${dir}`);
    return dir;
  }
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, "bds.zip");
  try {
    console.log(`[setup] downloading ${BDS_URL} -> ${zip}`);
    // curl honors HTTPS_PROXY; minecraft.net requires a browser-like user agent.
    run(IS_WIN ? "curl.exe" : "curl", ["-fsSL", "--retry", "3", "-A", "Mozilla/5.0", "-o", zip, BDS_URL]);
    console.log(`[setup] unpacking into ${dir}`);
    if (IS_WIN) {
      const tar = spawnSync("tar.exe", ["-xf", zip, "-C", dir], { stdio: "inherit" });
      if (tar.status !== 0) {
        const quote = (s) => `'${s.replace(/'/g, "''")}'`;
        run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(dir)} -Force`]);
      }
    } else {
      const unzip = spawnSync("unzip", ["-oq", zip, "-d", dir], { stdio: "inherit" });
      if (unzip.status !== 0) run("python3", ["-I", "-c", "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zip, dir]);
    }
    if (!fs.existsSync(binary)) throw new Error(`Archive did not contain ${BDS_BIN}: ${BDS_URL}`);
    if (!IS_WIN) fs.chmodSync(binary, 0o755);
  } finally {
    fs.rmSync(zip, { force: true });
  }
  console.log(`[setup] BDS ${BDS_VERSION} ready at ${dir} (keep it pristine: the harness only copies it)`);
  return dir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    setup({ force: process.argv.includes("--force") });
  } catch (e) {
    console.error(`[setup] ${e.message}`);
    process.exit(1);
  }
}
