// Town Projects' automatic spots (packs/town_bp/scripts/sites.js): the natural allow list, the column model, the
// grading plan (the terrain rule: at most levelDepth, steps of at most 1), the scoring order, the scan on synthetic
// worlds (a hillside, a cabin and a path, a lake for the dock, unloaded columns) and every rejection.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import { FORWARD, designFootprint } from "../packs/town_bp/scripts/designs.js";
import {
  NATURAL, UNDER, WILD, WATERY, allowedInRegion, compareKeys, decodePlan, distTo, encodePlan, facingOut, gradePlan, isLeaves, isLog, median,
  readColumn, regionOf, rectOf, scanTown, scoreKey, UNKNOWN, SCAN, overlaps,
} from "../packs/town_bp/scripts/sites.js";

const ids = new Set(Object.values(MinecraftBlockTypes));
const id = (b) => `minecraft:${b}`;

test("allow lists: every id exists in vanilla-data, and the list is the plan's", () => {
  for (const set of [NATURAL, UNDER, WILD, WATERY]) for (const b of set) assert.ok(ids.has(b), `${b} is a vanilla block`);
  const plan = "grass_block dirt coarse_dirt podzol mycelium dirt_with_roots mud sand red_sand gravel clay stone granite diorite andesite deepslate tuff calcite sandstone red_sandstone snow snow_layer".split(" ");
  assert.deepEqual([...NATURAL].sort(), plan.map(id).sort());
  for (const b of ["oak_planks", "glass", "cobblestone", "white_terracotta", "farmland", "grass_path", "wheat", "oak_sapling", "lodestone", "sweet_berry_bush", "torch", "chest", "bed", "rail", "white_wool", "white_concrete", "oak_door", "standing_sign"]) {
    assert.ok(!NATURAL.has(id(b)) && !WILD.has(id(b)) && !UNDER.has(id(b)), `${b} is man-made`);
    assert.equal(allowedInRegion({ id: id(b) }, false), false, `${b} is not allowed in a region`);
  }
  assert.equal(allowedInRegion({ id: "minecraft:block_from_a_future_update" }, false), false, "anything unknown is man-made");
  assert.ok(allowedInRegion({ id: id("water") }, true) && !allowedInRegion({ id: id("water") }, false), "water only for a dock");
  assert.ok(isLog(id("oak_log")) && isLog(id("stripped_birch_log")) && isLog(id("crimson_stem")) && isLog(id("mangrove_roots")) && !isLog(id("oak_planks")));
  assert.ok(isLeaves(id("oak_leaves")) && isLeaves(id("azalea_leaves_flowered")) && !isLeaves(id("oak_log")));
});

/** A column from a list of blocks top down, starting at topY. */
const columnOf = (topY, blocks, under = ["dirt", "dirt", "stone", "stone"]) => {
  const all = [...blocks, ...under];
  return (y) => {
    const i = topY - y;
    if (i < 0) return { id: id("air") };
    const b = all[i];
    if (b === undefined) return { id: id("stone") };
    return typeof b === "string" ? { id: id(b) } : b;
  };
};

