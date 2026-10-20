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
