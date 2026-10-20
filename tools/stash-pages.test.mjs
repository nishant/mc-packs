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
  saves: 0,
  /** @type {Array<{ id: string, message: string }>} every script event the packs sent */
  events: [],
  eventDelay: 1,
  changes: [],
  prefs: new Map(),
  forms: [],
  formResponses: new Map(),
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
  get isStackable() {
    return this.maxAmount > 1;
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
    const before = this.slots[s]?.clone();
    this.slots[s] = item;
    if (this.player && mc.eventDelay) mc.changes.push({
      tick: mc.tick + mc.eventDelay,
      event: { player: this.player, inventoryType: "Inventory", slot: s, beforeItemStack: before, itemStack: item?.clone() },
    });
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
    isSneaking: false,
    name: `Player${nextId}`,
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
      if (name === "minecraft:equippable") return { getEquipment: (slot) => player.worn?.[slot] };
      return undefined;
    },
  };
  player.dimension = {
    id: "minecraft:overworld",
    heightRange: { min: -64, max: 320 },
    getBlock: () => ({}),
    spawnItem: (item, location) => mc.spawned.push({ item, location }),
    spawnEntity(type, at) { return storageEntity(this, at, type); },
    runCommand(command) {
      const m = /^structure load "([^"]+)" (-?\d+) (-?\d+) (-?\d+) 0_degrees none true false$/.exec(command);
      assert.ok(m, `unexpected command ${command}`);
      mc.server.world.structureManager.place(m[1], this, { x: +m[2], y: +m[3], z: +m[4] });
      return { successCount: 1 };
    },
    getEntities(query = {}) {
      return mc.entities.filter((e) => e.dimension === this && (!query.type || query.type === e.typeId));
    },
  };
  container.player = player;
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
  PlayerInventoryType: { Inventory: "Inventory", Hotbar: "Hotbar" },
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
    sendScriptEvent: (id, message) => (id === "realm:stash_changed" ? (mc.notes ??= []) : mc.events).push({ id, message }),
    afterEvents: new Proxy({}, { get: (_, name) => subscribable("system:" + String(name)) }),
    beforeEvents: new Proxy({}, { get: (_, name) => subscribable("system:before:" + String(name)) }),
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
        mc.saves++;
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
mc.dimensions = new Map();
mc.defaults = {};
Object.assign(mc.server, {
  Block: class {},
  BlockTypes: { get: () => ({}) },
  BlockVolume: class {},
  Container: class {},
  Dimension: class {},
  CustomCommandParamType: { Integer: "Integer" },
  CustomCommandStatus: { Success: 0, Failure: 1 },
  Direction: { Down: "Down", Up: "Up", North: "North", South: "South", West: "West", East: "East" },
});
mc.server.world.getDimension = (id) => mc.dimensions.get(id);
mc.server.world.getDynamicPropertyIds = () => [...mc.worldProps.keys()];
class Form {
  constructor() { this.buttons = []; }
  title(text) { this.heading = text; return this; }
  body(text) { this.text = text; return this; }
  button(text) { this.buttons.push(text); return this; }
  toggle() { return this; }
  slider() { return this; }
  show(player) {
    mc.forms.push({ player, form: this });
    let response = mc.formResponses.get(player.id)?.shift();
    // A function answers from the form that was shown, after doing whatever happens while the player looks at it.
    if (typeof response === "function") response = response(this);
    return Promise.resolve(response ?? { canceled: true });
  }
}
mc.ui = {
  ActionFormData: Form,
  ModalFormData: Form,
  FormCancelationReason: { UserBusy: "UserBusy" },
};
/** Like settings.js, a changed preference tells the onChange listeners (for the player it belongs to). */
const prefListeners = [];
const prefsSet = mc.prefs.set.bind(mc.prefs);
mc.prefs.set = (k, v) => {
  prefsSet(k, v);
  const player = mc.players.find((p) => k.startsWith(`${p.id}:`));
  for (const fn of prefListeners) fn(k.slice(k.indexOf(":") + 1), player);
  return mc.prefs;
};
mc.settings = {
  onChange: (fn) => prefListeners.push(fn),
  get: (k) => (k === "pages" ? mc.pages : mc.defaults[k]),
  getFor: (p, k) => (mc.prefs.has(`${p.id}:${k}`) ? mc.prefs.get(`${p.id}:${k}`) : mc.defaults[k]),
  setFor: (p, k, v) => mc.prefs.set(`${p.id}:${k}`, v),
};

/** One engine tick: queued system.run callbacks first, then (every other tick) the script's interval. */
function advance(ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    mc.tick++;
    const due = mc.changes.filter((e) => e.tick <= mc.tick);
    mc.changes = mc.changes.filter((e) => e.tick > mc.tick);
    for (const { event } of due) fire("playerInventoryItemChange", event);
    const q = mc.queue.splice(0);
    for (const fn of q) fn();
    if (mc.tick % 2 === 0) for (const fn of mc.intervals) fn();
  }
}
function fire(name, event) {
  if (name === "playerInventoryItemChange" && event.inventoryType === undefined) event.inventoryType = "Inventory";
  for (const fn of mc.after[name] ?? []) fn(event);
}

const serverUrl = dataUrl(`const m = globalThis.__mc.server; export const { CommandPermissionLevel, EnchantmentType, ItemLockMode, ItemStack, Player, PlayerInventoryType, StructureSaveMode, system, world } = m;`);
const uiUrl = dataUrl(`const m = globalThis.__mc.ui; export const { ActionFormData, FormCancelationReason, ModalFormData } = m;`);
const settingsUrl = dataUrl(`const m = globalThis.__mc.settings; export const { get, getFor, onChange, setFor } = m;`);
// main.js (the sneak-tap) gets the same model, the real config.js defaults, and a stand-in for pages.js.
const configUrl = dataUrl(readFileSync(new URL("../packs/stash_bp/scripts/config.js", import.meta.url), "utf8"));
const { CONFIG } = await import(configUrl);
Object.assign(mc.defaults, Object.fromEntries(["sneakTap", "sortHotbar", "locks", "cooldownTicks", "stashNamedItems", "stashGear", "maxLocks"].map((k) => [k, CONFIG[k]])));
const mainServerUrl = dataUrl(`const m = globalThis.__mc.server; export const { Block, BlockTypes, BlockVolume, CommandPermissionLevel, Container, CustomCommandParamType, CustomCommandStatus, Dimension, Direction, ItemStack, Player, system, world } = m;`);
// The router keeps its handlers in module state: each copy of main.js gets its own copy of script-events.js (a pack loads once in the game).
const eventsSource = readFileSync(new URL("../packs/stash_bp/scripts/script-events.js", import.meta.url), "utf8").replace('"@minecraft/server"', JSON.stringify(mainServerUrl));
const pagesStubUrl = dataUrl(`export const buttonSlots = () => new Set(); export const initPages = () => {}; export const openInvMenu = async () => {}; export const recoverInventory = async () => ""; export const refillFromPages = () => undefined; export const storedCount = (...a) => (globalThis.__mc.storedCount ? globalThis.__mc.storedCount(...a) : []); export const revisionOf = () => "r"; export const setOpPages = () => ({ ok: true, message: "" });`);
const mainSource = readFileSync(new URL("../packs/stash_bp/scripts/main.js", import.meta.url), "utf8")
  .replace('import "./diag.js";', "")
  .replace('"@minecraft/server-ui"', JSON.stringify(uiUrl))
  .replace('"@minecraft/server"', JSON.stringify(mainServerUrl))
  .replace('"./config.js"', JSON.stringify(configUrl))
  .replace('"./script-events.js"', '"__events__"')
  .replace('"./pages.js"', JSON.stringify(pagesStubUrl))
  .replace('"./settings.js"', JSON.stringify(settingsUrl));
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
  while (!p.container.getItem(BUTTON_SLOTS[0])) advance(1);
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

for (const autoStore of [false, true]) test(`delayed script echoes and consecutive gestures agree (auto-store ${autoStore})`, (t) => {
  const p = joined();
  mc.prefs.set(`${p.id}:autoStore`, autoStore);
  const all = mc.players;
  mc.players = [p];
  mc.eventDelay = 3;
  try {
    for (let page = 1; page <= 5; page++) {
      assert.equal(switchPage(p, page), true);
      if (page !== 4) p.container.setItem(18, stack(PAGE_ITEMS[page - 1], page));
    }
    assert.equal(switchPage(p, 1), true);
    advance(10);
    const check = (expected) => {
      const label = p.container.getItem(BUTTON_SLOTS[1])?.nameTag;
      const trace = { tick: mc.tick, requested: expected, committed: curPage(p), label, visible: p.container.getItem(18)?.typeId ?? "empty", cursor: p.cursor.item?.typeId ?? "empty" };
      t.diagnostic(JSON.stringify(trace));
      assert.equal(curPage(p), expected);
      assert.match(label, new RegExp(`Page ${expected}/5`));
      assert.equal(p.container.getItem(18)?.typeId, expected === 4 ? undefined : PAGE_ITEMS[expected - 1]);
      assert.equal(p.cursor.item, undefined);
    };
    for (const expected of [2, 3, 4, 5, 1, 2]) {
      pickUpButton(p, BUTTON_SLOTS[2]);
      advance(1);
      check(expected);
    }
    advance(10);
    check(2);
    for (const expected of [1, 5, 4, 3, 2, 1]) {
      pickUpButton(p, BUTTON_SLOTS[0]);
      advance(1);
      check(expected);
    }
    advance(10);
    check(1);
    // A shift-click produces a removal plus a stray in the shared hotbar, not two requests.
    const button = p.container.getItem(BUTTON_SLOTS[2]);
    p.container.setItem(BUTTON_SLOTS[2], undefined);
    p.container.setItem(1, button);
    fire("playerInventoryItemChange", { player: p, slot: BUTTON_SLOTS[2], beforeItemStack: button });
    advance(5);
    check(2);
    assert.equal(p.container.getItem(1), undefined);
    // A cursor return before reconciliation is still one gesture, never a replay from the event.
    pickUpButton(p, BUTTON_SLOTS[0]);
    p.container.setItem(BUTTON_SLOTS[0], p.cursor.item);
    advance(5);
    check(1);
  } finally {
    mc.eventDelay = 1; // the default: an inventory change is reported on the next tick, as in the game
    mc.changes = [];
    mc.players = all;
  }
});

