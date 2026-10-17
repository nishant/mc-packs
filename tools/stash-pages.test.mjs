// Tests for Expansive Inventory (packs/stash_bp/scripts/pages.js) against a small in-memory model of the
// parts of @minecraft/server it uses. The model is faithful where the bugs lived: dynamic properties throw on
// stackable items, and a component or tag read can throw.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataUrl = (/** @type {string} */ code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const mc = {
  tick: 0,
  pages: 5,
  /** @type {Array<() => void>} */
  queue: [],
  /** @type {Array<() => void>} */
  intervals: [],
  /** @type {Record<string, Array<(e: any) => void>>} */
  after: {},
  /** @type {any[]} */
  players: [],
  /** @type {Set<string>} item types whose tag and potion-component reads throw */
  throwing: new Set(),
  /** @type {any[]} */
  spawned: [],
  entities: [],
  structures: new Map(),
  worldProps: new Map(),
  failSave: false,
  failLoad: false,
  metadataThrow: new Set(),
  loads: 0,
};
globalThis.__mc = mc;

const UNSTACKABLE = /pickaxe|helmet|shulker_box|potion|bundle/;

class ItemStack {
  constructor(typeId, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
    this.nameTag = undefined;
    this.keepOnDeath = false;
    this.lockMode = "none";
    this.lore = [];
    this.place = [];
    this.destroy = [];
    this.damage = 0;
    this.enchants = [];
    this.color = undefined;
    this.props = new Map();
    this.contents = undefined;
  }
  get maxAmount() {
    return UNSTACKABLE.test(this.typeId) ? 1 : 64;
  }
  clone() {
    const c = new ItemStack(this.typeId, this.amount);
    for (const k of ["nameTag", "keepOnDeath", "lockMode", "damage", "color", "contents"]) c[k] = this[k];
    c.lore = [...this.lore];
    c.place = [...this.place];
    c.destroy = [...this.destroy];
    c.enchants = this.enchants.map((e) => ({ ...e }));
    c.props = new Map(this.props);
    return c;
  }
  isStackableWith(o) {
    return this.maxAmount > 1 && o.typeId === this.typeId && o.nameTag === this.nameTag &&
      JSON.stringify([o.lore, o.props, o.contents]) === JSON.stringify([this.lore, this.props, this.contents]);
  }
  getLore() {
    return [...this.lore];
  }
  setLore(l) {
    this.lore = [...l];
  }
  getCanPlaceOn() {
    return [...this.place];
  }
  setCanPlaceOn(l) {
    this.place = [...l];
  }
  getCanDestroy() {
    return [...this.destroy];
  }
  setCanDestroy(l) {
    this.destroy = [...l];
  }
  hasTag() {
    if (mc.throwing.has(this.typeId)) throw new Error("tags unavailable");
    return false;
  }
  getDynamicPropertyIds() {
    if (this.maxAmount > 1) throw new Error("dynamic properties need an unstackable item");
    return [...this.props.keys()];
  }
  getDynamicProperty(k) {
    if (this.maxAmount > 1) throw new Error("dynamic properties need an unstackable item");
    return this.props.get(k);
  }
  setDynamicProperty(k, v) {
    if (this.maxAmount > 1) throw new Error("dynamic properties need an unstackable item");
    this.props.set(k, v);
  }
  getComponent(name) {
    if (mc.metadataThrow.has(this.typeId)) throw new Error("injected metadata read failure");
    const self = this;
    if (name === "minecraft:potion") {
      if (mc.throwing.has(this.typeId)) throw new Error("components unavailable");
      return /potion/.test(this.typeId) ? {} : undefined;
    }
    if (name === "minecraft:durability" && /pickaxe|helmet/.test(this.typeId)) {
      return { get damage() { return self.damage; }, set damage(v) { self.damage = v; } };
    }
    if (name === "minecraft:enchantable" && /pickaxe|helmet|enchanted_book/.test(this.typeId)) {
      return {
        getEnchantments: () => self.enchants.map((e) => ({ type: { id: e.id }, level: e.level })),
        addEnchantments: (list) => list.forEach((e) => self.enchants.push({ id: e.type.id, level: e.level })),
      };
    }
    if (name === "minecraft:dyeable" && /leather_/.test(this.typeId)) {
      return { get color() { return self.color; }, set color(v) { self.color = v; } };
    }
    return undefined;
  }
}

