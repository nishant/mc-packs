// W10 non-saga O52/O53: town-news gate, nameless playerless gossip, durable milestone
// join flag, and the goals letter cap. Runs the real functions. No Minecraft server.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { GOSSIP, HEARTH } from "../packs/npc_bp/scripts/hearth.js";
import { CONFIG as GUILD_CONFIG } from "../packs/guilds_bp/scripts/config.js";

const root = path.join(import.meta.dirname, "..");
const pack = (folder, file = "main.js") => path.join(root, "packs", folder, "scripts", file);

const GATE = [
  "const NEWS_GAP = 1000;",
  "let newsAt = -NEWS_GAP;",
  "const newsSeen = new Set();",
].join("\n");

/** @param {string} file @param {string} name */
function extractFunction(file, name) {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(path.basename(file), text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  /** @type {import("typescript").FunctionDeclaration | undefined} */
  let node;
  function visit(/** @type {import("typescript").Node} */ n) {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) node = n;
    ts.forEachChild(n, visit);
  }
  visit(source);
  return node?.getText(source);
}

/**
 * @param {string} file
 * @param {string[]} required
 * @param {string[]} optional
 * @param {Record<string, unknown>} sandbox
 * @param {string} [extra]
 * @param {string} [footer]
 */
function evalPack(file, required, optional, sandbox, extra = "", footer = "") {
  const missing = required.filter((name) => !extractFunction(file, name));
  assert.deepEqual(missing, [], path.basename(path.dirname(path.dirname(file))) + " missing " + missing.join(","));
  const names = [...required, ...optional.filter((name) => extractFunction(file, name))];
  const code = ['"use strict";', GATE, extra, ...names.map((name) => extractFunction(file, name)), footer || "({" + names.join(",") + "})"].join("\n");
  return vm.runInNewContext(code, sandbox, { filename: path.basename(file) });
}

function recorder() {
  /** @type {{ id: string, payload: string, tick: number }[]} */
  const events = [];
  const system = {
    currentTick: 0,
    sendScriptEvent(id, payload) {
      const text = typeof payload === "string" ? payload : JSON.stringify(payload);
      assert.ok(text.length < 2048, id + " payload " + text.length);
      events.push({ id, payload: text, tick: system.currentTick });
    },
  };
  return { events, system, send(id, data) { system.sendScriptEvent(id, JSON.stringify(data)); } };
}

/** @param {{ id: string }[]} events @param {string} id */
const count = (events, id) => events.filter((e) => e.id === id).length;

const SENDERS = [
  ["elite_bp", pack("elite_bp")],
  ["calendar_bp", pack("calendar_bp")],
  ["fishing_bp", pack("fishing_bp")],
  ["meteor_bp", pack("meteor_bp")],
  ["expedition_bp", pack("expedition_bp")],
  ["guilds_bp", pack("guilds_bp")],
  ["relics_bp", pack("relics_bp")],
  ["skills_bp", pack("skills_bp", "calling.js")],
];

