import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(`../packs/saga_bp/scripts/${p}`, import.meta.url), "utf8");
const data = read("data.js");
const places = read("places.js");
const body = (src, from) => {
  const a = src.indexOf(from);
  assert.ok(a >= 0, `has ${from}`);
  return src.slice(a, src.indexOf("\n}\n", a));
};

test("flush() keeps a player dirty until the write succeeds, and warns once", () => {
  const f = body(data, "export function flush(id)");
  assert.ok(f.indexOf("player.setDynamicProperty(PROP_PLAYER, json);") < f.indexOf("dirty.delete(id);\n    tooBig"), "deleted after the write");
  assert.match(f, /tooBig\.has\(id\)/);
  assert.match(body(data, "export function forget(id)"), /tooBig\.delete\(id\)/);
});

test("sagaOf() backs up an unreadable save to saga:p_bak without overwriting an older backup", () => {
  assert.match(data, /export const PROP_PLAYER_BAK = "saga:p_bak"/);
  const f = body(data, "export function sagaOf(player)");
  assert.match(f, /getDynamicProperty\(PROP_PLAYER_BAK\) === undefined/);
  assert.match(f, /typeof raw === "string" && raw\.length > 0\) bad = true/);
});

test("setPlace() never overwrites an unreadable saga:places", () => {
  const f = body(places, "export function setPlace(name, rec)");
  assert.ok(f.indexOf("placesBroken") < f.indexOf("world.setDynamicProperty(PROP_PLACES"));
  assert.match(f, /saga:places_bak/);
});

test("restore() reports unfinished tiles into saga:restore, retried by autoTick", () => {
  assert.match(body(places, "function restore(name, rec)"), /addPending\(pending\)/);
  assert.match(body(places, "export function autoTick()"), /retryRestores\(\)/);
  assert.match(body(places, "export function retryRestores()"), /queued === 1/);
});

test("restore() removes the entities a build spawned, for Remove, relocate and camps alike", () => {
  const f = body(places, "function restore(name, rec)");
  assert.match(f, /clearEntities\(pfOf\(name\), dim,/);
  assert.ok(f.indexOf("clearEntities(") < f.indexOf("sm.place("), "cleared before the terrain goes back");
  assert.ok(!/restore\((old|rec)\)/.test(places), "every caller passes the place name");
  for (const from of ["export function removePlace(name)", "export function setHere(player, name)"]) assert.match(body(places, from), /restore\(name, /);
});
