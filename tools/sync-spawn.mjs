// Copies tools/spawn-shared.js (spawnFresh: spawn an entity and never get an existing one back, see its header) into
// every pack that spawns tagged entities, as scripts/spawn.js. Packs never import each other, so each keeps its own copy;
// this keeps the copies the same.
//
//   node tools/sync-spawn.mjs           refresh every copy
//   node tools/sync-spawn.mjs --check   fail if a copy is missing or stale, a caller doesn't import it, or a pack still
//                                       defines its own spawnFresh
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const HEADER = "// Generated from tools/spawn-shared.js by node tools/sync-spawn.mjs: edit that file, not this copy.\n";
const content = HEADER + readFileSync(join(root, "tools", "spawn-shared.js"), "utf8");
const check = process.argv.includes("--check");
// folder -> the scripts that must import ./spawn.js
const CONSUMERS = {
  elite_bp: ["main.js"],
  saga_bp: ["actors.js", "objectives.js"],
  atlas_bp: ["main.js"],
  domt_bp: ["helpers.js", "effects.js", "events.js"],
  calendar_bp: ["main.js"],
  moon_bp: ["main.js"],
  expedition_bp: ["gauntlet.js"],
  town_bp: ["main.js"],
};

const problems = [];
let written = 0;
for (const [folder, callers] of Object.entries(CONSUMERS)) {
  const scripts = join(root, "packs", folder, "scripts");
  const file = join(scripts, "spawn.js");
  if (!existsSync(join(scripts, "main.js"))) {
    problems.push(`${folder}: has no scripts/main.js`);
    continue;
  }
  const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (now !== content) {
    if (check) problems.push(`${folder}: scripts/spawn.js is ${now === undefined ? "missing" : "out of date with tools/spawn-shared.js"} (run node tools/sync-spawn.mjs)`);
    else {
      writeFileSync(file, content);
      written++;
      console.log(`updated packs/${folder}/scripts/spawn.js (bump its manifest version)`);
    }
  }
  if (!check) continue;
  for (const name of callers) {
    const source = readFileSync(join(scripts, name), "utf8");
    if (!/^import\b[^;]*\bspawnFresh\b[^;]*from "\.\/spawn\.js";/m.test(source)) problems.push(`${folder}: scripts/${name} doesn't import spawnFresh from ./spawn.js`);
    if (/^\s*(export\s+)?function spawnFresh\b/m.test(source)) problems.push(`${folder}: scripts/${name} still defines its own spawnFresh`);
  }
}

if (problems.length) {
  console.error(`spawnFresh helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${Object.keys(CONSUMERS).length} copies of scripts/spawn.js are current.` : `${written ? `${written} updated` : "All up to date"}.`);