test("each owned sender gates town news at 1000 game ticks, once per key, 64 remembered", () => {
  for (const [name, file] of SENDERS) {
    const src = extractFunction(file, "gossip");
    assert.equal(typeof src, "string", name + " gossip gate missing");
    assert.equal(src.includes("Date.now"), false, name + " must not time the gate with Date.now");
    assert.equal(src.includes("getDynamicProperty"), false, name + " gate is process memory, not saved data");
    const api = vm.runInNewContext(
      [
        '"use strict";',
        GATE,
        "const sent = [];",
        "const system = { currentTick: 0, sendScriptEvent(id, payload) { sent.push(payload); } };",
        "const send = (id, msg) => system.sendScriptEvent(id, JSON.stringify(msg));",
        src,
        "({",
        "  go(key, tick) { system.currentTick = tick; return gossip(key, { kind: 'x', player: 'p' }); },",
        "  sent: () => sent.length,",
        "  size: () => newsSeen.size,",
        "})",
      ].join("\n"),
      {},
      { filename: name + "-gate.js" },
    );
    assert.equal(api.go("a", 0), true, name + " first event");
    assert.equal(api.go("b", 999), false, name + " 999 ticks is still the same hour");
    assert.equal(api.sent(), 1, name + " dropped, not queued");
    assert.equal(api.go("b", 1000), true, name + " 1000 ticks is the next hour");
    assert.equal(api.go("b", 2000), false, name + " the same key is told once");
    assert.equal(api.sent(), 2, name);
    for (let i = 0; i < 63; i++) assert.equal(api.go("k" + i, 3000 + i * 1000), true, name + " key " + i);
    assert.equal(api.size(), 64, name + " seen list stays at 64");
    const at = 3000 + 62 * 1000;
    assert.equal(api.go("a", at), false, name + " evicted key still waits for the hour");
    assert.equal(api.sent(), 65, name);
    assert.equal(api.go("a", at + 1000), true, name + " oldest key can be told again after the hour");
    const again = vm.runInNewContext(
      [
        '"use strict";',
        GATE,
        "const system = { currentTick: 0, sendScriptEvent() {} };",
        "const send = (id, msg) => system.sendScriptEvent(id, JSON.stringify(msg));",
        src,
        "gossip('a', { kind: 'x' })",
      ].join("\n"),
      {},
    );
    assert.equal(again, true, name + " script restart clears the in-memory gate");
  }
});

test("two champion kills inside 999 ticks still drop shards and report the kill, and gossip once", () => {
  const box = recorder();
  let drops = 0;
  const killer = {
    id: "killer",
    name: "Ada",
    getDynamicProperty: () => 0,
    setDynamicProperty() {},
    sendMessage() {},
    playSound() {},
  };
  const api = evalPack(pack("elite_bp"), ["slain"], ["gossip"], {
    ...box,
    Date,
    CONFIG: { helperSeconds: 30, shards: { min: 1, max: 1 }, xpOrbs: 0 },
    playerBehind: () => "killer",
    world: {
      getAllPlayers: () => [killer],
      getDimension: () => ({ spawnItem() { drops++; }, spawnEntity() {} }),
    },
    PROP_KILLS: "kills",
        randInt: () => 1,
        rand: () => 0,
        shards: () => ({ type: "shard" }),
    split() {},
    TRAIT_NAMES: { shielded: "Shielded" },
    console,
  });
  const info = (tag) => ({ name: "The Beast", trait: "shielded", mob: "minecraft:zombie", tag, dim: "minecraft:overworld", at: { x: 1, y: 2, z: 3 } });
  api.slain(info("one"), { id: "sword" }, undefined, "entity-1");
  box.system.currentTick = 999;
  api.slain(info("two"), { id: "sword" }, undefined, "entity-2");
  assert.equal(drops, 2, "drops are not gated");
  assert.equal(count(box.events, "realm:champion_slain"), 2, "kill report is not gated");
  assert.equal(count(box.events, "realm:gossip"), 1);
});

test("the same champion is gossiped once even after the hour, and a fresh context can tell it again", () => {
  const run = (tick) => {
    const box = recorder();
    box.system.currentTick = tick;
    const api = evalPack(pack("elite_bp"), ["slain"], ["gossip"], {
      ...box,
      Date,
      CONFIG: { helperSeconds: 30, shards: { min: 0, max: 0 }, xpOrbs: 0 },
      playerBehind: () => "killer",
      world: { getAllPlayers: () => [], getDimension: () => ({ spawnItem() {}, spawnEntity() {} }) },
      randInt: () => 0,
      rand: () => 0,
      shards: () => ({}),
      split() {},
      TRAIT_NAMES: {},
      console,
    });
    const info = { name: "The Beast", trait: "shielded", mob: "minecraft:zombie", tag: "beast", dim: "overworld", at: { x: 1, y: 2, z: 3 } };
    api.slain(info, undefined, new Map([["killer", Date.now()]]), "entity-9");
    return count(box.events, "realm:gossip");
  };
  const box = recorder();
  const api = evalPack(pack("elite_bp"), ["slain"], ["gossip"], {
    ...box,
    Date,
    CONFIG: { helperSeconds: 30, shards: { min: 0, max: 0 }, xpOrbs: 0 },
    playerBehind: () => "killer",
    world: { getAllPlayers: () => [], getDimension: () => ({ spawnItem() {}, spawnEntity() {} }) },
    randInt: () => 0,
    rand: () => 0,
    shards: () => ({}),
    split() {},
    TRAIT_NAMES: {},
    console,
  });
  const info = { name: "The Beast", trait: "shielded", mob: "minecraft:zombie", tag: "beast", dim: "overworld", at: { x: 1, y: 2, z: 3 } };
  api.slain(info, undefined, new Map([["killer", Date.now()]]), "entity-9");
  box.system.currentTick = 1000;
  api.slain(info, undefined, new Map([["killer", Date.now()]]), "entity-9");
  assert.equal(count(box.events, "realm:champion_slain"), 2);
  assert.equal(count(box.events, "realm:gossip"), 1);
  assert.equal(run(0), 1, "a restarted script has an empty seen list");
});

