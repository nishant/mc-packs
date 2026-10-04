// Merges several behavior packs from packs/ into one .mcpack.
//
//   node tools/bundle.mjs --list [--json]            show available packs
//   node tools/bundle.mjs --all [--name realm_bundle]
//   node tools/bundle.mjs --packs welcome_bp,stats_bp [--name realm_bundle] [--title "Realm Bundle"]
//
// How the merge works:
//   - each pack's scripts/ folder is copied to scripts/<pack>/, and a generated
//     scripts/main.js imports every pack's entry point
//   - any other files (recipes, entities, …) are copied as-is; two packs
//     shipping the same path with different contents is an error
//   - @minecraft/* dependencies are merged to the highest version (same major)
//   - the bundle's UUIDs are derived from --name, so rebuilding with a different
//     selection updates the same pack on the Realm instead of adding a new one
//   - the version is the build time (UTC) [YYYY, MMDD, HHMM] so it always increases
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { walk, zip } from "./lib/zip.mjs";
import { namespaceOf, registeredNames } from "./lib/commands.mjs";

const root = join(import.meta.dirname, "..");
const packsDir = join(root, "packs");
const distDir = join(root, "dist");

const { values: args } = parseArgs({
  options: {
    list: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    all: { type: "boolean", default: false },
    packs: { type: "string" },
    name: { type: "string", default: "realm_bundle" },
    title: { type: "string" },
  },
});

/** @typedef {{ folder: string, dir: string, manifest: any, name: string, description: string, version: string, kind: "behavior" | "resource" }} Pack */

/** @returns {Pack[]} */
function loadPacks() {
  return readdirSync(packsDir)
    .filter((f) => existsSync(join(packsDir, f, "manifest.json")))
    .sort()
    .map((folder) => {
      const dir = join(packsDir, folder);
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      const isResource = manifest.modules.some((/** @type {any} */ m) => m.type === "resources");
      return {
        folder,
        dir,
        manifest,
        name: manifest.header.name,
        description: manifest.header.description,
        version: manifest.header.version.join("."),
        kind: isResource ? "resource" : "behavior",
      };
    });
}

