// Town Projects' mayors (packs/town_bp/scripts/mayors.js and its use in main.js): a mayor per town, Mayor Bram for
// the realm's first town, unique names, offer routing with the nearest-town rule as a fallback, the realm:npc_mayors
// list in parts, and the migration of towns saved before mayors (Bram keeps his town).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CONFIG } from "../packs/town_bp/scripts/config.js";
import { BRAM, bramTown, cleanName, createPlacesAssembler, isTownMayorId, mayorIdFor, mayorParts, newTownMayor, offerTowns, pickMayorName, planMigration, readMayor } from "../packs/town_bp/scripts/mayors.js";

const main = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "main.js"), "utf8");
const town = (id, o = {}) => ({ id, n: id[0].toUpperCase() + id.slice(1), dim: "minecraft:overworld", x: 0, z: 0, at: 1, ...o });

test("ids and names", () => {
  assert.equal(mayorIdFor("oak_hollow"), "mayor:oak_hollow");
  assert.ok(isTownMayorId("mayor:oak_hollow") && !isTownMayorId(BRAM) && !isTownMayorId("mayor:") && !isTownMayorId(undefined));
  assert.equal(cleanName("  Mayor §cAlda…  "), "Mayor Alda");
  assert.equal(cleanName("x".repeat(40)).length, 24);
  assert.ok(CONFIG.mayorNames.length >= 10 && CONFIG.mayorNames.every((n) => /^[A-Za-z]+$/.test(n) && n.length <= 18));
  assert.equal(new Set(CONFIG.mayorNames).size, CONFIG.mayorNames.length);
  assert.equal(CONFIG.townMayors, true);
});

test("pickMayorName: each name once, then Mayor <Town>", () => {
  assert.equal(pickMayorName(["Alda", "Corwin"], [], "Riverside"), "Mayor Alda");
  assert.equal(pickMayorName(["Alda", "Corwin"], ["mayor alda"], "Riverside"), "Mayor Corwin");
  assert.equal(pickMayorName(["Alda"], ["Mayor Alda"], "Oak Hollow"), "Mayor Oak Hollow");
  assert.equal(pickMayorName([], [], "A very long town name here"), "Mayor A very long town n");
});

test("readMayor: v1 records read unchanged, bad mayors dropped", () => {
  const v1 = { id: "riverside", n: "Riverside", spots: { well: { x: 1, y: 2, z: 3, f: 0 } }, lvl: 2 };
  assert.deepEqual(readMayor(v1), v1);
  assert.deepEqual(readMayor({ id: "a", v: 2, m: "mayor:a", mn: "Mayor éAlda" }), { id: "a", v: 2, m: "mayor:a", mn: "Mayor Alda" });
  assert.deepEqual(readMayor({ id: "a", v: 2, m: "bram", mn: "x" }), { id: "a", v: 2, m: "bram" });
  assert.deepEqual(readMayor({ id: "a", v: 2, m: "mayor:b", mn: "x" }), { id: "a", v: 2 }, "another town's mayor id is not this town's");
  assert.deepEqual(readMayor({ id: "a", v: 7, m: "mara" }), { id: "a" });
});

test("newTownMayor: Bram for the first town, then each its own", () => {
  assert.deepEqual(newTownMayor([], "riverside", "Riverside", ["Alda"]), { m: BRAM });
  assert.deepEqual(newTownMayor([town("riverside", { m: BRAM, v: 2 })], "oakfield", "Oakfield", ["Alda", "Corwin"]), { m: "mayor:oakfield", mn: "Mayor Alda" });
  assert.deepEqual(newTownMayor([town("riverside", { m: BRAM, v: 2 }), town("oakfield", { m: "mayor:oakfield", mn: "Mayor Alda", v: 2 })], "elm", "Elm", ["Alda", "Corwin"]), { m: "mayor:elm", mn: "Mayor Corwin" });
});

