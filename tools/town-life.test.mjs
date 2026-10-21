// Town Projects' small life (packs/town_bp/scripts/life.js): the paths a town lays from its builds toward the center
// (grass_block at ground level only, steps of at most 1, stopping at anything else, at most 48 blocks), the lantern
// posts beside them (every 8 blocks, on natural ground, at most 12 a town), how both are saved, and the notice board.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import * as life from "../packs/town_bp/scripts/life.js";
import { CLEARABLE, PATH_MAX, PATH_NEAR, POSTS_MAX, POST_EVERY, boardTexts, packCells, planPath, planPosts, postCount, readWorks, unpackCells, walk } from "../packs/town_bp/scripts/life.js";

const id = (b) => `minecraft:${b}`;

/** A world of columns: ground height h(x, z) with grass on top, plus blocks set on it; undefined where `unloaded`. */
function worldOf(h, set = new Map(), unloaded = () => false) {
  return (x, y, z) => {
    if (unloaded(x, z)) return undefined;
    const k = `${x},${y},${z}`;
    if (set.has(k)) return { id: set.get(k) };
    const g = h(x, z);
    return { id: y > g ? id("air") : y === g ? id("grass_block") : id("dirt") };
  };
}

/** Runs a planner generator against a world; returns its value and the reads. */
function run(gen, at) {
  let reads = 0;
  let r = gen.next();
  while (!r.done) {
    reads++;
    const [, x, y, z] = r.value;
    r = gen.next(at(x, y, z));
  }
  return { ...r.value, reads, value: r.value };
}

test("ids are vanilla ones, and only single-block wild plants are cleared", () => {
  const ids = new Set(Object.values(MinecraftBlockTypes));
  for (const b of CLEARABLE) assert.ok(ids.has(b), b);
  for (const b of ["tall_grass", "large_fern", "sunflower", "lilac", "rose_bush", "peony", "wheat", "oak_sapling", "snow_layer", "sweet_berry_bush"]) assert.ok(!CLEARABLE.has(id(b)), `${b} stops a path`);
  // Flowers and the like may be someone's flower bed: a path stops at them instead of clearing them (F40 review).
  for (const b of ["poppy", "dandelion", "cornflower", "red_tulip", "torchflower", "pink_petals", "wildflowers", "fern", "red_mushroom", "open_eyeblossom", "firefly_bush"]) assert.ok(!CLEARABLE.has(id(b)), `${b} stops a path`);
  assert.ok(CLEARABLE.has(id("short_grass")), "a grass tuft is cleared");
  for (const b of ["grass_path", "grass_block", "oak_fence", "lantern"]) assert.ok(ids.has(id(b)), b);
});

test("walk: one block at a time along x or z, start first, target last", () => {
  const cols = [...walk(10, -4, 0, 0)];
  assert.deepEqual(cols[0], [10, -4]);
  assert.deepEqual(cols.at(-1), [0, 0]);
  for (let i = 1; i < cols.length; i++) assert.equal(Math.abs(cols[i][0] - cols[i - 1][0]) + Math.abs(cols[i][1] - cols[i - 1][1]), 1, "4-connected");
  assert.equal(cols.length, 15);
});

test("cells pack to 6 characters each, relative to the center, and read back", () => {
  const cells = [{ x: 1000, y: -60, z: -900 }, { x: -1000, y: 300, z: 1000 }, { x: 0, y: 64, z: 0 }];
  const s = packCells(cells, 0, 0);
  assert.equal(s.length, 18);
  assert.match(s, /^[0-9a-z]+$/);
  assert.deepEqual(unpackCells(s, 0, 0), cells);
  assert.deepEqual(unpackCells(packCells([{ x: 5, y: 70, z: 6 }], 4000, -4000), 4000, -4000), []);
  assert.deepEqual(unpackCells(packCells([{ x: 4005, y: 70, z: -3994 }], 4000, -4000), 4000, -4000), [{ x: 4005, y: 70, z: -3994 }]);
  assert.deepEqual(unpackCells("zz!", 0, 0), []);
});