test("menu active marker, committed page and visible items agree after button navigation", async () => {
  const p = joined();
  p.container.setItem(18, stack("minecraft:diamond", 9));
  pickUpButton(p, 17);
  advance(1);
  pickUpButton(p, 16);
  advance(1);
  await Promise.resolve();
  const shown = mc.forms.filter((e) => e.player === p).at(-1).form;
  assert.match(shown.text, /^Page #2 of 5/);
  assert.ok(shown.buttons.some((text) => text.startsWith("Page #2 (Active)")));
  assert.equal(p.container.getItem(18), undefined);
});

test("wrong inventory type and invalid slots never consume a cursor or enqueue a request", () => {
  const p = joined();
  p.cursor.item = stack(BTN_NEXT);
  const pending = mc.queue.length;
  for (const [inventoryType, slot] of [["Hotbar", 17], ["Armor", 17], ["Inventory", -1], ["Inventory", 36], ["Inventory", 0]]) {
    fire("playerInventoryItemChange", { player: p, inventoryType, slot, beforeItemStack: stack(BTN_NEXT) });
  }
  assert.equal(mc.queue.length, pending);
  assert.equal(p.cursor.item.typeId, BTN_NEXT);
  assert.equal(curPage(p), 1);
  p.cursor.clear();
});

test("a failed click repairs the old committed controls without retrying the request", () => {
  const p = joined();
  p.setDynamicProperty("stash:page:2", "corrupt");
  p.container.setItem(18, stack("minecraft:diamond", 3));
  pickUpButton(p, 17);
  advance(1);
  assert.equal(curPage(p), 1);
  assert.equal(p.container.getItem(18).amount, 3);
  assert.match(p.container.getItem(16).nameTag, /Page 1\/5/);
  assert.equal(p.container.getItem(17)?.typeId, BTN_NEXT);
  const failures = p.bar.length;
  advance(6);
  assert.equal(p.bar.length, failures, "stale request was consumed even on failure");
});

test("two distinct gestures before reconciliation retain their order instead of dropping one", () => {
  const p = joined();
  const notes = p.bar.length;
  const next = p.container.getItem(17);
  p.container.setItem(17, undefined);
  p.container.setItem(1, next);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: next });
  const prev = p.container.getItem(15);
  p.container.setItem(15, undefined);
  p.container.setItem(2, prev);
  fire("playerInventoryItemChange", { player: p, slot: 15, beforeItemStack: prev });
  assert.equal(curPage(p), 1, "events themselves are read-only");
  advance(1);
  assert.equal(curPage(p), 1, "next then previous returns to page one");
  assert.deepEqual(p.bar.slice(notes).map((line) => /Page #(\d+)/.exec(line)?.[1]), ["2", "1"]);
  assert.equal(p.container.getItem(1), undefined);
  assert.equal(p.container.getItem(2), undefined);
});

test("three sequential queued gestures Next Prev Menu are not a co-observed clear", async () => {
  const p = joined();
  const notes = p.bar.length;
  for (const [slot, hotbar] of [[17, 1], [15, 2], [16, 3]]) {
    const button = p.container.getItem(slot);
    p.container.setItem(slot, undefined);
    p.container.setItem(hotbar, button);
    fire("playerInventoryItemChange", { player: p, slot, beforeItemStack: button });
  }
  advance(1);
  await Promise.resolve();
  const commits = p.bar.slice(notes).map((line) => /Page #(\d+)\//.exec(line)?.[1]).filter(Boolean);
  assert.deepEqual(commits, ["2", "1"]);
  const menus = mc.forms.filter((e) => e.player === p);
  assert.equal(menus.length, 1, "the third genuine gesture opens one menu");
  assert.match(menus[0].form.text, /^Page #1 of 5/);
  assert.equal(curPage(p), 1);
  for (const slot of [1, 2, 3]) assert.equal(p.container.getItem(slot), undefined);
});

test("restoring an old active layout into a joined player is migration, not queued gestures", () => {
  const p = joined();
  p.setDynamicProperty("stash:native", JSON.stringify({ v: 1, cur: 5, pages: {} }));
  for (const slot of BUTTON_SLOTS) p.container.setItem(slot, undefined);
  for (const slot of [10, 11, 12, 14, 15, 16, ...Array.from({ length: 18 }, (_, i) => i + 18)]) {
    p.container.setItem(slot, stack("minecraft:diamond", slot));
  }
  p.container.setItem(9, stack(BTN_PREV));
  p.container.setItem(13, stack(BTN_MENU));
  p.container.setItem(17, stack(BTN_NEXT));
  const notes = p.bar.length;
  fire("playerInventoryItemChange", { player: p, slot: 15, beforeItemStack: stack(BTN_PREV), itemStack: p.container.getItem(15) });
  advance(3);
  assert.equal(curPage(p), 5);
  assert.equal(JSON.parse(p.getDynamicProperty("stash:native")).layout, 2);
  assert.ok(!p.bar.slice(notes).some((line) => /Page #\d+\//.test(line)), "migration never commits a navigation request");
  assert.equal(mc.forms.filter((e) => e.player === p).length, 0);
  assert.equal(p.container.getItem(13)?.amount, 15);
  assert.equal(p.container.getItem(14)?.amount, 16);
});

test("UserBusy menu retries rebuild committed page, usage and active marker after navigation", async () => {
  const p = joined();
  p.container.setItem(18, stack("minecraft:redstone", 1));
  mc.formResponses.set(p.id, [{ canceled: true, cancelationReason: "UserBusy" }, { canceled: true }]);
  const opening = pages.openInvMenu(p);
  await Promise.resolve();
  pickUpButton(p, 17);
  advance(1);
  p.container.setItem(18, stack("minecraft:emerald", 2));
  advance(20);
  await opening;
  const attempts = mc.forms.filter((e) => e.player === p).map((e) => e.form);
  assert.equal(attempts.length, 2);
  assert.match(attempts[0].text, /^Page #1 of 5/);
  assert.match(attempts[1].text, /^Page #2 of 5/);
  assert.match(attempts[1].text, /2 of 120 slots used/);
  assert.ok(attempts[1].buttons.some((text) => text.startsWith("Page #2 (Active)")));
  assert.ok(!attempts[1].buttons.some((text) => text.startsWith("Page #1 (Active)")));
  assert.match(p.container.getItem(16).nameTag, /Page 2\/5/);
});

test("UserBusy retry actions stay aligned with a rebuilt page-count-dependent button list", async () => {
  const p = joined();
  const all = mc.players;
  mc.players = [p];
  let sorted = 0;
  pages.initPages({ bar: (player, text) => player.bar.push(text), sort: () => sorted++, stash() {} });
  try {
    mc.formResponses.set(p.id, [{ canceled: true, cancelationReason: "UserBusy" }, { canceled: false, selection: 6 }]);
    const opening = pages.openInvMenu(p);
    await Promise.resolve();
    mc.pages = 2;
    advance(20);
    await opening;
    const shown = mc.forms.filter((e) => e.player === p).at(-1).form;
    assert.match(shown.buttons[6], /^Sort this page/);
    assert.equal(sorted, 1, "new Sort button must not execute the old Page #4 action");
    assert.equal(curPage(p), 1);
  } finally {
    mc.pages = 5;
    mc.players = all;
    pages.initPages({ bar: (player, text) => player.onScreenDisplay.setActionBar(text), sort() {}, stash() {} });
  }
});

test("an unavailable cursor component cannot block a visible slot request", () => {
  const p = joined();
  const original = p.getComponent.bind(p);
  p.getComponent = (name) => {
    if (name === "minecraft:cursor_inventory") throw new Error("cursor unavailable");
    return original(name);
  };
  p.container.setItem(17, undefined);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: stack(BTN_NEXT) });
  advance(2);
  assert.equal(curPage(p), 2);
});

test("batched live slot changes retain the first event's gesture order without replaying its payload", () => {
  const p = joined();
  const notes = p.bar.length;
  const next = p.container.getItem(17);
  const prev = p.container.getItem(15);
  p.container.setItem(17, undefined);
  p.container.setItem(15, undefined);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: next });
  fire("playerInventoryItemChange", { player: p, slot: 15, beforeItemStack: prev });
  advance(1);
  assert.deepEqual(p.bar.slice(notes).map((line) => /Page #(\d+)/.exec(line)?.[1]), ["2", "1"]);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: next });
  advance(4);
  assert.equal(curPage(p), 1, "later stale payload is not another gesture");
});

const OLD_STORAGE = [10, 11, 12, 14, 15, 16, ...Array.from({ length: 18 }, (_, i) => i + 18)];

test("old active layout and lazy native refs migrate by ordinal exactly once", async () => {
  const p = makePlayer();
  const storage = await import(storeUrl);
  const old = OLD_STORAGE.map((s) => {
    const item = stack("minecraft:white_shulker_box");
    item.contents = [`old-${s}`];
    return { s, item };
  });
  for (const e of old) p.container.setItem(e.s, e.item);
  p.container.setItem(0, stack("minecraft:apple", 3));
  p.container.setItem(9, stack(BTN_PREV));
  p.container.setItem(13, stack(BTN_MENU));
  p.container.setItem(17, stack(BTN_NEXT));
  const ref = storage.saveSnapshot(p, old);
  p.setDynamicProperty("stash:native", JSON.stringify({ v: 1, cur: 1, pages: { 2: ref } }));
  advance(4);
  assert.deepEqual(BUTTON_SLOTS, [15, 16, 17]);
  for (let i = 0; i < 24; i++) assert.deepEqual(p.container.getItem(STORAGE_SLOTS[i])?.contents, [`old-${OLD_STORAGE[i]}`]);
  assert.equal(JSON.parse(p.getDynamicProperty("stash:native")).layout, 2);
  assert.equal(JSON.parse(p.getDynamicProperty("stash:native")).pages[2].layout, undefined, "inactive image stays explicitly legacy until used");
  assert.equal(switchPage(p, 2), true);
  for (let i = 0; i < 24; i++) assert.deepEqual(p.container.getItem(STORAGE_SLOTS[i])?.contents, [`old-${OLD_STORAGE[i]}`]);
  assert.equal(JSON.parse(p.getDynamicProperty("stash:native")).pages[1].layout, 2);
  assert.equal(switchPage(p, 1), true);
  assert.equal(p.container.getItem(0).amount, 3);
});

test("full normal inventory migration permutes all 27 main slots without requiring free space", () => {
  const p = makePlayer();
  mc.pages = 1;
  try {
    for (let s = 9; s < 36; s++) {
      const item = stack("minecraft:white_shulker_box");
      item.contents = [`normal-${s}`];
      p.container.setItem(s, item);
    }
    advance(4);
    assert.equal(JSON.parse(p.getDynamicProperty("stash:native")).layout, 2);
    for (let i = 0; i < 24; i++) assert.deepEqual(p.container.getItem(STORAGE_SLOTS[i]).contents, [`normal-${OLD_STORAGE[i]}`]);
    for (const [old, next] of [[9, 15], [13, 16], [17, 17]]) assert.deepEqual(p.container.getItem(next).contents, [`normal-${old}`]);
    advance(4);
    assert.equal(new Set(p.container.slots.slice(9).map((e) => e.contents[0])).size, 27);
  } finally { mc.pages = 5; mc.players = mc.players.filter((e) => e !== p); }
});

test("failed active layout transaction leaves old slots and layout unchanged for retry", () => {
  const p = makePlayer();
  p.container.setItem(15, stack("minecraft:potion"));
  const original = p.container.setItem.bind(p.container);
  p.container.setItem = () => { throw new Error("layout write failure"); };
  advance(2);
  p.container.setItem = original;
  assert.equal(p.container.getItem(15)?.typeId, "minecraft:potion");
  const state = p.getDynamicProperty("stash:native");
  assert.ok(!state || JSON.parse(state).layout !== 2);
  // A failed rollback is quarantined, not retried or replayed.
  assert.ok(JSON.parse(state).pending);
});

test("legacy JSON validates old slot indices before mapping new reserved slots 15 and 16", () => {
  const p = joined();
  p.setDynamicProperty("stash:page:2", JSON.stringify([
    { s: 15, id: "minecraft:potion", n: 1 }, { s: 16, id: "minecraft:emerald", n: 6 },
  ]));
  assert.equal(switchPage(p, 2), true);
  assert.equal(p.container.getItem(13)?.typeId, "minecraft:potion");
  assert.equal(p.container.getItem(14)?.amount, 6);
  p.setDynamicProperty("stash:page:3", JSON.stringify([{ s: 9, id: "minecraft:diamond", n: 1 }]));
  assert.equal(switchPage(p, 3), false, "new slot 9 is invalid in unversioned legacy JSON");
});

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
  assert.equal(p.container.getItem(9).amount, 23);
  assert.equal(p.container.getItem(10).damage, 87);
  p.container.setItem(9, undefined);
  assert.equal(switchPage(p, 1), true);
  assert.equal(switchPage(p, 2), true);
  assert.equal(p.container.getItem(9), undefined, "stale legacy JSON must not resurrect consumed items");
  p.setDynamicProperty("stash:page:3", JSON.stringify([{ s: 10, id: "minecraft:emerald", n: 3 }, { s: 11, id: "minecraft:diamond", n: -1 }]));
  assert.equal(switchPage(p, 3), false);
  assert.equal(curPage(p), 2);
  assert.equal(p.container.getItem(10).damage, 87);
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
  for (const [slot, id] of [[15, BTN_PREV], [16, BTN_MENU], [17, BTN_NEXT]]) {
    const b = p.container.getItem(slot);
    assert.equal(b.typeId, id);
    assert.equal(b.lockMode, "inventory");
    assert.equal(b.keepOnDeath, true);
  }
  assert.deepEqual(BUTTON_SLOTS, [15, 16, 17]);
});

test("clicking > defers until the transaction finishes, switches once and clears the cursor", () => {
  const p = joined();
  p.container.setItem(10, stack("minecraft:redstone", 4));
  pickUpButton(p, 17);
  assert.equal(curPage(p), 1, "never mutate inventory inside the engine event dispatch");
  advance(1);
  assert.equal(p.cursor.item, undefined, "the button never stays on the cursor");
  assert.equal(curPage(p), 2);
  assert.equal(filled(p).length, 0);
  assert.equal(p.container.getItem(17).typeId, BTN_NEXT, "the button is back in its slot");
  assert.match(p.container.getItem(15).nameTag, /Page 1\/5/);
});

test("clicking < from page 1 wraps to the last page", () => {
  const p = joined();
  pickUpButton(p, 15);
  advance(1);
  assert.equal(curPage(p), 5);
});

test("clicks on consecutive ticks each switch the page", () => {
  const p = joined();
  for (let expected = 2; expected <= 5; expected++) {
    pickUpButton(p, 17);
    advance(1);
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
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: button, itemStack: undefined });
  advance(1);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: button, itemStack: undefined });
  advance(4);
  assert.equal(curPage(p), 2);
});

test("the script's own button writes are not clicks", () => {
  const p = joined();
  switchPage(p, 2);
  const button = p.container.getItem(17);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: button, itemStack: button });
  fire("playerInventoryItemChange", { player: p, slot: 15, beforeItemStack: undefined, itemStack: p.container.getItem(15) });
  advance(3);
  assert.equal(curPage(p), 2);
});

test("a button left on the cursor is cleared within 5 s even without an event", () => {
  const p = joined();
  advance(40);
  p.cursor.item = stack(BTN_MENU);
  advance(100);
  assert.equal(p.cursor.item, undefined);
});

test("clearing all three buttons (like /clear) refreshes them without switching pages", () => {
  const p = joined();
  for (const s of BUTTON_SLOTS) p.container.setItem(s, undefined);
  fire("playerInventoryItemChange", { player: p, slot: 15, beforeItemStack: stack(BTN_PREV), itemStack: undefined });
  advance(1);
  assert.equal(curPage(p), 1);
  assert.equal(p.container.getItem(16).typeId, BTN_MENU);
});

test("a real item dropped into a button slot is rescued, not overwritten", () => {
  const p = joined();
  advance(1);
  p.container.setItem(17, stack("minecraft:diamond", 5));
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: stack(BTN_NEXT), itemStack: p.container.getItem(17) });
  advance(1);
  assert.equal(p.container.getItem(17).typeId, BTN_NEXT, "the button slot holds its button again");
  if (curPage(p) !== 1) switchPage(p, 1);
  const held = [...slotTypes(p), ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((s) => p.container.getItem(s)?.typeId)];
  assert.ok(held.includes("minecraft:diamond") || mc.spawned.some((s) => s.item.typeId === "minecraft:diamond"));
});

// ---------------------------------------------------------------------------
// O73: moving stacks to another page (pages.transferStacks and the "Move to page" menu)
// ---------------------------------------------------------------------------

const storage = await import(storeUrl);
const nativeIndex = (/** @type {any} */ p) => JSON.parse(p.getDynamicProperty("stash:native"));
/** The stacks on one saved page, by slot. */
const savedPage = (/** @type {any} */ p, /** @type {number} */ n) => {
  const ref = nativeIndex(p).pages[n];
  return ref ? new Map(storage.loadSnapshot(p, ref).map((e) => [e.s, e.item])) : new Map();
};
const shulker = (/** @type {string} */ label, name) => {
  const box = stack("minecraft:white_shulker_box");
  box.contents = [label];
  if (name) box.nameTag = name;
  return box;
};
/** Page contents set up from { page: { slot: item } }; ends on page 1. */
function arrange(/** @type {any} */ p, /** @type {Record<number, Record<number, any>>} */ layout) {
  for (const page of Object.keys(layout).map(Number).sort((a, b) => b - a)) {
    assert.equal(switchPage(p, page), true);
    for (const [slot, item] of Object.entries(layout[page])) p.container.setItem(Number(slot), item);
  }
  if (curPage(p) !== 1) assert.equal(switchPage(p, 1), true);
}
/** Every stack the player owns, by kind and hidden contents, across the live inventory, the cursor, every saved page and the ground. */
function census(/** @type {any} */ p) {
  /** @type {Map<string, number>} */
  const out = new Map();
  const add = (/** @type {any} */ item) => {
    if (!item || [BTN_PREV, BTN_MENU, BTN_NEXT].includes(item.typeId)) return;
    const key = `${item.typeId}|${item.nameTag ?? ""}|${JSON.stringify(item.contents ?? null)}|${item.damage}`;
    out.set(key, (out.get(key) ?? 0) + item.amount);
  };
  for (let s = 0; s < 36; s++) add(p.container.getItem(s));
  add(p.cursor.item);
  for (const n of Object.keys(nativeIndex(p).pages)) for (const item of savedPage(p, Number(n)).values()) add(item);
  for (const s of mc.spawned) add(s.item);
  return out;
}
const liveView = (/** @type {any} */ p) => p.container.slots.map((i) => (i ? `${i.typeId}:${i.amount}:${i.nameTag ?? ""}:${JSON.stringify(i.contents ?? null)}` : ""));
const structureIds = () => new Set(mc.structures.keys());
/** Structures this player's index doesn't reference that were not there before: leaks. */
const leaked = (/** @type {any} */ p, /** @type {Set<string>} */ known) => {
  const live = new Set(Object.values(nativeIndex(p).pages).map((r) => r.id));
  return [...mc.structures.keys()].filter((id) => !known.has(id) && !live.has(id));
};
/** Fills a page's storage slots, except the given free ones, with distinct stone stacks. */
const full = (/** @type {number[]} */ free = []) => Object.fromEntries(STORAGE_SLOTS.filter((s) => !free.includes(s)).map((s) => [s, stack("minecraft:stone", 64)]));

test("a chosen slot moves to an empty page whole, with its native data, under one committed index", () => {
  const p = joined();
  arrange(p, { 1: { 10: shulker("loot", "Loot"), 11: stack("minecraft:redstone", 64) } });
  const before = census(p);
  const known = structureIds();
  const result = pages.transferStacks(p, { slots: [10], to: 3 });
  assert.equal(result.ok, true, result.message);
  assert.deepEqual([result.stacks, result.items, result.reason], [1, 1, "manual"]);
  assert.equal(p.container.getItem(10), undefined);
  assert.equal(p.container.getItem(11).amount, 64, "the neighbor stays");
  const moved = savedPage(p, 3);
  assert.deepEqual([...moved.keys()], [9], "the first free slot of the empty page");
  assert.deepEqual(moved.get(9).contents, ["loot"]);
  assert.equal(moved.get(9).nameTag, "Loot");
  assert.deepEqual(census(p), before);
  const index = nativeIndex(p);
  assert.deepEqual([index.cur, index.pages[3].layout, index.pending], [1, 2, undefined]);
  assert.deepEqual(leaked(p, known), [], "no before/after image or replaced page image is left behind");
});

test("a moved stack tops up matching stacks first, then takes the next free slot", () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:redstone", 64) }, 2: { 9: stack("minecraft:redstone", 40), 10: stack("minecraft:emerald", 3) } });
  const before = census(p);
  const result = pages.transferStacks(p, { slots: [10], to: 2 });
  assert.equal(result.ok, true, result.message);
  const target = savedPage(p, 2);
  assert.equal(target.get(9).amount, 64);
  assert.equal(target.get(10).typeId, "minecraft:emerald");
  assert.deepEqual([target.get(11).typeId, target.get(11).amount], ["minecraft:redstone", 40]);
  assert.equal(p.container.getItem(10), undefined);
  assert.deepEqual(census(p), before);
});

