import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SIZE_OPTIONS } from "../packs/admin_bp/scripts/presets.js";

test("Large server uses the operator-only 2000-block public building preset with no Infinite Reach", () => {
  const build = new Map(SIZE_OPTIONS.filter((option) => option.pack === "build_bp").map((option) => [option.key, option.large]));
  assert.equal(build.get("maxBlocksCap"), 2000);
  assert.equal(build.get("operatorsOnly"), true);
  assert.equal(build.get("allowInfiniteReach"), false);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDir = path.join(root, "packs/admin_bp/scripts");

const CommandPermissionLevel = {
  Any: 0,
  GameDirectors: 1,
  Admin: 2,
  Host: 3,
  Owner: 4,
};

const CustomCommandParamType = {
  Boolean: 0,
  Integer: 1,
  Float: 2,
  String: 3,
  EntitySelector: 4,
  PlayerSelector: 5,
  Location: 6,
  BlockType: 7,
  ItemType: 8,
  Enum: 9,
};

const CustomCommandStatus = {
  Success: 0,
  Failure: 1,
};

const EntityComponentTypes = {
  Inventory: "minecraft:inventory",
  Equippable: "minecraft:equippable",
};

const EquipmentSlot = {
  Head: "Head",
  Chest: "Chest",
  Legs: "Legs",
  Feet: "Feet",
  Mainhand: "Mainhand",
  Offhand: "Offhand",
};

const ItemLockMode = {
  none: "none",
  inventory: "inventory",
  slot: "slot",
};

const GameMode = {
  Survival: "Survival",
  Creative: "Creative",
  Adventure: "Adventure",
  Spectator: "Spectator",
};

const TimeOfDay = {
  Day: 1000,
  Noon: 6000,
  Sunset: 12000,
  Night: 13000,
  Midnight: 18000,
  Sunrise: 23000,
};

const WeatherType = {
  Clear: "Clear",
  Rain: "Rain",
  Thunder: "Thunder",
};

const ItemTypes = {
  get: (id) => ({ id }),
};

const FormCancelationReason = {
  UserClosed: "UserClosed",
  UserBusy: "UserBusy",
};

class MockItemStack {
  constructor(typeId, amount = 1) {
    this.typeId = typeId;
    this.amount = amount;
    this.maxAmount = typeId === "minecraft:diamond_sword" ? 1 : 64;
    this.nameTag = undefined;
    this.keepOnDeath = false;
    this.lockMode = ItemLockMode.none;
    this._lore = [];
  }
  getLore() {
    return [...this._lore];
  }
  setLore(lines = []) {
    this._lore = [...lines];
  }
  clone() {
    const c = new MockItemStack(this.typeId, this.amount);
    c.maxAmount = this.maxAmount;
    c.nameTag = this.nameTag;
    c.keepOnDeath = this.keepOnDeath;
    c.lockMode = this.lockMode;
    c._lore = [...this._lore];
    return c;
  }
}

class MockContainer {
  constructor(size = 36, player = null) {
    this.size = size;
    this.slots = Array.from({ length: size }, () => undefined);
    this.player = player;
    this.refuseClearSlots = new Set();
    this.emitEvents = false;
  }
  get emptySlotsCount() {
    return this.slots.filter((x) => !x).length;
  }
  getItem(slot) {
    return this.slots[slot]?.clone();
  }
  setItem(slot, item) {
    const before = this.slots[slot]?.clone();
    if (!item && this.refuseClearSlots.has(slot)) return;
    this.slots[slot] = item ? item.clone() : undefined;
    if (this.emitEvents && this.player && MockWorld._current) {
      MockWorld._current.emitInventoryChange(this.player, slot, before, this.slots[slot]?.clone());
    }
  }
  addItem(item) {
    const copy = item.clone();
    for (let i = 0; i < this.size; i++) {
      if (!this.slots[i]) {
        this.setItem(i, copy);
        return undefined;
      }
    }
    return copy;
  }
}

class MockEquippable {
  constructor() {
    this.slots = new Map();
    this.refuseClear = false;
  }
  getEquipment(slot) {
    return this.slots.get(slot)?.clone();
  }
  setEquipment(slot, item) {
    if (!item && this.refuseClear) return;
    if (!item) this.slots.delete(slot);
    else this.slots.set(slot, item.clone());
  }
}

class MockCursorInventory {
  constructor() {
    this._item = undefined;
    this.refuseClear = false;
  }
  get item() {
    return this._item?.clone();
  }
  set item(val) {
    this._item = val ? val.clone() : undefined;
  }
  clear() {
    if (this.refuseClear) return;
    this._item = undefined;
  }
}

class MockPlayer {
  constructor(id = "player-1", name = "Tester", op = false) {
    this.id = id;
    this.name = name;
    this.isValid = true;
    this.selectedSlotIndex = 0;
    this.commandPermissionLevel = op ? CommandPermissionLevel.GameDirectors : CommandPermissionLevel.Any;
    this.container = new MockContainer(36, this);
    this.equippable = new MockEquippable();
    this.cursor = new MockCursorInventory();
    this.messages = [];
    this.actionBars = [];
    this.props = new Map();
    this.onScreenDisplay = {
      setActionBar: (msg) => this.actionBars.push(msg),
    };
  }
  getComponent(id) {
    if (id === EntityComponentTypes.Inventory || id === "minecraft:inventory") return { container: this.container };
    if (id === EntityComponentTypes.Equippable || id === "minecraft:equippable") return this.equippable;
    if (id === "minecraft:cursor_inventory") return this.cursor;
    return undefined;
  }
  sendMessage(msg) {
    this.messages.push(String(msg));
  }
  getDynamicProperty(k) {
    return this.props.get(k);
  }
  setDynamicProperty(k, v) {
    if (v === undefined) this.props.delete(k);
    else this.props.set(k, v);
  }
}

class MockWorld {
  constructor() {
    this.props = new Map();
    this.players = [];
    const signal = (field) => {
      const handlers = [];
      this[field] = (event) => { for (const handler of handlers) handler(event); };
      return { subscribe: (handler) => { handlers.push(handler); return handler; } };
    };
    this.afterEvents = {
      worldLoad: signal("_onWorldLoad"),
      playerLeave: signal("_onLeave"),
      playerSpawn: signal("_onSpawn"),
      playerInventoryItemChange: signal("_onInvChange"),
      itemUse: signal("_onItemUse"),
      entityDie: signal("_onDie"),
    };
    MockWorld._current = this;
  }
  getDynamicProperty(k) {
    return this.props.get(k);
  }
  setDynamicProperty(k, v) {
    if (v === undefined) this.props.delete(k);
    else this.props.set(k, v);
  }
  getAllPlayers() {
    return [...this.players];
  }
  emitInventoryChange(player, slot, beforeItemStack, itemStack) {
    this._onInvChange?.({ player, slot, beforeItemStack, itemStack, inventoryType: "Container" });
  }
}

class MockSystem {
  constructor() {
    this.queue = [];
    this.timeouts = [];
    this.intervals = [];
    this.commands = new Map();
    this.scriptEvents = [];
    this.afterEvents = {
      scriptEventReceive: { subscribe: (fn) => (this.scriptEvents.push(fn)) },
    };
    this.beforeEvents = {
      startup: {
        subscribe: (fn) => {
          fn({
            customCommandRegistry: {
              registerEnum: () => {},
              registerCommand: (def, cb) => this.commands.set(def.name, { def, cb }),
            },
          });
        },
      },
    };
  }
  run(fn) {
    this.queue.push(fn);
    return this.queue.length;
  }
  runTimeout(fn, ticks) {
    this.timeouts.push({ fn, ticks });
    return this.timeouts.length;
  }
  runInterval(fn, ticks) {
    this.intervals.push({ fn, ticks });
    return this.intervals.length;
  }
  runJob(gen) {
    this.queue.push(() => {
      for (const _ of gen);
    });
    return this.queue.length;
  }
  clearRun() {}
  clearJob() {}
  sendScriptEvent(id, message) {
    for (const fn of this.scriptEvents) fn({ id, message });
  }
  flushRuns(limit = 20) {
    let count = 0;
    while (this.queue.length && count++ < limit) {
      const batch = this.queue.splice(0, this.queue.length);
      for (const fn of batch) fn();
    }
  }
  flushTimeouts() {
    const batch = this.timeouts.splice(0, this.timeouts.length);
    for (const t of batch) t.fn();
    this.flushRuns();
  }
  stepInterval() {
    for (const iv of this.intervals) iv.fn();
    this.flushRuns();
  }
}

class StubForm {
  title() { return this; }
  body() { return this; }
  button() { return this; }
  header() { return this; }
  label() { return this; }
  divider() { return this; }
  slider() { return this; }
  toggle() { return this; }
  dropdown() { return this; }
  textField() { return this; }
  button1() { return this; }
  button2() { return this; }
  async show() { return { canceled: true, cancelationReason: FormCancelationReason.UserClosed }; }
}

async function createAdminHarness() {
  const world = new MockWorld();
  const system = new MockSystem();
  globalThis.__adminMock = {
    CommandPermissionLevel,
    CustomCommandParamType,
    CustomCommandStatus,
    EntityComponentTypes,
    EquipmentSlot,
    GameMode,
    ItemLockMode,
    ItemStack: MockItemStack,
    ItemTypes,
    Player: MockPlayer,
    TimeOfDay,
    WeatherType,
    system,
    world,
    ActionFormData: StubForm,
    FormCancelationReason,
    MessageFormData: StubForm,
    ModalFormData: StubForm,
  };

  const tmpDir = fs.mkdtempSync(path.join(root, "tools/.tmp-admin-test-"));
  const cleanup = () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };
  try {
    const serverStub = path.join(tmpDir, "mc-server.mjs");
    const uiStub = path.join(tmpDir, "mc-ui.mjs");
    fs.writeFileSync(
      serverStub,
      `const m = globalThis.__adminMock;
export const { CommandPermissionLevel, CustomCommandParamType, CustomCommandRegistry, CustomCommandStatus, EntityComponentTypes, EquipmentSlot, GameMode, ItemLockMode, ItemStack, ItemTypes, Player, System, TimeOfDay, WeatherType, World, system, world } = m;\n`
    );
    fs.writeFileSync(
      uiStub,
      `const m = globalThis.__adminMock;
export const { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } = m;\n`
    );

    for (const file of ["config.js", "settings.js", "actions.js", "catalog.js", "presets.js", "zones.js", "script-events.js", "diag.js", "diagnostics.js", "lifecycle.js", "setup.js", "main.js"]) {
      const src = fs.readFileSync(path.join(adminDir, file), "utf8");
      const rewritten = src
        .replaceAll('"@minecraft/server"', JSON.stringify(pathToFileURL(serverStub).href))
        .replaceAll('"@minecraft/server-ui"', JSON.stringify(pathToFileURL(uiStub).href));
      fs.writeFileSync(path.join(tmpDir, file), rewritten);
    }

    const settingsMod = await import(pathToFileURL(path.join(tmpDir, "settings.js")).href);
    await import(pathToFileURL(path.join(tmpDir, "main.js")).href);
    return { world, system, settingsMod, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

const LORE = [
  "§r§7Hold it in your hand and use it",
  "§r§7to open the realm menu:",
  "§r§7every realm command you can use,",
  "§r§7in one place.",
  "§r§8Red entries: operators only",
];

function makeRealTool(amount = 1) {
  const it = new MockItemStack("minecraft:nether_star", amount);
  it.nameTag = "§r§6Realm Configuration";
  it.setLore(LORE);
  it.keepOnDeath = true;
  it.lockMode = ItemLockMode.inventory;
  return it;
}

function countRealTools(player) {
  const realMarks = new Set(["Red entries: operators only", "Gold entries: operators only", "Operators only"]);
  const isReal = (it) => {
    if (!it || it.typeId !== "minecraft:nether_star") return false;
    const stripped = it.getLore().map((l) => String(l).replace(/§./g, "").trim());
    return stripped.some((l) => realMarks.has(l));
  };
  let count = 0;
  const slots = [];
  for (let i = 0; i < player.container.size; i++) {
    const it = player.container.getItem(i);
    if (isReal(it)) {
      count += it.amount;
      slots.push(i);
    }
  }
  const off = player.equippable.getEquipment(EquipmentSlot.Offhand);
  if (isReal(off)) count += off.amount;
  const cur = player.cursor.item;
  if (isReal(cur)) count += cur.amount;
  return { count, slots };
}

test("deduplicates 3 existing Realm Configuration copies down to 1, preferring selected hotbar slot", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const player = new MockPlayer("p1", "Nish", true);
    player.selectedSlotIndex = 4;
    player.container.setItem(15, makeRealTool(1));
    player.container.setItem(4, makeRealTool(1));
    player.container.setItem(1, makeRealTool(1));
    world.players.push(player);

    world._onSpawn({ player });
    system.flushRuns();

    const { count, slots } = countRealTools(player);
    assert.equal(count, 1);
    assert.deepEqual(slots, [4]);
  } finally {
    cleanup();
  }
});

test("normalizes stack amount > 1, legacy lore, recolored and anvil-renamed real tools into a single canonical tool", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const player = new MockPlayer("p2", "Builder", false);
    player.selectedSlotIndex = 0;

    // Legacy Gold lore with stack amount 3 in slot 2
    const legacyGold = new MockItemStack("minecraft:nether_star", 3);
    legacyGold.nameTag = "§r§bRealm Configuration";
    legacyGold.setLore(["§r§7Hold it in your hand and use it", "§r§8Gold entries: operators only"]);
    legacyGold.keepOnDeath = true;
    legacyGold.lockMode = ItemLockMode.inventory;
    player.container.setItem(2, legacyGold);

    // Legacy "Operators only" lore renamed on an anvil in slot 10
    const renamedLegacy = new MockItemStack("minecraft:nether_star", 2);
    renamedLegacy.nameTag = "My Configurator";
    renamedLegacy.setLore(["§r§7Use it to open the admin menu:", "§r§8Operators only"]);
    renamedLegacy.keepOnDeath = true;
    renamedLegacy.lockMode = ItemLockMode.inventory;
    player.container.setItem(10, renamedLegacy);

    // Extra copy in offhand and cursor
    player.equippable.setEquipment(EquipmentSlot.Offhand, makeRealTool(1));
    player.cursor.item = makeRealTool(2);

    world.players.push(player);
    world._onSpawn({ player });
    system.flushRuns();

    const { count, slots } = countRealTools(player);
    assert.equal(count, 1);
    assert.deepEqual(slots, [2]);
    const kept = player.container.getItem(2);
    assert.equal(kept.amount, 1);
    assert.equal(kept.nameTag, "§r§6Realm Configuration");
    assert.deepEqual(kept.getLore(), LORE);
    assert.equal(kept.keepOnDeath, true);
    assert.equal(kept.lockMode, ItemLockMode.inventory);
    assert.equal(player.equippable.getEquipment(EquipmentSlot.Offhand), undefined);
    assert.equal(player.cursor.item, undefined);
  } finally {
    cleanup();
  }
});

