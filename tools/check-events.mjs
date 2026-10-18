// Static checks on the script events packs send each other (best effort; the BDS harness shim checks the real
// lengths at run time, see tools/test-bds/lib/shim.js):
//   1. ids: every script event id a pack sends is in the realm: namespace (the bundle's one namespace rule);
//   2. size: a script event message must stay under 2048 characters. A send whose payload is built from a list
//      (.map, .filter, Array.from, [...x], Object.entries, .join) or from player-written text (lore, nameTag) can
//      outgrow that as a world fills up, unless the code around it splits the message ({part, parts}, chunks,
//      slice). Such sends are listed in tools/check-events.allow.json until they split or cap their payload;
//      a new one fails the check.
// Sends are found as system.sendScriptEvent(...) calls and as calls of a pack's own helper that forwards to it
// (const send = (id, msg) => system.sendScriptEvent(id, JSON.stringify(msg)), function send(id, data) {...}).
//
//   node tools/check-events.mjs           check
//   node tools/check-events.mjs --list    print every finding, ignoring the allowlist
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const ALLOW_FILE = join(root, "tools", "check-events.allow.json");
const listAll = process.argv.includes("--list");
const walk = (/** @type {string} */ dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const rel = (/** @type {string} */ f) => relative(root, f).split(sep).join("/");
/** Shared copies are checked once, in tools/*-shared.js (they are generated into every pack). */
const SHARED = /\/scripts\/(settings|zones|side|diag)\.js$/;

/** The text of a call's arguments, from the "(" at `open`, balanced over (), [], {} and strings. @param {string} src @param {number} open */
function argsAt(src, open) {
  let depth = 0;
  /** @type {string | null} */
  let q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === "\\") i++;
      else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1, open + 400);
}

/** Splits top-level arguments. @param {string} text */
function splitArgs(text) {
  const out = [];
  let depth = 0, start = 0;
  /** @type {string | null} */
  let q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === "\\") i++;
      else if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

const UNBOUNDED = /\.map\(|\.filter\(|\.flatMap\(|Array\.from\(|\[\s*\.\.\.|Object\.(entries|values|keys)\(|\.join\(|getLore\(|\.lore\b|\.nameTag\b/;
const SPLITS = /\bparts?\b|\bchunk|\.slice\(|\bsplitParts?\b|\bMAX_(LEN|CHARS|BYTES)\b|\b2000\b|\b1900\b|\b1800\b|\b2047\b|\b2048\b/;

/** @type {Map<string, Set<string>>} */
const found = new Map();
/** @type {string[]} */
const idProblems = [];
let sends = 0;
const add = (/** @type {string} */ file, /** @type {string} */ key) => {
  if (!found.has(file)) found.set(file, new Set());
  /** @type {Set<string>} */ (found.get(file)).add(key);
};

const files = [
  ...readdirSync(join(root, "packs")).filter((f) => existsSync(join(root, "packs", f, "scripts"))).flatMap((f) => walk(join(root, "packs", f, "scripts"))),
  ...["settings-shared.js", "zones-shared.js", "side-shared.js"].map((f) => join(root, "tools", f)).filter(existsSync),
].filter((f) => f.endsWith(".js") && !SHARED.test(f.split(sep).join("/")));

for (const f of files) {
  const file = rel(f);
  const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, a) => a);
  // Helpers that forward their first argument as the event id.
  const helpers = new Set();
  for (const m of src.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)\s*,[^)]*\)\s*=>[^\n]*?sendScriptEvent\(\s*\2\b/g)) helpers.add(m[1]);
  for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)\s*,[^)]*\)\s*\{/g)) {
    const body = argsAt(src, src.indexOf("{", /** @type {number} */ (m.index)));
    if (new RegExp(`sendScriptEvent\\(\\s*${m[2].replace(/\$/g, "\\$")}\\b`).test(body)) helpers.add(m[1]);
  }
  const callers = ["sendScriptEvent", ...helpers].map((h) => h.replace(/\$/g, "\\$")).join("|");
  for (const m of src.matchAll(new RegExp(`(?<![\\w$])(?:system\\.)?(${callers})\\s*\\(`, "g"))) {
    const open = /** @type {number} */ (m.index) + m[0].length - 1;
    const before = src.slice(Math.max(0, /** @type {number} */ (m.index) - 12), m.index);
    if (/function\s*$|=\s*$/.test(before) && m[1] !== "sendScriptEvent") continue; // the helper's own definition
    const [id = "", ...rest] = splitArgs(argsAt(src, open));
    const lit = /^["'`]([^"'`$]+)["'`]$/.exec(id);
    if (!lit) continue; // a forwarded id: checked where the helper is called
    sends++;
    const line = src.slice(0, open).split("\n").length;
    if (!/^realm:[a-z0-9_]+$/.test(lit[1]) && !/^realm:[a-z0-9_]+:/.test(lit[1])) idProblems.push(`${file}:${line}: script event "${lit[1]}" is outside the realm: namespace`);
    const lines = src.split("\n");
    let payload = rest.join(", ");
    // A payload in a variable: what it was set to in the 25 lines before (JSON.stringify(msg), msg).
    const name = /^(?:JSON\.stringify\(\s*)?([A-Za-z_$][\w$]*)\s*\)?$/.exec(payload)?.[1];
    if (name) {
      const back = lines.slice(Math.max(0, line - 26), line).join("\n");
      const set = [...back.matchAll(new RegExp(`(?:const|let|var)\\s+${name.replace(/\$/g, "\\$")}\\s*=([^;]*)`, "g"))].at(-1);
      if (set) payload = set[1];
    }
    if (!UNBOUNDED.test(payload)) continue;
    // The code around the send (the enclosing 30 lines) may split or cap the payload.
    const around = lines.slice(Math.max(0, line - 20), line + 10).join("\n");
    if (SPLITS.test(around)) continue;
    add(file, lit[1]);
  }
}

/** @type {Record<string, string[]>} */
const allow = {};
try {
  const raw = JSON.parse(readFileSync(ALLOW_FILE, "utf8"));
  for (const [k, v] of Object.entries(raw)) if (k !== "comment" && Array.isArray(v)) allow[k] = v;
} catch (e) {
  if (existsSync(ALLOW_FILE)) {
    console.error(`check-events: can't read ${rel(ALLOW_FILE)}: ${e}`);
    process.exit(1);
  }
}
const problems = [...idProblems];
let allowed = 0;
for (const [file, ids] of [...found].sort()) {
  for (const id of [...ids].sort()) {
    if (!listAll && allow[file]?.includes(id)) {
      allowed++;
      continue;
    }
    problems.push(`${file}: ${id} is sent with a payload built from a list or player text and nothing splits it: keep it under 2048 characters ({part, parts}, a cap) or list it in ${rel(ALLOW_FILE)}`);
  }
}
for (const [file, ids] of Object.entries(allow)) for (const id of ids) if (!found.get(file)?.has(id)) console.warn(`warning: ${rel(ALLOW_FILE)}: ${id} in ${file} no longer needs to be listed`);
if (problems.length) {
  console.error(`Script event problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`Script events: ${sends} sends use realm: ids${allowed ? `; ${allowed} unsplit list payloads known in ${rel(ALLOW_FILE)}` : ""}.`);