test("readWorks keeps whole cells, 48 path blocks a build and 12 posts a town", () => {
  const cell = packCells([{ x: 1, y: 64, z: 2 }], 0, 0);
  const raw = { well: [cell.repeat(60), cell.repeat(10)], house_1: [cell + "abc", cell.repeat(5)], "Bad Id": [cell, cell], pen: "x", garden: [5, null] };
  const w = readWorks(raw);
  assert.deepEqual(Object.keys(w), ["well", "house_1"]);
  assert.equal(w.well[0].length, PATH_MAX * 6);
  assert.equal(w.house_1[0], cell, "a broken cell is dropped");
  assert.equal(postCount(w), POSTS_MAX, "posts past 12 in the town are dropped");
  assert.equal(w.house_1[1].length, 2 * 6);
  assert.deepEqual(readWorks(null), {});
  assert.deepEqual(readWorks([1]), {});
  // The worst case stays far under the 32 KB property limit.
  // 18 builds (7 projects, 10 houses, the pen), each with a full path and a full leftover of 2 paths, every post.
  const ids = ["well", "notice_board", "lamps", "garden", "stall", "dock", "bell_tower", ...Array.from({ length: 10 }, (_, i) => `house_${i + 1}`), "pen"];
  const big = Object.fromEntries(ids.flatMap((k) => [[k, [cell.repeat(PATH_MAX), cell.repeat(POSTS_MAX)]], [`~${k}`, [cell.repeat(3 * PATH_MAX), cell.repeat(POSTS_MAX)]]]));
  const kept = readWorks(big);
  assert.equal(kept["~well"][0].length, 2 * PATH_MAX * 6, "a leftover keeps at most 2 paths");
  assert.equal(postCount(kept), POSTS_MAX);
  assert.ok(JSON.stringify(kept).length < 16500, `${JSON.stringify(kept).length} characters`);
});

test("planPath: grass toward the center, steps of at most 1, stopping near the center", () => {
  // A gentle slope down toward the center: 1 block every 4 columns.
  const at = worldOf((x) => 64 + Math.floor(x / 4));
  const res = run(planPath({ start: { x: 30, y: 71, z: 0 }, cx: 0, cz: 0 }), at);
  assert.equal(res.unloaded, false);
  assert.equal(res.cells.length, 30 - PATH_NEAR, "until 3 blocks from the center");
  for (const c of res.cells) assert.equal(at(c.x, c.y, c.z).id, id("grass_block"), "every cell is the grass at ground level");
  for (let i = 1; i < res.cells.length; i++) assert.ok(Math.abs(res.cells[i].y - res.cells[i - 1].y) <= 1, "steps of at most 1");
  assert.ok(res.cells.every((c) => !c.c));
  assert.ok(res.reads <= res.cells.length * 4 + 4, `few reads (${res.reads})`);
});

test("planPath stops at anything else: a step of 2, a man-made block, a path, a tall plant, stop(), 48 blocks, unloaded", () => {
  const flat = () => 64;
  const len = (set, o = {}) => run(planPath({ start: { x: 60, y: 64, z: 0 }, cx: 0, cz: 0, ...o }), worldOf(o.h ?? flat, set, o.unloaded)).cells.length;
  assert.equal(len(new Map()), PATH_MAX, "at most 48");
  assert.equal(len(new Map(), { h: (x) => (x <= 50 ? 66 : 64) }), 10, "a step of 2 up");
  assert.equal(len(new Map(), { h: (x) => (x <= 50 ? 62 : 64) }), 10, "a step of 2 down");
  assert.equal(len(new Map([["50,64,0", id("oak_planks")]])), 10, "planks at ground level");
  assert.equal(len(new Map([["50,65,0", id("cobblestone")]])), 10, "something built on the grass");
  assert.equal(len(new Map([["50,64,0", id("grass_path")]])), 10, "joins a path already there");
  assert.equal(len(new Map([["50,65,0", id("tall_grass")]])), 10, "a two-block plant");
  assert.equal(len(new Map([["50,65,0", id("wheat")]])), 10, "a crop");
  assert.equal(len(new Map(), { stop: (x) => x === 50 }), 10, "a column stop() refuses (another build, a claim, a placed block)");
  const unl = run(planPath({ start: { x: 60, y: 64, z: 0 }, cx: 0, cz: 0 }), worldOf(flat, new Map(), (x) => x === 50));
  assert.deepEqual([unl.cells.length, unl.unloaded], [10, true], "an unloaded column ends it, marked");
  // A grass tuft is cleared; the cell says so. A flower stops the path (F40 review: it may be someone's flower bed).
  const tuft = run(planPath({ start: { x: 60, y: 64, z: 0 }, cx: 0, cz: 0, max: 20 }), worldOf(flat, new Map([["55,65,0", id("short_grass")]])));
  assert.equal(tuft.cells.length, 20);
  assert.deepEqual(tuft.cells.filter((c) => c.c).map((c) => c.x), [55]);
  assert.equal(len(new Map([["50,65,0", id("poppy")]])), 10, "a flower");
  assert.equal(len(new Map([["50,65,0", id("pink_petals")]])), 10, "petals");
  // Nothing but grass ever becomes a cell: sand, stone, snow on top all stop it at once.
  for (const top of ["sand", "stone", "dirt", "snow_layer"]) {
    const set = new Map([[top === "snow_layer" ? "60,65,0" : "60,64,0", id(top)]]);
    assert.equal(len(set), 0, top);
  }
});

