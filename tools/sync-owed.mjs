// Copies tools/owed-shared.js (per-player storage for what absent players are owed, see its header) into every pack that
// owes things, as scripts/owed.js. Packs never import each other, so each keeps its own copy; this keeps the copies the same.
//
//   node tools/sync-owed.mjs           refresh every copy
//   node tools/sync-owed.mjs --check   fail if a copy is missing or stale, or a pack's main.js doesn't import it
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const HEADER = "// Generated from tools/owed-shared.js by node tools/sync-owed.mjs: edit that file, not this copy.\n";
const content = HEADER + readFileSync(join(root, "tools", "owed-shared.js"), "utf8");
const check = process.argv.includes("--check");
const CONSUMERS = ["cooking_bp", "relics_bp", "bounty_bp", "guilds_bp", "town_bp", "fishing_bp"];

const problems = [];
let written = 0;
for (const folder of CONSUMERS) {
  const scripts = join(root, "packs", folder, "scripts");
  const file = join(scripts, "owed.js");
  if (!existsSync(join(scripts, "main.js"))) {
    problems.push(`${folder}: has no scripts/main.js`);
    continue;
  }
  const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (now !== content) {
    if (check) problems.push(`${folder}: scripts/owed.js is ${now === undefined ? "missing" : "out of date with tools/owed-shared.js"} (run node tools/sync-owed.mjs)`);
    else {
      writeFileSync(file, content);
      written++;
      console.log(`updated packs/${folder}/scripts/owed.js (bump its manifest version)`);
    }
  }
  if (check && !/from\s+["']\.\/owed\.js["']/.test(readFileSync(join(scripts, "main.js"), "utf8"))) problems.push(`${folder}: scripts/main.js doesn't import ./owed.js`);
}

if (problems.length) {
  console.error(`Owed store helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${CONSUMERS.length} copies of scripts/owed.js are current.` : `${written ? `${written} updated` : "All up to date"}.`);
