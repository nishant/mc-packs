// The orphan clock of a maps:undo record counts from when its owner was last online, not from when it was made.
import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mockUrl = pathToFileURL(path.resolve("tools/maps-orphan-seen.mock.mjs")).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@minecraft/server") return { url: mockUrl, shortCircuit: true };
    return next(specifier, context);
  },
});
const { world } = await import("./maps-orphan-seen.mock.mjs");
const { sweep, record } = await import("../packs/maps_bp/scripts/cleanup.js");

const DAY = 24 * 3600000;
const realNow = Date.now;
const at = (t) => { Date.now = () => t; };
const rec = (id) => JSON.parse(world.getDynamicProperty(`maps:undo:${id}`));
const make = (t) => { at(t); return record({ dim: "minecraft:overworld", owner: "o", hunt: "h", what: "mark" }, [{ x: 0, y: 64, z: 0, placed: "minecraft:stone", orig: { t: "minecraft:air" } }]); };
const T0 = 1.8e12;

test("a record made 61 days ago whose owner was online yesterday is kept while the owner is offline", () => {
  try {
    const id = make(T0);
    at(T0 + 60 * DAY); sweep(() => [id]); // owner online at day 60
    assert.ok(rec(id).seen);
    at(T0 + 61 * DAY); sweep(() => undefined); // offline at day 61
    assert.equal(rec(id).due, 0);
  } finally { Date.now = realNow; }
});

test("a record whose owner was last seen 61 days ago is released", () => {
  try {
    const id = make(T0);
    at(T0 + DAY); sweep(() => [id]);
    at(T0 + 62 * DAY + 1000); sweep(() => undefined);
    assert.ok(rec(id).due > 0);
  } finally { Date.now = realNow; }
});

test("seen is saved at most once a day", () => {
  try {
    const id = make(T0);
    at(T0 + DAY * 2); sweep(() => [id]);
    const first = rec(id).seen;
    at(T0 + DAY * 2 + 5000); sweep(() => [id]);
    assert.equal(rec(id).seen, first);
  } finally { Date.now = realNow; }
});