class EnchantmentType {
  constructor(id) {
    this.id = id;
  }
}

class Container {
  constructor() {
    this.slots = new Array(36).fill(undefined);
  }

  get size() {
    return 36;
  }
  getItem(s) {
    return this.slots[s];
  }
  setItem(s, item) {
    this.slots[s] = item;
  }
  getSlot(s) {
    const slots = this.slots;
    return { get amount() { return slots[s].amount; }, set amount(v) { slots[s].amount = v; } };
  }
}

function storageEntity(dimension, location, typeId = "realm:stash_page_store") {
  const container = new Container();
  const entity = {
    id: `storage-${nextId++}`,
    typeId,
    dimension,
    location,
    getComponent: () => ({ container }),
    remove() { mc.entities = mc.entities.filter((e) => e !== entity); },
  };
  mc.entities.push(entity);
  return entity;
}

let nextId = 1;
function makePlayer() {
  const container = new Container();
  const props = new Map();
  const cursor = {
    item: undefined,
    clear() {
      this.item = undefined;
    },
  };
  const player = {
    id: `p${nextId++}`,
    typeId: "minecraft:player",
    isValid: true,
    commandPermissionLevel: 0,
    location: { x: 1, y: 64, z: 1 },
    container,
    cursor,
    bar: [],
    onScreenDisplay: { setActionBar: (t) => player.bar.push(t) },
    playSound() {},
    sendMessage() {},
    getDynamicProperty: (k) => props.get(k),
    setDynamicProperty(k, v) {
      if (v === undefined) props.delete(k);
      else props.set(k, v);
    },
    getComponent(name) {
      if (name === "minecraft:inventory") return { container };
      if (name === "minecraft:cursor_inventory") return cursor;
      return undefined;
    },
  };
  player.dimension = {
    id: "minecraft:overworld",
    heightRange: { min: -64, max: 320 },
    getBlock: () => ({}),
    spawnItem: (item, location) => mc.spawned.push({ item, location }),
    spawnEntity(type, at) { return storageEntity(this, at, type); },
    getEntities(query = {}) {
      return mc.entities.filter((e) => e.dimension === this && (!query.type || query.type === e.typeId));
    },
  };
  mc.players.push(player);
  return player;
}

const subscribable = (name) => ({
  subscribe: (fn) => {
    (mc.after[name] ??= []).push(fn);
  },
});
mc.server = {
  CommandPermissionLevel: { GameDirectors: 2 },
  EnchantmentType,
  ItemLockMode: { inventory: "inventory", slot: "slot", none: "none" },
  ItemStack,
  StructureSaveMode: { World: "World" },
  Player: class {},
  system: {
    get currentTick() {
      return mc.tick;
    },
    run: (fn) => mc.queue.push(fn),
    runInterval: (fn) => mc.intervals.push(fn),
    runTimeout: (fn) => mc.queue.push(fn),
  },
  world: {
    afterEvents: new Proxy({}, { get: (_, name) => subscribable(String(name)) }),
    beforeEvents: new Proxy({}, { get: (_, name) => subscribable("before:" + String(name)) }),
    getAllPlayers: () => mc.players,
    getDynamicProperty: (key) => mc.worldProps.get(key),
    setDynamicProperty: (key, value) => mc.worldProps.set(key, value),
    structureManager: {
      get: (id) => mc.structures.get(id),
      delete: (id) => mc.structures.delete(id),
      createFromWorld(id, dim, from, to, options) {
        if (mc.failSave) throw new Error("injected snapshot write failure");
        assert.equal(options.saveMode, "World", "snapshots must be restart durable");
        const entities = mc.entities.filter((e) => e.dimension === dim);
        mc.structures.set(id, entities.map((e) => ({
          typeId: e.typeId,
          items: e.getComponent().container.slots.map((i) => i?.clone()),
        })));
      },
      place(id, dim, at) {
        mc.loads++;
        if (mc.failLoad) throw new Error("injected snapshot read failure");
        for (const saved of mc.structures.get(id)) {
          const entity = storageEntity(dim, at, saved.typeId);
          saved.items.forEach((item, s) => entity.getComponent().container.setItem(s, item?.clone()));
        }
      },
    },
  },
};
class Form {
  title() { return this; }
  body() { return this; }
  button() { return this; }
  toggle() { return this; }
  slider() { return this; }
  show() { return Promise.resolve({ canceled: true }); }
}
mc.ui = {
  ActionFormData: Form,
  ModalFormData: Form,
  FormCancelationReason: { UserBusy: "UserBusy" },
};
mc.settings = { get: (k) => (k === "pages" ? mc.pages : undefined), getFor: () => undefined, setFor() {} };