test("readColumn: natural ground, plants, leaves, trees, overhangs, water, lava, unknown", () => {
  assert.deepEqual(readColumn(64, columnOf(64, ["grass_block"])), { k: "N", g: 64, top: id("grass_block") });
  assert.deepEqual(readColumn(66, columnOf(66, ["air", "short_grass", "grass_block"])), { k: "N", g: 64, top: id("grass_block") }, "plants are skipped");
  assert.equal(readColumn(66, columnOf(66, ["snow_layer", "air", "snow"])).k, "N");
  const natural = readColumn(68, columnOf(68, [{ id: id("oak_leaves"), persistent: false }, "air", "air", "air", "grass_block"]));
  assert.deepEqual(natural, { k: "N", g: 64, top: id("grass_block"), lf: 1 }, "natural leaves count as natural, marked");
  assert.equal(readColumn(68, columnOf(68, [{ id: id("oak_leaves"), persistent: true }, "air", "grass_block"])).k, "M", "persistent (placed) leaves are man-made");
  assert.equal(readColumn(68, columnOf(68, [{ id: id("oak_leaves"), persistent: false }, "oak_log", "grass_block"])).k, "T", "a log: a tree");
  assert.equal(readColumn(70, columnOf(70, ["dirt", "air", "air", "grass_block"])).k, "M", "a dirt roof over an air gap");
  assert.equal(readColumn(64, columnOf(64, ["grass_block"], ["oak_planks", "dirt"])).k, "M", "natural ground over a basement");
  assert.equal(readColumn(64, columnOf(64, ["oak_planks"])).k, "M");
  assert.equal(readColumn(64, columnOf(64, ["grass_path"])).k, "M", "a path");
  assert.equal(readColumn(64, columnOf(64, ["lodestone"])).k, "M", "a waystone");
  assert.equal(readColumn(64, columnOf(64, ["farmland"])).k, "M");
  assert.equal(readColumn(65, columnOf(65, ["wheat", "farmland"])).k, "M", "crops are man-made");
  // Water: getTopmostBlock gives the bed; the block above is water; surface() says where the water's top is.
  const lake = (y) => (y > 60 && y <= 63 ? { id: id("water") } : y === 60 ? { id: id("sand") } : y < 60 ? { id: id("stone") } : { id: id("air") });
  assert.deepEqual(readColumn(60, lake, () => 63), { k: "W", g: 60, w: 63, top: id("sand") });
  assert.equal(readColumn(60, lake, () => undefined).k, "U", "no surface: unknown");
  assert.equal(readColumn(63, (y) => (y === 63 ? { id: id("water") } : lake(y))).k, "W", "water on top");
  assert.equal(readColumn(64, columnOf(64, ["lava"])).k, "L");
  assert.equal(readColumn(undefined, columnOf(64, [])), UNKNOWN);
  assert.equal(readColumn(64, () => undefined), UNKNOWN, "a read that fails (unloaded) is unknown");
  assert.equal(readColumn(64, (y) => (y >= 63 ? { id: id("grass_block") } : undefined)).k, "U", "unloaded below");
});

/** A map of columns from a height function and overrides. */
const worldOf = (h, over = new Map()) => (x, z) => over.get(`${x},${z}`) ?? { k: "N", g: h(x, z), top: id("grass_block") };

test("gradePlan: footprint at the pad, the apron steps back, at most levelDepth, steps of at most 1", () => {
  const fp = { x1: 0, z1: 0, x2: 4, z2: 4 };
  const region = regionOf(fp);
  const flat = worldOf(() => 64);
  const p0 = gradePlan(region, fp, flat, 64, 3);
  assert.ok(p0.ok && p0.vol === 0, "flat ground needs nothing");
  // A slope along x: one block per column.
  const slope = worldOf((x) => 64 + Math.floor(x / 2));
  const p1 = gradePlan(region, fp, slope, 65, 3);
  assert.ok(p1.ok, `slope ${p1.why}`);
  const rd = region.z2 - region.z1 + 1;
  for (let k = 0; k < p1.t.length; k++) {
    const x = region.x1 + Math.floor(k / rd);
    const z = region.z1 + (k % rd);
    if (distTo(fp, x, z) === 0) assert.equal(p1.t[k], 65, "footprint at the pad");
    assert.ok(Math.abs(p1.t[k] - p1.g[k]) <= 3, "at most 3");
  }
  // Steps: neighbors (and the ring outside) differ by at most 1 where something changed.
  const at = (x, z) => {
    if (distTo(region, x, z) === 0) return p1.t[(x - region.x1) * rd + (z - region.z1)];
    return slope(x, z).g;
  };
  for (let x = region.x1 - 1; x <= region.x2 + 1; x++)
    for (let z = region.z1 - 1; z <= region.z2 + 1; z++)
      for (const [dx, dz] of [[1, 0], [0, 1]]) if (distTo(region, x, z) === 0 || distTo(region, x + dx, z + dz) === 0) assert.ok(Math.abs(at(x, z) - at(x + dx, z + dz)) <= 1, `step at ${x},${z}`);
  // Too steep: more than 3 under the footprint.
  const cliff = worldOf((x) => (x >= 3 ? 70 : 64));
  assert.equal(gradePlan(region, fp, cliff, 64, 3).ok, false);
  assert.equal(gradePlan(region, fp, worldOf((x) => 64 + (x >= 3 ? 1 : 0)), 64, 0).ok, false, "levelDepth 0: never level");
  // A cut next to water at or above the new top.
  // A rise of 3: the footprint is cut by 3, the apron by 2 and 1.
  const hill = worldOf(() => 67);
  const ring = `${region.x2 + 1},2`;
  assert.ok(gradePlan(region, fp, hill, 64, 3).ok, "a cut of 3 with a stepped apron");
  assert.equal(gradePlan(region, fp, worldOf(() => 67, new Map([[ring, { k: "W", g: 60, w: 67 }]])), 64, 3).ok, false, "water above the cut's new top would flow in");
  assert.ok(gradePlan(region, fp, worldOf(() => 67, new Map([[ring, { k: "W", g: 60, w: 66 }]])), 64, 3).ok, "water level with the new top stays put");
  assert.equal(gradePlan(region, fp, worldOf(() => 67, new Map([[ring, { k: "W", g: 60, w: 63 }]])), 64, 3).ok, false, "the step down to the water still counts");
  assert.equal(gradePlan(region, fp, worldOf(() => 67, new Map([[ring, { k: "L", g: 67 }]])), 64, 3).ok, false, "lava next to a cut");
  assert.ok(gradePlan(region, fp, hill, 67, 3).ok);
  // A natural step that nothing changes stays (it's nature, not ours).
  const natural = new Map([[`${region.x1 - 1},${region.z1}`, { k: "N", g: 67 }]]);
  assert.ok(gradePlan(region, fp, worldOf(() => 64, natural), 64, 3).ok);
});

