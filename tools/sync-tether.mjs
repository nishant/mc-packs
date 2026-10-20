// Copies tools/tether-shared.js (createTether, createSnapGuard, freeSpotNear, settledBelow: keeping a mob near its
// home without rubber-banding it, see its header) into every pack that keeps a mob at a place, as scripts/tether.js.
// Packs never import each other, so each keeps its own copy; this keeps the copies the same.
//
//   node tools/sync-tether.mjs           refresh every copy
//   node tools/sync-tether.mjs --check   fail if a copy is missing or stale, or a caller doesn't import it
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const HEADER = "// Generated from tools/tether-shared.js by node tools/sync-tether.mjs: edit that file, not this copy.\n";
const content = HEADER + readFileSync(join(root, "tools", "tether-shared.js"), "utf8");
const check = process.argv.includes("--check");
// folder -> the scripts that must import from ./tether.js
const CONSUMERS = {
  wander_bp: ["main.js"],
  caravan_bp: ["main.js"],
  npc_bp: ["main.js"],
};

const problems = [];
let written = 0;
for (const [folder, callers] of Object.entries(CONSUMERS)) {
  const scripts = join(root, "packs", folder, "scripts");
  const file = join(scripts, "tether.js");
  if (!existsSync(join(scripts, "main.js"))) {
    problems.push(`${folder}: has no scripts/main.js`);
    continue;
  }
  const now = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  if (now !== content) {
    if (check) problems.push(`${folder}: scripts/tether.js is ${now === undefined ? "missing" : "out of date with tools/tether-shared.js"} (run node tools/sync-tether.mjs)`);
    else {
      writeFileSync(file, content);
      written++;
      console.log(`updated packs/${folder}/scripts/tether.js (bump its manifest version)`);
    }
  }
  if (!check) continue;
  for (const name of callers) {
    const source = readFileSync(join(scripts, name), "utf8");
    if (!/^import\b[^;]*\b(createTether|createSnapGuard|freeSpotNear|settledBelow)\b[^;]*from "\.\/tether\.js";/m.test(source)) problems.push(`${folder}: scripts/${name} doesn't import from ./tether.js`);
  }
}

if (problems.length) {
  console.error(`tether helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? `All ${Object.keys(CONSUMERS).length} copies of scripts/tether.js are current.` : `${written ? `${written} updated` : "All up to date"}.`);
