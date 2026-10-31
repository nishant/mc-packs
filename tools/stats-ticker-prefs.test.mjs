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
const spawnHandlers = [];
const leaveHandlers = [];
let tick = 100;
let listed = 0; // world.getAllPlayers() calls
/**
 * Who is online, as in the game: a player who goes is announced by playerLeave, one who comes by playerSpawn (the
 * ticker keeps its player list from those events, not from listing every player each pass).
 */
function setPlayers(list) {
  const gone = players.filter((p) => !list.includes(p));
  const come = list.filter((p) => !players.includes(p));
  players.splice(0, players.length, ...list);
  for (const p of gone) {
    p.isValid = false;
    for (const fn of leaveHandlers) fn({ playerId: p.id, playerName: p.name });
  }
  for (const p of come) for (const fn of spawnHandlers) fn({ player: p, initialSpawn: true });
}

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
      playerLeave: { subscribe(fn) { leaveHandlers.push(fn); } },
      playerBreakBlock: { subscribe() {} },
      playerPlaceBlock: { subscribe() {} },
      entityDie: { subscribe() {} },
      playerSpawn: { subscribe(fn) { spawnHandlers.push(fn); } },
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
      listed++;
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

const diagCoreUrl = dataUrl(
  readFileSync(new URL("../packs/stats_bp/scripts/diag-core.js", import.meta.url), "utf8").replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`),
);
const diagSrc = readFileSync(new URL("../packs/stats_bp/scripts/diag.js", import.meta.url), "utf8").replace('from "./diag-core.js"', `from ${JSON.stringify(diagCoreUrl)}`);
// One router for the whole pack: settings.js and main.js register their handlers in the same script-events.js, as in the game.
const eventsUrl = dataUrl(readFileSync(new URL("../packs/stats_bp/scripts/script-events.js", import.meta.url), "utf8").replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`));
const settingsCoreUrl = dataUrl(
  readFileSync(new URL("../packs/stats_bp/scripts/settings-core.js", import.meta.url), "utf8").replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`),
);
const settingsUrl = dataUrl(
  readFileSync(new URL("../packs/stats_bp/scripts/settings.js", import.meta.url), "utf8")
    .replace('from "@minecraft/server"', `from ${JSON.stringify(serverUrl)}`)
    .replace('from "./settings-core.js"', `from ${JSON.stringify(settingsCoreUrl)}`)
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
  setPlayers([player]);
  return player;
}
/** One second of game ticks: each interval runs as often as it asked (the ticker once, for every player). */
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
// handles every player in one pass a second (4 passes 5 ticks apart measured dearer), and ranks against a board read at most every 5 seconds per stat.
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

test("F45: every ticker is drawn in one pass a second, and every one within the first second", () => {
  onlyStat("deaths");
  const many = Array.from({ length: 40 }, (_, i) => new Player(`P${i}`));
  setPlayers(many);
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
  // Each pass costs about 0.35 ms on BDS whatever it does: one pass a second, not four (perf-soak at 10 and 40 players).
  assert.equal(perTick.size, 1, `the writes come from one pass (${[...perTick.values()].join(", ")})`);
  for (const p of many) p.bars.length = 0;
  perTick.clear();
  for (let s = 0; s < 3; s++) tickers();
  assert.ok(perTick.size <= 3, `three seconds take at most three passes (${perTick.size} ticks wrote)`);
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
  setPlayers(many);
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

test("tied scores share a place in My stats and the leaderboard, as on the ticker", async () => {
  onlyStat("mined");
  const mined = board("mined");
  mined.scores.clear();
  mined.scores.set("Ann", 5);
  mined.scores.set("Bob", 5);
  mined.scores.set("Carl", 2);
  const many = [new Player("Ann"), new Player("Bob"), new Player("Carl")];
  setPlayers(many);
  tickers();
  assert.match(plain(many[0].bars.at(-1)), /#1 of 3/);
  assert.match(plain(many[1].bars.at(-1)), /#1 of 3/);
  const proto = ui.ActionFormData.prototype;
  const { title, body, show } = proto;
  /** Opens /realm:stats, picks `pick` on the main menu then 0 on the next form, and returns every form's body. */
  async function open(player, ...picks) {
    /** @type {string[]} */
    const bodies = [];
    let n = 0;
    proto.title = function (t) { this._t = t; return this; };
    proto.body = function (b) { bodies.push(plain(b)); return this; };
    proto.show = function () { return Promise.resolve(n < picks.length ? { canceled: false, selection: picks[n++] } : { canceled: true }); };
    try {
      commands.get("realm:stats")({ sourceEntity: player });
      for (let i = 0; i < 20; i++) {
        flush();
        await new Promise((r) => setImmediate(r));
      }
    } finally {
      Object.assign(proto, { title, body, show });
    }
    return bodies;
  }
  const mine = (await open(many[1], 0)).find((b) => /Blocks mined/.test(b)) ?? "";
  assert.match(mine, /Blocks mined: 5 \(#1 of 3\)/, `Bob, tied first, is first in My stats too: ${mine}`);
  const carl = (await open(many[2], 0)).find((b) => /Blocks mined/.test(b)) ?? "";
  assert.match(carl, /Blocks mined: 2 \(#3 of 3\)/, `Carl, below two tied players, is third: ${carl}`);
  const { STATS } = await import(new URL("../packs/stats_bp/scripts/stats.js", import.meta.url).href);
  const lb = (await open(many[2], 1, STATS.findIndex((st) => st.id === "mined"))).find((b) => /Carl/.test(b)) ?? "";
  assert.match(lb, /1\. Ann  5/, `leaderboard: ${lb}`);
  assert.match(lb, /1\. Bob  5/, `the leaderboard numbers tied scores alike: ${lb}`);
  assert.match(lb, /3\. Carl  2/, `leaderboard: ${lb}`);
  restoreTicker();
});

test("F45: the ticker keeps its player list from join and leave events, not a full list every pass", () => {
  onlyStat("deaths");
  const many = Array.from({ length: 40 }, (_, i) => new Player(`L${i}`));
  setPlayers(many);
  tickers(); // the first second may rebuild the list once
  const from = listed;
  for (let s = 0; s < 5; s++) tickers();
  // The once-a-second tracking pass lists the players 5 times; the ticker at most once more (its 5-second rebuild),
  // where listing them every pass would add 5.
  assert.ok(listed - from <= 6, `getAllPlayers ran ${listed - from} times in 5 seconds`);
  // A player who joins is drawn within a second; one who left is no longer drawn.
  const late = new Player("Late");
  const left = many[0];
  setPlayers([...many.slice(1), late]);
  const leftBars = left.bars.length;
  tickers();
  assert.equal(late.bars.length, 1, "the new player is drawn within a second");
  for (let s = 0; s < 3; s++) tickers();
  assert.equal(left.bars.length, leftBars, "the player who left is not drawn");
  restoreTicker();
});