test("a whole row moves in slot order as one all-or-nothing transaction", () => {
  const p = joined();
  const row = { 18: stack("minecraft:diamond", 3), 20: shulker("a"), 22: stack("minecraft:iron_ingot", 9), 24: shulker("b"), 26: stack("minecraft:gold_ingot", 2) };
  arrange(p, { 1: { ...row, 9: stack("minecraft:apple", 5), 27: stack("minecraft:cobblestone", 8) }, 4: { 9: stack("minecraft:stone", 1) } });
  const before = census(p);
  const saves = mc.saves;
  const result = pages.transferStacks(p, { slots: [18, 19, 20, 21, 22, 23, 24, 25, 26].filter((s) => p.container.getItem(s)), to: 4 });
  assert.equal(result.ok, true, result.message);
  assert.equal(mc.saves - saves, 3, "one page image plus the before and after inventory images, nothing else");
  for (let s = 18; s <= 26; s++) assert.equal(p.container.getItem(s), undefined);
  assert.equal(p.container.getItem(9).typeId, "minecraft:apple");
  assert.equal(p.container.getItem(27).amount, 8);
  const target = savedPage(p, 4);
  assert.deepEqual([...target.keys()], [9, 10, 11, 12, 13, 14]);
  assert.deepEqual([...target.values()].map((i) => i.typeId), ["minecraft:stone", "minecraft:diamond", "minecraft:white_shulker_box", "minecraft:iron_ingot", "minecraft:white_shulker_box", "minecraft:gold_ingot"]);
  assert.deepEqual([target.get(11).contents, target.get(13).contents], [["a"], ["b"]]);
  assert.deepEqual(census(p), before);
});

test("a destination without room rejects the move before anything is saved or cleared", () => {
  const p = joined();
  arrange(p, { 1: { 18: stack("minecraft:diamond", 3), 19: shulker("a"), 20: shulker("b"), 21: stack("minecraft:iron_ingot", 9), 22: stack("minecraft:gold_ingot", 2) }, 2: full([9, 10]) });
  const before = census(p);
  const view = liveView(p);
  const index = p.getDynamicProperty("stash:native");
  const known = structureIds();
  const saves = mc.saves;
  const result = pages.transferStacks(p, { slots: [18, 19, 20, 21, 22], to: 2 });
  assert.deepEqual([result.ok, result.code, result.fit], [false, "no-room", 2]);
  assert.match(result.message, /Page #2 has room for 2 of 5 stacks.*Nothing was moved/);
  assert.deepEqual(liveView(p), view);
  assert.equal(p.getDynamicProperty("stash:native"), index);
  assert.equal(mc.saves, saves, "nothing was written");
  assert.deepEqual([...structureIds()].filter((id) => !known.has(id)), []);
  assert.deepEqual(census(p), before);
});

test("partial mode moves what fits and reports the exact leftovers", () => {
  const p = joined();
  arrange(p, { 1: { 18: stack("minecraft:redstone", 64), 19: shulker("a"), 20: shulker("b") }, 2: { ...full([11]), 9: stack("minecraft:redstone", 50) } });
  const before = census(p);
  const result = pages.transferStacks(p, { slots: [18, 19, 20], to: 2, partial: true });
  assert.equal(result.ok, true, result.message);
  // 14 redstone top up page 2's stack; the other 50 take the only free slot; both shulker boxes stay put.
  assert.deepEqual([result.stacks, result.items], [1, 64]);
  assert.deepEqual(result.left, [{ slot: 19, amount: 1 }, { slot: 20, amount: 1 }]);
  assert.deepEqual([p.container.getItem(19).contents, p.container.getItem(20).contents], [["a"], ["b"]]);
  assert.equal(p.container.getItem(18), undefined);
  assert.equal(savedPage(p, 2).get(9).amount, 64);
  assert.equal(savedPage(p, 2).get(11).amount, 50);
  assert.deepEqual(census(p), before);
  const none = pages.transferStacks(p, { slots: [19], to: 2, partial: true });
  assert.deepEqual([none.ok, none.code], [false, "no-room"]);
});

test("partial mode keeps the remainder of a split stack with its metadata", () => {
  const p = joined();
  const arrows = stack("minecraft:tipped_arrow", 40);
  arrows.contents = ["poison"];
  arrows.nameTag = "Venom";
  const held = Object.assign(stack("minecraft:tipped_arrow", 50), { contents: ["poison"], nameTag: "Venom" });
  arrange(p, { 1: { 18: arrows }, 2: { ...full([]), 9: held } });
  const before = census(p);
  const result = pages.transferStacks(p, { slots: [18], to: 2, partial: true });
  assert.equal(result.ok, true, result.message);
  assert.deepEqual([result.stacks, result.items, result.left], [1, 14, [{ slot: 18, amount: 26 }]]);
  const rest = p.container.getItem(18);
  assert.deepEqual([rest.amount, rest.contents, rest.nameTag], [26, ["poison"], "Venom"]);
  assert.equal(savedPage(p, 2).get(9).amount, 64);
  assert.deepEqual(census(p), before);
});

test("a rejected or stale request never changes the inventory: same page, bad slots, bad pages, changed item", () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:diamond", 4), 18: shulker("a") } });
  const view = liveView(p);
  const index = p.getDynamicProperty("stash:native");
  const saves = mc.saves;
  const codes = (/** @type {any} */ req) => {
    const r = pages.transferStacks(p, req);
    assert.equal(r.ok, false);
    return r.code;
  };
  assert.equal(codes({ slots: [10], to: 1 }), "same-page");
  assert.equal(codes({ slots: [10], to: 6 }), "invalid", "page 6 of 5 doesn't exist");
  assert.equal(codes({ slots: [10], to: 0 }), "invalid");
  assert.equal(codes({ slots: [10], to: 2.5 }), "invalid");
  assert.equal(codes({ slots: [], to: 2 }), "invalid");
  assert.equal(codes({ slots: [10, 10], to: 2 }), "invalid", "a slot twice");
  assert.equal(codes({ slots: [0], to: 2 }), "invalid", "the hotbar is shared by every page");
  assert.equal(codes({ slots: [16], to: 2 }), "invalid", "the page buttons stay");
  assert.equal(codes({ slots: [36], to: 2 }), "invalid");
  assert.equal(codes({ slots: [11], to: 2 }), "empty");
  const sig = storage.signature(p.container.getItem(10));
  p.container.getItem(10).amount = 3;
  assert.equal(codes({ slots: [10], to: 2, expect: new Map([[10, sig]]) }), "stale", "the stack changed after the menu showed it");
  assert.equal(codes({ slots: [10, 18], to: 2, expect: new Map([[10, storage.signature(p.container.getItem(10))]]) }), "stale", "a slot the menu never listed");
  p.container.getItem(10).amount = 4;
  assert.deepEqual(liveView(p), view);
  assert.equal(p.getDynamicProperty("stash:native"), index);
  assert.equal(mc.saves, saves);
});

test("only the page's own 24 slots ever change: hotbar, cursor, page buttons and other controls survive", () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:diamond", 4) } });
  p.container.setItem(0, shulker("hotbar"));
  p.container.setItem(8, stack("minecraft:bread", 12));
  p.cursor.item = stack("minecraft:emerald", 9);
  const buttons = BUTTON_SLOTS.map((s) => p.container.getItem(s).nameTag);
  const result = pages.transferStacks(p, { slots: [10], to: 5 });
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(p.container.getItem(0).contents, ["hotbar"]);
  assert.equal(p.container.getItem(8).amount, 12);
  assert.deepEqual([p.cursor.item.typeId, p.cursor.item.amount], ["minecraft:emerald", 9]);
  assert.deepEqual(BUTTON_SLOTS.map((s) => p.container.getItem(s).nameTag), buttons);
  assert.deepEqual(BUTTON_SLOTS.map((s) => p.container.getItem(s).typeId), [BTN_PREV, BTN_MENU, BTN_NEXT]);
});

test("a slot-locked stack is refused, while named, kept and inventory-locked items travel intact", () => {
  const p = joined();
  const pinned = stack("minecraft:compass");
  pinned.lockMode = "slot";
  const charm = shulker("charm", "Charm");
  charm.lockMode = "inventory";
  charm.keepOnDeath = true;
  charm.setLore(["§7rare"]);
  arrange(p, { 1: { 10: pinned, 11: charm } });
  const refused = pages.transferStacks(p, { slots: [10, 11], to: 2 });
  assert.deepEqual([refused.ok, refused.code], [false, "slot-locked"]);
  assert.equal(p.container.getItem(10).lockMode, "slot");
  assert.equal(pages.transferStacks(p, { slots: [11], to: 2 }).ok, true);
  const back = savedPage(p, 2).get(9);
  assert.deepEqual([back.nameTag, back.lockMode, back.keepOnDeath, back.lore, back.contents], ["Charm", "inventory", true, ["§7rare"], ["charm"]]);
});

test("enchanted, damaged, potion, bundle, arrow and property-carrying stacks keep every native detail", () => {
  const p = joined();
  const pick = stack("minecraft:diamond_pickaxe");
  pick.nameTag = "Digger";
  pick.setLore(["fast"]);
  pick.damage = 12;
  pick.enchants.push({ id: "efficiency", level: 5 });
  pick.setDynamicProperty("owner", "me");
  const potion = stack("minecraft:potion");
  potion.contents = ["swiftness"];
  const bundle = stack("minecraft:bundle");
  bundle.contents = ["3 arrows", "a map"];
  const arrows = stack("minecraft:tipped_arrow", 12);
  arrows.contents = ["poison"];
  arrange(p, { 1: { 10: pick, 11: potion, 12: bundle, 13: arrows } });
  const before = census(p);
  const result = pages.transferStacks(p, { slots: [10, 11, 12, 13], to: 2 });
  assert.equal(result.ok, true, result.message);
  const target = [...savedPage(p, 2).values()];
  assert.deepEqual(target.map((i) => i.typeId), ["minecraft:diamond_pickaxe", "minecraft:potion", "minecraft:bundle", "minecraft:tipped_arrow"]);
  const [a, b, c, d] = target;
  assert.deepEqual([a.nameTag, a.lore, a.damage, a.enchants, a.props.get("owner")], ["Digger", ["fast"], 12, [{ id: "efficiency", level: 5 }], "me"]);
  assert.deepEqual([b.contents, c.contents, d.contents, d.amount], [["swiftness"], ["3 arrows", "a map"], ["poison"], 12]);
  assert.deepEqual(census(p), before);
  // They come back exactly as they were when the page is opened.
  assert.equal(switchPage(p, 2), true);
  assert.deepEqual([p.container.getItem(9).props.get("owner"), p.container.getItem(10).contents, p.container.getItem(11).contents], ["me", ["swiftness"], ["3 arrows", "a map"]]);
});

test("an unreadable item aborts the move with the inventory intact", () => {
  const p = joined();
  const pick = stack("minecraft:diamond_pickaxe");
  pick.damage = 77;
  arrange(p, { 1: { 10: pick } });
  const view = liveView(p);
  mc.metadataThrow.add(pick.typeId);
  try {
    const r = pages.transferStacks(p, { slots: [10], to: 2 });
    assert.deepEqual([r.ok, r.code], [false, "failed"]);
  } finally {
    mc.metadataThrow.clear();
  }
  assert.deepEqual(liveView(p), view);
  assert.equal(p.container.getItem(10).damage, 77);
});

test("pages the player no longer has, or has turned off, can't be moved to or from", () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:diamond", 4) }, 4: { 9: stack("minecraft:stone", 1) } });
  const all = mc.players;
  mc.players = [p];
  try {
    mc.pages = 3;
    assert.deepEqual(["invalid"], [pages.transferStacks(p, { slots: [10], to: 4 }).code]);
    assert.equal(pages.transferStacks(p, { slots: [10], to: 3 }).ok, true, "page 3 still exists");
    mc.pages = 5;
    arrange(p, {});
    mc.prefs.set(`${p.id}:invOff`, true);
    assert.equal(pages.transferStacks(p, { slots: [18], to: 2 }).ok, false);
    assert.equal(pages.transferStacks(p, { slots: [18], to: 2 }).code, "invalid", "with the extra pages off there is no other page");
  } finally {
    mc.pages = 5;
    mc.prefs.delete(`${p.id}:invOff`);
    mc.players = all;
  }
});

test("injected failures at every step leave the source, the destination page and the index unchanged", () => {
  /** @type {Array<[string, number, string, (p: any) => (() => void)]>} label, destination page, the refusal, the injection */
  const cases = [
    ["snapshot write", 2, "failed", () => { mc.failSave = true; return () => { mc.failSave = false; }; }],
    ["snapshot restore while verifying the new images", 3, "failed", () => { mc.failLoad = true; return () => { mc.failLoad = false; }; }],
    ["reading the destination page", 2, "unreadable", () => { mc.failLoad = true; return () => { mc.failLoad = false; }; }],
    ["a live slot write after the first", 2, "failed", (p) => {
      const original = p.container.setItem.bind(p.container);
      let calls = 0;
      p.container.setItem = (s, item) => {
        if (++calls === 2) throw new Error("injected inventory write failure");
        original(s, item);
      };
      return () => { p.container.setItem = original; };
    }],
    ["the final index write", 2, "failed", (p) => {
      const original = p.setDynamicProperty.bind(p);
      let calls = 0;
      p.setDynamicProperty = (k, v) => {
        if (k === "stash:native" && ++calls === 2) throw new Error("injected index write failure");
        original(k, v);
      };
      return () => { p.setDynamicProperty = original; };
    }],
  ];
  for (const [label, to, code, inject] of cases) {
    const p = joined();
    arrange(p, { 1: { 18: stack("minecraft:diamond", 3), 19: shulker("a"), 20: stack("minecraft:iron_ingot", 9) }, 2: { 9: stack("minecraft:emerald", 2) } });
    const before = census(p);
    const view = liveView(p);
    const known = structureIds();
    const targetBefore = [...savedPage(p, to).keys()];
    const restore = inject(p);
    let result;
    try {
      result = pages.transferStacks(p, { slots: [18, 19, 20], to });
    } finally {
      restore();
    }
    assert.equal(result.ok, false, label);
    assert.equal(result.code, code, label);
    assert.deepEqual(liveView(p), view, `${label}: source`);
    assert.deepEqual([...savedPage(p, to).keys()], targetBefore, `${label}: destination`);
    assert.deepEqual(census(p), before, label);
    assert.equal(nativeIndex(p).pending, undefined, label);
    assert.deepEqual(leaked(p, known), [], `${label}: no image left behind`);
    // The same move works afterwards.
    assert.equal(pages.transferStacks(p, { slots: [18, 19, 20], to }).ok, true, `${label}: retry`);
    assert.deepEqual(census(p), before, `${label}: retry totals`);
  }
});

test("a failed rollback quarantines the images, refuses more moves and survives a script restart", async () => {
  const p = joined();
  arrange(p, { 1: { 18: stack("minecraft:diamond", 3), 19: shulker("a"), 20: stack("minecraft:iron_ingot", 9) } });
  const original = p.container.setItem.bind(p.container);
  let calls = 0;
  p.container.setItem = (s, item) => {
    if (++calls >= 2) throw new Error("persistent inventory write failure");
    original(s, item);
  };
  const result = pages.transferStacks(p, { slots: [18, 19, 20], to: 2 });
  p.container.setItem = original;
  assert.deepEqual([result.ok, result.code], [false, "recovery"]);
  const pending = nativeIndex(p).pending;
  assert.ok(mc.structures.has(pending.before.id) && mc.structures.has(pending.after.id), "both durable images are kept");
  const drops = mc.spawned.length;
  const listeners = structuredClone(Object.fromEntries(Object.entries(mc.after).map(([k, v]) => [k, v.length])));
  const intervals = mc.intervals.length;
  try {
    const restarted = await import(dataUrl(source + "\n// fresh script heap after a failed transfer"));
    assert.equal(storage.inventoryReady(p), false);
    assert.equal(restarted.transferStacks(p, { slots: [19], to: 3 }).code, "recovery");
    assert.equal(restarted.switchPage(p, 2), false);
  } finally {
    mc.intervals.length = intervals;
    for (const k of Object.keys(mc.after)) mc.after[k].length = listeners[k] ?? 0;
  }
  assert.equal(mc.spawned.length, drops, "nothing dropped on the ground");
});

