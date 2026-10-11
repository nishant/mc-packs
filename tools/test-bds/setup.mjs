#!/usr/bin/env node
// Downloads and unpacks Bedrock Dedicated Server into BDS_DIR (default /home/user/bds) unless it
// is already there. run.mjs calls this automatically when BDS_DIR has no bedrock_server.
//   node setup.mjs [--force]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { bdsDir, BDS_VERSION } from "./lib/server.mjs";

export const BDS_URL = `https://www.minecraft.net/bedrockdedicatedserver/bin-linux/bedrock-server-${BDS_VERSION}.zip`;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status ?? r.error})`);
}

export function setup({ force = false } = {}) {
  const dir = bdsDir();
  if (!force && fs.existsSync(path.join(dir, "bedrock_server"))) {
    console.log(`[setup] BDS already at ${dir}`);
    return dir;
  }
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, "bds.zip");
  console.log(`[setup] downloading ${BDS_URL} -> ${zip}`);
  // curl honors HTTPS_PROXY; minecraft.net refuses requests without a browser-like user agent.
  run("curl", ["-fsSL", "--retry", "3", "-A", "Mozilla/5.0 (X11; Linux x86_64)", "-o", zip, BDS_URL]);
  console.log(`[setup] unpacking into ${dir}`);
  const unzip = spawnSync("unzip", ["-oq", zip, "-d", dir], { stdio: "inherit" });
  if (unzip.status !== 0) run("python3", ["-I", "-c", "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])", zip, dir]);
  fs.chmodSync(path.join(dir, "bedrock_server"), 0o755);
  console.log(`[setup] BDS ${BDS_VERSION} ready at ${dir} (keep it pristine: the harness only copies it)`);
  return dir;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("setup.mjs")) {
  try {
    setup({ force: process.argv.includes("--force") });
  } catch (e) {
    console.error(`[setup] ${e.message}`);
    process.exit(1);
  }
}
