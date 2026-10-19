// Static check of the action bar protocol: before every setActionBar a pack sends `realm:actionbar`
// { player, ticks, from } so the other writers (the Coordinates HUD, Elytra HUD, Relics readouts, story tracker...)
// wait instead of overwriting it a tick later (history C18: 20 commits retrofitting packs one by one).
//
// A setActionBar call is fine only when a request comes BEFORE it in the code that runs it:
//   - in the function around it, outside any function nested in that function (a request in a sibling callback
//     doesn't count), or, when that function is an inline callback (an anonymous arrow or function), in the
//     function around the callback, the same way, and so on up to the first named function: a named function or
//     method is a definition that runs later, on its own;
//   - the request is the literal "realm:actionbar" in a send, or a call of one of the pack's helpers. A helper is a
//     function whose own code (outside its nested functions) sends the request or calls a helper. A call is matched
//     to its function the way the code does: a function of the same file, or the name an `import { x }` /
//     `import * as ns` brings in from the file it names. Never another function of the same name elsewhere in the
//     pack, and never `obj.method()` (the receiver isn't known).
// A request after the write, in a sibling function, or in a function that sends it only inside a callback of its own
// is not protection. Referring to `setActionBar` without calling it (an alias, a `.bind`) is reported too.
// Known exceptions waiting for a fix are listed per file and function in tools/check-actionbar.allow.json: the bottom
// lines of the protocol (the Coordinates HUD, the stats ticker and their empty-string clears) and one default hook.
// Never add a function there to hide a new write: send the request.
//
//   node tools/check-actionbar.mjs           check
//   node tools/check-actionbar.mjs --list    print every call site without the protocol, ignoring the allowlist
//   tools/check-actionbar.test.mjs           these rules on small fixture packs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const walk = (/** @type {string} */ dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/** Comments blanked out and string contents kept (realm:actionbar is a string), so offsets stay put. @param {string} src */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])(\/\/[^\n]*)/g, (m, a, c) => a + " ".repeat(c.length));

/** @typedef {{ name: string, start: number, end: number, expr?: boolean }} Fn expr: an arrow function with an expression body (never named in a report, so a report names the same function as before) */
const ANON = "(anonymous)";
const CONTROL = /(?:^|[^\w$.])(?:if|for|while|switch|catch|with)$|for\s+await$/;

/** The index of the "(" that matches the ")" ending `text`, or -1. @param {string} text */
function openOf(text) {
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ")") depth++;
    else if (text[i] === "(" && --depth === 0) return i;
  }
  return -1;
}

/**
 * What the "{" that follows `before` opens: a function (its name, or "(anonymous)") or something else (null: an
 * if/for/while/switch/catch block, an object, a class...).
 * @param {string} before @returns {string | null}
 */
function functionNamed(before) {
  const text = before.trimEnd();
  if (text.endsWith("=>")) {
    const head = text.slice(0, -2).trimEnd();
    const params = head.endsWith(")") ? head.slice(0, openOf(head)).trimEnd() : head.replace(/[A-Za-z_$][\w$]*$/, "").trimEnd();
    return /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async)?$/.exec(params)?.[1] ?? ANON;
  }
  if (!text.endsWith(")")) return null;
  const open = openOf(text);
  if (open < 0) return null;
  const pre = text.slice(0, open).trimEnd();
  if (CONTROL.test(pre)) return null;
  const declared = /function\s*\*?\s*([A-Za-z_$][\w$]*)$/.exec(pre);
  if (declared) return declared[1];
  if (/function\s*\*?$/.test(pre)) return /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\s*\*?$/.exec(pre)?.[1] ?? ANON;
  const method = /(?:^|[\s,{;(])(?:async\s+|static\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)$/.exec(pre);
  return method ? method[1] : null;
}

/** Where the expression a `=>` starts ends (the index of its last character): at a closing bracket of the call it sits in, or a "," or ";" outside brackets. @param {string} src @param {number} from */
function expressionEnd(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
    } else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return i - 1;
      depth--;
    } else if ((c === "," || c === ";") && depth === 0) return i - 1;
  }
  return src.length - 1;
}

/**
 * Every function in the source: its name (or "(anonymous)"), and where its body starts and ends. A function with an
 * expression body (`() => player.onScreenDisplay.setActionBar(text)`) spans that expression.
 * @param {string} src @returns {Fn[]}
 */
