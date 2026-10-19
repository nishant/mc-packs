// Per-player owed storage (O23): tools/owed-shared.js with a fake world that enforces the real 32767-byte property
// limit, plus a guard that every pack that owes things stores it through scripts/owed.js.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const mod = await import(pathToFileURL(join(root, "tools", "owed-shared.js")).href);
const { createOwedStore, MAX_PLAYERS, MAX_ID_LENGTH, MAX_VALUE_BYTES, utf8Length } = mod;

class Crash extends Error {}

/** A world whose properties are limited like the real ones; `crashAfter(n)` throws on the n-th write from now. */
function fakeWorld(initial = {}) {
  const props = new Map(Object.entries(initial));
  const w = {
    props,
    writes: 0,
    limit: Infinity,
    maxBytes: 0,
    getDynamicProperty: (/** @type {string} */ k) => props.get(k),
    setDynamicProperty(/** @type {string} */ k, /** @type {any} */ v) {
      if (++w.writes > w.limit) throw new Crash("crash");
      if (typeof v === "string" && utf8Length(v) > 32767) throw new Error(`property ${k} is ${utf8Length(v)} bytes`);
      if (typeof v === "string") w.maxBytes = Math.max(w.maxBytes, utf8Length(v));
      if (v === undefined) props.delete(k);
      else props.set(k, v);
    },
    crashAfter(/** @type {number} */ n) {
      w.writes = 0;
      w.limit = n;
    },
    heal() {
      w.limit = Infinity;
    },
  };
  return w;
}

const quiet = () => {
  const logs = /** @type {string[]} */ ([]);
  const orig = console.warn;
  console.warn = (/** @type {any[]} */ ...a) => void logs.push(a.join(" "));
  return { logs, restore: () => (console.warn = orig) };
};

const ids = (/** @type {number} */ n, start = 0) => Array.from({ length: n }, (_, i) => String(1000000000000000000n + BigInt(start + i)));

test("set / get / take / remove keep one property per player and a small index", () => {
  const w = fakeWorld();
  const s = createOwedStore(w, { base: "t:owed" });
  assert.equal(s.set("111", { cr: 5 }), true);
  assert.equal(s.set("222", { cr: 7 }), true);
  assert.deepEqual(s.get("111"), { cr: 5 });
  assert.deepEqual([...w.props.keys()].sort(), ["t:owed:111", "t:owed:222", "t:owed_idx"]);
  assert.deepEqual(s.ids(), ["111", "222"]);
  assert.deepEqual(s.take("111"), { cr: 5 });
  assert.equal(s.take("111"), undefined);
  assert.equal(s.has("111"), false);
  assert.deepEqual(s.ids(), ["222"]);
  assert.equal(s.update("222", (c) => ({ cr: c.cr + 1 })), true);
  assert.deepEqual(s.get("222"), { cr: 8 });
  assert.equal(s.update("222", () => undefined), true);
  assert.equal(w.props.size, 0, "the index property goes with the last entry");
});

test("take removes before it returns, and hands nothing over when the removal fails", () => {
  const w = fakeWorld();
  const s = createOwedStore(w, { base: "t:owed" });
  s.set("1", { cr: 9 });
  const q = quiet();
  w.crashAfter(0);
  const got = s.take("1");
  q.restore();
  assert.equal(got, undefined);
  w.heal();
  assert.deepEqual(s.take("1"), { cr: 9 });
  assert.equal(s.take("1"), undefined);
});

test("legacy single-property data migrates, keeps unknown fields and removes the old property", () => {
  const legacy = { 11: { cr: 3, q: [["a", "b", "c"]], extra: { keep: true } }, 22: { cr: 4, q: [] } };
  const w = fakeWorld({ "t:owed": JSON.stringify(legacy) });
  const s = createOwedStore(w, { base: "t:owed" });
  assert.deepEqual(s.get("11"), legacy[11]);
  assert.equal(w.props.has("t:owed"), false);
  assert.deepEqual(s.ids(), ["11", "22"]);
  assert.deepEqual(s.take("22"), legacy[22]);
});

test("normalize repairs a recoverable legacy record and unusable ones are logged and dropped", () => {
  const w = fakeWorld({ "t:owed": JSON.stringify({ 1: 5, 2: null, 3: "x" }) });
  const q = quiet();
  const s = createOwedStore(w, { base: "t:owed", normalize: (v) => (typeof v === "number" ? { cr: v } : v === "x" ? undefined : v) });
  assert.deepEqual(s.get("1"), { cr: 5 });
  q.restore();
  assert.equal(s.has("2"), false);
  assert.equal(s.has("3"), false);
  assert.equal(q.logs.filter((l) => l.includes("nothing owed")).length, 2);
});