test("a held siege pays every participant and gossips once about a real name", () => {
  const box = recorder();
  let crowns = 0;
  const players = ["Ada", "Bea", "Cal"].map((name, i) => ({
    id: "p" + i,
    name,
    dimension: { id: "minecraft:overworld" },
    sendMessage() {},
  }));
  const siege = {
    id: "siege-1",
    town: { n: "Mill", id: "mill", src: "town" },
    c: [],
    who: { p0: ["Ada", 1, 200], p1: ["Bea", 1, 200], p2: ["Cal", 1, 200] },
  };
  const api = evalPack(pack("calendar_bp"), ["endSiege"], ["gossip"], {
    ...box,
    initialSiege: siege,
    OVERWORLD: "minecraft:overworld",
    world: { getDimension: () => ({ getEntities: () => [] }), getAllPlayers: () => players },
    side: { clear() {} },
    saveSiege() {},
    saveMeta() {},
    addHistory() {},
    sendMarks() {},
    restoreCircle() {},
    setMood() {},
    meta: { last: 0 },
    day: 3,
    SIEGE_LINES: { held: "{town} held", failed: "{town} failed", reyes: "r", hollis: "h", scattered: "gone", noGround: "no {town}", wave: "w" },
    title() {},
    online: (id) => players.find((p) => p.id === id),
    addCrowns() { crowns++; },
    int: (k) => (k === "heldCrowns" || k === "failedCrowns" || k === "heldXp" ? 4 : 0),
        PACK: "calendar_bp",
        console,
      }, "let siege = initialSiege;\nconst takesPart = (s, pid) => !!s.who[pid] && (s.who[pid][1] === 1 || s.who[pid][2] >= 180);");
  api.endSiege("held");
  assert.equal(crowns, 3, "Crowns are not gated");
  assert.equal(count(box.events, "realm:quest_done"), 3);
  assert.equal(count(box.events, "realm:skill_xp"), 3);
  const gossip = box.events.filter((e) => e.id === "realm:gossip");
  assert.equal(gossip.length, 1);
  const msg = JSON.parse(gossip[0].payload);
  assert.equal(msg.n, 3);
  assert.ok(["Ada", "Bea", "Cal"].includes(msg.name), "no invented player");
  assert.equal(msg.kind, "siege");
});

test("a scattered siege does not gossip and does not pay", () => {
  const box = recorder();
  let crowns = 0;
  const siege = { id: "siege-2", town: { n: "Mill", id: "mill", src: "town" }, c: [{ x: 1 }], who: { p0: ["Ada", 1, 200] } };
  const api = evalPack(pack("calendar_bp"), ["endSiege"], ["gossip"], {
    ...box,
    initialSiege: siege,
    OVERWORLD: "minecraft:overworld",
    world: { getDimension: () => ({ getEntities: () => [] }), getAllPlayers: () => [{ id: "p0", dimension: { id: "minecraft:overworld" }, sendMessage() {} }] },
    side: { clear() {} },
    saveSiege() {},
    saveMeta() {},
    addHistory() {},
    sendMarks() {},
    restoreCircle() {},
    setMood() {},
    meta: {},
    day: 1,
    SIEGE_LINES: { scattered: "gone", noGround: "no {town}", held: "", failed: "", reyes: "", hollis: "" },
    title() {},
    online: () => undefined,
    addCrowns() { crowns++; },
    int: () => 1,
    console,
  }, "let siege = initialSiege;\nconst takesPart = (s, pid) => !!s.who[pid] && (s.who[pid][1] === 1 || s.who[pid][2] >= 180);");
  api.endSiege("scattered");
  assert.equal(crowns, 0);
  assert.equal(count(box.events, "realm:gossip"), 0);
});