/** One engine tick: queued system.run callbacks first, then (every other tick) the script's interval. */
function advance(ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    mc.tick++;
    const q = mc.queue.splice(0);
    for (const fn of q) fn();
    if (mc.tick % 2 === 0) for (const fn of mc.intervals) fn();
  }
}
function fire(name, event) {
  for (const fn of mc.after[name] ?? []) fn(event);
}

const serverUrl = dataUrl(`const m = globalThis.__mc.server; export const { CommandPermissionLevel, EnchantmentType, ItemLockMode, ItemStack, Player, StructureSaveMode, system, world } = m;`);
const uiUrl = dataUrl(`const m = globalThis.__mc.ui; export const { ActionFormData, FormCancelationReason, ModalFormData } = m;`);
const settingsUrl = dataUrl(`const m = globalThis.__mc.settings; export const { get, getFor, setFor } = m;`);
const storeSource = readFileSync(new URL("../packs/stash_bp/scripts/page-store.js", import.meta.url), "utf8")
  .replace('"@minecraft/server"', JSON.stringify(serverUrl));
const storeUrl = dataUrl(storeSource);
const source = readFileSync(new URL("../packs/stash_bp/scripts/pages.js", import.meta.url), "utf8")
  .replace('"@minecraft/server"', JSON.stringify(serverUrl))
  .replace('"@minecraft/server-ui"', JSON.stringify(uiUrl))
  .replace('"./settings.js"', JSON.stringify(settingsUrl))
  .replace('"./page-store.js"', JSON.stringify(storeUrl));
const pages = await import(dataUrl(source));
const { STORAGE_SLOTS, BUTTON_SLOTS, BTN_PREV, BTN_MENU, BTN_NEXT, switchPage, curPage, enforcePageCount } = pages;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const stack = (id, n = 1) => new ItemStack(id, n);
const PAGE_ITEMS = ["minecraft:redstone", "minecraft:emerald", "minecraft:iron_ingot", "minecraft:glowstone", "minecraft:nether_star"];

/** A player whose buttons are in place (the interval puts them there; the next tick ends the script-write mark). */
function joined() {
  const p = makePlayer();
  while (!p.container.getItem(9)) advance(1);
  advance(1);
  return p;
}
const slotTypes = (p) => STORAGE_SLOTS.map((s) => p.container.getItem(s)?.typeId);
const filled = (p) => STORAGE_SLOTS.filter((s) => p.container.getItem(s));
/** A click on a button, the way the inventory screen delivers it: the button ends up on the cursor. */
function pickUpButton(p, slot) {
  const button = p.container.getItem(slot);
  p.cursor.item = button;
  p.container.setItem(slot, undefined);
  fire("playerInventoryItemChange", { player: p, slot, beforeItemStack: button, itemStack: undefined });
}

// ---------------------------------------------------------------------------
// Bug 1: items must change when the page changes
// ---------------------------------------------------------------------------

test("metadata read errors fail closed instead of silently erasing damage or enchantments", () => {
  const p = joined();
  const pick = stack("minecraft:diamond_pickaxe");
  pick.damage = 77;
  pick.enchants.push({ id: "efficiency", level: 5 });
  p.container.setItem(10, pick);
  mc.metadataThrow.add(pick.typeId);
  try { assert.equal(switchPage(p, 2), false); }
  finally { mc.metadataThrow.clear(); }
  assert.equal(curPage(p), 1);
  assert.equal(p.container.getItem(10).damage, 77);
  assert.equal(p.container.getItem(10).enchants[0].level, 5);
});

test("stackable items (dynamic properties throw) leave the live inventory and come back", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:redstone", 64));
  p.container.setItem(11, stack("minecraft:emerald", 7));
  p.container.setItem(18, stack("minecraft:white_carpet", 3));
  assert.equal(switchPage(p, 2), true);
  assert.equal(curPage(p), 2);
  assert.equal(filled(p).length, 0, "page 2 must start empty");
  assert.equal(switchPage(p, 1), true);
  assert.equal(p.container.getItem(10).typeId, "minecraft:redstone");
  assert.equal(p.container.getItem(10).amount, 64);
  assert.equal(p.container.getItem(11).amount, 7);
  assert.equal(p.container.getItem(18).typeId, "minecraft:white_carpet");
});

