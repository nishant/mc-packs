// Offline operation accounting only. This does not measure native BDS CPU or rendered acceptance.
// Run with Node 24: node tools/map-perf-analysis.mjs [--ticks 80]
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import { fixture, main } from "./map-movement-fixture.mjs";
import { SPEED, BALANCED } from "../packs/map_bp/scripts/map-profile.js";
import { circleAnchors } from "../packs/map_bp/scripts/terrain-work.js";
import { sampleCoord, colKey } from "../packs/map_bp/scripts/terrain.js";

export const EVIDENCE_KIND = "VM operation accounting; NOT native CPU or client evidence";
const sha256 = text => crypto.createHash("sha256").update(text).digest("hex");
const COUNTER_KEY = "__MAP_PERF_ANALYSIS__";
const moduleNames = ["manual-scanner.js", "terrain.js", "terrain-work.js", "map-profile.js"];
function makeTarget(root, mainSource, fixtureFactory, profiles, geometry) {
  const mainBytes = fs.readFileSync(path.join(root, "packs/map_bp/scripts/main.js"));
  assert.equal(mainBytes.toString("utf8").replace(/\r\n/g, "\n"), mainSource, "fixture main must still match selected source; retry after the writer freezes");
  return {
    root, main: mainSource, fixture: fixtureFactory, profiles, geometry,
    mainSha256: sha256(mainBytes), mainNormalizedSha256: sha256(mainSource),
    fixtureSha256: sha256(fs.readFileSync(path.join(root, "tools/map-movement-fixture.mjs"))),
    moduleHashes: Object.fromEntries(moduleNames.map(name => [name, sha256(fs.readFileSync(path.join(root, "packs/map_bp/scripts", name)))])),
  };
}
const LOCAL_TARGET = makeTarget(fileURLToPath(new URL("../", import.meta.url)), main, fixture, [SPEED, BALANCED], { circleAnchors, sampleCoord, colKey });

/** Load a frozen/previous source root read-only, including its own actual fixture and production imports. */
export async function loadProbeTarget(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const fixtureModule = await import(pathToFileURL(path.join(root, "tools/map-movement-fixture.mjs")).href);
  const profiles = await import(pathToFileURL(path.join(root, "packs/map_bp/scripts/map-profile.js")).href);
  const work = await import(pathToFileURL(path.join(root, "packs/map_bp/scripts/terrain-work.js")).href);
  const terrain = await import(pathToFileURL(path.join(root, "packs/map_bp/scripts/terrain.js")).href);
  assert.equal(typeof fixtureModule.fixture, "function");
  assert.equal(typeof fixtureModule.main, "string");
  return makeTarget(root, fixtureModule.main, fixtureModule.fixture, [profiles.SPEED, profiles.BALANCED], { circleAnchors: work.circleAnchors, sampleCoord: terrain.sampleCoord, colKey: terrain.colKey });
}

