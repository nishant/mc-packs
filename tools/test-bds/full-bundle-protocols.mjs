// Stages the genuine Realm Bundle for examples/full-bundle-protocols.js.
// Build with `node tools/bundle.mjs --all` (not `npm run bundle -- --all`: PowerShell drops --all).
// Unpack with tools/test-bds/lib/unzip.mjs, then tools/test-bds/hooks/events-bundle.mjs <scratch> --inject <dir>.
// The events-bundle default copies scripts only and is refused: C13 needs entities, items and features.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractZip } from "./lib/unzip.mjs";

/** Engine deliveries for one signal. Unrelated signals must not inflate the count. */
export function nativeHitReport(hits, signal) {
  const matching = (Array.isArray(hits) ? hits : []).filter((row) => !signal || row.signal === signal);
  return { hits: matching.length, rows: matching.slice(-12) };
}

export const STAGED_NAME = "realm_bundle";
export const INSTRUMENT = ["__c13_tap", "__events_count", "probe_bp"];
export const RUN_TIMEOUT = "1200";

/** Behavior packs `node tools/bundle.mjs --all` merges: scripts/main.js, not listed in tools/standalone.json. */
export function realmBehaviorFolders(repoRoot) {
  const standalone = new Set(JSON.parse(readFileSync(join(repoRoot, "tools", "standalone.json"), "utf8")).standalone ?? []);
  return readdirSync(join(repoRoot, "packs"))
    .filter((f) => existsSync(join(repoRoot, "packs", f, "scripts", "main.js")) && !standalone.has(f))
    .sort();
}

