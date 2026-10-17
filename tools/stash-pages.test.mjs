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
    return o.typeId === this.typeId && o.nameTag === this.nameTag;
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
    spawnItem: (item, location) => mc.spawned.push({ item, location }),
    getEntities: () => [],
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

const serverUrl = dataUrl(`const m = globalThis.__mc.server; export const { CommandPermissionLevel, EnchantmentType, ItemLockMode, ItemStack, Player, system, world } = m;`);
const uiUrl = dataUrl(`const m = globalThis.__mc.ui; export const { ActionFormData, FormCancelationReason, ModalFormData } = m;`);
const settingsUrl = dataUrl(`const m = globalThis.__mc.settings; export const { get, getFor, setFor } = m;`);
const source = readFileSync(new URL("../packs/stash_bp/scripts/pages.js", import.meta.url), "utf8")
  .replace('"@minecraft/server"', JSON.stringify(serverUrl))
  .replace('"@minecraft/server-ui"', JSON.stringify(uiUrl))
  .replace('"./settings.js"', JSON.stringify(settingsUrl));
const pages = await import(dataUrl(source));
const { STORAGE_SLOTS, BUTTON_SLOTS, BTN_PREV, BTN_MENU, BTN_NEXT, switchPage, curPage, isOpaque, enforcePageCount } = pages;

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

test("isOpaque never answers true because a read threw", () => {
  mc.throwing.add("minecraft:glowstone");
  assert.equal(isOpaque(stack("minecraft:glowstone", 5)), false);
  mc.throwing.delete("minecraft:glowstone");
  assert.equal(isOpaque(stack("minecraft:redstone", 5)), false);
  assert.equal(isOpaque(stack("minecraft:enchanted_book")), false);
  assert.equal(isOpaque(stack("minecraft:leather_helmet")), false);
  assert.equal(isOpaque(stack("minecraft:potion")), true);
  assert.equal(isOpaque(stack("minecraft:white_shulker_box")), true);
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

test("a player who leaves has parked items dropped where they stood", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:blue_shulker_box"));
  switchPage(p, 2);
  mc.spawned.length = 0;
  fire("playerLeave", { playerId: p.id });
  assert.equal(mc.spawned.length, 1);
  assert.equal(mc.spawned[0].item.typeId, "minecraft:blue_shulker_box");
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