test("plans: encode and decode, damaged plans read as none", () => {
  const fp = { x1: 10, z1: 20, x2: 12, z2: 22 };
  const region = regionOf(fp);
  const slope = worldOf((x) => 60 + Math.floor((x - 6) / 2));
  const pad = median([...Array(9)].map((_, k) => slope(10 + Math.floor(k / 3), 20).g));
  const plan = gradePlan(region, fp, slope, pad, 3);
  assert.ok(plan.ok);
  const lv = encodePlan(plan.t, plan.g, pad);
  assert.equal(lv.length, 7 * 7);
  assert.match(lv, /^[.0-6]+$/);
  const cols = decodePlan(lv, region, pad);
  for (const c of cols) assert.equal(c.t, plan.t[(c.x - region.x1) * 7 + (c.z - region.z1)]);
  assert.equal(cols.length, plan.t.filter((t, k) => t !== plan.g[k]).length);
  assert.equal(decodePlan("..x", region, pad), undefined);
  assert.equal(decodePlan(undefined, region, pad), undefined);
  assert.equal(decodePlan(lv.slice(1), region, pad), undefined);
  assert.equal(median([3, 1, 2, 10]), 2);
});

test("scoring order: least leveling, then already level, then height variety, then distance", () => {
  const k = (vol, dist, variety, well = false) => scoreKey({ vol, dist, variety, well });
  const sorted = (...keys) => keys.sort(compareKeys);
  assert.ok(compareKeys(k(0, 30, 3), k(6, 10, 0)) < 0, "a bucket less leveling wins over distance and variety");
  assert.ok(compareKeys(k(0, 20, 0), k(3, 20, 0)) < 0, "same bucket: already level first");
  assert.ok(compareKeys(k(2, 30, 0), k(2, 10, 2)) < 0, "then fewer spots at the same height");
  assert.ok(compareKeys(k(2, 10, 1), k(2, 20, 1)) < 0, "then nearer");
  assert.ok(compareKeys(k(0, 24, 0, true), k(6, 8, 0, true)) > 0, "the well's distance counts 4 times: 12 blocks nearer is worth a bucket of leveling");
  assert.ok(compareKeys(k(0, 24, 0), k(6, 8, 0)) < 0, "for other builds it takes 48 blocks");
  assert.deepEqual(sorted([1, 0], [0, 5], [0, 1]), [[0, 1], [0, 5], [1, 0]]);
});

test("facing: the front faces the center", () => {
  for (const [dx, dz] of [[10, 0], [-10, 0], [0, 10], [0, -10], [7, 3], [-2, -9]]) {
    const f = facingOut(dx, dz);
    assert.ok(FORWARD[f].x * dx + FORWARD[f].z * dz > 0, `forward points away from the center at ${dx},${dz}`);
  }
});