/** Game-side tap relay. Imported before every pack, and before the W11 counter wraps scriptEventReceive. */
export function c13TapSource() {
  const skip = '["__c13_tap", "__events_count", "probe_bp"]';
  const keep = '["calendar_bp", "caravan_bp", "chairs_bp", "claims_bp", "elytra_bp", "expedition_bp", "npc_bp", "slots_bp", "stash_bp", "storm_bp"]';
  return [
    'import { Direction, ItemStack, system, world } from "@minecraft/server";',
    "",
    "// Private relay for tools/test-bds/examples/full-bundle-protocols.js. Pack scripts are not edited.",
    "// harness:c13_tap calls production beforeEvents listeners in registration order (callback-replay).",
    "// A simulated empty-hand tap often emits no event. harness:c13_native reports engine deliveries separately.",
    "const signals = {};",
    "const nativeHits = [];",
    "const sneakBaseline = new Map();",
    "const sneakToken = new Map();",
    "let sneakSeq = 0;",
    nativeHitReport.toString().replace(/^function nativeHitReport/, "function nativeHitReport") + ";",
    `const SKIP = new Set(${skip});`,
    "const packOf = (stack = String(new Error().stack ?? \"\")) => {",
    "  const skip = new Set([\"__c13_tap\", \"__events_count\", \"probe_bp\"]);",
    "  const re = /scripts[\\\\/]([A-Za-z0-9_]+)[\\\\/]/g;",
    "  let m;",
    "  while ((m = re.exec(stack))) if (!skip.has(m[1])) return m[1];",
    "  return \"?\";",
    "};",
    "const watch = (signal, name) => {",
    "  if (!signal || typeof signal.subscribe !== \"function\") return;",
    "  const original = signal.subscribe.bind(signal);",
    "  const list = [];",
    "  signals[name] = list;",
    "  signal.subscribe = (callback, ...rest) => {",
    "    const pack = packOf();",
    "    list.push({ pack, callback });",
    "    const native = (event) => {",
    "      const row = { signal: name, pack, tick: system.currentTick, before: !!(event && event.cancel), after: !!(event && event.cancel) };",
    "      nativeHits.push(row);",
    "      try { return callback(event); }",
    "      finally { row.after = !!(event && event.cancel); }",
    "    };",
    "    return original(native, ...rest);",
    "  };",
    "};",
    "watch(world.beforeEvents.playerInteractWithBlock, \"playerInteractWithBlock\");",
    "watch(world.beforeEvents.playerBreakBlock, \"playerBreakBlock\");",
    "watch(world.beforeEvents.playerInteractWithEntity, \"playerInteractWithEntity\");",
    "watch(world.beforeEvents.itemUse, \"itemUse\");",
    "",
    "const itemOf = (hand, item) => {",
    "  if (item) return new ItemStack(item, 1);",
    "  if (hand === \"pickaxe\") return new ItemStack(\"minecraft:wooden_pickaxe\", 1);",
    "  if (hand === \"disc\") return new ItemStack(\"custom:music_disc_run_away\", 1);",
    "  return undefined;",
    "};",
    "",
    "system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {",
    "  if (id === \"harness:c13_native\") {",
    "    const q = JSON.parse(message || \"{}\");",
    "    const report = nativeHitReport(nativeHits, q.signal);",
    "    system.sendScriptEvent(\"harness:c13_native_result\", JSON.stringify({ id: q.id, mode: \"native-emission\", signal: q.signal, hits: report.hits, rows: report.rows }));",
    "    return;",
    "  }",
    "  if (id !== \"harness:c13_tap\") return;",
    "  const q = JSON.parse(message || \"{}\");",
    "  const signal = q.signal || \"playerInteractWithBlock\";",
    "  let cancel = false;",
    "  let error;",
    "  const trace = [];",
    "  try {",
    "    const player = world.getAllPlayers().find((p) => p.name === q.player);",
    "    if (!player) throw new Error(\"no player \" + q.player);",
    "    if (!sneakBaseline.has(player.id)) sneakBaseline.set(player.id, player.isSneaking === true);",
    "    const sneakId = player.id;",
    "    const sneakMine = ++sneakSeq;",
    "    sneakToken.set(sneakId, sneakMine);",
    "    player.isSneaking = q.sneaking === true;",
    "    try {",
    "    const dim = player.dimension;",
    "    const block = q.x === undefined ? undefined : dim.getBlock({ x: q.x, y: q.y, z: q.z });",
    "    const itemStack = itemOf(q.hand, q.item);",
    "    let event;",
    "    if (signal === \"playerBreakBlock\") event = { player, block, dimension: dim, itemStack, cancel: false };",
    "    else if (signal === \"playerInteractWithEntity\") {",
    "      const target = dim.getEntities({ location: { x: q.x + 0.5, y: q.y, z: q.z + 0.5 }, maxDistance: 3, type: q.entity || \"minecraft:armor_stand\" })[0];",
    "      if (!target) throw new Error(\"no entity at the spot\");",
    "      event = { player, target, itemStack, cancel: false };",
    "    } else if (signal === \"itemUse\") event = { source: player, itemStack: itemStack || new ItemStack(\"minecraft:paper\", 1), cancel: false };",
    "    else event = { player, block, itemStack, blockFace: Direction.Up, isFirstEvent: q.isFirstEvent !== false, cancel: false };",
    "    const list = signals[signal] || [];",
    "    const order = q.reverse ? [...list].reverse() : list;",
    "    for (const row of order) {",
    "      const before = !!event.cancel;",
    "      try { row.callback(event); }",
    "      catch (e) { error = (error ? error + \"; \" : \"\") + row.pack + \": \" + e; }",
    "      trace.push({ pack: row.pack, before, after: !!event.cancel });",
    "    }",
    "    cancel = !!event.cancel;",
    "    } finally {",
    "      system.run(() => {",
    "        if (sneakToken.get(sneakId) !== sneakMine) return;",
    "        const again = world.getAllPlayers().find((p) => p.id === sneakId);",
    "        if (again && again.isValid) again.isSneaking = sneakBaseline.get(sneakId) === true;",
    "      });",
    "    }",
    "  } catch (e) {",
    "    error = String(e);",
    "  }",
    `  const keep = new Set(${keep});`,
    "  const brief = trace.filter((r) => keep.has(r.pack) || r.before !== r.after);",
    "  system.sendScriptEvent(\"harness:c13_tap_result\", JSON.stringify({",
    "    id: q.id, mode: \"callback-replay\", signal, cancel, error: error || undefined,",
    "    listeners: (signals[signal] || []).length,",
    "    order: (signals[signal] || []).map((r) => r.pack),",
    "    trace: brief.slice(0, 40),",
    "  }));",
    "}, { namespaces: [\"harness\"] });",
    "",
  ].join("\n");
}

function walk(dir) {
  const out = [];
  const visit = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const child = join(abs, name);
      const next = rel ? `${rel}/${name}` : name;
      if (statSync(child).isDirectory()) visit(child, next);
      else out.push(next);
    }
  };
  visit(dir, "");
  return out.sort();
}

function countUnder(files, folder) {
  const prefix = `${folder}/`;
  return files.filter((f) => f.startsWith(prefix)).length;
}

