// Minimap terrain data (packs/map_bp/scripts/terrain.js): key collisions, surface/cave separation, shared
// invalidation, rotated-viewport coverage, the shared reading budget, and a fast flight over changing ground.
//   node --test tools/map-terrain.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { G } from "../packs/map_bp/scripts/glyphs.js";
import { cellWorld, colKey, glyphAt, planScan, spendBudget, TerrainWorld } from "../packs/map_bp/scripts/terrain.js";

const HALF = 10;
const OW = "minecraft:overworld";
/** The ground at a column: grass, with a lake from x = 200 on and a stone ridge for z > 300. */
const ground = (x, z) => (x >= 200 ? { kind: "water", y: 62, depth: 2 } : z > 300 ? { kind: "stone", y: 90, depth: 0 } : { kind: "grass", y: 70, depth: 0 });
const read = (world, store, now) => (_plan, p) => world.put(store, p.wx, p.wz, ground(p.wx, p.wz), now);
/** Every column the radar shows from here, by its own grid. */
function viewColumns(at, heading, north, radius) {
  const h = (heading * Math.PI) / 180;
  const set = new Set();
  for (let r = -HALF; r <= HALF; r++) for (let c = -HALF; c <= HALF; c++) {
    const p = cellWorld(at, Math.cos(h), Math.sin(h), north, (c * radius) / HALF, (r * radius) / HALF);
    set.add(colKey(p.x, p.z));
  }
  return set;
}
const unknownIn = (world, store, at, heading, north, radius) => {
  const h = (heading * Math.PI) / 180;
  let n = 0;
  for (let r = -HALF; r <= HALF; r++) for (let c = -HALF; c <= HALF; c++) {
    const p = cellWorld(at, Math.cos(h), Math.sin(h), north, (c * radius) / HALF, (r * radius) / HALF);
    if (glyphAt(world, store, p.x, p.z) === G.Q_EMPTY) n++;
  }
  return n;
};

