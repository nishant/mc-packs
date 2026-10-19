// The stats ticker is already a personal preference. These tests pin the broken default and the
// gates around it: this Realm defaults on, a realm disallow still locks everyone, stored true/false
// win, both menus write the same key, and the per-second cache drops on change without rewriting prefs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CONFIG } from "../packs/stats_bp/scripts/config.js";

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

class Player {
  constructor(name) {
    this.name = name;
    this.id = name;
    this.isValid = true;
    this.location = { x: 0, y: 64, z: 0 };
    this.dimension = { id: "minecraft:overworld" };
    this.isGliding = false;
    this.props = new Map();
    this.messages = [];
    this.bars = [];
    this.commandPermissionLevel = 0;
    this.onScreenDisplay = { setActionBar: (text) => this.bars.push(String(text)) };
  }
  getDynamicProperty(key) {
    return this.props.get(key);
  }
  setDynamicProperty(key, value) {
    writes.push({ id: this.id, key, value });
    if (value === undefined) this.props.delete(key);
    else this.props.set(key, value);
  }
  hasTag() {
    return false;
  }
  getComponent() {
    return undefined;
  }
  sendMessage(text) {
    this.messages.push(String(text));
  }
}

const writes = [];
const players = [];
const listeners = [];
const startup = [];
const intervals = [];
const commands = new Map();
const queue = [];
let tick = 100;

class Objective {
  constructor(id) {
    this.id = id;
    this.scores = new Map();
  }
  getScores() {
    return [...this.scores.entries()].map(([name, score]) => ({ score, participant: { displayName: name, type: "FakePlayer" } }));
  }
  getScore(name) {
    if (!this.scores.has(typeof name === "string" ? name : name?.name)) throw new Error("Failed to resolve identity");
    return this.scores.get(typeof name === "string" ? name : name.name);
  }
  addScore(name, n) {
    this.scores.set(name, (this.scores.get(name) ?? 0) + n);
  }
  removeParticipant() {}
}

const objectives = new Map();
const worldProps = new Map();
class CustomCommandRegistry {}
class System {}
class World {}
const server = {
  CustomCommandRegistry,
  System,
  World,
  CommandPermissionLevel: { Any: 0, GameDirectors: 1 },
  CustomCommandParamType: { Enum: "enum", String: "string" },
  CustomCommandStatus: { Success: 0, Failure: 1 },
  DisplaySlotId: { Sidebar: "sidebar" },
  ObjectiveSortOrder: { Descending: "descending" },
  ScoreboardIdentityType: { Player: "Player", FakePlayer: "FakePlayer" },
  Player,
  system: {
    get currentTick() {
      return tick;
    },
    run(fn) {
      queue.push(fn);
    },
    runTimeout(fn) {
      queue.push(fn);
    },
    runInterval(fn) {
      intervals.push(fn);
      return fn;
    },
    clearRun() {},
    runJob() {},
    waitTicks() {
      return Promise.resolve();
    },
    sendScriptEvent() {},
    beforeEvents: { startup: { subscribe(fn) { startup.push(fn); } } },
    afterEvents: { scriptEventReceive: { subscribe(fn) { listeners.push(fn); } } },
  },
  world: {
    beforeEvents: {},
    afterEvents: {
      playerLeave: { subscribe() {} },
      playerBreakBlock: { subscribe() {} },
      playerPlaceBlock: { subscribe() {} },
      entityDie: { subscribe() {} },
      playerSpawn: { subscribe() {} },
      worldLoad: { subscribe() {} },
    },
    getDynamicProperty(key) {
      return worldProps.get(key);
    },
    setDynamicProperty(key, value) {
      writes.push({ id: "world", key, value });
      if (value === undefined) worldProps.delete(key);
      else worldProps.set(key, value);
    },
    getDynamicPropertyIds() {
      return [...worldProps.keys()];
    },
    getAllPlayers() {
      return players;
    },
        getEntity(id) {
          return players.find((p) => p.id === id);
        },
    scoreboard: {
      getObjective(id) {
        return objectives.get(id);
      },
      addObjective(id) {
        const obj = new Objective(id);
        objectives.set(id, obj);
        return obj;
      },
      setObjectiveAtDisplaySlot() {},
      clearObjectiveAtDisplaySlot() {},
    },
  },
};
const ui = {
  ActionFormData: class ActionFormData {
    title() { return this; }
    body() { return this; }
    button() { return this; }
    show() { return Promise.resolve({ canceled: true }); }
  },
  ModalFormData: class ModalFormData {
    title() { return this; }
    submitButton() { return this; }
    toggle() { return this; }
    dropdown() { return this; }
    slider() { return this; }
    show() { return Promise.resolve({ canceled: true }); }
  },
  FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" },
};

