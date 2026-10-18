// Minimap terrain data (packs/map_bp/scripts/terrain.js): key collisions, surface/cave separation, shared
// invalidation, rotated-viewport coverage, the shared reading budget, and a fast flight over changing ground.
//   node --test tools/map-terrain.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { G } from "../packs/map_bp/scripts/glyphs.js";
import { cellWorld, colKey, glyphAt, planScan, sampleResolution, spendBudget, TerrainWorld } from "../packs/map_bp/scripts/terrain.js";
import * as terrain from "../packs/map_bp/scripts/terrain.js";

const HALF = 10;
test("all four radar directions survive crowded edge markers at every heading", () => {
  const source = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8");
  const fn = source.match(/function radarOf\([\s\S]*?\n\}/)[0];
  const radarOf = vm.runInNewContext(`(${fn})`, {
    G, R: 10, RADAR_SIZE: 21, ROW: 22, RADAR_PIECES: 461, OVERWORLD: "minecraft:overworld", TERRAIN_TURN: 2,
    EMPTY_ROWS: Array.from({ length: 461 }, (_, i) => (i % 22 === 21 ? "\n" : G.Q_EMPTY)), prioBuf: new Float64Array(461), terrainBaseMemo: new Map(),
    YOU: Array.from({ length: 8 }, (_, i) => G[`Q_YOU_${i}`]),
    FRIEND_ARR: Array.from({ length: 8 }, (_, i) => G[`Q_FRIEND_${i}`]),
    PARTY_ARR: Array.from({ length: 8 }, (_, i) => G[`Q_PARTY_${i}`]),
    STAR_ARR: Array.from({ length: 8 }, (_, i) => G[`Q_STAR_${i}`]),
    KINDS: { other: { q: G.Q_OTHER, p: 5 }, mob: { q: G.Q_MOB, p: 6 } },
  });
  const markers = [[0, -200], [200, 0], [0, 200], [-200, 0]].map(([x, z]) => ({ kind: "other", x, z }));
  markers.push({ kind: "mob", x: 5, z: 5 });
  for (const north of [false, true]) for (let heading = 0; heading < 360; heading += 15) {
    const radar = radarOf(heading, markers, 24, north, { x: 0, z: 0 });
    const rows = radar.split("\n");
    assert.equal(rows.length, 21);
    assert.ok(rows.every((row) => [...row].length === 21), "grid/coverage is unchanged");
    assert.ok(Buffer.byteLength(radar) <= 1351, "existing subtitle protocol still fits");
    for (const cardinal of [G.Q_NORTH, G.Q_EAST, G.Q_SOUTH, G.Q_WEST])
      assert.equal([...radar].filter((c) => c === cardinal).length, 1, `${heading}/${north}: cardinal is never overwritten`);
    const playerArrows = Array.from({ length: 8 }, (_, i) => G[`Q_FRIEND_${i}`]);
    assert.equal([...radar].filter((c) => playerArrows.includes(c)).length, 4, "players sharing a cardinal cell remain beside its label");
    assert.ok(radar.includes(G.Q_MOB), "ordinary interior mob marker remains");
  }
});
const OW = "minecraft:overworld";
/** The ground at a column: grass, with a lake from x = 200 on and a stone ridge for z > 300. */
const ground = (x, z) => (x >= 200 ? { kind: "water", y: 62, depth: 2 } : z > 300 ? { kind: "stone", y: 90, depth: 0 } : { kind: "grass", y: 70, depth: 0 });
const read = (world, store, now) => (_plan, p) => world.put(store, p.wx, p.wz, ground(p.wx, p.wz), now, p.resolution);
/** Every column the radar shows from here, by its own grid. */
function viewColumns(at, heading, north, radius) {
  const h = (heading * Math.PI) / 180;
  const set = new Set();
  for (let r = -HALF; r <= HALF; r++) for (let c = -HALF; c <= HALF; c++) {
    const p = cellWorld(at, Math.cos(h), Math.sin(h), north, (c * radius) / HALF, (r * radius) / HALF);
    set.add(colKey(p.x, p.z));
    if (sampleResolution(c * radius / HALF, r * radius / HALF) === 1) set.add(colKey(p.x, p.z, 1));
  }
  return set;
}
const unknownIn = (world, store, at, heading, north, radius) => {
  const h = (heading * Math.PI) / 180;
  let n = 0;
  for (let r = -HALF; r <= HALF; r++) for (let c = -HALF; c <= HALF; c++) {
    const p = cellWorld(at, Math.cos(h), Math.sin(h), north, (c * radius) / HALF, (r * radius) / HALF);
    if (glyphAt(world, store, p.x, p.z, sampleResolution(c * radius / HALF, r * radius / HALF)) === G.Q_EMPTY) n++;
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
    spendBudget(plans, 96, 48, tick, tick, (plan, p) => { w.put(plan.store, p.wx, p.wz, plan.store === cave ? { kind: "cave_floor", y: 19, depth: 0 } : ground(p.wx, p.wz), tick, p.resolution); });
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
  const k = first.find((p) => p.key !== colKey(0, 0));
  w.miss(s, k.wx, k.wz, 100);
  assert.equal(s.cols.size, 1, "a miss stores no column");
  assert.ok(!planScan({ ...o, now: 100 + MISS_RETRY - 1 }).some((p) => p.key === k.key), "waits for the retry");
  assert.ok(planScan({ ...o, now: 100 + MISS_RETRY }).some((p) => p.key === k.key), "asked again");
  w.put(s, k.wx, k.wz, { kind: "grass", y: 65, depth: 0 }, 106);
  assert.equal(w.get(s, k.wx, k.wz).kind, "grass", "real data right after the chunk loads");
  assert.equal(s.miss.size, 0);
});