test("a property that is not a map of players is left exactly as it was", () => {
  for (const raw of ["not json {", "[1,2]", "5"]) {
    const w = fakeWorld({ "t:owed": raw });
    const q = quiet();
    const s = createOwedStore(w, { base: "t:owed" });
    assert.equal(s.set("1", { a: 1 }), true);
    q.restore();
    assert.equal(w.props.get("t:owed"), raw);
  }
});

test("an id that cannot be indexed stays in the old property, the rest moves", () => {
  const long = "9".repeat(MAX_ID_LENGTH + 1);
  const w = fakeWorld({ "t:owed": JSON.stringify({ 1: { cr: 1 }, [long]: { cr: 2 } }) });
  const q = quiet();
  const s = createOwedStore(w, { base: "t:owed" });
  assert.deepEqual(s.get("1"), { cr: 1 });
  q.restore();
  assert.deepEqual(JSON.parse(w.props.get("t:owed")), { [long]: { cr: 2 } });
});

test("a legacy value over the byte limit stays in the old property instead of being cut", () => {
  const big = { s: "x".repeat(MAX_VALUE_BYTES + 1000) };
  const w = fakeWorld({ "t:owed": JSON.stringify({ 1: big, 2: { cr: 1 } }) });
  const q = quiet();
  const s = createOwedStore(w, { base: "t:owed" });
  assert.deepEqual(s.get("2"), { cr: 1 });
  q.restore();
  assert.deepEqual(JSON.parse(w.props.get("t:owed")), { 1: big });
});

test("migration interrupted at every write resumes with nothing lost and nothing paid twice", () => {
  const players = ids(40);
  const legacy = Object.fromEntries(players.map((id, i) => [id, { cr: i + 1, q: [] }]));
  for (let crashAt = 0; crashAt < 60; crashAt++) {
    const w = fakeWorld({ "t:owed": JSON.stringify(legacy) });
    w.crashAfter(crashAt);
    const q = quiet();
    // The first run may die anywhere; the restart builds a new store over the same properties.
    const first = createOwedStore(w, { base: "t:owed" });
    try {
      first.get(players[0]);
    } catch {
      // the crash may surface from anywhere a write throws
    }
    // After the crash the first store may have paid some players (if its migration got that far): those never come back.
    w.heal();
    const paid = new Map();
    const second = createOwedStore(w, { base: "t:owed" });
    for (const id of players) {
      const v = second.take(id);
      if (v) paid.set(id, (paid.get(id) ?? 0) + v.cr);
      assert.equal(second.take(id), undefined, `${id} twice (crash at write ${crashAt})`);
    }
    q.restore();
    for (const [i, id] of players.entries()) assert.equal(paid.get(id), i + 1, `${id} lost or doubled (crash at write ${crashAt})`);
    assert.equal(w.props.has("t:owed"), false, `old property gone after the restart (crash at write ${crashAt})`);
    assert.equal(second.size(), 0);
  }
});

test("a player who takes their reward in the session where the migration failed is never paid again", () => {
  const w = fakeWorld({ "t:owed": JSON.stringify({ 1: { cr: 1 }, 2: { cr: 2 } }) });
  const q = quiet();
  // Fail only the final rewrite of the old property: values and index are written, the old property is not.
  const s = createOwedStore(w, { base: "t:owed" });
  w.crashAfter(3); // 2 values + index, then the old property rewrite fails
  assert.equal(s.take("1"), undefined, "nothing is handed over while the move is unfinished");
  w.heal();
  assert.deepEqual(s.take("1"), { cr: 1 });
  assert.equal(s.take("1"), undefined);
  q.restore();
  const again = createOwedStore(w, { base: "t:owed" });
  assert.equal(again.take("1"), undefined);
  assert.deepEqual(again.take("2"), { cr: 2 });
});

test("repeated loads and restarts are idempotent", () => {
  const w = fakeWorld({ "t:owed": JSON.stringify({ 1: { cr: 1 } }) });
  for (let i = 0; i < 5; i++) {
    const s = createOwedStore(w, { base: "t:owed" });
    assert.deepEqual(s.ids(), ["1"]);
  }
  assert.deepEqual(createOwedStore(w, { base: "t:owed" }).take("1"), { cr: 1 });
});

test("1,500 absent players: the oldest are dropped past the cap, each with a log line naming what it held", () => {
  const w = fakeWorld();
  const s = createOwedStore(w, { base: "t:owed" });
  const q = quiet();
  const players = ids(MAX_PLAYERS + 500);
  for (const [i, id] of players.entries()) assert.equal(s.set(id, { cr: i + 1 }), true);
  q.restore();
  assert.equal(s.size(), MAX_PLAYERS);
  assert.equal(q.logs.length, 500);
  assert.match(q.logs[0], new RegExp(`player ${players[0]} \\(\\{"cr":1\\}\\)`));
  assert.match(q.logs[0], /more than 1000 players are owed/);
  assert.equal(s.has(players[0]), false);
  assert.deepEqual(s.get(players[500]), { cr: 501 });
  assert.equal(w.props.size, MAX_PLAYERS + 1, "one value per player and the index, nothing else");
  assert.ok(w.maxBytes <= 27000, `worst property was ${w.maxBytes} bytes`);
});

