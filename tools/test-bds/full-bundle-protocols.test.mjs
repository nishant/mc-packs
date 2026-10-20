import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { zip } from "../lib/zip.mjs";
import { bundleMembers, loadBundle } from "./lib/packs.mjs";
import { realmBehaviorFolders, stageFullBundleProtocols } from "./full-bundle-protocols.mjs";

const harness = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(harness, "..", "..");

function scratch(name) {
  const cache = path.join(harness, ".cache");
  fs.mkdirSync(cache, { recursive: true });
  return fs.mkdtempSync(path.join(cache, name));
}

function sha(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeBundle(dir, extra = []) {
  fs.mkdirSync(path.join(dir, "scripts", "chairs_bp"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts", "claims_bp"), { recursive: true });
  fs.mkdirSync(path.join(dir, "entities"), { recursive: true });
  fs.mkdirSync(path.join(dir, "items"), { recursive: true });
  fs.mkdirSync(path.join(dir, "features"), { recursive: true });
  const chair = 'import "./diag.js";\nif (event.cancel || !isFirstEvent || itemStack || player.isSneaking) return;\n';
  fs.writeFileSync(path.join(dir, "scripts", "chairs_bp", "main.js"), chair);
  fs.writeFileSync(path.join(dir, "scripts", "claims_bp", "main.js"), "export const claims = 1;\n");
  fs.writeFileSync(path.join(dir, "scripts", "main.js"), 'import "./chairs_bp/main.js";\nimport "./claims_bp/main.js";\n');
  fs.writeFileSync(path.join(dir, "entities", "seat.json"), '{"minecraft:entity":{"description":{"identifier":"realm:seat"}}}\n');
  fs.writeFileSync(path.join(dir, "items", "nos_rocket.json"), '{"minecraft:item":{"description":{"identifier":"custom:nos_rocket"}}}\n');
  fs.writeFileSync(path.join(dir, "features", "marker.json"), '{"minecraft:feature_rules":{"description":{"identifier":"realm:marker"}}}\n');
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    format_version: 2,
    header: { name: "Realm Bundle", description: "test", uuid: "00000000-0000-4000-8000-0000000000a1", version: [1, 0, 0], min_engine_version: [1, 21, 100] },
    modules: [{ type: "script", language: "javascript", uuid: "00000000-0000-4000-8000-0000000000a2", version: [1, 0, 0], entry: "scripts/main.js" }, { type: "data", uuid: "00000000-0000-4000-8000-0000000000a3", version: [1, 0, 0] }],
    dependencies: [{ module_name: "@minecraft/server", version: "2.1.0" }, { module_name: "@minecraft/server-ui", version: "2.0.0" }],
  }, null, 2));
  for (const file of extra) fs.writeFileSync(path.join(dir, file.name), file.data);
}

test("the repo's Realm Bundle members are the 67 behavior packs", () => {
  const members = realmBehaviorFolders(root);
  assert.equal(members.length, 67);
  for (const name of ["chairs_bp", "claims_bp", "elytra_bp", "slots_bp", "stash_bp", "storm_bp"]) assert.ok(members.includes(name));
  assert.ok(members.indexOf("chairs_bp") < members.indexOf("claims_bp"));
  assert.ok(members.indexOf("claims_bp") < members.indexOf("slots_bp"));
  assert.ok(members.indexOf("claims_bp") < members.indexOf("stash_bp"));
  assert.ok(members.indexOf("claims_bp") < members.indexOf("storm_bp"));
  assert.ok(members.indexOf("claims_bp") < members.indexOf("elytra_bp"));
  assert.ok(members.indexOf("calendar_bp") < members.indexOf("claims_bp"));
  assert.ok(members.indexOf("claims_bp") < members.indexOf("expedition_bp"));
});

