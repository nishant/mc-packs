import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Bedrock allows one command namespace per add-on, and a bundle is one add-on, so every pack uses this one. */
export const COMMAND_NAMESPACE = "realm";

/** Synced copies, not the pack's own code (tools/sync-*.mjs); `_shared/` holds bundle copies. */
const SKIP_FILES = new Set(["diag.js", "diag-core.js"]);

/** Every .js file under `dir`, recursively and sorted, without the synced copies and `_shared/`. @param {string} dir @returns {string[]} */
function scriptFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "_shared") out.push(...scriptFiles(p));
    } else if (e.name.endsWith(".js") && !SKIP_FILES.has(e.name)) out.push(p);
  }
  return out;
}

/**
 * Names a pack registers with the custom command registry (commands and enums), read from every .js file under
 * its scripts/ folder (recursively, sorted; not the synced diag.js and diag-core.js, nor _shared/), with either
 * quote style. A command is found when its name is a string literal in the registerCommand call, or when the
 * call sits in a helper function (`function command(registry, name, ...) { registry.registerCommand({ name, ...`)
 * in the same file whose callers pass the name as a string literal. `unresolved` counts registerCommand calls,
 * in any file, whose name couldn't be read either way: the checks fail on those rather than skip the commands quietly.
 * @param {string} packDir
 * @returns {{ commands: string[], enums: string[], unresolved: number }}
 */
export function registeredNames(packDir) {
  const scripts = join(packDir, "scripts");
  if (!existsSync(scripts)) return { commands: [], enums: [], unresolved: 0 };
  const commands = [];
  const enums = [];
  let unresolved = 0;
  for (const file of scriptFiles(scripts)) {
    const src = readFileSync(file, "utf8");
    commands.push(...[...src.matchAll(/registerCommand\(\s*\{\s*name:\s*["']([^"']+)["']/g)].map((m) => m[1]));
    for (const m of src.matchAll(/registerCommand\(\s*\{\s*name\s*(?:[,}]|:\s*[A-Za-z_$])/g)) {
      // The name comes from a variable: look for the helper function around it and read its callers.
      const before = src.slice(0, m.index);
      const helper = [...before.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].at(-1)?.[1];
      const calls = helper ? [...src.matchAll(new RegExp(`(?<![\\w$.])${helper.replace(/\$/g, "\\$")}\\(([^"'()]*?)["']([^"']+)["']`, "g"))].map((c) => c[2]) : [];
      if (calls.length) commands.push(...calls);
      else unresolved++;
    }
    enums.push(...[...src.matchAll(/registerEnum\(\s*["']([^"']+)["']/g)].map((m) => m[1]));
  }
  return { commands: [...new Set(commands)], enums: [...new Set(enums)], unresolved };
}

/** @param {string} name */
export const namespaceOf = (name) => name.split(":")[0];
