// The copy step behind the small sync tools (sync-prune, sync-gossip, sync-weather): one tools/<name>-shared.js copied,
// with a "generated" header, into every pack that has scripts/<file> (and into the packs named on the command line).
// Packs never import each other, so each keeps its own copy; this keeps the copies the same. --check only reports (each tool reads its own flag, so check-pipeline sees it).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");

/** The header every copy starts with. @param {string} shared @param {string} tool */
export const headerOf = (shared, tool) => `// Generated from tools/${shared} by node tools/${tool}: edit that file, not this copy.\n`;

/**
 * @param {{ shared: string, file: string, tool: string, label: string, check: boolean, add?: string[], expect?: string[] }} o
 *   shared: the file in tools/; file: the copy's name in scripts/; tool: the sync tool's file name; label: for messages;
 *   check: only report; add: packs to give a copy; expect: packs that must have a copy (one deleted by mistake is
 *   reported instead of silently dropped)
 */
export function syncCopies({ shared, file, tool, label, check, add = [], expect = [] }) {
  const content = headerOf(shared, tool) + readFileSync(join(root, "tools", shared), "utf8");
  /** @type {string[]} */
  const problems = [];
  let written = 0;
  let copies = 0;
  for (const folder of readdirSync(join(root, "packs")).sort()) {
    const scripts = join(root, "packs", folder, "scripts");
    const path = join(scripts, file);
    const wanted = add.includes(folder) || expect.includes(folder);
    if (!existsSync(path) && !wanted) continue;
    if (!existsSync(join(scripts, "main.js"))) {
      problems.push(`${folder}: has no scripts/main.js`);
      continue;
    }
    copies++;
    const now = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    if (now === content) continue;
    if (check) problems.push(`${folder}: scripts/${file} ${now === undefined ? "is missing" : `is out of date with tools/${shared}`} (run node tools/${tool})`);
    else {
      writeFileSync(path, content);
      written++;
      console.log(`updated packs/${folder}/scripts/${file} (bump its manifest version)`);
    }
  }
  for (const folder of [...add, ...expect]) if (!existsSync(join(root, "packs", folder))) problems.push(`${folder}: no such pack`);
  if (problems.length) {
    console.error(`${label} problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(check ? `All ${copies} copies of scripts/${file} are current.` : `${written ? `${written} updated` : "All up to date"}.`);
}
