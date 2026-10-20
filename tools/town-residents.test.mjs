// Town Projects' residents (packs/town_bp/scripts/residents.js, its use in main.js and the villager_v2 override):
// slots per level (level 1's two only with the well), homes, the world cap's priority, replacement due in in-game
// ticks, the census (missing twice, strays and duplicates untagged, never killed), moves, the saved record, the
// entity file's one added group and event, and main.js's death and tap handlers run in vm.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { CONFIG } from "../packs/town_bp/scripts/config.js";
import {
  LOOKS,
  MISS_LIMIT,
  HOME_LEASH,
  NEW_KEEP,
  RESIDENT_MAX,
  TICKS_PER_MINUTE,
  WELL_LOOKS,
  addNew,
  allocate,
  homeAt,
  homesFor,
  livingOf,
  lookEvent,
  lookFor,
  pickName,
  plan,
  readResidents,
  reconcile,
  ridOf,
  ridTag,
  slotCount,
} from "../packs/town_bp/scripts/residents.js";

const root = path.join(import.meta.dirname, "..");
const main = fs.readFileSync(path.join(root, "packs", "town_bp", "scripts", "main.js"), "utf8");
const villager = JSON.parse(fs.readFileSync(path.join(root, "packs", "town_bp", "entities", "villager_v2.json"), "utf8"));
const PER = CONFIG.residentsPerLevel;

test("slots per level: level 1's two only once the well is built, the caps", () => {
  assert.deepEqual(PER, [2, 4, 6, 8, 10]);
  assert.equal(slotCount(1, false, PER, 10), 0, "no well, nobody");
  assert.equal(slotCount(1, true, PER, 10), 2);
  assert.deepEqual([2, 3, 4, 5].map((l) => slotCount(l, true, PER, 10)), [4, 6, 8, 10]);
  assert.equal(slotCount(2, false, PER, 10), 4, "from level 2 the houses are the homes");
  assert.equal(slotCount(5, true, PER, 6), 6, "residentCapTown");
  assert.equal(slotCount(5, true, [2, 4, 6, 8, 40], 99), RESIDENT_MAX, "never more than 10");
  assert.equal(slotCount(1, true, [5], 10), 2, "the well has room for 2");
  assert.equal(slotCount(7, true, PER, 10), 10, "past the list: its last entry");
  assert.equal(slotCount(3, true, [], 10), 0);
});

test("homes: a family's own house, else the well for the first two, else none yet", () => {
  const built = (ids) => (h) => ids.includes(h);
  assert.deepEqual(homesFor(2, built(["well"])), ["well", "well"]);
  assert.deepEqual(homesFor(4, built(["well", "house_1", "house_3"])), ["house_1", "well", "house_3", undefined]);
  assert.deepEqual(homesFor(4, built([])), [undefined, undefined, undefined, undefined]);
  const s = { x: 10, y: 64, z: 10, f: 0 };
  assert.deepEqual(homeAt("house_2", s, 1), { x: 10, y: 64, z: 14 }, "inside the house, in front of the bed");
  const a = homeAt("well", s, 0);
  const b = homeAt("well", s, 1);
  assert.ok(a.x !== b.x && a.y === 64 && Math.abs(a.x - 10) === 3 && Math.abs(b.x - 10) === 3, "beside the well, one each side");
  // Looks: every house job has one, and every look is an event of villager_v2.
  for (const job of CONFIG.houseJobs) assert.ok(LOOKS[job], `${job} has a look`);
  const jobs = Object.fromEntries(CONFIG.houseJobs.map((j, i) => [`house_${i + 1}`, j]));
  assert.equal(lookFor("house_2", 1, (h) => jobs[h]), "librarian");
  assert.equal(lookFor("well", 0, () => undefined), WELL_LOOKS[0]);
  for (const look of [...Object.values(LOOKS), ...WELL_LOOKS]) assert.ok(villager["minecraft:entity"].events[lookEvent(look)], `${lookEvent(look)} is a villager_v2 event`);
  assert.equal(lookEvent("nonsense"), "minecraft:become_unskilled");
});