/** A stuck journal on `p`, an operator standing on open ground, and the floor around them as air over stone. */
function stuck(extra = {}) {
  const p = joined();
  arrange(p, { 1: { 18: stack("minecraft:diamond", 3), 19: shulker("a"), 20: stack("minecraft:iron_ingot", 9), ...extra } });
  const original = p.container.setItem.bind(p.container);
  let calls = 0;
  p.container.setItem = (s, item) => {
    if (++calls >= 2) throw new Error("persistent inventory write failure");
    original(s, item);
  };
  assert.equal(pages.transferStacks(p, { slots: [18, 19, 20], to: 2 }).code, "recovery");
  p.container.setItem = original;
  const op = visitor();
  op.commandPermissionLevel = 2;
  const dim = overworld();
  op.dimension = dim;
  op.location = { x: 10.5, y: 64, z: 10.5 };
  for (let x = 4; x <= 16; x++) for (let z = 4; z <= 16; z++) {
    dim.blocks.set(`${x},63,${z}`, { typeId: "minecraft:stone", isAir: false });
    dim.blocks.set(`${x},64,${z}`, { typeId: "minecraft:air", isAir: true, setType(t) { placeContainer(dim, { x, y: 64, z }, t); } });
  }
  return { p, op, dim };
}
const chestsOf = (dim) => [...dim.blocks.values()].filter((b) => b.typeId === "minecraft:chest");
/** The player lost everything they carried (the page buttons stay): every before-image stack is missing. */
const lose = (/** @type {any} */ p) => { for (let s = 0; s < 36; s++) if (!BUTTON_SLOTS.includes(s)) p.container.setItem(s, undefined); };
/** Every stack in every chest, as "kind:amount". */
const chestContents = (dim) => chestsOf(dim).flatMap((c) => c.getComponent("minecraft:inventory").container.slots.filter(Boolean).map((i) => `${i.typeId.replace("minecraft:", "")}:${i.amount}`)).sort();

test("F2 recover: only the pack's own buttons are left out; a real item in a reserved slot is exported", async () => {
  const { p, op, dim } = stuck({ 15: stack("minecraft:emerald", 2), 16: stack(BTN_MENU, 1), 17: stack(BTN_NEXT, 1) });
  for (const s of [15, 16, 17, 18, 19, 20]) p.container.setItem(s, undefined);
  mc.formResponses.set(op.id, [{ selection: 0 }]);
  const message = await pages.recoverInventory(op, p);
  assert.match(message, /Exported 4 stacks/, message);
  assert.match(message, /Nothing they still carry was copied/);
  const kinds = chestsOf(dim)[0].getComponent("minecraft:inventory").container.slots.filter(Boolean).map((i) => i.typeId);
  assert.ok(kinds.includes("minecraft:emerald"), "the real item in a reserved slot is kept");
  assert.ok(!kinds.includes(BTN_MENU) && !kinds.includes(BTN_NEXT), "no page button reaches a chest");
});

test("F2 recover: rechecks the operator and the exact journal after confirming", async () => {
  const a = stuck();
  mc.formResponses.set(a.op.id, [() => { a.op.commandPermissionLevel = 0; return { selection: 0 }; }]);
  assert.match(await pages.recoverInventory(a.op, a.p), /no longer available/);
  assert.equal(chestsOf(a.dim).length, 0);
  const b = stuck();
  mc.formResponses.set(b.op.id, [() => { b.op.isValid = false; return { selection: 0 }; }]);
  assert.match(await pages.recoverInventory(b.op, b.p), /no longer available/);
  const c = stuck();
  mc.formResponses.set(c.op.id, [() => {
    const s = JSON.parse(c.p.getDynamicProperty("stash:native"));
    s.pending = { ...s.pending, before: { ...s.pending.before, id: s.pending.before.id + "x" } };
    c.p.setDynamicProperty("stash:native", JSON.stringify(s));
    return { selection: 0 };
  }]);
  assert.match(await pages.recoverInventory(c.op, c.p), /changed while you were deciding/);
  assert.equal(chestsOf(c.dim).length, 0);
  const d = stuck();
  d.op.commandPermissionLevel = 0;
  assert.match(await pages.recoverInventory(d.op, d.p), /Only an operator/);
});

test("F2 recover: a started export is never made again from another dimension, and a stack taken from a filled chest is never put back", async () => {
  const { p, op, dim } = stuck();
  const set = p.setDynamicProperty.bind(p);
  set("stash:native", JSON.stringify({ ...JSON.parse(p.getDynamicProperty("stash:native")), pending: { ...nativeIndex(p).pending, out: { d: "minecraft:nether", p: [[5, 64, 5]] } } }));
  const other = storage.exportPending(op, p);
  assert.equal(other.ok, false);
  assert.match(other.message, /finish it there/);
  assert.equal(chestsOf(dim).length, 0, "no second set of chests");

  const r = stuck();
  const first = storage.exportPending(r.op, r.p);
  assert.equal(first.ok, true);
  const again = stuck();
  lose(again.p);
  const orig = again.p.setDynamicProperty.bind(again.p);
  let fail = true;
  again.p.setDynamicProperty = (k, v) => {
    if (fail && k === "stash:native" && !JSON.parse(v).pending) throw new Error("crash");
    orig(k, v);
  };
  assert.equal(storage.exportPending(again.op, again.p).ok, false);
  const chest = chestsOf(again.dim)[0];
  const box = chest.getComponent("minecraft:inventory").container;
  const keep = box.getItem(0);
  box.setItem(1, undefined);
  fail = false;
  assert.equal(storage.exportPending(again.op, again.p).ok, true);
  assert.equal(chestsOf(again.dim).length, 1, "the same chest is finished, not duplicated");
  assert.equal(box.getItem(0)?.typeId, keep?.typeId);
  assert.equal(box.getItem(1), undefined, "F4: the stack someone took out is not put back (that would be a second copy)");
  assert.ok(box.getItem(2), "the rest of the export is still there");
});

test("O18: an operator confirms, the before-image lands in chests once, opaque stacks intact", async () => {
  const { p, op, dim } = stuck();
  lose(p);
  const pending = nativeIndex(p).pending;
  mc.formResponses.set(op.id, [{ selection: 0 }]);
  const message = await pages.recoverInventory(op, p);
  assert.match(message, /Exported \d+ stacks into 1 chest/);
  const chests = chestsOf(dim);
  assert.equal(chests.length, 1);
  const stacks = chests[0].getComponent("minecraft:inventory").container.slots.filter(Boolean);
  const kinds = stacks.map((i) => i.typeId.replace("minecraft:", ""));
  for (const k of ["diamond", "iron_ingot", "white_shulker_box"]) assert.ok(kinds.includes(k), k);
  assert.deepEqual(stacks.find((i) => i.contents)?.contents, ["a"]);
  assert.equal(nativeIndex(p).pending, undefined, "journal cleared");
  assert.ok(!mc.structures.has(pending.before.id) && !mc.structures.has(pending.after.id));
  assert.equal(storage.pendingSummary(p), undefined);
  mc.formResponses.set(op.id, [{ selection: 0 }]);
  assert.match(await pages.recoverInventory(op, p), /nothing waiting/);
  assert.equal(chestsOf(dim).length, 1, "a second run copies nothing");
});

test("O18: canceling, or a journal that changed, exports nothing", async () => {
  const { p, op, dim } = stuck();
  mc.formResponses.set(op.id, [{ selection: 1 }]);
  assert.match(await pages.recoverInventory(op, p), /Canceled/);
  mc.formResponses.set(op.id, [() => { const s = JSON.parse(p.getDynamicProperty("stash:native")); delete s.pending; p.setDynamicProperty("stash:native", JSON.stringify(s)); return { selection: 0 }; }]);
  assert.match(await pages.recoverInventory(op, p), /changed while you were deciding/);
  assert.equal(chestsOf(dim).length, 0);
});

test("O18: never overwrites blocks, and a crash after the chests were filled finishes without a second copy", async () => {
  const { p, op, dim } = stuck();
  for (const b of dim.blocks.values()) if (b.isAir) b.isAir = false, b.typeId = "minecraft:dirt";
  assert.equal(storage.exportPending(op, p).ok, false, "no room, nothing overwritten");
  assert.equal(chestsOf(dim).length, 0);
  assert.ok(nativeIndex(p).pending, "journal kept");

  const fresh = stuck();
  const set = fresh.p.setDynamicProperty.bind(fresh.p);
  let failClear = true;
  fresh.p.setDynamicProperty = (k, v) => {
    if (failClear && k === "stash:native" && !JSON.parse(v).pending) throw new Error("injected crash before the journal cleared");
    set(k, v);
  };
  assert.equal(storage.exportPending(fresh.op, fresh.p).ok, false);
  assert.equal(chestsOf(fresh.dim).length, 1);
  assert.ok(nativeIndex(fresh.p).pending?.out, "the chest spots were journaled first");
  failClear = false;
  assert.equal(storage.exportPending(fresh.op, fresh.p).ok, true);
  assert.equal(chestsOf(fresh.dim).length, 1, "the retry recognized the filled chest");
  assert.equal(nativeIndex(fresh.p).pending, undefined);
});

test("F4 recover: only what the player no longer carries is exported, partial stacks included, and the operator sees the list", async () => {
  const { p, op, dim } = stuck();
  // After the failed move the player still has the shulker box and 9 iron; they used 5 of the iron since.
  assert.equal(p.container.getItem(18), undefined, "the diamonds are the stack the failed move lost");
  p.container.getItem(20).amount = 4;
  mc.formResponses.set(op.id, [{ selection: 0 }]);
  const message = await pages.recoverInventory(op, p);
  assert.match(message, /Exported 2 stacks/, message);
  const shown = mc.forms.filter((f) => f.player === op).at(-1).form.text;
  assert.match(shown, /3 x Diamond/, shown);
  assert.match(shown, /5 x Iron ingot/, shown);
  assert.doesNotMatch(shown, /shulker/i, "a stack they still carry is not listed");
  assert.deepEqual(chestContents(dim), ["diamond:3", "iron_ingot:5"], "nothing they still carry exists twice");
  assert.equal(nativeIndex(p).pending, undefined, "journal cleared");
});

test("F4 recover: a player who still carries everything gets no chest, only a cleared journal", async () => {
  const { p, op, dim } = stuck();
  p.container.setItem(18, stack("minecraft:diamond", 3));
  const pending = nativeIndex(p).pending;
  mc.formResponses.set(op.id, [{ selection: 0 }]);
  const message = await pages.recoverInventory(op, p);
  assert.match(message, /nothing was exported/, message);
  assert.equal(chestsOf(dim).length, 0);
  assert.equal(nativeIndex(p).pending, undefined);
  assert.ok(!mc.structures.has(pending.before.id) && !mc.structures.has(pending.after.id), "both images discarded");
});

test("F4 recover: an inventory that changes while the operator decides exports nothing", async () => {
  const { p, op, dim } = stuck();
  mc.formResponses.set(op.id, [() => { p.container.setItem(18, stack("minecraft:diamond", 3)); return { selection: 0 }; }]);
  assert.match(await pages.recoverInventory(op, p), /changed while you were deciding/);
  assert.equal(chestsOf(dim).length, 0);
  assert.ok(nativeIndex(p).pending, "journal kept");
});

test("F4 recover: the confirm form is retried while the operator's chat is still closing (UserBusy)", async () => {
  const { p, op, dim } = stuck();
  mc.formResponses.set(op.id, [{ canceled: true, cancelationReason: "UserBusy" }, { canceled: true, cancelationReason: "UserBusy" }, { selection: 0 }]);
  const run = pages.recoverInventory(op, p);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setImmediate(r));
    advance(1);
  }
  const message = await run;
  assert.match(message, /Exported 1 stacks/, message);
  assert.equal(mc.forms.filter((f) => f.player === op).length, 3, "shown again after each UserBusy");
  assert.deepEqual(chestContents(dim), ["diamond:3"]);
});

test("F4 recover: several chests, a failure part way and a re-run place every stack exactly once", async () => {
  /** @type {Record<number, any>} */
  const extra = {};
  for (let s = 0; s < 36; s++) if (!BUTTON_SLOTS.includes(s) && ![18, 19, 20].includes(s)) extra[s] = stack(s % 2 ? "minecraft:emerald" : "minecraft:gold_ingot", s + 1);
  const { p, op, dim } = stuck(extra);
  lose(p);
  const planned = 33;
  const original = ChestBox.prototype.setItem;
  let calls = 0;
  ChestBox.prototype.setItem = function (s, item) {
    if (++calls === 30) throw new Error("injected chest write failure");
    original.call(this, s, item);
  };
  let first;
  try {
    first = storage.exportPending(op, p);
  } finally {
    ChestBox.prototype.setItem = original;
  }
  assert.equal(first.ok, false, first.message);
  const out = nativeIndex(p).pending?.out;
  assert.equal(out?.x?.length, planned, "the plan is journaled");
  assert.equal(out?.f?.length, 29, "every stack placed before the failure is recorded");
  const [c1, c2] = chestsOf(dim).map((c) => c.getComponent("minecraft:inventory").container);
  assert.ok(c1 && c2, "two chests");
  // Someone takes a stack out of each chest before the operator runs it again.
  const took = [c1.getItem(0), c2.getItem(1)];
  c1.setItem(0, undefined);
  c2.setItem(1, undefined);
  // The player picks up more of a kind meanwhile: a started export keeps its journaled plan.
  p.container.setItem(0, stack("minecraft:gold_ingot", 64));
  const second = storage.exportPending(op, p);
  assert.equal(second.ok, true, second.message);
  assert.equal(chestsOf(dim).length, 2, "no third chest");
  assert.equal(c1.getItem(0), undefined, "a taken stack is not put back");
  assert.equal(c2.getItem(1), undefined, "a taken stack is not put back");
  const placed = chestContents(dim).length + took.length;
  assert.equal(placed, planned, "every planned stack was placed exactly once");
  assert.equal(nativeIndex(p).pending, undefined);
  assert.equal(storage.exportPending(op, p).ok, false, "a third run finds nothing");
  assert.equal(chestsOf(dim).length, 2);
});

test("a completed move survives losing the script heap and is found again on its page", async () => {
  const p = joined();
  arrange(p, { 1: { 10: shulker("kept") } });
  assert.equal(pages.transferStacks(p, { slots: [10], to: 4 }).ok, true);
  const after = structuredClone(Object.fromEntries(Object.entries(mc.after).map(([k, v]) => [k, v.length])));
  const intervals = mc.intervals.length;
  try {
    const restarted = await import(dataUrl(source + "\n// fresh script heap after a completed transfer"));
    assert.equal(restarted.switchPage(p, 4), true);
    assert.deepEqual(p.container.getItem(9).contents, ["kept"]);
  } finally {
    mc.intervals.length = intervals;
    for (const k of Object.keys(mc.after)) mc.after[k].length = after[k] ?? 0;
  }
});

test("moving stacks adds no script events, no timers and no later saves", () => {
  const p = joined();
  const all = mc.players;
  mc.players = [p];
  try {
    arrange(p, { 1: { 10: stack("minecraft:diamond", 4), 11: stack("minecraft:redstone", 9) } });
    advance(60);
    const events = mc.events.length;
    const intervals = mc.intervals.length;
    const listeners = Object.values(mc.after).reduce((n, l) => n + l.length, 0);
    assert.equal(pages.transferStacks(p, { slots: [10, 11], to: 2 }).ok, true);
    assert.equal(mc.events.length, events, "a move is not a pickup, reward or any other announcement");
    assert.equal(mc.intervals.length, intervals);
    assert.equal(Object.values(mc.after).reduce((n, l) => n + l.length, 0), listeners);
    const [saves, loads] = [mc.saves, mc.loads];
    advance(300);
    assert.equal(mc.saves, saves, "idle after the move: no snapshot is written");
    assert.equal(mc.loads, loads, "idle after the move: no snapshot is read");
    assert.equal(savedPage(p, 2).size, 2, "and nothing was auto-stored back or on");
  } finally {
    mc.players = all;
  }
});

