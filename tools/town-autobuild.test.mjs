// Town Projects' build at an automatic spot (main.js: readCol, checkRegion, applyBuild, placeDesignSteps,
// restoreGround), run on a fake hillside: the scan picks a leveled spot, the check passes, the build levels the ground
// (footprint at the pad, apron steps of at most 1, nothing outside the region changed, a man-made block never
// touched), applying it again changes nothing, a build interrupted half way and resumed ends the same, and the saved
// region put back restores every block.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as designs from "../packs/town_bp/scripts/designs.js";
import * as placed from "../packs/town_bp/scripts/placed.js";
import * as sites from "../packs/town_bp/scripts/sites.js";

const main = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "main.js"), "utf8");
const NAMES = ["perm", "canReplace", "wallFacing", "SIDES", "keyOf", "PLANTS", "GROUND", "WATER", "isOptional", "designOf", "spill", "placeDesignSteps", "blockInfo", "readCol", "fillTop", "checkRegion", "applyBuild", "restoreGround", "autoGeometry", "footprint", "itemName"];

/** The named top-level declarations of main.js, as source. */
function extract() {
  const src = ts.createSourceFile("main.js", main, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const out = new Map();
  ts.forEachChild(src, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && NAMES.includes(n.name.text)) out.set(n.name.text, n.getText(src));
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && NAMES.includes(d.name.text)) out.set(d.name.text, n.getText(src));
  });
  for (const n of NAMES) assert.ok(out.has(n), `main.js has ${n}`);
  return [...new Set(out.values())].join("\n");
}

/** A fake dimension: terrain from a height function, plus blocks set on it. */
function fakeWorld(h, topId = "minecraft:grass_block") {
  const set = new Map();
  let changes = 0;
  let falls = 0;
  const natural = (x, y, z) => {
    const g = h(x, z);
    if (y > g) return { id: "minecraft:air" };
    if (y === g) return { id: topId };
    if (y >= g - 3) return { id: "minecraft:dirt" };
    return { id: "minecraft:stone" };
  };
  const read = (x, y, z) => set.get(`${x},${y},${z}`) ?? natural(x, y, z);
  const permOf = (id, states = {}) => ({
    type: { id },
    getAllStates: () => states,
    getState: (k) => states[k],
    matches: (i, st) => i === id && JSON.stringify(st ?? {}) === JSON.stringify(states),
  });
  const block = (x, y, z) => {
    const b = read(x, y, z);
    return {
      location: { x, y, z },
      typeId: b.id,
      isAir: b.id === "minecraft:air",
      isLiquid: b.id === "minecraft:water",
      permutation: permOf(b.id, b.states),
      canBeDestroyedByLiquidSpread: () => false,
      setPermutation(p) {
        if (read(x, y, z).id !== p.type.id) changes++;
        set.set(`${x},${y},${z}`, { id: p.type.id, states: p.getAllStates() });
        // Sand or gravel left over air would fall.
        const air = (yy) => read(x, yy, z).id === "minecraft:air";
        if (sites.GRAVITY.has(p.type.id) && air(y - 1)) falls++;
        if (p.type.id === "minecraft:air" && sites.GRAVITY.has(read(x, y + 1, z).id)) falls++;
      },
    };
  };
  const dim = {
    heightRange: { min: -64, max: 320 },
    getBlock: ({ x, y, z }) => block(x, y, z),
    getTopmostBlock: ({ x, z }) => {
      for (let y = 200; y > -64; y--) {
        const b = read(x, y, z);
        if (b.id !== "minecraft:air" && b.id !== "minecraft:water") return block(x, y, z);
      }
      return undefined;
    },
    getBlockBelow: () => undefined,
  };
  return { dim, read, set, permOf, changes: () => changes, falls: () => falls };
}