test("tools with enchantments, damage, names and lore survive a round trip", () => {
  const p = joined();
  const pick = stack("minecraft:diamond_pickaxe");
  pick.nameTag = "Digger";
  pick.setLore(["fast"]);
  pick.damage = 12;
  pick.enchants.push({ id: "efficiency", level: 5 });
  pick.setDynamicProperty("owner", "me");
  const helmet = stack("minecraft:leather_helmet");
  helmet.color = { red: 1, green: 2, blue: 3 };
  p.container.setItem(12, pick);
  p.container.setItem(14, helmet);
  switchPage(p, 2);
  assert.equal(filled(p).length, 0);
  switchPage(p, 1);
  const back = p.container.getItem(12);
  assert.equal(back.nameTag, "Digger");
  assert.deepEqual(back.lore, ["fast"]);
  assert.equal(back.damage, 12);
  assert.deepEqual(back.enchants, [{ id: "efficiency", level: 5 }]);
  assert.equal(back.props.get("owner"), "me");
  assert.deepEqual(p.container.getItem(14).color, { red: 1, green: 2, blue: 3 });
});

test("pages 1..5 each keep their own items, in every direction", () => {
  const p = joined();
  for (let page = 1; page <= 5; page++) {
    if (page > 1) {
      assert.equal(switchPage(p, page), true);
      assert.equal(filled(p).length, 0, `page ${page} starts empty`);
    }
    p.container.setItem(10, stack(PAGE_ITEMS[page - 1], page));
    p.container.setItem(35, stack("minecraft:potion"));
    p.container.getItem(35).nameTag = `potion-${page}`;
  }
  for (const order of [[1, 2, 3, 4, 5], [5, 4, 3, 2, 1], [3, 5, 1, 4, 2]]) {
    for (const page of order) {
      assert.equal(switchPage(p, page === curPage(p) ? (page % 5) + 1 : page), true);
      const target = curPage(p);
      assert.equal(p.container.getItem(10).typeId, PAGE_ITEMS[target - 1], `page ${target} item`);
      assert.equal(p.container.getItem(10).amount, target);
      assert.equal(p.container.getItem(35).nameTag, `potion-${target}`, `page ${target} potion`);
      assert.equal(filled(p).length, 2, `page ${target} shows only its own items`);
    }
  }
});

test("opaque items (filled shulker box, potion, bundle, trimmed armor) are restored exactly", () => {
  const p = joined();
  const box = stack("minecraft:red_shulker_box");
  box.nameTag = "Loot";
  box.contents = ["a diamond", "a stack of arrows"];
  const potion = stack("minecraft:potion");
  potion.nameTag = "Swiftness";
  p.container.setItem(10, box);
  p.container.setItem(11, potion);
  p.container.setItem(12, stack("minecraft:redstone", 9));
  switchPage(p, 3);
  assert.equal(filled(p).length, 0, "nothing of page 1 stays behind");
  p.container.setItem(10, stack("minecraft:emerald", 2));
  switchPage(p, 1);
  assert.equal(p.container.getItem(10).contents[0], "a diamond");
  assert.equal(p.container.getItem(10).nameTag, "Loot");
  assert.equal(p.container.getItem(11).nameTag, "Swiftness");
  assert.equal(p.container.getItem(12).amount, 9);
  switchPage(p, 3);
  assert.equal(p.container.getItem(10).typeId, "minecraft:emerald");
});

test("a parked item whose slot is taken goes to the first free slot, never lost", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:purple_shulker_box"));
  switchPage(p, 2);
  p.container.setItem(10, stack("minecraft:emerald", 1));
  switchPage(p, 1);
  switchPage(p, 2);
  switchPage(p, 1);
  assert.equal(slotTypes(p).filter((t) => t === "minecraft:purple_shulker_box").length, 1);
});

test("shrinking the page count returns parked items instead of losing them", () => {
  const p = joined();
  switchPage(p, 4);
  p.container.setItem(10, stack("minecraft:yellow_shulker_box"));
  switchPage(p, 1);
  mc.pages = 2;
  try {
    enforcePageCount(p);
  } finally {
    mc.pages = 5;
  }
  const where = [...slotTypes(p), ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => p.container.getItem(s)?.typeId), ...mc.spawned.map((s) => s.item.typeId)];
  assert.ok(where.includes("minecraft:yellow_shulker_box"));
});