test("the world cap: highest level first, then the oldest; nobody removed", () => {
  const towns = [
    { id: "a", lvl: 2, at: 1, living: 2, slots: 4 },
    { id: "b", lvl: 4, at: 5, living: 0, slots: 8 },
    { id: "c", lvl: 4, at: 3, living: 4, slots: 8 },
  ];
  const room = allocate(towns, 20);
  assert.deepEqual(Object.fromEntries(room), { c: 4, b: 8, a: 2 }, "20 - 6 living = 14: c (older) then b, then a");
  assert.deepEqual(Object.fromEntries(allocate(towns, 10)), { c: 4, b: 0, a: 0 });
  assert.deepEqual(Object.fromEntries(allocate(towns, 2)), { c: 0, b: 0, a: 0 }, "a cap under the living: no one new, no one removed");
  assert.deepEqual(Object.fromEntries(allocate([{ id: "x", lvl: 5, at: 1, living: 12, slots: 10 }], 40)), { x: 0 }, "a lowered town cap: never negative");
});

const rec = (s, i, o = {}) => ({ s, i, n: `N${s}`, h: "well", e: `e${i}`, p: "farmer", ...o });
const base = (r) => ({ n: 20, r, new: [] });
const census = (rs, found, o = {}) =>
  reconcile({ rs, town: "elm", found, loaded: () => true, center: { x: 0, z: 0 }, radius: 96, now: 1000, replaceTicks: 20 * TICKS_PER_MINUTE, ...o });

test("census: missing twice while home is loaded is gone; found resets; unloaded never counts", () => {
  let rs = base([rec(0, 1), rec(1, 2)]);
  let c = census(rs, [{ id: "e1", rid: 1, x: 3, z: 3 }]);
  assert.equal(c.rs.r[1].m, 1, "missing once");
  assert.equal(c.rs.r[1].d, undefined);
  c = census(c.rs, [{ id: "e1", rid: 1, x: 3, z: 3 }]);
  assert.equal(c.rs.r[1].d, 1000 + 24000, "missing twice: replaced 20 in-game minutes (24,000 ticks) later");
  assert.equal(c.rs.r[1].e, undefined);
  assert.deepEqual(c.gone, [1]);
  assert.equal(MISS_LIMIT, 2);
  // Found again after one miss: reset.
  rs = census(rs, [{ id: "e1", rid: 1, x: 0, z: 0 }]).rs;
  assert.equal(census(rs, [{ id: "e1", rid: 1, x: 0, z: 0 }, { id: "e2", rid: 2, x: 0, z: 0 }]).rs.r[1].m, undefined);
  // Its home not loaded: no miss.
  assert.equal(census(rs, [], { loaded: () => false }).rs.r[1].m, 1, "the miss from before stays, no new one");
  assert.equal(census(base([rec(0, 1)]), [], { loaded: () => false }).changed, false);
  // Far from the center: sent home.
  assert.deepEqual(census(base([rec(0, 1)]), [{ id: "e1", rid: 1, x: 200, z: 0 }]).teleport, [{ id: "e1", s: 0 }]);
});

test("census: a resident strayed past the leash from its home is brought back, unless a player is near it", () => {
  const home = () => ({ x: 50, z: 0 });
  const o = { home, leash: HOME_LEASH, watched: () => false };
  assert.equal(HOME_LEASH, 32);
  assert.deepEqual(census(base([rec(0, 1)]), [{ id: "e1", rid: 1, x: 50, z: 30 }], o).teleport, [], "30 blocks from home: stays");
  assert.deepEqual(census(base([rec(0, 1)]), [{ id: "e1", rid: 1, x: 50, z: 40 }], o).teleport, [{ id: "e1", s: 0 }], "40 from home (and 64 inside the town): back home");
  assert.deepEqual(census(base([rec(0, 1)]), [{ id: "e1", rid: 1, x: 50, z: 40 }], { ...o, watched: () => true }).teleport, [], "a player near it: it stays (no villager vanishing in front of someone)");
  assert.deepEqual(census(base([rec(0, 1)]), [{ id: "e1", rid: 1, x: 200, z: 0 }], { ...o, watched: () => true }).teleport, [{ id: "e1", s: 0 }], "past the town radius: always");
  assert.deepEqual(census(base([rec(0, 1)]), [{ id: "e1", rid: 1, x: 50, z: 40 }], { ...o, home: () => undefined }).teleport, [], "no home known: only the town radius counts");
});