test("offerTowns: its own town anywhere, the nearest-town rule only as a fallback", () => {
  const towns = [town("a", { m: "mayor:a", v: 2 }), town("b", { m: "mayor:b", v: 2 }), town("c", { m: BRAM, v: 2 }), town("d")];
  const placed = (id) => id === "mayor:a" || id === "mayor:b" || id === BRAM;
  const ask = (npc, here, roles = ["mayor"], o = {}) => offerTowns({ towns, npc, roles, role: "mayor", here, placed, enabled: true, ...o });
  assert.deepEqual(ask("mayor:a", undefined), ["a"], "mayor A offers A far from any town");
  assert.deepEqual(ask("mayor:a", "b"), ["a"], "in town B (its mayor placed), mayor A offers only A");
  assert.deepEqual(ask("mayor:a", "a"), ["a"]);
  assert.deepEqual(ask(BRAM, "a", ["mayor", "questgiver"]), ["c"], "Bram offers his own town; A has its own mayor");
  assert.deepEqual(ask(BRAM, "d", ["mayor", "questgiver"]), ["c", "d"], "a town without a mayor: fallback, own town first");
  assert.deepEqual(ask("mayor:a", "d"), ["a", "d"]);
  const unplaced = (id) => id !== "mayor:b";
  assert.deepEqual(offerTowns({ towns, npc: "mayor:a", roles: ["mayor"], role: "mayor", here: "b", placed: unplaced, enabled: true }), ["a", "b"], "B's mayor not placed: A also offers B");
  assert.deepEqual(ask("custom", "b"), ["b"], "an operator's own mayor-role NPC keeps the nearest-town rule");
  assert.deepEqual(ask("custom", undefined), []);
  assert.deepEqual(ask("mara", "b", ["cartographer"]), [], "no mayor role, no town of its own: nothing");
  assert.deepEqual(ask("mayor:a", "b", ["mayor"], { enabled: false }), ["b"], "townMayors Disabled: today's rule");
  assert.deepEqual(ask("mayor:a", undefined, ["mayor"], { enabled: false }), []);
  // Before migration (no m anywhere) Bram serves the town the player stands in, as before.
  assert.deepEqual(offerTowns({ towns: [town("x"), town("y")], npc: BRAM, roles: ["mayor"], role: "mayor", here: "y", placed, enabled: true }), ["y"]);
});

test("mayorParts and the places assembler stay under 2048 characters and complete", () => {
  assert.deepEqual(mayorParts([]), [{ part: 1, parts: 0, ids: [] }]);
  const ids = Array.from({ length: 64 }, (_, i) => mayorIdFor(`town_with_a_long_name_${i}`));
  const parts = mayorParts(ids);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => JSON.stringify(p).length < 2048 && p.parts === parts.length));
  assert.deepEqual(parts.flatMap((p) => p.ids), ids);
  const a = createPlacesAssembler();
  assert.equal(a.add({ part: 1, parts: 2, folk: [{ id: "bram", dim: "minecraft:overworld", x: 1, z: 2 }] }), undefined);
  const got = a.add({ part: 2, parts: 2, folk: [{ id: "mayor:a", dim: "minecraft:overworld", x: 5, z: 6 }, { id: 3 }] });
  assert.deepEqual([...(got ?? new Map()).keys()], ["bram", "mayor:a"]);
  assert.equal(a.add({ part: 1, parts: 0, folk: [] })?.size, 0);
  assert.equal(a.add({ part: 3, parts: 2, folk: [] }), undefined);
});

test("bramTown: nearest town to his post within the radius, else the oldest", () => {
  const towns = [town("old", { at: 1, x: 500, z: 0 }), town("near", { at: 5, x: 40, z: 0 }), town("nether", { at: 0, dim: "minecraft:nether", x: 0, z: 0 })];
  assert.equal(bramTown(towns, { dim: "minecraft:overworld", x: 0, z: 0 }, 96), "near");
  assert.equal(bramTown(towns, { dim: "overworld", x: 0, z: 0 }, 96), "near", "dimension ids with or without minecraft:");
  assert.equal(bramTown(towns, { dim: "minecraft:overworld", x: 2000, z: 0 }, 96), "nether", "none within reach: the oldest");
  assert.equal(bramTown(towns, undefined, 96), "nether", "Bram not placed: the oldest");
  assert.equal(bramTown([], undefined, 96), undefined);
});

