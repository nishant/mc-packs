// O62: the chat announcement of a clear starts from a chosen level (rewards unchanged). The production finish() and
// announceClear() run in a vm. EXPEDITION_SRC points at another copy of packs/expedition_bp/scripts (the RED run reads
// the base commit's files).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const dir = process.env.EXPEDITION_SRC ? `${process.env.EXPEDITION_SRC}/` : new URL("../packs/expedition_bp/scripts/", import.meta.url).href;
const mainSource = process.env.EXPEDITION_SRC ? readFileSync(`${dir}main.js`, "utf8") : readFileSync(new URL("main.js", dir), "utf8");
const scripts = new URL("../packs/expedition_bp/scripts/", import.meta.url);
const { CONFIG } = await import(new URL("config.js", scripts).href);
const layout = await import(new URL("layout.js", scripts).href);

function fn(name) {
  const m = mainSource.match(new RegExp(`^(?:export )?function ${name}\\([\\s\\S]*?^\\}`, "m"));
  assert.ok(m, `production ${name}`);
  return m[0];
}

function clear(level, from) {
  const log = { chat: [], pay: [], send: [], prog: [], tell: [] };
  const player = { id: "p1", name: "Ann", onScreenDisplay: { setTitle() {} }, playSound() {}, sendMessage() {} };
  const prog = { c: 0, b: -1, r: [], u: 0 };
  const own = {
    world: { sendMessage: (m) => log.chat.push(m) },
    system: { currentTick: 1000, sendScriptEvent() {} },
    CONFIG,
    get: (k) => (k === "announceFromLevel" ? from : k === "exitSeconds" ? 90 : undefined),
    gameMs: () => 61000,
    clock: () => "1:01",
    online: () => player,
    progressOf: () => prog,
    bestFor: () => ({}),
    payCrowns: (_p, n, why) => log.pay.push([n, why]),
    send: (id, m) => log.send.push([id, m.player, m.id ?? m.amount ?? m.entry ?? m.relic]),
    writePlayer: (_p, _k, v) => log.prog.push(JSON.stringify(v)),
    tell: (_r, m) => log.tell.push(m),
    hasFlag: () => false,
    maxTier: () => 20,
    readJson: () => undefined,
    dungeonLabel: (d, L) => `${d.name} (${layout.levelName(L)})`,
    levelName: layout.levelName,
    levelShort: layout.levelShort,
    levelKey: layout.levelKey,
    tierOf: layout.tierOf,
    Date: { now: () => 5 },
    Math: Object.assign(Object.create(Math), { random: () => 0.99 }),
  };
  const stubs = new Proxy(own, {
    has: () => true,
    get: (t, k) => (typeof k === "symbol" ? undefined : k in t ? t[k] : k in globalThis ? globalThis[k] : () => undefined),
  });
  const code = `(function () { with (__p) { ${fn("finish")}\n${mainSource.includes("function announceClear(") ? fn("announceClear") : ""}\nreturn finish; } })()`;
  const finish = vm.runInContext(code, vm.createContext({ __p: stubs }));
  const run = {
    phase: "active", started: 0, mobs: [], extra: [], hazards: [], lay: { n: 6 }, dungeon: CONFIG.dungeons[0], level: level, s: { crowns: 1, t: Math.max(0, level - 2), relic: 0, loot: 1 },
    members: new Map([["p1", { name: "Ann" }]]), affixes: [], cursed: false, long: false, leaderName: "Ann",
  };
  finish(run);
  return log;
}

test("every clear is announced by default (and for each level at or above the chosen one)", () => {
  for (const L of [0, 1, 2, 3, 5, 22]) assert.equal(clear(L, "0").chat.length, 1, `default, level ${L}`);
  for (const [from, L, count] of [["3", 2, 0], ["3", 3, 1], ["3", 22, 1], ["22", 21, 0], ["22", 22, 1], ["2", 1, 0], ["2", 2, 1]]) assert.equal(clear(L, from).chat.length, count, `from ${from}, level ${L}`);
});

test("a setting that is missing or unreadable keeps announcing every clear", () => {
  assert.equal(clear(0, undefined).chat.length, 1);
  assert.equal(clear(0, "junk").chat.length, 1);
});

test("the threshold changes the world chat line only: rewards, events, progress and the party message are the same", () => {
  for (const L of [0, 1, 2, 3, 7]) {
    const open = clear(L, "0");
    const shut = clear(L, "22");
    assert.equal(shut.chat.length, L >= 22 ? 1 : 0);
    assert.deepEqual({ ...shut, chat: [] }, { ...open, chat: [] }, `level ${L}`);
    assert.ok(open.pay.length === 1 && open.prog.length === 1 && open.tell.length === 1);
  }
});
