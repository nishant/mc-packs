// Test hook for tools/test-bds/examples/script-events-dispatch.js (O54): the packs in ONE script context, like the Realm
// Bundle, with two additions.
//   1. __events_count: imported first, it wraps system.afterEvents.scriptEventReceive.subscribe/unsubscribe before any
//      pack runs and records every native subscription with the pack (the folder in the call stack) and the file that
//      made it. `harness:events_report` answers `harness:events_reply` `{ total, packs, notOne, direct, unsubs }`: how
//      many native listeners each pack holds (one is right) and which subscriptions did not come from the pack's
//      script-events.js (diag.js's own listener, or a pack that still subscribes itself).
//   2. probe_bp: a pack that registers through its own copy of the router (tools/events-shared.js; before O54 it
//      subscribes directly) handlers that record their order, one that throws on purpose, one that is dropped, one
//      registered from an `await` continuation after startup and a busy one, so the scenario can see order, error
//      isolation, unsubscribe and diagnostics attribution on the server. In this one add-on it also reads (and clears)
//      the packs' saved data (`realm:probe_prop`) and counts weatherChange events, for weather-plan-intake.js.
//
//   node tools/test-bds/hooks/events-bundle.mjs <out dir> [all | pack,pack]       assemble the scripts of the packs (default: every behavior pack)
//   node tools/test-bds/hooks/events-bundle.mjs <out dir> --inject <bundle dir>   add both to an unzipped real bundle (npm run bundle -- --all)
// then: node tools/test-bds/run.mjs --quiet --packs <out dir> --scenario tools/test-bds/examples/script-events-dispatch.js --timeout 600
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "..");
const args = process.argv.slice(2);
const inject = args.includes("--inject") ? args[args.indexOf("--inject") + 1] : undefined;
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--inject");
const [out, list = "all"] = positional;
if (!out || (args.includes("--inject") && !inject)) throw new Error("usage: events-bundle.mjs <out dir> [all | pack,pack] | --inject <bundle dir>");
const dest = join(out, "events_bundle_bp");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const standalone = new Set(JSON.parse(readFileSync(join(root, "tools", "standalone.json"), "utf8")).standalone ?? []);
/** @type {string[]} */
let folders = [];
if (inject) {
  cpSync(inject, dest, { recursive: true });
  folders = readdirSync(join(dest, "scripts"), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("__")).map((e) => e.name);
} else {
  folders =
    list === "all"
      ? readdirSync(join(root, "packs")).filter((f) => existsSync(join(root, "packs", f, "scripts", "main.js")) && !standalone.has(f)).sort()
      : list.split(",").filter(Boolean);
  mkdirSync(join(dest, "scripts"), { recursive: true });
  for (const f of folders) cpSync(join(root, "packs", f, "scripts"), join(dest, "scripts", f), { recursive: true });
}

// 1. The counter: no import, so nothing of the pack code runs before it.
mkdirSync(join(dest, "scripts", "__events_count"), { recursive: true });
writeFileSync(
  join(dest, "scripts", "__events_count", "main.js"),
  `import { system } from "@minecraft/server";
// Counts the native scriptEventReceive subscriptions of every pack in this script context.
const sig = system.afterEvents.scriptEventReceive;
const subscribe = sig.subscribe;
const unsubscribe = sig.unsubscribe;
/** @type {{ pack: string, file: string, ns: string }[]} */
const seen = [];
let unsubs = 0;
// The first frame that is neither this file nor a pack's diag.js: scripts/<pack>/<file>.
const who = () => {
  for (const line of String(new Error().stack ?? "").split("\\n")) {
    const m = /([A-Za-z0-9_]+_bp)[\\\\/]([A-Za-z0-9_.\\\\/-]+?\\.js)/.exec(line);
    if (m && !/(^|[\\\\/])diag\\.js$/.test(m[2])) return { pack: m[1], file: m[2] };
  }
  return { pack: "?", file: "?" };
};
// This listener subscribes before the wrap: it is not counted.
subscribe.call(sig, ({ id }) => {
  if (id !== "harness:events_report") return;
  /** @type {Record<string, number>} */
  const per = {};
  for (const s of seen) per[s.pack] = (per[s.pack] ?? 0) + 1;
  const notOne = Object.entries(per).filter(([, n]) => n !== 1).slice(0, 20);
  const direct = seen.filter((s) => s.file !== "script-events.js").slice(0, 12).map((s) => s.pack + "/" + s.file);
  system.sendScriptEvent("harness:events_reply", JSON.stringify({ total: seen.length, packs: Object.keys(per).length, notOne, direct, unsubs, ns: [...new Set(seen.map((s) => s.ns))] }));
}, { namespaces: ["harness"] });
sig.subscribe = function (cb, ...rest) {
  seen.push({ ...who(), ns: (rest[0] && rest[0].namespaces ? rest[0].namespaces.join(",") : "*") });
  return subscribe.call(this, cb, ...rest);
};
sig.unsubscribe = function (cb, ...rest) {
  unsubs++;
  return unsubscribe.call(this, cb, ...rest);
};
`,
);

