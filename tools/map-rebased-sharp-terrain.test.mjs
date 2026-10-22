// Resolution-4 terrain preview cache contracts and native sampling bounds.
//   node --test tools/map-preview-terrain.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { G, paletteGlyph } from "../packs/map_bp/scripts/glyphs.js";
import { colKey, glyphAt, hydratePreview, PREVIEW, previewGlyph, sampleCoord, spendBudget, TerrainWorld } from "../packs/map_bp/scripts/terrain.js";

const OW = "minecraft:overworld";

test("preview keys are disjoint, bounded and stable for negative coordinates", () => {
  for (const [x, z] of [[0, 0], [-1, -9], [8, 8], [-30_000_000, 30_000_000], [30_000_000, -30_000_000]]) {
    const key = colKey(x, z, PREVIEW);
    assert.ok(key >= 2 ** 51 && key < 2 ** 52, `preview range: ${key}`);
    assert.notEqual(key, colKey(x, z, 2));
    assert.notEqual(key, colKey(x, z, 1));
  }
  assert.equal(colKey(1e12, 0, PREVIEW), -1);
  assert.equal(colKey(-1e12, 0, PREVIEW), -1);
  assert.equal(colKey(-1, -1, PREVIEW), colKey(-3, -3, PREVIEW));
  assert.notEqual(colKey(-5, -5, PREVIEW), colKey(-4, -4, PREVIEW));
  assert.equal(sampleCoord(3, PREVIEW), 3);
  assert.equal(sampleCoord(4, PREVIEW), 7);
  assert.equal(sampleCoord(-1, PREVIEW), -1);
  assert.equal(sampleCoord(-5, PREVIEW), -5);
  assert.equal(sampleCoord(5, 7), sampleCoord(5, 1), "other non-2 resolutions keep exact/fine behavior, not preview aliasing");
  assert.equal(colKey(5, 5, 7), colKey(5, 5, 1));
  assert.notEqual(colKey(5, 5, 7), colKey(5, 5, PREVIEW));
});

test("native preview samples stay dimension/layer isolated and seed a fresh canonical 2-block sample", () => {
  const world = new TerrainWorld();
  const surface = world.store(OW);
  const end = world.store("minecraft:the_end");
  const netherA = world.store("minecraft:nether", 20);
  const netherB = world.store("minecraft:nether", 40);
  const native = { kind: "stone", y: 85, depth: 0 };
  assert.equal(world.put(surface, 3, -1, native, 7, PREVIEW), true);
  const preview = world.get(surface, 3, -1, PREVIEW);
  const anchorX = sampleCoord(3, PREVIEW), anchorZ = sampleCoord(-1, PREVIEW);
  const detail = world.get(surface, anchorX, anchorZ, 2);
  assert.ok(preview);
  assert.ok(detail);
  assert.notEqual(detail, native);
  assert.notEqual(detail, preview, "preview glyph and native detail never share a mutable record");
  assert.equal(previewGlyph(native), G.Q_STONE, "no neighbor-height shading in the coarse preview");
  assert.equal(glyphAt(world, surface, 3, -1, PREVIEW), G.Q_STONE);
  assert.equal(world.get(end, 3, -1, PREVIEW), undefined);
  assert.equal(world.get(netherA, 3, -1, PREVIEW), undefined);
  assert.equal(world.get(netherB, 3, -1, PREVIEW), undefined);
  world.put(netherA, 3, -1, { kind: "nether", y: 60, depth: 0 }, 7, PREVIEW);
  assert.equal(glyphAt(world, netherA, 3, -1, PREVIEW), G.Q_NETHER);
  assert.equal(glyphAt(world, surface, 3, -1, PREVIEW), G.Q_STONE);
});

test("glyph-only hydration is known-terrain-only, stale for live work, and never fabricates detail", () => {
  const world = new TerrainWorld();
  const store = world.store(OW);
  assert.equal(hydratePreview(store, -1, -1, G.Q_SAND, 100), true);
  const key = colKey(-1, -1, PREVIEW);
  assert.equal(store.preview.get(key).glyph, G.Q_SAND);
  assert.equal(store.preview.get(key).tick, -Infinity, "a disk page cannot satisfy fresh-sample budget checks");
  assert.equal(world.get(store, -1, -1, 2), undefined, "hydration does not seed fake 2x2 terrain");
  assert.equal(world.get(store, -1, -1, 1), undefined, "hydration does not seed fake exact terrain");
  assert.equal(glyphAt(world, store, -1, -1, PREVIEW), G.Q_SAND);
  assert.equal(hydratePreview(store, 15, 15, paletteGlyph(511), 101), true, "all 512 palette PUA codes are valid");
  assert.equal(hydratePreview(store, 23, 23, G.Q_EMPTY, 101), false, "unknown/void is not persisted as terrain");
  assert.equal(hydratePreview(store, 31, 31, G.Q_MOB, 101), false, "marker glyphs are not terrain");
  assert.equal(hydratePreview(store, 39, 39, "x", 101), false);
  world.put(store, -1, -1, { kind: "grass", y: 70, depth: 0 }, 102, PREVIEW);
  const live = world.get(store, -1, -1, PREVIEW);
  assert.equal(live.glyph, G.Q_GRASS, "real data takes precedence over a hydrated glyph");
  assert.notEqual(live.tick, -Infinity);
});