test("events-bundle default copies scripts only, so entities and items are absent", () => {
  const dir = scratch("c13-default-");
  const r = spawnSync(process.execPath, [path.join(harness, "hooks", "events-bundle.mjs"), dir, "chairs_bp,claims_bp"], { encoding: "utf8", cwd: root });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const dest = path.join(dir, "events_bundle_bp");
  assert.equal(fs.existsSync(path.join(dest, "scripts", "chairs_bp", "main.js")), true);
  assert.equal(fs.existsSync(path.join(dest, "entities")), false);
  assert.equal(fs.existsSync(path.join(dest, "items")), false);
  assert.equal(fs.existsSync(path.join(dest, "features")), false);
});

test("scripts-only events-bundle output is not a full bundle and is refused", () => {
  const dir = scratch("c13-scripts-");
  const packed = path.join(dir, "src");
  writeBundle(packed);
  fs.rmSync(path.join(packed, "entities"), { recursive: true, force: true });
  fs.rmSync(path.join(packed, "items"), { recursive: true, force: true });
  fs.rmSync(path.join(packed, "features"), { recursive: true, force: true });
  assert.throws(() => stageFullBundleProtocols({ from: packed, outDir: path.join(dir, "out"), repoRoot: root }), /entities|items|scripts-only|--inject/);
});

test("staging injects into a real bundle and keeps entities, items, features and production guards", () => {
  const dir = scratch("c13-full-");
  const packed = path.join(dir, "src");
  writeBundle(packed);
  const before = sha(path.join(packed, "scripts", "chairs_bp", "main.js"));
  const report = stageFullBundleProtocols({ from: packed, outDir: path.join(dir, "out"), repoRoot: root });
  assert.equal(report.members.length, 2);
  assert.deepEqual(report.members, ["chairs_bp", "claims_bp"]);
  assert.equal(report.counts.entities, 1);
  assert.equal(report.counts.items, 1);
  assert.equal(report.counts.features, 1);
  assert.equal(sha(path.join(report.packDir, "entities", "seat.json")), sha(path.join(packed, "entities", "seat.json")));
  assert.equal(sha(path.join(report.packDir, "items", "nos_rocket.json")), sha(path.join(packed, "items", "nos_rocket.json")));
  assert.equal(sha(path.join(report.packDir, "features", "marker.json")), sha(path.join(packed, "features", "marker.json")));
  assert.equal(sha(path.join(report.packDir, "scripts", "chairs_bp", "main.js")), before);
  assert.match(fs.readFileSync(path.join(report.packDir, "scripts", "chairs_bp", "main.js"), "utf8"), /!isFirstEvent/);
  const entry = fs.readFileSync(path.join(report.packDir, "scripts", "main.js"), "utf8");
  assert.match(entry, /^import "\.\/__c13_tap\/main\.js";\r?\nimport "\.\/__events_count\/main\.js";/);
  assert.match(entry, /import "\.\/chairs_bp\/main\.js";\r?\nimport "\.\/claims_bp\/main\.js";/);
  assert.match(entry, /import "\.\/probe_bp\/main\.js";\s*$/);
  const probe = fs.readFileSync(path.join(report.packDir, "scripts", "probe_bp", "main.js"), "utf8");
  assert.match(probe, /^import "\.\/diag\.js";/);
  const tap = fs.readFileSync(path.join(report.packDir, "scripts", "__c13_tap", "main.js"), "utf8");
  assert.match(tap, /callback-replay/);
  assert.match(tap, /playerInteractWithBlock/);
  assert.match(tap, /playerBreakBlock/);
  assert.match(tap, /playerInteractWithEntity/);
  assert.match(tap, /itemUse/);
  assert.doesNotMatch(tap, /sed /);
  const loaded = loadBundle(report.packDir, path.join(dir, "work"));
  assert.equal(loaded.kind, "bp");
  assert.ok(loaded.members.includes("chairs_bp") && loaded.members.includes("claims_bp"));
  assert.ok(loaded.members.includes("__c13_tap") && loaded.members.includes("probe_bp"));
  assert.equal(bundleMembers(report.packDir).filter((m) => m.endsWith("_bp") && m !== "probe_bp").length, 2);
  const counter = fs.readFileSync(path.join(report.packDir, "scripts", "__events_count", "main.js"), "utf8");
  assert.ok(counter.includes("[\\\\/]"), "the listener counter accepts Windows and POSIX stack paths");
});