test("the commit hook runs once before the commit, can extend the one index, and aborts the move by throwing", () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:diamond", 4) } });
  /** @type {any[]} */
  const seen = [];
  const ok = pages.transferStacks(p, {
    slots: [10],
    to: 2,
    reason: "route",
    decorate: (/** @type {any} */ next, /** @type {Map<number, any[]>} */ edits) => {
      seen.push([next.cur, [...edits.keys()], edits.get(2).map((e) => `${e.s}:${e.id}:${e.n}`)]);
      next.index = { 2: ["minecraft:diamond"] };
    },
  });
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.reason, "route");
  assert.deepEqual(seen, [[1, [2], ["9:minecraft:diamond:4"]]]);
  assert.deepEqual(nativeIndex(p).index, { 2: ["minecraft:diamond"] }, "stored in the same single write");
  assert.equal(switchPage(p, 2), true, "an index with extra fields still pages normally");
  assert.equal(switchPage(p, 1), true);
  p.container.setItem(10, stack("minecraft:emerald", 1));
  const view = liveView(p);
  const index = p.getDynamicProperty("stash:native");
  const bad = pages.transferStacks(p, { slots: [10], to: 3, decorate: () => { throw new Error("index writer failed"); } });
  assert.deepEqual([bad.ok, bad.code], [false, "failed"]);
  assert.deepEqual(liveView(p), view);
  assert.equal(p.getDynamicProperty("stash:native"), index);
});

test("pages move between each other, and into the active page, with the same guarantees", () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:apple", 2) }, 2: { 9: stack("minecraft:diamond", 4), 10: shulker("s") }, 3: full([9]) });
  const before = census(p);
  const known = structureIds();
  const toSaved = pages.transferStacks(p, { from: 2, slots: [9, 10], to: 3 });
  assert.equal(toSaved.ok, false);
  assert.equal(toSaved.code, "no-room");
  const one = pages.transferStacks(p, { from: 2, slots: [10], to: 3 });
  assert.equal(one.ok, true, one.message);
  assert.deepEqual([savedPage(p, 3).get(9).contents, savedPage(p, 2).size], [["s"], 1]);
  const live = pages.transferStacks(p, { from: 2, slots: [9], to: 1 });
  assert.equal(live.ok, true, live.message);
  assert.deepEqual([p.container.getItem(9).typeId, p.container.getItem(10).typeId], ["minecraft:diamond", "minecraft:apple"]);
  assert.equal(savedPage(p, 2).size, 0);
  assert.deepEqual(census(p), before);
  assert.deepEqual(leaked(p, known), []);
});

test("a target page that still holds legacy JSON is read, merged and shadowed exactly once", () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:redstone", 20) } });
  p.setDynamicProperty("stash:page:2", JSON.stringify([{ s: 10, id: "minecraft:redstone", n: 50 }, { s: 11, id: "minecraft:diamond_pickaxe", n: 1, dmg: 87, ench: [["efficiency", 4]] }]));
  const result = pages.transferStacks(p, { slots: [10], to: 2 });
  assert.equal(result.ok, true, result.message);
  const target = savedPage(p, 2);
  assert.deepEqual([...target.values()].map((i) => [i.typeId, i.amount]), [["minecraft:redstone", 64], ["minecraft:diamond_pickaxe", 1], ["minecraft:redstone", 6]]);
  assert.equal(target.get(10).damage, 87);
  assert.equal(switchPage(p, 2), true);
  assert.equal(switchPage(p, 3), true);
  assert.equal(switchPage(p, 2), true);
  assert.equal(filled(p).length, 3, "the legacy JSON never resurrects a second copy");
});

test("an old active layout is migrated before a move, and a pending recovery blocks it", () => {
  const p = makePlayer();
  p.setDynamicProperty("stash:native", JSON.stringify({ v: 1, cur: 1, pages: {} }));
  for (const slot of OLD_STORAGE) p.container.setItem(slot, stack("minecraft:stone", 1 + (slot % 7)));
  p.container.setItem(9, stack(BTN_PREV));
  p.container.setItem(13, stack(BTN_MENU));
  p.container.setItem(17, stack(BTN_NEXT));
  const before = census(p);
  const result = pages.transferStacks(p, { slots: [STORAGE_SLOTS[0]], to: 2 });
  assert.equal(result.ok, true, result.message);
  assert.equal(nativeIndex(p).layout, 2);
  assert.deepEqual(census(p), before);
  const state = nativeIndex(p);
  p.setDynamicProperty("stash:native", JSON.stringify({ ...state, pending: { before: state.pages[2], after: state.pages[2] } }));
  assert.equal(pages.transferStacks(p, { slots: [STORAGE_SLOTS[1]], to: 3 }).code, "recovery");
});

/** A form answer that picks the first button starting with this text. */
const pick = (/** @type {string} */ text, /** @type {() => void} */ meanwhile) => (/** @type {any} */ form) => {
  meanwhile?.();
  const selection = form.buttons.findIndex((/** @type {string} */ b) => b.startsWith(text));
  assert.ok(selection >= 0, `a "${text}" button in ${JSON.stringify(form.buttons)}`);
  return { canceled: false, selection };
};
const barNow = (/** @type {any} */ p) => p.bar.at(-1);

test("the Move to page menu: choose a row, choose a page, and the row moves", async () => {
  const p = joined();
  arrange(p, { 1: { 18: stack("minecraft:diamond", 3), 21: shulker("a"), 27: stack("minecraft:apple", 4) }, 3: { 9: stack("minecraft:stone", 1) } });
  const before = census(p);
  const all = mc.players;
  mc.players = [p];
  try {
    mc.formResponses.set(p.id, [pick("Whole row 2"), pick("Page #3")]);
    await pages.openMoveMenu(p);
  } finally {
    mc.players = all;
  }
  const [what, where] = mc.forms.filter((e) => e.player === p).slice(-2).map((e) => e.form);
  assert.match(what.heading, /Move to page/);
  assert.deepEqual(what.buttons.filter((b) => /^Whole row/.test(b)).map((b) => b.split("\n")[0]), ["Whole row 2: 2 stacks", "Whole row 3: 1 stack"]);
  assert.ok(what.buttons.some((b) => /^Diamond x3\n.*Row 2, spot 1/.test(b)), JSON.stringify(what.buttons));
  assert.match(where.buttons.find((b) => b.startsWith("Page #3")), /22 of 24 slots free|23 of 24 slots free/);
  assert.ok(!where.buttons.some((b) => b.startsWith("Page #1")), "the active page is not a destination");
  assert.equal(p.container.getItem(18), undefined);
  assert.equal(p.container.getItem(21), undefined);
  assert.equal(p.container.getItem(27).amount, 4);
  assert.deepEqual([...savedPage(p, 3).values()].map((i) => i.typeId), ["minecraft:stone", "minecraft:diamond", "minecraft:white_shulker_box"]);
  assert.match(barNow(p), /Moved 2 stacks \(4 items\) to Page #3/);
  assert.deepEqual(census(p), before);
});

test("the Move to page menu: a single stack, and a destination that can't take it says so", async () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:diamond", 3) }, 2: full() });
  const view = liveView(p);
  const all = mc.players;
  mc.players = [p];
  try {
    mc.formResponses.set(p.id, [pick("Diamond x3"), pick("Page #2")]);
    await pages.openMoveMenu(p);
  } finally {
    mc.players = all;
  }
  assert.match(barNow(p), /Page #2 has room for 0 of 1 stack\. Nothing was moved/);
  assert.deepEqual(liveView(p), view);
});

test("the Move to page menu does nothing for a canceled form, Back, or an empty page", async () => {
  const p = joined();
  const all = mc.players;
  mc.players = [p];
  try {
    const saves = mc.saves;
    await pages.openMoveMenu(p);
    assert.match(barNow(p), /Nothing on this page to move/);
    arrange(p, { 1: { 10: stack("minecraft:diamond", 3) } });
    const view = liveView(p);
    mc.formResponses.set(p.id, [{ canceled: true }]);
    await pages.openMoveMenu(p);
    mc.formResponses.set(p.id, [pick("Whole row 1"), { canceled: true }]);
    await pages.openMoveMenu(p);
    mc.formResponses.set(p.id, [pick("Whole row 1"), pick("Back")]);
    await pages.openMoveMenu(p);
    assert.deepEqual(liveView(p), view);
    assert.equal(mc.saves, saves, "nothing was written");
  } finally {
    mc.players = all;
  }
});

test("an item the menu can't read is reported to the player instead of a silent failure", async () => {
  const p = joined();
  const pick = stack("minecraft:diamond_pickaxe");
  arrange(p, { 1: { 10: pick } });
  const view = liveView(p);
  const formsBefore = mc.forms.length;
  const all = mc.players;
  mc.players = [p];
  mc.metadataThrow.add(pick.typeId);
  try {
    await pages.openMoveMenu(p);
  } finally {
    mc.metadataThrow.clear();
    mc.players = all;
  }
  assert.match(barNow(p), /Move to page isn't available/);
  assert.deepEqual(liveView(p), view);
  assert.equal(mc.forms.length, formsBefore, "no form was built from a half-read page");
});

for (const [label, meanwhile] of /** @type {Array<[string, (p: any) => void]>} */ ([
  ["dies", (p) => { fire("entityDie", { deadEntity: p }); }],
  ["leaves", (p) => { p.isValid = false; fire("playerLeave", { playerId: p.id }); }],
  ["changes dimension", (p) => { fire("playerDimensionChange", { player: p, fromDimension: p.dimension, toDimension: { id: "minecraft:nether" } }); }],
  ["respawns", (p) => { fire("playerSpawn", { player: p }); }],
  ["switches page", (p) => { assert.equal(switchPage(p, 2), true); }],
])) {
  for (const step of [1, 2]) {
    test(`a player who ${label} while the Move to page menu's form ${step} is open moves nothing`, async () => {
      const p = joined();
      arrange(p, { 1: { 10: stack("minecraft:diamond", 3) } });
      const all = mc.players;
      mc.players = [p];
      const view = liveView(p);
      const index = p.getDynamicProperty("stash:native");
      try {
        mc.formResponses.set(p.id, [pick("Whole row 1", step === 1 ? () => meanwhile(p) : undefined), pick("Page #3", step === 2 ? () => meanwhile(p) : undefined)]);
        await pages.openMoveMenu(p);
        if (label === "switches page") assert.equal(curPage(p), 2, "the switch itself happened");
        else assert.deepEqual(liveView(p), view);
        if (label !== "switches page") assert.equal(p.getDynamicProperty("stash:native"), index);
        assert.equal(savedPage(p, 3).size, 0);
        assert.equal(savedPage(p, 1).size, label === "switches page" ? 1 : 0);
      } finally {
        p.isValid = true;
        fire("playerSpawn", { player: p });
        mc.players = all;
      }
    });
  }
}

test("a stack that changed while the menu was open is not moved", async () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:diamond", 3), 18: stack("minecraft:iron_ingot", 5) } });
  const all = mc.players;
  mc.players = [p];
  try {
    mc.formResponses.set(p.id, [pick("Whole row 1"), pick("Page #2", () => p.container.getItem(10).amount--)]);
    await pages.openMoveMenu(p);
    assert.match(barNow(p), /changed since the menu showed it/);
    assert.equal(p.container.getItem(10).amount, 2);
    assert.equal(savedPage(p, 2).size, 0);
  } finally {
    mc.players = all;
  }
});

test("a destination that filled up while the menu was open rejects the whole row", async () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:diamond", 3), 18: stack("minecraft:iron_ingot", 5), 19: stack("minecraft:gold_ingot", 2) }, 4: full([9]) });
  const all = mc.players;
  mc.players = [p];
  try {
    // While page 4 is offered with one free slot, another move takes that slot.
    mc.formResponses.set(p.id, [pick("Whole row 2"), pick("Page #4", () => assert.equal(pages.transferStacks(p, { slots: [10], to: 4 }).ok, true))]);
    await pages.openMoveMenu(p);
    assert.match(barNow(p), /Page #4 has room for 0 of 2 stacks\. Nothing was moved/);
    assert.deepEqual([p.container.getItem(18).amount, p.container.getItem(19).amount], [5, 2]);
    assert.equal(savedPage(p, 4).get(9).typeId, "minecraft:diamond");
  } finally {
    mc.players = all;
  }
});

test("the inventory menu offers Move to page next to the scan, and keeps its other buttons aligned", async () => {
  const p = joined();
  const all = mc.players;
  mc.players = [p];
  let sorted = 0;
  pages.initPages({ bar: (player, text) => player.bar.push(text), sort: () => sorted++, stash() {} });

  // ---------------------------------------------------------------------------
  // O72: sneak-tapping a container (main.js's playerInteractWithBlock handler, driven with real event objects)
  // ---------------------------------------------------------------------------

  const settle = () => new Promise((r) => setImmediate(r));
  try {
    arrange(p, { 1: { 10: stack("minecraft:diamond", 3) } });
    mc.formResponses.set(p.id, [pick("Move to page"), pick("Whole row 1"), pick("Page #2")]);
    await pages.openInvMenu(p);
    await settle();
    const menu = mc.forms.find((e) => e.player === p && /Expansive Inventory/.test(e.form.heading)).form;
    assert.deepEqual(menu.buttons.map((b) => b.split("\n")[0]).slice(-6), ["Scan all items across pages", "Fill earlier pages", "Move to page", "Sort this page", "Quick stack to nearby chests", "Inventory settings"]);
    assert.equal(savedPage(p, 2).get(9).typeId, "minecraft:diamond");
    mc.formResponses.set(p.id, [pick("Sort this page")]);
    await pages.openInvMenu(p);
    assert.equal(sorted, 1);
    mc.pages = 1;
    mc.forms.length = 0;
    await pages.openInvMenu(p);
    assert.ok(!mc.forms.at(-1).form.buttons.some((b) => b.startsWith("Move to page")), "a single page has nowhere to move to");
  } finally {
    mc.pages = 5;
    mc.players = all;
    pages.initPages({ bar: (player, text) => player.onScreenDisplay.setActionBar(text), sort() {}, stash() {} });
  }
});

// ---------------------------------------------------------------------------
// O17: the committed page-content index (item kinds and counts per saved page, tied to the page's snapshot id)
// ---------------------------------------------------------------------------

/** Records every structure id the model restores, so a test can tell which saved pages a call read. */
function recordPlaces() {
  const real = mc.server.world.structureManager.place;
  /** @type {string[]} */
  const ids = [];
  mc.server.world.structureManager.place = (id, ...rest) => {
    ids.push(id);
    return real(id, ...rest);
  };
  return { ids, stop: () => void (mc.server.world.structureManager.place = real) };
}
/** The ref ids of the pages a player has saved right now. */
const pageRefIds = (/** @type {any} */ p) => new Map(Object.entries(nativeIndex(p).pages).map(([n, r]) => [Number(n), r.id]));
/** What a page really holds, kind -> count, read from its snapshot. */
function truth(/** @type {any} */ p, /** @type {number} */ n) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const item of savedPage(p, n).values()) {
    const key = item.nameTag ? `${item.typeId}|${item.nameTag}` : item.typeId;
    out[key] = (out[key] ?? 0) + item.amount;
  }
  return out;
}
/** Every saved page's recorded index agrees with its snapshot, and none is recorded for a page that has no snapshot. */
function assertIndexExact(/** @type {any} */ p, /** @type {string} */ label = "") {
  const state = nativeIndex(p);
  for (const [n, ref] of Object.entries(state.pages)) {
    const got = storage.indexedKinds(state, Number(n));
    assert.ok(got, `${label} page ${n} is indexed`);
    assert.deepEqual(Object.fromEntries(got), truth(p, Number(n)), `${label} page ${n} index equals its snapshot`);
    assert.equal(state.idx[n].r, ref.id, `${label} page ${n} index is tied to its snapshot id`);
  }
  for (const n of Object.keys(state.idx ?? {})) assert.ok(state.pages[n], `${label} no index for page ${n} without a snapshot`);
}
const WANT_REDSTONE = { id: "minecraft:redstone", name: undefined, sameLore: (/** @type {string[]} */ lore) => lore.length === 0 };