/** Instrument parsed function bodies in memory; never writes the production source. */
export function instrumentMain(source) {
  const ast = ts.createSourceFile("main.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const insertions = [];
  const found = { planFor: 0, planAdd: 0, labCoverage: 0, radarOf: 0 };
  const add = (body, expression) => insertions.push({ at: body.getStart(ast) + 1, text: expression });
  const visit = (node, inPlanner = false) => {
    let planner = inPlanner;
    if (ts.isFunctionDeclaration(node)) {
      planner = node.name?.text === "planFor";
      if (node.body && planner) {
        found.planFor++;
        add(node.body, `globalThis.${COUNTER_KEY}.planCalls++;`);
      } else if (node.body && node.name?.text === "labCoverage") {
        found.labCoverage++;
        add(node.body, `globalThis.${COUNTER_KEY}.coverageCalls++;globalThis.${COUNTER_KEY}.coverageFlagVisits+=flags.length;`);
      } else if (node.body && node.name?.text === "radarOf") {
        found.radarOf++;
        add(node.body, `globalThis.${COUNTER_KEY}.radarCalls++;`);
      }
    }
    if (planner && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "add" && node.initializer && ts.isArrowFunction(node.initializer) && ts.isBlock(node.initializer.body)) {
      found.planAdd++;
      add(node.initializer.body, `globalThis.${COUNTER_KEY}.planAddVisits++;`);
    }
    ts.forEachChild(node, child => visit(child, planner));
  };
  visit(ast);
  assert.equal(found.planFor, 1, "instrument the actual planner exactly once");
  for (const insertion of insertions.sort((a, b) => b.at - a.at)) source = source.slice(0, insertion.at) + insertion.text + source.slice(insertion.at);
  return { source, found };
}

function validate(count, ticks) {
  assert.ok(count === 10 || count === 40, "only owner-approved 10/40 populations");
  assert.ok(Number.isSafeInteger(ticks) && ticks > 0 && ticks <= 1000, "bounded 1..1000 tick probe");
}
function resetReads(f) {
  for (const p of f.roster) for (const key of Object.keys(p.reads)) p.reads[key] = 0;
}
function totalReads(f) {
  const result = {};
  for (const p of f.roster) for (const [key, value] of Object.entries(p.reads)) result[key] = (result[key] ?? 0) + value;
  return result;
}
function activeViewers(f) {
  return f.roster.filter(p => { const prefs = f.api.prefsOf(p); return prefs.radar && prefs.terrain; }).length;
}

/** All viewers are explicitly radar+terrain ON. Fresh shared data isolates planning from native demand. */
export function runPlannerProbe({ count, profile = BALANCED, ticks = 80, target = LOCAL_TARGET } = {}) {
  validate(count, ticks);
  const instrumentation = instrumentMain(target.main);
  const f = target.fixture(count, { profile, mainSource: instrumentation.source });
  const counters = { planCalls: 0, planAddVisits: 0, coverageCalls: 0, coverageFlagVisits: 0, radarCalls: 0 };
  f.context[COUNTER_KEY] = counters;
  f.emit("worldLoad");
  assert.equal(activeViewers(f), count);
  const store = f.api.terrain.store("minecraft:overworld");
  for (const anchor of target.geometry.circleAnchors(f.roster[0].state.at, 36, target.geometry.sampleCoord, target.geometry.colKey)) {
    f.api.terrain.put(store, anchor.x, anchor.z, { kind: "stone", y: 64, depth: 0 }, 1);
  }
  resetReads(f);
  for (let tick = 2; tick <= ticks + 1; tick++) f.scan(tick);
  return {
    kind: EVIDENCE_KIND, case: "fresh-stationary-shared-circle-scanner", profile: profile.id,
    viewers: count, radarTerrainOn: activeViewers(f), ticks, mainSha256: target.mainSha256,
    instrumented: instrumentation.found, ...counters,
    planBuilds: f.api.counters().plansMade, nativeOperations: f.api.queue.nativeAttempt,
    nativeCols: store.cols.size, maxCols: f.api.terrain.maxCols,
    pendingPicks: [...f.api.scanPlans.values()].reduce((sum, plan) => sum + plan.picks.length - plan.pos, 0),
    nativeGetterAccesses: totalReads(f),
  };
}

/** Count production synchronize() accesses with no jobs, or one retained fixed-origin manual job. */
export function runRetentionProbe({ count, profile = BALANCED, ticks = 80, activeJob = false, target = LOCAL_TARGET } = {}) {
  validate(count, ticks);
  const f = target.fixture(count, { profile });
  assert.equal(activeViewers(f), count);
  if (activeJob) f.api.manualScans.start(f.roster[0], 4, 1);
  resetReads(f);
  for (let tick = 2; tick <= ticks + 1; tick++) {
    f.context.system.currentTick = tick;
    f.api.manualScans.synchronize(f.roster, tick);
  }
  return {
    kind: EVIDENCE_KIND, case: activeJob ? "retention-with-manual-job" : "retention-without-manual-job",
    profile: profile.id, viewers: count, radarTerrainOn: activeViewers(f), ticks, mainSha256: target.mainSha256,
    nativeGetterAccesses: totalReads(f), maxCols: f.api.terrain.maxCols,
    retainedFootprints: f.api.terrain.retained.size, activeJobs: f.api.manualScans.contexts.size,
    nativeOperations: f.api.queue.nativeAttempt,
  };
}

/** Proposed contract ONLY, not production code: create a new reader for every scanner invocation.
 * Cache failed reads too. A tick-scoped singleton would be wrong when invoked twice in one tick.
 */
export function invocationSnapshotReader(read) {
  const snapshots = new Map();
  return player => {
    if (snapshots.has(player)) return snapshots.get(player);
    let snapshot;
    try { snapshot = read(player); } catch { snapshot = undefined; }
    snapshots.set(player, snapshot);
    return snapshot;
  };
}

export function sourceProvenance(target = LOCAL_TARGET) {
  return {
    kind: EVIDENCE_KIND, sourceRoot: target.root, mainSha256: target.mainSha256,
    mainNormalizedSha256: target.mainNormalizedSha256, fixtureSha256: target.fixtureSha256,
    moduleHashes: target.moduleHashes,
    note: "Source snapshot, not native benchmark acceptance. Fixture clock does not model elapsed CPU. Freeze the root externally for a baseline.",
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let ticks = 80, target = LOCAL_TARGET;
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(i + 1 < args.length, "each probe option needs a value");
    if (args[i] === "--ticks") ticks = Number(args[i + 1]);
    else if (args[i] === "--source-root") target = await loadProbeTarget(args[i + 1]);
    else throw new Error("usage: node tools/map-perf-analysis.mjs [--ticks 80] [--source-root <frozen-root>]");
  }
  console.log(JSON.stringify(sourceProvenance(target)));
  for (const profile of target.profiles) for (const count of [10, 40]) {
    console.log(JSON.stringify(runPlannerProbe({ count, profile, ticks, target })));
    for (const activeJob of [false, true]) console.log(JSON.stringify(runRetentionProbe({ count, profile, ticks, activeJob, target })));
  }
}