test("census: duplicates and strays lose the tags, the record's own entity stays", () => {
  const rs = base([rec(0, 1), rec(1, 2, { d: 5000, e: undefined })]);
  const c = census(rs, [
    { id: "cured", rid: 1, x: 0, z: 0 }, // a cured zombie villager with the same rid
    { id: "e1", rid: 1, x: 0, z: 0 },
    { id: "old", rid: 2, x: 0, z: 0 }, // a family replaced meanwhile came back
    { id: "stray", rid: 9, x: 0, z: 0 },
    { id: "norid", x: 0, z: 0 },
  ]);
  assert.deepEqual(c.untag.sort(), ["cured", "norid", "old", "stray"]);
  assert.equal(c.rs.r[0].e, "e1");
  assert.equal(c.rs.r[1].d, 5000, "a family waiting to be replaced stays waiting");
  // The record's id isn't among them (an id that changed): the first one is taken.
  assert.equal(census(base([rec(0, 1, { e: "gone" })]), [{ id: "new", rid: 1, x: 0, z: 0 }]).rs.r[0].e, "new");
});

test("plan: replacements when due, new slots, moves, the room, drops", () => {
  const homes = ["house_1", "well", "house_3", undefined];
  const rs = base([rec(0, 1), rec(1, 2), rec(2, 3, { d: 900, e: undefined, h: "house_3" })]);
  const p = plan(rs, homes, 5, 1000);
  assert.deepEqual(p.spawn, [{ s: 2, h: "house_3", replace: true }]);
  assert.deepEqual(p.move, [{ s: 0, h: "house_1" }], "the well's first family moves to its house");
  assert.deepEqual(plan(rs, homes, 5, 800).spawn, [], "not due yet");
  assert.deepEqual(plan(base([]), ["well", "well"], 1, 0).spawn, [{ s: 0, h: "well", replace: false }], "the world cap's room");
  assert.deepEqual(plan(base([]), ["well", "well"], 0, 0).spawn, []);
  // A lowered town cap: the dead past it are dropped, the living stay.
  const over = base([rec(0, 1), rec(1, 2), rec(2, 3), rec(3, 4, { d: 1 })]);
  const q = plan(over, ["well", "well"], 0, 1000);
  assert.deepEqual(q.drop, [3]);
  assert.deepEqual([q.spawn, q.move], [[], []]);
});

test("the saved record: old worlds have none; garbage is cleaned; names", () => {
  assert.deepEqual(readResidents(undefined), { n: 0, r: [], new: [] }, "towns from before residents start empty");
  const rs = readResidents({ n: 2, r: [rec(1, 7, { n: "Tilly§c", h: "attic", p: "wizard" }), rec(1, 8), { s: 11, i: 1, n: "X" }, null], new: ["A", "", "B"] });
  assert.equal(rs.n, 8, "the next number is past every one used");
  assert.deepEqual(rs.r, [{ s: 1, i: 7, n: "Tilly", e: "e7", p: "unskilled" }]);
  assert.deepEqual(rs.new, ["A", "B"]);
  assert.equal(livingOf(base([rec(0, 1), rec(1, 2, { d: 3 })])), 1);
  assert.equal(ridOf("elm", ["realm:resident", "town:r:elm", ridTag("elm", 12)]), 12);
  assert.equal(ridOf("elm", [ridTag("elm_2", 3)]), undefined, "another town's tag");
  let r = base([]);
  for (let k = 0; k < 7; k++) r = addNew(r, `N${k}`);
  assert.equal(r.new.length, NEW_KEEP);
  assert.equal(r.new.at(-1), "N6");
  assert.equal(JSON.stringify({ n: 99, r: Array.from({ length: 10 }, (_, k) => rec(k, 90 + k, { n: "x".repeat(16), e: "-4294967295123", d: 123456789012 })), new: Array(5).fill("x".repeat(16)) }).length < 2000, true, "a full record is small");
  // Names: unique, plain, not the mayors'.
  const names = CONFIG.residentNames;
  assert.equal(names.length, 40);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every((n) => /^[A-Za-z]{1,16}$/.test(n)));
  assert.ok(!names.some((n) => CONFIG.mayorNames.includes(n)));
  assert.equal(pickName(names, new Set(["Abel"]), new Set()), "Agnes");
  assert.equal(pickName(["A", "B"], new Set(["A", "B"]), new Set(["A"])), "B", "all taken in the world: one this town doesn't use");
});

