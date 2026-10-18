// Finding packs and installing them (plus the harness shim and test pack) into a server copy.
import fs from "node:fs";
import path from "node:path";
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

function shimSource(folder, hasUi, relay) {
  const tpl = fs.readFileSync(path.join(HERE, "lib", "shim.js"), "utf8");
  return tpl
    .replace("__UI_IMPORT__", hasUi ? 'import * as ui from "@minecraft/server-ui";' : "const ui = undefined;")
    .replace("const PACK = __PACK__;", `const PACK = ${JSON.stringify(folder)};`)
    .replace("const HAS_UI = __HAS_UI__;", `const HAS_UI = ${hasUi ? "true" : "false"};`)
    .replace("const RELAY = __RELAY__;", `const RELAY = ${relay ? "true" : "false"};`);
}

function profileSource(folder) {
  return fs.readFileSync(path.join(HERE, "lib", "profile.js"), "utf8").replace("const PACK = __PACK__;", `const PACK = ${JSON.stringify(folder)};`);
}

/**
 * Copies a behavior pack and wraps its script entry with the shim (and, with `profile`, the
 * profiler, imported after the shim so the shim's own listeners are not timed). `relay: false`
 * stops the shim relaying messages (forms are still answered). Returns the world pack entry.
 */
export function installBehaviorPack(pack, serverDir, { shim = true, profile = false, relay = true } = {}) {
  const dest = path.join(serverDir, "development_behavior_packs", pack.folder);
  fs.cpSync(pack.dir, dest, { recursive: true });
  const manifest = JSON.parse(JSON.stringify(pack.manifest));
  const script = (manifest.modules || []).find((m) => m.type === "script");
  if ((shim || profile) && script && script.entry) {
    const deps = (manifest.dependencies ||= []);
    if (shim && !deps.some((d) => d.module_name === GAMETEST.module_name)) deps.push({ ...GAMETEST });
    const hasUi = deps.some((d) => d.module_name === "@minecraft/server-ui");
    const entryDir = path.posix.dirname(script.entry);
    const base = path.posix.basename(script.entry);
    let entry = "";
    if (shim) {
      fs.writeFileSync(path.join(dest, entryDir, "__harness_shim.js"), shimSource(pack.folder, hasUi, relay));
      entry += `import "./__harness_shim.js";\n`;
    }
    if (profile) {
      fs.writeFileSync(path.join(dest, entryDir, "__harness_profile.js"), profileSource(pack.folder));
      entry += `import "./__harness_profile.js";\n`;
    }
    fs.writeFileSync(path.join(dest, entryDir, "__harness_entry.js"), `${entry}import "./${base}";\n`);
    script.entry = path.posix.join(entryDir, "__harness_entry.js");
    fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2));
  }
  return { pack_id: manifest.header.uuid, version: manifest.header.version };
}

export function installResourcePack(pack, serverDir) {
  const dest = path.join(serverDir, "development_resource_packs", pack.folder);
  fs.cpSync(pack.dir, dest, { recursive: true });
  return { pack_id: pack.manifest.header.uuid, version: pack.manifest.header.version };
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