test("preserves ordinary base items, anvil-renamed nether stars without real lore, locked gear, and stash page buttons", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const player = new MockPlayer("p3", "Adventurer", false);
    // Ordinary stack of nether stars
    player.container.setItem(0, new MockItemStack("minecraft:nether_star", 5));
    // Anvil-renamed nether star without pack lore
    const anvilStar = new MockItemStack("minecraft:nether_star", 2);
    anvilStar.nameTag = "Realm Configuration";
    player.container.setItem(1, anvilStar);
    // Ordinary locked sword
    const sword = new MockItemStack("minecraft:diamond_sword", 1);
    sword.nameTag = "Realm Configuration";
    sword.lockMode = ItemLockMode.inventory;
    sword.keepOnDeath = true;
    player.container.setItem(2, sword);
    // Stash page buttons at 9, 13, 17
    for (const [slot, id] of [[9, "custom:inv_prev"], [13, "custom:inv_menu"], [17, "custom:inv_next"]]) {
      const btn = new MockItemStack(id, 1);
      btn.lockMode = ItemLockMode.slot;
      btn.keepOnDeath = true;
      player.container.setItem(slot, btn);
    }
    // Two real tools in slots 5 and 20
    player.container.setItem(5, makeRealTool(1));
    player.container.setItem(20, makeRealTool(1));

    world.players.push(player);
    world._onSpawn({ player });
    system.flushRuns();

    // Ordinary items and stash buttons untouched
    assert.equal(player.container.getItem(0)?.amount, 5);
    assert.equal(player.container.getItem(1)?.amount, 2);
    assert.equal(player.container.getItem(1)?.nameTag, "Realm Configuration");
    assert.equal(player.container.getItem(2)?.typeId, "minecraft:diamond_sword");
    assert.equal(player.container.getItem(9)?.typeId, "custom:inv_prev");
    assert.equal(player.container.getItem(13)?.typeId, "custom:inv_menu");
    assert.equal(player.container.getItem(17)?.typeId, "custom:inv_next");
    // Real tool kept in slot 5, removed from slot 20
    assert.equal(player.container.getItem(5)?.nameTag, "§r§6Realm Configuration");
    assert.equal(player.container.getItem(20), undefined);
  } finally {
    cleanup();
  }
});