export function functions(src) {
  /** @type {Fn[]} */
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
    if (c === "=" && src[i + 1] === ">") {
      let j = i + 2;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] !== "{") out.push({ name: functionNamed(src.slice(Math.max(0, i - 600), i + 2)) ?? ANON, start: j - 1, end: expressionEnd(src, j), expr: true });
      i++;
      continue;
    }
    if (c === "{") {
      stack.push(i);
      names.push(functionNamed(src.slice(Math.max(0, i - 600), i)));
    } else if (c === "}") {
      const start = stack.pop();
      const name = names.pop();
      if (start === -1) q = "`"; // back inside the template string
      else if (start !== undefined && name) out.push({ name, start, end: i });
    }
  }
  return out;
}

/** The functions around an offset, innermost first. @param {Fn[]} fns @param {number} at */
const functionsAround = (fns, at) => fns.filter((f) => f.start < at && at < f.end).sort((a, b) => b.start - a.start);

/** A range's own code: the text with every function inside it blanked out (outermost first), offsets unchanged. @param {string} src @param {Fn[]} fns @param {number} from @param {number} to */
function ownCode(src, fns, from, to) {
  let text = src.slice(from, to);
  let lastEnd = -1;
  for (const g of fns.filter((f) => f.start >= from && f.end < to && !(f.start === from && f.end + 1 === to)).sort((a, b) => a.start - b.start)) {
    if (g.start <= lastEnd) continue;
    lastEnd = g.end;
    text = text.slice(0, g.start - from) + " ".repeat(g.end + 1 - g.start) + text.slice(g.end + 1 - from);
  }
  return text;
}

const SEND = /["'`]realm:actionbar["'`]/g;
const CALL = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
const NS_CALL = /(?<![\w$.])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;

/**
 * What `import` statements bring into a file: local name -> the file and the name it has there; namespace imports
 * (`import * as ns`) -> the file. Files are named relative to the pack's folder.
 * @param {string} src @param {string} dir @param {string} packDir
 */
function importsOf(src, dir, packDir) {
  /** @type {Map<string, { file: string, name: string }>} */
  const named = new Map();
  /** @type {Map<string, string>} */
  const namespaces = new Map();
  const fileOf = (/** @type {string} */ spec) => (spec.startsWith(".") ? relative(packDir, resolve(dir, spec)).split(sep).join("/") : undefined);
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const file = fileOf(m[2]);
    if (!file) continue;
    for (const part of m[1].split(",")) {
      const [name, local = name] = part.trim().split(/\s+as\s+/);
      if (name) named.set(local.trim(), { file, name: name.trim() });
    }
  }
  for (const m of src.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*["']([^"']+)["']/g)) {
    const file = fileOf(m[2]);
    if (file) namespaces.set(m[1], file);
  }
  return { named, namespaces };
}

/**
 * Every setActionBar in the packs under `root` (the folder that holds packs/) that no request protects.
 * @param {string} root
 * @returns {{ found: Map<string, Set<string>>, sites: number, details: { file: string, line: number, name: string, why: string }[] }}
 */
