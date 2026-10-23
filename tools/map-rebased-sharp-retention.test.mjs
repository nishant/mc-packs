// Bounded, visible-aware terrain cache retention and stale last-good behavior.
//   node --test tools/map-cache-retention.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { colKey, glyphAt, planScan, PREVIEW, retainVisible, TerrainWorld } from "../packs/map_bp/scripts/terrain.js";
import { G } from "../packs/map_bp/scripts/glyphs.js";

const OW = "minecraft:overworld";
const ground = (kind = "stone") => ({ kind, y: 70, depth: 0 });

test("one visible entry gets a bounded second chance over an older non-visible column", () => {
  const world = new TerrainWorld(4);
  const store = world.store(OW);
  for (const x of [0, 2, 4, 6]) world.put(store, x, 0, ground(), 1, 2);
  const visible = colKey(0, 0, 2);
  retainVisible(store, visible, 200);
  world.put(store, 8, 0, ground("grass"), 200, 2);
  assert.ok(store.cols.has(visible), "retained visible data survives the first eviction");
  assert.equal(store.cols.has(colKey(2, 0, 2)), false, "the oldest non-visible column is retired instead");
  assert.equal(store.cols.size, 4);
});

test("all-protected entries still preserve the hard native cap without an unbounded eviction loop", () => {
  const world = new TerrainWorld(8);
  const store = world.store(OW);
  for (let x = 0; x < 8; x++) world.put(store, x * 2, 0, ground(), 1, 2);
  for (const key of store.cols.keys()) retainVisible(store, key, 999);
  world.put(store, 16, 0, ground("grass"), 999, 2);
  assert.equal(store.cols.size, 8, "fallback eviction keeps the hard cap even when every entry was visible");

  const previewWorld = new TerrainWorld(8, 24, 2);
  const preview = previewWorld.store(OW);
  for (let x = 0; x < 2; x++) previewWorld.put(preview, x * 8 + 5, 5, ground(), 1, PREVIEW);
  for (const key of preview.preview.keys()) retainVisible(preview, key, 1000);
  previewWorld.put(preview, 21, 5, ground("grass"), 1000, PREVIEW);
  assert.equal(preview.preview.size, 2, "the independent preview cache is also strictly bounded");
});

test("fine-cache pressure preserves the reserved coarse working set", () => {
  const world = new TerrainWorld(6);
  const store = world.store(OW);
  for (let x = 0; x < 6; x++) world.put(store, x * 2, 0, ground(), 1, 2);
  for (let x = 0; x < 3; x++) world.put(store, 100 + x, 100, ground("grass"), 2, 1);
  assert.equal(store.cols.size, 6);
  assert.ok(store.coarse.size >= 4, `fine inserts cannot wipe coarse data (coarse ${store.coarse.size})`);
  assert.ok(store.fine.size >= 1);
});

test("invalidation keeps last-good glyphs visible as stale until a fresh read replaces them", () => {
  const world = new TerrainWorld();
  const store = world.store(OW);
  world.put(store, 0, 0, ground("grass"), 1, 2);
  const key = colKey(0, 0, 2);
  const old = store.cols.get(key);
  const before = glyphAt(world, store, 0, 0, 2);
  assert.equal(world.invalidate(OW, 1, 1), 1);
  assert.equal(store.cols.get(key), old, "the known column stays in the cache");
  assert.equal(old.tick, -Infinity, "it is scheduled as stale immediately");
  assert.equal(glyphAt(world, store, 0, 0, 2), before, "the radar has no transient unknown hole");
  const plan = planScan({
    world, store, at: { x: 0, z: 0 }, heading: 0, north: true, radius: 24, half: 10,
    lead: { x: 0, z: 0 }, now: 10, maxAge: 2400,
  });
  assert.ok(plan.some((pick) => pick.key === key && pick.stale), "stale known terrain remains eligible for resampling");
  world.put(store, 0, 0, ground("stone"), 11, 2);
  assert.equal(store.cols.get(key).tick, 11);
  assert.equal(glyphAt(world, store, 0, 0, 2), G.Q_STONE);
});

test("retiring a column bumps the region version so viewers cannot keep a deferred hole", () => {
  const world = new TerrainWorld(1);
  const store = world.store(OW);
  world.put(store, 63, 63, ground(), 1, 2);
  const before = world.viewVer(store, 63, 63, 0);
  world.put(store, 500, 500, ground("grass"), 2, 2);
  assert.equal(store.cols.size, 1);
  assert.ok(world.viewVer(store, 63, 63, 0) > before, "eviction bumps the retired sample's region version");
  assert.equal(glyphAt(world, store, 63, 63, 2), G.Q_EMPTY, "retired data is no longer read as current cache data");
});

test("unchanged revalidation restores neighboring shading and view versions",()=>{for(const resolution of [1,2]){const world=new TerrainWorld();const store=world.store(OW);const current={kind:"stone",y:80,depth:0},west={kind:"stone",y:90,depth:0};world.put(store,0,0,current,1,resolution);world.put(store,-resolution,0,west,1,resolution);const before=glyphAt(world,store,0,0,resolution);world.invalidate(OW,-resolution,0);assert.notEqual(glyphAt(world,store,0,0,resolution),before);const ver=world.viewVer(store,0,0,8);world.put(store,-resolution,0,west,10,resolution);assert.ok(world.viewVer(store,0,0,8)>ver);assert.equal(glyphAt(world,store,0,0,resolution),before);}});