test("two carve-offs inside the hour still award both titles and gossip once", () => {
  const box = recorder();
  const fairs = [
    { k: "y1", e: { a: ["Ada"] }, v: { a: 3 } },
    { k: "y2", e: { b: ["Bea"] }, v: { b: 4 } },
  ];
  let n = 0;
  const api = evalPack(pack("calendar_bp"), ["fairResult"], ["gossip"], {
    ...box,
    readJson: () => fairs[n++],
    writeJson() {},
    world: { sendMessage() {} },
    PROP_FAIR: "fair",
    console,
  });
  api.fairResult("y1");
  box.system.currentTick = 100;
  api.fairResult("y2");
  assert.equal(count(box.events, "realm:title_unlock"), 2);
  assert.equal(count(box.events, "realm:gossip"), 1);
});

test("two regattas inside the hour still award both titles and gossip once", () => {
  const box = recorder();
  const boards = [
    { k: "r1", top: [["a", "Ada", 12000]] },
    { k: "r2", top: [["b", "Bea", 11000]] },
  ];
  let n = 0;
  const api = evalPack(pack("calendar_bp"), ["regattaResult"], ["gossip"], {
    ...box,
    readJson: () => boards[n++],
    writeJson() {},
    world: { sendMessage() {} },
    clock: (ms) => String(ms),
    PROP_BOARD: "board",
    console,
  });
  api.regattaResult("r1");
  box.system.currentTick = 999;
  api.regattaResult("r2");
  assert.equal(count(box.events, "realm:title_unlock"), 2);
  assert.equal(count(box.events, "realm:gossip"), 1);
});

test("two legendary catches still grant fishing XP and journal, and gossip once", () => {
  const box = recorder();
  const log = {};
  const player = { id: "ada", name: "Ada", setDynamicProperty() {}, sendMessage() {}, playSound() {} };
  const api = evalPack(pack("fishing_bp"), ["caught"], ["gossip"], {
    ...box,
    logOf: () => log,
    recordsOf: () => ({}),
    saveWorld() {},
    enterTournament: () => undefined,
    byId: new Map([["salmon", true], ["koi", true]]),
    article: () => "a",
    colorOf: () => "",
    species: [{ id: "salmon" }, { id: "koi" }],
    get: () => false,
    world: { getAllPlayers: () => [] },
    PROP_LOG: "log",
    PROP_RECORDS: "rec",
    rarities: new Map([["legendary", { xp: 40 }]]),
    console,
  });
  api.caught(player, { id: "salmon", name: "Salmon", rarity: "legendary" }, 80);
  box.system.currentTick = 500;
  api.caught(player, { id: "koi", name: "Koi", rarity: "legendary" }, 90);
  assert.equal(count(box.events, "realm:skill_xp"), 2);
  assert.equal(count(box.events, "realm:journal"), 2);
  assert.equal(count(box.events, "realm:gossip"), 1);
});

