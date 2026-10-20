// O19: the stash cart window. Between putting a stash's (or parcel's) structure down and the hand-over finding its
// carts there are a few ticks in which the record says "put down, never seen". A disconnect, a broken cart or a
// restart inside them must never put the structure down a second time once its carts were in the world: that hands
// every item out twice (the broken carts drop theirs). This runs the production cartsOf and the cart marks from
// gauntlet.js in a vm against a small tick-by-tick fake of the game, cutting in at every tick of the window.
// Before the fix: GAUNTLET_SRC=<old gauntlet.js> node --test tools/expedition-carts-window.test.mjs (fails).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(process.env.GAUNTLET_SRC ?? new URL("../packs/expedition_bp/scripts/gauntlet.js", import.meta.url), "utf8");

function fn(name, isAsync = false) {
  const m = source.match(new RegExp(`^(?:export )?${isAsync ? "async " : ""}function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `production ${name}`);
  return m[0].replace(/^export /, "");
}
const from = source.indexOf("const CART_MARKS");
const marksSource = from < 0 ? "" : source.slice(from, source.indexOf("/**\n * The carts holding a stored record"));

/** The game: ticks, one dimension, carts, the saved world (dynamic properties and entities survive a restart). */
function game({ delay }) {
  const g = {
    tick: 0,
    /** @type {{ at: number, f: () => void }[]} */
    queue: [],
    props: new Map(),
    /** @type {any[]} */
    carts: [],
    puts: 0, // structure loads that really put carts down
    dropped: 0, // carts broken: their items are on the ground
    /** @type {((ev: any) => void)[]} */
    removeSubs: [],
  };
  const cart = (tag) => {
    const c = {
      typeId: "minecraft:chest_minecart",
      isValid: true,
      getTags: () => ["realm:exp_stash", tag],
      getComponent: () => ({ container: { clearAll() {} } }),
      remove() {
        for (const f of [...g.removeSubs]) f({ removedEntity: c });
        c.isValid = false;
        g.carts = g.carts.filter((x) => x !== c);
      },
    };
    return c;
  };
  g.dim = {
    id: "minecraft:overworld",
    getBlock: () => ({}),
    getEntities: ({ tags }) => g.carts.filter((c) => c.getTags().includes(tags[0])),
    runCommand: () => {
      const tag = "realm:exp_stash_1";
      g.at(delay, () => {
        g.puts++;
        g.carts.push(cart(tag), cart(tag));
      });
    },
  };
  g.at = (n, f) => g.queue.push({ at: g.tick + n, f });
  g.step = async () => {
    g.tick++;
    const due = g.queue.filter((q) => q.at <= g.tick);
    g.queue = g.queue.filter((q) => q.at > g.tick);
    for (const q of due) q.f();
    for (let k = 0; k < 5; k++) await Promise.resolve(); // promise continuations run in the tick
  };
  g.breakAll = () => {
    for (const c of [...g.carts]) {
      g.dropped++;
      c.remove();
    }
  };
  /** A script context (a fresh one after a restart: nothing in memory survives). */
  g.scripts = () => {
    g.removeSubs = [];
    g.queue = g.queue.filter((q) => q.world); // script timeouts die with the server
    const context = {
      console: { warn() {} },
      world: {
        getDimension: () => g.dim,
        structureManager: { get: () => ({}) },
        getDynamicProperty: (k) => g.props.get(k),
        setDynamicProperty: (k, v) => (v === undefined ? g.props.delete(k) : g.props.set(k, v)),
        beforeEvents: {
          entityRemove: {
            subscribe: (f) => (g.removeSubs.push(f), f),
            unsubscribe: (f) => (g.removeSubs = g.removeSubs.filter((x) => x !== f)),
          },
        },
      },
      system: { run: (f) => g.at(1, f), runTimeout: (f, n) => g.at(n, f) },
      removeCart: (c) => c.remove(),
    };
    vm.createContext(context);
    vm.runInContext(
      `const DIMS = ["minecraft:overworld"];\nlet saving = true;\nconst wait = (ticks) => new Promise((res) => system.runTimeout(() => res(undefined), ticks));\n${marksSource}\n${fn("loadedAt")}\n${fn("placeCarts")}\n${fn("cartsOf", true)}\n${fn("dropStrayCart")}\nglobalThis.cartsOf = cartsOf;\nglobalThis.dropStrayCart = dropStrayCart;`,
      context,
    );
    return context;
  };
  return g;
}

/** The record on the player, saved like restoreStash saves it. */
const record = (g) => JSON.parse(g.props.get("player:stash") ?? JSON.stringify({ id: "expedition:stash_1", tag: "realm:exp_stash_1" }));
const saver = (g) => (r) => g.props.set("player:stash", JSON.stringify(r));

/** Runs a hand-over to its end, ticking the game. */
async function handOver(g, ctx, player) {
  let out = "pending";
  ctx.cartsOf(player, record(g), saver(g), 2).then((v) => (out = v));
  for (let t = 0; t < 200 && out === "pending"; t++) await g.step();
  return out;
}

/** After the cut: the owner comes back (an online player at the same spot) until the hand-over settles. */
async function comeBack(g, ctx) {
  const player = { isValid: true, location: { x: 1, y: 64, z: 1 }, dimension: g.dim };
  for (let tries = 0; tries < 5; tries++) {
    const got = await handOver(g, ctx, player);
    if (got !== undefined) return got;
  }
  return undefined;
}

for (const delay of [0, 1, 2]) {
  for (let k = 0; k <= 5; k++) {
    test(`carts appear ${delay} ticks after the put-down; the owner leaves at tick ${k}, then the carts are broken`, async () => {
      const g = game({ delay });
      const ctx = g.scripts();
      const player = { isValid: true, location: { x: 1, y: 64, z: 1 }, dimension: g.dim };
      ctx.cartsOf(player, record(g), saver(g), 2);
      for (let t = 0; t < k; t++) await g.step();
      player.isValid = false;
      for (let t = 0; t < 3; t++) await g.step();
      g.breakAll(); // someone else nearby breaks them while the owner is away
      for (let t = 0; t < 60; t++) await g.step();
      await comeBack(g, ctx);
      assert.equal(g.puts, 1, `the structure put carts down ${g.puts} times (dropped ${g.dropped} carts' items)`);
    });

    test(`carts appear ${delay} ticks after the put-down; they are broken at tick ${k} while the owner stays`, async () => {
      const g = game({ delay });
      const ctx = g.scripts();
      const player = { isValid: true, location: { x: 1, y: 64, z: 1 }, dimension: g.dim };
      /** @type {any} */
      let first = "pending";
      let valid = true;
      ctx.cartsOf(player, record(g), saver(g), 2).then((v) => {
        first = v;
        valid = !Array.isArray(v) || v.every((c) => c.isValid); // the caller empties them right away, in this tick
      });
      for (let t = 0; t < k; t++) await g.step();
      const broke = first === "pending" && g.carts.length > 0; // broken before the hand-over had them
      g.breakAll();
      for (let t = 0; t < 200 && first === "pending"; t++) await g.step();
      assert.ok(valid, "never hands back a cart that is gone");
      const later = first === undefined ? await comeBack(g, ctx) : first;
      assert.equal(g.puts, 1, `put down ${g.puts} times`);
      if (broke) assert.ok(later === null || (Array.isArray(later) && later.length === 0), "broken carts: reported missing, never put down again");
    });

    test(`carts appear ${delay} ticks after the put-down; the server restarts at tick ${k}, the carts load and are broken`, async () => {
      const g = game({ delay });
      let ctx = g.scripts();
      const player = { isValid: true, location: { x: 1, y: 64, z: 1 }, dimension: g.dim };
      ctx.cartsOf(player, record(g), saver(g), 2);
      for (let t = 0; t < k; t++) await g.step();
      // Restart: carts already in the world are saved with it; a structure load still pending and every script
      // timer are not (carts not there yet never appear), and nothing in memory survives.
      g.queue = [];
      ctx = g.scripts();
      await g.step();
      for (const c of g.carts) ctx.dropStrayCart(c); // main.js's entityLoad: someone else is near, the chunk loads
      await g.step();
      g.breakAll(); // and breaks them before the owner is back
      await g.step();
      const got = await comeBack(g, ctx);
      assert.equal(g.puts, 1, `put down ${g.puts} times (dropped ${g.dropped} carts' items)`);
      if (g.dropped) assert.equal(got, null);
    });

    test(`carts appear ${delay} ticks after the put-down; the server restarts at tick ${k}, the owner comes back`, async () => {
      const g = game({ delay });
      let ctx = g.scripts();
      const player = { isValid: true, location: { x: 1, y: 64, z: 1 }, dimension: g.dim };
      ctx.cartsOf(player, record(g), saver(g), 2);
      for (let t = 0; t < k; t++) await g.step();
      g.queue = [];
      ctx = g.scripts();
      const had = g.carts.length;
      const got = await comeBack(g, ctx);
      assert.equal(g.puts, 1, `put down ${g.puts} times`);
      assert.equal(got?.length, 2, had ? "the carts that survived the restart are used" : "never appeared: put down once now");
    });
  }
}

test("a cart of a waiting hand-over that loads after a restart is remembered as seen, then breaking it can't copy", async () => {
  if (!marksSource) assert.fail("no world-side cart marks in this gauntlet.js");
  const g = game({ delay: 1 });
  let ctx = g.scripts();
  const player = { isValid: true, location: { x: 1, y: 64, z: 1 }, dimension: g.dim };
  ctx.cartsOf(player, record(g), saver(g), 2);
  player.isValid = false; // gone in the same tick as the put-down
  await g.step(); // the carts appear
  g.queue = [];
  // Restart before the watcher saw anything that it saved: forget the in-memory marks, keep the saved ones.
  ctx = g.scripts();
  for (const c of g.carts) ctx.dropStrayCart(c); // main.js's entityLoad
  await g.step();
  g.breakAll();
  await g.step();
  assert.equal(await comeBack(g, ctx), null);
  assert.equal(g.puts, 1);
});