test("page restore / playerInventoryItemChange immediately deduplicates a restored copy without self-event loops", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const player = new MockPlayer("p4", "Pager", true);
    player.container.setItem(0, makeRealTool(1));
    world.players.push(player);
    player.container.emitEvents = true;

    // Simulate stash_bp restoring an older page that also had a Realm Configuration item in slot 22
    player.container.setItem(22, makeRealTool(1));
    system.flushRuns();

    const { count, slots } = countRealTools(player);
    assert.equal(count, 1);
    assert.deepEqual(slots, [0]);
  } finally {
    cleanup();
  }
});

test("repeat spawn, 30s check, and /realm:admin_item manual grant never create duplicates and report removed extras or failed removals", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const player = new MockPlayer("p5", "OpPlayer", true);
    world.players.push(player);

    // Initial spawn + timeout grants exactly 1 item
    world._onSpawn({ player });
    system.flushRuns();
    system.flushTimeouts();
    assert.equal(countRealTools(player).count, 1);

    // Repeat spawns and 40s of interval ticks never add a second copy
    world._onSpawn({ player });
    system.flushRuns();
    system.flushTimeouts();
    for (let i = 0; i < 35; i++) system.stepInterval();
    assert.equal(countRealTools(player).count, 1);

    // Manual /realm:admin_item when carrying 3 copies removes 2 extras and reports it
    player.container.setItem(10, makeRealTool(1));
    player.container.setItem(11, makeRealTool(1));
    const cmd = system.commands.get("realm:admin_item");
    assert.ok(cmd);
    cmd.cb({ initiator: player }, [player]);
    system.flushRuns();
    assert.equal(countRealTools(player).count, 1);
    assert.ok(player.messages.some((m) => m.includes("Removed 2 extra Realm Configuration items")));

    // If a slot refuses removal, failedRemovals is reported instead of claiming clean state
    player.container.setItem(12, makeRealTool(1));
    player.container.refuseClearSlots.add(12);
    player.messages.length = 0;
    cmd.cb({ initiator: player }, [player]);
    system.flushRuns();
    assert.ok(player.messages.some((m) => m.includes("Could not remove 1 extra Realm Configuration item")));
  } finally {
    cleanup();
  }
});