const serverUrl = dataUrl(`const s = globalThis.__statsMc; export const { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, DisplaySlotId, ObjectiveSortOrder, ScoreboardIdentityType, Player, CustomCommandRegistry, System, World, system, world } = s;`);
const uiUrl = dataUrl(`const u = globalThis.__statsUi; export const { ActionFormData, FormCancelationReason, ModalFormData } = u;`);
globalThis.__statsMc = server;
globalThis.__statsUi = ui;

const diagSrc = readFileSync(new URL("../packs/stats_bp/scripts/diag.js", import.meta.url), "utf8").replace(
  'from "@minecraft/server"',
  `from ${JSON.stringify(serverUrl)}`,
);
const settingsUrl = dataUrl(
  readFileSync(new URL("../packs/stats_bp/scripts/settings.js", import.meta.url), "utf8")
    .replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`)
    .replace('from "./config.js"', `from ${JSON.stringify(new URL("../packs/stats_bp/scripts/config.js", import.meta.url).href)}`)
        .replace('from "./stats.js"', `from ${JSON.stringify(new URL("../packs/stats_bp/scripts/stats.js", import.meta.url).href)}`),
);
const mainSrc = readFileSync(new URL("../packs/stats_bp/scripts/main.js", import.meta.url), "utf8")
  .replace('import "./diag.js";', `import ${JSON.stringify(dataUrl(diagSrc))};`)
  .replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`)
  .replace('from "@minecraft/server-ui"', `from ${JSON.stringify(uiUrl)}`)
  .replace('from "./config.js"', `from ${JSON.stringify(new URL("../packs/stats_bp/scripts/config.js", import.meta.url).href)}`)
  .replace('from "./settings.js"', `from ${JSON.stringify(settingsUrl)}`)
    .replace('from "./stats.js"', `from ${JSON.stringify(new URL("../packs/stats_bp/scripts/stats.js", import.meta.url).href)}`);
const pack = await import(dataUrl(mainSrc));
const settings = await import(settingsUrl);

for (const fn of startup) {
  fn({
    customCommandRegistry: {
      registerEnum() {},
      registerCommand(def, cb) {
        commands.set(def.name, cb);
      },
    },
  });
}

function fire(id, message) {
  for (const fn of listeners) fn({ id, message });
}
function flush() {
  const q = queue.splice(0);
  for (const fn of q) fn();
}
function ann() {
  const player = new Player("Ann");
  players.splice(0, players.length, player);
  return player;
}
function tickers() {
  tick += 20;
  const before = players[0].bars.length;
  for (const fn of intervals) fn();
  return players[0].bars.slice(before);
}
function pref(player) {
  const raw = player.getDynamicProperty("stats:pref");
  return raw ? JSON.parse(String(raw)) : {};
}

test("this Realm allows the ticker and defaults it on", () => {
  assert.equal(CONFIG.tickerEnabled, true, "realm option remains the allow switch");
  assert.equal(CONFIG.tickerDefaultOn, true, "players who never chose should see the ticker");
});

test("a new player follows the realm default and a disallow locks the display", () => {
  assert.ok(intervals.length >= 1, "the ticker interval is registered");
  settings.set("tickerEnabled", true);
  settings.set("tickerDefaultOn", CONFIG.tickerDefaultOn);
  const player = ann();
  const shown = tickers();
  assert.equal(pref(player).ticker, undefined, "showing the default must not write a choice");
  assert.match(shown.at(-1) ?? "", /Playtime/, "a player who never chose follows tickerDefaultOn");
  settings.set("tickerEnabled", false);
  player.bars.length = 0;
  const locked = tickers();
  assert.equal(locked.filter((line) => /Playtime|Deaths|Mob kills/.test(line)).length, 0, "realm disallow hides every ticker");
  settings.set("tickerEnabled", true);
});