test("two meteor craters found in one pass still journal both, and gossip once", () => {
  const box = recorder();
  const impacts = [
    { id: "m1", state: "made", x: 0, y: 64, z: 0, found: undefined },
    { id: "m2", state: "made", x: 1, y: 64, z: 1, found: undefined },
  ];
  const player = { id: "ada", name: "Ada", location: { x: 0, y: 64, z: 0 } };
  let saved = 0;
  const api = evalPack(pack("meteor_bp"), ["checkFound"], ["gossip"], {
    ...box,
    impacts: () => impacts,
    overworld: () => ({ getPlayers: () => [player] }),
    reached: new Set(),
    CONFIG: { foundDistance: 8 },
    world: { sendMessage() {} },
    saveImpacts() { saved++; },
    console,
  });
  api.checkFound();
  assert.equal(saved, 2, "both finds are saved");
  assert.equal(impacts[0].found, "Ada");
  assert.equal(impacts[1].found, "Ada");
  assert.equal(count(box.events, "realm:journal"), 2);
  assert.equal(count(box.events, "realm:gossip"), 1);
  box.system.currentTick = 5000;
  api.checkFound();
  assert.equal(count(box.events, "realm:gossip"), 1, "impact.found stops a second telling after restart of the hour");
});

test("a nightmare clear pays every member and gossips once", () => {
  const box = recorder();
  let paid = 0;
  const members = new Map([["a", { name: "Ada" }], ["b", { name: "Bea" }], ["c", { name: "Cal" }]]);
  const players = [...members].map(([id, m]) => ({
    id,
    name: m.name,
    onScreenDisplay: { setTitle() {} },
    playSound() {},
    sendMessage() {},
  }));
  const api = evalPack(pack("expedition_bp"), ["finish"], ["gossip"], {
    ...box,
    gameMs: () => 1000,
    get: () => 30,
    openDoor() {},
    fillTreasure() {},
    bestFor: () => ({}),
    levelKey: () => "n5",
    CONFIG: { leaderboardSize: 5, rep: 0, relics: [], historySize: 5, tierBoardSize: 5 },
    saveBest() {},
    addHistory() {},
    readJson: () => [],
    writeJson() {},
    PROP_TIERS: "tiers",
    PROP_PROG: "prog",
    levelName: () => "Nightmare 5",
    tierOf: () => 5,
    online: (id) => players.find((p) => p.id === id),
    hasFlag: () => false,
    payCrowns() { paid++; },
    clock: () => "1:00",
    levelShort: () => "N5",
    progressOf: () => ({ c: 0, b: 0, u: 0, r: [] }),
    writePlayer() {},
    maxTier: () => 10,
    tell() {},
    world: { sendMessage() {} },
    dungeonLabel: () => "Crypt",
    saveRun() {},
    console,
  });
  api.finish({
    id: "run-1",
    phase: "active",
    started: 0,
    members,
    mobs: [],
    extra: [],
    hazards: [],
    lay: { n: 4 },
    dungeon: { id: "crypt", name: "Crypt", crowns: 10 },
    level: 7,
    s: { crowns: 1, t: 5, relic: 0 },
    leaderName: "Ada",
    affixes: [],
    long: false,
    cursed: false,
  });
  assert.equal(paid, 3, "Crowns are not gated");
  assert.equal(count(box.events, "realm:quest_done"), 3);
  assert.equal(count(box.events, "realm:journal"), 3);
  assert.equal(count(box.events, "realm:gossip"), 1);
});

test("two new guild masters still get their titles, and the town gossips once", () => {
  const box = recorder();
  const ranks = [...GUILD_CONFIG.ranks].sort((a, b) => a.rep - b.rep);
  let titles = 0;
  const api = evalPack(pack("guilds_bp"), ["rankedUp"], ["gossip"], {
    ...box,
    RANKS: ranks,
    guildName: () => "Miners' Guild",
    article: (s) => s,
    fmt: (n) => String(n),
    get: () => 99,
    CONFIG: { shops: {}, announceRanks: [] },
    PERK_TEXT: {},
    itemName: (id) => id,
    world: { getAllPlayers: () => [] },
    unlockTitle() { titles++; },
    console,
  });
  const master = ranks.length - 1;
  api.rankedUp({ id: "a", name: "Ada", sendMessage() {}, playSound() {} }, "miners", master - 1, master, 1500);
  box.system.currentTick = 100;
  api.rankedUp({ id: "b", name: "Bea", sendMessage() {}, playSound() {} }, "miners", master - 1, master, 1600);
  assert.equal(titles, 2);
  assert.equal(count(box.events, "realm:gossip"), 1);
});