function fail(/** @type {string} */ msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

/** Deterministic RFC 4122 v5-style UUID from a string. */
function uuidFrom(/** @type {string} */ seed) {
  const h = createHash("sha1").update(`mc-packs:${seed}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** @param {string} a @param {string} b @returns {number} */
function compareVersions(a, b) {
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** @param {number[]} a @param {number[]} b */
const maxEngine = (a, b) => (compareVersions(a.join("."), b.join(".")) >= 0 ? a : b);

const packs = loadPacks();

if (args.list) {
  if (args.json) {
    console.log(JSON.stringify(packs.map(({ folder, name, description, version, kind }) => ({ folder, name, description, version, kind })), null, 2));
  } else {
    for (const p of packs) console.log(`${p.folder.padEnd(16)} ${p.kind.padEnd(9)} v${p.version.padEnd(7)} ${p.name} — ${p.description}`);
  }
  process.exit(0);
}

if (!args.all && !args.packs) fail("pass --all, --packs a,b,c, or --list");

/** @type {Pack[]} */
let selected;
if (args.all) {
  selected = packs.filter((p) => p.kind === "behavior");
} else {
  const wanted = [...new Set(/** @type {string} */ (args.packs).split(",").map((s) => s.trim()).filter(Boolean))];
  selected = wanted.map((w) => packs.find((p) => p.folder === w) ?? fail(`unknown pack "${w}". Run with --list.`));
}
if (selected.length === 0) fail("no packs selected");
const resource = selected.filter((p) => p.kind !== "behavior");
if (resource.length) fail(`resource packs can't be bundled yet: ${resource.map((p) => p.folder).join(", ")}`);
if (!/^[a-z0-9_-]+$/.test(/** @type {string} */ (args.name))) fail("--name may only contain a-z, 0-9, _ and -");

// A bundle is one add-on, and Bedrock allows one command namespace per add-on:
// a second namespace throws NamespaceMismatch and those commands never register.
/** @type {Map<string, string[]>} namespace → "pack: name" */
const namespaces = new Map();
for (const p of selected) {
  const { commands, enums } = registeredNames(p.dir);
  for (const name of [...commands, ...enums]) {
    const ns = namespaceOf(name);
    namespaces.set(ns, [...(namespaces.get(ns) ?? []), `${p.folder}: ${name}`]);
  }
}
if (namespaces.size > 1) {
  fail(
    `packs use different command namespaces, so only one would work in a bundle:\n` +
      [...namespaces].map(([ns, names]) => `  ${ns}:  ${names.join(", ")}`).join("\n")
  );
}

// ---------------------------------------------------------------------------

/** @type {Map<string, { data: Buffer, from: string }>} */
const files = new Map();
/** @type {Map<string, string>} module_name → version */
const moduleDeps = new Map();
/** @type {Map<string, any>} uuid → dependency */
const uuidDeps = new Map();
const memberUuids = new Set(selected.map((p) => p.manifest.header.uuid));
let minEngine = [1, 0, 0];
let hasData = false;
const imports = [];

for (const pack of selected) {
  const { manifest, folder, dir } = pack;
  minEngine = maxEngine(minEngine, manifest.header.min_engine_version ?? [1, 0, 0]);

  for (const mod of manifest.modules) {
    if (mod.type === "data") hasData = true;
    else if (mod.type === "script") {
      if (!mod.entry.startsWith("scripts/")) fail(`${folder}: script entry must be under scripts/ (got ${mod.entry})`);
      imports.push(`import "./${folder}/${mod.entry.slice("scripts/".length)}";`);
    } else fail(`${folder}: unsupported module type "${mod.type}"`);
  }

  for (const dep of manifest.dependencies ?? []) {
    if (dep.module_name) {
      const prev = moduleDeps.get(dep.module_name);
      if (prev && prev.split(".")[0] !== dep.version.split(".")[0]) {
        fail(`${dep.module_name}: packs need different major versions (${prev} vs ${dep.version})`);
      }
      if (!prev || compareVersions(dep.version, prev) > 0) moduleDeps.set(dep.module_name, dep.version);
    } else if (dep.uuid && !memberUuids.has(dep.uuid)) {
      uuidDeps.set(dep.uuid, dep);
    }
  }

  for (const abs of walk(dir)) {
    const rel = relative(dir, abs).split(sep).join("/");
    if (rel === "manifest.json" || rel === "pack_icon.png") continue;
    const out = rel.startsWith("scripts/") ? `scripts/${folder}/${rel.slice("scripts/".length)}` : rel;
    const data = readFileSync(abs);
    const existing = files.get(out);
    if (existing && !existing.data.equals(data)) fail(`${out} exists in both ${existing.from} and ${folder}`);
    files.set(out, { data, from: folder });
  }
}

if (files.has("scripts/main.js")) fail("a pack already has scripts/main.js at the bundle root");
files.set("scripts/main.js", {
  data: Buffer.from(`// Generated by tools/bundle.mjs — do not edit.\n${imports.join("\n")}\n`),
  from: "bundle",
});

const now = new Date();
const version = [
  now.getUTCFullYear(),
  (now.getUTCMonth() + 1) * 100 + now.getUTCDate(),
  now.getUTCHours() * 100 + now.getUTCMinutes(),
];

const manifest = {
  format_version: 2,
  header: {
    name: args.title ?? "Realm Bundle",
    description: `Bundle of: ${selected.map((p) => p.name).join(", ")}`,
    uuid: uuidFrom(`${args.name}:header`),
    version,
    min_engine_version: minEngine,
  },
  modules: [
    ...(hasData ? [{ type: "data", uuid: uuidFrom(`${args.name}:data`), version: [1, 0, 0] }] : []),
    ...(imports.length
      ? [{ type: "script", language: "javascript", uuid: uuidFrom(`${args.name}:script`), version: [1, 0, 0], entry: "scripts/main.js" }]
      : []),
  ],
  dependencies: [
    ...[...moduleDeps].map(([module_name, v]) => ({ module_name, version: v })),
    ...uuidDeps.values(),
  ],
};
files.set("manifest.json", { data: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"), from: "bundle" });

mkdirSync(distDir, { recursive: true });
const out = join(distDir, `${args.name}.mcpack`);
writeFileSync(out, zip([...files].map(([name, { data }]) => ({ name, data }))));

console.log(`${relative(root, out)}  v${version.join(".")}  (${files.size} files)`);
for (const p of selected) console.log(`  + ${p.folder.padEnd(16)} v${p.version.padEnd(7)} ${p.name}`);
console.log(`  deps: ${[...moduleDeps].map(([m, v]) => `${m}@${v}`).join(", ") || "none"}`);
