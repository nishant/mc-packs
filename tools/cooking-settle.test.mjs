// F12: cooking_bp's settle must return a dish as due only when it really left the owed store. A failed save keeps
// the debt saved, so returning it as due too paid it twice (now and on the next join).
import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const { createOwedStore } = await import(pathToFileURL(join(root, "tools", "owed-shared.js")).href);
const settlePath = process.env.COOKING_SETTLE_MODULE ?? join(root, "packs", "cooking_bp", "scripts", "settle.js");
const { settleOwed, oweMore, keepInPot } = await import(pathToFileURL(settlePath).href);

/** A world whose writes to `failKey` throw while `fail` is set. */
function fakeWorld() {
  const props = new Map();
  const w = {
    props,
    failKey: "",
    getDynamicProperty: (/** @type {string} */ k) => props.get(k),
    setDynamicProperty(/** @type {string} */ k, /** @type {any} */ v) {
      if (k === w.failKey) throw new Error("property write failed");
      if (v === undefined) props.delete(k);
      else props.set(k, v);
    },
  };
  return w;
}

function setup() {
  const w = fakeWorld();
  const store = createOwedStore(/** @type {any} */ (w), { base: "cooking:owed", warn: () => {} });
  assert.equal(store.set("p1", { stew: 3, pie: 1 }), true);
  return { w, store };
}

test("settle hands over what it took off the store", () => {
  const { store } = setup();
  assert.equal(settleOwed(store, "p1", "stew", 2), 2);
  assert.deepEqual(store.get("p1"), { stew: 1, pie: 1 });
  assert.equal(settleOwed(store, "p1", "stew", 5), 1);
  assert.deepEqual(store.get("p1"), { pie: 1 });
  assert.equal(settleOwed(store, "p1", "pie", 1), 1);
  assert.equal(store.get("p1"), undefined);
});

test("settle returns nothing already paid on join", () => {
  const { store } = setup();
  store.remove("p1");
  assert.equal(settleOwed(store, "p1", "stew", 2), 0);
});

test("a failed save keeps the dishes owed and returns none as due (no double payment)", () => {
  const { w, store } = setup();
  w.failKey = "cooking:owed:p1";
  const due = settleOwed(store, "p1", "stew", 2);
  assert.equal(due, 0, "the debt is still saved, so nothing may be handed over now");
  w.failKey = "";
  assert.deepEqual(store.get("p1"), { stew: 3, pie: 1 }, "still owed for the next join");
});

test("a failed removal of the last dish keeps it owed too", () => {
  const w = fakeWorld();
  const store = createOwedStore(/** @type {any} */ (w), { base: "cooking:owed", warn: () => {} });
  store.set("p2", { stew: 1 });
  w.failKey = "cooking:owed:p2";
  assert.equal(settleOwed(store, "p2", "stew", 1), 0);
  w.failKey = "";
  assert.deepEqual(store.get("p2"), { stew: 1 });
});

test("a save that landed the value but failed afterwards still counts what left the store", () => {
  const { store } = setup();
  const flaky = {
    get: (/** @type {string} */ id) => store.get(id),
    update: (/** @type {string} */ id, /** @type {(c: any) => any} */ fn) => {
      store.update(id, fn);
      return false; // reported as failed, though the value was written
    },
  };
  assert.equal(settleOwed(flaky, "p1", "stew", 2), 2);
  assert.deepEqual(store.get("p1"), { stew: 1, pie: 1 });
});

// The join handover (applyOwed) takes everything owed, then saves a batch still in the pot as owed again for the
// pot's finish to settle. A save that fails after writing the value (the index write throws) still leaves it saved:
// counting it as not kept handed it over at the join and again when the pot finished.

/** What the join handover pays now and what the pot's finish pays later, for one cook still in the pot. */
function handover(w, store, failKey) {
  const mine = store.take("p1");
  w.failKey = failKey;
  const kept = keepInPot(store, "p1", mine, { id: "stew", n: 1 });
  w.failKey = "";
  const now = Math.max(0, Math.floor(Number(mine.stew) || 0));
  const later = settleOwed(store, "p1", "stew", 1);
  return { kept, now, later };
}

test("a dish still in the pot is not handed over at the join, and the finish pays it once", () => {
  const w = fakeWorld();
  const store = createOwedStore(/** @type {any} */ (w), { base: "cooking:owed", warn: () => {} });
  store.set("p1", { stew: 1 });
  assert.deepEqual(handover(w, store, ""), { kept: 1, now: 0, later: 1 });
  assert.equal(store.get("p1"), undefined, "nothing left owed");
});

test("an in-pot dish whose index write fails is still kept, not paid at the join and again at the finish", () => {
  const w = fakeWorld();
  const store = createOwedStore(/** @type {any} */ (w), { base: "cooking:owed", warn: () => {} });
  store.set("p1", { stew: 1 });
  const r = handover(w, store, "cooking:owed_idx");
  assert.equal(r.now + r.later, 1, `paid exactly once (${JSON.stringify(r)})`);
  assert.deepEqual(r, { kept: 1, now: 0, later: 1 });
});

test("an in-pot dish that cannot be saved again is handed over at the join, and only then", () => {
  const w = fakeWorld();
  const store = createOwedStore(/** @type {any} */ (w), { base: "cooking:owed", warn: () => {} });
  store.set("p1", { stew: 1 });
  assert.deepEqual(handover(w, store, "cooking:owed:p1"), { kept: 0, now: 1, later: 0 });
});

test("other dishes owed are still handed over at the join", () => {
  const w = fakeWorld();
  const store = createOwedStore(/** @type {any} */ (w), { base: "cooking:owed", warn: () => {} });
  store.set("p1", { stew: 2, pie: 1 });
  const mine = store.take("p1");
  assert.equal(keepInPot(store, "p1", mine, { id: "stew", n: 1 }), 1);
  assert.deepEqual(mine, { stew: 1, pie: 1 });
  assert.deepEqual(store.get("p1"), { stew: 1 });
});

test("oweMore counts a batch whose value landed though the save reported failure", () => {
  const w = fakeWorld();
  const store = createOwedStore(/** @type {any} */ (w), { base: "cooking:owed", warn: () => {} });
  w.failKey = "cooking:owed_idx";
  assert.equal(oweMore(store, "p1", "stew", 2), 2, "the value is saved, so both batches are owed (not due now)");
  w.failKey = "cooking:owed:p1";
  assert.equal(oweMore(store, "p1", "stew", 1), 0, "nothing landed, so the caller pays it now");
  w.failKey = "";
  assert.deepEqual(store.get("p1"), { stew: 2 });
});
