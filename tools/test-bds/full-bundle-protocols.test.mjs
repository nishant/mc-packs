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

test("a Windows and a POSIX stack both name the pack that subscribed", () => {
  const dir = scratch("c13-stack-");
  const packed = path.join(dir, "src");
  writeBundle(packed);
  const report = stageFullBundleProtocols({ from: packed, outDir: path.join(dir, "out"), repoRoot: root });
  const tap = fs.readFileSync(path.join(report.packDir, "scripts", "__c13_tap", "main.js"), "utf8");
  const start = tap.indexOf("const packOf");
  const fn = tap.slice(start, tap.indexOf("const watch"));
  const packOf = new Function(`${fn}; return packOf;`)();
  const win = "Error\n    at signal.subscribe (C:\\srv\\scripts\\__c13_tap\\main.js:10:1)\n    at scripts\\claims_bp\\diag.js:4:1\n    at scripts\\claims_bp\\main.js:8:1";
  const posix = "Error\n    at scripts/__c13_tap/main.js:10:1\n    at scripts/chairs_bp/main.js:2:1";
  assert.equal(packOf(win), "claims_bp");
  assert.equal(packOf(posix), "chairs_bp");
});