test("two starlit relics still take their cost, and the town gossips once", () => {
  const box = recorder();
  let taken = 0;
  const relic = (serial, name) => ({
    serial,
    asc: 2,
    def: { id: serial, name },
    stack: { setDynamicProperty() {} },
    put() {},
  });
  const api = evalPack(pack("relics_bp"), ["ascend"], ["gossip"], {
    ...box,
    get: () => true,
    relicStacks: (player) => [relic(player.serial, player.relicName)],
    gateOf: () => undefined,
    costOf: () => ({ shards: 1, glass: 0, crowns: 5 }),
    materials: () => ({ container: {}, essence: 1, shards: 0, glass: 0, crowns: 10 }),
    crownsObjective: () => ({ addScore() { taken++; } }),
    takeOf() {},
    takeShards() {},
    isEssence: () => false,
    isGlass: () => false,
    freshen() {},
    stageText: () => "glows",
    STAGES: ["", "", "", "Starlit"],
    ASC: { 1: { star: "gold" }, 2: { star: "gold" } },
    CONFIG: { ascension: { announceStarlit: false } },
    ITEM_ASC: "asc",
    console,
  });
  assert.equal(api.ascend({ id: "a", name: "Ada", serial: 1, relicName: "Lamp", playSound() {}, sendMessage() {} }, 1), undefined);
  box.system.currentTick = 200;
  assert.equal(api.ascend({ id: "b", name: "Bea", serial: 2, relicName: "Bell", playSound() {}, sendMessage() {} }, 2), undefined);
  assert.equal(taken, 2, "the shard cost is not gated");
  assert.equal(count(box.events, "realm:gossip"), 1);
});

test("two callings still complete their quest, and the town gossips once", () => {
  const box = recorder();
  const api = evalPack(pack("skills_bp", "calling.js"), ["choose"], ["gossip"], {
    ...box,
    on: () => true,
    isReady: () => true,
    stateOf: () => ({ c: "", t: {}, n: 0, d: 0, w: 0, cd: 0 }),
    daysLeft: () => 0,
    pay: () => true,
    byId: new Map(),
    realmDay: 4,
    world: { getDay: () => 4 },
    save() {},
    hasSigil: () => true,
    giveSigil() {},
    sendCalling() {},
    pointsFor: () => 1,
    activeText: () => "a trick",
    get: () => 0,
    console,
  });
  const player = (id, name) => ({ id, name, sendMessage() {}, playSound() {} });
  assert.equal(api.choose(player("a", "Ada"), { id: "warden", name: "Warden", guild: "wardens", active: { name: "Guard" } }), undefined);
  box.system.currentTick = 100;
  assert.equal(api.choose(player("b", "Bea"), { id: "miner", name: "Miner", guild: "miners", active: { name: "Dig" } }), undefined);
  assert.equal(count(box.events, "realm:quest_done"), 2);
  assert.equal(count(box.events, "realm:gossip"), 1);
});

function npcApi(random = 0) {
  const box = recorder();
  const math = Object.create(Math);
  math.random = () => random;
  const api = evalPack(pack("npc_bp"), ["hearGossip", "fillGossip", "gossipLine"], [], {
    ...box,
    Math: math,
    Date,
    world: { getAllPlayers: () => [], setDynamicProperty() {}, getDynamicProperty: () => undefined },
    crowned: () => false,
    isNum: (v) => typeof v === "number" && Number.isFinite(v),
    CONFIG: { gossipHours: 48, gossipMax: 24 },
    get: (k) => (k === "gossipChance" ? 100 : k === "affinity" ? true : undefined),
    HEARTH,
    GOSSIP,
    console,
  }, [
    "let gossip = [];",
    "let gossipNext = 1;",
    "const GOSSIP_KIND = /^[a-z][a-z0-9_]{0,23}$/;",
    "const GOSSIP_REPEAT_MS = 30 * 60000;",
    "const GOSSIP_PER_KIND = 4;",
    "const PROP_HEARD = 'npc:heard';",
    "const heardCache = new Map();",
    "const pick = (arr) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined);",
    "const heardOf = () => [];",
    "const gossipAlive = () => gossip.filter((g) => g.t >= Date.now() - 48 * 3600000);",
    "const saveGossip = () => {};",
  ].join("\n"), "({ hearGossip, fillGossip, gossipLine, seed(list) { gossip = list; }, dump() { return gossip.slice(); } })");
  return api;
}