function load(w) {
  const ctx = {
    ...designs,
    ...sites,
    design: designs.design,
    designFootprint: designs.designFootprint,
    isOptionalPlace: designs.isOptionalPlace,
    BlockPermutation: { resolve: (id, states) => w.permOf(id, states ?? {}) },
    LiquidType: { Water: "Water" },
    StructureRotation: {},
    world: { structureManager: { get: () => undefined } },
    savedStructure: () => undefined,
    touches: placed.touches,
    cells: undefined,
    console,
  };
  ctx.cellsOf = () => ctx.cells;
  vm.runInNewContext(`${extract()}\nthis.fns = { readCol, checkRegion, applyBuild, restoreGround, autoGeometry, footprint, spill };`, ctx);
  ctx.fns.ctx = ctx;
  return ctx.fns;
}

const hill = (x, z) => 64 + Math.floor((x + 100) / 2) - 50 + (Math.abs(z) > 20 ? 1 : 0);
const well = { id: "well", name: "Well", build: "well" };
const town = { id: "hill", n: "Hill", dim: "minecraft:overworld", x: 0, z: 0, spots: {} };

/** Runs a generator to the end (or `max` steps); returns its value and the steps it took. */
function drain(gen, max = Infinity) {
  let n = 0;
  let r = gen.next();
  while (!r.done && n < max) {
    n++;
    r = gen.next();
  }
  return { done: r.done, value: r.value, steps: n };
}

/** The scan over the fake world through main.js's own readCol. */
function pick(w, fns, p = well) {
  const gen = sites.scanTown({ cx: 0, cz: 0, radius: 96, depth: 3, projects: [{ id: p.id, well: p.build === "well", box: (s) => fns.footprint(p, s) }] });
  let r = gen.next();
  while (!r.done) {
    const q = r.value;
    r = gen.next(q[0] === "c" ? fns.readCol(w.dim, q[1], q[2]) : q[0] === "b" ? { id: w.read(q[1], q[2], q[3]).id } : 0);
  }
  assert.equal(r.value.picks.length, 1, JSON.stringify(r.value));
  return r.value.picks[0].spot;
}

