// O19 item safety: a stash whose carts were seen and are now gone. The structure (the items) is still saved, so the
// record must never be forgotten while it is: carts that went still holding their items (unloaded where nobody is,
// or taken away by a script, so nothing was dropped) come back from the structure; carts that were broken, emptied or
// killed (their items left them, a second copy would be a duplicate) never do, and then the structure is deleted
// before the record goes. Runs the production restoreStash, cartsOf and cart marks from gauntlet.js in a vm against
// a tick-by-tick fake of the game.
// Before the fix: GAUNTLET_SRC=<old gauntlet.js> node --test tools/expedition-carts-gone.test.mjs (fails: the record
// is cleared and "couldn't be found" sent while the structure still holds every item).
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
const optional = (name) => (source.match(new RegExp(`^function ${name}\\(`, "m")) ? fn(name) : "");
const marksSource = source.slice(source.indexOf("const CART_MARKS"), source.indexOf("/**\n * The carts holding a stored record"));
assert.ok(marksSource.includes("function watchPutDown"), "production cart marks");

const TAG = "realm:exp_stash_1";
const ID = "expedition:stash_1";
const SPOT = { x: 1, y: 64, z: 1, d: "minecraft:overworld" };

/** An item: a name is enough to count copies. */
const item = (name) => ({ typeId: `minecraft:${name}`, name });

/** A container of `size` slots. @param {number} size @param {Record<number, any>} [items] */
function container(size, items = {}) {
  const slots = new Array(size).fill(undefined);
  for (const [k, v] of Object.entries(items)) slots[Number(k)] = v;
  return {
    size,
    slots,
    get emptySlotsCount() {
      return slots.filter((x) => !x).length;
    },
    getItem: (k) => slots[k],
    setItem: (k, v) => {
      slots[k] = v;
    },
    addItem(v) {
      const k = slots.findIndex((x) => !x);
      if (k < 0) return v;
      slots[k] = v;
      return undefined;
    },
    clearAll: () => slots.fill(undefined),
  };
}

