// Test hook for tools/test-bds/examples/refill-pages.js: copies stash_bp and refill_bp and adds a harness-only probe to
// stash_bp that counts the saved pages it loads. Every saved page is a World structure loaded with `structure load`
// (page-store.js placeStage), so the probe counts those commands. It uses nothing of the page index, so the same recipe
// runs the code from before the index (f7a824e^, the second argument), where a refill request nothing matches still loads
// every other page.
// scripts/harness_stash_loads.js is imported right after diag.js and answers the console-only script event
// `harness:stash_loads` <id> with `harness:stash_loads_report` { id, loads, patched }.
//   node tools/test-bds/hooks/stash-loads.mjs <out dir> [source repository]
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [out, from] = process.argv.slice(2);
if (!out) throw new Error("usage: stash-loads.mjs <out dir> [source repository]");
const root = from ? resolve(from) : join(import.meta.dirname, "..", "..", "..");
if (existsSync(out)) throw new Error(`fixture output already exists: ${out}`);
mkdirSync(out, { recursive: true });
for (const pack of ["stash_bp", "refill_bp"]) cpSync(join(root, "packs", pack), join(out, pack), { recursive: true });
writeFileSync(
  join(out, "stash_bp", "scripts", "harness_stash_loads.js"),
  `// Harness only (tools/test-bds/hooks/stash-loads.mjs); never shipped.
import { Dimension, ScriptEventSource, system } from "@minecraft/server";

let loads = 0;
let patched = false;
try {
  const run = Dimension.prototype.runCommand;
  Dimension.prototype.runCommand = function (command, ...rest) {
    if (typeof command === "string" && command.startsWith("structure load ")) loads++;
    return run.call(this, command, ...rest);
  };
  patched = Dimension.prototype.runCommand !== run;
} catch (e) {
  console.warn("[stash-loads] could not count page loads: " + e);
}
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceType }) => {
    if (id !== "harness:stash_loads" || sourceType !== ScriptEventSource.Server) return;
    system.sendScriptEvent("harness:stash_loads_report", JSON.stringify({ id: message, loads, patched }));
  },
  { namespaces: ["harness"] },
);
`,
);
const mainFile = join(out, "stash_bp", "scripts", "main.js");
const lines = readFileSync(mainFile, "utf8").split("\n");
const diag = lines.findIndex((l) => /^import\s+["']\.\/diag\.js["'];?\s*$/.test(l));
lines.splice(diag + 1, 0, 'import "./harness_stash_loads.js";');
writeFileSync(mainFile, lines.join("\n"));
console.log(`wrote ${out} (stash_bp with the page-load counter, refill_bp${from ? `, from ${root}` : ""})`);