test("a leveled build on a hillside: the plan's rules hold in the world, twice changes nothing, the region restores", () => {
  const w = fakeWorld(hill);
  const fns = load(w);
  const s = pick(w, fns);
  assert.ok(s.lv, "the hillside needs leveling");
  const geo = fns.autoGeometry(well, s);
  assert.ok(geo.plan.some((c) => c.t < hill(c.x, c.z)) && geo.plan.some((c) => c.t > hill(c.x, c.z)), "it cuts and fills");
  // A man-made block just outside the region stays as it is.
  w.set.set(`${geo.region.x2 + 1},${hill(geo.region.x2 + 1, geo.region.z1) + 1},${geo.region.z1}`, { id: "minecraft:torch" });
  const before = new Map();
  for (let x = geo.region.x1 - 3; x <= geo.region.x2 + 3; x++) for (let z = geo.region.z1 - 3; z <= geo.region.z2 + 3; z++) for (let y = geo.y1 - 2; y <= geo.y2 + 2; y++) before.set(`${x},${y},${z}`, w.read(x, y, z).id);
  assert.equal(drain(fns.checkRegion(w.dim, town, geo)).value, undefined, "the region passes its check");
  const out = { placed: 0, skipped: 0 };
  const r = drain(fns.applyBuild(w.dim, well, s, geo, out));
  assert.equal(r.value, true);
  assert.ok(out.placed > 0);
  const ground = (x, z) => {
    for (let y = geo.y2 + 2; y >= geo.y1 - 2; y--) {
      const id = w.read(x, y, z).id;
      if (id !== "minecraft:air" && !id.endsWith("fence") && !id.endsWith("slab") && id !== "minecraft:torch") return y;
    }
  };
  // The plan is in the world: every apron column at its planned top, nothing natural above the pad in the footprint.
  for (const c of geo.plan) if (sites.distTo(geo.fp, c.x, c.z) > 0) assert.equal(ground(c.x, c.z), c.t, `apron column ${c.x},${c.z} at its planned top`);
  for (let x = geo.fp.x1; x <= geo.fp.x2; x++)
    for (let z = geo.fp.z1; z <= geo.fp.z2; z++) for (let y = s.y; y <= s.y + 4; y++) assert.ok(!sites.NATURAL.has(w.read(x, y, z).id), `no ground left above the pad at ${x},${y},${z}`);
  // Apron steps of at most 1 against the ring outside.
  const rd = geo.region.z2 - geo.region.z1 + 1;
  for (let x = geo.region.x1; x <= geo.region.x2; x++)
    for (let z = geo.region.z1; z <= geo.region.z2; z++) {
      if (sites.distTo(geo.fp, x, z) > 0) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const nz = z + dz;
          if (sites.distTo(geo.fp, nx, nz) === 0) continue;
          assert.ok(Math.abs(ground(x, z) - ground(nx, nz)) <= 1, `apron step at ${x},${z} -> ${nx},${nz}: ${ground(x, z)} vs ${ground(nx, nz)}`);
        }
        assert.ok(Math.abs(ground(x, z) - hill(x, z)) <= 3, "at most 3 from the natural ground");
      }
    }
  assert.equal(rd, 9);
  // Nothing outside the region changed.
  for (const [k, id] of before) {
    const [x, y, z] = k.split(",").map(Number);
    if (sites.distTo(geo.region, x, z) > 0) assert.equal(w.read(x, y, z).id, id, `outside the region at ${k}`);
  }
  // Applying it again changes nothing.
  const n = w.changes();
  drain(fns.applyBuild(w.dim, well, s, geo, { placed: 0, skipped: 0 }));
  assert.equal(w.changes(), n, "a second run changes no block");
  // The saved region, put back (Remove spot), restores every block.
  const snap = { getBlockPermutation: ({ x, y, z }) => w.permOf(before.get(`${x + geo.region.x1},${y + geo.y1},${z + geo.region.z1}`)) };
  const kinds = new Set(designs.design("well").map((p) => p.block));
  kinds.add("minecraft:dirt");
  kinds.add("minecraft:grass_block");
  fns.restoreGround(w.dim, snap, { min: { x: geo.region.x1, y: geo.y1, z: geo.region.z1 }, max: { x: geo.region.x2, y: geo.y2, z: geo.region.z2 } }, kinds);
  for (const [k, id] of before) assert.equal(w.read(...k.split(",").map(Number)).id, id, `restored at ${k}`);
});

test("sand: nothing falls while the ground is leveled or put back", () => {
  // A sand mound 2 high over the footprint and 1 around it: cut 2 under the build, 1 in the apron.
  const s0 = { x: 0, y: 65, z: 10, f: 0 };
  const fp = sites.rectOf(designs.designFootprint("well", s0));
  const mound = (x, z) => (sites.distTo(fp, x, z) <= 1 ? 66 : 64);
  const w = fakeWorld(mound, "minecraft:sand");
  const fns = load(w);
  const region = sites.regionOf(fp);
  const col = (x, z) => ({ k: "N", g: mound(x, z), top: "minecraft:sand" });
  const plan = sites.gradePlan(region, fp, col, 64, 3);
  assert.ok(plan.ok);
  const s = { ...s0, a: 1, lv: sites.encodePlan(plan.t, plan.g, 64), lt: "sand" };
  const geo = fns.autoGeometry(well, s);
  assert.ok(geo.plan.some((c) => c.t <= mound(c.x, c.z) - 2), "cuts of 2");
  const before = new Map();
  for (let x = geo.region.x1; x <= geo.region.x2; x++) for (let z = geo.region.z1; z <= geo.region.z2; z++) for (let y = geo.y1; y <= geo.y2; y++) before.set(`${x},${y},${z}`, w.read(x, y, z).id);
  drain(fns.applyBuild(w.dim, well, s, geo, { placed: 0, skipped: 0 }));
  assert.equal(w.falls(), 0, "leveling: cuts top down, fills bottom up");
  const snap = { getBlockPermutation: ({ x, y, z }) => w.permOf(before.get(`${x + geo.region.x1},${y + geo.y1},${z + geo.region.z1}`)) };
  const kinds = new Set([...designs.design("well").map((p) => p.block), "minecraft:dirt", "minecraft:sand"]);
  fns.restoreGround(w.dim, snap, { min: { x: geo.region.x1, y: geo.y1, z: geo.region.z1 }, max: { x: geo.region.x2, y: geo.y2, z: geo.region.z2 } }, kinds);
  assert.equal(w.falls(), 0, "putting it back: air top down first, then the rest bottom up");
  for (const [k, id] of before) assert.equal(w.read(...k.split(",").map(Number)).id, id, `restored at ${k}`);
});

