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
    runInterval(fn, every = 1) {
      intervals.push({ fn, every });
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
// One router for the whole pack: settings.js and main.js register their handlers in the same script-events.js, as in the game.
const eventsUrl = dataUrl(readFileSync(new URL("../packs/stats_bp/scripts/script-events.js", import.meta.url), "utf8").replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`));
const settingsUrl = dataUrl(
  readFileSync(new URL("../packs/stats_bp/scripts/settings.js", import.meta.url), "utf8")
    .replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`)
    .replace('from "./script-events.js"', `from ${JSON.stringify(eventsUrl)}`)
    .replace('from "./config.js"', `from ${JSON.stringify(new URL("../packs/stats_bp/scripts/config.js", import.meta.url).href)}`)
        .replace('from "./stats.js"', `from ${JSON.stringify(new URL("../packs/stats_bp/scripts/stats.js", import.meta.url).href)}`),
);
const mainSrc = readFileSync(new URL("../packs/stats_bp/scripts/main.js", import.meta.url), "utf8")
  .replace('import "./diag.js";', `import ${JSON.stringify(dataUrl(diagSrc))};`)
  .replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`)
  .replace('from "@minecraft/server-ui"', `from ${JSON.stringify(uiUrl)}`)
  .replace('from "./config.js"', `from ${JSON.stringify(new URL("../packs/stats_bp/scripts/config.js", import.meta.url).href)}`)
  .replace('from "./script-events.js"', `from ${JSON.stringify(eventsUrl)}`)
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
/** One second of game ticks: each interval runs as often as it asked (the ticker every 5 ticks, one player group each). */
function tickers() {
  const before = players[0].bars.length;
  for (let i = 0; i < 20; i++) {
    tick++;
    for (const { fn, every } of intervals) if (tick % every === 0) fn();
  }
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

// F45: the ticker's cost at 40 players. It writes the action bar at most every 2 seconds per player on one stat,
// spreads players over the second, and ranks against a board read at most every 5 seconds per stat.
function onlyStat(id, style = "full") {
  settings.set("tickerEnabled", true);
  settings.set("tickerDefaultOn", true);
  settings.set("tickerMode", "cycle");
  settings.set("tickerStyle", style);
  for (const st of ["playtime", "deaths", "mobkills", "pvpkills", "mined", "placed", "travelled", "flown", "joins"]) settings.set(`tickerShows.${st}`, st === id);
}
const restoreTicker = () => settings.reset();
const plain = (/** @type {string | undefined} */ s) => String(s ?? "").replace(/§./g, "");
const board = (id) => objectives.get(`stats_${id}`) ?? server.world.scoreboard.addObjective(`stats_${id}`);

test("F45: players are spread over the second, and every one is drawn within it", () => {
  onlyStat("deaths");
  const many = Array.from({ length: 40 }, (_, i) => new Player(`P${i}`));
  players.splice(0, players.length, ...many);
  /** @type {Map<number, number>} */
  const perTick = new Map();
  for (const p of many) {
    p.onScreenDisplay.setActionBar = (text) => {
      p.bars.push(String(text));
      perTick.set(tick, (perTick.get(tick) ?? 0) + 1);
    };
  }
  tickers();
  assert.equal(many.filter((p) => p.bars.length === 1).length, 40, "each of the 40 players is drawn once in the first second");
  assert.ok(perTick.size >= 3, `the writes are spread over several ticks (${[...perTick.values()].join(", ")})`);
  assert.ok(Math.max(...perTick.values()) <= 20, `no tick draws more than half of them (${[...perTick.values()].join(", ")})`);
  restoreTicker();
});

test("F45: a number that changes every second on the same stat is redrawn every 2 seconds, not every second", () => {
  onlyStat("travelled", "compact");
  const player = ann();
  const walked = board("travelled");
  let draws = 0;
  for (let second = 0; second < 10; second++) {
    walked.addScore("Ann", 3);
    draws += tickers().length;
  }
  assert.ok(draws <= 6, `at most one write per 2 seconds while only the number moves (${draws} in 10 s)`);
  assert.ok(draws >= 5, `still refreshed so the bar never fades (${draws} in 10 s)`);
  assert.match(player.bars.at(-1) ?? "", /Walked/);
  restoreTicker();
});

test("F45: the ranking reads each board at most once every 5 seconds, and a player's own new score ranks at once", () => {
  onlyStat("mined");
  const mined = board("mined");
  mined.scores.clear();
  mined.scores.set("Ann", 3);
  mined.scores.set("Bob", 7);
  mined.scores.set("Offline Carl", 5);
  let reads = 0;
  const getScores = mined.getScores.bind(mined);
  mined.getScores = () => {
    reads++;
    return getScores();
  };
  const many = [new Player("Ann"), new Player("Bob"), ...Array.from({ length: 38 }, (_, i) => new Player(`Q${i}`))];
  players.splice(0, players.length, ...many);
  for (let second = 0; second < 10; second++) tickers();
  assert.ok(reads <= 3, `one board read per 5 seconds for 40 players (${reads} in 10 s)`);
  assert.match(plain(many[0].bars.at(-1)), /Blocks mined 3 #3 of 3/);
  assert.match(plain(many[1].bars.at(-1)), /Blocks mined 7 #1 of 3/);
  mined.scores.set("Ann", 9);
  let line = "";
  for (let second = 0; second < 3 && !/Blocks mined 9/.test(line); second++) {
    tickers();
    line = plain(many[0].bars.at(-1));
  }
  assert.match(line, /Blocks mined 9 #1 of 3/, "Ann's own new score ranks first right away, before the board is read again");
  mined.getScores = getScores;
  restoreTicker();
});

test("F45: while another pack's note holds the bar the ticker reads and writes nothing, then redraws at once", () => {
  onlyStat("deaths");
  const player = ann();
  tickers();
  const deaths = board("deaths");
  let reads = 0;
  const getScore = deaths.getScore.bind(deaths);
  deaths.getScore = (name) => {
    reads++;
    return getScore(name);
  };
  player.bars.length = 0;
  fire("realm:actionbar", JSON.stringify({ player: player.id, ticks: 50, from: "mobhp_bp" }));
  tickers();
  tickers();
  assert.equal(player.bars.length, 0, "the note is left alone");
  assert.equal(reads, 0, "no scores are read for a bar the ticker can't draw on");
  tickers();
  tickers(); // its next turn after the note's 50 ticks (each player has one turn a second)
  assert.match(plain(player.bars.at(-1)), /Deaths/, "the ticker comes back on its first turn after the note's time is up");
  deaths.getScore = getScore;
  restoreTicker();
});