test("villager_v2.json: vanilla plus one group, one event and one property", () => {
  const e = villager["minecraft:entity"];
  assert.equal(e.description.identifier, "minecraft:villager_v2");
  assert.deepEqual(e.description.properties, { "realm:resident": { type: "bool", default: false } });
  const g = e.component_groups["realm:town_resident"];
  assert.deepEqual(Object.keys(g).sort(), ["minecraft:behavior.move_towards_home_restriction", "minecraft:dweller", "minecraft:home"]);
  assert.equal(g["minecraft:dweller"].can_find_poi, false, "no bed, job site or bell is ever claimed");
  assert.equal(g["minecraft:dweller"].can_migrate, false);
  assert.ok(g["minecraft:home"].restriction_radius > 0);
  // A resident never works (a farmer's work harvests any ripe crop nearby, a player's farm too) and never breeds: the
  // work schedules, work goals and love groups go first, then the group and the jobless (nitwit's) schedule come.
  const WORK = ["basic_schedule", "farmer_schedule", "fisher_schedule", "librarian_schedule", "work_schedule", "work_schedule_farmer", "work_schedule_fisher", "work_schedule_librarian", "work_schedule_villager", "job_specific_goals", "make_and_receive_love"];
  assert.deepEqual(e.events["realm:become_resident"], { sequence: [{ remove: { component_groups: WORK } }, { add: { component_groups: ["realm:town_resident", "jobless_schedule"] }, set_property: { "realm:resident": true } }] });
  for (const k of [...WORK, "jobless_schedule"]) assert.ok(e.component_groups[k], `${k} is a vanilla group`);
  const jobless = new Set(e.component_groups.jobless_schedule["minecraft:scheduler"].scheduled_events.map((x) => x.event));
  for (const ev of jobless) for (const k of e.events[ev].add?.component_groups ?? []) assert.ok(!/work|job_specific/.test(k), `${ev} brings no work back (${k})`);
  // Every other villager is unchanged: the base dweller and the professions' still find beds and job sites.
  assert.equal(e.components["minecraft:dweller"].can_find_poi, true);
  for (const [k, grp] of Object.entries(e.component_groups)) if (k !== "realm:town_resident" && grp["minecraft:dweller"]) assert.equal(grp["minecraft:dweller"].can_find_poi, true, k);
  const ours = (k) => k.startsWith("realm:");
  assert.deepEqual(Object.keys(e.component_groups).filter(ours), ["realm:town_resident"]);
  assert.deepEqual(Object.keys(e.events).filter(ours), ["realm:become_resident"]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "packs", "town_bp", "manifest.json"), "utf8"));
  assert.ok(manifest.modules.some((m) => m.type === "data"), "a data module, so the entity file is loaded");
  // No vanilla event adds our group or sets our property.
  for (const [k, ev] of Object.entries(e.events)) if (!ours(k)) assert.ok(!JSON.stringify(ev).includes("realm:"), k);
});