test("worst-case index: the cap's longest ids stay under 32767 bytes", () => {
  const w = fakeWorld();
  const s = createOwedStore(w, { base: "t:owed" });
  const long = Array.from({ length: MAX_PLAYERS }, (_, i) => String(i).padStart(MAX_ID_LENGTH, "-"));
  for (const id of long) assert.equal(s.set(id, 1), true);
  assert.equal(s.size(), MAX_PLAYERS);
  const idx = w.props.get("t:owed_idx");
  assert.ok(utf8Length(idx) < 32767 && utf8Length(idx) === MAX_PLAYERS * (MAX_ID_LENGTH + 3) + 1, `index is ${utf8Length(idx)} bytes`);
});

test("a value over the byte limit and an overlong id are refused, not truncated", () => {
  const w = fakeWorld();
  const s = createOwedStore(w, { base: "t:owed" });
  const q = quiet();
  assert.equal(s.set("1", { s: "x".repeat(MAX_VALUE_BYTES) }), false);
  assert.equal(s.set("9".repeat(MAX_ID_LENGTH + 1), { a: 1 }), false);
  q.restore();
  assert.equal(w.props.size, 0);
});

test("legacy data of more than the cap migrates the newest and logs the dropped oldest", () => {
  const players = ids(MAX_PLAYERS + 40);
  const legacy = Object.fromEntries(players.map((id, i) => [id, { cr: i + 1 }]));
  const w = fakeWorld();
  // A legacy map that large can't exist in one property, so build it in pieces the way an older, bigger layout might have.
  w.props.set("t:owed", JSON.stringify(legacy));
  const q = quiet();
  const s = createOwedStore(w, { base: "t:owed" });
  assert.equal(s.size(), MAX_PLAYERS);
  q.restore();
  assert.equal(q.logs.length, 40);
  assert.equal(s.has(players[39]), false);
  assert.deepEqual(s.get(players[40]), { cr: 41 });
  assert.equal(w.props.has("t:owed"), false);
});

test("town's old ~900-player cliff: 1,000 players with finished projects all keep their crowns", () => {
  const w = fakeWorld();
  const s = createOwedStore(w, { base: "town:owed" });
  for (const id of ids(1000)) assert.equal(s.update(id, (c) => ({ cr: (c?.cr ?? 0) + 5, q: [["a", "b", "c"]] })), true);
  assert.equal(s.size(), 1000);
  assert.ok(w.maxBytes <= 32767);
});

test("an existing newer value is never overwritten by a stale legacy entry", () => {
  const w = fakeWorld({ "t:owed": JSON.stringify({ 1: { cr: 1 } }), "t:owed:1": JSON.stringify({ cr: 99 }) });
  const s = createOwedStore(w, { base: "t:owed" });
  assert.deepEqual(s.take("1"), { cr: 99 });
  assert.equal(s.take("1"), undefined);
});

test("a returning player: the entry survives a restart and is handed over once", () => {
  const w = fakeWorld();
  createOwedStore(w, { base: "t:owed" }).set("5", { cr: 3 });
  const s = createOwedStore(w, { base: "t:owed" });
  assert.deepEqual(s.take("5"), { cr: 3 });
  assert.equal(createOwedStore(w, { base: "t:owed" }).take("5"), undefined);
});

// ---------------------------------------------------------------------------
// The packs
// ---------------------------------------------------------------------------

const CONSUMERS = {
  cooking_bp: ["cooking:owed", "cooking:pending"],
  relics_bp: ["relics:pending"],
  bounty_bp: ["bounty:pending"],
  guilds_bp: ["guilds:pending"],
  town_bp: ["town:owed"],
  fishing_bp: ["fishing:owed"],
};

for (const [folder, bases] of Object.entries(CONSUMERS)) {
  test(`${folder} keeps ${bases.join(" and ")} per player through scripts/owed.js`, () => {
    const dir = join(root, "packs", folder, "scripts");
    assert.ok(existsSync(join(dir, "owed.js")), "scripts/owed.js (run node tools/sync-owed.mjs)");
    const src = readFileSync(join(dir, "main.js"), "utf8");
    assert.match(src, /from "\.\/owed\.js"/);
    for (const base of bases) {
      assert.ok(src.includes(`base: "${base}"`), `a store with base "${base}"`);
    }
    // No code path still writes the whole map into one property.
    assert.doesNotMatch(src, /setDynamicProperty\(PROP_(OWED|PENDING)\b/);
    assert.doesNotMatch(src, /(saveJson|saveWorld)\(\s*(world,\s*)?PROP_(OWED|PENDING)\b/);
  });
}
