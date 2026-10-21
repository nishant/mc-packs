// Audit O6: realm:hud_state is sent as {part, parts, seq, players} (it listed only 100 players), and Stats and Party join the parts.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const STATE = "realm:hud_state";
const ids = (a, b) => Array.from({ length: b - a }, (_, i) => String(1000000000000000000n + BigInt(a + i)));
const bytes = (s) => Buffer.byteLength(s, "utf8");
const lines = (sim, key) => sim.game.sent.filter((m) => m.id === "realm:hud_line").map((m) => JSON.parse(m.message)).filter((m) => m.key === key);
const stateMsgs = (sim) => sim.game.sent.filter((m) => m.id === STATE).map((m) => JSON.parse(m.message));

async function producer(count) {
  const sim = createSim();
  await sim.load("hud_bp");
  sim.server.world.getDay = () => 0;
  sim.boot();
  for (let i = 0; i < count; i++) {
    const p = sim.join(`P${i}`, { id: String(1000000000000000000n + BigInt(i)) });
    p.getRotation = () => ({ x: 0, y: 0 });
    p.setDynamicProperty("hud:pref", JSON.stringify({ on: true }));
  }
  sim.step(1);
  sim.game.sent.length = 0;
  sim.step(25);
  return sim;
}

async function stats(count) {
  const sim = createSim();
  await sim.load("stats_bp");
  const objective = { getScore: () => 0, getScores: () => [], setScore() {}, addScore() {} };
  sim.server.world.scoreboard = { getObjective: () => objective, addObjective: () => objective, setObjectiveAtDisplaySlot() {}, clearObjectiveAtDisplaySlot() {} };
  sim.boot();
  for (let i = 0; i < count; i++) sim.join(`P${i}`, { id: String(1000000000000000000n + BigInt(i)) });
  sim.step(1);
  sim.game.sent.length = 0;
  return sim;
}

async function party(count) {
  const sim = createSim();
  const m = [["a", "Ann", 5], ["b", "Bob", 5]];
  sim.props.set("party:p:ABCDEF", JSON.stringify({ l: "a", m }));
  await sim.load("party_bp");
  sim.boot();
  const a = sim.join("Ann", { id: "a" });
  sim.join("Bob", { id: "b" });
  a.setDynamicProperty("party:code", "ABCDEF");
  for (let i = 0; i < count; i++) sim.join(`P${i}`, { id: String(i) });
  sim.step(1);
  return { sim, a };
}

const send = (sim, msg) => sim.game.deliver(STATE, typeof msg === "string" ? msg : JSON.stringify(msg));
const statsHud = (sim, id, steps = 45) => {
  sim.game.sent.length = 0;
  sim.step(steps);
  return lines(sim, "stats").some((m) => m.player === id && m.text);
};

test("producer: 250 viewing players are all published in parts, each message under 2048 bytes", async () => {
  const sim = await producer(250);
  sim.game.sent.length = 0;
  sim.game.emit("system.after.scriptEventReceive", {});
  sim.game.deliver("realm:hud_ping", "{}");
  sim.step(1);
  const raw = sim.game.sent.filter((m) => m.id === STATE);
  assert.ok(raw.length > 1, "more than one part");
  for (const m of raw) assert.ok(bytes(m.message) < 2048, `${bytes(m.message)} bytes`);
  const parsed = raw.map((m) => JSON.parse(m.message));
  assert.ok(parsed.every((m) => m.parts === parsed.length && new Set(parsed.map((p) => p.seq)).size === 1));
  assert.deepEqual(parsed.map((m) => m.part), parsed.map((_, i) => i + 1));
  assert.deepEqual(parsed.flatMap((m) => m.players), ids(0, 250));
});

test("producer: a long variable player id still keeps every part under the bound", async () => {
  const sim = createSim();
  await sim.load("hud_bp");
  sim.server.world.getDay = () => 0;
  sim.boot();
  for (let i = 0; i < 120; i++) {
    const p = sim.join(`P${i}`, { id: `${"x".repeat(40)}-${i}-\u00e9` });
    p.getRotation = () => ({ x: 0, y: 0 });
    p.setDynamicProperty("hud:pref", JSON.stringify({ on: true }));
  }
  sim.step(25);
  const raw = sim.game.sent.filter((m) => m.id === STATE);
  assert.ok(raw.length > 1);
  for (const m of raw) assert.ok(bytes(m.message) < 2048);
  assert.equal(stateMsgs(sim).slice(-raw.length).flatMap((m) => m.players).length, 120);
});