test("an .mcpack is unpacked with the existing reader before --inject", () => {
  const dir = scratch("c13-zip-");
  const src = path.join(dir, "src");
  writeBundle(src);
  const files = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const abs = path.join(d, name);
      if (fs.statSync(abs).isDirectory()) walk(abs);
      else files.push({ name: path.relative(src, abs).split(path.sep).join("/"), data: fs.readFileSync(abs) });
    }
  };
  walk(src);
  const mcpack = path.join(dir, "realm_bundle.mcpack");
  fs.writeFileSync(mcpack, zip(files));
  const report = stageFullBundleProtocols({ from: mcpack, outDir: path.join(dir, "out"), repoRoot: root });
  assert.equal(report.counts.entities, 1);
  assert.equal(fs.readFileSync(path.join(report.packDir, "entities", "seat.json"), "utf8"), fs.readFileSync(path.join(src, "entities", "seat.json"), "utf8"));
});

test("the hook rejects a missing --from and prints the --bundle recipe", () => {
  const hook = path.join(harness, "hooks", "full-bundle-protocols.mjs");
  const bad = spawnSync(process.execPath, [hook], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stdout}${bad.stderr}`, /--from/);
  const help = spawnSync(process.execPath, [hook, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--from/);
  assert.match(help.stdout, /--out/);
  assert.match(help.stdout, /--bundle/);
  assert.match(help.stdout, /events-bundle\.mjs/);
  assert.match(help.stdout, /--inject/);
  const scenario = fs.readFileSync(path.join(harness, "examples", "full-bundle-protocols.js"), "utf8");
  assert.match(scenario, /--bundle/);
  assert.match(scenario, /callback-replay/);
  assert.match(scenario, /full-bundle-protocols\.mjs --from/);
  assert.doesNotMatch(scenario, /sed -i/);
});

test("native hit report counts only the requested signal", async () => {
  const mod = await import("./full-bundle-protocols.mjs");
  assert.equal(typeof mod.nativeHitReport, "function", "nativeHitReport is exported");
  const unrelated = mod.nativeHitReport([
    { signal: "playerBreakBlock" },
    { signal: "itemUse" },
    { signal: "playerInteractWithEntity" },
  ], "playerInteractWithBlock");
  assert.equal(unrelated.hits, 0, "an unrelated signal must not count as a target hit");
  assert.equal(unrelated.rows.length, 0);
  const mixed = mod.nativeHitReport([
    { signal: "playerInteractWithBlock", pack: "claims_bp" },
    { signal: "playerBreakBlock", pack: "claims_bp" },
    { signal: "playerInteractWithBlock", pack: "stash_bp" },
  ], "playerInteractWithBlock");
  assert.equal(mixed.hits, 2);
  assert.equal(mixed.rows.length, 2);
  assert.ok(mixed.rows.every((row) => row.signal === "playerInteractWithBlock"));
  const src = mod.c13TapSource();
  assert.match(src, /nativeHitReport\(nativeHits/);
  assert.doesNotMatch(src, /hits:\s*nativeHits\.length/);
});

test("replay sets sneaking only for the case and restores the baseline after deferred work", async () => {
  const { c13TapSource } = await import("./full-bundle-protocols.mjs");
  const src = c13TapSource();
  assert.match(src, /sneakBaseline/);
  assert.match(src, /player\.isSneaking = q\.sneaking === true/);
  const setAt = src.indexOf("player.isSneaking = q.sneaking === true");
  const callAt = src.indexOf("row.callback(event)");
  const restoreAt = src.lastIndexOf("sneakBaseline.get");
  assert.ok(setAt > 0 && setAt < callAt, "sneaking is set before production callbacks");
  assert.ok(restoreAt > callAt, "baseline restore is queued after production callbacks");
  assert.match(src.slice(callAt, restoreAt), /system\.run\(/);
  assert.match(src, /sneakToken\.get\([^)]+\) !== /);
  const scenario = fs.readFileSync(path.join(harness, "examples", "full-bundle-protocols.js"), "utf8");
  const replayFn = scenario.slice(scenario.indexOf("const replay = async"), scenario.indexOf("const row ="));
  assert.match(replayFn, /await t\.wait\(1\)/);
});

test("replay uses the equipped mainhand as event.itemStack, and the scenario refuses a visitor insert", async () => {
  const { c13TapSource } = await import("./full-bundle-protocols.mjs");
  const src = c13TapSource();
  assert.match(src, /EquipmentSlot\.Mainhand/);
  assert.match(src, /setEquipment\(EquipmentSlot\.Mainhand/);
  assert.match(src, /getEquipment\(EquipmentSlot\.Mainhand\)/);
  assert.match(src, /equipment and item stack disagree/);
  const equipAt = src.indexOf("setEquipment(EquipmentSlot.Mainhand");
  const eventAt = src.indexOf("else event = { player, block, itemStack");
  assert.ok(equipAt > 0 && equipAt < eventAt, "the hand is equipped before the event is built");
  const scenario = fs.readFileSync(path.join(harness, "examples", "full-bundle-protocols.js"), "utf8");
  const juke = scenario.slice(scenario.indexOf("minecraft:jukebox"), scenario.indexOf("Storm rod"));
  const visitorInsert = juke.indexOf("visitor does not insert the disc into an empty jukebox");
  const ownerInsert = juke.indexOf("the owner's disc went into the jukebox");
  const visitorEject = juke.indexOf("the visitor does not eject or pick up the disc");
  assert.ok(visitorInsert > 0 && visitorInsert < ownerInsert, "visitor insertion refusal is asserted before the owner insert");
  assert.ok(ownerInsert < visitorEject, "owner insertion stays before the ejection refusal");
});

test("ejection accounting includes the actual counter's ground and either player's picked-up discs", () => {
  const scenario = fs.readFileSync(path.join(harness, "examples", "full-bundle-protocols.js"), "utf8");
  const start = scenario.indexOf("const availableDiscs =");
  const body = scenario.slice(start, scenario.indexOf("const handIds", start));
  assert.ok(start >= 0);
  const player = (items) => ({
    getComponent: () => ({ container: { size: items.length, getItem: (slot) => items[slot] } }),
  });
  const disc = { typeId: "custom:music_disc_run_away", amount: 1 };
  const count = (ground, own, visitor) => new Function("op", "visitor", "groundDiscs", "DISC", `${body}; return availableDiscs();`)(
    player(own), player(visitor), () => ground, disc.typeId,
  );
  assert.equal(count(1, [], []), 1);
  assert.equal(count(0, [disc], []), 1);
  assert.equal(count(0, [], [disc]), 1);
  assert.equal(count(0, [], []), 0);
  assert.equal(count(1, [disc], []), 2, "a duplicate cannot pass the exactly-one assertion");
  assert.match(scenario, /availableDiscs\(\) === beforeOwnerEject \+ 1/);
  assert.match(scenario, /title: \/\^Realm help\$\//);
});

test("the storm rod is placed by a native use, not setType", () => {
  const scenario = fs.readFileSync(path.join(harness, "examples", "full-bundle-protocols.js"), "utf8");
  const storm = scenario.slice(scenario.indexOf("Storm rod"), scenario.indexOf("Break and entity"));
  assert.doesNotMatch(storm, /setType\("minecraft:lightning_rod"\)/);
  assert.match(storm, /useItemInSlotOnBlock/);
  assert.match(storm, /afterEvents\.playerPlaceBlock/);
  const placeAt = storm.indexOf("afterEvents.playerPlaceBlock");
  const boltAt = storm.indexOf("lightning_bolt");
  assert.ok(placeAt >= 0 && boltAt > placeAt, "playerPlaceBlock is observed before the bolt");
  assert.match(storm, /visitor collects no Storm Glass/);
  assert.match(storm, /owner collects the glass/);
});

test("chairs must match the stair, and expedition and npc claims stay within what was exercised", () => {
  const scenario = fs.readFileSync(path.join(harness, "examples", "full-bundle-protocols.js"), "utf8");
  const stair = scenario.slice(scenario.indexOf("Chairs asks"), scenario.indexOf("Slots, after claims"));
  assert.ok(stair.indexOf("chairs matched the visitor stair") > 0);
  assert.ok(stair.indexOf("chairs matched the owner stair") > stair.indexOf("chairs matched the visitor stair"));
  assert.match(stair, /row\(r, "chairs_bp"\)\?\.after === true/);
  assert.doesNotMatch(stair, /cold-start|hello race/i);
  const rest = scenario.slice(scenario.indexOf("Break and entity"));
  assert.match(rest, /no active run/);
  assert.match(rest, /does not prove expedition honors cancel/);
  assert.match(rest, /armor stand is not a townsfolk/);
  assert.match(rest, /Matching-NPC cancellation is covered separately by npc-cancel\.test\.mjs/);
  assert.doesNotMatch(rest, /no initial ev\.cancel guard/);
  assert.doesNotMatch(rest, /expedition \(after claims\) saw the break cancel/);
  assert.doesNotMatch(rest, /npc_bp \(after claims\) saw the entity cancel/);
});

test("the genuine bundle runner is registered and a suite skip is not coverage", () => {
  const lines = [
    "node tools/bundle.mjs --all",
    "node tools/test-bds/hooks/full-bundle-protocols.mjs --from dist/realm_bundle.mcpack --out <stage>",
    "node tools/test-bds/run.mjs --quiet --flat --bundle <stage>/realm_bundle --scenario tools/test-bds/examples/full-bundle-protocols.js --timeout 1200",
  ];
  const hook = spawnSync(process.execPath, [path.join(harness, "hooks", "full-bundle-protocols.mjs"), "--help"], { encoding: "utf8" });
  assert.equal(hook.status, 0);
  for (const line of lines) assert.ok(hook.stdout.includes(line), line);
  assert.match(hook.stdout, /A suite skip is not coverage/);
  assert.match(hook.stdout, /official suite builds and stages this genuine bundle automatically/);
  const scenario = fs.readFileSync(path.join(harness, "examples", "full-bundle-protocols.js"), "utf8");
  for (const line of lines) assert.ok(scenario.includes(line), line);
  assert.match(scenario, /A suite skip is not coverage/);
  assert.match(scenario, /official suite builds and stages this genuine bundle automatically/);
  assert.doesNotMatch(scenario, /so this file has no suite run line/);
  assert.doesNotMatch(scenario, /skips this file/);
});

test("subscriber frames skip diag and do not require a scripts folder", async () => {
  const mod = await import("./full-bundle-protocols.mjs");
  assert.equal(typeof mod.subscriberOf, "function");
  const bare = "Error\n    at chairs_bp/main.js:154:1";
  assert.equal(mod.subscriberOf(bare).pack, "chairs_bp");
  const diagFirst = [
    "Error",
    "    at subscribe (afk_bp/diag.js:88:5)",
    "    at chairs_bp/script-events.js:12:3",
    "    at chairs_bp/main.js:40:1",
  ].join("\n");
  const named = mod.subscriberOf(diagFirst);
  assert.equal(named.pack, "chairs_bp");
  assert.notEqual(named.pack, "afk_bp");
  const win = "Error\n    at C:\\srv\\scripts\\__c13_tap\\main.js:10:1\n    at scripts\\claims_bp\\diag.js:4:1\n    at scripts\\claims_bp\\main.js:8:1";
  assert.equal(mod.subscriberOf(win).pack, "claims_bp");
  const unknown = mod.subscriberOf("Error\n    at subscribe (native)\n    at no folder here");
  assert.equal(unknown.pack, "?");
  assert.ok(unknown.trace.length > 0 && unknown.trace.length <= 240);
  assert.doesNotMatch(unknown.trace, /chairs_bp/);
  const src = mod.c13TapSource();
  assert.match(src, /subscriberOf\(/);
  assert.doesNotMatch(src, /scripts\[\\\\\/\]\(\[A-Za-z0-9_\]\+\)/);
});

test("the generated relay captures its caller when no explicit stack is supplied", async () => {
  const mod = await import("./full-bundle-protocols.mjs");
  const vm = await import("node:vm");
  const context = vm.createContext({});
  vm.runInContext(`globalThis.identify = ${mod.subscriberOf.toString()};`, context, { filename: "__c13_tap/main.js" });
  const result = vm.runInContext("identify()", context, { filename: "chairs_bp/main.js" });
  assert.equal(result.pack, "chairs_bp");
});

test("overlapping help pings stay one counted burst, not a unique-name pass", async () => {
  const mod = await import("./full-bundle-protocols.mjs");
  assert.equal(typeof mod.helpFence, "function");
  const members = ["probe_bp", "skills_bp"];
  const overlapped = [
    { id: "realm:help_ping", raw: "", tick: 120 },
    { id: "realm:help_pong", raw: "skills_bp", tick: 120 },
    { id: "realm:help_pong", raw: "probe_bp", tick: 120 },
    { id: "realm:help_ping", raw: "", tick: 121 },
    { id: "realm:help_pong", raw: "probe_bp", tick: 121 },
    { id: "realm:help_pong", raw: "skills_bp", tick: 121 },
  ];
  const early = mod.helpFence(overlapped, members, 121, 122, 5);
  assert.equal(early.complete, false);
  assert.equal(early.pings, 2);
  const done = mod.helpFence(overlapped, members, 121, 126, 5);
  assert.equal(done.complete, true);
  assert.equal(done.counts.skills_bp, 2);
  assert.equal(done.counts.probe_bp, 2);
  const oneEach = mod.helpFence([
    { id: "realm:help_ping", raw: "", tick: 1 },
    { id: "realm:help_ping", raw: "", tick: 2 },
    { id: "realm:help_pong", raw: "skills_bp", tick: 2 },
    { id: "realm:help_pong", raw: "probe_bp", tick: 2 },
  ], members, 2, 20, 5);
  assert.equal(oneEach.complete, false, "unique folders must not pass when each pack answered fewer times than the observed pings");
  assert.ok(oneEach.missing.length > 0);
  const scenario = fs.readFileSync(path.join(harness, "examples", "full-bundle-protocols.js"), "utf8");
  assert.doesNotMatch(scenario, /helps\.length === 68 && new Set\(helps\)\.size === 68/);
  assert.match(scenario, /once per observed ping/);
});

test("a Windows and a POSIX stack both name the pack that subscribed", () => {
  const dir = scratch("c13-stack-");
  const packed = path.join(dir, "src");
  writeBundle(packed);
  const report = stageFullBundleProtocols({ from: packed, outDir: path.join(dir, "out"), repoRoot: root });
  const tap = fs.readFileSync(path.join(report.packDir, "scripts", "__c13_tap", "main.js"), "utf8");
  const start = tap.indexOf("function subscriberOf");
  const fn = tap.slice(start, tap.indexOf("const watch"));
  const packOf = new Function(`${fn}; return packOf;`)();
  const win = "Error\n    at signal.subscribe (C:\\srv\\scripts\\__c13_tap\\main.js:10:1)\n    at scripts\\claims_bp\\diag.js:4:1\n    at scripts\\claims_bp\\main.js:8:1";
  const posix = "Error\n    at scripts/__c13_tap/main.js:10:1\n    at scripts/chairs_bp/main.js:2:1";
  assert.equal(packOf(win), "claims_bp");
  assert.equal(packOf(posix), "chairs_bp");
});