test("a player who leaves keeps inactive items saved, never dropped", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:blue_shulker_box"));
  switchPage(p, 2);
  mc.spawned.length = 0;
  fire("playerLeave", { playerId: p.id });
  assert.equal(mc.spawned.length, 0);
});

test("inactive opaque stacks survive losing the complete script heap", async () => {
  const p = joined();
  const box = stack("minecraft:red_shulker_box");
  box.contents = ["diamond", "written book"];
  p.container.setItem(10, box);
  assert.equal(switchPage(p, 2), true);
  // Importing a fresh script instance discards every module-local map, as a server restart does.
  const after = structuredClone(Object.fromEntries(Object.entries(mc.after).map(([k, v]) => [k, v.length])));
  const intervals = mc.intervals.length;
  try {
    const restarted = await import(dataUrl(source + "\n// fresh script heap"));
    assert.equal(restarted.switchPage(p, 1), true);
    assert.deepEqual(p.container.getItem(10)?.contents, ["diamond", "written book"]);
  } finally {
    mc.intervals.length = intervals;
    for (const k of Object.keys(mc.after)) mc.after[k].length = after[k] ?? 0;
  }
});

test("full 24-slot opaque pages round-trip without touching the hotbar", () => {
  const p = joined();
  p.container.setItem(0, stack("minecraft:apple", 3));
  for (const s of STORAGE_SLOTS) {
    const item = stack("minecraft:white_shulker_box");
    item.contents = [`unique-${s}`];
    p.container.setItem(s, item);
  }
  assert.equal(switchPage(p, 5), true);
  assert.equal(filled(p).length, 0);
  assert.equal(switchPage(p, 1), true);
  for (const s of STORAGE_SLOTS) assert.deepEqual(p.container.getItem(s).contents, [`unique-${s}`]);
  assert.equal(p.container.getItem(0).amount, 3);
});

test("snapshot write and restore failures never clear the source inventory", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:potion"));
  mc.failSave = true;
  try { assert.equal(switchPage(p, 2), false); }
  finally { mc.failSave = false; }
  assert.equal(curPage(p), 1);
  assert.equal(p.container.getItem(10).typeId, "minecraft:potion");
  assert.equal(switchPage(p, 2), true);
  mc.failLoad = true;
  try { assert.equal(switchPage(p, 1), false); }
  finally { mc.failLoad = false; }
  assert.equal(curPage(p), 2);
  assert.equal(filled(p).length, 0);
  assert.equal(switchPage(p, 1), true);
  assert.equal(p.container.getItem(10).typeId, "minecraft:potion");
});

test("inventory setItem failure rolls back all prior writes and page pointers", () => {
  const p = joined();
  for (const s of STORAGE_SLOTS) p.container.setItem(s, stack("minecraft:emerald", 7));
  const original = p.container.setItem.bind(p.container);
  let calls = 0;
  p.container.setItem = (s, item) => {
    if (++calls === 5) throw new Error("injected inventory write failure");
    original(s, item);
  };
  assert.equal(switchPage(p, 2), false);
  p.container.setItem = original;
  assert.equal(curPage(p), 1);
  for (const s of STORAGE_SLOTS) assert.equal(p.container.getItem(s).amount, 7);
  assert.equal(switchPage(p, 2), true);
  assert.equal(filled(p).length, 0);
  assert.equal(switchPage(p, 1), true);
  assert.equal(filled(p).length, 24);
});

test("failed final index commit restores source items without duplicating a destination", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:potion"));
  const original = p.setDynamicProperty.bind(p);
  let calls = 0;
  p.setDynamicProperty = (k, v) => {
    if (k === "stash:native" && ++calls === 2) throw new Error("injected index write failure");
    original(k, v);
  };
  assert.equal(switchPage(p, 2), false);
  p.setDynamicProperty = original;
  assert.equal(curPage(p), 1);
  assert.equal(p.container.getItem(10).typeId, "minecraft:potion");
  assert.equal(switchPage(p, 2), true);
  assert.equal(filled(p).length, 0);
  assert.equal(switchPage(p, 1), true);
  assert.equal(filled(p).length, 1);
});

