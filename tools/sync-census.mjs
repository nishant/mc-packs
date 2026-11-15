// Copies tools/census-shared.js (createCensus: which packs are installed, one answer per script context, see its
// header) into every pack that needs the installed-packs list, as scripts/census.js.
// Packs never import each other, so each keeps its own copy; this keeps the copies the same.
//
//   node tools/sync-census.mjs           refresh every copy
//   node tools/sync-census.mjs --check   fail if a copy is missing or stale, or a caller doesn't import it
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const HEADER = "// Generated from tools/census-shared.js by node tools/sync-census.mjs: edit that file, not this copy.\n";
const content = HEADER + readFileSync(join(root, "tools", "census-shared.js"), "utf8");
const check = process.argv.includes("--check");
// folder -> the scripts that must import from ./census.js
const CONSUMERS = {
  help_bp: ["main.js"],
  news_bp: ["main.js"],
  welcome_bp: ["main.js"],
  admin_bp: ["main.js"],
  atlas_bp: ["main.js"],
  saga_bp: ["main.js"],
  calendar_bp: ["main.js"],
  bounty_bp: ["main.js"],
  skills_bp: ["calling.js"],
};

const problems = [];
let written = 0;
for (const [folder, callers] of Object.entries(CONSUMERS)) {
  const scripts = join(root, "packs", folder, "scripts");
  const file = join(scripts, "census.js");
  if (!existsSync(join(scripts, "main.js"))) {
    problems.push(`${folder}: has no scripts/main.js`);
    continue;
  }
  const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (now !== content) {
    if (check) problems.push(`${folder}: scripts/census.js is ${now === undefined ? "missing" : "out of date with tools/census-shared.js"} (run node tools/sync-census.mjs)`);
    else {
      writeFileSync(file, content);
      written++;
      console.log(`updated packs/${folder}/scripts/census.js (bump its manifest version)`);
    }
  }
  if (!check) continue;
  for (const name of callers) {
    const source = readFileSync(join(scripts, name), "utf8");
    if (!/^import\b[^;]*\b(createCensus)\b[^;]*from "\.\/census\.js";/m.test(source)) problems.push(`${folder}: scripts/${name} doesn't import from ./census.js`);
  }
}

if (problems.length) {
  console.error(`census helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${Object.keys(CONSUMERS).length} copies of scripts/census.js are current.` : `${written ? `${written} updated` : "All up to date"}.`);