test("planMigration: Bram keeps his town, every other town gets its own mayor; migrated towns untouched", () => {
  const towns = [town("riverside", { at: 1, x: 10, z: 0 }), town("oakfield", { at: 2, x: 300, z: 0 })];
  const plan = planMigration(towns, { dim: "minecraft:overworld", x: 0, z: 0 }, 96, ["Alda", "Corwin"]);
  assert.deepEqual(plan, [{ id: "riverside", m: BRAM }, { id: "oakfield", m: "mayor:oakfield", mn: "Mayor Alda" }]);
  // Bram near the second town.
  assert.deepEqual(planMigration(towns, { dim: "minecraft:overworld", x: 290, z: 0 }, 96, ["Alda"]).map((c) => c.m), ["mayor:riverside", BRAM]);
  // A town added after the update already has Bram: the old ones get their own.
  const mixed = [town("new", { at: 9, v: 2, m: BRAM }), town("old", { at: 1 }), town("b", { at: 3, v: 2, m: "mayor:b", mn: "Mayor Alda" })];
  assert.deepEqual(planMigration(mixed, undefined, 96, ["Alda", "Corwin"]), [{ id: "old", m: "mayor:old", mn: "Mayor Corwin" }]);
  assert.deepEqual(planMigration([town("x", { v: 2, m: BRAM })], undefined, 96, []), [], "nothing to migrate");
});

test("main.js: mayors on add, remove with the town, routing through offerTowns", () => {
  assert.match(main, /newTownMayor\(\[\.\.\.allTowns\(\)\.values\(\)\], t\.id, t\.n, CONFIG\.mayorNames\)/);
  assert.match(main, /if \(isTownMayorId\(t\.m\)\) send\("realm:npc_mayor", \{ op: "remove", id: t\.m \}\);/);
  assert.match(main, /const ids = offerTowns\(\{/);
  assert.doesNotMatch(main, /mayorSet\([^)]*BRAM/, "Bram is never set by Town Projects");
  assert.match(main, /send\("realm:npc_summon", \{ id: BRAM, player: player\.id \}\)/, "Bram is moved with realm:npc_summon only");
  assert.match(main, /readMayor\(\{ \.\.\.t, spots: t\.spots \?\? \{\}, lvl: t\.lvl \?\? 1 \}\)/);
});

/** Runs main.js's own mayorMigrate() with these towns and this realm:npc_places answer (undefined: none). */
async function migrate(townList, places, { enabled = true, held = false } = {}) {
  const { default: ts } = await import("typescript");
  const vm = await import("node:vm");
  const source = ts.createSourceFile("main.js", main, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let fn = "";
  ts.forEachChild(source, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === "mayorMigrate") fn = n.getText(source);
  });
  assert.ok(fn, "the test runs the actual mayorMigrate");
  const map = new Map(townList.map((t) => [t.id, structuredClone(t)]));
  const saved = [];
  const ctx = {
    migrationHeld: held,
    places,
    towns: map,
    allTowns: () => map,
    get: (k) => (k === "townMayors" ? enabled : k === "townRadius" ? 96 : undefined),
    saveTown: (t) => saved.push(structuredClone(t)),
    planMigration,
    BRAM,
    CONFIG,
    console: { warn() {} },
  };
  vm.runInNewContext(`${fn}\nmayorMigrate();`, ctx);
  return { map, saved };
}

test("migration at load: Bram keeps his town, the rest get their own, nothing else changes", async () => {
  const spots = { well: { x: 300, y: 64, z: 3, f: 2, snap: 1, b: [298, 62, 1, 302, 67, 5] } };
  const v1 = [
    { id: "riverside", n: "Riverside", dim: "minecraft:overworld", x: 0, y: 64, z: 0, lvl: 2, spots: {}, by: "Ann", at: 100 },
    { id: "oakfield", n: "Oakfield", dim: "minecraft:overworld", x: 300, y: 64, z: 0, lvl: 1, spots, by: "Ann", at: 200, prot: 0 },
  ];
  const bramNearOak = new Map([["bram", { dim: "minecraft:overworld", x: 310, z: 4 }]]);
  const { map, saved } = await migrate(v1, bramNearOak);
  assert.equal(saved.length, 2);
  assert.deepEqual(map.get("oakfield"), { ...v1[1], v: 2, m: "bram" }, "Bram's town: only v and m added");
  assert.deepEqual(map.get("riverside"), { ...v1[0], v: 2, m: "mayor:riverside", mn: "Mayor Alda" });
  // Bram not placed: the oldest town is his.
  assert.equal((await migrate(v1, new Map())).map.get("riverside")?.m, "bram");
  // No answer from Townsfolk, Disabled, or held: nothing written.
  for (const r of [await migrate(v1, undefined), await migrate(v1, bramNearOak, { enabled: false }), await migrate(v1, bramNearOak, { held: true })]) {
    assert.equal(r.saved.length, 0);
    assert.deepEqual([...r.map.values()], v1);
  }
  // Already migrated: nothing again.
  const again = await migrate([...map.values()], bramNearOak);
  assert.equal(again.saved.length, 0);
});