test("legacy JSON is migrated once, including chunked records; corrupt records are never filtered out", () => {
  const p = joined();
  const raw = JSON.stringify([{ s: 10, id: "minecraft:emerald", n: 23 }, { s: 11, id: "minecraft:diamond_pickaxe", n: 1, dmg: 87, ench: [["efficiency", 4]] }]);
  p.setDynamicProperty("stash:page:2", "#2");
  p.setDynamicProperty("stash:page:2:0", raw.slice(0, 40));
  p.setDynamicProperty("stash:page:2:1", raw.slice(40));
  assert.equal(switchPage(p, 2), true);
  assert.equal(p.container.getItem(10).amount, 23);
  assert.equal(p.container.getItem(11).damage, 87);
  p.container.setItem(10, undefined);
  assert.equal(switchPage(p, 1), true);
  assert.equal(switchPage(p, 2), true);
  assert.equal(p.container.getItem(10), undefined, "stale legacy JSON must not resurrect consumed items");
  p.setDynamicProperty("stash:page:3", JSON.stringify([{ s: 10, id: "minecraft:emerald", n: 3 }, { s: 11, id: "minecraft:diamond", n: -1 }]));
  assert.equal(switchPage(p, 3), false);
  assert.equal(curPage(p), 2);
  assert.equal(p.container.getItem(11).damage, 87);
});

test("shrinking with no room keeps overflow durable and never drops or duplicates it", () => {
  const p = joined();
  assert.equal(switchPage(p, 5), true);
  const box = stack("minecraft:blue_shulker_box");
  box.contents = ["overflow treasure"];
  p.container.setItem(10, box);
  assert.equal(switchPage(p, 1), true);
  for (let s = 0; s < 36; s++) p.container.setItem(s, stack("minecraft:stone", 64));
  const drops = mc.spawned.length;
  mc.pages = 1;
  try {
    assert.equal(enforcePageCount(p), false, "full inventory leaves native overflow saved");
    p.container.setItem(10, undefined);
    assert.equal(enforcePageCount(p), true, "overflow is returned when a slot becomes free");
    assert.deepEqual(p.container.getItem(10).contents, ["overflow treasure"]);
    p.container.setItem(11, undefined);
    assert.equal(enforcePageCount(p), true);
    assert.equal(p.container.getItem(11), undefined, "overflow must not be delivered twice");
  } finally { mc.pages = 5; }
  assert.equal(mc.spawned.length, drops);
});

test("native stackable auxiliary data is not mistaken for an identical item on another page", () => {
  const p = joined();
  const poison = stack("minecraft:tipped_arrow", 12);
  poison.contents = ["poison"];
  p.container.setItem(10, poison);
  assert.equal(switchPage(p, 2), true);
  const healing = stack("minecraft:tipped_arrow", 12);
  healing.contents = ["healing"];
  p.container.setItem(10, healing);
  assert.equal(switchPage(p, 1), true);
  assert.deepEqual(p.container.getItem(10).contents, ["poison"]);
  assert.equal(switchPage(p, 2), true);
  assert.deepEqual(p.container.getItem(10).contents, ["healing"]);
});

test("page index readback failure after writing is rolled back, not treated as success", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:emerald", 19));
  const originalGet = p.getDynamicProperty;
  const originalSet = p.setDynamicProperty.bind(p);
  let nativeWrites = 0;
  let unreadable = false;
  p.setDynamicProperty = (k, v) => {
    originalSet(k, v);
    if (k === "stash:native" && ++nativeWrites === 2) unreadable = true;
  };
  p.getDynamicProperty = (k) => {
    if (k === "stash:native" && unreadable) {
      unreadable = false;
      throw new Error("injected index readback failure after a successful write");
    }
    return originalGet(k);
  };
  assert.equal(switchPage(p, 2), false);
  p.getDynamicProperty = originalGet;
  p.setDynamicProperty = originalSet;
  assert.equal(curPage(p), 1);
  assert.equal(p.container.getItem(10).amount, 19);
  assert.equal(switchPage(p, 2), true);
  assert.equal(filled(p).length, 0);
});