test("respects giveToPlayers, giveToOperators, and removeFromOthers settings", async () => {
  const { world, system, settingsMod, cleanup } = await createAdminHarness();
  try {
    const op = new MockPlayer("op1", "Admin", true);
    const member = new MockPlayer("m1", "Member", false);
    op.container.setItem(0, makeRealTool(2));
    member.container.setItem(0, makeRealTool(2));
    // Also give member an anvil-renamed ordinary star in slot 3
    const anvilStar = new MockItemStack("minecraft:nether_star", 1);
    anvilStar.nameTag = "Realm Configuration";
    member.container.setItem(3, anvilStar);
    world.players.push(op, member);

    // Turn giveToPlayers off (operators only) and removeFromOthers on
    settingsMod.set("giveToPlayers", false);
    system.flushRuns();

    // Operator keeps 1 normalized copy; member has real copies removed, anvil-renamed star kept
    assert.equal(countRealTools(op).count, 1);
    assert.equal(countRealTools(member).count, 0);
    assert.equal(member.container.getItem(3)?.nameTag, "Realm Configuration");
    assert.ok(member.messages.some((m) => m.includes("for operators here, so it was put away")));

    // With removeFromOthers off, a member who still has 2 real copies is deduplicated to 1 without being stripped
    settingsMod.set("removeFromOthers", false);
    member.container.setItem(4, makeRealTool(1));
    member.container.setItem(5, makeRealTool(1));
    world._onSpawn({ player: member });
    system.flushRuns();
    system.flushTimeouts();
    assert.equal(countRealTools(member).count, 1);

    // With giveToPlayers off and giveToOperators off, an operator without an item is not auto-granted one
    settingsMod.set("giveToOperators", false);
    op.container.setItem(0, undefined);
    world._onSpawn({ player: op });
    system.flushRuns();
    system.flushTimeouts();
    assert.equal(countRealTools(op).count, 0);
  } finally {
    cleanup();
  }
});

