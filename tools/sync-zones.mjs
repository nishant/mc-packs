// Copies tools/zones-shared.js (the safe zones protocol: see the top of that file) into every pack that
// takes part, as scripts/zones.js. Packs never import each other, so each keeps its own copy; this keeps
// the copies the same. A pack takes part by having a scripts/zones.js (and importing it).
//
//   node tools/sync-zones.mjs                 refresh every copy
//   node tools/sync-zones.mjs town_bp ...     also add the file to these packs
//   node tools/sync-zones.mjs --check         fail if a copy is stale (part of npm run check)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const HEADER = "// Generated from tools/zones-shared.js by node tools/sync-zones.mjs: edit that file, not this copy.\n";
const content = HEADER + readFileSync(join(root, "tools", "zones-shared.js"), "utf8");
const check = process.argv.includes("--check");
const add = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const problems = [];
let written = 0;
let copies = 0;
for (const folder of readdirSync(join(root, "packs")).sort()) {
  const scripts = join(root, "packs", folder, "scripts");
  const file = join(scripts, "zones.js");
  const wanted = add.includes(folder);
  if (!existsSync(file) && !wanted) continue;
  if (!existsSync(join(scripts, "main.js"))) {
    problems.push(`${folder}: has no scripts/main.js`);
    continue;
  }
  copies++;
  const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (now === content) continue;
  if (check) problems.push(`${folder}: scripts/zones.js is out of date with tools/zones-shared.js (run node tools/sync-zones.mjs)`);
  else {
    writeFileSync(file, content);
    written++;
    console.log(`updated packs/${folder}/scripts/zones.js (bump its manifest version)`);
  }
}
for (const folder of add) if (!existsSync(join(root, "packs", folder))) problems.push(`${folder}: no such pack`);

if (problems.length) {
  console.error(`Safe zones helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${copies} copies of scripts/zones.js are current.` : `${written ? `${written} updated` : "All up to date"}.`);