// F15: the old split re-encoded the whole growing part for every id (O(n^2) characters); the parts must be the same
// as that greedy split, while encoding each id about once.
function referenceSplit(players, seq) {
  const envelope = (list, part, parts) => JSON.stringify({ part, parts, seq, players: list });
  const chunks = [[]];
  for (const id of players) {
    const last = chunks.at(-1);
    if (bytes(envelope([id], 9999, 9999)) > 1900) continue;
    if (last.length && bytes(envelope([...last, id], 9999, 9999)) > 1900) chunks.push([id]);
    else last.push(id);
  }
  return chunks.map((list, i) => envelope(list, i + 1, chunks.length));
}

test("producer: parts match the greedy split for mixed ids and encode each id about once (F15)", async () => {
  const sim = createSim();
  await sim.load("hud_bp");
  sim.server.world.getDay = () => 0;
  sim.boot();
  const odd = ["\u00e9", "\u4e2d", "\ud83d\ude00", '"', "\\", "\u0001"];
  const joined = [];
  for (let i = 0; i < 300; i++) {
    const id = `${"y".repeat(i % 37)}${odd[i % odd.length]}${i}`;
    joined.push(id);
    const p = sim.join(`P${i}`, { id });
    p.getRotation = () => ({ x: 0, y: 0 });
    p.setDynamicProperty("hud:pref", JSON.stringify({ on: true }));
  }
  sim.step(25);
  sim.game.sent.length = 0;
  const real = JSON.stringify;
  let encoded = 0;
  JSON.stringify = function (...args) {
    const out = real.apply(this, args);
    if (typeof out === "string") encoded += out.length;
    return out;
  };
  try {
    sim.game.deliver("realm:hud_ping", "{}");
  } finally {
    JSON.stringify = real;
  }
  const raw = sim.game.sent.filter((m) => m.id === STATE).map((m) => m.message);
  assert.ok(raw.length > 2, `${raw.length} parts`);
  const seq = JSON.parse(raw[0]).seq;
  assert.deepEqual(raw, referenceSplit(joined, seq));
  const total = raw.reduce((n, m) => n + m.length, 0);
  assert.ok(encoded < total * 4, `encoded ${encoded} characters for ${total} sent`);
});

test("producer: nobody viewing sends one empty part", async () => {
  const sim = await producer(0);
  sim.game.deliver("realm:hud_ping", "{}");
  sim.step(1);
  const m = stateMsgs(sim).at(-1);
  assert.equal(m.parts, 1);
  assert.deepEqual(m.players, []);
});

test("stats: joins parts, covering players beyond the first 100", async () => {
  const sim = await stats(300);
  const all = ids(0, 300);
  [all.slice(0, 120), all.slice(120, 240), all.slice(240)].forEach((players, i) => send(sim, { part: i + 1, parts: 3, seq: 1, players }));
  for (const i of [299, 150, 5]) assert.ok(statsHud(sim, all[i]), `player ${i} is on the HUD`);
});
test("stats: parts out of order and duplicated assemble; a missing part publishes nothing", async () => {
  const sim = await stats(6);
  const all = ids(0, 6);
  send(sim, { part: 2, parts: 2, seq: 1, players: all.slice(3) });
  send(sim, { part: 2, parts: 2, seq: 1, players: all.slice(3) });
  assert.equal(statsHud(sim, all[4]), false, "half a list is not a list");
  send(sim, { part: 1, parts: 2, seq: 1, players: all.slice(0, 3) });
  assert.ok(statsHud(sim, all[4]));
  assert.ok(statsHud(sim, all[0]));
});