test("regression: preserves locked/keepOnDeath Realm Configuration star with unrelated lore and differently named star with generic overlapping lore line", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const player = new MockPlayer("p6", "Collector", true);
    // 1. Ordinary same-type locked/keepOnDeath star named "Realm Configuration" with unrelated lore ["My keepsake"]
    const keepsake = new MockItemStack("minecraft:nether_star", 1);
    keepsake.nameTag = "Realm Configuration";
    keepsake.keepOnDeath = true;
    keepsake.lockMode = ItemLockMode.inventory;
    keepsake.setLore(["My keepsake"]);
    player.container.setItem(1, keepsake);

    // 2. Differently named star with one generic overlapping lore line ("in one place.")
    const genericLoreStar = new MockItemStack("minecraft:nether_star", 2);
    genericLoreStar.nameTag = "Wayfinder Star";
    genericLoreStar.keepOnDeath = true;
    genericLoreStar.lockMode = ItemLockMode.inventory;
    genericLoreStar.setLore(["§r§7in one place."]);
    player.container.setItem(2, genericLoreStar);

    // 3. Genuine canonical tool in slot 0 and duplicate real tool in slot 8
    player.container.setItem(0, makeRealTool(1));
    player.container.setItem(8, makeRealTool(1));

    world.players.push(player);
    world._onSpawn({ player });
    system.flushRuns();

    // Real duplicate in slot 8 removed; canonical tool in slot 0 kept
    const { count, slots } = countRealTools(player);
    assert.equal(count, 1);
    assert.deepEqual(slots, [0]);

    // Both ordinary items with lore in slots 1 and 2 are preserved untouched
    const s1 = player.container.getItem(1);
    assert.ok(s1);
    assert.equal(s1.nameTag, "Realm Configuration");
    assert.deepEqual(s1.getLore(), ["My keepsake"]);
    assert.equal(s1.keepOnDeath, true);
    assert.equal(s1.lockMode, ItemLockMode.inventory);

    const s2 = player.container.getItem(2);
    assert.ok(s2);
    assert.equal(s2.nameTag, "Wayfinder Star");
    assert.equal(s2.amount, 2);
    assert.deepEqual(s2.getLore(), ["§r§7in one place."]);
  } finally {
    cleanup();
  }
});