/** The first argument of a call `<callee>(...)` at the top level of main.js, as source. */
function callbackOf(callee) {
  const src = ts.createSourceFile("main.js", main, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let out;
  ts.forEachChild(src, (n) => {
    if (ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(src) === callee) out = n.expression.arguments[0].getText(src);
  });
  assert.ok(out, `main.js calls ${callee}`);
  return out;
}

test("main.js: a death marks the family for replacement in in-game ticks", () => {
  const rs = base([rec(0, 1), rec(1, 2)]);
  const saved = [];
  const ctx = {
    allTowns: () => new Map([["elm", { id: "elm" }]]),
    residentsOf: () => rs,
    saveResidents: (t, r) => saved.push([t.id, structuredClone(r)]),
    world: { getAbsoluteTime: () => 50000 },
    replaceTicks: () => 6000,
    console: { warn() {} },
  };
  const fn = vm.runInNewContext(`(${callbackOf("world.afterEvents.entityDie.subscribe")})`, ctx);
  fn({ deadEntity: { id: "e2" } });
  assert.equal(saved.length, 1);
  assert.equal(saved[0][1].r[1].d, 56000);
  assert.equal(saved[0][1].r[1].e, undefined);
  fn({ deadEntity: { id: "zombie" } });
  assert.equal(saved.length, 1, "not a resident: nothing saved");
  assert.match(main, /entityTypes: \[VILLAGER\]/, "only villagers wake the handler");
});

test("main.js: taps on residents are canceled unless residentsTrade; a canceled tap is left alone (C13)", () => {
  const src = callbackOf("world.beforeEvents.playerInteractWithEntity.subscribe");
  assert.match(src, /^\(ev\) => \{\s*if \(ev\.cancel\) return;/, "the first line");
  let trade = false;
  let ran = 0;
  const ctx = {
    VILLAGER: "minecraft:villager_v2",
    RESIDENT_TAG: "realm:resident",
    get: (k) => (k === "residentsTrade" ? trade : undefined),
    allTowns: () => new Map([["elm", { id: "elm", n: "Elm" }]]),
    untagResident() {},
    tapSaid: new Map(),
    system: { run: () => ran++, currentTick: 0 },
  };
  const fn = vm.runInNewContext(`(${src})`, ctx);
  const target = (tags) => ({ typeId: "minecraft:villager_v2", hasTag: (x) => tags.includes(x), getTags: () => tags, nameTag: "Tilly" });
  const canceled = {
    cancel: true,
    get target() {
      throw new Error("read the target of a canceled tap");
    },
  };
  assert.doesNotThrow(() => fn(canceled));
  const tap = (tags) => {
    const ev = { cancel: false, player: {}, target: target(tags) };
    fn(ev);
    return ev.cancel;
  };
  assert.equal(tap(["realm:resident", "town:r:elm"]), true);
  assert.equal(tap([]), false, "an ordinary villager trades");
  assert.equal(tap(["realm:resident", "town:r:gone"]), false, "a removed town's resident trades (and loses the tags)");
  trade = true;
  assert.equal(tap(["realm:resident", "town:r:elm"]), false, "residentsTrade Enabled");
  assert.ok(ran >= 2);
});

test("main.js: spawned the wander_bp way, look before the resident group, census on the slow check", () => {
  assert.match(main, /spawnFresh\(dim, VILLAGER, at, \{ spawnEvent: "minecraft:spawn_from_village", fresh: true \}\)/);
  const look = main.indexOf("e.triggerEvent(lookEvent(look))");
  const group = main.indexOf('e.triggerEvent("realm:become_resident"); // last');
  assert.ok(look > 0 && group > look, "a profession's group brings its own dweller back, so the resident group comes last");
  assert.ok(main.indexOf("e.addTag(RESIDENT_TAG)") > group, "tagged only once it is ours (C6)");
  assert.match(main, /const CENSUS_TICKS = 600;/);
  assert.match(main, /residentTick\(players\);/);
  assert.match(main, /getEntities\(\{ type: VILLAGER, tags: \[townTag\(t\.id\)\] \}\)/, "one getEntities by tag per census");
  assert.doesNotMatch(main, /\.kill\(\)/, "residents are never killed");
  assert.match(main, /dropResidents\(t\);/, "a removed town's residents lose the tags");
});
