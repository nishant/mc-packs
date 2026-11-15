import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./zones-shared.js", import.meta.url), "utf8");
const body = source.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");

function load() {
  const sent = [];
  const handlers = [];
  const runs = [];
  const loads = [];
  const context = {
    console,
    system: { currentTick: 0, sendScriptEvent: (id, message) => sent.push({ id, message }), run: (fn) => runs.push(fn), runTimeout: (fn) => runs.push(fn) },
    world: { afterEvents: { worldLoad: { subscribe: (fn) => loads.push(fn) } } },
    onScriptEvent: (ids, fn) => handlers.push({ ids, fn }),
  };
  runInNewContext(`${body}\nglobalThis.api = { zoneMessages, provideZones, receiveZones, allZones };`, context);
  const flush = () => {
    while (runs.length) runs.shift()();
  };
  return { api: context.api, sent, handlers, flush };
}

/** The old packing: the whole envelope stringified again for every zone. */
function oldMessages(src, list) {
  const utf8Length = (s) => Buffer.byteLength(s, "utf8");
  const round1 = (n) => Math.round(n * 10) / 10;
  const envelope = (zones, part, parts) => JSON.stringify({ src, part, parts, zones });
  const parts = [[]];
  for (const z of list) {
    const zone = { id: z.id, name: z.name, dim: z.dim, x: round1(z.x), z: round1(z.z), r: round1(z.r), shape: z.shape === "square" ? "square" : undefined };
    const last = parts.at(-1);
    if (last.length && utf8Length(envelope([...last, zone], 999, 999)) > 2000) parts.push([zone]);
    else last.push(zone);
  }
  return parts.map((zones, i) => envelope(zones, i + 1, parts.length));
}

const zones = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Claim ${i} ${"é".repeat(i % 4)}`, dim: i % 3 ? "minecraft:overworld" : "minecraft:nether", x: i * 13.25, z: -i * 7.55, r: 8 + (i % 9), shape: i % 2 ? "square" : "circle" }));

test("zone messages are byte-identical to the old whole-envelope packing, up to 500 zones", () => {
  const { api } = load();
  for (const n of [0, 1, 7, 60, 500]) {
    const got = [...api.zoneMessages("claims", zones(n))];
    assert.deepEqual(got, oldMessages("claims", zones(n)), `${n} zones`);
    assert.ok(got.every((m) => Buffer.byteLength(m) <= 2000));
  }
});

test("a provider sends an unchanged list again only when asked", () => {
  const { api, sent, handlers, flush } = load();
  let list = zones(3);
  const publish = api.provideZones("claims", () => list);
  const ping = () => handlers.filter((h) => h.ids === "realm:zones_ping").forEach((h) => h.fn({ id: "realm:zones_ping" }));
  publish();
  flush();
  assert.equal(sent.length, 1, "the first list goes out");
  publish();
  flush();
  assert.equal(sent.length, 1, "the same list again: nothing sent");
  ping();
  flush();
  assert.equal(sent.length, 2, "a ping is always answered");
  list = zones(4);
  publish();
  flush();
  assert.equal(sent.length, 3, "a changed list goes out");
});

test("allZones is rebuilt when a list arrives", () => {
  const { api } = load();
  api.receiveZones({ src: "zones", part: 1, parts: 1, zones: [{ id: "a", dim: "overworld", x: 0, z: 0, r: 5 }] });
  const first = api.allZones();
  assert.equal(first.length, 1);
  assert.equal(api.allZones(), first, "cached between changes");
  api.receiveZones({ src: "town", part: 1, parts: 1, zones: [{ id: "b", dim: "overworld", x: 50, z: 0, r: 5 }] });
  assert.equal(api.allZones().length, 2);
});
