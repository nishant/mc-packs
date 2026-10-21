// Minimap hot paths (packs/map_bp/scripts/budget.js): which players a pass serves each tick, chosen with one lookup per
// player instead of sorting everyone waiting. This counts work and checks choices; it cannot show milliseconds, which
// only a native profile of the bundle can.
//   node --test tools/map-hotpaths.test.mjs
//   MAP_HOTPATHS_RED=1 node --test tools/map-hotpaths.test.mjs   (the old sort-everyone code: the work bound fails)
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { oldestDue } from "../packs/map_bp/scripts/budget.js";

/** What main.js did before: collect everyone due, then sort all of them by wait. */
function legacyDue(players, passAt, now, interval, each) {
  let due = [];
  for (const p of players) if (now - (passAt.get(p.id) ?? -Infinity) >= interval) due.push(p);
  if (due.length > each) due = due.sort((a, b) => (passAt.get(a.id) ?? -Infinity) - (passAt.get(b.id) ?? -Infinity)).slice(0, each);
  return due;
}
const pick = process.env.MAP_HOTPATHS_RED ? legacyDue : oldestDue;

/** A Map that counts its reads. */
function countingMap(entries) {
  const m = new Map(entries);
  m.reads = 0;
  const get = m.get.bind(m);
  m.get = (k) => (m.reads++, get(k));
  return m;
}
/** A small seeded generator, so a failure repeats. */
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("a saturated pass tick reads each player's last pass once, however many are waiting", () => {
  const players = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` }));
  const passAt = countingMap(players.map((p, i) => [p.id, 1000 - 50 - (i % 17)]));
  const chosen = pick(players, passAt, 1000, 10, 2);
  assert.equal(chosen.length, 2);
  assert.ok(passAt.reads <= players.length, `${passAt.reads} lookups for ${players.length} players`);
});

test("the choice is the same as sorting everyone: longest-waiting first, new players before all, ties in list order", () => {
  const rand = rng(7);
  for (let round = 0; round < 500; round++) {
    const n = 1 + Math.floor(rand() * 45);
    const now = 200 + Math.floor(rand() * 50);
    const players = Array.from({ length: n }, (_, i) => ({ id: `q${i}` }));
    const passAt = new Map();
    for (const p of players) {
      const r = rand();
      if (r < 0.2) continue; // never served
      passAt.set(p.id, now - Math.floor(rand() * 25)); // some not yet due, many tied
    }
    const each = 1 + Math.floor(rand() * 3);
    const want = legacyDue(players, passAt, now, 10, each).map((p) => p.id);
    const got = oldestDue(players, passAt, now, 10, each).map((p) => p.id);
    assert.deepEqual(got, want, `round ${round}: ${n} players, ${each} each`);
  }
});

test("nobody due gives nothing, and fewer due than fit keep their list order even if a later one waited longer", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(oldestDue(players, new Map([["a", 95], ["b", 96], ["c", 97]]), 100, 10, 2), []);
  assert.deepEqual(oldestDue(players, new Map([["a", 90], ["b", 80], ["c", 99]]), 100, 10, 2).map((p) => p.id), ["a", "b"]);
});

// The tests below run the real callbacks and helpers cut out of main.js (not copies), with stubbed game objects.
const mainSource = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("a cached player who left is not resolved as an online waypoint target", () => {
  const declaration = mainSource.match(/^const onlineById = .+;$/m)?.[0];
  assert.ok(declaration, "the real online target resolver exists");
  const resolve = vm.runInNewContext(`${declaration}\nonlineById`);
  const gone = { id: "gone", isValid: false, get location() { throw new Error("offline"); } };
  const here = { id: "here", isValid: true };
  assert.equal(resolve("gone", [gone, here]), undefined);
  assert.equal(resolve("here", [gone, here]), here);
});
/** The n-th top-level system.runInterval callback of main.js, as a function expression's source. */
function callbackSource(n) {
  let at = -1;
  for (let i = 0; i <= n; i++) at = mainSource.indexOf("\nsystem.runInterval(", at + 1);
  const end = mainSource.indexOf("\n}, 1);", at);
  assert.ok(at >= 0 && end > at, `interval ${n} found`);
  return mainSource.slice(at + 1 + "system.runInterval(".length, end + 2);
}
const okBudget = () => ({ tick() {}, ok: true, spend() {}, left: 100, room: 100 });

test("the real pass callback never recreates a left player's entry, nor passes one that left between callbacks", () => {
  const playersNowSrc = mainSource.match(/let playersTick = -1;[\s\S]*?\n\}\n/)[0];
  const mk = (id) => ({ id, isValid: true, location: { x: 0, z: 0 }, dimension: { id: "d" } });
  const alive = mk("a");
  const left = mk("b");
  const passed = [];
  // 12 online, so two passes a tick; the others had theirs a tick ago.
  const fillers = Array.from({ length: 10 }, (_, i) => mk("f" + i));
  const passAt = new Map(fillers.map((p) => [p.id, 99]));
  const sandbox = {
    world: { getAllPlayers: () => [left, alive, ...fillers] }, system: { currentTick: 100 }, Date, console,
    passBudget: okBudget(), oldestDue, passAt, INTERVAL: 10, PASS_EACH: 2, partyTag: () => undefined,
    pass: (p) => passed.push(p.id),
  };
  const run = vm.runInNewContext(`${playersNowSrc}\nlet seenAt = -Infinity, seen = [], costPasses = 0;\n(${callbackSource(2)})`, sandbox);
  // The scan callback of the same tick read the list while both were online; b leaves before the pass callback runs.
  sandbox.system.currentTick = 100;
  vm.runInNewContext("playersNow()", sandbox);
  left.isValid = false;
  run();
  assert.deepEqual(passed, ["a"], "the player who left is never passed");
  assert.ok(!passAt.has("b"), "and no permanent entry is made for them (the leave handler already ran)");
  assert.ok(passAt.has("a"));
});

test("the real redraw callback reads the facing only when its checks need it, and render() reads it otherwise inside the draw budget", () => {
  const facing = [];
  const renders = [];
  const mkView = (id, extra) => ({ player: { id, isValid: true, dimension: { id: "d" }, location: { x: 0, y: 0, z: 0 } }, dim: "d", px: 0, pz: 0, heading: 0, x: 0, y: 0, z: 0, radar: false, terrain: false, ...extra });
  const views = new Map([["dirty", mkView("dirty", { dirty: true })], ["still", mkView("still", {})], ["turned", mkView("turned", {})]]);
  const facingOf = { dirty: 90, still: 0, turned: 30 };
  const sandbox = {
    drawBudget: okBudget(), rebuildBudget: okBudget(), views, TURN_CHECKS: 12, TURN_BUDGET: 8, RENDER_BUDGET: 10, TURN_MIN: 2, MOVE_MIN: 0.5, FAR_MOVE: 256, REFRESH: 30,
    system: { currentTick: 50 }, Date, console, lastSent: new Map(), planNow: new Set(), terrainVerOf: () => "v",
    wrap: (a) => a, headingOf: (p) => (facing.push(p.id), facingOf[p.id]),
    render: (p, v, now, refresh, heading, at) => (renders.push({ id: p.id, heading, at }), false),
  };
  const run = vm.runInNewContext(`let turnFirst = 0, turnMs = 0, turnTicks = 0, turnDraws = 0, turnSends = 0, refreshSends = 0, turnCheckMs = 0;\n(${callbackSource(1)})`, sandbox);
  run();
  assert.ok(!facing.includes("dirty"), "a dirty view's check does not read the facing");
  assert.equal(renders.find((r) => r.id === "dirty").heading, undefined, "render() reads it for a dirty view, inside the draw budget");
  assert.equal(renders.find((r) => r.id === "turned").heading, 30, "a view whose check needed it passes what it read (no second read)");
  assert.ok(renders.find((r) => r.id === "turned").at, "the position read by the check is passed along");
  assert.ok(!renders.some((r) => r.id === "still"), "a view that did not move is not drawn");
});

test("the real redraw callback refreshes a still player's title without building the strip and radar again (W1/O5)", () => {
  const renders = [];
  const kept = [];
  const mkView = (id, extra) => ({ player: { id, isValid: true, dimension: { id: "d" }, location: { x: 0, y: 0, z: 0 } }, dim: "d", px: 0, pz: 0, heading: 0, x: 0, y: 0, z: 0, radar: true, terrain: false, drawn: 0, ...extra });
  const views = new Map([["still", mkView("still", {})], ["turned", mkView("turned", {})], ["lagging", mkView("lagging", { lag: true })]]);
  const facingOf = { still: 0, turned: 30, lagging: 0 };
  // Every part was sent 40 ticks ago: all three are due a refresh.
  const lastSent = new Map([...views.keys()].map((id) => [id, { ctext: "c", cat: 10, rtext: "r", rat: 10, compass: true, radar: true }]));
  const sandbox = {
    drawBudget: okBudget(), rebuildBudget: okBudget(), views, TURN_CHECKS: 12, TURN_BUDGET: 8, RENDER_BUDGET: 10, TURN_MIN: 2, MOVE_MIN: 0.5, FAR_MOVE: 256, REFRESH: 30,
    system: { currentTick: 50 }, Date, console, lastSent, planNow: new Set(), terrainVerOf: () => undefined,
    wrap: (a) => a, headingOf: (p) => facingOf[p.id],
    render: (p) => (renders.push(p.id), true),
    keepAlive: (p) => (kept.push(p.id), true),
  };
  const run = vm.runInNewContext(`let turnFirst = 0, turnMs = 0, turnTicks = 0, turnDraws = 0, turnSends = 0, refreshSends = 0, keepSends = 0, turnCheckMs = 0;\n(${callbackSource(1)})`, sandbox);
  run();
  assert.deepEqual(kept, ["still"], "the still player's title is drawn again as it is");
  assert.ok(!renders.includes("still"), "without building their strip and radar");
  assert.ok(renders.includes("turned"), "a player who turned is built again");
  assert.ok(renders.includes("lagging"), "a radar waiting for its terrain is built again");
});

test("out of draw budget, a moving player's title about to fade is drawn again as it is, and fades for no one (O5)", () => {
  const renders = [];
  const kept = [];
  const mkView = (id, extra) => ({ player: { id, isValid: true, dimension: { id: "d" }, location: { x: 5, y: 0, z: 0 } }, dim: "d", px: 0, pz: 0, heading: 0, x: 0, y: 0, z: 0, radar: true, terrain: false, drawn: 45, ...extra });
  // Both walked 5 blocks since their last draw; "fading" was last sent 31 ticks ago, "fresh" 2 ticks ago.
  const views = new Map([["fresh", mkView("fresh", { drawn: 10 })], ["fading", mkView("fading", {})]]);
  const lastSent = new Map([
    ["fresh", { ctext: "c", cat: 48, rtext: "r", rat: 48, compass: true, radar: true }],
    ["fading", { ctext: "c", cat: 19, rtext: "r", rat: 19, compass: true, radar: true }],
  ]);
  const spent = { ...okBudget(), ok: false, left: -1, room: 0 };
  const sandbox = {
    drawBudget: spent, rebuildBudget: okBudget(), views, TURN_CHECKS: 12, TURN_BUDGET: 8, RENDER_BUDGET: 10, TURN_MIN: 2, MOVE_MIN: 0.5, FAR_MOVE: 256, REFRESH: 30,
    system: { currentTick: 50 }, Date, console, lastSent, planNow: new Set(), terrainVerOf: () => undefined,
    wrap: (a) => a, headingOf: () => 0,
    render: (p) => (renders.push(p.id), true),
    keepAlive: (p, v, now) => (kept.push(p.id), (v.drawn = now), true),
  };
  const run = vm.runInNewContext(`let turnFirst = 0, turnMs = 0, turnTicks = 0, turnDraws = 0, turnSends = 0, refreshSends = 0, keepSends = 0, turnCheckMs = 0;\n(${callbackSource(1)})`, sandbox);
  run();
  assert.deepEqual(kept, ["fading"], "the title about to fade is drawn again although the budget is spent");
  assert.deepEqual(renders, [], "nothing is built without budget");
  assert.equal(views.get("fading").drawn, 45, "and it keeps its place in the queue: it is still due to be built");
});

test("titles about to fade are drawn before players who waited longer for a redraw (O5)", () => {
  const order = [];
  const mkView = (id, extra) => ({ player: { id, isValid: true, dimension: { id: "d" }, location: { x: 5, y: 0, z: 0 } }, dim: "d", px: 0, pz: 0, heading: 0, x: 0, y: 0, z: 0, radar: false, terrain: false, ...extra });
  const views = new Map([["waited", mkView("waited", { drawn: 1 })], ["fading", mkView("fading", { drawn: 40 })]]);
  const lastSent = new Map([
    ["waited", { ctext: "c", cat: 45, rtext: "", rat: 45, compass: true, radar: false }],
    ["fading", { ctext: "c", cat: 19, rtext: "", rat: 19, compass: true, radar: false }],
  ]);
  const sandbox = {
    drawBudget: okBudget(), rebuildBudget: okBudget(), views, TURN_CHECKS: 12, TURN_BUDGET: 8, RENDER_BUDGET: 10, TURN_MIN: 2, MOVE_MIN: 0.5, FAR_MOVE: 256, REFRESH: 30,
    system: { currentTick: 50 }, Date, console, lastSent, planNow: new Set(), terrainVerOf: () => undefined,
    wrap: (a) => a, headingOf: () => 0,
    render: (p) => (order.push(p.id), true),
    keepAlive: (p) => (order.push(p.id), true),
  };
  const run = vm.runInNewContext(`let turnFirst = 0, turnMs = 0, turnTicks = 0, turnDraws = 0, turnSends = 0, refreshSends = 0, keepSends = 0, turnCheckMs = 0;\n(${callbackSource(1)})`, sandbox);
  run();
  assert.deepEqual(order, ["fading", "waited"]);
});

test("a still player's refresh builds the radar when their 200-tick stale rebuild came up, so old terrain is read again (map-flight)", () => {
  const renders = [];
  const kept = [];
  const mkView = (id) => ({ player: { id, isValid: true, dimension: { id: "d" }, location: { x: 0, y: 0, z: 0 } }, dim: "d", px: 0, pz: 0, heading: 0, x: 0, y: 0, z: 0, radar: true, terrain: true, tv: "v", drawn: 0 });
  const views = new Map([["due", mkView("due")], ["fresh", mkView("fresh")]]);
  const lastSent = new Map([...views.keys()].map((id) => [id, { ctext: "c", cat: 10, rtext: "r", rat: 10, compass: true, radar: true }]));
  const sandbox = {
    drawBudget: okBudget(), rebuildBudget: okBudget(), views, TURN_CHECKS: 12, TURN_BUDGET: 8, RENDER_BUDGET: 10, TURN_MIN: 2, MOVE_MIN: 0.5, FAR_MOVE: 256, REFRESH: 30,
    system: { currentTick: 50 }, Date, console, lastSent, planNow: new Set(), terrainVerOf: () => "v",
    wrap: (a) => a, headingOf: () => 0, staleDue: (id) => id === "due",
    render: (p) => (renders.push(p.id), true),
    keepAlive: (p) => (kept.push(p.id), true),
  };
  const run = vm.runInNewContext(`let turnFirst = 0, turnMs = 0, turnTicks = 0, turnDraws = 0, turnSends = 0, refreshSends = 0, keepSends = 0, turnCheckMs = 0;\n(${callbackSource(1)})`, sandbox);
  run();
  assert.deepEqual(renders, ["due"], "the player whose stale rebuild is due is built");
  assert.deepEqual(kept, ["fresh"], "the other still player is only drawn again");
});

/** A top-level function of main.js (from `function name(` to its closing brace at the start of a line). */
function functionSource(name) {
  const at = mainSource.indexOf(`\nfunction ${name}(`);
  const end = mainSource.indexOf("\n}\n", at);
  assert.ok(at >= 0 && end > at, `function ${name} found`);
  return mainSource.slice(at + 1, end + 2);
}

test("the real keepAlive builds both parts again when one of them ran out, instead of keeping only the other (W1/O5)", () => {
  // The strip was sent at 0 and the radar at 15; a real title held the screen until after the strip ran out (40).
  const sent = { ctext: "c", cat: 0, rtext: "r", rat: 15, compass: true, radar: true };
  const up = new Set(["radar"]);
  const renders = [];
  const sandbox = {
    lastSent: new Map([["p", sent]]), HOLD: 40, Date, drawMs: 0,
    side: {
      held: () => false,
      // side.keep: false when nothing of ours is up, or (with parts) when one named part isn't.
      keep: (_p, _t, parts) => (parts ? parts.every((x) => up.has(x || "top")) : up.size > 0),
      // render() shows a part whose text differs from what was sent, or that is due its refresh.
    },
    render: (_p, _v, now, refresh) => (renders.push({ now, refresh, ctext: sent.ctext, rtext: sent.rtext }), true),
  };
  const keepAlive = vm.runInNewContext(`${functionSource("keepAlive")}\nkeepAlive`, sandbox);
  const v = { drawn: 0 };
  assert.equal(keepAlive({ id: "p" }, v, 50), true);
  assert.equal(renders.length, 1, "the strip is built and sent again");
  assert.notEqual(renders[0].ctext, "c", "render sees the strip as not sent, so it shows it");
  assert.equal(sent.cat, 0, "the strip is not stamped as kept");
  // Both up: a plain keep, no build.
  up.add("top");
  sent.ctext = "c";
  sent.rtext = "r";
  assert.equal(keepAlive({ id: "p" }, v, 80), true);
  assert.equal(renders.length, 1, "kept without building");
  assert.equal(sent.cat, 80);
  assert.equal(sent.rat, 80);
});

test("the real pass draws again only when it found something new: a still player's pass builds no strip and radar (W1/O5)", () => {
  const helpers = mainSource.includes("function sameMarkers(") ? `${mainSource.match(/^const MARKER_SLACK = .+;$/m)[0]}\n${functionSource("sameMarkers")}` : "";
  const markers = () => [{ kind: "mob", x: 10.2, z: -4, clamp: true }, { kind: "folk", x: 3, z: 3, clamp: false }];
  let found = markers();
  const views = new Map();
  const lastSent = new Map([["p", { ctext: "c", cat: 0, rtext: "r", rat: 0, compass: true, radar: true }]]);
  const player = { id: "p", location: { x: 0, y: 64, z: 0 }, dimension: { id: "minecraft:overworld" } };
  const sandbox = {
    prefsOf: () => ({ compass: true, radar: true, radius: 24, north: false, terrain: true }), get: () => true, lastSent, views, Date,
    gather: () => ({ markers: found, liveFolk: new Map() }), destination: () => undefined, arrival: () => undefined, arrived: new Map(),
    regions: new Map(), line2: (r, d) => `${r}|${d}`, OVERWORLD: "minecraft:overworld", DIM_NAMES: {}, G: {}, cutWords: (t) => t, costMs: 0, costPlayers: 0,
    side: { clear() {}, redraw() {} }, Math,
  };
  const pass = vm.runInNewContext(`${helpers}\n${functionSource("pass")}\npass`, sandbox);
  pass(player, [player], [], 10);
  assert.equal(views.get("p").dirty, true, "the first pass draws");
  // The redraw drew it (render marks it clean and records what it drew).
  const drawn = views.get("p");
  drawn.dirty = false;
  drawn.shown = drawn.markers;
  drawn.shownSecond = drawn.second;
  found = markers();
  pass(player, [player], [], 20);
  assert.equal(views.get("p").dirty, false, "a pass that finds the same markers and line draws nothing");
  found = markers();
  found[0].x += 0.1;
  pass(player, [player], [], 30);
  assert.equal(views.get("p").dirty, false, "nor one where a marker moved less than a fraction of a cell");
  found = markers();
  found[0].x += 3;
  pass(player, [player], [], 40);
  assert.equal(views.get("p").dirty, true, "a marker that moved draws again");
});

test("the 200-tick radar rebuild is spread over the ticks by player, not one wave for everyone (O10)", () => {
  const radar = functionSource("radarOf");
  const bucket = radar.match(/Math\.floor\(\(?now[^`]*?\/ STALE_EVERY\)/)?.[0];
  assert.ok(bucket, "radarOf's key has a STALE_EVERY bucket");
  assert.ok(mainSource.includes("function staleSlot("), "each player has a turn (staleSlot)");
  const staleSlot = vm.runInNewContext(`${mainSource.match(/^const STALE_EVERY = .+;$/m)[0]}\n${functionSource("staleSlot")}\nstaleSlot`);
  const ids = Array.from({ length: 40 }, (_, i) => String(-4294967295 + i * 7919));
  const at = (id, now) => vm.runInNewContext(bucket, { now, memo: { slot: staleSlot(id) }, STALE_EVERY: 200, Math });
  let most = 0;
  for (let now = 1; now <= 400; now++) {
    const turned = ids.filter((id) => at(id, now) !== at(id, now - 1)).length;
    most = Math.max(most, turned);
  }
  assert.ok(most <= 4, `at most ${most} of 40 players' rebuilds fall on one tick (all 40 before)`);
});

