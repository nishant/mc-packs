// Finding packs and installing them (plus the harness shim and test pack) into a server copy.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { HERE } from "./server.mjs";

const GAMETEST = { module_name: "@minecraft/server-gametest", version: "1.0.0-beta" };
export const HARNESS_PACK = {
  folder: "__bds_harness",
  name: "BDS Harness",
  uuid: "5b3a4f0e-6c1d-4e8a-9f27-0d4c2b1a7e01",
  moduleUuid: "5b3a4f0e-6c1d-4e8a-9f27-0d4c2b1a7e02",
};

export function readJson(file) {
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    // Bedrock tolerates comments in manifests.
    return JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""));
  }
}

/** Deterministic SHA-256 digest and per-file hash list for a pack directory. */
export function hashPackDir(dir) {
  const files = [];
  function walk(cur, relPrefix = "") {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) {
        const sha256 = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
        files.push({ path: rel, sha256 });
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  const combined = crypto.createHash("sha256");
  for (const f of files) combined.update(`${f.path}:${f.sha256}\n`);
  return { sha256: combined.digest("hex"), fileCount: files.length, files };
}

/** Queries git commit, branch and working tree status for the directory containing packsDir. */
export function gitSourceInfo(packsDir) {
  const cwd = fs.existsSync(packsDir) ? packsDir : HERE;
  const run = (args) => {
    const r = spawnSync("git", ["--no-pager", ...args], { cwd, encoding: "utf8" });
    return r.status === 0 ? r.stdout.trim() : "";
  };
  const gitCommit = run(["rev-parse", "HEAD"]) || "unknown";
  const gitBranch = run(["rev-parse", "--abbrev-ref", "HEAD"]) || "unknown";
  const statusOut = run(["status", "--porcelain"]);
  const dirtyFiles = statusOut ? statusOut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  return {
    commit: gitCommit,
    branch: gitBranch,
    dirty: dirtyFiles.length > 0,
    gitCommit,
    gitBranch,
    gitDirty: dirtyFiles.length > 0,
    dirtyFiles,
  };
}

/** Every folder in dir with a manifest.json, classified as behavior or resource pack. */
export function findPacks(dir, only) {
  const all = [];
  for (const folder of fs.readdirSync(dir).sort()) {
    const mf = path.join(dir, folder, "manifest.json");
    if (!fs.existsSync(mf)) continue;
    const manifest = readJson(mf);
    const types = (manifest.modules || []).map((m) => m.type);
    const kind = types.includes("resources") ? "rp" : "bp";
    all.push({ folder, dir: path.join(dir, folder), manifest, kind, name: manifest.header?.name ?? folder });
  }
  if (!only) {
    const named = all.filter((p) => /_(bp|rp)$/.test(p.folder));
    return named.length ? named : all;
  }
  const want = only.split(/[,\s]+/).filter(Boolean);
  const missing = want.filter((w) => !all.some((p) => p.folder === w));
  if (missing.length) throw new Error(`--only: no pack folder(s) ${missing.join(", ")} in ${dir}`);
  return all.filter((p) => want.includes(p.folder));
}

function shimSource(folder, hasUi) {
  const tpl = fs.readFileSync(path.join(HERE, "lib", "shim.js"), "utf8");
  return tpl
    .replace("__UI_IMPORT__", hasUi ? 'import * as ui from "@minecraft/server-ui";' : "const ui = undefined;")
    .replace("const PACK = __PACK__;", `const PACK = ${JSON.stringify(folder)};`)
    .replace("const HAS_UI = __HAS_UI__;", `const HAS_UI = ${hasUi ? "true" : "false"};`);
}

/** Copies a behavior pack and wraps its script entry with the shim. Returns world_behavior_packs entry. */
export function installBehaviorPack(pack, serverDir, { shim = true } = {}) {
  const dest = path.join(serverDir, "development_behavior_packs", pack.folder);
  fs.cpSync(pack.dir, dest, { recursive: true });
  const manifest = JSON.parse(JSON.stringify(pack.manifest));
  const script = (manifest.modules || []).find((m) => m.type === "script");
  let shimApplied = false;
  if (shim && script && script.entry) {
    const deps = (manifest.dependencies ||= []);
    if (!deps.some((d) => d.module_name === GAMETEST.module_name)) deps.push({ ...GAMETEST });
    const hasUi = deps.some((d) => d.module_name === "@minecraft/server-ui");
    const entryDir = path.posix.dirname(script.entry);
    const base = path.posix.basename(script.entry);
    fs.writeFileSync(path.join(dest, entryDir, "__harness_shim.js"), shimSource(pack.folder, hasUi));
    fs.writeFileSync(path.join(dest, entryDir, "__harness_entry.js"), `import "./__harness_shim.js";\nimport "./${base}";\n`);
    script.entry = path.posix.join(entryDir, "__harness_entry.js");
    fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2));
    shimApplied = true;
  }
  pack.stagedInfo = inspectStagedPack(pack, dest, shimApplied);
  return { pack_id: manifest.header.uuid, version: manifest.header.version };
}

