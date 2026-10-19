// O8: expeditions stay at 3 dungeons (the world's 10 ticking areas are shared) and a real, bounded line takes over: a
// party that finds every dungeon busy waits, and the next waiting party starts by itself when a slot genuinely frees.
// The production queue block of main.js (between its begin/end markers) runs against fakes of the game and of the
// parts of main.js it calls; the wiring of the rest is checked against the production source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const scripts = new URL("../packs/expedition_bp/scripts/", import.meta.url);
const srcDir = process.env.EXPEDITION_SRC ? `${process.env.EXPEDITION_SRC}/` : undefined;
const mainSource = readFileSync(srcDir ? `${srcDir}main.js` : new URL("main.js", scripts), "utf8");
const begin = mainSource.indexOf("// expedition queue begin");
const end = mainSource.indexOf("// expedition queue end");
assert.ok(begin >= 0 && end > begin, "production queue block");
const block = mainSource.slice(begin, end);

function world({ slots = 3, site = true } = {}) {
  const w = { tick: 0, interval: undefined, jobs: [], warns: [], resets: 0, started: [], cfg: { enabled: true, gauntletEnabled: true }, slots, site: site ? { x: 0, z: 0 } : undefined };
  const players = new Map();
  const runs = new Map();
  const system = {
    get currentTick() { return w.tick; },
    run(fn) { w.jobs.push(fn); },
    runInterval(fn) { w.interval = fn; },
  };
  w.player = (id, extra = {}) => {
    const p = { id, name: id, msgs: [], sigils: [], sendMessage(m) { this.msgs.push(m); }, ...extra };
    players.set(id, p);
    return p;
  };
  w.leave = (id) => players.delete(id);
  w.flush = () => { while (w.jobs.length) w.jobs.shift()(); };
  w.tickTo = (t) => { w.tick = t; if (w.interval) w.interval(); w.flush(); };
  w.runs = runs;
  const ctx = {
    console: { warn: (m) => w.warns.push(String(m)) },
    system, runs,
    get: (k) => (k === "slots" ? w.slots : w.cfg[k]),
    site: () => w.site,
    online: (id) => players.get(id),
    runOf: (id) => [...runs.values()].find((r) => r.members.has(id)),
    statusLine: (r) => `${r.leader}'s party`,
    sigilsOf: (p) => p.sigils.map((line) => ({ slot: 0, amount: 1, sig: { line } })),
    resetPending: () => { w.resets++; return Promise.resolve(); },
    freeSlot: () => { for (let s = 0; s < Math.max(1, Math.min(3, w.slots)); s++) if (!runs.has(s)) return s; return undefined; },
    // The production start() claims its slot before its first await and only after cantStart/slotBusy; this does the same.
    start: async (p, d, L, affixes, sigilLine, g, fromQueue = false) => {
      if (ctx.runOf(p.id)) return p.sendMessage("already");
      if (ctx.slotBusy(fromQueue)) return ctx.enqueue(p, d, L, affixes, sigilLine, g);
      const slot = ctx.freeSlot();
      runs.set(slot, { slot, leader: p.id, members: new Set([p.id]), d, L, sigilLine, fromQueue });
      w.started.push({ id: p.id, slot, d, L, sigilLine, fromQueue });
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${block}\nglobalThis.q = { queue, enqueue, dequeue, clearQueue, pumpQueue, slotBusy, freeRun, queuePlace, QUEUE_MAX, QUEUE_TICKS, QUEUE_RETRY };`, ctx);
  w.q = ctx.q;
  w.ctx = ctx;
  w.free = (slot) => w.q.freeRun(slot);
  w.fill = (n) => { for (let s = 0; s < n; s++) runs.set(s, { slot: s, leader: `L${s}`, members: new Set([`L${s}`]) }); };
  return w;
}
const crypt = { id: "crypt", name: "Crypt" };

test("a free dungeon starts at once; a full house waits in line instead of failing", async () => {
  const w = world();
  const a = w.player("a");
  await w.ctx.start(a, crypt, 1, [], undefined, undefined);
  assert.equal(w.started.length, 1);
  w.fill(3);
  w.runs.delete(0);
  w.runs.set(0, { slot: 0, leader: "L0", members: new Set(["L0"]) });
  const b = w.player("b");
  await w.ctx.start(b, crypt, 1, [], undefined, undefined);
  assert.equal(w.started.length, 1, "b did not start");
  assert.equal(w.q.queue.length, 1);
  assert.match(b.msgs.at(-1), /number 1 of 1 in line/);
});

test("a freed slot starts the next waiting party by itself, in order, one per free slot", async () => {
  const w = world();
  w.fill(3);
  const [a, b, c] = ["a", "b", "c"].map((id) => w.player(id));
  for (const p of [a, b, c]) await w.ctx.start(p, crypt, 1, [], undefined, undefined);
  assert.deepEqual(Array.from(w.q.queue, (q) => q.id), ["a", "b", "c"]);
  w.runs.delete(1);
  w.free(1);
  w.flush();
  assert.deepEqual(w.started.map((s) => [s.id, s.slot, s.fromQueue]), [["a", 1, true]]);
  assert.match(a.msgs.at(-1), /dungeon is free now/);
  assert.deepEqual(Array.from(w.q.queue, (q) => q.id), ["b", "c"]);
  w.runs.delete(0);
  w.runs.delete(2);
  w.free(0);
  w.flush();
  assert.deepEqual(w.started.map((s) => s.id), ["a", "b", "c"]);
  assert.equal(w.q.queue.length, 0);
});

test("fair: with a free slot and others waiting, a new request goes to the back; the line itself bypasses that", async () => {
  const w = world();
  w.fill(3);
  const [a, b] = ["a", "b"].map((id) => w.player(id));
  await w.ctx.start(a, crypt, 1, [], undefined, undefined);
  w.runs.delete(2); // free, the pump not yet run
  assert.equal(w.q.slotBusy(false), true);
  await w.ctx.start(b, crypt, 1, [], undefined, undefined);
  assert.deepEqual(Array.from(w.q.queue, (q) => q.id), ["a", "b"]);
  w.flush();
  w.q.pumpQueue();
  assert.deepEqual(w.started.map((s) => s.id), ["a"]);
});

test("repeated requests keep one place and replace the request; the line is bounded", async () => {
  const w = world();
  w.fill(3);
  const a = w.player("a");
  await w.ctx.start(a, crypt, 1, [], undefined, undefined);
  w.tick = 500;
  await w.ctx.start(a, { id: "vault", name: "Vault" }, 4, ["x"], undefined, { loadout: true });
  assert.equal(w.q.queue.length, 1);
  assert.equal(w.q.queue[0].d.id, "vault");
  assert.equal(w.q.queue[0].at, 0, "keeps its place and its wait");
  for (let i = 0; i < 12; i++) await w.ctx.start(w.player(`p${i}`), crypt, 1, [], undefined, undefined);
  assert.equal(w.q.queue.length, w.q.QUEUE_MAX);
  const over = w.player("over");
  await w.ctx.start(over, crypt, 1, [], undefined, undefined);
  assert.match(over.msgs.at(-1), /already waiting/);
  assert.equal(w.q.queue.length, w.q.QUEUE_MAX);
});

test("a leader who disconnects, joins another run, or leaves the line is dropped without starting", async () => {
  const w = world();
  w.fill(3);
  const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => w.player(id));
  for (const p of [a, b, c, d]) await w.ctx.start(p, crypt, 1, [], undefined, undefined);
  w.leave("a");
  w.q.dequeue("c");
  w.runs.set(0, { slot: 0, leader: "L0", members: new Set(["L0", "b"]) }); // b joined someone else's party
  w.runs.delete(1);
  w.free(1);
  w.flush();
  assert.deepEqual(w.started.map((s) => s.id), ["d"]);
  assert.match(b.msgs.at(-1), /joined an expedition/);
  assert.equal(w.q.queue.length, 0);
});

test("a party is dropped after 30 minutes, when expeditions or Gauntlets are disabled", async () => {
  const w = world();
  w.fill(3);
  const [a, b, c] = ["a", "b", "c"].map((id) => w.player(id));
  await w.ctx.start(a, crypt, 1, [], undefined, undefined);
  await w.ctx.start(b, crypt, 1, [], undefined, { loadout: false });
  w.tickTo(w.q.QUEUE_TICKS - 1);
  assert.equal(w.q.queue.length, 2);
  w.cfg.gauntletEnabled = false;
  w.tickTo(w.q.QUEUE_TICKS);
  assert.equal(w.q.queue.length, 0);
  assert.match(a.msgs.at(-1), /30 minutes/);
  assert.match(b.msgs.at(-1), /Gauntlets are disabled/);
  await w.ctx.start(c, crypt, 1, [], undefined, undefined);
  w.cfg.enabled = false;
  w.tickTo(w.q.QUEUE_TICKS + 100);
  assert.equal(w.q.queue.length, 0);
  assert.match(c.msgs.at(-1), /disabled/);
});

test("the interval starts a waiting party when the operators raise the slots; nothing starts with no site", async () => {
  const w = world({ slots: 1 });
  w.fill(1);
  const a = w.player("a");
  await w.ctx.start(a, crypt, 1, [], undefined, undefined);
  assert.equal(w.q.queue.length, 1);
  w.slots = 2;
  w.tickTo(100);
  assert.deepEqual(w.started.map((s) => [s.id, s.slot]), [["a", 1]]);
  const s = world();
  s.fill(3);
  const b = s.player("b");
  await s.ctx.start(b, crypt, 1, [], undefined, undefined);
  s.site = undefined;
  s.runs.clear();
  s.tickTo(100);
  assert.equal(s.started.length, 0);
  assert.equal(s.q.queue.length, 1);
});

test("a dungeon that failed to open holds the line for a minute instead of failing every party in turn", async () => {
  const w = world();
  w.fill(3);
  const [a, b] = ["a", "b"].map((id) => w.player(id));
  for (const p of [a, b]) await w.ctx.start(p, crypt, 1, [], undefined, undefined);
  w.runs.delete(0);
  w.q.freeRun(0, true);
  w.flush();
  w.tickTo(50);
  assert.equal(w.started.length, 0, "held");
  w.tickTo(w.q.QUEUE_RETRY);
  assert.deepEqual(w.started.map((s) => s.id), ["a", "b"].slice(0, 1));
  w.runs.delete(0);
  w.free(0);
  w.flush();
  assert.deepEqual(w.started.map((s) => s.id), ["a", "b"]);
});

test("a sigil is only checked while waiting, never taken; a request without it is refused", async () => {
  const w = world();
  w.fill(3);
  const a = w.player("a");
  await w.ctx.start(a, crypt, 3, [], "line-1", undefined);
  assert.equal(w.q.queue.length, 0);
  assert.match(a.msgs.at(-1), /isn't in your inventory/);
  a.sigils.push("line-1");
  await w.ctx.start(a, crypt, 3, [], "line-1", undefined);
  assert.equal(w.q.queue.length, 1);
  assert.deepEqual(a.sigils, ["line-1"], "still in the inventory");
  w.runs.delete(0);
  w.free(0);
  w.flush();
  assert.equal(w.started[0].sigilLine, "line-1");
});

test("an operator reset clears the line and tells every leader; a full house with only resetting boxes kicks the reset", async () => {
  const w = world();
  w.fill(3);
  const [a, b] = ["a", "b"].map((id) => w.player(id));
  for (const p of [a, b]) await w.ctx.start(p, crypt, 1, [], undefined, undefined);
  assert.equal(w.q.clearQueue("cleared"), 2);
  assert.equal(w.q.queue.length, 0);
  assert.equal(a.msgs.at(-1), "cleared");
  w.runs.clear();
  w.ctx.freeSlot = () => undefined; // every box still waiting to be filled in
  await w.ctx.start(b, crypt, 1, [], undefined, undefined);
  assert.equal(w.resets, 1);
});

test("wiring: the line is the only wait; slots stay 1-3, the release is the queue, the lifecycle clears it", () => {
  assert.match(mainSource, /Math\.min\(3, get\("slots"\)\)/);
  assert.doesNotMatch(mainSource, /waiting\.set|slotFreed/, "the message-only wait is gone");
  const startAt = mainSource.indexOf("async function start(");
  const startBody = mainSource.slice(startAt, mainSource.indexOf("async function", startAt + 10));
  assert.ok(startBody.indexOf("slotBusy(fromQueue)") > 0 && startBody.indexOf("slotBusy(fromQueue)") < startBody.indexOf("useSigil("), "the line is checked before a sigil is taken");
  assert.match(mainSource, /playerLeave\.subscribe\(\(\{ playerId \}\) => \{\n {2}dequeue\(playerId\);/);
  assert.match(mainSource, /freeRun\(run\.slot, true\);[\s\S]{0,60}refundSigil\(run\);[\s\S]{0,40}return;\n {2}\}\n {2}run\.checked = true;/, "a site that can't be built on holds the line");
  assert.match(mainSource, /system\.run\(pumpQueue\);/, "a finished reset starts the next party");
  assert.match(mainSource, /async function opReset[\s\S]{0,200}clearQueue\(/);
});