// 2. The probe pack.
const probe = join(dest, "scripts", "probe_bp");
mkdirSync(probe, { recursive: true });
const shared = readFileSync(join(root, "tools", "diag-shared.js"), "utf8");
writeFileSync(join(probe, "diag.js"), shared.replace('"__PACK__"', '"probe_bp"').replace('"__VERSION__"', '"0.0.1"').replace('"__NAME__"', '"Probe"'));
const routed = existsSync(join(root, "tools", "events-shared.js"));
if (routed) cpSync(join(root, "tools", "events-shared.js"), join(probe, "script-events.js"));
// Before O54 there is no router: the probe subscribes the way every pack did, one listener per handler.
const registry = routed
  ? `import { offScriptEvent, onScriptEvent } from "./script-events.js";`
  : `const onScriptEvent = (ids, fn) => {
  const list = typeof ids === "string" ? [ids] : ids;
  let on = true;
  fn.stop = () => { on = false; };
  system.afterEvents.scriptEventReceive.subscribe((ev) => { if (on && list.includes(ev.id)) fn(ev); }, { namespaces: ["realm"] });
  return fn;
};
const offScriptEvent = (fn) => fn.stop();`;
writeFileSync(
  join(probe, "main.js"),
  `import "./diag.js";
import { system, world } from "@minecraft/server";
${registry}

const order = [];
onScriptEvent("realm:probe_order", () => order.push("a"));
onScriptEvent(["realm:probe_order", "realm:probe_other"], ({ id }) => order.push("b:" + id));
onScriptEvent("realm:probe_order", () => {
  order.push("c");
  throw new Error("probe handler c failed on purpose");
});
onScriptEvent("realm:probe_order", () => order.push("d"));
const dropped = () => order.push("dropped");
onScriptEvent("realm:probe_drop", dropped);
let late = 0;
let lateAt = 0;
system.runTimeout(async () => {
  await Promise.resolve();
  lateAt = system.currentTick;
  onScriptEvent("realm:probe_late", () => {
    late++;
    const until = Date.now() + 3; // a few ms of this pack's time per event
    while (Date.now() < until);
  });
}, 10);
onScriptEvent("realm:probe_ask", ({ message }) => {
  if (message === "drop") offScriptEvent(dropped);
  if (message === "clear") order.length = 0;
  system.sendScriptEvent("realm:probe_state", JSON.stringify({ order: order.slice(-12), late, lateAt, routed: ${routed} }));
});
onScriptEvent("realm:help_ping", () => system.sendScriptEvent("realm:help_pong", "probe_bp"));
// The packs share this add-on's one store, so the probe can read (and clear) what they saved: tools/test-bds/examples/weather-plan-intake.js.
onScriptEvent("realm:probe_prop", ({ message }) => {
  const req = JSON.parse(message || "{}");
  for (const key of req.clear ?? []) world.setDynamicProperty(key, undefined);
  const values = {};
  for (const key of req.get ?? []) values[key] = world.getDynamicProperty(key) ?? null;
  system.sendScriptEvent("realm:probe_props", JSON.stringify({ values, weatherChanges }));
});
let weatherChanges = 0; // overworld weatherChange events this context has seen since it started
world.afterEvents.weatherChange.subscribe(() => {
  weatherChanges++;
});
`,
);

// 3. The entry: the counter first, then every pack, then the probe.
const imports = ["__events_count", ...folders.filter((f) => f !== "probe_bp"), "probe_bp"].map((f) => `import "./${f}/main.js";`).join("\n");
if (inject) {
  const entry = join(dest, "scripts", "main.js");
  const src = readFileSync(entry, "utf8");
  writeFileSync(entry, `// Patched by tools/test-bds/hooks/events-bundle.mjs\nimport "./__events_count/main.js";\n${src}\nimport "./probe_bp/main.js";\n`);
} else {
  writeFileSync(join(dest, "scripts", "main.js"), `// Generated by tools/test-bds/hooks/events-bundle.mjs\n${imports}\n`);
  writeFileSync(
    join(dest, "manifest.json"),
    JSON.stringify(
      {
        format_version: 2,
        header: { name: "Script Events Test Bundle", description: "Test bundle for script-events-dispatch.js", uuid: "4e7d0a16-2c8b-4f35-8a97-6d1b3c5e9f20", version: [1, 0, 0], min_engine_version: [1, 21, 100] },
        modules: [{ type: "script", language: "javascript", uuid: "4e7d0a16-2c8b-4f35-8a97-6d1b3c5e9f21", version: [1, 0, 0], entry: "scripts/main.js" }],
        dependencies: [
          { module_name: "@minecraft/server", version: "2.1.0" },
          { module_name: "@minecraft/server-ui", version: "2.0.0" },
        ],
      },
      null,
      2,
    ),
  );
}
console.log(`wrote ${dest} (${folders.length} packs${inject ? ", injected into a real bundle" : ""}, counter, probe_bp ${routed ? "through the router" : "subscribing directly"})`);