test("a build interrupted half way and resumed ends the same as one that ran through", () => {
  const a = fakeWorld(hill);
  const fa = load(a);
  const s = pick(a, fa);
  const geo = fa.autoGeometry(well, s);
  drain(fa.applyBuild(a.dim, well, s, geo, { placed: 0, skipped: 0 }));
  const b = fakeWorld(hill);
  const fb = load(b);
  const half = drain(fb.applyBuild(b.dim, well, s, geo, { placed: 0, skipped: 0 }), 40);
  assert.equal(half.done, false, "stopped half way");
  drain(fb.applyBuild(b.dim, well, s, geo, { placed: 0, skipped: 0 }));
  assert.deepEqual([...b.set.entries()].map(([k, v]) => [k, v.id]).sort(), [...a.set.entries()].map(([k, v]) => [k, v.id]).sort());
});

test("the check refuses man-made blocks, placed cells and a changed ground, and waits on unloaded blocks", () => {
  const w = fakeWorld(hill);
  const fns = load(w);
  const s = pick(w, fns);
  const geo = fns.autoGeometry(well, s);
  const x = geo.region.x1;
  const z = geo.region.z1;
  w.set.set(`${x},${hill(x, z) + 1},${z}`, { id: "minecraft:oak_planks" });
  assert.match(drain(fns.checkRegion(w.dim, town, geo)).value, /Oak Planks/);
  w.set.delete(`${x},${hill(x, z) + 1},${z}`);
  assert.equal(drain(fns.checkRegion(w.dim, town, geo)).value, undefined, "clean again");
  // A block a player placed (its cell is marked).
  const cells = placed.loadCells([], false);
  placed.addCell(cells, placed.cellOf(town, geo.fp.x1, s.y, geo.fp.z1));
  fns.ctx.cells = cells;
  assert.match(drain(fns.checkRegion(w.dim, town, geo)).value, /placed/);
  fns.ctx.cells = undefined;
  const unloaded = { ...w.dim, getBlock: () => undefined };
  assert.equal(drain(fns.checkRegion(unloaded, town, geo)).value, "unloaded");
  // The ground moved since the scan (someone dug a pit): refused.
  const c = geo.plan[0];
  for (let y = c.t + 3; y >= c.t - 4; y--) w.set.set(`${c.x},${y},${c.z}`, { id: "minecraft:air" });
  assert.ok(drain(fns.checkRegion(w.dim, town, geo)).value, "a pit under a planned column");
});

const house = { id: "house_2", name: "House 2", level: 2, needs: {}, build: "house", job: "minecraft:lectern", work: 1 };

