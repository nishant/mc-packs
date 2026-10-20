// One owning-addon test adapter, not native second-input or client acceptance.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  keep: { type: "boolean", default: false },
  log: { type: "string" },
  port: { type: "string" },
} });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const cache = process.env.BDS_HARNESS_CACHE || os.tmpdir();
fs.mkdirSync(cache, { recursive: true });
const temp = fs.mkdtempSync(path.join(cache, "build-bed-packs-"));
try {
  for (const pack of ["build_bp", "build_rp"])
    fs.cpSync(path.join(root, "packs", pack), path.join(temp, pack), { recursive: true });
  fs.appendFileSync(path.join(temp, "build_bp", "scripts", "main.js"),
    fs.readFileSync(path.join(root, "tools", "test-bds", "hooks", "build-bed-pipeline.js")));
  const result = spawnSync(process.execPath, [
    path.join(root, "tools", "test-bds", "run.mjs"), "--quiet", "--strict", "--flat",
    "--packs", temp, "--only", "build_bp,build_rp", "--timeout", "300",
    "--scenario", path.join(root, "tools", "test-bds", "examples", "build-beds.js"),
    ...(values.port ? ["--prop", `server-port=${Number(values.port)}`, "--prop", `server-portv6=${Number(values.port) + 1}`] : []),
    ...(values.keep ? ["--keep"] : []),
    ...(values.log ? ["--log", path.resolve(values.log)] : []),
  ], { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (values.keep) console.log(`test pack folder kept: ${temp}`);
  else fs.rmSync(temp, { recursive: true, force: true });
}