export function analyze(root) {
  /** @type {Map<string, Set<string>>} file -> functions with an unprotected setActionBar */
  const found = new Map();
  /** @type {{ file: string, line: number, name: string, why: string }[]} */
  const details = [];
  let sites = 0;
  const rel = (/** @type {string} */ f) => relative(root, f).split(sep).join("/");
  for (const folder of readdirSync(join(root, "packs")).sort()) {
    const packDir = join(root, "packs", folder);
    const dir = join(packDir, "scripts");
    if (!existsSync(dir)) continue;
    const parsed = walk(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => {
        const src = code(readFileSync(f, "utf8"));
        return { file: rel(f), key: relative(packDir, f).split(sep).join("/"), src, fns: functions(src), ...importsOf(src, dirname(f), packDir) };
      });
    /** The function a call goes to (`file#name`): what the file defines or imports under that name. @param {typeof parsed[number]} p @param {string} name */
    const targetOf = (p, name) => {
      const imported = p.named.get(name);
      if (imported) return `${imported.file}#${imported.name}`;
      return p.fns.some((f) => f.name === name) ? `${p.key}#${name}` : undefined;
    };
    /** The functions a piece of code calls and where. @param {typeof parsed[number]} p @param {string} text @param {number} from */
    const callsOf = (p, text, from) => {
      /** @type {{ at: number, target: string }[]} */
      const out = [];
      for (const m of text.matchAll(CALL)) {
        const target = targetOf(p, m[1]);
        if (target) out.push({ at: from + /** @type {number} */ (m.index), target });
      }
      for (const m of text.matchAll(NS_CALL)) {
        const file = p.namespaces.get(m[1]);
        if (file) out.push({ at: from + /** @type {number} */ (m.index), target: `${file}#${m[2]}` });
      }
      return out;
    };
    // The pack's helpers: functions whose own code sends realm:actionbar, or calls a helper.
    /** @type {Set<string>} */
    const helpers = new Set();
    for (let changed = true; changed; ) {
      changed = false;
      for (const p of parsed)
        for (const fn of p.fns) {
          const key = `${p.key}#${fn.name}`;
          if (fn.name === ANON || helpers.has(key)) continue;
          const own = ownCode(p.src, p.fns, fn.start, fn.end);
          SEND.lastIndex = 0;
          if (SEND.test(own) || callsOf(p, own, fn.start).some((c) => c.target !== key && helpers.has(c.target))) {
            helpers.add(key);
            changed = true;
          }
        }
    }
    /** Whether a request comes before `at` in the own code of [from, to). @param {typeof parsed[number]} p @param {number} from @param {number} to @param {number} at */
    const requestBefore = (p, from, to, at) => {
      const own = ownCode(p.src, p.fns, from, to);
      for (const m of own.matchAll(SEND)) if (from + /** @type {number} */ (m.index) < at) return true;
      return callsOf(p, own, from).some((c) => c.at < at && helpers.has(c.target));
    };
    for (const p of parsed) {
      /** @param {number} at @param {string} why @param {Fn[]} around */
      const report = (at, why, around) => {
        const real = around.filter((f) => !f.expr);
        const name = real[0]?.name ?? "(top level)";
        const named = real.find((f) => f.name !== ANON)?.name ?? name;
        if (!found.has(p.file)) found.set(p.file, new Set());
        /** @type {Set<string>} */ (found.get(p.file)).add(named);
        details.push({ file: p.file, line: p.src.slice(0, at).split("\n").length, name: named, why });
      };
      for (const m of p.src.matchAll(/\.setActionBar\b(?!\s*\()/g)) {
        sites++;
        const at = /** @type {number} */ (m.index);
        report(at, "setActionBar is referenced without being called: an alias or a bind hides the write from this check", functionsAround(p.fns, at));
      }
      for (const m of p.src.matchAll(/\.setActionBar\s*\(/g)) {
        const at = /** @type {number} */ (m.index);
        sites++;
        const around = functionsAround(p.fns, at);
        // The function around the write and, for an inline callback, the function around the callback: up to the first
        // named one. The write's own function must send the request first; a callback runs after the function that
        // hands it over (system.run, an event handler), so a request anywhere in that function's own code is ahead of it.
        /** @type {Fn[]} */
        const chain = [];
        for (const f of around) {
          chain.push(f);
          if (f.name !== ANON) break;
        }
        const ok = chain.length ? chain.some((f, level) => requestBefore(p, f.start, f.end, level === 0 ? at : Infinity)) : requestBefore(p, 0, p.src.length, at);
        if (!ok) report(at, "no realm:actionbar request before it in the code that runs it", around);
      }
    }
  }
  return { found, sites, details };
}

/**
 * The problems left once the allowlisted functions are taken out.
 * @param {Map<string, Set<string>>} found @param {Record<string, string[]>} allow @param {boolean} listAll
 */
export function problemsOf(found, allow, listAll) {
  /** @type {string[]} */
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
  return { problems, allowed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(import.meta.dirname, "..");
  const ALLOW_FILE = join(root, "tools", "check-actionbar.allow.json");
  const listAll = process.argv.includes("--list");
  const rel = (/** @type {string} */ f) => relative(root, f).split(sep).join("/");
  const { found, sites, details } = analyze(root);
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
  const { problems, allowed } = problemsOf(found, allow, listAll);
  for (const [file, names] of Object.entries(allow)) for (const name of names) if (!found.get(file)?.has(name)) console.warn(`warning: ${rel(ALLOW_FILE)}: ${name}() in ${file} no longer needs to be listed`);
  if (problems.length) {
    console.error(`Action bar protocol problems (send realm:actionbar {player, ticks, from} before setActionBar):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    for (const d of details.filter((x) => problems.some((p) => p.startsWith(`${x.file}: ${x.name}()`)))) console.error(`    ${d.file}:${d.line} in ${d.name}(): ${d.why}`);
    if (!listAll) console.error(`(a known one waiting for a fix goes in ${rel(ALLOW_FILE)})`);
    process.exit(1);
  }
  console.log(`Action bar: ${sites} setActionBar calls, each after a realm:actionbar request${allowed ? ` (${allowed} functions known in ${rel(ALLOW_FILE)})` : ""}.`);
}
