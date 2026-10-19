// Copies tools/diag-shared.js (pack diagnostics: see the top of that file) into every behavior pack with
// scripts as scripts/diag.js, with the pack's folder (PACK) and manifest header.version (VERSION) and name (NAME) filled in,
// and makes "./diag.js" the first import of the pack's scripts/main.js. Used by tools/sync-diag.mjs and by the
// generators that bump a pack's version (help-catalog.mjs, gen-news.mjs), so a bump never leaves a stale copy.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const HEADER = "// Generated from tools/diag-shared.js by node tools/sync-diag.mjs: edit that file, not this copy.\n";
const IMPORT = 'import "./diag.js";';

/** Declared world namespace, plus Easy Building's native legacy world settings. @param {string} folder */
function prefixesFor(folder) {
  const file = join(root, "packs", folder, "scripts", "settings.js");
  const prefixes = [];
  if (existsSync(file)) {
    const prefix = /\bconst PREFIX = ["']([^"']+)["'];/.exec(readFileSync(file, "utf8"))?.[1];
    if (!prefix) throw new Error(`${folder}: settings.js has no declared PREFIX for diagnostics`);
    prefixes.push(prefix);
  }
  if (folder === "build_bp") prefixes.push("eb");
  return prefixes;
}

/** Every pack folder that gets a copy: behavior packs with a scripts/main.js. */
export function diagPacks() {
  return readdirSync(join(root, "packs"))
    .sort()
    .filter((f) => f.endsWith("_bp") && existsSync(join(root, "packs", f, "scripts", "main.js")) && existsSync(join(root, "packs", f, "manifest.json")));
}

/** The copy for one pack. @param {string} folder */
export function diagFor(folder) {
  const shared = readFileSync(join(root, "tools", "diag-shared.js"), "utf8");
  const manifest = JSON.parse(readFileSync(join(root, "packs", folder, "manifest.json"), "utf8"));
  const version = (manifest.header?.version ?? []).join(".");
  const out = shared.replace('const PACK = "__PACK__";', `const PACK = ${JSON.stringify(folder)};`).replace('const VERSION = "__VERSION__";', `const VERSION = ${JSON.stringify(version)};`).replace('const NAME = "__NAME__";', `const NAME = ${JSON.stringify(String(manifest.header?.name ?? folder))};`).replace("const PREFIXES = [];", `const PREFIXES = ${JSON.stringify(prefixesFor(folder))};`);
  if (out === shared || !shared.includes("const PREFIXES = [];")) throw new Error("tools/diag-shared.js lost its PACK/VERSION/PREFIXES placeholders");
  return HEADER + out;
}

/** main.js with "./diag.js" as its first import (unchanged if it already is). @param {string} src */
export function withDiagImport(src) {
  const m = /^import\b.*$/m.exec(src);
  if (m && m[0].trim() === IMPORT) return src;
  const without = src.replace(new RegExp(`^${IMPORT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`, "m"), "");
  const first = /^import\b/m.exec(without);
  const at = first ? first.index : 0;
  return `${without.slice(0, at)}${IMPORT}\n${without.slice(at)}`;
}

/**
 * Refreshes (or with check, only checks) the copies and imports.
 * @param {{ check?: boolean, folders?: string[], log?: (s: string) => void }} [opts]
 * @returns {{ problems: string[], written: number, copies: number }}
 */
export function syncDiag({ check = false, folders, log = console.log } = {}) {
  const problems = [];
  let written = 0;
  const list = folders ?? diagPacks();
  for (const folder of list) {
    const scripts = join(root, "packs", folder, "scripts");
    const file = join(scripts, "diag.js");
    const mainFile = join(scripts, "main.js");
    if (!existsSync(mainFile)) {
      problems.push(`${folder}: has no scripts/main.js`);
      continue;
    }
    const want = diagFor(folder);
    const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
    const main = readFileSync(mainFile, "utf8");
    const mainWant = withDiagImport(main);
    if (check) {
      if (now !== want) problems.push(`${folder}: scripts/diag.js is ${now === undefined ? "missing" : "out of date with tools/diag-shared.js or its manifest version"} (run node tools/sync-diag.mjs)`);
      if (main !== mainWant) problems.push(`${folder}: scripts/main.js must import "./diag.js" first (run node tools/sync-diag.mjs)`);
      continue;
    }
    if (now !== want) {
      writeFileSync(file, want);
      written++;
      log(`updated packs/${folder}/scripts/diag.js`);
    }
    if (main !== mainWant) {
      writeFileSync(mainFile, mainWant);
      written++;
      log(`packs/${folder}/scripts/main.js now imports ./diag.js first`);
    }
  }
  return { problems, written, copies: list.length };
}
