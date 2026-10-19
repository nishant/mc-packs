// Copies tools/events-shared.js (one script event listener per pack, see its header) into every behavior pack with
// scripts as scripts/script-events.js. Packs never import each other, so each keeps its own copy. The copy is identical in
// every pack (nothing is filled in), so a pack's version only changes when the pack's own files do.
//
//   node tools/sync-events.mjs           refresh every copy
//   node tools/sync-events.mjs --check   fail if a copy is missing or stale, or a pack subscribes to
//                                        scriptEventReceive itself instead of through ./script-events.js
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const shared = readFileSync(join(root, "tools", "events-shared.js"), "utf8");
const walk = (/** @type {string} */ dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
/** A direct subscription, in code (comments blanked first). */
const DIRECT = /\bscriptEventReceive\s*\.\s*subscribe\s*\(/;
const code = (/** @type {string} */ src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

const problems = [];
let written = 0;
let copies = 0;
for (const folder of readdirSync(join(root, "packs")).sort()) {
  const scripts = join(root, "packs", folder, "scripts");
  if (!existsSync(join(scripts, "main.js"))) continue;
  copies++;
  const file = join(scripts, "script-events.js");
  const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (now !== shared) {
    if (check) problems.push(`${folder}: scripts/script-events.js is ${now === undefined ? "missing" : "out of date with tools/events-shared.js"} (run node tools/sync-events.mjs)`);
    else {
      writeFileSync(file, shared);
      written++;
      console.log(`updated packs/${folder}/scripts/script-events.js (bump its manifest version)`);
    }
  }
  if (!check) continue;
  for (const f of walk(scripts)) {
    const name = relative(scripts, f).split(sep).join("/");
    if (!f.endsWith(".js") || name === "script-events.js" || name === "diag.js") continue;
    if (DIRECT.test(code(readFileSync(f, "utf8")))) problems.push(`${folder}: scripts/${name} subscribes to scriptEventReceive itself (use onScriptEvent from ./script-events.js: one native listener per pack)`);
  }
}

if (problems.length) {
  console.error(`Script event listener problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${copies} copies of scripts/script-events.js are current and no pack subscribes to scriptEventReceive directly.` : `${written ? `${written} updated` : "All up to date"}.`);