test("O17: refill reads only the pages whose index lists the item (25 pages, one holder)", () => {
  mc.pages = 25;
  const p = joined();
  try {
    arrange(p, Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 2, { 9: stack(PAGE_ITEMS[1 + (i % 4)], 5) }])));
    arrange(p, { 17: { 9: stack("minecraft:redstone", 33) } });
    const known = new Map(pageRefIds(p));
    const watch = recordPlaces();
    try {
      const got = pages.refillFromPages(p, 0, WANT_REDSTONE);
      assert.deepEqual(got, { n: 33, page: 17 });
      const reads = watch.ids.filter((id) => [...known.values()].includes(id));
      assert.deepEqual(reads, [known.get(17)], "only the one candidate page was restored");
    } finally {
      watch.stop();
    }
    assertIndexExact(p, "after refill");
    assert.equal(p.container.getItem(0).amount, 33);
  } finally {
    mc.pages = 5;
  }
});

test("O17: a refill that finds nothing on 25 pages restores no page at all", () => {
  mc.pages = 25;
  const p = joined();
  try {
    arrange(p, Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 2, { 9: stack(PAGE_ITEMS[1 + (i % 4)], 5) }])));
    const watch = recordPlaces();
    const loads = mc.loads;
    const saves = mc.saves;
    try {
      assert.equal(pages.refillFromPages(p, 0, WANT_REDSTONE), undefined);
      assert.equal(watch.ids.length, 0, "no snapshot read");
      assert.equal(mc.loads, loads);
      assert.equal(mc.saves, saves, "and nothing written");
    } finally {
      watch.stop();
    }
    assert.equal(p.container.getItem(0), undefined);
  } finally {
    mc.pages = 5;
  }
});

test("O17: pages saved before the index existed still load, and the next write of a page indexes it", () => {
  const p = joined();
  arrange(p, { 2: { 9: stack("minecraft:redstone", 12), 10: stack("minecraft:emerald", 3) }, 3: { 9: stack("minecraft:iron_ingot", 7) } });
  const state = nativeIndex(p);
  delete state.idx;
  state.future = { keep: ["unknown fields survive"] };
  p.setDynamicProperty("stash:native", JSON.stringify(state));
  assert.equal(storage.indexedKinds(nativeIndex(p), 2), undefined, "an unindexed page is unknown, not empty");
  const watch = recordPlaces();
  try {
    assert.deepEqual(pages.refillFromPages(p, 0, WANT_REDSTONE), { n: 12, page: 2 });
    assert.equal(watch.ids.filter((id) => id === state.pages[2].id).length, 1, "an unindexed page is read, never skipped");
  } finally {
    watch.stop();
  }
  const after = nativeIndex(p);
  assert.deepEqual(after.future, { keep: ["unknown fields survive"] });
  assert.ok(storage.indexedKinds(after, 2), "the rewritten page is indexed now");
  assert.equal(storage.indexedKinds(after, 3), undefined, "an untouched legacy page stays unindexed");
  assert.equal(savedPage(p, 3).get(9).typeId, "minecraft:iron_ingot");
});

test("O17: an index tied to a different snapshot is ignored (stale), never trusted as empty", () => {
  const p = joined();
  arrange(p, { 2: { 9: stack("minecraft:redstone", 12) } });
  const state = nativeIndex(p);
  state.idx[2] = { r: "stash:page_99999", k: { emerald: 1 } };
  p.setDynamicProperty("stash:native", JSON.stringify(state));
  assert.equal(storage.indexedKinds(nativeIndex(p), 2), undefined);
  assert.deepEqual(pages.refillFromPages(p, 0, WANT_REDSTONE), { n: 12, page: 2 });
});

test("O17: every writer keeps the index equal to the snapshots (switch, auto-store, shrink, move, rescue, refill)", () => {
  const p = joined();
  arrange(p, { 1: { 10: stack("minecraft:stone", 64), 11: shulker("kept", "Box") }, 2: { 9: stack("minecraft:redstone", 20) }, 3: { 9: stack("minecraft:emerald", 5), 10: stack("minecraft:emerald", 7) } });
  assertIndexExact(p, "switches");
  assert.equal(pages.transferStacks(p, { slots: [10], to: 3 }).ok, true);
  assertIndexExact(p, "transfer");
  assert.equal(switchPage(p, 3), true);
  assertIndexExact(p, "switch");
  assert.equal(pages.refillFromPages(p, 0, { id: "minecraft:redstone", sameLore: (/** @type {string[]} */ l) => l.length === 0 }) !== undefined, true);
  assertIndexExact(p, "refill");
  mc.pages = 2;
  try {
    advance(60);
  } finally {
    mc.pages = 5;
  }
  assertIndexExact(p, "shrink");
  assert.ok(Object.keys(nativeIndex(p).pages).length >= 1);
});

test("O17: the index stays below the property limit with 25 pages of long custom ids, and falls back to reading", () => {
  mc.pages = 25;
  const p = joined();
  try {
    const longId = (/** @type {number} */ page, /** @type {number} */ i) => `some_long_addon_namespace_name:${"very_long_item_identifier_".repeat(2)}${page}_${i}`;
    for (let page = 25; page >= 2; page--) {
      assert.equal(switchPage(p, page), true);
      for (let i = 0; i < 24; i++) p.container.setItem(STORAGE_SLOTS[i], stack(longId(page, i), 3));
    }
    assert.equal(switchPage(p, 1), true);
    const raw = p.getDynamicProperty("stash:native");
    assert.ok(Buffer.byteLength(raw) < 32767, `index property is ${Buffer.byteLength(raw)} bytes`);
    const state = nativeIndex(p);
    assert.equal(Object.keys(state.pages).length, 25);
    for (const n of Object.keys(state.idx ?? {})) assert.equal(state.idx[n].r, state.pages[n].id);
    // A page whose index was dropped is still found by reading it.
    const wanted = longId(14, 5);
    assert.deepEqual(pages.refillFromPages(p, 0, { id: wanted, sameLore: () => true }), { n: 3, page: 14 });
  } finally {
    mc.pages = 5;
  }
});

test("O17: the Expansive Inventory menu and the scan list restore no indexed page", async () => {
  mc.pages = 25;
  const p = joined();
  const all = mc.players;
  mc.players = [p];
  try {
    arrange(p, Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 2, { 9: stack(PAGE_ITEMS[i % 5], 5), 10: shulker(`b${i}`, `Box ${i}`) }])));
    const loads = mc.loads;
    mc.formResponses.set(p.id, [pick("Scan all items"), { canceled: true }]);
    await pages.openInvMenu(p);
    await settle();
    assert.equal(mc.loads, loads, "usage figures and the scan came from the index");
    const scan = mc.forms.filter((e) => e.player === p).at(-1).form;
    assert.match(scan.heading, /Scan all items/);
    assert.ok(scan.buttons.some((b) => /^Box 3 x1 - Page #5$/.test(b)), JSON.stringify(scan.buttons.slice(0, 6)));
  } finally {
    mc.pages = 5;
    mc.players = all;
  }
});

test("saga bridge: storedCount reports saved pages only, reads each indexed page once per change, and a move announces itself", () => {
  const p = joined();
  mc.players = [p];
  mc.notes = [];
  const lored = stack("minecraft:amethyst_shard", 5);
  lored.setLore(["x"]);
  arrange(p, { 1: { 9: stack("minecraft:amethyst_shard", 5), 10: stack("minecraft:stone", 3) }, 2: { 9: lored, 10: stack("minecraft:amethyst_shard", 2) }, 3: { 9: stack("minecraft:emerald", 1) } });
  mc.notes = [];
  const shard = "minecraft:amethyst_shard";
  p.container.setItem(20, stack(shard, 4));
  const rows = pages.storedCount(p, shard);
  assert.equal(rows.reduce((a, r) => a + r.n, 0), 7, "the active page (page 1) is the asker's to count");
  assert.equal(rows.length, 2, "one row per lore");
  const loads = mc.loads;
  assert.deepEqual(pages.storedCount(p, shard), rows);
  assert.equal(mc.loads, loads, "answered from the cache while no page changed");
  assert.deepEqual(pages.storedCount(p, "minecraft:diamond"), []);
  assert.equal(mc.loads, loads, "no indexed page holds a diamond, so none was read");
  assert.equal(pages.transferStacks(p, { from: 1, to: 3, slots: [9] }).ok, true);
  assert.equal(mc.notes.length > 0, true, "a move says the saved pages changed");
  assert.equal(pages.storedCount(p, shard).reduce((a, r) => a + r.n, 0), 12, "page 1's 5 now sit on saved page 3");
});

test("O17: locked, named and variant stacks are never pulled by refill; many pages without a match stay untouched", () => {
  const p = joined();
  const named = stack("minecraft:redstone", 40);
  named.nameTag = "Spare";
  const locked = stack("minecraft:redstone", 30);
  locked.lockMode = "inventory";
  const lored = stack("minecraft:redstone", 20);
  lored.setLore(["owner"]);
  arrange(p, { 2: { 9: named, 10: locked, 11: lored }, 3: { 9: stack("minecraft:redstone", 8) } });
  const before = census(p);
  assert.deepEqual(pages.refillFromPages(p, 0, WANT_REDSTONE), { n: 8, page: 3 }, "only the plain stack");
  p.container.setItem(1, undefined);
  assert.equal(pages.refillFromPages(p, 1, WANT_REDSTONE), undefined, "named, locked and lore stacks stay");
  assert.deepEqual(census(p), before);
  assertIndexExact(p, "after");
});

// ---------------------------------------------------------------------------
// PR86: genuine pickups go to the earliest earlier page; "Fill earlier pages" moves a page's stacks in order
// ---------------------------------------------------------------------------

/** A pickup as the game delivers it: new stuff in the page, then the periodic look. */
const pickup = (/** @type {any} */ p, /** @type {number} */ slot, /** @type {any} */ item) => {
  p.container.setItem(slot, item);
  advance(30);
};

/** Leaves the open page with `keep` free storage slots, the rest held by slot-locked stones that never move. */
const nearlyFull = (/** @type {any} */ p, /** @type {number[]} */ keep) => {
  for (const s of STORAGE_SLOTS) if (!keep.includes(s) && !p.container.getItem(s)) p.container.setItem(s, Object.assign(stack("minecraft:cobblestone", 1), { lockMode: "slot" }));
  advance(30);
};

test("auto-store: a pickup with room on the open page stays there (master's rule: route only when it is full or down to one free slot)", () => {
  const p = joined();
  mc.players = [p];
  pages.initPages({ bar: (player, text) => player.bar.push(text), sort() {}, stash() {} });
  try {
    arrange(p, { 1: full([9]), 2: { 9: stack("minecraft:emerald", 3) } });
    switchPage(p, 3);
    advance(30);
    const bars = p.bar.length;
    pickup(p, 20, stack("minecraft:iron_ingot", 5));
    assert.equal(p.container.getItem(20)?.amount, 5, "plenty of room: no commit, no move");
    assert.equal(savedPage(p, 1).get(9), undefined);
    assert.equal(p.bar.length, bars, "no action bar message");
  } finally {
    pages.initPages({ bar: (player, text) => player.onScreenDisplay.setActionBar(text), sort() {}, stash() {} });
  }
});

test("PR86: a genuine pickup on a nearly full page 3 goes to the earliest page with room; the hotbar stays", () => {
  const p = joined();
  mc.players = [p];
  arrange(p, { 1: full([9]), 2: { 9: stack("minecraft:emerald", 3) } });
  switchPage(p, 3);
  nearlyFull(p, [20, 21]);
  pickup(p, 20, stack("minecraft:iron_ingot", 5));
  assert.equal(p.container.getItem(20), undefined, "left the active page");
  assert.equal(savedPage(p, 1).get(9)?.typeId, "minecraft:iron_ingot", "page 1 had the only free slot");
  p.container.setItem(21, undefined);
  pickup(p, 20, stack("minecraft:gold_ingot", 2));
  assert.equal(p.container.getItem(20), undefined);
  assert.equal(savedPage(p, 2).size, 2, "page 1 is full now, so page 2 takes it");
  p.container.setItem(2, stack("minecraft:diamond", 4));
  advance(30);
  assert.equal(p.container.getItem(2)?.typeId, "minecraft:diamond", "a hotbar pickup stays in the hotbar");
  assertIndexExact(p, "after routing");
});

test("PR86: moving stacks between page, hotbar, cursor and worn gear is not a pickup", () => {
  const p = joined();
  mc.players = [p];
  arrange(p, { 1: { 9: stack("minecraft:stone", 1) } });
  switchPage(p, 2);
  advance(30);
  p.container.setItem(3, stack("minecraft:emerald", 7));
  advance(30);
  const moved = p.container.getItem(3);
  p.container.setItem(3, undefined);
  p.container.setItem(20, moved);
  advance(30);
  assert.equal(p.container.getItem(20)?.amount, 7, "a hotbar to page move stays on the page");
  p.cursor.item = p.container.getItem(20);
  p.container.setItem(20, undefined);
  advance(30);
  p.container.setItem(21, p.cursor.item);
  p.cursor.item = undefined;
  advance(30);
  assert.equal(p.container.getItem(21)?.amount, 7, "a cursor to page move stays on the page");
  p.worn = { Head: stack("minecraft:iron_ingot", 1) };
  advance(130); // a quiet player is looked at every 5 s
  p.container.setItem(22, p.worn.Head);
  p.worn = {};
  advance(30);
  assert.equal(p.container.getItem(22)?.typeId, "minecraft:iron_ingot", "taking off worn gear is not a pickup");
  p.worn = undefined;
});

test("PR86: re-enabling auto-store does not route what arrived while it was off", () => {
  const p = joined();
  mc.players = [p];
  arrange(p, { 1: { 9: stack("minecraft:stone", 1) } });
  switchPage(p, 2);
  advance(30);
  mc.prefs.set(`${p.id}:autoStore`, false);
  advance(30);
  p.container.setItem(20, stack("minecraft:emerald", 9));
  advance(30);
  mc.prefs.set(`${p.id}:autoStore`, true);
  advance(30);
  assert.equal(p.container.getItem(20)?.amount, 9);
  mc.prefs.delete(`${p.id}:autoStore`);
});

test("fillEarlierPages: slot order, no sorting, hotbar and cursor untouched, leftovers stay, nothing lost", () => {
  const p = joined();
  mc.players = [p];
  arrange(p, { 1: full([9, 10]), 2: { 9: stack("minecraft:emerald", 60), 10: stack("minecraft:stone", 64) } });
  switchPage(p, 3);
  p.container.setItem(30, stack("minecraft:iron_ingot", 5));
  p.container.setItem(18, stack("minecraft:emerald", 10));
  p.container.setItem(19, stack("minecraft:glowstone", 1));
  p.container.setItem(1, stack("minecraft:redstone", 3));
  p.cursor.item = stack("minecraft:redstone", 9);
  const before = census(p);
  const r = pages.fillEarlierPages(p);
  assert.equal(r.ok, true);
  assert.deepEqual(census(p), before, "nothing lost or duplicated");
  assert.equal(savedPage(p, 1).get(9)?.typeId, "minecraft:emerald", "page 2's stacks poured into page 1 first, in slot order");
  assert.equal(savedPage(p, 1).get(9)?.amount, 64, "page 2's 60 emeralds topped up by 4 from the live page");
  assert.equal(savedPage(p, 1).get(10)?.typeId, "minecraft:stone");
  assert.equal(savedPage(p, 2).get(9)?.amount, 6, "the rest of the live emeralds took page 2's first free slot");
  assert.equal(savedPage(p, 2).get(10)?.typeId, "minecraft:glowstone", "then slot 19, unsorted");
  assert.equal(p.container.getItem(1)?.typeId, "minecraft:redstone");
  assert.equal(p.cursor.item?.amount, 9);
  assertIndexExact(p, "after fill");
});

