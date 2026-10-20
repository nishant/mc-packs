// F12: cooking_bp's settle must return a dish as due only when it really left the owed store. A failed save keeps
// the debt saved, so returning it as due too paid it twice (now and on the next join).
import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const { createOwedStore } = await import(pathToFileURL(join(root, "tools", "owed-shared.js")).href);
const settlePath = process.env.COOKING_SETTLE_MODULE ?? join(root, "packs", "cooking_bp", "scripts", "settle.js");
const { settleOwed } = await import(pathToFileURL(settlePath).href);

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