test("playerless non-town gossip is a nameless line, not an empty name", () => {
  const api = npcApi(0);
  api.seed([{ i: 1, k: "champion", p: "", n: "", t: Date.now(), pl: "The Beast" }]);
  const line = api.gossipLine({ id: "lis", name: "Lis", setDynamicProperty() {} }, { id: "bea" });
  assert.equal(line, "Something's going on in town. Everyone's talking about it.");
  assert.equal(line.includes("{name}"), false);
  assert.equal(line.includes("Lis"), false, "do not invent the listener as the subject");
});

test("guard: a playerless caravan still uses its own place line", () => {
  const api = npcApi(0);
  api.seed([{ i: 2, k: "caravan", p: "", n: "", t: Date.now(), pl: "the docks" }]);
  const line = api.gossipLine({ id: "lis", name: "Lis", setDynamicProperty() {} }, { id: "tobin" });
  assert.match(line, /the docks/);
  assert.equal(line.includes("{name}"), false);
  assert.equal(line.includes("Something's going on"), false);
});

test("guard: playerless champion news is stored, not dropped, and the 24/4 caps stay", () => {
  const api = npcApi(0);
  api.hearGossip({ kind: "champion", place: "The Beast" });
  const stored = api.dump();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].p, "");
  assert.equal(stored[0].n, "");
  for (let i = 0; i < 5; i++) api.hearGossip({ kind: "fish_legendary", player: "p" + i, name: "N" + i, place: "Salmon" });
  api.hearGossip({ kind: "meteor", player: "pz", name: "Zed", place: "crater" });
  const all = api.dump();
  assert.equal(all.filter((g) => g.k === "fish_legendary").length, 4);
  assert.equal(all.filter((g) => g.k === "meteor").length, 1);
  assert.ok(all.length <= 24);
});

function milestoneSession(record, milestones, valueOf = () => 0) {
  const box = recorder();
  const api = evalPack(pack("milestones_bp"), ["check", "topTier", "recheck"], ["gossip"], {
    ...box,
    recordOf: () => record,
    milestones,
    backfilled: new Set(),
    dirty: new Set(),
    title: (m, tier) => m.name + " " + tier,
    valueOf,
    tiersFor: () => 3,
    get: () => false,
    world: { sendMessage() {}, getAllPlayers: () => [] },
    STATS: { mined: { goal: () => "mine" } },
    fmt: (n) => String(n),
    console,
  });
  return { check: api.check, recheck: api.recheck, events: box.events };
}

test("old top-tier titles are not sent again on the next join", () => {
  const milestones = Array.from({ length: 9 }, (_, i) => ({ id: "m" + i, stat: "mined", name: "Mile" + i, tiers: [1, 2, 3] }));
  const record = { n: "Ada", c: { mined: 1 }, g: Object.fromEntries(milestones.map((m) => [m.id, 3])), legacy: 9 };
  const player = { id: "ada", name: "Ada", sendMessage() {}, playSound() {} };
  const first = milestoneSession(record, milestones);
  first.check(player);
  const second = milestoneSession(record, milestones);
  second.check(player);
  assert.equal(count(second.events, "realm:title_unlock"), 0, "nine old unlocks were sent again");
  assert.equal(record.tf, 1);
  assert.equal(record.legacy, 9, "unknown saved fields stay");
  assert.equal(record.g.m0, 3);
});