test("regression: external real copy inserted while updatingItem guard is active is queued and deduplicated on guard clear without event loops", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const player = new MockPlayer("p7", "RaceTester", true);
    // Start with a legacy tool in slot 0 so reconcileItems writes slot 0 and activates updatingItem
    const legacy = makeRealTool(1);
    legacy.setLore(["§r§8Gold entries: operators only"]);
    player.container.setItem(0, legacy);
    world.players.push(player);
    player.container.emitEvents = true;

    // Trigger spawn; take only the first queued callback (which runs reconcileItems and queues markUpdating's clear callback)
    world._onSpawn({ player });
    const firstBatch = system.queue.splice(0, 1);
    for (const fn of firstBatch) fn();

    // At this exact moment, updatingItem is active for player, and markUpdating's clear callback is still in system.queue.
    // Simulate stash_bp restoring a page with another real tool into slot 20 before the guard clears!
    player.container.setItem(20, makeRealTool(1));
    assert.equal(countRealTools(player).count, 2, "2 copies present immediately before guard clear flushes");

    // Now flush remaining queued runs (markUpdating clear -> schedules follow-up reconcile -> removes slot 20)
    system.flushRuns();

    const { count, slots } = countRealTools(player);
    assert.equal(count, 1, "follow-up reconcile after guard clear removed the concurrently restored copy");
    assert.deepEqual(slots, [0]);
    assert.equal(system.queue.length, 0, "converged cleanly with no infinite event loop");
  } finally {
    cleanup();
  }
});