test("death quarantines an interrupted rollback instead of resurrecting dropped active items", async () => {
  const p = joined();
  for (const s of STORAGE_SLOTS) p.container.setItem(s, stack("minecraft:emerald", 7));
  const original = p.container.setItem.bind(p.container);
  let calls = 0;
  p.container.setItem = (s, item) => {
    if (++calls >= 5) throw new Error("persistent inventory write failure");
    original(s, item);
  };
  assert.equal(switchPage(p, 2), false);
  p.container.setItem = original;
  fire("entityDie", { deadEntity: p });
  for (const s of STORAGE_SLOTS) p.container.setItem(s, undefined);
  fire("playerSpawn", { player: p });
  const storage = await import(storeUrl);
  assert.equal(storage.inventoryReady(p), false);
  assert.equal(filled(p).length, 0);
  const state = JSON.parse(p.getDynamicProperty("stash:native"));
  assert.ok(state.pending);
  assert.ok(mc.structures.has(state.pending.before.id), "operator still has the recovery image");
});

test("repeated write failure retains durable recovery images but never speculatively replays them", async () => {
  const p = joined();
  for (const s of STORAGE_SLOTS) p.container.setItem(s, stack("minecraft:emerald", 7));
  const original = p.container.setItem.bind(p.container);
  let calls = 0;
  p.container.setItem = (s, item) => {
    if (++calls >= 5) throw new Error("persistent inventory write failure");
    original(s, item);
  };
  assert.equal(switchPage(p, 2), false);
  const pending = JSON.parse(p.getDynamicProperty("stash:native")).pending;
  assert.ok(mc.structures.has(pending.before.id));
  assert.ok(mc.structures.has(pending.after.id));
  p.container.setItem = original;
  const storage = await import(storeUrl);
  const actual = slotTypes(p);
  assert.equal(storage.inventoryReady(p), false);
  assert.deepEqual(slotTypes(p), actual);
  assert.equal(switchPage(p, 2), false);
});

function journaledPlayer(id = "minecraft:diamond") {
  const p = joined();
  p.container.setItem(10, stack(id));
  const original = p.setDynamicProperty.bind(p);
  let writes = 0;
  p.setDynamicProperty = (k, v) => {
    if (k === "stash:native" && [2, 3].includes(++writes)) throw new Error("failed final commit and rollback index");
    original(k, v);
  };
  assert.equal(switchPage(p, 2), false);
  p.setDynamicProperty = original;
  assert.ok(JSON.parse(p.getDynamicProperty("stash:native")).pending);
  assert.equal(p.container.getItem(10).typeId, id);
  return p;
}

test("dropping a pending before-item into the allowed after-empty image never recreates it", async () => {
  const p = journaledPlayer();
  const diamond = p.container.getItem(10);
  p.dimension.spawnItem(diamond, p.location);
  p.container.setItem(10, undefined);
  const storage = await import(storeUrl);
  assert.equal(storage.inventoryReady(p), false);
  assert.equal(p.container.getItem(10), undefined);
  assert.ok(mc.spawned.some((e) => e.item === diamond), "original drop still exists; never create its duplicate");
});

test("opaque native contents changed during pending recovery are never overwritten by visible signatures", async () => {
  const p = journaledPlayer("minecraft:white_shulker_box");
  const changed = stack("minecraft:white_shulker_box");
  changed.contents = ["new real contents, not in the recovery image"];
  p.container.setItem(10, changed);
  const storage = await import(storeUrl);
  assert.equal(storage.inventoryReady(p), false);
  assert.deepEqual(p.container.getItem(10).contents, changed.contents);
});

test("full 25-to-1 overflow retries have a bounded native snapshot read budget", (t) => {
  mc.pages = 25;
  const p = joined();
  const allPlayers = mc.players;
  mc.players = [p];
  try {
    for (let page = 1; page <= 25; page++) {
      assert.equal(switchPage(p, page), true);
      for (const s of STORAGE_SLOTS) p.container.setItem(s, stack("minecraft:stone", 64));
    }
    assert.equal(switchPage(p, 1), true);
    for (let s = 0; s < 36; s++) p.container.setItem(s, stack("minecraft:stone", 64));
    const before = mc.loads;
    const notes = p.bar.length;
    mc.pages = 1;
    advance(200);
    t.diagnostic(`25-to-1 overflow: ${mc.loads - before} snapshot reads across 200 ticks`);
    assert.ok(mc.loads - before <= 24 * 11, `at most one 24-page retry per 20 ticks, got ${mc.loads - before} reads`);
    assert.ok(p.bar.length - notes <= 11, "overflow warnings follow the same retry budget");
    p.container.setItem(10, undefined);
    advance(20);
    assert.equal(p.container.getItem(10)?.amount, 64, "making room returns exactly one full stack");
  } finally {
    mc.pages = 5;
    mc.players = allPlayers.filter((player) => player !== p);
  }
});

