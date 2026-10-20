// Copies tools/spread-shared.js (per-player sweeps spread over their interval) into every pack that
// takes part, as scripts/spread.js. Packs never import each other, so each keeps its own copy; this keeps
// the copies the same. A pack takes part by having a scripts/spread.js (and importing it): atlas_bp, quests_bp, milestones_bp, titles_bp, nick_bp, afk_bp, guilds_bp, dolphin_bp.
//
//   node tools/sync-spread.mjs                 refresh every copy
//   node tools/sync-spread.mjs some_bp ...     also add the file to these packs
//   node tools/sync-spread.mjs --check         fail if a copy is stale (for npm run check)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const HEADER = "// Generated from tools/spread-shared.js by node tools/sync-spread.mjs: edit that file, not this copy.\n";
const content = HEADER + readFileSync(join(root, "tools", "spread-shared.js"), "utf8");
const check = process.argv.includes("--check");
const add = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const problems = [];
let written = 0;
let copies = 0;
for (const folder of readdirSync(join(root, "packs")).sort()) {
  const scripts = join(root, "packs", folder, "scripts");
  const file = join(scripts, "spread.js");
  const wanted = add.includes(folder);
  if (!existsSync(file) && !wanted) continue;
  if (!existsSync(join(scripts, "main.js"))) {
    problems.push(`${folder}: has no scripts/main.js`);
    continue;
  }
  copies++;
  const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (now === content) continue;
  if (check) problems.push(`${folder}: scripts/spread.js is out of date with tools/spread-shared.js (run node tools/sync-spread.mjs)`);
  else {
    writeFileSync(file, content);
    written++;
    console.log(`updated packs/${folder}/scripts/spread.js (bump its manifest version)`);
  }
}
for (const folder of add) if (!existsSync(join(root, "packs", folder))) problems.push(`${folder}: no such pack`);

if (problems.length) {
  console.error(`Spread helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${copies} copies of scripts/spread.js are current.` : `${written ? `${written} updated` : "All up to date"}.`);