/** Runs a scan over a synthetic world; returns its result and how many columns it read. */
function run(input, colAt, blockAt = () => ({ id: id("stone") }), claims = () => 0) {
  const gen = scanTown(input);
  let reads = 0;
  let r = gen.next();
  while (!r.done) {
    const q = r.value;
    let ans;
    if (q[0] === "c") {
      reads++;
      ans = colAt(q[1], q[2]);
    } else if (q[0] === "b") ans = blockAt(q[1], q[2], q[3]);
    else ans = claims(q);
    r = gen.next(ans);
  }
  return { ...r.value, reads };
}

const box = (build) => (s) => designFootprint(build, s);
const PROJECTS = [
  { id: "well", well: true, box: box("well") },
  { id: "notice_board", box: box("notice_board") },
  { id: "lamps", box: box("lamps") },
  { id: "garden", box: box("garden") },
  { id: "stall", box: box("stall") },
  { id: "bell_tower", box: box("bell_tower") },
];
const base = { cx: 0, cz: 0, radius: 96, depth: 3 };

/** Checks the terrain rule on every pick: plan within 3, footprint at the pad, steps of at most 1. */
function checkPicks(picks, colAt, depth = 3) {
  for (const { id: pid, spot } of picks) {
    const p = PROJECTS.find((x) => x.id === pid);
    const fp = rectOf(p.box(spot));
    const region = regionOf(fp);
    const pad = spot.y - 1;
    const cols = spot.lv ? decodePlan(spot.lv, region, pad) : [];
    assert.ok(cols, `${pid}: its plan reads`);
    const t = new Map(cols.map((c) => [`${c.x},${c.z}`, c.t]));
    const h = (x, z) => t.get(`${x},${z}`) ?? colAt(x, z).g;
    for (let x = region.x1 - 1; x <= region.x2 + 1; x++)
      for (let z = region.z1 - 1; z <= region.z2 + 1; z++) {
        if (distTo(region, x, z) === 0) assert.ok(Math.abs(h(x, z) - colAt(x, z).g) <= depth, `${pid}: at most ${depth} at ${x},${z}`);
        if (distTo(fp, x, z) === 0) assert.equal(h(x, z), pad, `${pid}: footprint at the pad`);
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const a = distTo(region, x, z) === 0;
          const b = distTo(region, x + dx, z + dz) === 0;
          const changed = t.has(`${x},${z}`) || t.has(`${x + dx},${z + dz}`);
          if ((a || b) && changed) assert.ok(Math.abs(h(x, z) - h(x + dx, z + dz)) <= 1, `${pid}: step at ${x},${z}`);
        }
      }
    assert.ok(FORWARD[spot.f].x * (spot.x - base.cx) + FORWARD[spot.f].z * (spot.z - base.cz) > 0, `${pid} faces the center`);
  }
  // No two regions overlap.
  for (let i = 0; i < picks.length; i++)
    for (let j = i + 1; j < picks.length; j++) {
      const a = regionOf(rectOf(PROJECTS.find((x) => x.id === picks[i].id).box(picks[i].spot)));
      const b = regionOf(rectOf(PROJECTS.find((x) => x.id === picks[j].id).box(picks[j].spot)));
      assert.ok(a.x2 < b.x1 || b.x2 < a.x1 || a.z2 < b.z1 || b.z2 < a.z1, `${picks[i].id} and ${picks[j].id} keep apart`);
    }
}

test("scan: flat ground, every project gets a level spot near the center, the well nearest", () => {
  const flat = worldOf(() => 64);
  const res = run({ ...base, projects: PROJECTS }, flat);
  assert.deepEqual(res.nos, []);
  assert.deepEqual(res.wait, []);
  assert.equal(res.picks.length, PROJECTS.length);
  for (const { spot } of res.picks) assert.ok(spot.a === 1 && spot.y === 65 && spot.lv === undefined, "already level: no plan");
  checkPicks(res.picks, flat);
  const well = res.picks.find((p) => p.id === "well").spot;
  assert.ok(Math.hypot(well.x, well.z) <= 8, `the well is near the center (${well.x}, ${well.z})`);
  assert.ok(res.reads < 9000, `reads stay bounded (${res.reads})`);
});