test("a real cursor stack is never cleared while switching pages", () => {
  const p = joined();
  p.cursor.item = stack("minecraft:diamond", 9);
  p.container.setItem(17, undefined);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: stack(BTN_NEXT), itemStack: undefined });
  assert.equal(p.cursor.item.typeId, "minecraft:diamond");
  assert.equal(p.cursor.item.amount, 9);
});

// ---------------------------------------------------------------------------
// Bug 2: clicking the buttons
// ---------------------------------------------------------------------------

test("the buttons are locked to their slots and kept on death", () => {
  const p = joined();
  for (const [slot, id] of [[9, BTN_PREV], [13, BTN_MENU], [17, BTN_NEXT]]) {
    const b = p.container.getItem(slot);
    assert.equal(b.typeId, id);
    assert.equal(b.lockMode, "inventory");
    assert.equal(b.keepOnDeath, true);
  }
  assert.deepEqual(BUTTON_SLOTS, [9, 13, 17]);
});

test("clicking > picks the button up, which switches the page and clears the cursor at once", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:redstone", 4));
  pickUpButton(p, 17);
  assert.equal(p.cursor.item, undefined, "the button never stays on the cursor");
  assert.equal(curPage(p), 2);
  assert.equal(filled(p).length, 0);
  assert.equal(p.container.getItem(17).typeId, BTN_NEXT, "the button is back in its slot");
  assert.match(p.container.getItem(9).nameTag, /Page 1\/5/);
});

test("clicking < from page 1 wraps to the last page", () => {
  const p = joined();
  pickUpButton(p, 9);
  assert.equal(curPage(p), 5);
});

test("clicks on consecutive ticks each switch the page", () => {
  const p = joined();
  for (let expected = 2; expected <= 5; expected++) {
    advance(1);
    pickUpButton(p, 17);
    assert.equal(curPage(p), expected);
    assert.equal(p.cursor.item, undefined);
  }
});

test("two events from one click switch only once", () => {
  const p = joined();
  advance(1);
  const button = p.container.getItem(17);
  p.cursor.item = button;
  p.container.setItem(17, undefined);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: button, itemStack: undefined });
  p.cursor.item = p.container.getItem(17);
  p.container.setItem(17, undefined);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: button, itemStack: undefined });
  assert.equal(curPage(p), 2);
});

test("the script's own button writes are not clicks", () => {
  const p = joined();
  switchPage(p, 2);
  const button = p.container.getItem(17);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: button, itemStack: button });
  fire("playerInventoryItemChange", { player: p, slot: 9, beforeItemStack: undefined, itemStack: p.container.getItem(9) });
  advance(3);
  assert.equal(curPage(p), 2);
});

test("a button left on the cursor is cleared by the next tick even without an event", () => {
  const p = joined();
  advance(2);
  p.cursor.item = stack(BTN_MENU);
  advance(2);
  assert.equal(p.cursor.item, undefined);
});

test("clearing all three buttons (like /clear) refreshes them without switching pages", () => {
  const p = joined();
  for (const s of BUTTON_SLOTS) p.container.setItem(s, undefined);
  fire("playerInventoryItemChange", { player: p, slot: 9, beforeItemStack: stack(BTN_PREV), itemStack: undefined });
  assert.equal(curPage(p), 1);
  assert.equal(p.container.getItem(13).typeId, BTN_MENU);
});

test("a real item dropped into a button slot is rescued, not overwritten", () => {
  const p = joined();
  advance(1);
  p.container.setItem(17, stack("minecraft:diamond", 5));
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: stack(BTN_NEXT), itemStack: p.container.getItem(17) });
  assert.equal(p.container.getItem(17).typeId, BTN_NEXT, "the button slot holds its button again");
  if (curPage(p) !== 1) switchPage(p, 1);
  const held = [...slotTypes(p), ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => p.container.getItem(s)?.typeId)];
  assert.ok(held.includes("minecraft:diamond") || mc.spawned.some((s) => s.item.typeId === "minecraft:diamond"));
});
