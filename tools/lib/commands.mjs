import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Bedrock allows one command namespace per add-on, and a bundle is one add-on, so every pack uses this one. */
export const COMMAND_NAMESPACE = "realm";

/**
 * Names a pack registers with the custom command registry (commands and enums), read from its
 * scripts/main.js. A command is found when its name is a string literal in the registerCommand call, or
 * when the call sits in a helper function (`function command(registry, name, ...) { registry.registerCommand({ name, ...`)
 * whose callers pass the name as a string literal. `unresolved` counts registerCommand calls whose
 * name couldn't be read either way: the checks fail on those rather than skip the commands quietly.
 * @param {string} packDir
 * @returns {{ commands: string[], enums: string[], unresolved: number }}
 */
export function registeredNames(packDir) {
  const main = join(packDir, "scripts", "main.js");
  if (!existsSync(main)) return { commands: [], enums: [], unresolved: 0 };
  const src = readFileSync(main, "utf8");
  const commands = [...src.matchAll(/registerCommand\(\s*\{\s*name:\s*"([^"]+)"/g)].map((m) => m[1]);
  let unresolved = 0;
  for (const m of src.matchAll(/registerCommand\(\s*\{\s*name\s*(?:[,}]|:\s*[A-Za-z_$])/g)) {
    // The name comes from a variable: look for the helper function around it and read its callers.
    const before = src.slice(0, m.index);
    const helper = [...before.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].at(-1)?.[1];
    const calls = helper ? [...src.matchAll(new RegExp(`(?<![\\w$.])${helper.replace(/\$/g, "\\$")}\\(([^"()]*?)"([^"]+)"`, "g"))].map((c) => c[2]) : [];
    if (calls.length) commands.push(...calls);
    else unresolved++;
  }
  return {
    commands: [...new Set(commands)],
    enums: [...src.matchAll(/registerEnum\(\s*"([^"]+)"/g)].map((m) => m[1]),
    unresolved,
  };
}

/** @param {string} name */
export const namespaceOf = (name) => name.split(":")[0];