test("fillEarlierPages: refuses cleanly on page 1 and when nothing fits", () => {
  const p = joined();
  mc.players = [p];
  assert.equal(pages.fillEarlierPages(p).ok, false);
  arrange(p, { 1: full(), 2: full() });
  switchPage(p, 2);
  const before = census(p);
  assert.equal(pages.fillEarlierPages(p).ok, false);
  assert.deepEqual(census(p), before);
});

test("F1 fill: every later page (hidden and active) pours into earlier pages, slot order, partials then free slots, one transaction", () => {
  const p = joined();
  mc.players = [p];
  const fixed = (/** @type {number[]} */ free) => Object.fromEntries(STORAGE_SLOTS.filter((s) => !free.includes(s)).map((s) => [s, Object.assign(stack("minecraft:stone", 64), { lockMode: "slot" })]));
  arrange(p, {
    1: fixed([9, 10]),
    2: { ...fixed([9, 10]), 10: stack("minecraft:emerald", 5) },
    3: { 9: stack("minecraft:gold_ingot", 2), 10: stack("minecraft:iron_ingot", 4), 11: stack("minecraft:emerald", 6) },
    5: { 9: stack("minecraft:diamond", 3) },
  });
  switchPage(p, 4);
  p.container.setItem(20, stack("minecraft:redstone", 3));
  p.container.setItem(1, stack("minecraft:emerald", 9));
  p.cursor.item = stack("minecraft:redstone", 9);
  const before = census(p);
  const r = pages.fillEarlierPages(p);
  assert.equal(r.ok, true);
  assert.deepEqual(census(p), before, "nothing lost or duplicated");
  assert.equal(savedPage(p, 1).get(9)?.typeId, "minecraft:emerald");
  assert.equal(savedPage(p, 1).get(9)?.amount, 11, "page 3's emerald topped up page 2's, which moved to page 1 first");
  assert.equal(savedPage(p, 1).get(10)?.typeId, "minecraft:gold_ingot");
  assert.equal(savedPage(p, 2).get(9)?.typeId, "minecraft:iron_ingot", "page 1 was full, so page 2");
  assert.equal(savedPage(p, 2).get(10)?.typeId, "minecraft:redstone", "the active page's stack went to the earliest room");
  assert.equal(p.container.getItem(20), undefined);
  assert.equal(savedPage(p, 3).get(9)?.typeId, "minecraft:diamond", "page 5's stack went to the earliest page with room");
  assert.equal(savedPage(p, 5).size, 0);
  assert.equal(p.container.getItem(1)?.amount, 9, "hotbar untouched");
  assert.equal(p.cursor.item?.amount, 9, "cursor untouched");
  assertIndexExact(p, "after fill");
});

test("fill: a slot-locked stack on the active page keeps its real amount and slot while another stack moves", () => {
  const p = joined();
  mc.players = [p];
  arrange(p, { 1: { 9: stack("minecraft:emerald", 3) }, 3: { 9: Object.assign(stack("minecraft:stone", 11), { lockMode: "slot" }) } });
  switchPage(p, 2);
  const lockedStack = Object.assign(stack("minecraft:stone", 7), { lockMode: "slot", nameTag: "Pinned", lore: ["§7keep"] });
  p.container.setItem(9, lockedStack);
  p.container.setItem(10, Object.assign(stack("minecraft:emerald", 4), { nameTag: "Mine" }));
  const before = census(p);
  const r = pages.fillEarlierPages(p);
  assert.equal(r.ok, true);
  const kept = p.container.getItem(9);
  assert.equal(kept?.typeId, "minecraft:stone");
  assert.equal(kept?.amount, 7, "locked stack keeps its amount (never the merge sentinel)");
  assert.equal(kept?.lockMode, "slot");
  assert.equal(kept?.nameTag, "Pinned");
  assert.equal(p.container.getItem(10), undefined, "the unlocked stack moved");
  assert.equal(savedPage(p, 3).get(9)?.amount, 11, "a locked stack on a saved page is untouched");
  assert.deepEqual(census(p), before);
  assertIndexExact(p, "locked fill");
});

test("F1 fill: from page 1 it pulls later pages into the live page's free slots", () => {
  const p = joined();
  mc.players = [p];
  arrange(p, { 2: { 9: stack("minecraft:emerald", 3), 10: stack("minecraft:iron_ingot", 5) }, 3: { 9: stack("minecraft:gold_ingot", 2) } });
  switchPage(p, 1);
  const before = census(p);
  const r = pages.fillEarlierPages(p);
  assert.equal(r.ok, true);
  assert.deepEqual(census(p), before);
  assert.deepEqual(STORAGE_SLOTS.slice(0, 3).map((s) => p.container.getItem(s)?.typeId), ["minecraft:emerald", "minecraft:iron_ingot", "minecraft:gold_ingot"]);
  assert.equal(savedPage(p, 2).size + savedPage(p, 3).size, 0);
  assertIndexExact(p, "page 1 fill");
});

test("F4 index: long names, | in names and custom ids stay distinct kinds; a name over the cap leaves the page unknown (read, never empty)", () => {
  const p = joined();
  const a = `${"x".repeat(45)}A`;
  const b = `${"x".repeat(45)}B`;
  const named = (/** @type {string} */ id, /** @type {string} */ name, n = 1) => Object.assign(stack(id, n), { nameTag: name });
  arrange(p, {
    2: { 9: named("minecraft:emerald", a, 2), 10: named("minecraft:emerald", b, 3), 11: named("minecraft:emerald", "a|b", 4), 12: named("minecraft:emerald", "a%7Cb", 5), 13: stack("addon:odd|id", 6) },
  });
  const entries = storage.indexedEntries(nativeIndex(p), 2);
  assert.ok(entries, "indexed");
  const by = new Map(entries.map((e) => [`${e.id}\u0000${e.name}`, e.n]));
  assert.equal(by.get(`minecraft:emerald\u0000${a}`), 2);
  assert.equal(by.get(`minecraft:emerald\u0000${b}`), 3, "names differing after char 40 are not merged");
  assert.equal(by.get("minecraft:emerald\u0000a|b"), 4);
  assert.equal(by.get("minecraft:emerald\u0000a%7Cb"), 5);
  assert.equal(by.get("addon:odd|id\u0000undefined"), 6, "a | in a custom id is not a name separator");
  assertIndexExact(p, "escaped");
  const huge = "n".repeat(200);
  arrange(p, { 3: { 9: named("minecraft:emerald", huge, 7), 10: stack("minecraft:redstone", 4) } });
  assert.equal(storage.indexedKinds(nativeIndex(p), 3), undefined, "an over-long name leaves the page unknown");
  assert.deepEqual(pages.refillFromPages(p, 0, WANT_REDSTONE), { n: 4, page: 3 }, "an unknown page is read, not skipped");
});

test("F4 index: a pickup never restores a saved page the index proves can't take it", () => {
  const p = joined();
  mc.players = [p];
  const fixed = (/** @type {number[]} */ free) => Object.fromEntries(STORAGE_SLOTS.filter((s) => !free.includes(s)).map((s) => [s, Object.assign(stack("minecraft:stone", 64), { lockMode: "slot" })]));
  arrange(p, { 1: fixed([]), 2: fixed([]), 3: { 9: stack("minecraft:emerald", 3) } });
  switchPage(p, 4);
  nearlyFull(p, [20]);
  const known = new Map(pageRefIds(p));
  const watch = recordPlaces();
  try {
    pickup(p, 20, stack("minecraft:iron_ingot", 5));
  } finally {
    watch.stop();
  }
  assert.equal(savedPage(p, 3).get(10)?.typeId, "minecraft:iron_ingot");
  const reads = watch.ids.filter((id) => [...known.values()].includes(id));
  assert.ok(!reads.includes(known.get(1)) && !reads.includes(known.get(2)), `full indexed pages 1 and 2 stayed unread (${reads.length} reads)`);
  assertIndexExact(p, "after skipping");
});

test("F4 index: a legacy page with no snapshot yet is empty and is not restored; a corrupt one is never treated as empty", () => {
  const p = joined();
  mc.players = [p];
  assert.equal(pages.storedCount(p, "minecraft:emerald")?.length, 0, "never-created pages hold nothing");
  p.setDynamicProperty("stash:page:2", "{not json");
  assert.equal(pages.storedCount(p, "minecraft:emerald"), undefined, "corrupt legacy data is unknown, not empty");
});

test("F5 auto-store: a failed save leaves the pickup where it is and is not retried as new; later overflow needs the active page at 1 free slot or less", () => {
  const p = joined();
  mc.players = [p];
  pages.initPages({ bar: (player, text) => player.bar.push(text), sort() {}, stash() {} });
  try {
  const fixed = (/** @type {number[]} */ free) => Object.fromEntries(STORAGE_SLOTS.filter((s) => !free.includes(s)).map((s) => [s, Object.assign(stack("minecraft:stone", 64), { lockMode: "slot" })]));
  arrange(p, { 1: fixed([9]), 2: fixed([]) });
  switchPage(p, 3);
  nearlyFull(p, [20, 21]);
  const warns = p.bar.length;
  mc.failSave = true;
  try {
    pickup(p, 20, stack("minecraft:iron_ingot", 5));
  } finally {
    mc.failSave = false;
  }
  assert.equal(p.container.getItem(20)?.amount, 5, "nothing moved on a failed save");
  advance(130);
  assert.equal(p.container.getItem(20)?.amount, 5, "the failed pickup is not retried as a new one");
  assert.equal(savedPage(p, 1).size + savedPage(p, 2).size, 2 * STORAGE_SLOTS.length - 1, "pages 1 and 2 are untouched");
  assert.ok(p.bar.slice(warns).some((t) => /Auto-store/.test(t)), "the player is told the pickup could not be stored");
  pickup(p, 21, stack("minecraft:gold_ingot", 2));
  assert.equal(p.container.getItem(21), undefined, "an earlier page with a free slot always takes a pickup");
  assert.equal(savedPage(p, 1).get(9)?.typeId, "minecraft:gold_ingot");
  pickup(p, 21, stack("minecraft:emerald", 1));
  assert.equal(p.container.getItem(21), undefined, "pages 1 and 2 are full and the open page is down to one free slot, so a later page takes it");
  assert.equal(savedPage(p, 4).get(9)?.typeId, "minecraft:emerald");
  } finally {
    pages.initPages({ bar: (player, text) => player.onScreenDisplay.setActionBar(text), sort() {}, stash() {} });
  }
});

test("F5 auto-store: a queued button gesture or a reconcile in flight stops auto-store for that tick", () => {
  const p = joined();
  mc.players = [p];
  arrange(p, { 1: { 9: stack("minecraft:stone", 1) } });
  switchPage(p, 2);
  advance(30);
  p.container.setItem(20, undefined);
  p.container.setItem(17, undefined);
  fire("playerInventoryItemChange", { player: p, slot: 17, beforeItemStack: stack(BTN_NEXT) });
  p.container.setItem(21, stack("minecraft:emerald", 9));
  advance(1);
  assert.equal(p.container.getItem(21)?.amount ?? 9, 9, "no routing while the gesture is still queued");
});

test("F1 fill: a failed save changes nothing at all", () => {
  const p = joined();
  mc.players = [p];
  arrange(p, { 1: full([9]), 2: { 9: stack("minecraft:emerald", 3) }, 3: { 9: stack("minecraft:gold_ingot", 2) } });
  switchPage(p, 3);
  const before = census(p);
  mc.failSave = true;
  try {
    assert.equal(pages.fillEarlierPages(p).ok, false);
  } finally {
    mc.failSave = false;
  }
  assert.deepEqual(census(p), before);
});

// ---------------------------------------------------------------------------
// O72: sneak-tapping a container (main.js's playerInteractWithBlock handler, driven with real event objects)
// ---------------------------------------------------------------------------

