// Fails if any pack registers a command or enum outside the shared namespace.
// Bedrock throws NamespaceMismatch for a second namespace in one add-on, so a
// bundle containing that pack would silently lose its commands.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { COMMAND_NAMESPACE, namespaceOf, registeredNames } from "./lib/commands.mjs";

const root = join(import.meta.dirname, "..");
const packs = readdirSync(join(root, "packs")).filter((f) => existsSync(join(root, "packs", f, "manifest.json")));
const problems = [];
const seen = new Map();

for (const folder of packs) {
  const { commands, enums } = registeredNames(join(root, "packs", folder));
  for (const name of [...commands, ...enums]) {
    if (namespaceOf(name) !== COMMAND_NAMESPACE) problems.push(`${folder}: "${name}" must use the "${COMMAND_NAMESPACE}:" namespace`);
    if (seen.has(name)) problems.push(`${folder}: "${name}" is also registered by ${seen.get(name)}`);
    seen.set(name, folder);
  }
}

if (problems.length) {
  console.error(`Command registration problems:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`All ${seen.size} commands/enums use "${COMMAND_NAMESPACE}:" and are unique.`);
