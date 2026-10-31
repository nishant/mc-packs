// Fails when a pack's manifest.json is malformed or breaks a rule the Realm relies on: format_version 2, an ASCII
// name and description, a version and min_engine_version of three whole numbers, well-formed unique uuids, one
// resources module in a resource pack, one JavaScript script module (entry scripts/main.js, which must exist) in a
// behavior pack, only the stable script modules this repo targets (@minecraft/server 2.1.0, @minecraft/server-ui
// 2.0.0), and a server-ui dependency exactly when a script imports it. A mismatch is otherwise found only on the
// Realm (the pack silently fails to load) or by Bedrock's validator in game.
//
//   node tools/check-manifests.mjs    print ok, or one FAIL line per problem and exit 1
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SERVER = "@minecraft/server";
const SERVER_UI = "@minecraft/server-ui";
/** The script modules a pack may depend on, with the one version each is pinned to. */
export const MODULE_VERSIONS = { [SERVER]: "2.1.0", [SERVER_UI]: "2.0.0" };

/** @param {unknown} v */
const isVersion = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isInteger(n) && n >= 0);
/** @param {unknown} s */
const isAscii = (s) => typeof s === "string" && /^[\x20-\x7e]*$/.test(s);

/**
 * The problems with one pack's manifest (an empty list when it is fine).
 * @param {string} folder the pack folder, such as `town_bp`
 * @param {any} manifest the parsed manifest.json
 * @param {{ uuids: Map<string, string>, headerUuids: Set<string>, importsUi: boolean, entryExists: boolean }} ctx
 *   uuids: every uuid seen so far, with the folder that owns it (this call adds its own);
 *   headerUuids: every pack's header uuid, for uuid dependencies;
 *   importsUi: whether a file under the pack's scripts/ imports @minecraft/server-ui;
 *   entryExists: whether scripts/main.js exists in the pack
 * @returns {string[]}
 */