const settle = () => new Promise((r) => setImmediate(r));
let mainCopies = 0;
/** A fresh copy of main.js (lock cache, cooldowns and access answers start empty); returns what removes its listeners again. */
async function loadMain() {
  const before = Object.fromEntries(Object.entries(mc.after).map(([k, v]) => [k, v.length]));
  const intervals = mc.intervals.length;
  const copy = ++mainCopies;
  await import(dataUrl(`${mainSource.replace('"__events__"', JSON.stringify(dataUrl(`${eventsSource}\n// copy ${copy}`)))}\n// copy ${copy}`));
  return () => {
    for (const k of Object.keys(mc.after)) mc.after[k].length = before[k] ?? 0;
    mc.intervals.length = intervals;
  };
}

class ChestBox {
  constructor(size = 27) {
    this.slots = new Array(size).fill(undefined);
    this.failSwap = false;
  }
  get size() {
    return this.slots.length;
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
  swapItems(a, b) {
    if (this.failSwap) throw new Error("injected swap failure");
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
  }
}
function overworld() {
  const dim = { id: "minecraft:overworld", blocks: new Map(), getBlock(at) { return this.blocks.get(`${at.x},${at.y},${at.z}`); } };
  mc.dimensions.set(dim.id, dim);
  return dim;
}
function placeContainer(dim, at, typeId = "minecraft:chest", contents = []) {
  const box = new ChestBox();
  contents.forEach(([id, n], i) => box.setItem(i, stack(id, n)));
  const block = { typeId, location: at, ...at, dimension: dim, isAir: false, isLiquid: false, permutation: { getAllStates: () => ({}) }, getComponent: (/** @type {string} */ n) => (n === "minecraft:inventory" ? { container: box } : undefined), offset: () => undefined };
  dim.blocks.set(`${at.x},${at.y},${at.z}`, block);
  return { block, box };
}
const contentsOf = (/** @type {ChestBox} */ box) => box.slots.filter(Boolean).map((i) => `${i.typeId.replace("minecraft:", "")}:${i.amount}`);
/** A player who is not run through the inventory pages' timer. */
function visitor(pref) {
  const p = makePlayer();
  mc.players = mc.players.filter((x) => x !== p);
  if (pref) mc.prefs.set(`${p.id}:sneakTap`, pref);
  return p;
}
const HANDS = { empty: undefined, tool: () => stack("minecraft:diamond_pickaxe"), torch: () => stack("minecraft:torch", 16) };
const MESS = [["minecraft:stone", 5], ["minecraft:dirt", 10], ["minecraft:stone", 7], ["minecraft:dirt", 3]];
const UNSORTED = MESS.map(([id, n]) => `${id.replace("minecraft:", "")}:${n}`);
const SORTED = ["dirt:13", "stone:12"];

/** Every script event sent so far is delivered to the packs' listeners, and so are the answers, until it goes quiet. */
function bus() {
  let seen = mc.events.length;
  return () => {
    while (seen < mc.events.length) {
      const { id, message } = mc.events[seen++];
      for (const fn of mc.after["system:scriptEventReceive"] ?? []) fn({ id, message });
    }
  };
}

/**
 * Land Claims as far as a tap and an access check go: a claim (block position -> owner id) keeps everyone else out. Like claims_bp
 * it never looks at event.cancel. `where` is where its listener stands next to Quick Stack & Sort's: "before" or "after".
 */
function fakeClaims(/** @type {Map<string, string>} */ claim, /** @type {"before" | "after"} */ where) {
  const taps = (mc.after["before:playerInteractWithBlock"] ??= []);
  const listeners = (mc.after["system:scriptEventReceive"] ??= []);
  const tap = (/** @type {any} */ event) => {
    const owner = claim.get(`${event.block.x},${event.block.y},${event.block.z}`);
    if (owner && owner !== event.player.id) event.cancel = true;
  };
  const answer = (/** @type {any} */ { id, message }) => {
    if (id !== "realm:access_check") return;
    const q = JSON.parse(message);
    const closed = q.spots.flatMap((/** @type {any[]} */ s, /** @type {number} */ i) => {
      const owner = claim.get(`${s[1]},${s[2]},${s[3]}`);
      return owner && owner !== q.player ? [i] : [];
    });
    mc.events.push({ id: "realm:access_check_result", message: JSON.stringify({ id: q.id, from: "claims_bp", closed }) });
  };
  if (where === "before") taps.unshift(tap);
  else taps.push(tap);
  listeners.push(answer);
  return () => {
    taps.splice(taps.indexOf(tap), 1);
    listeners.splice(listeners.indexOf(answer), 1);
  };
}

/** The world has loaded: every pack that answers access checks has said so (the "hello" a second after load). */
async function worldLoaded(/** @type {() => void} */ pump) {
  fire("worldLoad", {});
  advance(1);
  pump();
  await settle();
}

/** One sneak-tap on a block with this in the hand: the before event goes to every listener in order, then the next ticks run what they deferred. */
async function sneakTap(/** @type {any} */ p, /** @type {any} */ block, /** @type {any} */ hand, /** @type {() => void} */ pump, options = {}) {
  p.isSneaking = options.sneaking ?? true;
  const event = { player: p, block, itemStack: typeof hand === "function" ? hand() : hand, isFirstEvent: options.first ?? true, blockFace: "Up", cancel: false };
  fire("before:playerInteractWithBlock", event);
  for (let i = 0; i < 4; i++) {
    advance(1);
    pump();
    await settle();
  }
  return event;
}
const shownBy = (/** @type {any} */ p) => mc.forms.filter((e) => e.player === p);

/** Runs a scenario against a fresh main.js with a chest in a world of its own. */
async function inChestWorld(/** @type {(world: { dim: any, pump: () => void }) => Promise<void>} */ run) {
  const forgetLocks = () => {
    for (const k of [...mc.worldProps.keys()]) if (k.startsWith("stash:lock:")) mc.worldProps.delete(k);
  };
  forgetLocks();
  const unload = await loadMain();
  const dim = overworld();
  const pump = bus();
  try {
    await run({ dim, pump });
  } finally {
    unload();
    forgetLocks();
    mc.dimensions.clear();
    mc.formResponses.clear();
  }
}

test("an empty-hand sneak-tap on a container sorts it right away, with the realm's default preference", () =>
  inChestWorld(async ({ dim, pump }) => {
    const p = visitor();
    assert.equal(mc.settings.getFor(p, "sneakTap"), CONFIG.sneakTap, "the player never chose: the realm's default applies");
    const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    const event = await sneakTap(p, block, HANDS.empty, pump);
    assert.equal(event.cancel, true, "the chest doesn't open");
    assert.deepEqual(contentsOf(box), SORTED);
    assert.match(p.bar.at(-1), /Sorted 2 stacks/);
    assert.equal(shownBy(p).length, 0, "no menu in the way");
  }));

for (const kind of ["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:copper_chest", "minecraft:white_shulker_box"]) {
  test(`an empty-hand sneak-tap sorts a ${kind.replace("minecraft:", "")} for a player who chose the menu too`, () =>
    inChestWorld(async ({ dim, pump }) => {
      const p = visitor("menu");
      const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, kind, MESS);
      const event = await sneakTap(p, block, HANDS.empty, pump);
      assert.equal(event.cancel, true);
      assert.deepEqual(contentsOf(box), SORTED);
    }));
}

test("a tool, weapon or armor in hand opens the menu for the menu preference, and its Sort button sorts", () =>
  inChestWorld(async ({ dim, pump }) => {
    const p = visitor("menu");
    const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    mc.formResponses.set(p.id, [pick("Sort this chest")]);
    const event = await sneakTap(p, block, HANDS.tool, pump);
    assert.equal(event.cancel, true);
    assert.equal(shownBy(p).length, 1);
    assert.match(shownBy(p)[0].form.heading, /Quick Stack & Sort/);
    assert.ok(shownBy(p)[0].form.buttons.some((b) => b.startsWith("Sort this chest")));
    assert.deepEqual(contentsOf(box), SORTED);
  }));

test("the sort preference sorts at once with an empty hand and with gear in hand", () =>
  inChestWorld(async ({ dim, pump }) => {
    const p = visitor("sort");
    for (const hand of [HANDS.empty, HANDS.tool]) {
      const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
      advance(25);
      const event = await sneakTap(p, block, hand, pump);
      assert.equal(event.cancel, true);
      assert.deepEqual(contentsOf(box), SORTED);
    }
    assert.equal(shownBy(p).length, 0);
  }));

test("an ender chest tapped with an empty hand shows the menu without a Sort button (it can't be sorted)", () =>
  inChestWorld(async ({ dim, pump }) => {
    const p = visitor("menu");
    const { block } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:ender_chest");
    const event = await sneakTap(p, block, HANDS.empty, pump);
    assert.equal(event.cancel, true);
    assert.equal(shownBy(p).length, 1);
    assert.ok(!shownBy(p)[0].form.buttons.some((b) => /^Sort this/.test(b)));
    assert.ok(shownBy(p)[0].form.buttons.some((b) => /^Quick stack my inventory/.test(b)));
  }));

test("anything else in hand, no sneaking, or the off preference leaves the tap and the chest alone", () =>
  inChestWorld(async ({ dim, pump }) => {
    for (const [pref, hand, sneaking] of /** @type {Array<[string, any, boolean]>} */ ([["menu", HANDS.torch, true], ["sort", HANDS.torch, true], ["menu", HANDS.empty, false], ["sort", HANDS.tool, false], ["off", HANDS.empty, true], ["off", HANDS.tool, true]])) {
      const p = visitor(pref);
      const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
      const event = await sneakTap(p, block, hand, pump, { sneaking });
      assert.equal(event.cancel, false, `${pref} ${typeof hand} sneaking ${sneaking}`);
      assert.deepEqual(contentsOf(box), UNSORTED);
      assert.equal(shownBy(p).length, 0);
    }
  }));

test("a block that isn't a container, and a held-down tap that repeats, never sort", () =>
  inChestWorld(async ({ dim, pump }) => {
    const p = visitor("sort");
    const table = placeContainer(dim, { x: 6, y: 64, z: 6 }, "minecraft:crafting_table");
    assert.equal((await sneakTap(p, table.block, HANDS.empty, pump)).cancel, false);
    const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    const repeat = await sneakTap(p, block, HANDS.empty, pump, { first: false });
    assert.equal(repeat.cancel, true, "the repeat is swallowed so the chest doesn't open");
    assert.deepEqual(contentsOf(box), UNSORTED);
  }));

test("a tap another pack already canceled (Land Claims ahead of this pack in the bundle) does nothing at all", () =>
  inChestWorld(async ({ dim, pump }) => {
    const owner = visitor("sort");
    const guest = visitor("sort");
    const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    const stop = fakeClaims(new Map([["5,64,5", owner.id]]), "before");
    try {
      await worldLoaded(pump);
      const event = await sneakTap(guest, block, HANDS.empty, pump);
      assert.equal(event.cancel, true);
      assert.deepEqual(contentsOf(box), UNSORTED, "the chest in someone else's claim is not sorted");
      assert.equal(shownBy(guest).length, 0);
      assert.deepEqual(guest.bar, [], "and says nothing: Land Claims already told the player");
      advance(25);
      assert.equal((await sneakTap(owner, block, HANDS.empty, pump)).cancel, true);
      assert.deepEqual(contentsOf(box), SORTED, "the claim's owner sorts it");
    } finally {
      stop();
    }
  }));

test("Land Claims listening after this pack: the tap is judged by the access check, not by the cancel it never saw", () =>
  inChestWorld(async ({ dim, pump }) => {
    const owner = visitor("sort");
    const guest = visitor("sort");
    const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    const stop = fakeClaims(new Map([["5,64,5", owner.id]]), "after");
    try {
      await worldLoaded(pump);
      const event = await sneakTap(guest, block, HANDS.empty, pump);
      assert.equal(event.cancel, true);
      assert.deepEqual(contentsOf(box), UNSORTED, "a chest in someone else's claim is not sorted");
      assert.match(guest.bar.at(-1), /isn't yours to open/);
      advance(25);
      assert.equal((await sneakTap(owner, block, HANDS.empty, pump)).cancel, true);
      assert.deepEqual(contentsOf(box), SORTED, "the claim's owner still sorts it, a few ticks after the tap");
    } finally {
      stop();
    }
  }));

test("Land Claims listening after this pack: its owner's gear-in-hand tap shows the menu, a visitor's shows nothing and can't lock it", () =>
  inChestWorld(async ({ dim, pump }) => {
    const owner = visitor("menu");
    const guest = visitor("menu");
    const { block } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    const stop = fakeClaims(new Map([["5,64,5", owner.id]]), "after");
    try {
      await worldLoaded(pump);
      mc.formResponses.set(guest.id, [pick("Lock this chest")]);
      await sneakTap(guest, block, HANDS.tool, pump);
      assert.equal(shownBy(guest).length, 0, "no menu to see inside, lock or sort a chest that isn't theirs");
      assert.ok(![...mc.worldProps.keys()].some((k) => k.startsWith("stash:lock:")), "nothing was locked in the owner's claim");
      assert.match(guest.bar.at(-1), /isn't yours to open/);
      advance(25);
      await sneakTap(owner, block, HANDS.tool, pump);
      assert.equal(shownBy(owner).length, 1);
    } finally {
      stop();
    }
  }));

test("a locked container: its owner sorts it, anyone else's tap does nothing", () =>
  inChestWorld(async ({ dim, pump }) => {
    const owner = visitor("menu");
    const guest = visitor();
    const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    mc.formResponses.set(owner.id, [pick("Lock this chest")]);
    await sneakTap(owner, block, HANDS.tool, pump);
    assert.ok([...mc.worldProps.keys()].some((k) => k.startsWith("stash:lock:")), "the owner locked it");
    advance(25);
    const asked = shownBy(guest).length;
    const empty = await sneakTap(guest, block, HANDS.empty, pump);
    assert.equal(empty.cancel, true, "the chest stays shut for them");
    assert.deepEqual(contentsOf(box), UNSORTED, "and unsorted");
    assert.match(guest.bar.at(-1), /Locked by/);
    assert.equal(shownBy(guest).length, asked, "an empty hand gets no menu: there is nothing in it to sort");
    advance(25);
    const geared = await sneakTap(guest, block, HANDS.tool, pump);
    assert.equal(geared.cancel, true);
    assert.deepEqual(contentsOf(box), UNSORTED);
    assert.equal(shownBy(guest).length, asked + 1, "gear in hand still shows who locked it, with only the inventory buttons");
    assert.match(shownBy(guest).at(-1).form.text, /locked by/);
    assert.ok(!shownBy(guest).at(-1).form.buttons.some((b) => /^(Sort this|Lock this|Share or unlock)/.test(b)));
    advance(25);
    assert.equal((await sneakTap(owner, block, HANDS.empty, pump)).cancel, true);
    assert.deepEqual(contentsOf(box), SORTED, "the owner's empty hand sorts it");
  }));

test("a second tap within the cooldown says so instead of silently doing nothing", () =>
  inChestWorld(async ({ dim, pump }) => {
    const p = visitor("sort");
    const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    const first = await sneakTap(p, block, HANDS.empty, pump);
    assert.deepEqual(contentsOf(box), SORTED);
    box.setItem(2, stack("minecraft:cobblestone", 4));
    const again = await sneakTap(p, block, HANDS.empty, pump);
    assert.equal(first.cancel && again.cancel, true);
    assert.deepEqual(contentsOf(box), [...SORTED, "cobblestone:4"], "not sorted again");
    assert.match(p.bar.at(-1), /Too fast/);
    advance(25);
    await sneakTap(p, block, HANDS.empty, pump);
    assert.deepEqual(contentsOf(box), ["cobblestone:4", ...SORTED]);
  }));

test("a tap that throws lets the container open as usual, and a sort that fails tells the player", () =>
  inChestWorld(async ({ dim, pump }) => {
    const p = visitor("sort");
    const broken = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    Object.defineProperty(broken.block, "typeId", { get() { throw new Error("chunk not loaded"); } });
    const event = await sneakTap(p, broken.block, HANDS.empty, pump);
    assert.equal(event.cancel, false);
    const { block, box } = placeContainer(dim, { x: 7, y: 64, z: 7 }, "minecraft:chest", MESS);
    box.failSwap = true;
    advance(25);
    const failed = await sneakTap(p, block, HANDS.empty, pump);
    assert.equal(failed.cancel, true);
    assert.match(p.bar.at(-1), /Couldn't sort that chest/);
  }));

test("with no Land Claims installed the sort still happens within a few ticks of the tap", () =>
  inChestWorld(async ({ dim, pump }) => {
    const p = visitor("sort");
    const { block, box } = placeContainer(dim, { x: 5, y: 64, z: 5 }, "minecraft:chest", MESS);
    await worldLoaded(pump);
    p.isSneaking = true;
    fire("before:playerInteractWithBlock", { player: p, block, itemStack: undefined, isFirstEvent: true, blockFace: "Up", cancel: false });
    for (let ticks = 1; ticks <= 3; ticks++) {
      advance(1);
      pump();
      await settle();
    }
    assert.deepEqual(contentsOf(box), SORTED, "sorted by the third tick: one tick to ask, one to be answered");
  }));

// ---------------------------------------------------------------------------
// F6: saga's count asks (main.js stashCountAsk)
// ---------------------------------------------------------------------------

test("F6 count: a page that can't be read answers unknown instead of staying silent", async () => {
  const unload = await loadMain();
  const p = makePlayer();
  try {
    mc.storedCount = () => undefined;
    const from = mc.events.length;
    for (const fn of mc.after["system:scriptEventReceive"] ?? []) fn({ id: "realm:stash_count_ask", message: JSON.stringify({ player: p.id, item: "minecraft:emerald" }) });
    const answers = mc.events.slice(from).filter((e) => e.id === "realm:stash_count").map((e) => JSON.parse(e.message));
    assert.deepEqual(answers, [{ player: p.id, item: "minecraft:emerald", unknown: true }]);
  } finally {
    delete mc.storedCount;
    mc.players = mc.players.filter((x) => x !== p);
    unload();
  }
});

test("F6 count: a row too long for one message still goes out, every message under 2048 characters", async () => {
  const unload = await loadMain();
  const p = makePlayer();
  try {
    const long = "N".repeat(3000);
    mc.storedCount = () => [
      { id: "minecraft:emerald", name: long, lore: ["a".repeat(150)], n: 2 },
      { id: "minecraft:emerald", n: 5 },
      { id: "minecraft:emerald", name: "Lily's Marble", lore: ["x"], n: 1 },
    ];
    const from = mc.events.length;
    for (const fn of mc.after["system:scriptEventReceive"] ?? []) fn({ id: "realm:stash_count_ask", message: JSON.stringify({ player: p.id, item: "minecraft:emerald" }) });
    const sent = mc.events.slice(from).filter((e) => e.id === "realm:stash_count");
    assert.ok(sent.length >= 1, "an answer was sent");
    for (const e of sent) assert.ok(e.message.length < 2048, `message of ${e.message.length} characters`);
    const parts = sent.map((e) => JSON.parse(e.message));
    const rows = parts.flatMap((m) => m.rows);
    assert.equal(rows.reduce((n, r) => n + r.n, 0), 8, "no row dropped");
    assert.equal(parts[0].parts, sent.length);
    assert.ok(rows.some((r) => r.name === "Lily's Marble" && r.lore?.[0] === "x"), "a short row keeps its name and lore");
    assert.ok(rows.some((r) => r.n === 2 && r.name.length <= 200), "the long row keeps a cut name");
  } finally {
    delete mc.storedCount;
    mc.players = mc.players.filter((x) => x !== p);
    unload();
  }
});