test("stats: a new full state replaces removed players and a stale half does not mix with it", async () => {
  const sim = await stats(6);
  const all = ids(0, 6);
  send(sim, { part: 1, parts: 2, seq: 1, players: [all[0]] });
  send(sim, { part: 2, parts: 2, seq: 1, players: [all[1]] });
  assert.ok(statsHud(sim, all[1]));
  send(sim, { part: 1, parts: 2, seq: 2, players: [all[2]] });
  send(sim, { part: 2, parts: 2, seq: 1, players: [all[3]] }); // stale part of the earlier publication
  assert.equal(statsHud(sim, all[3]), false, "stale part never joins seq 2");
  assert.ok(statsHud(sim, all[1]), "old list stays until the new one is whole");
  send(sim, { part: 2, parts: 2, seq: 2, players: [all[4]] });
  assert.ok(statsHud(sim, all[2]));
  assert.ok(statsHud(sim, all[4]));
  assert.equal(statsHud(sim, all[1]), false, "removed player is gone");
});

test("stats: old one-message state and an empty list still work, and a lost HUD goes stale", async () => {
  const sim = await stats(3);
  const all = ids(0, 3);
  send(sim, { players: [all[0]] });
  assert.ok(statsHud(sim, all[0]));
  send(sim, { part: 1, parts: 1, players: [] });
  assert.equal(statsHud(sim, all[0], 5), false);
  send(sim, { players: [all[0]] });
  sim.step(260);
  assert.equal(statsHud(sim, all[0]), false, "no state for 10 seconds: back to the bar");
});

test("stats: malformed parts are ignored without clearing the state", async () => {
  const sim = await stats(3);
  const all = ids(0, 3);
  send(sim, { players: [all[0]] });
  for (const bad of [{ part: 0, parts: 2, players: ["x"] }, { part: 3, parts: 2, players: ["x"] }, { part: 1, parts: "no", players: ["x"] }, "not json", { parts: 2 }]) send(sim, bad);
  assert.ok(statsHud(sim, all[0]));
});

test("party: the party line goes under the HUD only for players in the joined parts, and parts replace stale state", async () => {
  const { sim } = await party(0);
  const seen = (steps = 45) => {
    sim.game.sent.length = 0;
    sim.step(steps);
    return lines(sim, "party").some((m) => m.player === "a");
  };
  send(sim, { part: 2, parts: 2, seq: 1, players: ["a"] });
  assert.equal(seen(), false, "one part alone is not a state");
  send(sim, { part: 1, parts: 2, seq: 1, players: ["z"] });
  assert.ok(seen(), "a is in part 2");
  send(sim, { part: 1, parts: 2, seq: 2, players: ["z"] });
  send(sim, { part: 2, parts: 2, seq: 2, players: [] });
  assert.equal(seen(), false, "removed from the new full state");
  send(sim, { players: ["a"] });
  assert.ok(seen(), "the old single message still works");
});

test("party: more than 100 viewers, the player is far down the list", async () => {
  const { sim } = await party(0);
  const filler = ids(0, 400);
  send(sim, { part: 1, parts: 3, seq: 9, players: filler.slice(0, 200) });
  send(sim, { part: 2, parts: 3, seq: 9, players: filler.slice(200) });
  send(sim, { part: 3, parts: 3, seq: 9, players: ["a"] });
  sim.game.sent.length = 0;
  sim.step(45);
  assert.ok(lines(sim, "party").some((m) => m.player === "a"));
});

test("stats: a late full replay of an older publication does not replace the current list, but a restarted HUD recovers", async () => {
  const sim = await stats(6);
  const all = ids(0, 6);
  send(sim, { part: 1, parts: 2, seq: 5, players: [all[0]] });
  send(sim, { part: 2, parts: 2, seq: 5, players: [all[1]] });
  send(sim, { part: 1, parts: 2, seq: 6, players: [all[2]] });
  send(sim, { part: 2, parts: 2, seq: 6, players: [all[3]] });
  send(sim, { part: 1, parts: 2, seq: 5, players: [all[0]] });
  send(sim, { part: 2, parts: 2, seq: 5, players: [all[1]] });
  send(sim, { part: 1, parts: 1, seq: 4, players: [all[4]] });
  send(sim, { part: 1, parts: 1, seq: 1, players: [all[4]] }); // a restart, inside the window
  assert.ok(statsHud(sim, all[3]), "seq 6 stays");
  assert.equal(statsHud(sim, all[1]), false, "replayed seq 5 rejected");
  assert.equal(statsHud(sim, all[4]), false, "replayed seq 4 and restarted seq 1 still rejected inside the window");
  sim.step(220);
  send(sim, { part: 1, parts: 1, seq: 1, players: [all[4]] });
  assert.ok(statsHud(sim, all[4]), "restarted HUD accepted after the window");
});