export function installResourcePack(pack, serverDir) {
  const dest = path.join(serverDir, "development_resource_packs", pack.folder);
  fs.cpSync(pack.dir, dest, { recursive: true });
  pack.stagedInfo = inspectStagedPack(pack, dest, false);
  return { pack_id: pack.manifest.header.uuid, version: pack.manifest.header.version };
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function buildExpectedShimmedManifest(srcManifest) {
  const manifest = JSON.parse(JSON.stringify(srcManifest));
  const script = (manifest.modules || []).find((m) => m.type === "script");
  if (!script || !script.entry) return null;
  const deps = (manifest.dependencies ||= []);
  if (!deps.some((d) => d.module_name === GAMETEST.module_name)) deps.push({ ...GAMETEST });
  const hasUi = deps.some((d) => d.module_name === "@minecraft/server-ui");
  const entryDir = path.posix.dirname(script.entry);
  const base = path.posix.basename(script.entry);
  script.entry = path.posix.join(entryDir, "__harness_entry.js");
  return {
    manifestText: JSON.stringify(manifest, null, 2),
    shimPath: path.posix.join(entryDir, "__harness_shim.js"),
    entryPath: path.posix.join(entryDir, "__harness_entry.js"),
    hasUi,
    base,
  };
}

/** Verifies that every source file in pack.dir matches its staged copy in dest (including exact shimmed manifest & generated shim files). */
export function inspectStagedPack(pack, dest, shimApplied = false) {
  const srcHash = hashPackDir(pack.dir);
  const stagedHash = hashPackDir(dest);
  const stagedMap = new Map(stagedHash.files.map((f) => [f.path, f.sha256]));
  const expectedMap = new Map(srcHash.files.map((f) => [f.path, f.sha256]));

  if (shimApplied) {
    const srcManifestRaw = fs.readFileSync(path.join(pack.dir, "manifest.json"), "utf8");
    const expectedShim = buildExpectedShimmedManifest(JSON.parse(srcManifestRaw));
    if (!expectedShim) {
      throw new Error(`Pack ${pack.folder} marked shimApplied=true but has no script module entry`);
    }
    expectedMap.set("manifest.json", sha256Text(expectedShim.manifestText));
    expectedMap.set(expectedShim.shimPath, sha256Text(shimSource(pack.folder, expectedShim.hasUi)));
    expectedMap.set(expectedShim.entryPath, sha256Text(`import "./__harness_shim.js";\nimport "./${expectedShim.base}";\n`));
  }

  for (const [relPath, expectedSha] of expectedMap) {
    if (stagedMap.get(relPath) !== expectedSha) {
      throw new Error(`Staged file hash mismatch in ${pack.folder}/${relPath}: expected ${expectedSha}, got ${stagedMap.get(relPath) ?? "missing"}`);
    }
  }
  for (const f of stagedHash.files) {
    if (!expectedMap.has(f.path)) {
      throw new Error(`Unexpected extra file in staged pack ${pack.folder}/${f.path}`);
    }
  }

  const deps = (pack.manifest.dependencies || []).map((d) => ({
    module_name: d.module_name,
    uuid: d.uuid,
    version: d.version,
  }));
  return {
    folder: pack.folder,
    name: pack.name,
    kind: pack.kind,
    uuid: pack.manifest.header?.uuid,
    version: pack.manifest.header?.version,
    minEngineVersion: pack.manifest.header?.min_engine_version,
    dependencies: deps,
    shimApplied,
    verified: true,
    sourceSha256: srcHash.sha256,
    stagedSha256: stagedHash.sha256,
    fileCount: srcHash.fileCount,
    files: srcHash.files,
  };
}


/** Builds the harness test pack with the given scenario file. */
export function installHarnessPack(serverDir, scenarioFile) {
  const dest = path.join(serverDir, "development_behavior_packs", HARNESS_PACK.folder);
  fs.mkdirSync(path.join(dest, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(HERE, "testpack", "scripts", "harness.js"), path.join(dest, "scripts", "harness.js"));
  fs.copyFileSync(scenarioFile, path.join(dest, "scripts", "scenario.js"));
  const manifest = {
    format_version: 2,
    header: { name: HARNESS_PACK.name, description: "Runs a harness scenario with simulated players", uuid: HARNESS_PACK.uuid, version: [1, 0, 0], min_engine_version: [1, 21, 100] },
    modules: [{ type: "script", language: "javascript", uuid: HARNESS_PACK.moduleUuid, version: [1, 0, 0], entry: "scripts/harness.js" }],
    dependencies: [{ module_name: "@minecraft/server", version: "2.1.0" }, { ...GAMETEST }],
  };
  fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { pack_id: HARNESS_PACK.uuid, version: [1, 0, 0] };
}
