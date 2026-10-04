// Fails if docs/PACKS.md is missing a pack, a command or a config option.
// Runs as part of `npm run check`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registeredNames } from "./lib/commands.mjs";

const root = join(import.meta.dirname, "..");
const docsPath = join(root, "docs", "PACKS.md");
const docs = readFileSync(docsPath, "utf8");

/** Text of the `## ` section whose heading mentions `folder`, up to the next `## `. */
function sectionFor(/** @type {string} */ folder) {
  const lines = docs.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## ") && l.includes(`\`${folder}\``));
  if (start < 0) return undefined;
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

/** Leaf option paths of a config object: { a: 1, b: { c: 2 } } → ["a", "b.c"]. */
function optionPaths(/** @type {Record<string, unknown>} */ obj, prefix = "") {
  /** @type {string[]} */
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix + k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof RegExp)) out.push(...optionPaths(/** @type {any} */ (v), `${path}.`));
    else out.push(path);
  }
  return out;
}

const problems = [];
const packs = readdirSync(join(root, "packs")).filter((f) => existsSync(join(root, "packs", f, "manifest.json")));

for (const folder of packs) {
  const section = sectionFor(folder);
  if (!section) {
    problems.push(`${folder}: no "## …\`${folder}\`" section`);
    continue;
  }
  const scripts = join(root, "packs", folder, "scripts");

  for (const name of registeredNames(join(root, "packs", folder)).commands) {
    if (!section.includes(`\`/${name}`)) problems.push(`${folder}: command \`/${name}\` not documented`);
  }

  const config = join(scripts, "config.js");
  if (existsSync(config)) {
    const mod = await import(pathToFileURL(config).href);
    for (const exported of Object.values(mod)) {
      if (!exported || typeof exported !== "object") continue;
      for (const path of optionPaths(exported)) {
        if (!section.includes(`\`${path}\``)) problems.push(`${folder}: config option \`${path}\` not documented`);
      }
    }
  }
}

if (problems.length) {
  console.error(`docs/PACKS.md is out of date:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`docs/PACKS.md covers all ${packs.length} packs.`);