test("nearby one-block roofs have separate cache identities and deterministic samples", () => {
  assert.notEqual(colKey(2, 2, 1), colKey(3, 2, 1), "adjacent thin roofs cannot share a sample");
  assert.notEqual(colKey(2, 2, 1), colKey(2, 2, 4), "resolution is part of cache identity");
  const w = new TerrainWorld();
  const s = w.store(OW);
  const plan = planScan({ world: w, store: s, at: { x: 0.1, z: 0.1 }, heading: 0, north: true, radius: 24, half: HALF, lead: { x: 0, z: 0 }, now: 1, maxAge: 2400 });
  for (const p of plan) {
    assert.equal(p.wx, Math.floor(p.wx));
    assert.equal(p.wz, Math.floor(p.wz));
    assert.equal(colKey(p.wx, p.wz, p.resolution), p.key);
    if (p.resolution === 4) {
      assert.equal(((p.wx % 4) + 4) % 4, 2, "coarse samples always use the cell center");
      assert.equal(((p.wz % 4) + 4) % 4, 2);
    }
  }
  w.put(s, 2, 2, { kind: "path", y: 80, depth: 0 }, 1, 1);
  w.put(s, 3, 2, { kind: "brick", y: 90, depth: 0 }, 1, 1);
  assert.equal(w.get(s, 2, 2, 1).y, 80);
  assert.equal(w.get(s, 3, 2, 1).y, 90);
  assert.equal(w.invalidate(OW, 3, 2), 1);
  assert.equal(w.get(s, 3, 2, 1), undefined);
  assert.equal(w.get(s, 2, 2, 1).y, 80);
});

test("reusing shaded glyphs still responds to neighbor edits and removal at both resolutions", () => {
  for (const resolution of [1, 4]) {
    const w = new TerrainWorld();
    const s = w.store(OW);
    w.put(s, 0, 0, { kind: "stone", y: 80, depth: 0 }, 1, resolution);
    assert.equal(glyphAt(w, s, 0, 0, resolution), G.Q_STONE);
    w.put(s, -resolution, 0, { kind: "stone", y: 70, depth: 0 }, 2, resolution);
    assert.equal(glyphAt(w, s, 0, 0, resolution), G.Q_STONE_HI);
    w.put(s, -resolution, 0, { kind: "stone", y: 90, depth: 0 }, 3, resolution);
    assert.equal(glyphAt(w, s, 0, 0, resolution), G.Q_STONE_LO);
    w.invalidate(OW, -resolution, 0);
    assert.equal(glyphAt(w, s, 0, 0, resolution), G.Q_STONE);
  }
});

