import assert from "node:assert/strict";
import test from "node:test";
import { PreviewPersistence } from "../packs/map_bp/scripts/preview-persistence.js";
import { G } from "../packs/map_bp/scripts/glyphs.js";
import { knownPreviewGlyph } from "../packs/map_bp/scripts/preview-glyph.js";
import { colKey, hydratePreview, PREVIEW, previewGlyph, sampleCoord, TerrainWorld } from "../packs/map_bp/scripts/terrain.js";

const OW = "minecraft:overworld|surface", NOW = 1800000000000, WEEK = 7 * 86400000;
const GRASS = G.Q_GRASS, STONE = G.Q_STONE;
function fixture(initial = []) {
  const data = new Map(initial), io = [];
  const storage = { get(key) { io.push(["get", key]); return data.get(key); }, set(key, value) { io.push(["set", key]); data.set(key, value); } };
  return { data, io, storage };
}
function call(f, p, method, now = NOW) {
  const before = f.io.length, result = p[method](now), events = f.io.slice(before);
  assert.ok(events.length <= 1, "each host call performs at most one DP operation");
  assert.ok(events.every(e => e[0] === (method === "loadOne" ? "get" : "set")));
  return result;
}
function settle(f, p, now = NOW) {
  for (let i = 0; i < 1024; i++) {
    const s = p.stats();
    if (s.ready && !s.pending && !s.dirtyPages && !s.pendingCommit) return;
    call(f, p, "loadOne", now); call(f, p, "flushOne", now);
  }
  assert.fail("bounded preview persistence did not settle");
}
function reload(f, resolution, x, z, now = NOW) {
  const p = new PreviewPersistence(f.storage, { resolution });
  assert.equal(p.request(OW, x, z), true);
  assert.equal(call(f, p, "loadOne", now), undefined);
  return call(f, p, "loadOne", now);
}