test("a house on the hillside: leveled, then built with its door, both bed halves (turned with the spot) and its own job site", () => {
  const w = fakeWorld(hill);
  const fns = load(w);
  const s = pick(w, fns, house);
  const geo = fns.autoGeometry(house, s);
  assert.equal(drain(fns.checkRegion(w.dim, town, geo)).value, undefined, "the region passes its check");
  const out = { placed: 0, skipped: 0 };
  assert.equal(drain(fns.applyBuild(w.dim, house, s, geo, out)).value, true);
  assert.equal(out.skipped, 0, "nothing in the way on leveled ground");
  const world = (x, y, z) => designs.toWorld(s, x, y, z);
  const get = (v) => w.read(v.x, v.y, v.z);
  const foot = get(world(2, 0, 5));
  const head = get(world(2, 0, 6));
  assert.equal(foot.id, "minecraft:bed");
  assert.equal(head.id, "minecraft:bed");
  assert.equal(foot.states.head_piece_bit, false);
  assert.equal(head.states.head_piece_bit, true);
  assert.equal(foot.states.direction, s.f, "the bed points the way the house faces");
  assert.equal(head.states.direction, s.f);
  const low = get(world(0, 0, 1));
  const up = get(world(0, 1, 1));
  assert.equal(low.id, "minecraft:wooden_door");
  assert.equal(up.id, "minecraft:wooden_door");
  assert.deepEqual([low.states.upper_block_bit, up.states.upper_block_bit], [false, true]);
  assert.equal(low.states["minecraft:cardinal_direction"], ["south", "west", "north", "east"][s.f]);
  assert.equal(get(world(-2, 0, 6)).id, "minecraft:lectern", "its own job site");
  assert.equal(get(world(0, -1, 4)).id, "minecraft:oak_planks", "a planks floor on the leveled ground");
  assert.equal(get(world(-2, 0, 2)).id, "minecraft:lantern");
  // Applying it again changes nothing.
  const n = w.changes();
  drain(fns.applyBuild(w.dim, house, s, geo, { placed: 0, skipped: 0 }));
  assert.equal(w.changes(), n);
});

test("a bed or door goes in whole or not at all: a block in the way of one half leaves both out", () => {
  const w = fakeWorld(() => 64);
  const fns = load(w);
  const s = { x: 0, y: 65, z: 0, f: 3 };
  const head = designs.toWorld(s, 2, 0, 6);
  w.set.set(`${head.x},${head.y},${head.z}`, { id: "minecraft:chest" });
  const out = { placed: 0, skipped: 0 };
  drain(fns.applyBuild(w.dim, house, s, { plan: [] }, out));
  const foot = designs.toWorld(s, 2, 0, 5);
  assert.equal(w.read(foot.x, foot.y, foot.z).id, "minecraft:air", "no half bed");
  assert.equal(w.read(head.x, head.y, head.z).id, "minecraft:chest", "the chest stays");
  assert.equal(out.skipped, 2);
});

test("taking a build away breaks a container that holds items (and a lectern) so its contents drop, never lost", () => {
  const w = fakeWorld(() => 64);
  const fns = load(w);
  const commands = [];
  const dim = { ...w.dim, runCommand: (c) => commands.push(c) };
  const block = (typeId, inv) => ({ typeId, location: { x: 1, y: 65, z: 2 }, getComponent: (k) => (k === "minecraft:inventory" ? inv : undefined) });
  fns.spill(dim, block("minecraft:barrel", { container: { size: 27, emptySlotsCount: 26 } }));
  fns.spill(dim, block("minecraft:barrel", { container: { size: 27, emptySlotsCount: 27 } }));
  fns.spill(dim, block("minecraft:lectern", undefined));
  fns.spill(dim, block("minecraft:oak_planks", undefined));
  assert.deepEqual(commands, ["setblock 1 65 2 air destroy", "setblock 1 65 2 air destroy"], "the full barrel and the lectern; not the empty barrel or planks");
});