test("preview lookup falls back to 2-block terrain before cached 4-block glyphs", () => {
  const world = new TerrainWorld();
  const store = world.store(OW);
  assert.equal(hydratePreview(store, 2, 2, G.Q_SAND, 0), true);
  assert.equal(glyphAt(world, store, 2, 2, PREVIEW), G.Q_SAND);
  world.put(store, 2, 2, { kind: "stone", y: 70, depth: 0 }, 1, 2);
  assert.equal(glyphAt(world, store, 2, 2, PREVIEW), G.Q_STONE, "canonical detail wins over a preview");
  world.put(store, 2, 2, { kind: "path", y: 70, depth: 0 }, 1, 1);
  assert.equal(glyphAt(world, store, 2, 2, PREVIEW), G.Q_PATH, "exact near-field detail wins over both lower resolutions");
});

test("resolution-4 picks retain the existing 48 total / 24 per-viewer native budget", () => {
  const world = new TerrainWorld();
  const store = world.store(OW);
  const picks = (start) => Array.from({ length: 80 }, (_, i) => {
    const wx = sampleCoord((start + i) * PREVIEW, PREVIEW);
    const wz = sampleCoord(0, PREVIEW);
    return { wx, wz, key: colKey(wx, wz, PREVIEW), resolution: PREVIEW };
  });
  const plans = [
    { id: "a", store, picks: picks(0) },
    { id: "b", store, picks: picks(1000) },
  ];
  let nativeReads = 0;
  const spent = spendBudget(plans, 48, 24, 0, 50, (_plan, pick) => {
    nativeReads++;
    world.put(store, pick.wx, pick.wz, { kind: "grass", y: 64, depth: 0 }, 50, PREVIEW);
  });
  assert.equal(nativeReads, 48);
  assert.deepEqual([...spent.values()], [24, 24]);
  assert.equal(store.preview.size, 48);
  assert.ok(store.cols.size >= 48, "each native preview result seeds its real 2x2 detail sample");
});


test("four-block keys stay exact at every +/-30M edge without x/z or fine aliasing", () => {
  assert.equal(PREVIEW, 4);
  const keys = new Set();
  for (const x of [-30000000, -29999996, -4, 0, 29999996, 30000000]) for (const z of [-30000000, -29999996, -4, 0, 29999996, 30000000]) {
    const key = colKey(x, z, PREVIEW);
    const expected = 2n ** 51n + (BigInt(Math.floor(x / 4)) + 2n ** 23n) * 2n ** 24n + BigInt(Math.floor(z / 4)) + 2n ** 23n;
    assert.equal(BigInt(key), expected);
    assert.ok(Number.isSafeInteger(key) && key >= 2 ** 51 && key < 2 ** 52);
    assert.ok(colKey(x, z, 2) < 2 ** 50);
    assert.ok(colKey(x, z, 1) >= 2 ** 52);
    assert.ok(!keys.has(key)); keys.add(key);
  }
  for (let tile = -16; tile <= 16; tile++) {
    const anchor = sampleCoord(tile * 4, PREVIEW);
    assert.equal(anchor, tile * 4 + 3);
    assert.equal(anchor, sampleCoord(anchor, 2), "preview read is at exactly the seeded canonical two-block sample");
  }
});

test("four-block misses and budget lookup remain isolated from fine and two-block entries", () => {
  const world = new TerrainWorld(), store = world.store(OW);
  const picks = [PREVIEW, 2, 1].map(resolution => ({ wx: 3, wz: 3, key: colKey(3, 3, resolution), resolution }));
  world.miss(store, 3, 3, 10, PREVIEW);
  assert.equal(store.previewMiss.size, 1); assert.equal(store.miss.size, 0);
  let reads = [];
  spendBudget([{ id: "p", store, picks, at: 10 }], 48, 24, 0, 10, (_plan, pick) => reads.push(pick.resolution));
  assert.deepEqual(reads, [2, 1], "only the missed four-block key is skipped");
  store.previewMiss.clear();
  world.put(store, 3, 3, { kind: "stone", y: 64, depth: 0 }, 11, PREVIEW);
  reads = [];
  spendBudget([{ id: "p", store, picks, at: 11 }], 48, 24, 0, 11, (_plan, pick) => reads.push(pick.resolution));
  assert.deepEqual(reads, [1], "real preview plus its real two-block seed cannot satisfy the distinct fine read");
});