test("stored true and false survive a later default flip, and an absent choice does not pretend to be an old off", () => {
  const player = ann();
  player.setDynamicProperty("stats:pref", JSON.stringify({ ticker: true }));
  settings.set("tickerDefaultOn", false);
  assert.equal(settings.getFor(player, "ticker"), true);
  player.bars.length = 0;
  assert.match(tickers().at(-1) ?? "", /Playtime/);
  player.setDynamicProperty("stats:pref", JSON.stringify({ ticker: false }));
  settings.set("tickerDefaultOn", true);
  assert.equal(settings.getFor(player, "ticker"), false);
  player.bars.length = 0;
  assert.equal(tickers().filter((line) => /Playtime/.test(line)).length, 0);
  player.setDynamicProperty("stats:pref", undefined);
  assert.equal(settings.getFor(player, "ticker"), true, "no saved choice is not an old explicit off");
  settings.set("tickerDefaultOn", CONFIG.tickerDefaultOn);
});

test("explicit on and off stay stored even when they match the realm default", () => {
  const player = ann();
  player.setDynamicProperty("stats:pref", undefined);
  settings.set("tickerDefaultOn", CONFIG.tickerDefaultOn);
  assert.equal(settings.get("tickerDefaultOn"), true, "file default on, with no world override");
  assert.equal(settings.setFor(player, "ticker", false), undefined);
  assert.equal(pref(player).ticker, false, "explicit off must remain when the default is on");
  assert.equal(settings.setFor(player, "ticker", true), undefined);
  assert.equal(pref(player).ticker, true, "an explicit matching on remains a personal choice");
  assert.equal(settings.getFor(player, "ticker"), true);
  settings.set("tickerDefaultOn", false);
  assert.equal(settings.getFor(player, "ticker"), true, "a later default cannot erase the explicit on");
  settings.set("tickerDefaultOn", CONFIG.tickerDefaultOn);
});

test("both menus toggle the same preference and the cache drops without a tick write", () => {
  const player = ann();
  player.setDynamicProperty("stats:pref", undefined);
  settings.set("tickerEnabled", true);
  settings.set("tickerDefaultOn", true);
  player.bars.length = 0;
  assert.match(tickers().at(-1) ?? "", /Playtime/);
  const before = writes.length;
  tickers();
  assert.equal(writes.length, before, "a ticker redraw must not rewrite saved preferences");
  player.setDynamicProperty("stats:pref", JSON.stringify({ ticker: false }));
  assert.match(tickers().at(-1) ?? "", /Playtime/, "a direct property edit stays cached until onChange");
    settings.setFor(player, "ticker", false);
    player.bars.length = 0;
    assert.equal(tickers().filter((line) => /Playtime/.test(line)).length, 0, "onChange drops the cache without waiting for a restart");
    const cmd = commands.get("realm:stats_ticker");
    assert.equal(typeof cmd, "function");
    cmd({ sourceEntity: player });
    flush();
    assert.match(player.messages.at(-1) ?? "", /Enabled/);
    assert.equal(pref(player).ticker, true, "the command keeps an explicit on even when it matches the default");
    player.bars.length = 0;
    assert.match(tickers().at(-1) ?? "", /Playtime/, "the stats command invalidates the cache");
    fire("realm:cfg_set", JSON.stringify({ id: "prefs-off", pack: "stats_bp", key: "ticker", value: false, player: player.id }));
    assert.equal(pref(player).ticker, false);
    player.bars.length = 0;
    assert.equal(tickers().filter((line) => /Playtime/.test(line)).length, 0, "/realm:prefs write invalidates the cache");
    fire("realm:cfg_set", JSON.stringify({ id: "prefs-on", pack: "stats_bp", key: "ticker", value: true, player: player.id }));
  assert.equal(pref(player).ticker, true, "/realm:prefs also keeps the explicit on");
  settings.set("tickerEnabled", false);
  cmd({ sourceEntity: player });
  flush();
  assert.match(player.messages.at(-1) ?? "", /disabled on this realm/);
  assert.equal(pref(player).ticker, true, "the locked command preserves the existing explicit choice");
  settings.set("tickerEnabled", true);
});