test("one budget turn is one real operation, including unfinished multi-operation columns", () => {
  const w = new TerrainWorld();
  const s = w.store(OW);
  const picks = Array.from({ length: 100 }, (_, i) => ({ key: colKey(i * 4, 0), wx: i * 4, wz: 0 }));
  const plans = ["a", "b", "c"].map((id) => ({ id, store: s, picks }));
  const stages = new Map();
  let operations = 0;
  const used = spendBudget(plans, 96, 48, 0, 10, (plan, p) => {
    operations++;
    const stage = (stages.get(p.key) ?? 0) + 1;
    stages.set(p.key, stage);
    if (stage < 3) return false;
    w.put(plan.store, p.wx, p.wz, { kind: "water", y: 64, depth: 3 }, 10);
    return true;
  });
  assert.equal(operations, 96);
  assert.deepEqual([...used.values()], [32, 32, 32]);
  assert.equal(s.cols.size, 32, "sharing includes partially completed columns");
  let n = 0;
  const single = { id: "single", store: w.store(OW, 12), picks: picks.slice(0, 1) };
  spendBudget([single], 48, 48, 0, 11, () => ++n >= 3);
  assert.equal(n, 3, "unfinished picks stay in the plan until their operations finish");
});

test("native-equivalent column reader yields each ray/block operation and visible materials", () => {
  assert.equal(typeof terrain.readColumn, "function", "surface reader is independently testable");
  const block = (id, y) => ({ typeId: `minecraft:${id}`, location: { y }, isAir: id === "air" });
  const run = (top, below = new Map(), layer) => {
    let operations = 0;
    const dim = {
      heightRange: { min: -64, max: 320 },
      getBlockFromRay(at, dir, opts) {
        operations++;
        assert.equal(opts.includeLiquidBlocks, true);
        assert.equal(opts.includePassableBlocks, true);
        assert.ok(opts.maxDistance <= 384);
        return { block: top };
      },
      getTopmostBlock() { operations++; return top; },
      getBlock(p) { operations++; return below.get(p.y); },
    };
    const reader = terrain.readColumn(dim, 2, 2, layer);
    let step = reader.next();
    while (!step.done) step = reader.next(step.value());
    return { value: step.value, operations };
  };
  assert.deepEqual(run(block("water", 64), new Map([[63, block("sand", 63)]])), { value: { kind: "water", y: 64, depth: 1 }, operations: 2 });
  assert.deepEqual(run(block("flowing_water", 64), new Map([[63, block("water", 63)], [61, block("seagrass", 61)]])), { value: { kind: "water", y: 64, depth: 3 }, operations: 3 });
  for (const id of ["seagrass", "kelp", "bubble_column"]) assert.equal(run(block(id, 64), new Map([[63, block("sand", 63)]])).value.kind, "water");
  assert.equal(run(block("sandstone", 80)).value.kind, "sandstone");
  assert.equal(run(block("red_sandstone", 80)).value.kind, "sandstone");
  assert.equal(run(block("sand", 64)).value.kind, "sand");
  assert.equal(run(block("gravel", 64)).value.kind, "stone");
  assert.equal(run(block("stone_brick_slab", 80)).value.kind, "brick");
  assert.equal(run(block("cherry_planks", 80)).value.kind, "path", "wood roofs are not blossom canopy");
  assert.equal(run(block("oak_slab", 64)).value.kind, "path", "waterlogged structure keeps its visible material");
  assert.equal(run(block("farmland", 64)).value.kind, "path");
  for (const id of ["wheat", "carrots", "potatoes", "beetroot"]) assert.equal(run(block(id, 65)).value.kind, "crop");
  assert.equal(run(block("white_concrete", 80)).value.kind, "snow");
  assert.equal(run(block("black_concrete", 80)).value.kind, "deepslate");
  assert.equal(run(block("gray_concrete", 80)).value.kind, "stone");
  assert.equal(run(block("short_grass", 65), new Map([[64, block("sand", 64)]])).value.kind, "sand");
  assert.equal(run(block("stone", 90), new Map([[21, block("air", 21)], [19, block("stone", 19)]]), 20).value.kind, "cave_floor");
  assert.throws(() => run(block("water", 64)), /unavailable/, "failed depth reads must retry, not invent depth");
});

