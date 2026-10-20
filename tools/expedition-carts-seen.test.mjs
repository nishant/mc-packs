// O19: carts that were found once are remembered (`seen`); a seen record whose carts are gone is never placed
// again, which would hand the same items out twice. A record never seen is still placed again. cartsOf runs from
// the production source in a vm.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../packs/expedition_bp/scripts/gauntlet.js", import.meta.url), "utf8");

function fn(name, isAsync = false) {
  const m = source.match(new RegExp(`^(?:export )?${isAsync ? "async " : ""}function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `production ${name}`);
  return m[0].replace(/^export /, "");
}

// The world-side cart marks (O19) cartsOf reads and writes, from the same source.
const marksSource = source.slice(source.indexOf("const CART_MARKS"), source.indexOf("/**\n * The carts holding a stored record"));
assert.ok(marksSource.includes("function watchPutDown"), "production cart marks");

function run({ rec, carts, other = [] }) {
  const placed = [];
  const saved = [];
  const dim = {
    id: "minecraft:overworld",
    getBlock: () => ({}),
    getEntities: () => carts.slice(),
    runCommand: (c) => placed.push(c),
  };
  const nether = { id: "minecraft:nether", getBlock: () => ({}), getEntities: () => other.slice(), runCommand: (c) => placed.push(c) };
  const player = { isValid: true, location: { x: 1, y: 64, z: 1 }, dimension: dim };
  const props = new Map();
  const context = {
    console,
    world: {
      getDimension: (d) => (d === "minecraft:nether" ? nether : dim),
      structureManager: { get: () => ({}) },
      getDynamicProperty: (k) => props.get(k),
      setDynamicProperty: (k, v) => (v === undefined ? props.delete(k) : props.set(k, v)),
      beforeEvents: { entityRemove: { subscribe: (f) => f, unsubscribe: () => {} } },
    },
    system: { run: (f) => f(), runTimeout: () => {} },
    saving: true,
    wait: async () => {},
    removeCart: () => {},
  };
  vm.createContext(context);
  vm.runInContext(`const DIMS = ["minecraft:overworld", "minecraft:nether"];\nlet saving = true;\n${marksSource}\n${fn("loadedAt")}\n${fn("placeCarts")}\n${fn("cartsOf", true)}\nglobalThis.cartsOf = cartsOf;`, context);
  return { placed, saved, call: () => context.cartsOf(player, rec, (r) => saved.push(r), 2) };
}

const base = { id: "expedition:stash_1", tag: "realm:exp_stash_1", placed: true, at: { x: 1, y: 64, z: 1, d: "minecraft:overworld" } };
const cart = { typeId: "minecraft:chest_minecart" };

test("found carts are saved as seen", async () => {
  const r = run({ rec: base, carts: [cart, cart] });
  assert.equal((await r.call()).length, 2);
  assert.equal(r.saved.at(-1).seen, true);
  assert.equal(r.placed.length, 0);
});

test("a seen record whose carts are gone is never placed again", async () => {
  const r = run({ rec: { ...base, seen: true }, carts: [] });
  assert.equal(await r.call(), null);
  assert.deepEqual(r.placed, []);
});

test("a record whose carts never appeared is still placed again, then saved as seen", async () => {
  const r = run({ rec: base, carts: [] });
  await r.call();
  assert.equal(r.placed.length, 1);
});

test("one of two carts found where they were put down is used and nothing is placed over it", async () => {
  const r = run({ rec: base, carts: [cart] });
  assert.equal((await r.call()).length, 1);
  assert.deepEqual(r.placed, []);
  assert.equal(r.saved.at(-1).seen, true);
});

test("one survivor of two in another dimension is used, never placed over (that would duplicate items)", async () => {
  const r = run({ rec: base, carts: [], other: [cart] });
  assert.equal((await r.call()).length, 1);
  assert.deepEqual(r.placed, []);
  assert.equal(r.saved.at(-1).seen, true);
});

test("a seen record with only a survivor in another dimension still returns it, and with none returns null", async () => {
  assert.equal((await run({ rec: { ...base, seen: true }, carts: [], other: [cart] }).call()).length, 1);
  assert.equal(await run({ rec: { ...base, seen: true }, carts: [], other: [] }).call(), null);
});