test("scan: a terraced hillside keeps more than one pad height, and every plan follows the rule", () => {
  // Terraces of 2 blocks every 6 blocks, rising to the east, plus a gentle slope north-south.
  const hill = worldOf((x, z) => 64 + 2 * Math.floor((x + 100) / 6) - 33 + Math.floor(Math.abs(z) / 9));
  const res = run({ ...base, projects: PROJECTS }, hill);
  assert.deepEqual(res.nos, []);
  checkPicks(res.picks, hill);
  const pads = new Set(res.picks.map((p) => p.spot.y - 1));
  assert.ok(pads.size > 1, `more than one pad height (${[...pads]})`);
  assert.ok(res.picks.some((p) => p.spot.lv), "some spots are leveled");
});

test("scan: a planks cabin and a path are avoided, with the 2-block margin", () => {
  const over = new Map();
  for (let x = 5; x <= 11; x++) for (let z = -3; z <= 3; z++) over.set(`${x},${z}`, { k: "M", g: 68 }); // the cabin
  for (let x = -40; x <= 40; x++) over.set(`${x},9`, { k: "M", g: 64 }); // a grass_path line
  const world = worldOf(() => 64, over);
  const res = run({ ...base, projects: PROJECTS }, world);
  assert.deepEqual(res.nos, []);
  for (const { id: pid, spot } of res.picks) {
    const region = regionOf(rectOf(PROJECTS.find((x) => x.id === pid).box(spot)));
    for (let x = region.x1; x <= region.x2; x++) for (let z = region.z1; z <= region.z2; z++) assert.ok(!over.has(`${x},${z}`), `${pid} avoids ${x},${z}`);
  }
});

test("scan rejections: trees, leaves near a tree, water, lava, overlaps, posts, places, claims, placed cells, the edge", () => {
  const flat = worldOf(() => 64);
  const one = (input, world = flat, extra) => run({ ...base, projects: [PROJECTS[0]], ...input }, world, extra?.block, extra?.claims);
  const near = (spot, x, z) => {
    const region = regionOf(rectOf(PROJECTS[0].box(spot)));
    return distTo(region, x, z) === 0;
  };
  const free = one({});
  const s0 = free.picks[0].spot;
  // Each exclusion at the first pick moves the well somewhere else.
  const posts = one({ posts: [{ x: s0.x, z: s0.z + 3, r: 6 }] });
  assert.notDeepEqual(posts.picks[0].spot, s0, "a townsfolk post moves it");
  const pr = regionOf(rectOf(PROJECTS[0].box(posts.picks[0].spot)));
  assert.ok(Math.hypot(Math.max(pr.x1 - s0.x, 0, s0.x - pr.x2), Math.max(pr.z1 - s0.z - 3, 0, s0.z + 3 - pr.z2)) > 6, "and keeps 6 blocks from it");
  const claimed = one({ claims: [{ x1: s0.x - 1, z1: s0.z, x2: s0.x + 1, z2: s0.z + 6 }] });
  assert.notDeepEqual(claimed.picks[0].spot, s0, "a claim moves it");
  const taken = one({ taken: [regionOf(rectOf(PROJECTS[0].box(s0)))] });
  assert.notDeepEqual(taken.picks[0].spot, s0, "another project's region moves it");
  const placed = one({ placed: (r) => distTo(r, s0.x, s0.z + 2) === 0 });
  assert.notDeepEqual(placed.picks[0].spot, s0, "a placed-block cell moves it");
  const more = one({ claimsMore: true }, flat, { claims: (q) => (q[1] <= s0.x && s0.x <= q[3] && q[2] <= s0.z + 3 && s0.z + 3 <= q[4] ? 1 : 0) });
  assert.notDeepEqual(more.picks[0].spot, s0, "with more than 10 claims, each finalist is asked");
  // One odd column in the 2-block margin (the region's corner, not the footprint) moves the spot.
  const region0 = regionOf(rectOf(PROJECTS[0].box(s0)));
  const corner = [region0.x1, region0.z1];
  assert.ok(near(s0, ...corner), "the corner is in the first spot's region");
  for (const kind of [{ k: "T", g: 64 }, { k: "W", g: 60, w: 64 }, { k: "L", g: 64 }, { k: "M", g: 64 }, UNKNOWN]) {
    const res = one({ final: true }, worldOf(() => 64, new Map([[corner.join(","), kind]])));
    assert.ok(res.picks[0] && !near(res.picks[0].spot, ...corner), `a ${kind.k} column in the margin is avoided`);
  }
  // Natural leaves next to a tree just outside the region.
  const leafy = new Map([[`${region0.x2 + 1},${region0.z1 + 2}`, { k: "T", g: 64 }], [`${region0.x2},${region0.z1 + 2}`, { k: "N", g: 64, lf: 1 }]]);
  assert.notDeepEqual(one({}, worldOf(() => 64, leafy)).picks[0].spot, s0, "leaves of a tree are not cleared");
  // A cut over a cave: the finalist's block check fails.
  const bump = worldOf((x, z) => (distTo(rectOf(PROJECTS[0].box(s0)), x, z) === 0 && x === s0.x ? 65 : 64));
  const cave = one({}, bump, { block: (x, y, z) => ({ id: id(x === s0.x && y < 64 ? "air" : "stone") }) });
  assert.ok(cave.picks[0], "another spot is found");
  // The edge: nothing within radius - 4.
  assert.deepEqual(one({ radius: 12 }).nos, ["well"], "a town too small for the well");
  // Nothing anywhere: none.
  const water = run({ ...base, radius: 40, projects: [PROJECTS[1]] }, () => ({ k: "W", g: 50, w: 62 }));
  assert.deepEqual(water.nos, ["notice_board"]);
});