/** The game: ticks, one dimension, carts, the saved structure and world properties. */
function game() {
  const g = {
    tick: 0,
    /** @type {{ at: number, f: () => void }[]} */
    queue: [],
    props: new Map(),
    /** @type {any[]} */
    carts: [],
    puts: 0,
    structure: true,
    /** the stored items: cart part -> slot -> item */
    stored: { 0: { 0: item("sword"), 20: item("dirt") }, 1: { 4: item("helmet") } },
    /** @type {((ev: any) => void)[]} */
    removeSubs: [],
    /** @type {((ev: any) => void)[]} */
    dieSubs: [],
    /** item entities on the ground */
    ground: /** @type {any[]} */ ([]),
    messages: /** @type {string[]} */ ([]),
  };
  let nextId = 1;
  g.cart = (part) => {
    const box = container(27, { ...(g.stored[part] ?? {}) });
    const c = {
      id: String(nextId++),
      typeId: "minecraft:chest_minecart",
      isValid: true,
      getTags: () => ["realm:exp_stash", TAG, `realm:exp_stash_part_${part}`],
      getComponent: () => ({ container: box }),
      box,
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
    runCommand: (cmd) => {
      if (!cmd.startsWith("structure load") || !g.structure) return;
      g.at(1, () => {
        g.puts++;
        g.carts.push(g.cart(0), g.cart(1));
      });
    },
    spawnItem: (it) => g.ground.push(it),
  };
  g.at = (n, f) => g.queue.push({ at: g.tick + n, f });
  g.step = async () => {
    g.tick++;
    const due = g.queue.filter((q) => q.at <= g.tick);
    g.queue = g.queue.filter((q) => q.at > g.tick);
    for (const q of due) q.f();
    for (let k = 0; k < 5; k++) await Promise.resolve();
  };
  /** Broken by a player (or lava): its items fall out first, then it goes. */
  g.breakCart = (c) => {
    for (let k = 0; k < c.box.size; k++) if (c.box.getItem(k)) g.ground.push(c.box.getItem(k));
    c.box.clearAll();
    c.remove();
  };
  /** Unloaded where nobody is (or removed by a script): it goes holding its items, nothing is dropped. */
  g.unloadCart = (c) => c.remove();
  /** `kill`: the items are dropped, but the cart still holds them when it's removed; its death comes at the tick's end. */
  g.killCart = (c) => {
    for (let k = 0; k < c.box.size; k++) if (c.box.getItem(k)) g.ground.push(c.box.getItem(k));
    c.remove();
    g.at(0, () => {
      for (const f of g.dieSubs) f({ deadEntity: { id: c.id } });
    });
  };
  g.player = () => {
    const inv = container(36);
    const p = {
      name: "Owner",
      isValid: true,
      location: { x: SPOT.x + 0.5, y: SPOT.y, z: SPOT.z + 0.5 },
      dimension: g.dim,
      inv,
      getComponent: (c) => (c === "minecraft:inventory" ? { container: inv } : { getEquipment: () => undefined, setEquipment: () => true }),
      getDynamicProperty: (k) => g.props.get(`player:${k}`),
      setDynamicProperty: (k, v) => (v === undefined ? g.props.delete(`player:${k}`) : g.props.set(`player:${k}`, v)),
      sendMessage: (m) => g.messages.push(m),
    };
    return p;
  };
  g.scripts = () => {
    g.removeSubs = [];
    g.dieSubs = [];
    const context = {
      console: { warn() {} },
      EquipmentSlot: { Head: "Head", Chest: "Chest", Legs: "Legs", Feet: "Feet", Offhand: "Offhand" },
      world: {
        getDimension: () => g.dim,
        structureManager: {
          get: () => (g.structure ? {} : undefined),
          delete: () => {
            if (g.stuck) return false;
            g.structure = false;
            return true;
          },
        },
        getDynamicProperty: (k) => g.props.get(k),
        setDynamicProperty: (k, v) => (v === undefined ? g.props.delete(k) : g.props.set(k, v)),
        beforeEvents: { entityRemove: { subscribe: (f) => (g.removeSubs.push(f), f), unsubscribe: () => {} } },
        afterEvents: { entityDie: { subscribe: (f) => (g.dieSubs.push(f), f), unsubscribe: () => {} } },
      },
      system: { run: (f) => g.at(1, f), runTimeout: (f, n) => g.at(n, f) },
    };
    vm.createContext(context);
    vm.runInContext(
      [
        `const DIMS = ["minecraft:overworld"];`,
        `let saving = true;`,
        `const STASH_PROP = "expedition:stash";`,
        `const STASH_TAG = "realm:exp_stash";`,
        `const CART = 27;`,
        `const EQUIP = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];`,
        `const wait = (ticks) => new Promise((res) => system.runTimeout(() => res(undefined), ticks));`,
        `const stripRunGear = () => 0;`,
        marksSource,
        optional("forgetStructure"),
        fn("stashOf"),
        fn("carried"),
        fn("loadedAt"),
        fn("placeCarts"),
        fn("removeCart"),
        fn("cartsOf", true),
        fn("restoreStash", true),
        `globalThis.restoreStash = restoreStash;`,
      ].join("\n"),
      context,
    );
    return context;
  };
  return g;
}

/** The world as it is a while after a hand-back put the carts down and saw them, before it took them. */
async function seenAndWaiting() {
  const g = game();
  const ctx = g.scripts();
  g.props.set("player:expedition:stash", JSON.stringify({ id: ID, tag: TAG, placed: true, seen: true, at: SPOT }));
  g.props.set("expedition:cart_marks", JSON.stringify({ [TAG]: 1 }));
  g.carts.push(g.cart(0), g.cart(1));
  g.puts = 1;
  return { g, ctx };
}

/** The owner comes back (as homecoming does: every 35 ticks until it's done). */
async function comeBack(g, ctx, player = g.player()) {
  for (let tries = 0; tries < 6; tries++) {
    let out = "pending";
    ctx.restoreStash(player).then((v) => (out = v));
    for (let t = 0; t < 200 && out === "pending"; t++) await g.step();
    if (out === true) return player;
    for (let t = 0; t < 35; t++) await g.step();
  }
  return player;
}

/** Every copy of each stored item: the player's inventory, the ground, any cart left. */
function copies(g, player) {
  /** @type {Record<string, number>} */
  const n = { sword: 0, dirt: 0, helmet: 0 };
  const add = (it) => it && (n[it.name] = (n[it.name] ?? 0) + 1);
  player.inv.slots.forEach(add);
  g.ground.forEach(add);
  for (const c of g.carts) c.box.slots.forEach(add);
  return n;
}

const stashRecord = (g) => g.props.get("player:expedition:stash");

test("seen carts that went still holding their items (unloaded, nothing dropped) come back from the structure", async () => {
  const { g, ctx } = await seenAndWaiting();
  for (const c of [...g.carts]) g.unloadCart(c);
  await g.step();
  const p = await comeBack(g, ctx);
  assert.deepEqual(copies(g, p), { sword: 1, dirt: 1, helmet: 1 }, "every item once, with the player");
  assert.equal(p.inv.getItem(0)?.name, "sword", "into the slot it came from");
  assert.equal(g.puts, 2, "the structure was put down again once");
  assert.equal(stashRecord(g), undefined, "the record is finished");
  assert.equal(g.structure, false, "and the structure deleted");
  assert.ok(!g.messages.some((m) => /couldn't be found/.test(m)), `never told the items are gone (${g.messages.join(" | ")})`);
});

test("the record is never forgotten while the structure still holds the items", async () => {
  const { g, ctx } = await seenAndWaiting();
  for (const c of [...g.carts]) g.unloadCart(c);
  await g.step();
  let out = "pending";
  const p = g.player();
  ctx.restoreStash(p).then((v) => (out = v));
  for (let t = 0; t < 200 && out === "pending"; t++) {
    await g.step();
    if (g.structure) assert.ok(stashRecord(g), `tick ${t}: the record is there while the structure is saved`);
  }
  assert.equal(out, true);
});

test("seen carts that were broken (their items dropped) are never put down again; the structure goes before the record", async () => {
  const { g, ctx } = await seenAndWaiting();
  for (const c of [...g.carts]) g.breakCart(c);
  await g.step();
  const p = await comeBack(g, ctx);
  assert.deepEqual(copies(g, p), { sword: 1, dirt: 1, helmet: 1 }, "every item once (on the ground)");
  assert.equal(g.puts, 1, "never put down again");
  assert.equal(stashRecord(g), undefined);
  assert.equal(g.structure, false, "no copy left in a structure either");
});

test("a killed cart (dropped its items, still full when removed) counts as broken", async () => {
  const { g, ctx } = await seenAndWaiting();
  for (const c of [...g.carts]) g.killCart(c);
  await g.step();
  await g.step();
  const p = await comeBack(g, ctx);
  assert.deepEqual(copies(g, p), { sword: 1, dirt: 1, helmet: 1 });
  assert.equal(g.puts, 1);
});

test("one cart broken, the other unloaded: only the unloaded part comes back, the broken part's copy is taken away", async () => {
  const { g, ctx } = await seenAndWaiting();
  const [a, b] = g.carts;
  g.unloadCart(a); // part 0: sword and dirt, still inside
  g.breakCart(b); // part 1: the helmet falls out
  await g.step();
  const p = await comeBack(g, ctx);
  assert.deepEqual(copies(g, p), { sword: 1, dirt: 1, helmet: 1 });
  assert.equal(p.inv.getItem(0)?.name, "sword");
  assert.equal(g.puts, 2);
  assert.equal(g.carts.length, 0, "no cart left");
  assert.equal(stashRecord(g), undefined);
});

test("the owner leaves between the second put-down and the hand-over, the carts unload again: still one copy", async () => {
  const { g, ctx } = await seenAndWaiting();
  const [a, b] = g.carts;
  g.unloadCart(a);
  g.breakCart(b);
  await g.step();
  const p = g.player();
  ctx.restoreStash(p);
  for (let t = 0; t < 3 && g.puts < 2; t++) await g.step(); // put down again...
  p.isValid = false; // ...and the owner is gone before it takes them
  for (let t = 0; t < 30; t++) await g.step();
  for (const c of [...g.carts]) g.unloadCart(c); // nobody near: they unload, the helmet's copy too
  await g.step();
  const back = await comeBack(g, ctx);
  assert.deepEqual(copies(g, back), { sword: 1, dirt: 1, helmet: 1 }, "the broken part never comes back, however often it's put down");
  assert.equal(stashRecord(g), undefined);
});

test("a structure that can't be deleted keeps the record (tried again)", async () => {
  const { g, ctx } = await seenAndWaiting();
  for (const c of [...g.carts]) g.breakCart(c);
  await g.step();
  g.stuck = true;
  let out = "pending";
  ctx.restoreStash(g.player()).then((v) => (out = v));
  for (let t = 0; t < 200 && out === "pending"; t++) await g.step();
  assert.equal(out, false, "tried again later");
  assert.ok(stashRecord(g), "the record waits");
});
