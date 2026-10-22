import assert from "node:assert/strict";
import test from "node:test";
import { PreviewPersistence } from "../packs/map_bp/scripts/preview-persistence.js";

const OW = "minecraft:overworld|surface";
const END = "minecraft:the_end|surface";
const NETHER = "minecraft:nether|layer64";
const NOW = 1800000000000;
const WEEK = 7 * 86400000;
const PREFIX = "map:preview:v2:r8:";
const INDEX = `${PREFIX}index`;
const GLYPH = "\uf400", OTHER = "\uf5ff";
function fixture(initial = []) {
  const data = new Map(initial), io = [];
  const storage = {
    get(key) { io.push(["get", key]); return data.get(key); },
    set(key, value) { io.push(["set", key, value]); data.set(key, value); },
  };
  return { data, io, storage };
}
function load(p, f, now = NOW) {
  const before = f.io.length;
  const result = p.loadOne(now);
  const events = f.io.slice(before);
  assert.ok(events.length <= 1, "loadOne uses at most one storage operation");
  assert.ok(events.every(e => e[0] === "get"), "loadOne never writes");
  return result;
}
function flush(p, f, now = NOW) {
  const before = f.io.length;
  const result = p.flushOne(now);
  const events = f.io.slice(before);
  assert.ok(events.length <= 1, "flushOne uses at most one storage operation");
  assert.ok(events.every(e => e[0] === "set"), "flushOne never reads");
  assert.equal(result, events.length === 1);
  return result;
}
function settle(p, f) {
  for (let n = 0; n < 1024 && (!p.stats().ready || p.stats().pending || p.stats().dirtyPages || p.stats().pendingCommit); n++) {
    load(p, f); flush(p, f);
    if (n === 1023) assert.fail("persistence did not settle");
  }
}
function roundtrip(f, store = OW, x = 5, z = 5, now = NOW) {
  const p = new PreviewPersistence(f.storage);
  p.request(store, x, z);
  assert.equal(load(p, f, now), undefined, "manifest read is its own call");
  return load(p, f, now);
}
function seed(f, entries = [[OW, 5, 5, GLYPH]], options) {
  const p = new PreviewPersistence(f.storage, options);
  for (const [store, x, z, glyph] of entries) assert.equal(p.note(store, x, z, glyph, NOW), true);
  settle(p, f);
  return p;
}
function mutatePage(f, mutate) {
  const index = JSON.parse(f.data.get(INDEX));
  const row = index[3][0];
  const key = `${PREFIX}p:${row[0]}`;
  const page = JSON.parse(f.data.get(key));
  mutate(page);
  const raw = JSON.stringify(page);
  f.data.set(key, raw);
  row[5] = Buffer.byteLength(raw);
  f.data.set(INDEX, JSON.stringify(index));
}

test("constructor/request/note are IO-free; requests deduplicate and bound", () => {
  const f = fixture();
  const p = new PreviewPersistence(f.storage, { maxPendingRequests: 2 });
  assert.equal(p.request(OW, 5, 5), true);
  assert.equal(p.request(OW, 125, 125), false);
  assert.equal(p.request(OW, 133, 5), true);
  assert.equal(p.request(OW, 261, 5), false);
  assert.equal(p.note(OW, 5, 5, GLYPH, NOW), true);
  assert.equal(p.flushOne(NOW), false, "flush cannot read the manifest secretly");
  assert.deepEqual(f.io, []);
  assert.equal(p.stats().rejectedRequests, 1);
  assert.ok(p.stats().pending <= 3);
});

test("reload roundtrip preserves all page corners, negatives, and anchors", () => {
  const f = fixture();
  const input = [[OW, -131, -131, OTHER], [OW, -123, -123, GLYPH], [OW, -3, -3, OTHER], [OW, 5, 5, GLYPH], [OW, 125, 125, OTHER]];
  seed(f, input);
  for (const [store, wx, wz, glyph] of input) {
    const result = roundtrip(f, store, wx, wz);
    assert.ok(result.entries.some(e => e.wx === wx && e.wz === wz && e.glyph === glyph));
    for (const e of result.entries) {
      assert.equal(((e.wx % 8) + 8) % 8, 5);
      assert.equal(((e.wz % 8) + 8) % 8, 5);
      assert.deepEqual(Object.keys(e), ["wx", "wz", "glyph"]);
    }
  }
});