test("regression: automatic check/event paths report failed removals across inventory, offhand, and cursor", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const player = new MockPlayer("p8", "FailCheck", true);
    player.container.setItem(0, makeRealTool(1));
    player.equippable.setEquipment(EquipmentSlot.Offhand, makeRealTool(1));
    player.equippable.refuseClear = true;
    world.players.push(player);

    // Automatic spawn check (not manual giveItem) must surface the failed offhand removal
    world._onSpawn({ player });
    system.flushRuns();
    assert.ok(
      player.messages.some((m) => m.includes("Could not remove 1 extra Realm Configuration item")),
      `expected automatic failure message, got ${JSON.stringify(player.messages)}`
    );
  } finally {
    cleanup();
  }
});

test("the checkSeconds round reads whole inventories only for players who need it, and still gives back a deleted item and the item to a new operator", async () => {
  const { world, system, settingsMod, cleanup } = await createAdminHarness();
  try {
    const players = [1, 2, 3].map((i) => new MockPlayer(`r${i}`, `R${i}`, false));
    let reads = 0;
    for (const p of players) {
      p.container.setItem(0, makeRealTool(1));
      const getItem = p.container.getItem.bind(p.container);
      p.container.getItem = (slot) => (reads++, getItem(slot));
      world.players.push(p);
    }
    const round = () => {
      for (let i = 0; i < 30; i++) system.stepInterval();
    };
    round(); // the first round checks everyone it hasn't seen
    reads = 0;
    for (let r = 0; r < 5; r++) round();
    // Five rounds used to read 3 inventories each (15 checks of 36+ slots); now only each player's safety round.
    assert.ok(reads <= 5 * 3 * 37 / 2, `${reads} slot reads in 5 rounds for 3 players who changed nothing`);

    // A deleted item (with its inventory event) comes back at the next round, as before.
    const [a, b, c] = players;
    a.container.emitEvents = true;
    a.container.setItem(0, undefined);
    system.flushRuns();
    assert.equal(countRealTools(a).count, 0);
    round();
    assert.equal(countRealTools(a).count, 1, "given back at the next round");

    // Deleted with no event at all: the safety round finds it within SAFETY_ROUNDS rounds.
    b.container.slots[0] = undefined;
    for (let r = 0; r < 10 && countRealTools(b).count === 0; r++) round();
    assert.equal(countRealTools(b).count, 1, "given back by the safety round");

    // Items for operators only: a player made an operator gets one at the next round.
    settingsMod.set("giveToPlayers", false);
    settingsMod.set("removeFromOthers", false);
    system.flushRuns();
    c.container.slots[0] = undefined;
    round();
    assert.equal(countRealTools(c).count, 0, "not an operator yet");
    c.commandPermissionLevel = CommandPermissionLevel.GameDirectors;
    round();
    assert.equal(countRealTools(c).count, 1, "the new operator got one at the next round");
  } finally {
    cleanup();
  }
});