test("planPosts: every 8 blocks beside the path on natural ground, never on a path, at most the cap", () => {
  const cells = Array.from({ length: 40 }, (_, i) => ({ x: 40 - i, y: 64, z: 0 }));
  const flat = worldOf(() => 64);
  const posts = run(planPosts({ paths: [{ id: "well", cells }], posts: [], max: POSTS_MAX }), flat).value;
  assert.equal(posts.length, Math.floor(40 / POST_EVERY));
  for (const [k, q] of posts.entries()) {
    const c = cells[POST_EVERY * (k + 1) - 1];
    assert.equal(Math.abs(q.z - c.z) + Math.abs(q.x - c.x), 1, "right beside the path");
    assert.equal(q.y, 65, "the fence on the ground");
    assert.equal(q.id, "well");
  }
  assert.equal(run(planPosts({ paths: [{ id: "well", cells }], posts: [], max: 2 }), flat).value.length, 2, "the cap");
  // Not on another path, not beside an old post, not where stop() refuses, not on man-made ground, not under a roof.
  const other = Array.from({ length: 40 }, (_, i) => ({ x: 40 - i, y: 64, z: 1 }));
  const both = run(planPosts({ paths: [{ id: "well", cells }, { id: "lamps", cells: other }], posts: [], max: POSTS_MAX }), flat).value;
  assert.ok(both.every((q) => q.z !== 0 && q.z !== 1), "never on a path");
  assert.equal(run(planPosts({ paths: [{ id: "well", cells }], posts: [{ x: 33, y: 65, z: 1 }], max: 12 }), flat).value.filter((q) => q.x === 33).length, 0, "4 blocks from another post");
  assert.equal(run(planPosts({ paths: [{ id: "well", cells }], posts: [], stop: () => true, max: 12 }), flat).value.length, 0);
  const planks = worldOf(() => 64, new Map(cells.flatMap((c) => [[`${c.x},64,1`, id("oak_planks")], [`${c.x},64,-1`, id("oak_planks")]])));
  assert.equal(run(planPosts({ paths: [{ id: "well", cells }], posts: [], max: 12 }), planks).value.length, 0, "only on natural ground");
  const roof = worldOf(() => 64, new Map(cells.flatMap((c) => [[`${c.x},66,1`, id("oak_leaves")], [`${c.x},66,-1`, id("stone")]])));
  assert.equal(run(planPosts({ paths: [{ id: "well", cells }], posts: [], max: 12 }), roof).value.length, 0, "2 open blocks above");
});

test("boardTexts: projects done and residents on sign 2, the newest residents on sign 3", () => {
  const o = { name: "Elm", level: "Village", lvl: 2, done: 3, total: 7, residents: 4, newest: ["Tilly", "Otto", "Gus", "Abel"], top: ["Ann"] };
  const [a, b, c] = boardTexts(o);
  assert.equal(a, "§lElm§r\nVillage\nlevel 2");
  assert.equal(b, "Projects done\n3 of 7\nResidents: 4\nSee /realm:town");
  assert.equal(c, "New families\nAbel\nGus\nOtto", "the newest first, 3 of them");
  assert.equal(boardTexts({ ...o, newest: [] })[2], "Thank you\nAnn");
  assert.equal(boardTexts({ ...o, newest: [], top: [] })[2], "Bring materials\nto the mayor!");
  for (const s of boardTexts(o)) {
    assert.ok(s.split("\n").length <= 4, "4 lines a sign");
    assert.match(s.replace(/§./g, ""), /^[\x20-\x7e\n]*$/, "plain ASCII");
  }
});

test("life.js runs in node", () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "life.js"), "utf8");
  assert.doesNotMatch(src, /@minecraft\//);
});

// --- main.js's own laying and removing (layPath, clearLife, restoreLife) on a fake world ---