for (const resolution of [4, 8]) {
  const anchor = resolution / 2 + 1, span = 16 * resolution;
  const prefix = `map:preview:v2:r${resolution}:`, index = `${prefix}index`;
  const canonical = n => Math.floor(n / resolution) * resolution + anchor;
  test(`grid ${resolution}: page span, corners, negatives, real world boundaries and IO-free notes`, () => {
    const f = fixture(), p = new PreviewPersistence(f.storage, { resolution });
    const coords = [-30000000, -span - resolution, -span, -resolution, 0, span - resolution, span, 29999992, 29999999].map(canonical);
    for (const x of coords) assert.equal(p.note(OW, x, x, GRASS, NOW), true);
    assert.deepEqual(f.io, []);
    settle(f, p);
    for (const x of coords) {
      const saved = reload(f, resolution, x, x);
      assert.ok(saved.entries.some(e => e.wx === x && e.wz === x && e.glyph === GRASS));
      for (const e of saved.entries) {
        assert.equal(e.wx, canonical(e.wx)); assert.equal(e.wz, canonical(e.wz));
        assert.equal(Math.floor(e.wx / span), Math.floor(x / span));
      }
    }
    assert.ok(f.io.every(([, key]) => key.startsWith(prefix)));
    assert.deepEqual(JSON.parse(f.data.get(index)).slice(0, 3), [3, resolution, 16]);
    for (const [key, raw] of f.data) if (key !== index) assert.deepEqual(JSON.parse(raw).slice(0, 3), [3, resolution, 16]);
  });

  test(`grid ${resolution}: full 512-glyph palette and all flat terrain roundtrip, no empty/marker/overlay`, () => {
    const f = fixture(), p = new PreviewPersistence(f.storage, { resolution });
    const flat = Object.values(G).filter(knownPreviewGlyph);
    const glyphs = Array.from({ length: 512 }, (_, i) => String.fromCharCode(0xf400 + i)).concat(flat);
    for (let i = 0; i < glyphs.length; i++) {
      const x = Math.floor(i / 256) * span + (i % 16) * resolution + anchor;
      const z = Math.floor((i % 256) / 16) * resolution + anchor;
      assert.equal(p.note(OW, x, z, glyphs[i], NOW), true);
    }
    for (const invalid of [G.Q_EMPTY, G.S_BLANK, G.Q_MOB, G.Q_ROUTE, G.Q_SELF_0, "\uf600", "\uf8ff", "x"]) assert.equal(p.note(OW, anchor, anchor, invalid, NOW), false);
    assert.equal(p.note(OW, anchor - 1, anchor, GRASS, NOW), false);
    assert.equal(p.note(OW, anchor, anchor + 1, GRASS, NOW), false);
    assert.deepEqual(f.io, []);
    settle(f, p);
    const result = [];
    for (let page = 0; page < Math.ceil(glyphs.length / 256); page++) result.push(...reload(f, resolution, page * span + anchor, anchor).entries.map(e => e.glyph));
    assert.deepEqual(result, glyphs);
    assert.equal(JSON.parse(f.data.get(`${prefix}p:0`))[7], "p", "256 nonidentical cells retain fixed packing");
  });

  test(`grid ${resolution}: saved timestamps, live wins, resident replay, TTL and interrupted commit`, () => {
    const f = fixture(), p = new PreviewPersistence(f.storage, { resolution, maxSavedPages: 1, maxResidentPages: 1 });
    assert.ok(p.note(OW, anchor, anchor, GRASS, NOW));
    assert.ok(p.note(OW, anchor + resolution, anchor, STONE, NOW));
    settle(f, p);
    assert.equal(JSON.parse(f.data.get(`${prefix}p:0`))[7], "r");
    const q = new PreviewPersistence(f.storage, { resolution, maxSavedPages: 1, maxResidentPages: 1 });
    assert.ok(q.note(OW, anchor, anchor, STONE, NOW + 1));
    call(f, q, "loadOne", NOW + 1);
    assert.equal(call(f, q, "flushOne", NOW + 1), false, "no write before dirty-page read/merge");
    assert.deepEqual(call(f, q, "loadOne", NOW + 1).entries.map(e => e.glyph), [STONE, STONE]);
    settle(f, q, NOW + 1);
    const before = f.io.length;
    assert.ok(q.request(OW, anchor, anchor));
    assert.equal(call(f, q, "loadOne", NOW + 1).entries.length, 2);
    assert.equal(f.io.length, before, "resident replay is zero IO");
    assert.equal(reload(f, resolution, anchor, anchor, NOW + WEEK + 2), undefined);
    assert.equal(reload(f, resolution, anchor, anchor, NOW), undefined, "future sample timestamp is rejected");
    assert.ok(q.note(OW, span + anchor, anchor, GRASS, NOW + 2));
    call(f, q, "loadOne", NOW + 2); call(f, q, "flushOne", NOW + 2);
    assert.equal(reload(f, resolution, anchor, anchor, NOW + 2), undefined, "old index cannot read overwritten slot");
    assert.equal(reload(f, resolution, span + anchor, anchor, NOW + 2), undefined, "uncommitted page stays undiscoverable");
    call(f, q, "flushOne", NOW + 2);
    assert.equal(reload(f, resolution, span + anchor, anchor, NOW + 2).entries[0].glyph, GRASS);
  });

  test(`grid ${resolution}: 128 saved/32 resident pages, bounded pending and byte accounting`, () => {
    const f = fixture(), p = new PreviewPersistence(f.storage, { resolution, maxResidentPages: 32, maxPendingRequests: 128 });
    for (let page = 0; page < 140; page++) {
      for (let i = 0; i < 256; i++) assert.ok(p.note(OW, page * span + (i % 16) * resolution + anchor, Math.floor(i / 16) * resolution + anchor, String.fromCharCode(0xf400 + i), NOW + page));
      settle(f, p, NOW + page);
      assert.ok(p.stats().residentPages <= 32); assert.ok(p.stats().savedPages <= 128);
    }
    assert.equal(p.stats().savedPages, 128); assert.equal(f.data.size, 129);
    assert.equal(p.stats().persistedBytes, [...f.data.values()].reduce((n, raw) => n + Buffer.byteLength(raw), 0));
    assert.ok(p.stats().persistedBytes < 256 * 1024);
    for (const raw of f.data.values()) assert.ok(Buffer.byteLength(raw) < 32767);
    for (let page = 200; page < 328; page++) assert.ok(p.request(OW, page * span + anchor, anchor));
    assert.equal(p.request(OW, 400 * span + anchor, anchor), false);
    assert.equal(p.stats().pending, 128);
  });

  test(`grid ${resolution}: wrong version/grid or unknown decoded glyph fails closed`, () => {
    for (const mutate of [d => { d[0] = 1; }, d => { d[1] = resolution === 4 ? 8 : 4; }, d => { d[8] = Buffer.from([255, 0, G.Q_EMPTY.charCodeAt(0) - 0xf300 + 1]).toString("base64"); }]) {
      const f = fixture(), p = new PreviewPersistence(f.storage, { resolution });
      p.note(OW, anchor, anchor, GRASS, NOW); settle(f, p);
      const manifest = JSON.parse(f.data.get(index)), row = manifest[3][0], pageKey = `${prefix}p:${row[0]}`;
      const page = JSON.parse(f.data.get(pageKey)); mutate(page);
      const raw = JSON.stringify(page); row[5] = Buffer.byteLength(raw); f.data.set(pageKey, raw); f.data.set(index, JSON.stringify(manifest));
      assert.equal(reload(f, resolution, anchor, anchor), undefined);
    }
  });
}

