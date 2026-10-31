// Copies tools/settings-shared.js into every behavior pack's scripts/settings-core.js and refreshes the
// factory call below the marker line in its scripts/settings.js. Packs never import each other, so each
// keeps its own copy of the core (the Realm Bundle stores identical copies once); this keeps the copies
// the same. The part of settings.js above the marker (the pack's own options) is left alone.
//
//   node tools/sync-settings.mjs           write the core and the call into every pack
//   node tools/sync-settings.mjs --check   fail if a behavior pack has no settings.js or an outdated copy
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const MARKER = "// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----";
/** The settings menu itself: it asks the others and has nothing to answer with. */
const EXEMPT = new Set(["settings_bp"]);
const CALL = `/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
`;
const shared = readFileSync(join(root, "tools", "settings-shared.js"), "utf8");
const check = process.argv.includes("--check");

const problems = [];
let written = 0;
for (const folder of readdirSync(join(root, "packs")).sort()) {
  if (EXEMPT.has(folder) || !existsSync(join(root, "packs", folder, "scripts", "main.js"))) continue;
  const file = join(root, "packs", folder, "scripts", "settings.js");
  const coreFile = join(root, "packs", folder, "scripts", "settings-core.js");
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
  const next = `${src.slice(0, at + MARKER.length)}\n\n${CALL}`;
  const coreCurrent = existsSync(coreFile) ? readFileSync(coreFile, "utf8") : undefined;
  if (next === src && coreCurrent === shared) continue;
  if (check) {
    if (next !== src) problems.push(`${folder}: scripts/settings.js is out of date (run node tools/sync-settings.mjs)`);
    if (coreCurrent !== shared) problems.push(`${folder}: scripts/settings-core.js is missing or out of date with tools/settings-shared.js (run node tools/sync-settings.mjs)`);
  } else {
    if (next !== src) writeFileSync(file, next);
    if (coreCurrent !== shared) writeFileSync(coreFile, shared);
    written++;
    console.log(`updated packs/${folder}/scripts/settings.js and settings-core.js (bump its manifest version)`);
  }
}

if (problems.length) {
  console.error(`Realm Settings helper problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(check ? "Every behavior pack has an up-to-date scripts/settings.js and settings-core.js." : `${written ? `${written} updated` : "All up to date"}.`);