test("the actual viewer planner retains its roof probe and stops reading after a saturated flight", (t) => {
  const w = new TerrainWorld();
  const source = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8");
  const planner = source.match(/function planFor\(player, now\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(planner, "exercise production planFor, not a second implementation of roof selection");
  const playerStore = new Map();
  const scanDone = new Map();
  const planFor = vm.runInNewContext(`(${planner})`, {
    terrain: w, playerStore, scanDone, terrainBaseMemo: new Map(), lastPose: new Map(), scanPlans: new Map(), planTurn: { left: Infinity, made: 0 }, PLAN_MIN_AGE: 4, TERRAIN_TURN: 2, prefsOf: () => ({ radar: true, terrain: true, north: false, radius: 24 }),
    headingOf: () => 90, aheadPicks: terrain.aheadPicks, colKey, MISS_RETRY: terrain.MISS_RETRY, SCAN_MAX_AGE: 2400, R: HALF,
  });
  let moving = true;
  const player = {
    id: "saturated", isValid: true, dimension: { id: OW }, location: { x: 0.1, y: 128, z: 40 },
    getVelocity: () => ({ x: moving ? 3.2 : 0, z: 0 }),
  };
  let peak = 0;
  const tick = (now) => {
    const plan = planFor(player, now);
    if (!plan) return 0;
    const spent = spendBudget([plan], 96, 48, 0, now, (p, pick) => {
      const store = pick.store ?? p.store;
      w.put(store, pick.wx, pick.wz, { kind: store.id.includes("|layer") ? "cave_floor" : "stone", y: store.id.includes("|layer") ? 63 : 80, depth: 0 }, now, pick.resolution);
    }).get(player.id) ?? 0;
    peak = Math.max(peak, spent);
    if (plan.pos >= plan.picks.length && !plan.missed) scanDone.set(player.id, plan.memo);
    assert.ok(w.store(OW).cols.size <= 6000);
    return spent;
  };
  for (let now = 1; now <= 2200; now++) {
    player.location.x += 3.2;
    tick(now);
  }
  const surface = w.store(OW);
  assert.equal(surface.cols.size, 6000, "the regression reaches the real default capacity");
  moving = false;
  player.location.y = 64;
  for (let now = 2201; now <= 2224; now++) tick(now);
  const idle = Array.from({ length: 12 }, (_, i) => tick(2225 + i));
  t.diagnostic(`saturated ${surface.cols.size} columns (${surface.fine.size} fine); stopped reads ${idle.join(",")}; peak ${peak}`);
  assert.equal(playerStore.get(player.id).id, `${OW}|layer64`, "roof80/player64 stays in its cave after saturation");
  assert.ok(surface.fine.size >= 100, "fine detail cannot shrink to a one-entry revolving door");
  assert.deepEqual(idle, Array(12).fill(0), "stationary detail and its exact roof probe remain cached");
  assert.ok(peak <= 48, "the fix cannot increase the real-operation allowance");
});

test("flowering and ordinary azalea leaves retain the same real canopy height", () => {
  for (const id of ["azalea_leaves", "flowering_azalea_leaves", "azalea_leaves_flowered"]) {
    let operations = 0;
    const reader = terrain.readColumn({
      heightRange: { min: -64, max: 320 },
      getBlockFromRay() { operations++; return { block: { typeId: `minecraft:${id}`, location: { y: 80 } } }; },
      getBlock() { operations++; return { typeId: "minecraft:air", location: { y: 79 } }; },
    }, 0, 0);
    let step = reader.next();
    while (!step.done) step = reader.next(step.value());
    assert.deepEqual(step.value, { kind: "birch", y: 80, depth: 0 }, id);
    assert.equal(operations, 1, "a solid canopy is not stripped as a passable flower");
  }
});

test("another viewer's detail cannot evict an active exact roof at saturation", () => {
  const w = new TerrainWorld();
  const surface = w.store(OW);
  const roof = { kind: "stone", y: 80, depth: 0 };
  w.put(surface, 0, 0, roof, 1, 1);
  for (let i = 1; i < 2000; i++) w.put(surface, i + 10000, 10000, roof, 1, 1);
  for (let i = 0; i < 4000; i++) w.put(surface, i * 4 + 100000, 100000, roof, 1);
  const source = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8").match(/function planFor\(player, now\) \{[\s\S]*?\n\}/)[0];
  const playerStore = new Map();
  const planFor = vm.runInNewContext(`(${source})`, {
    terrain: w, playerStore, scanDone: new Map(), terrainBaseMemo: new Map(), lastPose: new Map(), scanPlans: new Map(), planTurn: { left: Infinity, made: 0 }, PLAN_MIN_AGE: 4, TERRAIN_TURN: 2, prefsOf: () => ({ radar: true, terrain: true, north: false, radius: 24 }),
    headingOf: () => 90, aheadPicks: terrain.aheadPicks, colKey, MISS_RETRY: terrain.MISS_RETRY, SCAN_MAX_AGE: 2400, R: HALF,
  });
  const player = { id: "caver", isValid: true, dimension: { id: OW }, location: { x: 0, y: 64, z: 0 }, getVelocity: () => ({ x: 0, z: 0 }) };
  for (let now = 2; now <= 40; now++) {
    planFor(player, now);
    assert.equal(playerStore.get(player.id).id, `${OW}|layer64`, "a different moving viewer cannot make this caver briefly surface");
    w.put(surface, now + 5000, 5000, roof, now, 1);
    assert.equal(surface.cols.size, 6000);
  }
});

test("time budgets add their share each tick, save up to their most and spend at most their tick's most", async () => {
  const { Budget } = await import("../packs/map_bp/scripts/budget.js");
  const b = new Budget(0.5, 2, 1);
  assert.equal(b.left, 2, "starts with its savings full (a quiet server)");
  b.tick();
  assert.ok(b.ok);
  b.spend(1);
  assert.equal(b.ok, false, "a tick spends at most tickMax, whatever is saved");
  b.tick();
  assert.equal(b.left, 1.5);
  b.spend(3);
  assert.equal(b.left, -1.5, "a long piece of work is charged in full");
  b.tick();
  b.tick();
  b.tick();
  assert.equal(b.ok, false, "and paid back before more work");
  b.tick();
  assert.ok(b.ok && b.room > 0 && b.room <= 1);
  for (let i = 0; i < 20; i++) b.tick();
  assert.equal(b.left, 2, "savings stop at max");
});

test("the ground ahead of a fast viewer is listed nearest that point first, at most `limit`, missing before stale", () => {
  const w = new TerrainWorld();
  const s = w.store(OW);
  const all = terrain.aheadPicks(s, 101.5, -40.2, 34, 3000, 2400, 9999);
  assert.ok(all.length > 200, `the whole reach (${all.length})`);
  for (const p of all) assert.equal(colKey(p.wx, p.wz), p.key, "keys are the store's own");
  assert.equal(all[0].key, colKey(101.5, -40.2), "the point itself first");
  w.put(s, all[0].wx, all[0].wz, { kind: "grass", y: 70, depth: 0 }, 3000);
  w.put(s, all[1].wx, all[1].wz, { kind: "grass", y: 70, depth: 0 }, 100);
  w.miss(s, all[2].wx, all[2].wz, 2998);
  const some = terrain.aheadPicks(s, 101.5, -40.2, 34, 3000, 2400, 5);
  assert.equal(some.length, 5);
  assert.ok(!some.some((p) => p.key === all[0].key), "a fresh column is not read again");
  assert.ok(!some.some((p) => p.key === all[2].key), "a column that just failed waits for its retry");
  const rest = terrain.aheadPicks(s, 101.5, -40.2, 34, 3000, 2400, 9999);
  assert.equal(rest.at(-1).key, all[1].key, "a stale column comes after every missing one");
});

test("a built radar lists exactly the columns its own picture samples, and markers never stay behind", () => {
  const source = fs.readFileSync(new URL("../packs/map_bp/scripts/main.js", import.meta.url), "utf8");
  const fn = source.match(/function radarOf\([\s\S]*?\n\}/)[0];
  const w = new TerrainWorld();
  const store = w.store(OW);
  const ctx = {
    G, R: 10, RADAR_SIZE: 21, ROW: 22, RADAR_PIECES: 461, OVERWORLD: OW, TERRAIN_TURN: 2, COL: terrain.COL,
    KEY_BIAS: terrain.KEY_BIAS, KEY_SPAN: terrain.KEY_SPAN, MISS_RETRY: terrain.MISS_RETRY, SCAN_MAX_AGE: 2400, STALE_EVERY: 200,
    EMPTY_ROWS: Array.from({ length: 461 }, (_, i) => (i % 22 === 21 ? "\n" : G.Q_EMPTY)), prioBuf: new Float64Array(461), terrainBaseMemo: new Map(),
    YOU: Array.from({ length: 8 }, (_, i) => G[`Q_YOU_${i}`]), FRIEND_ARR: Array.from({ length: 8 }, (_, i) => G[`Q_FRIEND_${i}`]),
    PARTY_ARR: Array.from({ length: 8 }, (_, i) => G[`Q_PARTY_${i}`]), STAR_ARR: Array.from({ length: 8 }, (_, i) => G[`Q_STAR_${i}`]),
    KINDS: { mob: { q: G.Q_MOB, p: 7 } }, terrain: w, storeFor: () => store, terrainVerOf: () => `${store.id}#${w.viewVer(store, 0, 0, 999)}`,
    colKey, glyphAt, sampleCoord: terrain.sampleCoord, radarRebuilds: 0, radarStale: false,
  };
  const radarOf = vm.runInNewContext(`(${fn})`, ctx);
  const at = { x: 40.4, z: -17.6 };
  radarOf(37, [], 24, false, at, OW, true, "p", true, 10);
  const memo = ctx.terrainBaseMemo.get("p");
  const want = viewColumns({ x: Math.round(at.x), z: Math.round(at.z) }, 38, false, 24);
  assert.deepEqual(new Set(memo.need.map((p) => p.key)), want, "the list is the picture's own columns (coarse, and exact near the player)");
  assert.equal(memo.need.length, want.size, "no column twice");
  assert.ok(memo.need.findIndex((p) => p.resolution === 1) > memo.need.findLastIndex((p) => p.resolution !== 1), "the coarse picture first");
  for (const p of memo.need) w.put(store, p.wx, p.wz, ground(p.wx, p.wz), 10, p.resolution);
  radarOf(37, [], 24, false, at, OW, true, "p", true, 11);
  assert.equal(ctx.terrainBaseMemo.get("p").need.length, 0, "nothing left to read");
  const one = radarOf(37, [{ kind: "mob", x: at.x + 5, z: at.z, clamp: true }], 24, false, at, OW, true, "p", true, 12);
  const two = radarOf(37, [{ kind: "mob", x: at.x - 9, z: at.z + 4, clamp: true }], 24, false, at, OW, true, "p", true, 12);
  assert.equal([...one].filter((c) => c === G.Q_MOB).length, 1);
  assert.equal([...two].filter((c) => c === G.Q_MOB).length, 1, "the marker moved: the old cell shows its terrain again");
  assert.equal(two.split("\n").length, 21);
  const stale = radarOf(81, [], 24, false, at, OW, true, "p", false, 13);
  assert.ok(ctx.radarStale && stale.split("\n").length === 21, "without time to build the terrain again, the last picture is drawn and flagged");
});