test("column keys never collide, however far or negative", () => {
  const seen = new Map();
  for (const x of [-30_000_000, -131072, -4, -1, 0, 3, 4, 131068, 131072, 262144, 30_000_000])
    for (const z of [-30_000_000, -131072, -4, 0, 4, 131072, 262144, 30_000_000]) {
      const k = colKey(x, z);
      assert.ok(k >= 0);
      const col = `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
      assert.ok(!seen.has(k) || seen.get(k) === col, `key ${k} shared by ${seen.get(k)} and ${col}`);
      seen.set(k, col);
    }
  assert.equal(colKey(0, 0), colKey(3.9, 3.9));
  assert.notEqual(colKey(0, 0), colKey(4, 0));
  assert.equal(colKey(1e12, 0), -1, "beyond the world nothing is stored");
});

test("dimensions, the surface and each cave layer are separate stores", () => {
  const w = new TerrainWorld();
  const surface = w.store(OW);
  const nether = w.store("minecraft:nether");
  const low = w.store(OW, 12);
  const high = w.store(OW, 40);
  w.put(surface, 0, 0, { kind: "grass", y: 70, depth: 0 }, 1);
  w.put(low, 0, 0, { kind: "cave_floor", y: 11, depth: 0 }, 1);
  assert.equal(glyphAt(w, surface, 0, 0), G.Q_GRASS, "a cave player's reading is not on the surface");
  assert.equal(glyphAt(w, low, 0, 0), G.Q_CAVE_FLOOR);
  assert.equal(glyphAt(w, high, 0, 0), G.Q_EMPTY, "another height has not been read");
  assert.equal(glyphAt(w, nether, 0, 0), G.Q_EMPTY, "another dimension has not been read");
  assert.equal(w.store(OW), surface);
});

test("a changed block redraws every viewer of the dimension's stores, and only those", () => {
  const w = new TerrainWorld();
  const surface = w.store(OW);
  const layer = w.store(OW, 12);
  const nether = w.store("minecraft:nether");
  for (const s of [surface, layer, nether]) w.put(s, 8, 8, { kind: "stone", y: 60, depth: 0 }, 1);
  const before = [surface.ver, layer.ver, nether.ver];
  assert.equal(w.invalidate(OW, 9, 10), 2);
  assert.deepEqual([surface.ver, layer.ver, nether.ver], [before[0] + 1, before[1] + 1, before[2]]);
  assert.equal(glyphAt(w, surface, 8, 8), G.Q_EMPTY);
  assert.equal(glyphAt(w, nether, 8, 8), G.Q_STONE);
  assert.equal(w.put(surface, 8, 8, { kind: "stone", y: 60, depth: 0 }, 5), true);
  assert.equal(w.put(surface, 8, 8, { kind: "stone", y: 60, depth: 0 }, 6), false, "reading the same data again changes nothing");
});

test("old cave layers are dropped, never the surface", () => {
  const w = new TerrainWorld(100, 3);
  const surface = w.store(OW);
  for (let y = 0; y < 10; y++) w.store(OW, y);
  assert.ok(w.stores.size <= 4);
  assert.equal(w.store(OW), surface);
});

for (const heading of [0, 45, 90, 135, 200, 315]) {
  test(`the scan covers every column of the radar facing ${heading} degrees, corners included`, () => {
    const w = new TerrainWorld();
    const store = w.store(OW);
    const at = { x: 1003.5, z: -2210.2 };
    const radius = 24;
    const plan = planScan({ world: w, store, at, heading, north: false, radius, half: HALF, lead: { x: 0, z: 0 }, now: 0, maxAge: 2400 });
    const want = viewColumns(at, heading, false, radius);
    assert.deepEqual(new Set(plan.map((p) => p.key)), want);
    assert.equal(plan.length, want.size, "no column twice");
  });
}

test("north-up covers the square and the first reads are at the player", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const at = { x: 10, z: 10 };
  const plan = planScan({ world: w, store, at, heading: 77, north: true, radius: 24, half: HALF, lead: { x: 0, z: 0 }, now: 0, maxAge: 2400 });
  assert.deepEqual(new Set(plan.map((p) => p.key)), viewColumns(at, 77, true, 24));
  assert.equal(plan[0].key, colKey(10, 10));
});

test("a fast lead does not starve the columns under the player", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const at = { x: 0, z: 0 };
  const plan = planScan({ world: w, store, at, heading: 90, north: false, radius: 24, half: HALF, lead: { x: 28, z: 0 }, now: 0, maxAge: 2400 });
  const first = new Set(plan.slice(0, 24).map((p) => p.key));
  const near = [...new Set([[0, 0], [-4, 0], [0, -4], [-4, -4]].map(([x, z]) => colKey(x, z)))];
  for (const k of near) assert.ok(first.has(k), "the middle is read in the first 24 reads");
  const ahead = plan.slice(0, 24).filter((p) => p.wx > 20).length;
  assert.ok(ahead >= 4, "and so is the ground ahead");
});

test("stale columns come after missing ones", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const at = { x: 0, z: 0 };
  w.put(store, 0, 0, ground(0, 0), 0);
  const plan = planScan({ world: w, store, at, heading: 0, north: true, radius: 24, half: HALF, lead: { x: 0, z: 0 }, now: 5000, maxAge: 2400 });
  assert.equal(plan.at(-1).key, colKey(0, 0));
});

test("the reading budget is shared evenly, and a column read for one viewer is free for the next", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const picks = (x0) => Array.from({ length: 100 }, (_, i) => ({ wx: x0 + i * 4, wz: 0, key: colKey(x0 + i * 4, 0) }));
  const plans = ["a", "b", "c", "d"].map((id, i) => ({ id, store, picks: picks(i * 20_000) }));
  let reads = 0;
  const spent = spendBudget(plans, 48, 40, 2, 7, (_p, p) => {
    reads++;
    w.put(store, p.wx, p.wz, ground(p.wx, p.wz), 7);
  });
  assert.equal(reads, 48);
  assert.deepEqual([...spent.values()], [12, 12, 12, 12]);
  // The same columns for two viewers in one store: the second reads other ones with the shared budget.
  const same = [{ id: "x", store: w.store(OW, 3), picks: picks(500_000) }, { id: "y", store: w.store(OW, 3), picks: picks(500_000) }];
  reads = 0;
  spendBudget(same, 20, 20, 0, 9, (_p, p) => {
    reads++;
    w.put(same[0].store, p.wx, p.wz, ground(p.wx, p.wz), 9);
  });
  assert.equal(reads, 20);
  assert.equal(same[0].store.cols.size, 20, "twenty distinct columns, none read twice");
  // A viewer with little to do leaves its share to the others.
  reads = 0;
  const few = [{ id: "p", store, picks: picks(900_000).slice(0, 2) }, { id: "q", store, picks: picks(950_000) }];
  const s2 = spendBudget(few, 30, 40, 0, 11, (_p, p) => {
    reads++;
    w.put(store, p.wx, p.wz, ground(p.wx, p.wz), 11);
  });
  assert.equal(s2.get("p"), 2);
  assert.equal(s2.get("q"), 28);
});

test("flying fast over changing ground: the view fills in each tick and shows the lake as it comes", () => {
  const w = new TerrainWorld();
  const store = w.store(OW);
  const radius = 24;
  let x = 0;
  const speed = 3.2; // blocks a tick, elytra with a rocket
  let worst = 0;
  let sawLake = false;
  for (let tick = 1; tick <= 300; tick++) {
    x += speed;
    const at = { x, z: 40 };
    const heading = 90;
    const plan = planScan({ world: w, store, at, heading, north: false, radius, half: HALF, lead: { x: speed * 8, z: 0 }, now: tick, maxAge: 2400 });
    spendBudget([{ id: "f", store, picks: plan }], 48, 48, 0, tick, read(w, store, tick));
    if (tick > 5) {
      const unknown = unknownIn(w, store, at, heading, false, radius);
      worst = Math.max(worst, unknown);
    }
    if (x > 260) sawLake ||= glyphAt(w, store, x + 20, 40) === G.Q_WATER;
  }
  assert.ok(worst <= 9, `at most 9 of 441 cells unknown on any tick (worst ${worst})`);
  assert.ok(sawLake, "the lake shows once flown over");
  assert.equal(glyphAt(w, store, 100, 40), G.Q_GRASS);
  assert.equal(glyphAt(w, store, 600, 40), G.Q_WATER, "terrain changed along the flight");
});

test("two fliers and a cave walker share the budget and never see each other's ground", () => {
  const w = new TerrainWorld();
  const surface = w.store(OW);
  const cave = w.store(OW, 20);
  const radius = 24;
  const fliers = [{ id: "f1", x: 0, z: 0, dx: 3, dz: 0, h: 90 }, { id: "f2", x: 400, z: 400, dx: 0, dz: 3, h: 180 }];
  let worst = 0;
  for (let tick = 1; tick <= 120; tick++) {
    const plans = fliers.map((f) => {
      f.x += f.dx;
      f.z += f.dz;
      return { id: f.id, store: surface, picks: planScan({ world: w, store: surface, at: f, heading: f.h, north: false, radius, half: HALF, lead: { x: f.dx * 8, z: f.dz * 8 }, now: tick, maxAge: 2400 }) };
    });
    plans.push({ id: "c", store: cave, picks: planScan({ world: w, store: cave, at: { x: 0, z: 0 }, heading: 0, north: false, radius, half: HALF, lead: { x: 0, z: 0 }, now: tick, maxAge: 2400 }) });
    spendBudget(plans, 96, 48, tick, tick, (plan, p) => w.put(plan.store, p.wx, p.wz, plan.store === cave ? { kind: "cave_floor", y: 19, depth: 0 } : ground(p.wx, p.wz), tick));
    if (tick > 40) for (const f of fliers) worst = Math.max(worst, unknownIn(w, surface, f, f.h, false, radius));
  }
  assert.ok(worst <= 12, `both fliers keep a full picture (worst ${worst} unknown)`);
  for (const f of fliers) for (const g of [0, 45, 90]) assert.notEqual(glyphAt(w, surface, f.x - g, f.z), G.Q_CAVE_FLOOR);
  assert.equal(glyphAt(w, surface, 0, 0), G.Q_GRASS, "the cave walker's floor did not replace the surface where they stand");
});

test("a finished scan is planned again after sub-block or sub-2-degree motion that the radar draws", async () => {
  const { scanMemo } = await import("../packs/map_bp/scripts/terrain.js");
  const base = { storeId: "d|s", ver: 1, at: { x: 3.8, z: 0 }, heading: 0, north: false, radius: 64, now: 10, lead: { x: 0, z: 0 } };
  assert.notEqual(scanMemo(base), scanMemo({ ...base, at: { x: 4.3, z: 0 } }));
  assert.notEqual(scanMemo(base), scanMemo({ ...base, heading: 0.6 }));
  assert.equal(scanMemo({ ...base, heading: 5 }), scanMemo({ ...base, north: false, heading: 5 }));
  assert.equal(scanMemo({ ...base, heading: 5 }) === scanMemo({ ...base, north: true, heading: 40 }), false);
  assert.equal(scanMemo({ ...base, north: true, heading: 5 }), scanMemo({ ...base, north: true, heading: 40 }));
});

test("a failed read stores nothing, keeps old data, retries in a few ticks and loads next tick", async () => {
  const { MISS_RETRY } = await import("../packs/map_bp/scripts/terrain.js");
  const w = new TerrainWorld(6000, 4);
  const s = w.store("minecraft:overworld", undefined);
  const o = { world: w, store: s, at: { x: 0, z: 0 }, heading: 0, north: true, radius: 64, half: 10, lead: { x: 0, z: 0 }, maxAge: 2400 };
  const first = planScan({ ...o, now: 100 });
  assert.ok(first.length > 0);
  w.put(s, 0, 0, { kind: "stone", y: 70, depth: 0 }, 100);
  const k = first.find((p) => p.wx !== 0 || p.wz !== 0);
  w.miss(s, k.wx, k.wz, 100);
  assert.equal(s.cols.size, 1, "a miss stores no column");
  assert.ok(!planScan({ ...o, now: 100 + MISS_RETRY - 1 }).some((p) => p.key === k.key), "waits for the retry");
  assert.ok(planScan({ ...o, now: 100 + MISS_RETRY }).some((p) => p.key === k.key), "asked again");
  w.put(s, k.wx, k.wz, { kind: "grass", y: 65, depth: 0 }, 106);
  assert.equal(w.get(s, k.wx, k.wz).kind, "grass", "real data right after the chunk loads");
  assert.equal(s.miss.size, 0);
});