test("dimensions and Nether altitude stores never alias; only own fixed keys are touched", () => {
  const f = fixture([["other:important", "keep"], ["map:unrelated", "also keep"]]);
  const entries = [[OW, 5, 5, GLYPH], [END, 5, 5, OTHER], [NETHER, 5, 5, "\uf401"], ["minecraft:nether|layer65", 5, 5, "\uf402"]];
  seed(f, entries);
  for (const [store, x, z, glyph] of entries) assert.equal(roundtrip(f, store, x, z).entries[0].glyph, glyph);
  assert.equal(f.data.get("other:important"), "keep");
  assert.equal(f.data.get("map:unrelated"), "also keep");
  assert.ok(f.io.every(([, key]) => key === INDEX || /^map:preview:v2:r8:p:(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/.test(key)));
});

test("unknown cells are absent; only canonical actual known PUA notes are accepted", () => {
  const f = fixture();
  const p = seed(f);
  assert.deepEqual(roundtrip(f).entries, [{ wx: 5, wz: 5, glyph: GLYPH }]);
  const invalid = [[OW, 5, 5, "\uf338"], [OW, 5, 5, "\uf330"], [OW, 5, 5, "\uf600"], [OW, 4, 5, GLYPH], [OW, 5, 6, GLYPH], [OW, NaN, 5, GLYPH], [OW, 30000005, 5, GLYPH], [OW, 5, 5, "x"], [OW, 5, 5, "\uf900"], [OW, 5, 5, "\uf2ff"], [OW, 5, 5, GLYPH + OTHER], ["username:evil|surface", 5, 5, GLYPH], ["minecraft:nether|layer-0", 5, 5, GLYPH]];
  const before = f.io.length;
  for (const args of invalid) assert.equal(p.note(...args, NOW), false);
  assert.equal(p.note(OW, 5, 5, GLYPH, -1), false);
  assert.equal(f.io.length, before);
  assert.equal(p.stats().rejectedNotes, invalid.length + 1);
});

test("notes before hydration merge old cells and win for changed cells", () => {
  const f = fixture();
  seed(f, [[OW, 5, 5, GLYPH], [OW, 13, 5, GLYPH]]);
  const p = new PreviewPersistence(f.storage);
  p.note(OW, 5, 5, OTHER, NOW + 1);
  p.note(OW, 21, 5, OTHER, NOW + 1);
  load(p, f, NOW + 1);
  assert.equal(flush(p, f, NOW + 1), false, "unread dirty page must merge before flush");
  const hydrated = load(p, f, NOW + 1);
  assert.deepEqual(hydrated.entries.map(e => e.glyph), [OTHER, GLYPH, OTHER]);
  flush(p, f, NOW + 1); flush(p, f, NOW + 1);
  assert.deepEqual(roundtrip(f, OW, 5, 5, NOW + 1).entries, hydrated.entries);
});

test("dirty RAM pages apply explicit backpressure and cannot be silently evicted", () => {
  const f = fixture();
  const p = new PreviewPersistence(f.storage, { maxResidentPages: 2 });
  assert.equal(p.note(OW, 5, 5, GLYPH, NOW), true);
  assert.equal(p.note(OW, 133, 5, OTHER, NOW), true);
  assert.equal(p.note(OW, 261, 5, GLYPH, NOW), false);
  assert.equal(p.stats().dirtyPages, 2);
  assert.equal(p.stats().residentPages, 2);
  assert.equal(p.stats().rejectedNotes, 1);
  settle(p, f);
  assert.equal(p.note(OW, 261, 5, GLYPH, NOW), true);
  settle(p, f);
  assert.equal(roundtrip(f).entries[0].glyph, GLYPH);
  assert.equal(roundtrip(f, OW, 133, 5).entries[0].glyph, OTHER);
  assert.ok(p.stats().evictions >= 1);
});

test("oldest-snapshot saved eviction and resident caps hold across repeated new exploration", () => {
  const f = fixture();
  const p = new PreviewPersistence(f.storage, { maxSavedPages: 3, maxResidentPages: 2 });
  for (let i = 0; i < 12; i++) {
    assert.equal(p.note(OW, i * 128 + 5, 5, GLYPH, NOW + i), true);
    for (let n = 0; n < 4; n++) { load(p, f, NOW + i); flush(p, f, NOW + i); }
    assert.ok(p.stats().savedPages <= 3);
    assert.ok(p.stats().residentPages <= 2);
  }
  assert.equal([...f.data.keys()].filter(k => k.startsWith(`${PREFIX}p:`)).length, 3);
  assert.equal(roundtrip(f, OW, 5, 5, NOW + 20), undefined, "oldest saved page was reused");
  assert.ok(roundtrip(f, OW, 11 * 128 + 5, 5, NOW + 20));
});

test("all 128 fully populated pages fit strict property and logical byte caps", () => {
  const f = fixture();
  const p = new PreviewPersistence(f.storage);
  for (let page = 0; page < 140; page++) {
    for (let i = 0; i < 256; i++) p.note(OW, page * 128 + (i % 16) * 8 + 5, Math.floor(i / 16) * 8 + 5, String.fromCharCode(0xf400 + i), NOW + page);
    for (let n = 0; n < 4; n++) { load(p, f, NOW + page); flush(p, f, NOW + page); }
  }
  assert.equal(p.stats().savedPages, 128);
  assert.ok(p.stats().residentPages <= 16);
  assert.equal(f.data.size, 129);
  for (const raw of f.data.values()) assert.ok(Buffer.byteLength(raw) < 32767);
  const actual = [...f.data.values()].reduce((n, s) => n + Buffer.byteLength(s), 0);
  assert.equal(p.stats().persistedBytes, actual);
  assert.ok(actual < 256 * 1024);
  assert.equal(p.stats().bytesWritten, f.io.filter(e => e[0] === "set").reduce((n, e) => n + Buffer.byteLength(e[2]), 0));
});

test("both compact RLE and fixed packing roundtrip valid known flags", () => {
  const f = fixture();
  seed(f);
  assert.equal(JSON.parse(f.data.get(`${PREFIX}p:0`))[7], "r");
  const p = new PreviewPersistence(f.storage);
  for (let i = 0; i < 256; i++) p.note(OW, (i % 16) * 8 + 5, Math.floor(i / 16) * 8 + 5, String.fromCharCode(0xf400 + i), NOW);
  settle(p, f);
  assert.equal(JSON.parse(f.data.get(`${PREFIX}p:0`))[7], "p");
  assert.equal(roundtrip(f).entries.length, 256);
});

test("stale and future pages return nothing without deleting any properties", () => {
  for (const now of [NOW + WEEK + 1, NOW - 1]) {
    const f = fixture([["other:save", "untouched"]]); seed(f);
    const before = [...f.data];
    assert.equal(roundtrip(f, OW, 5, 5, now), undefined);
    assert.deepEqual([...f.data], before);
    assert.equal(f.io.filter(e => e[0] === "set").length, 2);
  }
});

test("oversized, malformed, unsupported-version indexes fail closed without broad cleanup", () => {
  for (const raw of [42, null, "{", "x".repeat(32767), JSON.stringify([99, 8, 16, [], "native"]), JSON.stringify([3, 2, 16, [], "native"]), JSON.stringify([3, 8, 16, Array(129).fill([0, OW, 0, 0, NOW, 10]), "native"]), JSON.stringify([3, 8, 16, [[0, OW, 0, 0, NOW, 10], [0, END, 0, 0, NOW, 10]], "native"]), JSON.stringify([3, 8, 16, [[0, "raw:user", 0, 0, NOW, 10]], "native"]), JSON.stringify([3, 8, 16, [], "other"])]) {
    const f = fixture([[INDEX, raw], ["other:key", "preserve"]]);
    const p = new PreviewPersistence(f.storage);
    p.request(OW, 5, 5);
    load(p, f); assert.equal(load(p, f), undefined);
    assert.equal(p.stats().corrupt, 1);
    assert.equal(p.stats().writes, 0);
    assert.equal(f.data.get("other:key"), "preserve");
  }
});

test("decoded page validates every schema field, identity, size, glyph and base64 flag", () => {
  const mutations = [
    d => { d[0] = 99; }, d => { d[1] = 2; }, d => { d[2] = 15; }, d => { d[3] = END; }, d => { d[4] = 1; }, d => { d[5] = 1; }, d => { d[6] = NOW + 1; }, d => { d[7] = "unknown"; }, d => { d[8] = "!!!!"; }, d => { d[8] = "AA=="; }, d => { d[8] = Buffer.from([255, 6, 1]).toString("base64"); }, d => { d[8] = Buffer.from([0, 0, 1]).toString("base64"); }, d => { d.push("extra"); }, d => { d[8] = "x".repeat(32767); },
  ];
  for (const mutate of mutations) {
    const f = fixture(); seed(f); mutatePage(f, mutate);
    const p = new PreviewPersistence(f.storage); p.request(OW, 5, 5);
    load(p, f); assert.equal(load(p, f), undefined);
    assert.ok(p.stats().corrupt > 0);
  }
  const f = fixture(); seed(f); f.data.set(`${PREFIX}p:0`, "{}");
  assert.equal(roundtrip(f), undefined, "page bytes must match its manifest");
});

test("phased commits survive interruption safely and keep notes made mid-commit dirty", () => {
  const f = fixture(); seed(f, [[OW, 5, 5, GLYPH]], { maxSavedPages: 1 });
  const p = new PreviewPersistence(f.storage, { maxSavedPages: 1 });
  p.note(OW, 133, 5, OTHER, NOW); load(p, f); load(p, f);
  assert.equal(flush(p, f), true);
  assert.equal(roundtrip(f), undefined, "old manifest cannot hydrate overwritten slot");
  assert.equal(roundtrip(f, OW, 133, 5), undefined, "uncommitted page is not discovered");
  p.note(OW, 141, 5, GLYPH, NOW);
  assert.equal(flush(p, f), true);
  assert.equal(p.stats().dirtyPages, 1);
  settle(p, f);
  assert.equal(roundtrip(f, OW, 133, 5).entries.length, 2);
});

test("adapter failures are counted, bounded and retry without dropping dirty samples", () => {
  const f = fixture();
  let failGet = true, failSet = true;
  const p = new PreviewPersistence({
    get(k) { if (failGet) { failGet = false; throw new Error("not ready"); } return f.storage.get(k); },
    set(k, v) { if (failSet) { failSet = false; throw new Error("busy"); } f.storage.set(k, v); },
  });
  p.note(OW, 5, 5, GLYPH, NOW);
  load(p, f); assert.equal(p.stats().ready, false);
  settle(p, f);
  assert.equal(p.stats().errors, 2);
  assert.equal(p.stats().dirtyPages, 0);
  assert.equal(roundtrip(f).entries[0].glyph, GLYPH);
});

test("unchanged actual samples avoid writes until TTL half-life", () => {
  const f = fixture(); seed(f);
  const p = new PreviewPersistence(f.storage);
  p.request(OW, 5, 5); load(p, f); load(p, f);
  const before = f.io.length;
  for (let i = 0; i < 100; i++) assert.equal(p.note(OW, 5, 5, GLYPH, NOW + i), true);
  assert.equal(flush(p, f), false);
  assert.equal(f.io.length, before);
  assert.equal(p.note(OW, 5, 5, GLYPH, NOW + WEEK / 2), true);
  assert.equal(flush(p, f, NOW + WEEK / 2), true);
  assert.equal(flush(p, f, NOW + WEEK / 2), true);
  assert.ok(roundtrip(f, OW, 5, 5, NOW + WEEK + 1));
});

test("a reduced saved-page cap retires excess index rows on next commit", () => {
  const f = fixture();
  seed(f, [[OW, 5, 5, GLYPH], [OW, 133, 5, GLYPH], [OW, 261, 5, GLYPH]]);
  const p = new PreviewPersistence(f.storage, { maxSavedPages: 1 });
  p.note(OW, 389, 5, OTHER, NOW); settle(p, f);
  assert.equal(p.stats().savedPages, 1);
  assert.equal(roundtrip(f), undefined);
  assert.equal(roundtrip(f, OW, 389, 5).entries[0].glyph, OTHER);
});

test("loaded resident pages replay from memory after terrain RAM is discarded", () => {
  const f = fixture();
  seed(f, [[OW, 5, 5, GLYPH], [OW, 13, 5, OTHER]]);
  const p = new PreviewPersistence(f.storage);
  assert.equal(p.request(OW, 5, 5), true);
  load(p, f);
  const hydrated = load(p, f);
  const before = { io: f.io.length, reads: p.stats().reads, writes: p.stats().writes };
  assert.equal(p.request(OW, 5, 5), true, "resident page can hydrate a replacement terrain cache");
  for (let i = 0; i < 1000; i++) assert.equal(p.request(OW, 125, 125), false);
  assert.equal(p.stats().pending, 1);
  assert.deepEqual(load(p, f), hydrated);
  assert.equal(load(p, f), undefined);
  assert.equal(flush(p, f), false, "replay does not dirty a clean page");
  assert.deepEqual({ io: f.io.length, reads: p.stats().reads, writes: p.stats().writes }, before);
});

test("resident replay includes fresh dirty notes and expires without storage IO", () => {
  const f = fixture();
  const p = seed(f, [[OW, 5, 5, GLYPH], [OW, 13, 5, GLYPH]]);
  const before = f.io.length;
  assert.equal(p.request(OW, 5, 5), true);
  assert.equal(p.note(OW, 5, 5, OTHER, NOW + 1), true);
  assert.deepEqual(load(p, f, NOW + 1).entries.map(e => e.glyph), [OTHER, GLYPH]);
  assert.equal(p.stats().dirtyPages, 1, "replay cannot clear uncommitted notes");
  assert.equal(p.stats().pendingCommit, false, "replay does not start a write");
  assert.equal(p.request(OW, 5, 5), true);
  assert.equal(load(p, f, NOW + WEEK + 2), undefined, "expired resident snapshots stay hidden");
  assert.equal(p.request(OW, 5, 5), true);
  assert.equal(load(p, f, NOW), undefined, "future resident snapshots stay hidden");
  assert.equal(f.io.length, before);
});

test("resident replays share bounded FIFO backpressure with cold requests", () => {
  const f = fixture();
  seed(f, [[OW, 5, 5, GLYPH], [OW, 133, 5, OTHER], [OW, 261, 5, OTHER]]);
  const p = new PreviewPersistence(f.storage, { maxPendingRequests: 2 });
  p.request(OW, 5, 5); load(p, f); load(p, f);
  assert.equal(p.request(OW, 5, 5), true);
  assert.equal(p.request(OW, 133, 5), true);
  assert.equal(p.request(OW, 261, 5), false);
  assert.equal(p.stats().rejectedRequests, 1);
  const reads = p.stats().reads;
  assert.equal(load(p, f).entries[0].wx, 5);
  assert.equal(p.stats().reads, reads);
  assert.equal(p.request(OW, 5, 5), true, "a render can requeue after replay");
  assert.equal(load(p, f).entries[0].wx, 133, "older cold request wins over a new replay");
  assert.equal(p.stats().reads, reads + 1);
  assert.equal(load(p, f).entries[0].wx, 5);
  assert.equal(p.stats().pending, 0);
});

test("eviction drops queued memory replay instead of rereading it from disk", () => {
  const f = fixture();
  const p = seed(f, undefined, { maxResidentPages: 1 });
  assert.equal(p.request(OW, 5, 5), true);
  assert.equal(p.note(OW, 133, 5, OTHER, NOW), true);
  assert.equal(p.stats().pending, 1, "only the new unloaded page remains");
  const reads = p.stats().reads;
  load(p, f); load(p, f);
  assert.equal(p.stats().reads, reads);
  assert.equal(p.stats().pending, 0);
});

test("corrupt disk pages cannot become valid memory replays", () => {
  const f = fixture(); seed(f); f.data.set(`${PREFIX}p:0`, "{}");
  const p = new PreviewPersistence(f.storage);
  p.request(OW, 5, 5); load(p, f); assert.equal(load(p, f), undefined);
  const before = f.io.length;
  assert.equal(p.request(OW, 5, 5), true);
  assert.equal(load(p, f), undefined);
  assert.equal(f.io.length, before);
  assert.equal(p.stats().corrupt, 1);
});

test("constructor limits cannot disable bounded storage or RAM", () => {
  for (const options of [{ maxSavedPages: 129 }, { maxResidentPages: 33 }, { maxPendingRequests: 129 }, { maxAgeMs: WEEK + 1 }, { maxSavedPages: 0 }, { maxResidentPages: NaN }]) assert.throws(() => new PreviewPersistence(fixture().storage, options), RangeError);
  assert.throws(() => new PreviewPersistence({}), TypeError);
});

test("profile constructor and same-profile updates are IO-free and preserve dirty state", () => {
  const f = fixture();
  const p = new PreviewPersistence(f.storage, { profile: "material" });
  assert.equal(p.stats().profile, "material");
  p.request(OW, 5, 5); p.note(OW, 5, 5, GLYPH, NOW);
  const before = p.stats();
  assert.equal(p.setProfile("material"), false);
  assert.deepEqual(p.stats(), before);
  assert.equal(p.setProfile("native"), true);
  assert.equal(p.stats().ready, false);
  assert.equal(p.stats().residentPages, 0);
  assert.equal(p.stats().pending, 0);
  assert.equal(p.stats().dirtyPages, 0);
  assert.equal(p.stats().pendingCommit, false);
  assert.deepEqual(f.io, []);
  for (const invalid of [null, "", "Native", "native:other", 1]) {
    assert.throws(() => new PreviewPersistence(f.storage, { profile: invalid }), RangeError);
    assert.throws(() => p.setProfile(invalid), RangeError);
  }
  assert.deepEqual(f.io, []);
});

test("switching profiles drops resident dirty data, pending replay and the old index", () => {
  const f = fixture(); const p = seed(f);
  p.note(OW, 13, 5, OTHER, NOW); p.request(OW, 5, 5); p.request(OW, 133, 5);
  const disk = [...f.data], io = f.io.length;
  assert.equal(p.setProfile("material"), true);
  assert.equal(f.io.length, io); assert.deepEqual([...f.data], disk);
  assert.equal(flush(p, f), false, "old dirty notes cannot flush after a reset");
  assert.equal(p.request(OW, 5, 5), true);
  assert.equal(load(p, f), undefined); assert.equal(load(p, f), undefined);
  assert.equal(p.stats().profileMisses, 1); assert.equal(p.stats().corrupt, 0);
  assert.equal(p.stats().savedPages, 0);
  p.note(OW, 5, 5, OTHER, NOW); settle(p, f);
  const material = new PreviewPersistence(f.storage, { profile: "material" });
  material.request(OW, 5, 5); load(material, f);
  assert.deepEqual(load(material, f).entries, [{ wx: 5, wz: 5, glyph: OTHER }]);
  assert.equal(JSON.parse(f.data.get(INDEX))[4], "material");
  assert.equal(JSON.parse(f.data.get(`${PREFIX}p:0`))[9], "material");
  p.setProfile("native"); p.request(OW, 5, 5);
  assert.equal(load(p, f), undefined); assert.equal(load(p, f), undefined);
  p.note(OW, 5, 5, GLYPH, NOW); settle(p, f);
  assert.deepEqual(roundtrip(f).entries, [{ wx: 5, wz: 5, glyph: GLYPH }]);
});

test("profile reset abandons both successful page writes and failed index commits", () => {
  for (const failIndex of [false, true]) {
    const f = fixture(); seed(f);
    let rejectIndex = false;
    const p = new PreviewPersistence({ get: k => f.storage.get(k), set(k, v) {
      if (rejectIndex && k === INDEX) throw new Error("index busy");
      f.storage.set(k, v);
    } });
    p.note(OW, 5, 5, OTHER, NOW); load(p, f); load(p, f);
    assert.equal(flush(p, f), true); assert.equal(p.stats().pendingCommit, true);
    if (failIndex) { rejectIndex = true; assert.equal(flush(p, f), false); }
    const writes = p.stats().writes, io = f.io.length;
    assert.equal(p.setProfile("material"), true);
    assert.equal(f.io.length, io); assert.equal(p.stats().pendingCommit, false);
    assert.equal(flush(p, f), false); assert.equal(p.stats().writes, writes);
    rejectIndex = false;
    p.note(OW, 5, 5, GLYPH, NOW); settle(p, f);
    const q = new PreviewPersistence(f.storage, { profile: "material" });
    q.request(OW, 5, 5); load(q, f);
    assert.deepEqual(load(q, f).entries, [{ wx: 5, wz: 5, glyph: GLYPH }]);
    assert.equal(roundtrip(f), undefined, "native restart must ignore a material manifest");
  }
});

test("wrong profile and unstamped pages never hydrate despite valid glyph values", () => {
  for (const stamp of ["material", undefined, "other"]) {
    const f = fixture(); seed(f);
    mutatePage(f, d => { if (stamp === undefined) d.pop(); else d[9] = stamp; });
    const p = new PreviewPersistence(f.storage); p.request(OW, 5, 5);
    load(p, f); assert.equal(load(p, f), undefined);
    assert.equal(p.stats().writes, 0);
    if (stamp === "material") { assert.equal(p.stats().profileMisses, 1); assert.equal(p.stats().corrupt, 0); }
    else assert.equal(p.stats().corrupt, 1);
  }
});

test("legacy unstamped manifests and pages cannot acquire a profile implicitly", () => {
  const f = fixture(); seed(f);
  const index = JSON.parse(f.data.get(INDEX)); index.pop(); index[0]--;
  f.data.set(INDEX, JSON.stringify(index));
  const before = [...f.data];
  for (const profile of ["native", "material"]) {
    const p = new PreviewPersistence(f.storage, { profile }); p.request(OW, 5, 5);
    load(p, f); assert.equal(load(p, f), undefined);
    assert.equal(p.stats().writes, 0); assert.ok(p.stats().corrupt > 0);
  }
  assert.deepEqual([...f.data], before);
});

test("profile switching preserves negative grid anchors and each existing resolution namespace", () => {
  const probe = new PreviewPersistence(fixture().storage);
  const resolutions = probe.resolution === undefined ? [8] : [4, 8];
  for (const resolution of resolutions) {
    const f = fixture(); const x = -resolution + resolution / 2 + 1;
    const p = new PreviewPersistence(f.storage, { resolution, profile: "native" });
    p.note(OW, x, x, GLYPH, NOW); settle(p, f);
    const keys = [...f.data.keys()].sort();
    p.setProfile("material"); p.note(OW, x, x, OTHER, NOW); settle(p, f);
    assert.deepEqual([...f.data.keys()].sort(), keys, "mode switches cannot allocate a second slot namespace");
    const q = new PreviewPersistence(f.storage, { resolution, profile: "material" });
    q.request(OW, x, x); load(q, f);
    assert.deepEqual(load(q, f).entries, [{ wx: x, wz: x, glyph: OTHER }]);
    if (resolution === 4) assert.ok(keys.every(k => k.startsWith("map:preview:v2:r4:")));
    else assert.ok(keys.every(k => k.startsWith(PREFIX)));
  }
});

test("repeated profile changes keep the same bounded 128 physical page slots", () => {
  const f = fixture(); const p = new PreviewPersistence(f.storage);
  for (let i = 0; i < 150; i++) { p.note(OW, i * 128 + 5, 5, GLYPH, NOW); settle(p, f); }
  assert.equal(f.data.size, 129);
  for (let i = 0; i < 20; i++) {
    p.setProfile(i % 2 ? "native" : "material");
    p.note(OW, i * 128 + 5, 5, OTHER, NOW); settle(p, f);
    assert.equal(f.data.size, 129);
    assert.ok(p.stats().savedPages <= 128); assert.ok(p.stats().residentPages <= 16);
  }
  assert.ok([...f.data.keys()].every(k => k === INDEX || /^map:preview:v(?:1:|2:r8:)p:(?:[0-9]|[1-9][0-9]|1[01][0-9]|12[0-7])$/.test(k)));
});

test("an adapter-triggered profile reset cannot complete an obsolete read or write", () => {
  for (const operation of ["get", "set"]) {
    const f = fixture(); seed(f); let reset = false, p;
    p = new PreviewPersistence({
      get(k) { const raw = f.storage.get(k); if (reset && operation === "get") { reset = false; p.setProfile("material"); } return raw; },
      set(k, v) { f.storage.set(k, v); if (reset && operation === "set") { reset = false; p.setProfile("material"); } },
    });
    p.request(OW, 5, 5); load(p, f);
    if (operation === "get") { reset = true; assert.equal(load(p, f), undefined); }
    else { load(p, f); p.note(OW, 5, 5, OTHER, NOW); reset = true; assert.equal(flush(p, f), true); }
    assert.equal(p.stats().profile, "material"); assert.equal(p.stats().ready, false);
    assert.equal(p.stats().residentPages, 0); assert.equal(p.stats().savedPages, 0);
    assert.equal(p.stats().pendingCommit, false);
  }
});
