import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Bedrock allows one command namespace per add-on, and a bundle is one add-on, so every pack uses this one. */
export const COMMAND_NAMESPACE = "realm";

/**
 * Names a pack registers with the custom command registry (commands and enums).
 * @param {string} packDir
 * @returns {{ commands: string[], enums: string[] }}
 */
export function registeredNames(packDir) {
  const main = join(packDir, "scripts", "main.js");
  if (!existsSync(main)) return { commands: [], enums: [] };
  const src = readFileSync(main, "utf8");
  return {
    commands: [...src.matchAll(/registerCommand\(\s*\{\s*name:\s*"([^"]+)"/g)].map((m) => m[1]),
    enums: [...src.matchAll(/registerEnum\(\s*"([^"]+)"/g)].map((m) => m[1]),
  };
}

/** @param {string} name */
export const namespaceOf = (name) => name.split(":")[0];
