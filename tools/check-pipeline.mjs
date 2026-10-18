// Fails if a generator or sync tool has a --check that npm run check doesn't run, or a check tool isn't run at all.
// Every generated file (catalogs, news, resource packs, shared copies) is only as current as its --check in the
// pipeline: a tool added without one lets a stale pack be published (history C7).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dirname, "..");
const check = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.check;
const walk = (/** @type {string} */ dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "test-bds" || e.name === "node_modules" ? [] : walk(join(dir, e.name))) : [join(dir, e.name)]));
const problems = [];
for (const f of walk(join(root, "tools"))) {
  if (!f.endsWith(".mjs") || f.endsWith(".test.mjs")) continue;
  const rel = relative(root, f).split(sep).join("/");
  const src = readFileSync(f, "utf8");
  const name = rel.split("/").at(-1) ?? "";
  if (!name.startsWith("check-") && src.includes('"--check"') && !check.includes(`node ${rel} --check`)) problems.push(`${rel} has a --check that npm run check doesn't run: add "node ${rel} --check"`);
  if (/^check-[\w-]+\.mjs$/.test(name) && !check.includes(`node ${rel}`)) problems.push(`${rel} isn't run by npm run check`);
}
// Each BDS scenario's header command runs the scenario itself (the suite runs that command; a copy-paste slip ran
// saga-quest-log.js from saga-untrack.js's header).
const examples = join(root, "tools", "test-bds", "examples");
for (const f of readdirSync(examples).filter((x) => x.endsWith(".js"))) {
  const head = readFileSync(join(examples, f), "utf8").split("\n").slice(0, 60).filter((l) => /^\s*\/\//.test(l)).join("\n");
  for (const m of head.matchAll(/node tools\/test-bds\/run\.mjs[^\n]*?--scenario\s+(\S+)/g)) {
    if (m[1] !== `tools/test-bds/examples/${f}`) problems.push(`tools/test-bds/examples/${f}: its header runs ${m[1]}`);
  }
}
if (!/npm run (--silent )?test\b/.test(check)) problems.push("npm run check doesn't run the unit tests (npm run test)");
if (problems.length) {
  console.error(`npm run check is missing steps:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("npm run check runs every generator's --check, every check tool and the unit tests; every BDS scenario header runs its own file.");