test("a resumed build leaves alone the blocks players placed since its check (mine), cut, fill and design alike", () => {
  const a = fakeWorld(hill);
  const fa = load(a);
  const s = pick(a, fa);
  const geo = fa.autoGeometry(well, s);
  const half = drain(fa.applyBuild(a.dim, well, s, geo, { placed: 0, skipped: 0 }), 40);
  assert.equal(half.done, false, "stopped half way");
  // A player's blocks since: dirt above a cut column's new top, dirt over a fill's opening, and a block on the pad.
  const cut = geo.plan.find((c) => c.t < hill(c.x, c.z));
  const fill = geo.plan.find((c) => c.t > hill(c.x, c.z));
  const theirs = [
    [cut.x, cut.t + 1, cut.z],
    [fill.x, fill.t, fill.z],
    [s.x, s.y, s.z],
  ];
  const fill2 = `${fill.x},${fill.t},${fill.z}`;
  for (const [x, y, z] of theirs) a.set.set(`${x},${y},${z}`, { id: "minecraft:dirt" });
  const keys = new Set(theirs.map((v) => v.join(",")));
  const out = { placed: 0, skipped: 0 };
  const r = drain(fa.applyBuild(a.dim, well, s, geo, out, (x, y, z) => keys.has(`${x},${y},${z}`)));
  assert.equal(r.value, true);
  for (const [x, y, z] of theirs) assert.equal(a.read(x, y, z).id, "minecraft:dirt", `their block at ${x},${y},${z} stays`);
  assert.ok(keys.has(fill2));
  // Without mine (as before the fix) the cut takes their dirt away.
  const b = fakeWorld(hill);
  const fb = load(b);
  b.set.set(`${cut.x},${cut.t + 1},${cut.z}`, { id: "minecraft:dirt" });
  drain(fb.applyBuild(b.dim, well, s, geo, { placed: 0, skipped: 0 }));
  assert.notEqual(b.read(cut.x, cut.t + 1, cut.z).id, "minecraft:dirt", "the unguarded build removes it");
});

test("a saved structure is placed only over air, natural ground and wild plants nobody placed: a chest in its box stops it", () => {
  const w = fakeWorld(() => 64);
  const fns = load(w);
  const places = [];
  fns.ctx.savedStructure = () => ({ size: { x: 3, y: 3, z: 3 } });
  fns.ctx.world = { structureManager: { place: (...a) => places.push(a), get: () => undefined } };
  const statue = { id: "statue", name: "Statue", structure: "town:statue" };
  const s = { x: 0, y: 65, z: 0, f: 0, a: 1 };
  const geo = fns.autoGeometry(statue, s);
  w.set.set("1,65,1", { id: "minecraft:chest" });
  const r = drain(fns.applyBuild(w.dim, statue, s, geo, { placed: 0, skipped: 0 }));
  assert.match(String(r.value), /Chest at 1, 65, 1/);
  assert.equal(places.length, 0, "nothing placed over the chest");
  w.set.delete("1,65,1");
  const mineAt = drain(fns.applyBuild(w.dim, statue, s, geo, { placed: 0, skipped: 0 }, (x, y, z) => x === 2 && y === 66 && z === 2));
  assert.match(String(mineAt.value), /placed/);
  assert.equal(places.length, 0);
  assert.equal(drain(fns.applyBuild(w.dim, statue, s, geo, { placed: 0, skipped: 0 })).value, true);
  assert.equal(places.length, 1, "placed once the box is clear");
});

test("stepBuild: a resumed build still waits players off the spot (also while applying), checks claims, and holds instead of losing a half-done spot", () => {
  const body = main.slice(main.indexOf("function stepBuild()"), main.indexOf("/** Runs the scan and the build"));
  assert.match(body, /phase: s\.bs \? "standing"/, "resume starts at standing, not apply");
  assert.match(body, /case "apply": \{\s*\/\/[^\n]*\n\s*const on = playersOn\(t, geo\);/, "apply waits while someone is on the spot");
  assert.match(body, /s\.bs \? holdBuild\(t, p, "a land claim covers it now"\) : respot/, "a claim over a half-done build holds it");
  assert.match(body, /applyBuild\(dim, p, s, geo, job\.out, placedBy\(t\)\)/, "the placed cells guard the build");
  assert.match(body, /typeof r\.value === "string"\) return holdBuild/);
});