test("an inventory change that involves no Realm Configuration item reads the cursor only after a real item left a slot", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const p = new MockPlayer("cw", "Cursor", false);
    p.container.setItem(0, makeRealTool(1));
    world.players.push(p);
    let cursorReads = 0;
    const getComponent = p.getComponent.bind(p);
    p.getComponent = (id) => (id === "minecraft:cursor_inventory" && cursorReads++, getComponent(id));
    p.container.emitEvents = true;
    for (let i = 0; i < 10; i++) p.container.setItem(5, new MockItemStack("minecraft:cobblestone", i + 1));
    system.flushRuns();
    assert.equal(cursorReads, 0, `${cursorReads} cursor reads for 10 cobblestone pickups`);

    // The real item goes onto the cursor, a duplicate shows up there too while other slots change: still found.
    p.container.setItem(0, undefined);
    p.cursor.item = makeRealTool(1);
    system.flushRuns();
    p.container.slots[7] = makeRealTool(1); // a copy that arrived with no event
    p.container.setItem(5, new MockItemStack("minecraft:cobblestone", 20));
    system.flushRuns();
    assert.equal(countRealTools(p).count, 1, "the copy on the cursor or in slot 7 was removed");
  } finally {
    cleanup();
  }
});

test("a real item a reconcile found on the cursor is watched, so a copy that turns up with no event is removed on the next unrelated change", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const p = new MockPlayer("cw2", "Carrier", false);
    p.cursor.item = makeRealTool(1); // came onto the cursor with no inventory event (from the off hand, say)
    world.players.push(p);
    for (let i = 0; i < 30; i++) system.stepInterval(); // the round reconciles the new player: it carries one
    system.flushRuns();
    assert.equal(countRealTools(p).count, 1);
    p.container.slots[7] = makeRealTool(1); // a copy that arrived with no event
    p.container.emitEvents = true;
    p.container.setItem(5, new MockItemStack("minecraft:cobblestone", 3));
    system.flushRuns();
    assert.equal(countRealTools(p).count, 1, "the copy was removed at the cobblestone pickup, not at a safety round minutes later");
  } finally {
    cleanup();
  }
});

test("giving the item back in a round reads the inventory twice (before and after), not three times", async () => {
  const { world, system, cleanup } = await createAdminHarness();
  try {
    const p = new MockPlayer("g1", "Giver", false);
    world.players.push(p);
    for (let i = 0; i < 30; i++) system.stepInterval(); // first round: gets the item
    assert.equal(countRealTools(p).count, 1);
    p.container.slots[0] = undefined; // gone with no event: the round after next finds it missing
    let reads = 0;
    const getItem = p.container.getItem.bind(p.container);
    p.container.getItem = (slot) => (reads++, getItem(slot));
    const has = () => p.container.slots.some((it) => it?.nameTag === "§r§6Realm Configuration");
    for (let r = 0; r < 12 && !has(); r++) {
      reads = 0;
      for (let i = 0; i < 30; i++) system.stepInterval();
    }
    const inRound = reads;
    assert.equal(countRealTools(p).count, 1, "given back");
    assert.ok(inRound <= 2 * 36 + 4, `${inRound} slot reads in the round that gave it back`);
  } finally {
    cleanup();
  }
});
