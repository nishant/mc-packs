// Minimap hot paths (packs/map_bp/scripts/budget.js): which players a pass serves each tick, chosen with one lookup per
// player instead of sorting everyone waiting. This counts work and checks choices; it cannot show milliseconds, which
// only a native profile of the bundle can.
//   node --test tools/map-hotpaths.test.mjs
//   MAP_HOTPATHS_RED=1 node --test tools/map-hotpaths.test.mjs   (the old sort-everyone code: the work bound fails)
import assert from "node:assert/strict";
import test from "node:test";
import { oldestDue } from "../packs/map_bp/scripts/budget.js";

/** What main.js did before: collect everyone due, then sort all of them by wait. */
function legacyDue(players, passAt, now, interval, each) {
  let due = [];
  for (const p of players) if (now - (passAt.get(p.id) ?? -Infinity) >= interval) due.push(p);
  if (due.length > each) due = due.sort((a, b) => (passAt.get(a.id) ?? -Infinity) - (passAt.get(b.id) ?? -Infinity)).slice(0, each);
  return due;
}
const pick = process.env.MAP_HOTPATHS_RED ? legacyDue : oldestDue;

/** A Map that counts its reads. */
function countingMap(entries) {
  const m = new Map(entries);
  m.reads = 0;
  const get = m.get.bind(m);
  m.get = (k) => (m.reads++, get(k));
  return m;
}
/** A small seeded generator, so a failure repeats. */
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("a saturated pass tick reads each player's last pass once, however many are waiting", () => {
  const players = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` }));
  const passAt = countingMap(players.map((p, i) => [p.id, 1000 - 50 - (i % 17)]));
  const chosen = pick(players, passAt, 1000, 10, 2);
  assert.equal(chosen.length, 2);
  assert.ok(passAt.reads <= players.length, `${passAt.reads} lookups for ${players.length} players`);
});

test("the choice is the same as sorting everyone: longest-waiting first, new players before all, ties in list order", () => {
  const rand = rng(7);
  for (let round = 0; round < 500; round++) {
    const n = 1 + Math.floor(rand() * 45);
    const now = 200 + Math.floor(rand() * 50);
    const players = Array.from({ length: n }, (_, i) => ({ id: `q${i}` }));
    const passAt = new Map();
    for (const p of players) {
      const r = rand();
      if (r < 0.2) continue; // never served
      passAt.set(p.id, now - Math.floor(rand() * 25)); // some not yet due, many tied
    }
    const each = 1 + Math.floor(rand() * 3);
    const want = legacyDue(players, passAt, now, 10, each).map((p) => p.id);
    const got = oldestDue(players, passAt, now, 10, each).map((p) => p.id);
    assert.deepEqual(got, want, `round ${round}: ${n} players, ${each} each`);
  }
});

test("nobody due gives nothing, and fewer due than fit keep their list order even if a later one waited longer", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(oldestDue(players, new Map([["a", 95], ["b", 96], ["c", 97]]), 100, 10, 2), []);
  assert.deepEqual(oldestDue(players, new Map([["a", 90], ["b", 80], ["c", 99]]), 100, 10, 2).map((p) => p.id), ["a", "b"]);
});