const mainSrc = fs.readFileSync(path.join(import.meta.dirname, "..", "packs", "town_bp", "scripts", "main.js"), "utf8");
function mainParts(names) {
  const src = ts.createSourceFile("main.js", mainSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const out = new Map();
  ts.forEachChild(src, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && names.includes(n.name.text)) out.set(n.name.text, n.getText(src));
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (ts.isIdentifier(d.name) && names.includes(d.name.text)) out.set(d.name.text, n.getText(src));
  });
  for (const n of names) assert.ok(out.has(n), `main.js has ${n}`);
  return [...out.values()].join("\n");
}

function fakeMain(h, loaded = () => true) {
  const set = new Map();
  const read = (x, y, z) => set.get(`${x},${y},${z}`) ?? (y > h(x, z) ? id("air") : y === h(x, z) ? id("grass_block") : id("dirt"));
  const dim = {
    getBlock: ({ x, y, z }) => {
      if (!loaded(x, z)) return undefined;
      const typeId = read(x, y, z);
      return { typeId, isAir: typeId === id("air"), setPermutation: (p) => set.set(`${x},${y},${z}`, p.id) };
    },
  };
  const store = { w: {} };
  const ctx = {
    ...life,
    perm: (pid) => ({ id: pid }),
    lifeOf: () => store.w,
    saveLife: (_t, w) => (store.w = JSON.parse(JSON.stringify(w))),
    saveTown: () => {},
    world: { getDimension: () => dim },
    lifeWaits: new Map(),
  };
  vm.runInNewContext(`var lifeJob;\n${mainParts(["PATH_BLOCK", "LIFE_WAITS", "restoreLife", "clearLife", "layPath"])}\nthis.fns = { layPath, clearLife };`, ctx);
  return { ...ctx.fns, dim, read, set, store, ctx };
}

test("main.js lays a path only on grass that is still there, saves it, and Remove spot turns it back", () => {
  const w = fakeMain(() => 64);
  const t = { id: "elm", x: 0, z: 0, dim: "overworld", spots: {} };
  const s = { x: 20, y: 65, z: 0, f: 3, a: 1 };
  const res = run(planPath({ start: { x: 19, y: 64, z: 0 }, cx: 0, cz: 0 }), (x, y, z) => ({ id: w.read(x, y, z) }));
  assert.equal(res.cells.length, 16);
  w.set.set("10,64,0", id("oak_planks")); // built meanwhile: the path ends before it
  w.layPath(t, { id: "well" }, s, w.dim, res);
  assert.equal(s.pt, 1);
  const laid = unpackCells(w.store.w.well[0], 0, 0);
  assert.equal(laid.length, 9, "laid up to the block built meanwhile");
  assert.ok(laid.every((c) => w.read(c.x, c.y, c.z) === id("grass_path")));
  assert.equal(w.read(10, 64, 0), id("oak_planks"), "never touched");
  // A player's own path block and a post: only ours change back.
  w.store.w.well[1] = packCells([{ x: 15, y: 65, z: 1 }], 0, 0);
  w.set.set("15,65,1", id("oak_fence"));
  w.set.set("15,66,1", id("lantern"));
  w.clearLife(t, "well");
  assert.ok(laid.every((c) => w.read(c.x, c.y, c.z) === id("grass_block")), "grass again");
  assert.equal(w.read(15, 65, 1), id("air"));
  assert.equal(w.read(15, 66, 1), id("air"));
  assert.deepEqual(w.store.w, {}, "forgotten");
});

test("main.js: a removal that can't reach part of a path keeps it as ~<id> and finishes it later, never touching a newer path", () => {
  let far = true;
  const w = fakeMain(() => 64, (x) => !(far && x < 8));
  const t = { id: "elm", x: 0, z: 0, dim: "overworld", spots: {} };
  const path = Array.from({ length: 12 }, (_, i) => ({ x: 16 - i, y: 64, z: 0 }));
  for (const c of path) w.set.set(`${c.x},64,0`, id("grass_path"));
  w.store.w = { well: [packCells(path, 0, 0), ""] };
  w.clearLife(t, "well");
  assert.deepEqual(Object.keys(w.store.w), ["~well"]);
  assert.equal(unpackCells(w.store.w["~well"][0], 0, 0).length, 3, "the 3 blocks not loaded wait");
  // A new path for the well meanwhile stays.
  w.store.w.well = [packCells([{ x: 30, y: 64, z: 0 }], 0, 0), ""];
  w.set.set("30,64,0", id("grass_path"));
  far = false;
  w.clearLife(t, "well", true);
  assert.ok(path.every((c) => w.read(c.x, 64, 0) === id("grass_block")), "all of the old one is grass now");
  assert.deepEqual(Object.keys(w.store.w), ["well"], "the new one is kept");
  assert.equal(w.read(30, 64, 0), id("grass_path"));
});

