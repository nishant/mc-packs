// MCP-080: parcels nobody collects in 30 days are swept (and old ones without a time stamp start their 30 days at the
// first sweep). Runs the production splitParcels from gauntlet.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../packs/expedition_bp/scripts/gauntlet.js", import.meta.url), "utf8");
const days = source.match(/^const PARCEL_DAYS = (\d+);/m);
const fn = source.match(/^function splitParcels\([\s\S]*?^\}/m);
assert.ok(days && fn, "production splitParcels");
const ctx = vm.createContext({});
vm.runInContext(`${days[0]}\n${fn[0]}\nthis.splitParcels = splitParcels;`, ctx);
const split = (/** @type {any[]} */ l, /** @type {number} */ n) => JSON.parse(JSON.stringify(ctx.splitParcels(l, n)));

const DAY = 86400000;
const NOW = 1_800_000_000_000;

test("a parcel older than 30 days goes; a newer one stays", () => {
  const r = split([{ id: "a", tag: "ta", k: "dropped", t: NOW - 31 * DAY }, { id: "b", tag: "tb", k: "spoils", t: NOW - 29 * DAY }], NOW);
  assert.deepEqual(r.gone.map((p) => p.id), ["a"]);
  assert.deepEqual(r.keep.map((p) => p.id), ["b"]);
  assert.equal(r.stamped, false);
});

test("a parcel from before time stamps is stamped and kept, not deleted", () => {
  const r = split([{ id: "old", tag: "t", k: "dropped" }], NOW);
  assert.equal(r.gone.length, 0);
  assert.equal(r.keep[0].t, NOW);
  assert.equal(r.stamped, true);
});

test("an empty list stays empty", () => {
  assert.deepEqual(split([], NOW), { keep: [], gone: [], stamped: false });
});