export function checkManifest(folder, manifest, ctx) {
  /** @type {string[]} */
  const problems = [];
  const bad = (/** @type {string} */ p) => problems.push(p);
  const isBp = folder.endsWith("_bp");
  const isRp = folder.endsWith("_rp");
  if (!isBp && !isRp) bad(`folder name must end in _bp or _rp`);
  if (!manifest || typeof manifest !== "object") return [...problems, "manifest is not an object"];
  if (manifest.format_version !== 2) bad(`format_version must be 2 (is ${JSON.stringify(manifest.format_version)})`);

  const header = manifest.header ?? {};
  for (const key of ["name", "description"]) {
    if (typeof header[key] !== "string" || !header[key].trim()) bad(`header.${key} must be a non-empty string`);
    else if (!isAscii(header[key])) bad(`header.${key} must be plain ASCII (Bedrock draws other characters in a smaller font)`);
  }
  if (!isVersion(header.version)) bad(`header.version must be 3 non-negative integers`);
  if (!isVersion(header.min_engine_version)) bad(`header.min_engine_version must be 3 non-negative integers`);

  /** @param {string} where @param {unknown} uuid */
  const claim = (where, uuid) => {
    if (typeof uuid !== "string" || !UUID.test(uuid)) return bad(`${where} uuid ${JSON.stringify(uuid)} is not a well-formed uuid`);
    const key = uuid.toLowerCase();
    const owner = ctx.uuids.get(key);
    if (owner) bad(`${where} uuid ${uuid} is already used by ${owner}`);
    else ctx.uuids.set(key, `${folder} (${where})`);
  };
  claim("header", header.uuid);

  const modules = Array.isArray(manifest.modules) ? manifest.modules : [];
  if (!modules.length) bad(`modules must list at least one module`);
  modules.forEach((/** @type {any} */ m, /** @type {number} */ i) => {
    claim(`modules[${i}]`, m?.uuid);
    if (!isVersion(m?.version)) bad(`modules[${i}].version must be 3 non-negative integers`);
  });
  const ofType = (/** @type {string} */ type) => modules.filter((/** @type {any} */ m) => m?.type === type);

  if (isRp) {
    if (modules.length !== 1 || ofType("resources").length !== 1) bad(`a resource pack needs exactly one module, of type "resources"`);
  }
  if (isBp) {
    if (ofType("resources").length) bad(`a behavior pack must not have a "resources" module`);
    const scripts = ofType("script");
    if (scripts.length !== 1) bad(`a behavior pack needs exactly one "script" module (has ${scripts.length})`);
    for (const m of modules) if (m?.type !== "script" && m?.type !== "data") bad(`module type ${JSON.stringify(m?.type)} is not allowed in a behavior pack (only "script" and "data")`);
    const script = scripts[0];
    if (script) {
      if (script.language !== "javascript") bad(`the script module's language must be "javascript" (is ${JSON.stringify(script.language)})`);
      if (script.entry !== "scripts/main.js") bad(`the script module's entry must be "scripts/main.js" (is ${JSON.stringify(script.entry)})`);
      else if (!ctx.entryExists) bad(`the script module's entry scripts/main.js does not exist`);
    }
  }

  const deps = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
  /** @type {Set<string>} */
  const names = new Set();
  for (const d of deps) {
    if (d && typeof d === "object" && "module_name" in d) {
      const want = /** @type {Record<string, string>} */ (MODULE_VERSIONS)[d.module_name];
      if (!want) bad(`dependency ${JSON.stringify(d.module_name)} is not one of ${Object.keys(MODULE_VERSIONS).join(", ")}`);
      else if (d.version !== want) bad(`dependency ${d.module_name} must be version ${want} (is ${JSON.stringify(d.version)})`);
      names.add(d.module_name);
    } else if (d && typeof d === "object" && "uuid" in d) {
      if (!ctx.headerUuids.has(String(d.uuid).toLowerCase())) bad(`dependency uuid ${d.uuid} is not the header uuid of any pack here`);
      if (!isVersion(d.version)) bad(`dependency uuid ${d.uuid} needs a version of 3 non-negative integers`);
    } else {
      bad(`dependency ${JSON.stringify(d)} needs a module_name or a uuid`);
    }
  }
  if (isBp) {
    if (!names.has(SERVER)) bad(`a behavior pack must depend on ${SERVER}`);
    if (ctx.importsUi && !names.has(SERVER_UI)) bad(`a script imports ${SERVER_UI} but the manifest doesn't depend on it`);
    if (!ctx.importsUi && names.has(SERVER_UI)) bad(`the manifest depends on ${SERVER_UI} but no script imports it`);
  }
  return problems;
}

/** @param {string} dir @returns {string[]} */
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** Whether any .js file under dir imports the module (`from "x"`, `import "x"` or `import("x")`). */
function importsModule(/** @type {string} */ dir, /** @type {string} */ name) {
  const re = new RegExp(`(?:from|import)\\s*\\(?\\s*["']${name.replace(/[/@]/g, "\\$&")}["']`);
  return walk(dir).some((f) => f.endsWith(".js") && re.test(readFileSync(f, "utf8")));
}

function main() {
  const packsDir = join(root, "packs");
  const folders = readdirSync(packsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  /** @type {Map<string, any>} */
  const manifests = new Map();
  /** @type {string[]} */
  const problems = [];
  for (const folder of folders) {
    const file = join(packsDir, folder, "manifest.json");
    if (!existsSync(file)) {
      problems.push(`FAIL ${folder}: no manifest.json`);
      continue;
    }
    try {
      manifests.set(folder, JSON.parse(readFileSync(file, "utf8")));
    } catch (e) {
      problems.push(`FAIL ${folder}: manifest.json doesn't parse (${/** @type {Error} */ (e).message})`);
    }
  }
  const headerUuids = new Set([...manifests.values()].map((m) => String(m?.header?.uuid).toLowerCase()));
  const uuids = new Map();
  for (const [folder, manifest] of manifests) {
    const scripts = join(packsDir, folder, "scripts");
    const ctx = {
      uuids,
      headerUuids,
      importsUi: existsSync(scripts) && importsModule(scripts, SERVER_UI),
      entryExists: existsSync(join(scripts, "main.js")),
    };
    for (const p of checkManifest(folder, manifest, ctx)) problems.push(`FAIL ${folder}: ${p}`);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`ok   ${manifests.size} manifests`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