test("a jump keeps a roofed player's cave layer, so the scanner doesn't read a new layer from nothing (O1)", async () => {
  const terrainMod = await import("../packs/map_bp/scripts/terrain.js");
  const keep = mainSource.match(/^const LAYER_KEEP = .+;$/m)?.[0] ?? "";
  const terrain = new terrainMod.TerrainWorld(6000, 24);
  const scanPlans = new Map();
  const playerStore = new Map();
  const sandbox = {
    terrain, scanPlans, playerStore, lastPose: new Map(), terrainBaseMemo: new Map(), planTurn: { left: 2, made: 0 }, retryAt: new Map(),
    prefsOf: () => ({ radar: true, terrain: true, radius: 24 }), colKey: terrainMod.colKey, aheadPicks: terrainMod.aheadPicks, MISS_RETRY: terrainMod.MISS_RETRY,
    SCAN_MAX_AGE: 2400, PLAN_MIN_AGE: 4, Math,
  };
  const planFor = vm.runInNewContext(`${keep}\n${functionSource("planFor")}\nplanFor`, sandbox);
  const nether = { id: "minecraft:nether" };
  const p = { id: "p", isValid: true, dimension: nether, location: { x: 0.5, y: 40, z: 0.5 }, isOnGround: true, getVelocity: () => ({ x: 0, y: 0, z: 0 }) };
  planFor(p, 100);
  assert.equal(playerStore.get("p").id, "minecraft:nether|layer40");
  // Mid-jump, a block higher.
  p.location = { x: 0.5, y: 41.2, z: 0.5 };
  p.isOnGround = false;
  planFor(p, 110);
  assert.equal(playerStore.get("p").id, "minecraft:nether|layer40", "a jump keeps the layer they stand on");
  // Landed on a step a block up: the new layer.
  p.location = { x: 1.5, y: 41, z: 0.5 };
  p.isOnGround = true;
  planFor(p, 120);
  assert.equal(playerStore.get("p").id, "minecraft:nether|layer41");
  // Falling far: the layer follows at once.
  p.location = { x: 1.5, y: 30, z: 0.5 };
  p.isOnGround = false;
  planFor(p, 130);
  assert.equal(playerStore.get("p").id, "minecraft:nether|layer30");
});

