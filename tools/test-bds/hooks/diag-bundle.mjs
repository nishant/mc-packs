// Test hook for tools/test-bds/examples/admin-diag-bundle.js: builds a small bundle the way tools/bundle.mjs merges
// behavior packs (each pack's scripts/ under scripts/<folder>/, one generated scripts/main.js importing them all),
// so the packs share one script context and ONE dynamic property storage, like the Realm Bundle. It adds a probe
// pack (probe_bp) that saves a 25 KB entry, writes more on request, and starts an interval from an `await`
// continuation and a runTimeout loop that hands itself over again (diag.js must find their owner from the call
// stack).
//   node tools/test-bds/hooks/diag-bundle.mjs <out dir> admin_bp,nick_bp
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "..");
// Optional probe flags (the default output is unchanged without them), used by O43/O45 acceptance scenarios:
//   --declare a,b      the probe declares these world prefixes in its diag.js (a prefix a real pack declares too is ambiguous)
//   --late             adds slow_bp, a console-only pseudo pack whose realm:diag_forgot answer comes 260 ticks after its forget
//   --probe-first      imports the probe before the real packs (its worldLoad handler runs before theirs)
//   --first-key <key> [--first-value <text>]  the probe saves <key> in its worldLoad handler, as an older world's data would already be there
const raw = process.argv.slice(2);
const flag = (/** @type {string} */ name) => {
  const i = raw.indexOf(name);
  return i < 0 ? undefined : raw.splice(i, name === "--late" || name === "--probe-first" ? 1 : 2)[1] ?? true;
};
const declare = String(flag("--declare") ?? "").split(",").filter(Boolean);
const late = flag("--late") !== undefined;
const probeFirst = flag("--probe-first") !== undefined;
const firstKey = flag("--first-key");
const firstValue = String(flag("--first-value") ?? "older world");
const [out, list] = raw;
if (!out || !list) throw new Error("usage: diag-bundle.mjs <out dir> <pack,pack> [--declare a,b] [--late] [--probe-first] [--first-key k]");
const dest = join(out, "diag_bundle_bp");
rmSync(dest, { recursive: true, force: true });
mkdirSync(join(dest, "scripts"), { recursive: true });

const folders = list.split(",").filter(Boolean);
for (const f of folders) cpSync(join(root, "packs", f, "scripts"), join(dest, "scripts", f), { recursive: true });

const probe = join(dest, "scripts", "probe_bp");
mkdirSync(probe, { recursive: true });
const shared = readFileSync(join(root, "tools", "diag-shared.js"), "utf8");
writeFileSync(join(probe, "diag-core.js"), shared);
writeFileSync(join(probe, "diag.js"), `import { registerPack } from "./diag-core.js";
registerPack({ pack: "probe_bp", name: "Probe", version: "0.0.1", prefixes: ${JSON.stringify(declare)} });
`);
writeFileSync(
  join(probe, "main.js"),
  `import "./diag.js";
import { system, world } from "@minecraft/server";
world.afterEvents.worldLoad.subscribe(() => {
  if (world.getDynamicProperty("probe:big") === undefined) world.setDynamicProperty("probe:big", "x".repeat(25000));
${firstKey ? `  if (world.getDynamicProperty(${JSON.stringify(firstKey)}) === undefined) world.setDynamicProperty(${JSON.stringify(firstKey)}, ${JSON.stringify(firstValue)});\n` : ""}});
system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
  if (id === "realm:probe_write") world.setDynamicProperty("probe:" + message, "1");
  if (id === "realm:probe_set") world.setDynamicProperty(message, "1");
}, { namespaces: ["realm"] });
${late ? `// slow_bp: a pack that answers its forget after the operator's wait is over (it still deleted its data)
system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
  if (id === "realm:diag_ping") {
    const m = JSON.parse(message || "{}");
    system.sendScriptEvent("realm:diag_pong", JSON.stringify({ id: m.id, pack: "slow_bp", name: "Slow", version: "0.0.1", bytes: 10, props: 1, big: 10, bigKey: "slow:x" }));
  } else if (id === "realm:diag_forget") {
    const m = JSON.parse(message || "{}");
    if (m.pack !== "slow_bp" || m.confirm !== "FORGET slow_bp") return;
    system.runTimeout(() => {
      system.sendScriptEvent("realm:diag_forgot", JSON.stringify({ id: m.id, pack: "slow_bp", ok: true, removed: 1, bytes: 10 }));
      system.sendScriptEvent("realm:diag_forgot", JSON.stringify({ id: m.id, pack: "slow_bp", ok: true, removed: 1, bytes: 10 }));
    }, 260);
  }
}, { namespaces: ["realm"] });
` : ""}let late = 0;
system.runTimeout(async () => {
  await Promise.resolve();
  system.runInterval(() => { late++; }, 2); // handed over from an await continuation
}, 10);
let loops = 0;
const loop = () => { loops++; system.runTimeout(loop, 3); }; // re-handed over from inside its own callback
system.runTimeout(loop, 3);
system.afterEvents.scriptEventReceive.subscribe(({ id }) => {
  if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "probe_bp");
}, { namespaces: ["realm"] });
`
);

const imports = (probeFirst ? ["probe_bp", ...folders] : [...folders, "probe_bp"]).map((f) => `import "./${f}/main.js";`).join("\n");
writeFileSync(join(dest, "scripts", "main.js"), `// Generated by tools/test-bds/hooks/diag-bundle.mjs\n${imports}\n`);
writeFileSync(
  join(dest, "manifest.json"),
  JSON.stringify(
    {
      format_version: 2,
      header: { name: "Diag Test Bundle", description: "Test bundle for admin-diag-bundle.js", uuid: "7c1e0d52-3f4b-4a8e-9d61-2b5c8e0f4a10", version: [1, 0, 0], min_engine_version: [1, 21, 100] },
      modules: [{ type: "script", language: "javascript", uuid: "7c1e0d52-3f4b-4a8e-9d61-2b5c8e0f4a11", version: [1, 0, 0], entry: "scripts/main.js" }],
      dependencies: [
        { module_name: "@minecraft/server", version: "2.1.0" },
        { module_name: "@minecraft/server-ui", version: "2.0.0" },
      ],
    },
    null,
    2
  )
);
console.log(`wrote ${dest} (${folders.join(", ")}, probe_bp)`);