test("real four-block samples at both 3/7 mod8 anchors restart as glyph-only preview, never fake detail", () => {
  const f = fixture(), p = new PreviewPersistence(f.storage, { resolution: PREVIEW });
  const live = new TerrainWorld(), store = live.store("minecraft:overworld");
  const source = { kind: "stone", y: 70, depth: 0, palette: 511 };
  const anchors = [-65, -61, -5, -1, 3, 7, 59, 63, 67];
  for (const x of anchors) {
    assert.equal(sampleCoord(x, PREVIEW), x);
    live.put(store, x, x, source, 10, PREVIEW);
    const detail = live.get(store, x, x, 2);
    assert.equal(detail.wx, x); assert.equal(detail.wz, x);
    assert.equal(p.note(store.id, x, x, store.preview.get(colKey(x, x, PREVIEW)).glyph, NOW), true);
  }
  assert.equal(p.stats().rejectedNotes, 0, "3 mod8 anchors must not be silently rejected by an old +5/8 rule");
  settle(f, p);
  const restarted = new TerrainWorld(), hydrated = restarted.store("minecraft:overworld");
  for (const x of anchors) {
    const page = reload(f, PREVIEW, x, x);
    for (const entry of page.entries) hydratePreview(hydrated, entry.wx, entry.wz, entry.glyph, 20);
    assert.equal(restarted.get(hydrated, x, x, PREVIEW).glyph, previewGlyph(source));
  }
  assert.equal(hydrated.cols.size, 0, "glyph pages cannot seed either real detail resolution");
  assert.ok([...hydrated.preview.values()].every(e => e.tick === -Infinity));
});

test("4 and 8 resolution prefixes never alias or touch old v1/foreign data under the same pack UUID", () => {
  const old = [["map:preview:v1:index", "old index"], ["map:preview:v1:p:0", "old page"], ["other:important", "keep"]];
  const f = fixture(old);
  for (const resolution of [8, 4]) {
    const p = new PreviewPersistence(f.storage, { resolution }), anchor = resolution / 2 + 1;
    assert.equal(p.request(OW, anchor, anchor), true);
    call(f, p, "loadOne"); assert.equal(call(f, p, "loadOne"), undefined, "another grid is never decoded");
    assert.ok(p.note(OW, anchor, anchor, resolution === 4 ? STONE : GRASS, NOW)); settle(f, p);
  }
  assert.equal(reload(f, 4, 3, 3).entries[0].glyph, STONE);
  assert.equal(reload(f, 8, 5, 5).entries[0].glyph, GRASS);
  for (const [key, value] of old) assert.equal(f.data.get(key), value);
  assert.ok(f.io.every(([, key]) => /^map:preview:v2:r[48]:/.test(key)));
  for (const resolution of [1, 2, 0, 16, NaN, "4", null]) assert.throws(() => new PreviewPersistence(f.storage, { resolution }), RangeError);
});