test("scan: unknown columns wait, and a final scan takes the best valid spot", () => {
  // Everything within 30 blocks of the center is unloaded; the rest is flat.
  const world = (x, z) => (Math.hypot(x, z) < 30 ? UNKNOWN : { k: "N", g: 64, top: id("grass_block") });
  const res = run({ ...base, projects: [PROJECTS[0]] }, world);
  assert.deepEqual(res.wait, ["well"], "a nearer candidate might be better: wait");
  assert.equal(res.picks.length, 0);
  const fin = run({ ...base, projects: [PROJECTS[0]], final: true }, world);
  assert.equal(fin.picks.length, 1, "final: the best known spot");
  const all = run({ ...base, projects: [PROJECTS[0]] }, () => UNKNOWN);
  assert.deepEqual(all.wait, ["well"], "nothing loaded: wait, never none");
});

test("scan: the dock goes on the shore nearest the center, facing the water, with water under its deck", () => {
  // Land to x < 20 (y 63), a lake from x 20 (bed 58, surface 62).
  const shore = (x, z) => (x >= 20 ? { k: "W", g: 58, w: 62, top: id("sand") } : { k: "N", g: x >= 17 ? 62 : 63, top: id("grass_block") });
  const dock = { id: "dock", dock: true, box: box("dock") };
  const res = run({ ...base, projects: [dock] }, shore);
  assert.equal(res.picks.length, 1, JSON.stringify(res));
  const s = res.picks[0].spot;
  assert.equal(s.f, 3, "faces east, over the lake");
  assert.equal(s.y, 63, "s.y = water surface + 1");
  assert.ok(s.x === 19 && Math.abs(s.z) <= 3, `on the shore nearest the center (${s.x}, ${s.z})`);
  assert.equal(s.lv, undefined, "no leveling for a dock");
  const fp = rectOf(dock.box(s));
  for (let x = fp.x1; x <= fp.x2; x++) for (let z = fp.z1; z <= fp.z2; z++) assert.equal(shore(x, z).k, "W");
  assert.deepEqual(run({ ...base, projects: [dock] }, worldOf(() => 64)).nos, ["dock"], "no water: no dock spot");
});

test("scan: a project with `near` (the garden pen) goes beside that point, not near the center, still facing the center", () => {
  const flat = worldOf(() => 64);
  const garden = { x: 30, z: 0 };
  const gardenRegion = regionOf(rectOf(designFootprint("garden", { x: 27, y: 65, z: 0, f: 3 })));
  const pen = { id: "pen", near: garden, box: box("pen") };
  const res = run({ ...base, projects: [pen], taken: [gardenRegion] }, flat);
  assert.deepEqual(res.nos, []);
  const s = res.picks[0].spot;
  const d = Math.hypot(s.x - garden.x, s.z - garden.z);
  assert.ok(d >= SCAN.minNear && d <= SCAN.minNear + SCAN.ringStep * 2, `beside the garden (${s.x}, ${s.z}, ${d.toFixed(1)} away)`);
  assert.ok(!overlaps(regionOf(rectOf(designFootprint("pen", s))), gardenRegion), "not over the garden");
  assert.ok(FORWARD[s.f].x * s.x + FORWARD[s.f].z * s.z > 0, "it faces the center");
  // Without near, the same pen goes near the center instead.
  const plain = run({ ...base, projects: [{ id: "pen", box: box("pen") }], taken: [gardenRegion] }, flat).picks[0].spot;
  assert.ok(Math.hypot(plain.x, plain.z) <= SCAN.minOther + SCAN.ringStep, `near the center without it (${plain.x}, ${plain.z})`);
  // Nothing beside the point (all of it man-made): no spot, rather than one far away.
  const built = (x, z) => (Math.hypot(x - garden.x, z - garden.z) <= SCAN.maxNear + 8 ? { k: "M" } : flat(x, z));
  assert.deepEqual(run({ ...base, projects: [pen] }, built).nos, ["pen"]);
});