function membersOf(main) {
  return [...new Set([...main.matchAll(/^import "\.\/([^/"]+)\//gm)].map((m) => m[1]))];
}

function sameFile(aDir, bDir, rel) {
  const parts = rel.split("/");
  const bPath = join(bDir, ...parts);
  if (!existsSync(bPath)) return false;
  return readFileSync(join(aDir, ...parts)).equals(readFileSync(bPath));
}

export function runCommand(packDir) {
  return `node tools/test-bds/run.mjs --quiet --flat --bundle ${packDir} --scenario tools/test-bds/examples/full-bundle-protocols.js --timeout ${RUN_TIMEOUT}`;
}

/**
 * @param {{ from: string, outDir: string, repoRoot: string, execFileSync?: typeof spawnSync }} opts
 */
export function stageFullBundleProtocols({ from, outDir, repoRoot, execFileSync = spawnSync }) {
  if (!from || !outDir) throw new Error("usage: --from <mcpack|dir> --out <dir>  (build the mcpack with: node tools/bundle.mjs --all)");
  if (!existsSync(from)) throw new Error(`no such bundle: ${from} (build it with: node tools/bundle.mjs --all)`);
  mkdirSync(outDir, { recursive: true });
  const unpacked = join(outDir, "_unpacked");
  rmSync(unpacked, { recursive: true, force: true });
  let bundleDir = from;
  if (statSync(from).isFile()) {
    mkdirSync(unpacked, { recursive: true });
    extractZip(from, unpacked);
    bundleDir = unpacked;
  }
  if (!existsSync(join(bundleDir, "manifest.json")) || !existsSync(join(bundleDir, "scripts", "main.js"))) {
    throw new Error(`${from} is not an unpacked behavior bundle (need manifest.json and scripts/main.js)`);
  }
  const sourceFiles = walk(bundleDir);
  const entities = countUnder(sourceFiles, "entities");
  const items = countUnder(sourceFiles, "items");
  const features = countUnder(sourceFiles, "features");
  if (entities < 1 || items < 1) {
    throw new Error(`${from} has ${entities} entity file(s) and ${items} item file(s): that is a scripts-only bundle. Stage with events-bundle.mjs --inject on the output of node tools/bundle.mjs --all, not the scripts-only default.`);
  }
  const originalMain = readFileSync(join(bundleDir, "scripts", "main.js"), "utf8");
  const realMembers = membersOf(originalMain).filter((m) => !m.startsWith("__") && m !== "probe_bp");
  if (realMembers.length < 2) throw new Error(`${from}: scripts/main.js imports ${realMembers.length} pack(s): that is not a merged bundle`);

  const scratch = join(outDir, "_inject");
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  const hook = join(repoRoot, "tools", "test-bds", "hooks", "events-bundle.mjs");
  const injected = execFileSync(process.execPath, [hook, scratch, "--inject", bundleDir], { encoding: "utf8" });
  if (injected.status !== 0) {
    throw new Error(injected.stderr || injected.stdout || `events-bundle.mjs --inject failed (${injected.status})`);
  }
  const staged = join(scratch, "events_bundle_bp");
  const patched = readFileSync(join(staged, "scripts", "main.js"), "utf8");
  if (!patched.includes('import "./__events_count/main.js";') || !patched.includes('import "./probe_bp/main.js";')) {
    throw new Error("events-bundle.mjs --inject did not add the counter and the probe");
  }
  if (!patched.includes(originalMain.trim())) throw new Error("events-bundle.mjs --inject dropped the bundle's scripts/main.js imports");
  writeFileSync(join(staged, "scripts", "main.js"), [
    'import "./__c13_tap/main.js";',
    'import "./__events_count/main.js";',
    originalMain.replace(/\s*$/, "\n"),
    'import "./probe_bp/main.js";',
    "",
  ].join("\n"));
  mkdirSync(join(staged, "scripts", "__c13_tap"), { recursive: true });
  writeFileSync(join(staged, "scripts", "__c13_tap", "main.js"), c13TapSource());

  const packDir = join(outDir, STAGED_NAME);
  rmSync(packDir, { recursive: true, force: true });
  cpSync(staged, packDir, { recursive: true });

  const stagedFiles = new Set(walk(packDir));
  const missing = sourceFiles.filter((f) => f !== "scripts/main.js" && !sameFile(bundleDir, packDir, f));
  if (missing.length) throw new Error(`inject dropped pack data: ${missing.slice(0, 8).join(", ")}`);
  const added = [...stagedFiles].filter((f) => f !== "scripts/main.js" && !sourceFiles.includes(f));
  const unexpected = added.filter((f) => !f.startsWith("scripts/__c13_tap/") && !f.startsWith("scripts/__events_count/") && !f.startsWith("scripts/probe_bp/"));
  if (unexpected.length) throw new Error(`inject added unexpected files: ${unexpected.slice(0, 8).join(", ")}`);
  const probe = readFileSync(join(packDir, "scripts", "probe_bp", "main.js"), "utf8");
  if (!probe.startsWith('import "./diag.js";')) throw new Error("probe_bp must import ./diag.js first");

  const report = {
    packDir,
    members: realMembers,
    counts: {
      entities,
      items,
      features,
      recipes: countUnder(sourceFiles, "recipes"),
      spawnRules: countUnder(sourceFiles, "spawn_rules"),
    },
    preserved: sourceFiles.length - 1,
    added: added.length,
    command: runCommand(packDir),
  };
  writeFileSync(join(outDir, "fidelity.json"), JSON.stringify({ ...report, packDir, note: "callback-replay is not a native engine event; native-emission is reported separately by the scenario" }, null, 2));
  return report;
}
