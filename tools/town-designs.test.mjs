// Town Projects' built-in designs (packs/town_bp/scripts/designs.js): the 7 existing designs must keep exactly the
// blocks and footprints they had before they moved out of main.js, because saved spots keep the box they covered
// (`b`) and the structure snapshot of the ground under it. The expected values were read from the int23 main.js.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import { BUILDS, DEFAULT_JOB, design, designFootprint, isOptionalPlace, localBox, placeStates, toWorld } from "../packs/town_bp/scripts/designs.js";
import { CONFIG } from "../packs/town_bp/scripts/config.js";

const EXPECTED = {
  well: { n: 83, min: { x: -2, y: -2, z: 1 }, max: { x: 2, y: 3, z: 5 }, hash: "67df80bb7229b097" },
  lamps: { n: 16, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 3, z: 12 }, hash: "e78890e193c7a9bb" },
  stall: { n: 32, min: { x: -2, y: 0, z: 1 }, max: { x: 2, y: 3, z: 3 }, hash: "8afc5daed1f26b93" },
  bell_tower: { n: 32, min: { x: -1, y: 0, z: 1 }, max: { x: 1, y: 7, z: 3 }, hash: "7635af9a4bbeb166" },
  dock: { n: 100, min: { x: -1, y: -9, z: 1 }, max: { x: 1, y: 1, z: 10 }, hash: "c015e40070fc975b" },
  garden: { n: 35, min: { x: -2, y: -2, z: 1 }, max: { x: 2, y: 0, z: 5 }, hash: "51ceb2d2ab72fa5f" },
  notice_board: { n: 20, min: { x: -2, y: 0, z: 0 }, max: { x: 2, y: 3, z: 1 }, hash: "f9d117954026bd0b" },
};

const OLD = Object.keys(EXPECTED);

test("the 7 designs keep their blocks and local boxes", () => {
  assert.deepEqual(BUILDS.filter((k) => k !== "house").sort(), OLD.sort());
  assert.deepEqual(BUILDS.slice(0, 7), ["well", "lamps", "stall", "bell_tower", "dock", "garden", "notice_board"], "the house is added after the 7");
  for (const kind of OLD) {
    const places = design(kind);
    const box = localBox(kind);
    const hash = crypto.createHash("sha256").update(JSON.stringify(places)).digest("hex").slice(0, 16);
    assert.deepEqual({ n: places.length, min: box.min, max: box.max, hash }, EXPECTED[kind], kind);
  }
});

test("world footprints turn with the spot and match the old formula", () => {
  const spot = { x: 100, y: 64, z: -40 };
  for (const kind of OLD) {
    const lb = EXPECTED[kind];
    for (let f = 0; f < 4; f++) {
      const s = { ...spot, f };
      const a = toWorld(s, lb.min.x, lb.min.y, lb.min.z);
      const b = toWorld(s, lb.max.x, lb.max.y, lb.max.z);
      const want = {
        min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
        max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
      };
      assert.deepEqual(designFootprint(kind, s), want, `${kind} f${f}`);
      // Every block of the design is inside its footprint.
      const fp = designFootprint(kind, s);
      for (const pl of design(kind)) {
        const w = toWorld(s, pl.x, pl.y, pl.z);
        assert.ok(w.x >= fp.min.x && w.x <= fp.max.x && w.y >= fp.min.y && w.y <= fp.max.y && w.z >= fp.min.z && w.z <= fp.max.z, `${kind} f${f} block inside`);
      }
    }
  }
  // A well facing south at the spot covers x 98..102, y 62..67, z -39..-35 (as built before the move).
  assert.deepEqual(designFootprint("well", { ...spot, f: 0 }), { min: { x: 98, y: 62, z: -39 }, max: { x: 102, y: 67, z: -35 } });
});

test("main.js uses designs.js instead of its own copy", () => {
  const main = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "main.js"), "utf8");
  assert.match(main, /from "\.\/designs\.js"/);
  assert.doesNotMatch(main, /^function design\(/m);
  assert.doesNotMatch(main, /^function localBox\(/m);
  const designs = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "designs.js"), "utf8");
  assert.doesNotMatch(designs, /@minecraft\//, "designs.js runs in node");
});

// --- The house (F40): a 7 x 7 cottage with a door facing the spot, a bed and a job-site block inside ---

const blockIds = new Set(Object.values(MinecraftBlockTypes));
const statesDts = fs.readFileSync(path.join(import.meta.dirname, "..", "node_modules", "@minecraft", "vanilla-data", "lib", "mojang-block.d.ts"), "utf8");
/** The state names vanilla-data lists for a block type ("BedStates"). @param {string} type */
function statesOf(type) {
  const m = statesDts.match(new RegExp(`export type ${type}States = Pick<BlockStateSuperset, ([^>]+)>;`));
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
}
const camel = (id) => id.replace(/^minecraft:/, "").split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");