test("scan pacing: work on columns already read still ends the tick (F37 review), so no tick evaluates every candidate", () => {
  // Rolling ground and five 7 x 7 houses: houses after the first re-walk rings the first one read (all cached).
  const roll = worldOf((x, z) => 64 + Math.round(2 * Math.sin(x / 9) + 2 * Math.cos(z / 11)));
  let positions = 0;
  const houses = ["house_1", "house_2", "house_3", "house_4", "house_5"].map((hid) => ({
    id: hid,
    box: (s) => {
      positions++;
      return designFootprint("house", s);
    },
  }));
  const gen = scanTown({ ...base, projects: [{ id: "well", well: true, box: box("well") }, ...houses] });
  let most = 0;
  let ticks = 0;
  let r = gen.next();
  while (!r.done) {
    const q = r.value;
    most = Math.max(most, positions);
    positions = 0;
    if (q[0] === "tick") ticks++;
    r = gen.next(q[0] === "c" ? roll(q[1], q[2]) : q[0] === "b" ? { id: id("stone") } : q[0] === "claims" ? 0 : undefined);
  }
  assert.equal(r.value.picks.length, 6, "every project still gets a spot");
  assert.ok(ticks > 100, `the scan asks to end the tick (${ticks})`);
  // Each position costs at least 8 units of SCAN.workTick, so at most workTick / 8 (plus the one that crosses it).
  assert.ok(most <= SCAN.workTick / 8 + 1, `positions looked at between two requests: ${most}`);
  const src = readFileSync(new URL("../packs/town_bp/scripts/main.js", import.meta.url), "utf8");
  assert.match(src, /if \(q\[0\] === "tick"\) return;/, "stepScan ends its tick on the scan's request");
});

test("scan pacing: no single step does much more than SCAN.workTick lookups, grading plans included (QuickJS spikes)", () => {
  // On BDS a single gradePlan over a big region took 17-20 ms in one tick. Each column lookup (read or cached) is one
  // cache Map get: count them between two requests the scan makes.
  const roll = worldOf((x, z) => 64 + Math.round(2 * Math.sin(x / 9) + 2 * Math.cos(z / 11)));
  const projects = [
    { id: "well", well: true, box: box("well") },
    { id: "bell_tower", box: box("bell_tower") },
    { id: "garden", box: box("garden") },
    { id: "stall", box: box("stall") },
    ...["house_1", "house_2", "house_3"].map((hid) => ({ id: hid, box: box("house") })),
  ];
  const get = Map.prototype.get;
  let gets = 0;
  Map.prototype.get = function (k) {
    gets++;
    return get.call(this, k);
  };
  let most = 0;
  let res;
  try {
    const gen = scanTown({ ...base, projects });
    let r = gen.next();
    while (!r.done) {
      most = Math.max(most, gets);
      gets = 0;
      const q = r.value;
      r = gen.next(q[0] === "c" ? roll(q[1], q[2]) : q[0] === "b" ? { id: id("stone") } : q[0] === "claims" ? 0 : undefined);
    }
    most = Math.max(most, gets);
    res = r.value;
  } finally {
    Map.prototype.get = get;
  }
  assert.equal(res.picks.length, projects.length, "every project still gets a spot");
  // A grading row of the biggest region (13 columns, each with 4 sides and 2 lookups) may cross the budget once.
  assert.ok(most <= SCAN.workTick + 160, `lookups in one step: ${most} (workTick ${SCAN.workTick})`);
});
