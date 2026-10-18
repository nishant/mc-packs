// Static check of the action bar protocol: before every setActionBar a pack sends `realm:actionbar`
// { player, ticks, from } so the other writers (the Coordinates HUD, Elytra HUD, Relics readouts, story tracker...)
// wait instead of overwriting it a tick later (history C18: 20 commits retrofitting packs one by one).
//
// A setActionBar call is fine when the function around it (or one of the two functions around that, for a
// callback inside a function) sends realm:actionbar itself or calls one of the pack's helpers that does (a function
// in any of the pack's scripts whose body sends realm:actionbar or calls such a helper). Known exceptions waiting
// for a fix are listed per file and function in tools/check-actionbar.allow.json.
//
//   node tools/check-actionbar.mjs           check
//   node tools/check-actionbar.mjs --list    print every call site without the protocol, ignoring the allowlist
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const ALLOW_FILE = join(root, "tools", "check-actionbar.allow.json");
const listAll = process.argv.includes("--list");
const walk = (/** @type {string} */ dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const rel = (/** @type {string} */ f) => relative(root, f).split(sep).join("/");

/** Comments blanked out and string contents kept (realm:actionbar is a string), so offsets stay put. @param {string} src */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])(\/\/[^\n]*)/g, (m, a, c) => a + " ".repeat(c.length));

/**
 * Every function in the source: its name (or "(anonymous)"), and where its body starts and ends.
 * Found by the "{" after a parameter list ") {" / ") => {" / "x => {", matched to its "}" (strings skipped).
 * @param {string} src @returns {{ name: string, start: number, end: number }[]}
 */
function functions(src) {
  /** @type {{ name: string, start: number, end: number }[]} */
  const out = [];
  /** @type {number[]} */
  const stack = [];
  /** @type {(string | null)[]} */
  const names = [];
  /** @type {string | null} */
  let q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === "\\") i++;
      else if (c === q) q = null;
      else if (q === "`" && c === "$" && src[i + 1] === "{") {
        // a template expression: treat as code until its }
        stack.push(-1);
        names.push(null);
        q = null;
        i++;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      q = c;
      continue;
    }
    if (c === "/" && /[(,=:[!&|?{};]\s*$/.test(src.slice(Math.max(0, i - 20), i))) {
      // a regex literal: skip to its end
      for (i++; i < src.length && src[i] !== "/" && src[i] !== "\n"; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "{") {
      const before = src.slice(Math.max(0, i - 200), i);
      const fn = /\)\s*$|=>\s*$/.test(before);
      let name = null;
      if (fn) {
        const m =
          /(?:function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*$)|(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*)?\([^()]*\)\s*(?:=>)?\s*$)|(?:(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>\s*$)|(?:^|[\s,{;])(?:async\s+|static\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*$/.exec(before);
        name = m ? (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "(anonymous)") : "(anonymous)";
        if (["if", "for", "while", "switch", "catch", "with"].includes(name)) name = null;
      }
      stack.push(i);
      names.push(name);
    } else if (c === "}") {
      const start = stack.pop();
      const name = names.pop();
      if (start === -1) q = "`"; // back inside the template string
      else if (start !== undefined && name) out.push({ name, start, end: i });
    }
  }
  return out;
}

const SEND = /["'`]realm:actionbar["'`]/;
/** @type {Map<string, Set<string>>} file -> functions with an unprotected setActionBar */
const found = new Map();
let sites = 0;
for (const folder of readdirSync(join(root, "packs")).sort()) {
  const dir = join(root, "packs", folder, "scripts");
  if (!existsSync(dir)) continue;
  const files = walk(dir).filter((f) => f.endsWith(".js")).map((f) => ({ file: rel(f), src: code(readFileSync(f, "utf8")) }));
  const parsed = files.map((f) => ({ ...f, fns: functions(f.src) }));
  // The pack's helpers: functions that send realm:actionbar, or call one that does.
  const helpers = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    for (const { src, fns } of parsed)
      for (const fn of fns) {
        if (fn.name === "(anonymous)" || helpers.has(fn.name)) continue;
        const body = src.slice(fn.start, fn.end);
        if (SEND.test(body) || [...helpers].some((h) => new RegExp(`(?<![\\w$.])${h.replace(/\$/g, "\\$")}\\s*\\(`).test(body))) {
          helpers.add(fn.name);
          changed = true;
        }
      }
  }
  const calls = helpers.size ? new RegExp(`(?<![\\w$])(?:${[...helpers].map((h) => h.replace(/\$/g, "\\$")).join("|")})\\s*\\(`) : null;
  for (const { file, src, fns } of parsed) {
    for (const m of src.matchAll(/\.setActionBar\s*\(/g)) {
      const at = /** @type {number} */ (m.index);
      sites++;
      const around = fns.filter((f) => f.start < at && at < f.end).sort((a, b) => b.start - a.start).slice(0, 3);
      const ok = around.some((f) => {
        const body = src.slice(f.start, f.end);
        return SEND.test(body) || (calls && calls.test(body)) || helpers.has(f.name);
      });
      if (ok) continue;
      const name = around[0]?.name ?? "(top level)";
      const named = around.find((f) => f.name !== "(anonymous)")?.name ?? name;
      if (!found.has(file)) found.set(file, new Set());
      /** @type {Set<string>} */ (found.get(file)).add(named);
    }
  }
}

/** @type {Record<string, string[]>} */
const allow = {};
try {
  const raw = JSON.parse(readFileSync(ALLOW_FILE, "utf8"));
  for (const [k, v] of Object.entries(raw)) if (k !== "comment" && Array.isArray(v)) allow[k] = v;
} catch (e) {
  if (existsSync(ALLOW_FILE)) {
    console.error(`check-actionbar: can't read ${rel(ALLOW_FILE)}: ${e}`);
    process.exit(1);
  }
}
const problems = [];
let allowed = 0;
for (const [file, names] of [...found].sort())
  for (const name of [...names].sort()) {
    if (!listAll && allow[file]?.includes(name)) {
      allowed++;
      continue;
    }
    problems.push(`${file}: ${name}() calls setActionBar without sending realm:actionbar first (or calling a helper that does)`);
  }
for (const [file, names] of Object.entries(allow)) for (const name of names) if (!found.get(file)?.has(name)) console.warn(`warning: ${rel(ALLOW_FILE)}: ${name}() in ${file} no longer needs to be listed`);
if (problems.length) {
  console.error(`Action bar protocol problems (send realm:actionbar {player, ticks, from} before setActionBar):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  if (!listAll) console.error(`(a known one waiting for a fix goes in ${rel(ALLOW_FILE)})`);
  process.exit(1);
}
console.log(`Action bar: ${sites} setActionBar calls, each after a realm:actionbar request${allowed ? ` (${allowed} functions known in ${rel(ALLOW_FILE)})` : ""}.`);