test("stats: part and parts must be real integers; malformed messages leave an in-flight assembly alone", async () => {
  const sim = await stats(6);
  const all = ids(0, 6);
  send(sim, { part: 1, parts: 2, seq: 1, players: [all[0]] });
  for (const bad of [{ part: true, parts: 2 }, { part: 2.5, parts: 2 }, { part: "2", parts: 2 }, { part: 2, parts: "2" }, { part: 0, parts: 2 }, { part: 3, parts: 2 }, { part: 1, parts: 1.5 }, { part: 1, parts: 5000 }, { part: null, parts: 2 }])
    send(sim, { seq: 1, players: [all[5]], ...bad });
  assert.equal(statsHud(sim, all[5]), false, "no malformed part was accepted");
  send(sim, { part: 2, parts: 2, seq: 1, players: [all[1]] });
  assert.ok(statsHud(sim, all[0]), "the valid assembly survived");
  assert.ok(statsHud(sim, all[1]));
});

test("party: late older replay is rejected, malformed fields are ignored", async () => {
  const { sim } = await party(0);
  const seen = () => {
    sim.game.sent.length = 0;
    sim.step(45);
    return lines(sim, "party").some((m) => m.player === "a");
  };
  send(sim, { part: 1, parts: 2, seq: 3, players: ["z"] });
  send(sim, { part: "2", parts: 2, seq: 3, players: ["a"] });
  send(sim, { part: true, parts: 2, seq: 3, players: ["a"] });
  assert.equal(seen(), false);
  send(sim, { part: 2, parts: 2, seq: 3, players: ["a"] });
  assert.ok(seen());
  send(sim, { part: 1, parts: 2, seq: 4, players: ["z"] });
  send(sim, { part: 2, parts: 2, seq: 4, players: [] });
  send(sim, { part: 1, parts: 2, seq: 3, players: ["z"] });
  send(sim, { part: 2, parts: 2, seq: 3, players: ["a"] });
  assert.equal(seen(), false, "seq 3 replay cannot bring a back");
});

test("end to end: the real HUD's parts feed the real Stats", async () => {
  const hud = await producer(250);
  hud.game.sent.length = 0;
  hud.game.deliver("realm:hud_ping", "{}");
  hud.step(1);
  const msgs = hud.game.sent.filter((m) => m.id === STATE);
  const sim = await stats(250);
  for (const m of [...msgs].reverse()) send(sim, m.message);
  assert.ok(statsHud(sim, ids(0, 250)[249]));
  assert.ok(statsHud(sim, ids(0, 250)[3]));
});

test("realm:hud_state repeats only while someone sees the HUD: an empty list is sent once, then not every 5 seconds (W1)", async () => {
  const sim = createSim();
  await sim.load("hud_bp");
  sim.server.world.getDay = () => 0;
  sim.boot();
  const players = Array.from({ length: 5 }, (_, i) => {
    const p = sim.join(`P${i}`, { id: String(i) });
    p.getRotation = () => ({ x: 0, y: 0 });
    return p;
  });
  sim.step(1);
  sim.game.sent.length = 0;
  sim.step(400);
  assert.equal(stateMsgs(sim).length, 0, "nobody sees the HUD: nothing to repeat");
  // One player turns it on: the list goes out, and is repeated while it lasts.
  players[0].setDynamicProperty("hud:pref", JSON.stringify({ on: true }));
  sim.step(300);
  const on = stateMsgs(sim);
  assert.ok(on.length >= 3 && on.every((m) => m.players.includes("0")), `the list is sent and kept alive (${on.length})`);
  // Off again: the empty list is sent once, and then nothing.
  players[0].setDynamicProperty("hud:pref", JSON.stringify({ on: false }));
  sim.game.sent.length = 0;
  sim.step(400);
  const off = stateMsgs(sim);
  assert.equal(off.length, 1, `one empty list (${off.length})`);
  assert.deepEqual(off[0].players, []);
});