test("a title about to fade is refreshed on time even when it isn't the player's turn to be checked (O5, 100 players)", () => {
  const kept = [];
  const mkView = (id) => ({ player: { id, isValid: true, dimension: { id: "d" }, location: { x: 0, y: 0, z: 0 } }, dim: "d", px: 0, pz: 0, heading: 0, x: 0, y: 0, z: 0, radar: true, terrain: false, drawn: 0 });
  const views = new Map(Array.from({ length: 100 }, (_, i) => [`p${i}`, mkView(`p${i}`)]));
  // Everyone was sent a moment ago but p90, whose parts are 30 ticks old.
  const lastSent = new Map([...views.keys()].map((id) => [id, { ctext: "c", cat: id === "p90" ? 20 : 49, rtext: "r", rat: id === "p90" ? 20 : 49, compass: true, radar: true }]));
  const sandbox = {
    drawBudget: okBudget(), rebuildBudget: okBudget(), views, TURN_CHECKS: 12, TURN_BUDGET: 8, RENDER_BUDGET: 10, TURN_MIN: 2, MOVE_MIN: 0.5, FAR_MOVE: 256, REFRESH: 30,
    system: { currentTick: 50 }, Date, console, lastSent, planNow: new Set(), terrainVerOf: () => undefined,
    wrap: (a) => a, headingOf: () => 0, render: () => true, keepAlive: (p) => (kept.push(p.id), true),
  };
  const run = vm.runInNewContext(`let turnFirst = 0, turnMs = 0, turnTicks = 0, turnDraws = 0, turnSends = 0, refreshSends = 0, keepSends = 0, turnCheckMs = 0;\n(${callbackSource(1)})`, sandbox);
  run();
  assert.deepEqual(kept, ["p90"], "p90 (outside this tick's 12 checks) is refreshed now");
});
