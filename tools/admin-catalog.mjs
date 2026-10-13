// Writes packs/admin_bp/scripts/catalog.js, the list of every realm: command that the Realm Configuration
// menu (admin_bp) can run: name, description, permission level, parameters (type, enum values, optional)
// and the pack it comes from. It is generated, so the menu can't miss a command.
//
// How: each behavior pack's scripts/main.js is loaded in Node with a stand-in for @minecraft/server and
// @minecraft/server-ui, and its system.beforeEvents.startup handlers are called with a recording command
// registry. That gives exactly what the game registers, enum values computed from config.js included.
// The names are then cross-checked with a plain text scan of the source (tools/lib/commands.mjs).
//
//   node tools/admin-catalog.mjs           write the catalog
//   node tools/admin-catalog.mjs --check   fail if the catalog is out of date (a command was added or changed)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire, register } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { registeredNames } from "./lib/commands.mjs";

const root = join(import.meta.dirname, "..");
const SELF = "admin_bp";
/** admin_bp's own menu command: the menu doesn't list itself. */
const SKIP = new Set(["realm:admin"]);
/**
 * Enums whose values come from another generated file: /realm:help's topics follow the help catalog,
 * which is rebuilt whenever any docs change. The menu asks for these in a text box instead, so this
 * catalog doesn't go stale with every docs edit.
 */
const FREE_TEXT = new Set(["realm:help_topic"]);
const out = join(root, "packs", SELF, "scripts", "catalog.js");
const check = process.argv.includes("--check");

// ---------------------------------------------------------------------------
// A stand-in for the Minecraft script modules
// ---------------------------------------------------------------------------

const require = createRequire(join(root, "package.json"));