test("a recheck after the join flag sends no extra title", () => {
  const milestones = Array.from({ length: 9 }, (_, i) => ({ id: "m" + i, stat: "mined", name: "Mile" + i, tiers: [1, 2, 3] }));
  const record = { n: "Ada", c: { mined: 1 }, g: Object.fromEntries(milestones.map((m) => [m.id, 3])), legacy: 9 };
  const player = { id: "ada", name: "Ada", sendMessage() {}, playSound() {} };
  const session = milestoneSession(record, milestones);
  session.check(player);
  const sent = count(session.events, "realm:title_unlock");
  session.recheck(player);
  assert.equal(count(session.events, "realm:title_unlock"), sent, "recheck sent another title");
  assert.equal(record.tf, 1);
  assert.equal(record.legacy, 9);
});

test("the owning report reads the saved flag, not another add-on's store", () => {
  const store = new Map([["milestones:p:ada", JSON.stringify({ n: "Ann", c: { joins: 400 }, g: { joins: 3 }, tf: 1, legacy: 9 })]]);
  /** @type {{ id: string, payload: string }[]} */
  const sent = [];
  const api = evalPack(pack("milestones_bp"), ["reportSaved", "flush", "records", "recordReport", "boundedReport"], [], {
    world: {
      getDynamicProperty: (k) => store.get(k),
      setDynamicProperty(k, v) { store.set(k, v); },
      getDynamicPropertyIds: () => [...store.keys()],
    },
    system: { sendScriptEvent(id, payload) { sent.push({ id, payload }); } },
    seedCache: new Map([["ada", { n: "Ann", c: {}, g: { joins: 3 } }]]),
    seedDirty: new Set(),
    console,
  }, "let cache = seedCache;\nconst dirty = seedDirty;\nconst RECORD_PREFIX = 'milestones:p:';");
  api.reportSaved({ id: "ada", name: "Ann" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].id, "realm:milestones_test_report");
  const msg = JSON.parse(sent[0].payload);
  assert.equal(msg.tf, 1, "saved tf, not the in-memory record that lacks it");
  assert.equal(msg.name, "Ann");
  assert.equal(msg.joins, 3);
  assert.equal(msg.player, "ada");
  assert.equal(msg.legacy, undefined);
  assert.equal(msg.error, undefined);
  assert.equal(JSON.parse(api.boundedReport("x".repeat(2000))).error, "too long");
  assert.equal(JSON.parse(api.boundedReport("x".repeat(2000))).length, 2000);
});

test("a new top tier still unlocks after the join flag is set", () => {
  const milestones = [
    { id: "old", stat: "mined", name: "Old", tiers: [1, 2, 3] },
    { id: "neu", stat: "mined", name: "Neu", tiers: [1, 2, 3] },
  ];
  const record = { n: "Ada", c: { mined: 100 }, g: { old: 3 }, tf: 1, legacy: 4 };
  const player = { id: "ada", name: "Ada", sendMessage() {}, playSound() {} };
  const session = milestoneSession(record, milestones, () => 100);
  session.check(player);
  const titles = session.events.filter((e) => e.id === "realm:title_unlock").map((e) => JSON.parse(e.payload).title);
  assert.deepEqual(titles, ["Neu 3"]);
  assert.equal(record.legacy, 4);
});

test("guard: goals thank-you letters stay at 10 for the top contributors", () => {
  const box = recorder();
  const goal = { id: 7, n: "Lanterns", item: "minecraft:torch", target: 100, c: { "*": ["others", 999] } };
  for (let i = 0; i < 15; i++) goal.c["p" + i] = ["Name" + i, i + 1];
  const api = evalPack(pack("goals_bp"), ["celebrate"], ["gossip"], {
    ...box,
    OTHERS: "*",
        TITLE_MAX: 32,
        plain: (s) => s,
    itemName: (id) => id,
    fmt: (n) => String(n),
    get: () => 20,
    CONFIG: { topContributors: 5 },
    console,
  });
  api.celebrate(goal);
  const letters = box.events.filter((e) => e.id === "realm:mail_send").map((e) => JSON.parse(e.payload).to);
  assert.equal(letters.length, 10);
  assert.deepEqual(letters, ["p14", "p13", "p12", "p11", "p10", "p9", "p8", "p7", "p6", "p5"]);
  assert.equal(letters.includes("*"), false);
  assert.equal(count(box.events, "realm:title_unlock"), 1);
});
