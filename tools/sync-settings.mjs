// Copies tools/settings-shared.js into every behavior pack's scripts/settings.js, below the marker
// line. Packs never import each other, so each keeps its own copy of the Realm Settings helper; this
// keeps the copies the same. The part above the marker (the pack's own options) is left alone.
//
//   node tools/sync-settings.mjs           write the shared part into every pack
//   node tools/sync-settings.mjs --check   fail if a behavior pack has no settings.js or an outdated copy
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const MARKER = "// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----";
/** The settings menu itself: it asks the others and has nothing to answer with. */
const EXEMPT = new Set(["settings_bp"]);
const shared = readFileSync(join(root, "tools", "settings-shared.js"), "utf8");
const check = process.argv.includes("--check");

const problems = [];
let written = 0;
for (const folder of readdirSync(join(root, "packs")).sort()) {
  if (EXEMPT.has(folder) || !existsSync(join(root, "packs", folder, "scripts", "main.js"))) continue;
  const file = join(root, "packs", folder, "scripts", "settings.js");
  if (!existsSync(file)) {
    problems.push(`${folder}: no scripts/settings.js (copy one from another pack and change the part above the marker)`);
    continue;
  }
  const src = readFileSync(file, "utf8");
  const at = src.indexOf(MARKER);
  if (at < 0) {
    problems.push(`${folder}: scripts/settings.js has no marker line:\n    ${MARKER}`);
    continue;
  }
  const next = `${src.slice(0, at + MARKER.length)}\n\n${shared}`;
  if (next === src) continue;
  if (check) problems.push(`${folder}: scripts/settings.js is out of date with tools/settings-shared.js (run node tools/sync-settings.mjs)`);
  else {
    writeFileSync(file, next);
    written++;
    console.log(`updated packs/${folder}/scripts/settings.js (bump its manifest version)`);
  }
}

if (problems.length) {
  console.error(`Realm Settings helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? "Every behavior pack has an up-to-date scripts/settings.js." : `${written ? `${written} updated` : "All up to date"}.`);