/** Every runtime export of a module's typings, with real values for its enums. @param {string} mod */
function moduleShape(mod) {
  const dts = readFileSync(join(dirname(require.resolve(`${mod}/package.json`)), "index.d.ts"), "utf8");
  /** @type {Record<string, Record<string, string | number>>} */
  const enums = {};
  for (const m of dts.matchAll(/^export (?:declare )?enum (\w+) \{([\s\S]*?)^\}/gm)) {
    /** @type {Record<string, string | number>} */
    const values = {};
    for (const v of m[2].matchAll(/^\s+(\w+) = ('([^']*)'|-?\d+),?$/gm)) values[v[1]] = v[3] ?? Number(v[2]);
    enums[m[1]] = values;
  }
  const names = [...new Set([...dts.matchAll(/^export (?:declare )?(?:abstract )?(?:class|enum|const|function) (\w+)/gm)].map((m) => m[1]))];
  return { names, enums };
}

const SHAPES = { "@minecraft/server": moduleShape("@minecraft/server"), "@minecraft/server-ui": moduleShape("@minecraft/server-ui") };

/** Anything at all: every property, call and `new` gives another one. Nothing a pack does at load time fails. */
function anything() {
  const fn = function () {};
  return new Proxy(fn, {
    get(target, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* () {};
      if (key === "then") return undefined; // not a promise
      if (key === "prototype") return target.prototype;
      if (key === "length") return 0;
      return anything();
    },
    apply: () => anything(),
    construct: () => anything(),
  });
}

/** `base`, but with some properties replaced. @param {any} base @param {Record<string | symbol, any>} over */
const withProps = (base, over) => new Proxy(base, { get: (t, k) => (k in over ? over[k] : t[k]) });

/** @type {((ev: any) => void)[]} startup handlers of the pack being loaded */
let startups = [];

/** @param {string} mod */
function stub(mod) {
  const shape = SHAPES[/** @type {keyof typeof SHAPES} */ (mod)];
  /** @type {Record<string, any>} */
  const exports = {};
  for (const name of shape.names) exports[name] = shape.enums[name] ? Object.freeze({ ...shape.enums[name] }) : anything();
  if (mod === "@minecraft/server") {
    const startup = withProps(anything(), { subscribe: (/** @type {any} */ cb) => (startups.push(cb), cb), unsubscribe: () => {} });
    exports.system = withProps(anything(), { beforeEvents: withProps(anything(), { startup }) });
  }
  return exports;
}
/** @type {any} */ (globalThis).__adminCatalogStub = stub;

const hooks = `
const NAMES = ${JSON.stringify(Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.names])))};
export async function resolve(specifier, context, next) {
  if (specifier in NAMES) return { url: "mcstub:" + specifier, shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (!url.startsWith("mcstub:")) return next(url, context);
  const mod = url.slice(7);
  return {
    format: "module",
    shortCircuit: true,
    source: "const m = globalThis.__adminCatalogStub(" + JSON.stringify(mod) + ");\\nexport const { " + NAMES[mod].join(", ") + " } = m;",
  };
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

// ---------------------------------------------------------------------------
// Load each pack and record what it registers
// ---------------------------------------------------------------------------

const PERMISSION = ["any", "op", "admin", "host", "owner"];

/**
 * @typedef {{ name: string, type: string, optional: boolean, enum?: string }} Param
 * @typedef {{ name: string, description: string, permission: string, params: Param[] }} Command
 */

const problems = [];
/** @type {{ folder: string, pack: string, commands: Command[] }[]} */
const packs = [];
/** @type {Record<string, string[]>} */
const enums = {};

const folders = readdirSync(join(root, "packs"))
  .filter((f) => existsSync(join(root, "packs", f, "scripts", "main.js")))
  .sort();

// Packs log the odd warning while they load with nothing real behind them: keep the output to ours.
const quiet = { log: console.log, warn: console.warn, info: console.info };
for (const folder of folders) {
  const dir = join(root, "packs", folder);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  startups = [];
  /** @type {Command[]} */
  const commands = [];
  const registry = {
    registerEnum(/** @type {string} */ name, /** @type {string[]} */ values) {
      enums[name] = FREE_TEXT.has(name) ? [] : [...values].map(String);
    },
    registerCommand(/** @type {any} */ def) {
      const params = (/** @type {any[]} */ list, /** @type {boolean} */ optional) =>
        (list ?? []).map((p) => /** @type {Param} */ ({ name: String(p.name), type: String(p.type), optional, ...(p.type === "Enum" ? { enum: String(p.name) } : {}) }));
      commands.push({
        name: String(def.name),
        description: String(def.description ?? ""),
        permission: PERMISSION[Number(def.permissionLevel ?? 0)] ?? "op",
        params: [...params(def.mandatoryParameters, false), ...params(def.optionalParameters, true)],
      });
    },
  };
  console.log = console.warn = console.info = () => {};
  try {
    await import(pathToFileURL(join(dir, "scripts", "main.js")).href);
    for (const cb of startups) cb({ customCommandRegistry: registry, blockComponentRegistry: anything(), itemComponentRegistry: anything() });
  } catch (e) {
    problems.push(`${folder}: couldn't load scripts/main.js to read its commands: ${e instanceof Error ? e.stack : e}`);
  } finally {
    Object.assign(console, quiet);
  }

  const expected = registeredNames(dir).commands;
  for (const name of expected) {
    if (!commands.some((c) => c.name === name)) problems.push(`${folder}: "${name}" is in the source but wasn't registered when the pack loaded`);
  }
  const kept = commands.filter((c) => !SKIP.has(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (kept.length) packs.push({ folder, pack: String(manifest.header?.name ?? folder), commands: kept });
}

for (const p of packs)
  for (const c of p.commands)
    for (const prm of c.params)
      if (prm.enum && !enums[prm.enum]) problems.push(`${p.folder}: ${c.name} uses enum "${prm.enum}", which no pack registers`);

// Every command's menu button needs a readable name and hint from presets.js, short enough that Bedrock
// doesn't cut it off; so do the setup checklist and the quick actions.
const presets = await import(pathToFileURL(join(root, "packs", SELF, "scripts", "presets.js")).href);
const fits = (/** @type {string} */ where, /** @type {string} */ text, room = presets.LINE) => {
  if (!text) problems.push(`${where}: empty`);
  else if (presets.textWidth(text) > room) problems.push(`${where}: "${text}" is ${presets.textWidth(text)} pixels wide, more than a button line holds (${room}); shorten it`);
};
const allNames = new Set(packs.flatMap((p) => p.commands.map((c) => c.name)));
for (const p of packs)
  for (const c of p.commands) {
    const n = presets.NAMES[c.name];
    if (!n) {
      problems.push(`${p.folder}: ${c.name} has no button name: add it to NAMES in packs/${SELF}/scripts/presets.js`);
      continue;
    }
    fits(`NAMES ${c.name} name`, n[0], presets.LINE - (c.permission === "any" ? 0 : presets.textWidth(presets.OPS_MARK)));
    fits(`NAMES ${c.name} hint`, n[1]);
  }
for (const name of Object.keys(presets.NAMES)) if (!allNames.has(name)) problems.push(`presets.js NAMES: ${name} isn't a registered command any more`);
for (const item of presets.SETUP) {
  fits(`SETUP ${item.cmd} title`, `[x] ${item.title} (99)`);
  fits(`SETUP ${item.cmd} hint`, item.hint);
}
const actionsSrc = readFileSync(join(root, "packs", SELF, "scripts", "actions.js"), "utf8");
for (const m of actionsSrc.matchAll(/^ {4}title: "([^"]*)",\n {4}hint: "([^"]*)",$/gm)) {
  fits(`quick action "${m[1]}" title`, m[1]);
  fits(`quick action "${m[1]}" hint`, m[2]);
}
if ([...actionsSrc.matchAll(/^ {4}title: /gm)].length !== [...actionsSrc.matchAll(/^ {4}title: "[^"]*",\n {4}hint: /gm)].length)
  problems.push("actions.js: every quick action needs a hint right after its title");

if (problems.length) {
  console.error(`Realm Configuration catalog problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write it
// ---------------------------------------------------------------------------

const usedEnums = Object.keys(enums)
  .filter((e) => packs.some((p) => p.commands.some((c) => c.params.some((prm) => prm.enum === e))))
  .sort();
const count = packs.reduce((n, p) => n + p.commands.length, 0);
const text = `// Generated by tools/admin-catalog.mjs from every pack's registered commands. Don't edit: run
// node tools/admin-catalog.mjs after adding or changing a command (npm run check fails until you do).

/**
 * @typedef {{ name: string, type: string, optional: boolean, enum?: string }} Param
 * @typedef {{ name: string, description: string, permission: "any" | "op" | "admin" | "host" | "owner", params: Param[] }} Command
 * @typedef {{ folder: string, pack: string, commands: Command[] }} Pack
 */

/** @type {Pack[]} ${count} commands in ${packs.length} packs */
export const PACKS = [
${packs
  .map(
    (p) =>
      `  {\n    folder: ${JSON.stringify(p.folder)},\n    pack: ${JSON.stringify(p.pack)},\n    commands: [\n${p.commands
        .map((c) => `      ${JSON.stringify(c)},`)
        .join("\n")}\n    ],\n  },`
  )
  .join("\n")}
];

/** @type {Record<string, string[]>} the values of each enum parameter, as registered */
export const ENUMS = {
${usedEnums.map((e) => `  ${JSON.stringify(e)}: ${JSON.stringify(enums[e])},`).join("\n")}
};
`;

const current = existsSync(out) ? readFileSync(out, "utf8") : "";
if (check) {
  if (current !== text) {
    console.error("packs/admin_bp/scripts/catalog.js is out of date with the packs' commands: run node tools/admin-catalog.mjs (and bump admin_bp's version)");
    process.exit(1);
  }
  console.log(`Realm Configuration catalog lists all ${count} commands of ${packs.length} packs.`);
} else {
  if (current !== text) writeFileSync(out, text);
  console.log(`${current === text ? "Up to date" : "Wrote"} packs/${SELF}/scripts/catalog.js: ${count} commands in ${packs.length} packs.`);
  for (const p of packs) console.log(`  ${p.folder.padEnd(16)} ${p.commands.length}`);
}