test("the house: 7 x 7, the bed (both halves) and the job site inside its footprint, the door in the front wall", () => {
  const places = design("house", "minecraft:lectern");
  const box = localBox("house");
  assert.deepEqual(box, { min: { x: -3, y: -1, z: 1 }, max: { x: 3, y: 3, z: 7 } });
  const at = (block) => places.filter((p) => p.block === block);
  const bed = at("minecraft:bed");
  assert.equal(bed.length, 2, "a two-block bed");
  assert.deepEqual(bed.map((p) => [p.states?.head_piece_bit, p.pair ?? 0]), [[false, 0], [true, 1]], "foot first, head paired with it");
  assert.equal(bed[1].z - bed[0].z, 1, "the head lies forward of the foot");
  assert.equal(bed[0].x, bed[1].x);
  const job = at("minecraft:lectern");
  assert.equal(job.length, 1, "one job-site block");
  assert.equal(design("house").filter((p) => p.block === DEFAULT_JOB).length, 1, "the default job site");
  const inside = (p) => p.x > -3 && p.x < 3 && p.z > 1 && p.z < 7 && p.y >= 0 && p.y <= 2;
  for (const p of [...bed, ...job]) assert.ok(inside(p), `${p.block} at ${p.x},${p.y},${p.z} is inside the walls`);
  const door = at("minecraft:wooden_door");
  assert.deepEqual(door.map((p) => [p.x, p.y, p.z, p.states?.upper_block_bit, p.pair ?? 0]), [[0, 0, 1, false, 0], [0, 1, 1, true, 1]], "the door in the front wall, facing the spot");
  // Nothing else in the doorway or on the bed and job site; one block per place.
  const keys = places.map((p) => `${p.x},${p.y},${p.z}`);
  assert.equal(new Set(keys).size, keys.length, "no place twice");
  assert.ok(at("minecraft:glass_pane").length >= 4, "windows");
  assert.equal(at("minecraft:oak_slab").length, 49, "a slab roof over all of it");
  assert.equal(at("minecraft:lantern").length, 1, "a lantern");
  assert.equal(at("minecraft:oak_log").length, 12, "log corners, 3 high");
  // A bed or door half always comes right after the half it goes with.
  places.forEach((p, i) => {
    if (p.pair) assert.ok(i > 0 && places[i - 1].block === p.block && !places[i - 1].pair, `${p.block} half paired with the one before`);
  });
  // The floor is optional (only on grass or dirt), the rest isn't.
  assert.ok(places.filter((p) => p.y === -1).every((p) => isOptionalPlace("house", p) && p.mode === "ground"));
  assert.ok(places.filter((p) => p.y >= 0).every((p) => !isOptionalPlace("house", p)));
  // Every block inside the footprint, at every facing.
  for (let f = 0; f < 4; f++) {
    const s = { x: 10, y: 70, z: 10, f };
    const fp = designFootprint("house", s);
    assert.equal(fp.max.x - fp.min.x, 6);
    assert.equal(fp.max.z - fp.min.z, 6);
    for (const p of places) {
      const w = toWorld(s, p.x, p.y, p.z);
      assert.ok(w.x >= fp.min.x && w.x <= fp.max.x && w.z >= fp.min.z && w.z <= fp.max.z, `f${f} inside`);
    }
    // The door is on the side of the spot: the spot is right in front of it.
    const d = toWorld(s, 0, 0, 1);
    assert.equal(Math.abs(d.x - s.x) + Math.abs(d.z - s.z), 1, `f${f}: the door faces the spot`);
  }
});

test("house blocks, states and job sites exist in vanilla-data, and their states turn with the spot", () => {
  for (const p of design("house")) assert.ok(blockIds.has(p.block), `${p.block} is a block`);
  for (const job of CONFIG.houseJobs) assert.ok(blockIds.has(job), `houseJobs: ${job} is a block`);
  assert.equal(CONFIG.houseJobs.length, 10);
  const named = { "minecraft:wooden_door": "WoodenDoor", "minecraft:bed": "Bed", "minecraft:glass_pane": "GlassPane", "minecraft:lantern": "Lantern", "minecraft:oak_slab": "OakSlab" };
  for (let f = 0; f < 4; f++)
    for (const p of design("house")) {
      const st = placeStates(p, f);
      if (!st) continue;
      const type = named[p.block] ?? camel(p.block);
      const known = statesOf(type);
      for (const k of Object.keys(st)) assert.ok(known.includes(k), `${p.block}: state ${k} (${known.join(", ")})`);
    }
  const bed = design("house").find((p) => p.block === "minecraft:bed");
  const door = design("house").find((p) => p.block === "minecraft:wooden_door");
  // Forward is south, west, north, east for facings 0..3; a bed's direction and a door's cardinal direction follow it.
  assert.deepEqual([0, 1, 2, 3].map((f) => placeStates(bed, f).direction), [0, 1, 2, 3]);
  assert.deepEqual([0, 1, 2, 3].map((f) => placeStates(door, f)["minecraft:cardinal_direction"]), ["south", "west", "north", "east"]);
  // A pane in the front wall runs across the facing; one in a side wall along it.
  const front = design("house").find((p) => p.block === "minecraft:glass_pane" && p.z === 1);
  const side = design("house").find((p) => p.block === "minecraft:glass_pane" && Math.abs(p.x) === 3);
  assert.equal(placeStates(front, 0)["minecraft:connection_east"], true, "facing south, the front wall runs east-west");
  assert.equal(placeStates(front, 0)["minecraft:connection_north"], false);
  assert.equal(placeStates(front, 1)["minecraft:connection_north"], true, "facing west, it runs north-south");
  assert.equal(placeStates(side, 0)["minecraft:connection_north"], true);
  // The 7 older designs keep their states exactly (placeStates leaves them alone).
  for (const kind of OLD) for (const p of design(kind)) assert.equal(placeStates(p, 2), p.states);
});
