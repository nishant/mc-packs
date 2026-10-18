// Copies tools/name-labels-shared.js (the world-fixed name label helper for townsfolk, caravan traders,
// wanderers and story characters) into every pack that uses it, as scripts/name-labels.js. Packs never
// import each other, so each keeps its own copy; this keeps the four copies the same (history C2/C14: the
// copies were kept in step by hand). A pack takes part by having a scripts/name-labels.js.
//
//   node tools/sync-labels.mjs                 refresh every copy
//   node tools/sync-labels.mjs town_bp ...     also add the file to these packs
//   node tools/sync-labels.mjs --check         fail if a copy is stale (part of npm run check)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const content = readFileSync(join(root, "tools", "name-labels-shared.js"), "utf8");
const check = process.argv.includes("--check");
const add = process.argv.slice(2).filter((a) => !a.startsWith("--"));

const problems = [];
let written = 0;
let copies = 0;
for (const folder of readdirSync(join(root, "packs")).sort()) {
  const scripts = join(root, "packs", folder, "scripts");
  const file = join(scripts, "name-labels.js");
  if (!existsSync(file) && !add.includes(folder)) continue;
  if (!existsSync(join(scripts, "main.js"))) {
    problems.push(`${folder}: has no scripts/main.js`);
    continue;
  }
  copies++;
  const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (now === content) continue;
  if (check) problems.push(`${folder}: scripts/name-labels.js differs from tools/name-labels-shared.js (edit the shared file, then run node tools/sync-labels.mjs)`);
  else {
    writeFileSync(file, content);
    written++;
    console.log(`updated packs/${folder}/scripts/name-labels.js (bump its manifest version)`);
  }
}
for (const folder of add) if (!existsSync(join(root, "packs", folder))) problems.push(`${folder}: no such pack`);

if (problems.length) {
  console.error(`Name label helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${copies} copies of scripts/name-labels.js are current.` : `${written ? `${written} updated` : "All up to date"}.`);