test("main.js: a path that met unloaded ground waits (3 tries a session), then lays what it found", () => {
  const w = fakeMain(() => 64);
  const t = { id: "elm", x: 0, z: 0, dim: "overworld", spots: {} };
  const s = { x: 20, y: 65, z: 0, f: 3, a: 1 };
  const res = { cells: [{ x: 19, y: 64, z: 0 }], unloaded: true };
  for (let i = 0; i < 3; i++) {
    w.layPath(t, { id: "well" }, s, w.dim, res);
    assert.equal(s.pt, undefined, `try ${i + 1} waits`);
  }
  w.layPath(t, { id: "well" }, s, w.dim, res);
  assert.equal(s.pt, 1);
  assert.equal(w.read(19, 64, 0), id("grass_path"));
});

test("main.js takes a build's path away before it puts the ground back (Remove spot and moves)", () => {
  for (const name of ["removeSpot", "applySpot"]) {
    const i = mainSrc.indexOf(`function ${name}(`);
    const body = mainSrc.slice(i, mainSrc.indexOf("\n}\n", i));
    const a = body.indexOf("clearLife(t, p.id)");
    const b = body.indexOf("unbuild(t, p,");
    assert.ok(a > 0 && b > 0 && a < b, `${name}: the path goes first, so the leveled ground under it is restored too`);
    assert.match(body, /delete (s|old)\.pt/, `${name}: a failed removal lays the path again`);
  }
});

test("the pen's animals: what vanished (despawned) comes back, what was killed doesn't", () => {
  const S = "minecraft:sheep";
  const C = "minecraft:chicken";
  const A = [S, S, C, C];
  const { penMissing } = life;
  assert.equal(typeof penMissing, "function");
  assert.deepEqual(penMissing([], [], A), A, "all gone (players were away): all 4 back");
  assert.deepEqual(penMissing([S, C], [], A), [S, C]);
  assert.deepEqual(penMissing(A, [], A), [], "all there");
  assert.deepEqual(penMissing([], A, A), [], "all 4 eaten: none comes back (no free food)");
  assert.deepEqual(penMissing([], [S], A), [S, C, C], "a sheep killed, the rest vanished: the other sheep and both chickens");
  assert.deepEqual(penMissing([C], [S, S], A), [C], "both sheep killed, a chicken vanished: that chicken");
  assert.deepEqual(penMissing([...A, S], [], A), [], "more than 4: none, and none removed");
  assert.deepEqual(penMissing([], [S, S, S, S, C, C], A), [], "more kills than animals: none");
});

test("the pen's surplus (O78): a wanderer that came back after its stand-in was spawned loses the tag, the farthest first", () => {
  const S = "minecraft:sheep";
  const C = "minecraft:chicken";
  const A = [S, S, C, C];
  const { penSurplus } = life;
  assert.equal(typeof penSurplus, "function");
  assert.deepEqual(penSurplus([], [], A), []);
  assert.deepEqual(penSurplus([{ type: S, d: 2 }, { type: S, d: 60 }, { type: C, d: 3 }, { type: C, d: 1 }], [], A), [], "a sheep 60 blocks away is still one of the pen's: nothing extra, none spawned");
  assert.deepEqual(penSurplus([{ type: S, d: 2 }, { type: S, d: 70 }, { type: S, d: 3 }, { type: C, d: 1 }], [], A), [1], "3 sheep: the farthest");
  assert.deepEqual(penSurplus([{ type: S, d: 2 }, { type: S, d: 3 }], [S], A), [1], "a sheep was killed: the pen keeps one sheep");
  assert.deepEqual(penSurplus([{ type: C, d: 9 }, { type: C, d: 1 }, { type: C, d: 5 }, { type: C, d: 2 }], [], A), [0, 2], "4 chickens: the 2 farthest");
  const found = [{ type: S, d: 2 }, { type: S, d: 60 }, { type: C, d: 3 }, { type: C, d: 1 }];
  assert.deepEqual(life.penMissing(found.map((f) => f.type), [], A), [], "and penMissing tops up nothing for them");
});

test("main.js: pen deaths are counted and the top-up runs only with a player near the pen for two checks", () => {
  const main = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "packs", "town_bp", "scripts", "main.js"), "utf8");
  assert.match(main, /function penTick\(/);
  assert.match(main, /penTick\(players\)/, "called on the build check");
  assert.match(main, /penMissing\(/);
  assert.match(main, /k: pr\.k/, "the killed animals are saved with the pen's progress");
});
