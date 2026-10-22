// Demand generation is not the visual generation: acquiring terrain must not restart a partial plan.
import assert from "node:assert/strict";
import test from "node:test";
import { COL, PREVIEW, TerrainWorld, colKey, hydratePreview } from "../packs/map_bp/scripts/terrain.js";
import { G } from "../packs/map_bp/scripts/glyphs.js";

const OW = "minecraft:overworld";
const stone = { kind: "stone", y: 64, depth: 0 };
const sand = { kind: "sand", y: 65, depth: 0 };
const empty = { kind: "empty", y: -64, depth: 0 };
function generation(store) {
  assert.ok(Number.isSafeInteger(store.demandVer) && store.demandVer >= 0, "real stores expose a nonnegative demand-only generation");
  return store.demandVer;
}

test("acquisition, visual changes, equal refresh and restored detail never create demand", () => {
  const world = new TerrainWorld(), store = world.store(OW);
  assert.equal(generation(store), 0);
  world.put(store, 1, 1, stone, 1, COL);
  const visual = store.ver;
  world.put(store, 1, 1, sand, 2, COL);
  assert.ok(store.ver > visual, "visual changes retain their own generation");
  world.put(store, 1, 1, sand, 3, COL);
  world.put(store, 3, 1, empty, 3, COL);
  assert.equal(world.restoreDetail(store, 5, 1, { ...stone, acquiredAtMs: 1000, revision: 1 }, 4, 1100), true);
  world.put(store, 7, 3, stone, 5, PREVIEW);
  assert.equal(hydratePreview(store, 11, 3, G.Q_STONE, 6), true);
  world.put(store, 13, 1, stone, 6, 1);
  world.miss(store, 15, 1, 6, COL);
  assert.equal(generation(store), 0, "new native/raw/preview data and misses cannot invalidate a partial worklist");
});

test("canonical invalidation advances demand once, including valid empty; revalidation does not", () => {
  const world = new TerrainWorld(), store = world.store(OW);
  world.put(store, 1, 1, empty, 1, COL);
  const before = generation(store);
  assert.equal(world.invalidate(OW, 0, 0), 1);
  assert.ok(generation(store) > before);
  assert.equal(store.cols.get(colKey(1, 1, COL)).valid, false);
  const invalid = generation(store);
  world.invalidate(OW, 0, 0);
  world.invalidate(OW, 200, 200);
  assert.equal(generation(store), invalid, "repeated invalidation and absent data lose no new availability");
  world.put(store, 1, 1, empty, 10, COL);
  assert.equal(generation(store), invalid, "real revalidation only satisfies demand");
  world.invalidate(OW, 0, 0);
  assert.ok(generation(store) > invalid, "another genuine loss after revalidation advances again");
});

test("loss generations stay per-store and fine-only changes do not affect canonical demand", () => {
  const world = new TerrainWorld(), surface = world.store(OW), end = world.store("minecraft:the_end");
  const low = world.store("minecraft:nether", 20), high = world.store("minecraft:nether", 28);
  for (const store of [surface, end, low, high]) world.put(store, 1, 1, stone, 1, COL);
  world.invalidate("minecraft:nether", 1, 1);
  assert.ok(generation(low) > 0 && generation(high) > 0);
  assert.equal(generation(surface), 0); assert.equal(generation(end), 0);
  world.put(surface, 8, 8, stone, 2, 1);
  world.invalidate(OW, 8, 8);
  assert.equal(generation(surface), 0, "only an exact fine record existed at this column");
});

test("native eviction advances the losing store, not the acquiring store under global pressure", () => {
  const world = new TerrainWorld(8, 24, 8, 1), old = world.store(OW), next = world.store("minecraft:the_end");
  world.put(old, 1, 1, stone, 1, COL);
  world.put(next, 1, 1, sand, 2, COL);
  assert.equal(old.cols.size, 0); assert.equal(next.cols.size, 1);
  assert.ok(generation(old) > 0);
  assert.equal(generation(next), 0, "acquisition elsewhere does not bump its demand generation");
});

test("evicting already invalid detail, fine detail or refusing protected admission adds no canonical loss", () => {
  const invalidWorld = new TerrainWorld(1), invalid = invalidWorld.store(OW);
  invalidWorld.put(invalid, 1, 1, stone, 1, COL); invalidWorld.invalidate(OW, 1, 1);
  const afterInvalidation = generation(invalid);
  invalidWorld.put(invalid, 3, 1, stone, 2, COL);
  assert.equal(generation(invalid), afterInvalidation);
  const fineWorld = new TerrainWorld(1), fine = fineWorld.store(OW);
  fineWorld.put(fine, 0, 0, stone, 1, 1); fineWorld.put(fine, 1, 1, stone, 2, COL);
  assert.equal(generation(fine), 0);
  const pinnedWorld = new TerrainWorld(1), pinned = pinnedWorld.store(OW);
  pinnedWorld.put(pinned, 1, 1, stone, 1, COL); pinnedWorld.protect("viewer:p", pinned, { x: 1, z: 1 }, 4);
  assert.equal(pinnedWorld.makeRoom(pinned, 3, 1, COL, 2), false);
  assert.equal(generation(pinned), 0);
});

test("preview loss advances demand but new preview acquisitions and native seeds do not", () => {
  const world = new TerrainWorld(100, 24, 1), store = world.store(OW);
  world.put(store, 3, 3, stone, 1, PREVIEW);
  assert.equal(generation(store), 0);
  world.put(store, 7, 3, sand, 2, PREVIEW);
  assert.ok(generation(store) > 0, "bounded native preview cache evicted an available glyph");
  const beforeInvalidate = generation(store);
  world.invalidate(OW, 4, 0); // This shares preview7,3 but its canonical5,1 was never sampled.
  assert.ok(generation(store) > beforeInvalidate, "preview-only validity loss changes work demand");
  assert.equal(store.cols.get(colKey(7, 3, COL)).valid, true, "the actual native seed was not invalidated");
  const afterInvalidate = generation(store);
  world.invalidate(OW, 4, 0);
  assert.equal(generation(store), afterInvalidate);
});

test("persisted preview replacement accounts for eviction, including a stale but displayable glyph", () => {
  const world = new TerrainWorld(100, 24, 1), store = world.store(OW);
  assert.equal(hydratePreview(store, 3, 3, G.Q_STONE, 1), true);
  assert.equal(generation(store), 0);
  assert.equal(store.preview.get(colKey(3, 3, PREVIEW)).tick, -Infinity);
  assert.equal(hydratePreview(store, 7, 3, G.Q_SAND, 2), true);
  assert.ok(generation(store) > 0);
  const before = generation(store);
  assert.equal(hydratePreview(store, 7, 3, G.Q_SAND, 3), false);
  assert.equal(hydratePreview(store, 11, 3, "bad-glyph", 3), false);
  assert.equal(generation(store), before);
});

test("retiring a populated Nether store marks its lost availability and replacement identity starts fresh", () => {
  const world = new TerrainWorld(100, 1), old = world.store("minecraft:nether", 20);
  world.put(old, 1, 1, stone, 1, COL);
  const before = generation(old);
  const replacement = world.store("minecraft:nether", 28);
  assert.ok(generation(old) > before);
  assert.equal(world.stores.has(old.id), false);
  assert.equal(generation(replacement), 0);
  const emptyStore = replacement;
  world.store("minecraft:nether", 36);
  assert.equal(generation(emptyStore), 0, "retiring an empty store loses no available demand data");
});
