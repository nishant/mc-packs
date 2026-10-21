// Test hook for tools/test-bds/examples/elite-invalid.js: copies elite_bp and adds a harness-only probe that removes
// chosen night spawns inside elite_bp's own entitySpawn flush, right after the pack's handler has scheduled their
// conversion and before that runTimeout(1) fires. A scenario can't do this reliably from its own script context (the
// order in which separate contexts get an after-event is not defined), and a spawn removed before the pack's handler
// runs only reaches the handler's guard, never convert().
// The probe subscribes on the first tick (system.run), so within elite_bp it is called after the subscription main.js
// made while loading. It uses nothing of the pack's guards, so the same recipe runs older code or a copy with a guard
// taken out (the second argument): without convert()'s isValid check, it reads a removed mob's tags and logs an
// InvalidEntityError warning, which fails elite-invalid's --strict run.
// scripts/harness_elite_remove.js is imported right after diag.js and answers the console-only script events
// `harness:elite_arm` { id, box: { x0, x1, z0, z1 }, n } (remove up to n zombie spawns inside the box) and
// `harness:elite_report` <id> with `harness:elite_remove_report` { id, removed, armed }: removed counts the mobs that
// were still valid when the probe removed them.
//   node tools/test-bds/hooks/elite-remove.mjs <out dir> [source repository]
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [out, from] = process.argv.slice(2);
if (!out) throw new Error("usage: elite-remove.mjs <out dir> [source repository]");
const root = from ? resolve(from) : join(import.meta.dirname, "..", "..", "..");
if (existsSync(out)) throw new Error(`fixture output already exists: ${out}`);
mkdirSync(out, { recursive: true });
cpSync(join(root, "packs", "elite_bp"), join(out, "elite_bp"), { recursive: true });
writeFileSync(
  join(out, "elite_bp", "scripts", "harness_elite_remove.js"),
  `// Harness only (tools/test-bds/hooks/elite-remove.mjs); never shipped.
import { ScriptEventSource, system, world } from "@minecraft/server";

/** @type {{ x0: number, x1: number, z0: number, z1: number } | undefined} */
let box;
let left = 0;
let removed = 0;
// After main.js's own entitySpawn subscription (made while the pack loaded), so this runs after the pack's handler.
system.run(() => {
  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    try {
      if (!box || left <= 0 || !entity.isValid || entity.typeId !== "minecraft:zombie") return;
      const at = entity.location;
      if (at.x < box.x0 || at.x > box.x1 || at.z < box.z0 || at.z > box.z1) return;
      left--;
      entity.remove();
      removed++;
    } catch (e) {
      console.warn("[elite-remove] " + e);
    }
  });
});
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message, sourceType }) => {
    if (sourceType !== ScriptEventSource.Server) return;
    if (id === "harness:elite_arm") {
      const m = JSON.parse(message);
      box = m.box;
      left = m.n;
      removed = 0;
      system.sendScriptEvent("harness:elite_remove_report", JSON.stringify({ id: m.id, removed, armed: left }));
    } else if (id === "harness:elite_report") {
      system.sendScriptEvent("harness:elite_remove_report", JSON.stringify({ id: message, removed, armed: left }));
    }
  },
  { namespaces: ["harness"] },
);
`,
);
const mainFile = join(out, "elite_bp", "scripts", "main.js");
const lines = readFileSync(mainFile, "utf8").split("\n");
const diag = lines.findIndex((l) => /^import\s+["']\.\/diag\.js["'];?\s*$/.test(l));
lines.splice(diag + 1, 0, 'import "./harness_elite_remove.js";');
writeFileSync(mainFile, lines.join("\n"));
console.log(`wrote ${out} (elite_bp with the spawn remover${from ? `, from ${root}` : ""})`);
