// O8: expeditions stay at 3 dungeons (the world's 10 ticking areas are shared) and a real, bounded line takes over: a
// party that finds every dungeon busy waits, and the next waiting party starts by itself when a slot genuinely frees.
// The production queue module (queue.js) is imported as it ships and runs against fakes of the game and of the parts
// of main.js it calls; the wiring of the rest is checked against the production source.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const scripts = new URL("../packs/expedition_bp/scripts/", import.meta.url);
const srcDir = process.env.EXPEDITION_SRC ? `${process.env.EXPEDITION_SRC}/` : undefined;
const mainSource = readFileSync(srcDir ? `${srcDir}main.js` : new URL("main.js", scripts), "utf8").replace(/\r\n/g, "\n");
// EXPEDITION_SRC may be a copy from before queue.js and forget.js existed: those fall back to the shipped modules, so a
// fail-before run fails on the main.js wiring assertions instead of crashing on import.
const moduleUrl = (f) => (srcDir && existsSync(`${srcDir}${f}`) ? pathToFileURL(`${srcDir}${f}`).href : new URL(f, scripts).href);
const { createQueue, QUEUE_MAX, QUEUE_TICKS, QUEUE_RETRY } = await import(moduleUrl("queue.js"));
const { createForget } = await import(moduleUrl("forget.js"));
const fnSrc = (name) => {
  const m = new RegExp(`^(async )?function ${name}\\(`, "m").exec(mainSource);
  assert.ok(m, `production function ${name}`);
  const close = mainSource.indexOf("\n}\n", m.index);
  assert.ok(close > m.index, `production function ${name} has a closing brace`);
  const src = mainSource.slice(m.index, close + 3);
  assert.ok(src.length > 40, `production function ${name} is not empty`);
  return src;
};

// The production start, cantStart, freeSlot, leave, preview, show, resetPending, prepare and the forget hook, run against fakes of
// what they call; start stops at layout() (after the sigil and the slot), which is all the queue decisions need.
function realParts(w, ctx, players, runs) {
  w.sigilsUsed = [];
  w.sentBack = [];
  w.msgsToOps = [];
  w.saving = [];
  w.pending = new Map();
  w.screens = [];
  w.crowns = new Map();
  w.removedAreas = [];
  w.reset = true;
  w.loaded = false;
  w.foreign = undefined;
  Object.assign(ctx, {
    pending: w.pending,
    PROP_NEXT: "next", PROP_RETURN: "return", PROP_RUN: "run", PROP_ROLLS: "rolls",
    unlockedLevel: () => 9,
    levelName: (L) => `L${L}`,
    levelKey: (L) => `L${L}`,
    slotFits: () => true,
    maxSizeAt: () => 100,
    useSigil: (p, line) => (w.sigilsUsed.push(line), { line }),
    layout: () => { throw new Error("STOP"); },
    world: {
      getDynamicProperty: () => 1,
      setDynamicProperty: () => {},
      getAllPlayers: () => [...players.values()],
      structureManager: { getWorldStructureIds: () => [] },
    },
    isOp: (p) => p.isOp === true,
    forgetStructures: () => ({ deleted: 0, kept: 0 }),
    handingOver: () => false,
    setSaving: (on) => w.saving.push(on),
    sendBack: (p) => w.sentBack.push(p.id),
    tell: () => {},
    dropMember: () => {},
    sleep: () => Promise.resolve(),
    FormCancelationReason: { UserBusy: "UserBusy" },
    describe: () => "",
    dungeonLabel: (d, L) => `${d.name} L${L}`,
    prettyId: (s) => s,
    rollAffixes: () => ["fresh"],
    affixOf: () => ({}),
    readPlayer: (p) => p.rolls ?? undefined,
    writePlayer: (p, _k, v) => { p.rolls = v; },
    crownsOf: (p) => w.crowns.get(p.id) ?? 0,
    crownsObjective: () => ({ addScore: (p, n) => w.crowns.set(p.id, (w.crowns.get(p.id) ?? 0) + n) }),
    ActionFormData: class {
      constructor() { this.buttons = []; }
      title() { return this; }
      body() { return this; }
      button(t) { this.buttons.push(t); return this; }
      async show() {
        const step = w.screens.shift();
        const sel = step ? step(this.buttons) : undefined;
        return sel === undefined ? { canceled: true } : { canceled: false, selection: sel };
      }
    },
    rolled: (p, L) => p.rolls?.[`L${L}`] ?? ["old"],
    resetBox: async () => w.reset,
    writeJson: () => {},
    addArea: () => true,
    removeArea: (slot) => w.removedAreas.push(slot),
    waitLoaded: async () => w.loaded,
    findForeign: () => w.foreign,
    refundSigil: () => {},
  });
  vm.runInContext("let resettingPending; const toldPending = new Set();", ctx);
  vm.runInContext(["freeSlot", "cantStart", "start", "leave", "show", "preview", "resetPending", "prepare"].map(fnSrc).join("\n"), ctx);
  // The production forget hook (forget.js), wired the way main.js wires it.
  ctx.forget = createForget({
    world: ctx.world, system: ctx.system, isOp: ctx.isOp, forgetStructures: ctx.forgetStructures, handingOver: ctx.handingOver,
    setSaving: ctx.setSaving, clearQueue: (text) => ctx.clearQueue(text), warn: ctx.console.warn,
  });
  ctx.__realmDiagForgetHooks = { expedition_bp: ctx.forget.onForget };
}

function world({ slots = 3, site = true, real = false } = {}) {
  const w = { tick: 0, interval: undefined, jobs: [], warns: [], resets: 0, started: [], cfg: { enabled: true, gauntletEnabled: true }, slots, site: site ? { x: 0, z: 0 } : undefined };
  const players = new Map();
  const runs = new Map();
  const system = {
    get currentTick() { return w.tick; },
    run(fn) { w.jobs.push(fn); },
    runInterval(fn) { w.interval = fn; },
  };
  w.player = (id, extra = {}) => {
    const p = { id, name: id, msgs: [], sigils: [], isValid: true, getDynamicProperty: (k) => p.props?.[k], sendMessage(m) { this.msgs.push(m); }, ...extra };
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
  // Every dependency is looked up in ctx when it is called, so a test can swap one (freeSlot) and the sliced
  // production functions (real: start, cantStart...) are the ones the line calls.
  const q = createQueue({
    system, runs,
    get: (k) => ctx.get(k),
    site: () => ctx.site(),
    online: (id) => ctx.online(id),
    runOf: (id) => ctx.runOf(id),
    statusLine: (r) => ctx.statusLine(r),
    sigilsOf: (p) => ctx.sigilsOf(p),
    freeSlot: () => ctx.freeSlot(),
    start: (...a) => ctx.start(...a),
    resetPending: () => ctx.resetPending(),
    cantStart: (p) => ctx.cantStart(p),
    forgotten: () => (ctx.forget ? ctx.forget.forgotten() : false),
  });
  system.runInterval(q.pumpQueue, 100);
  Object.assign(ctx, q);
  ctx.q = { ...q, QUEUE_MAX, QUEUE_TICKS, QUEUE_RETRY };
  if (real) realParts(w, ctx, players, runs);
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
  assert.match(mainSource, /if \(!Array\.isArray\(kept\) \|\| \(kept\.length === affixes\.length[\s\S]{0,160}delete rolls\[levelKey\(L\)\]/, "a newer roll isn't deleted by a start that used older affixes");
  assert.match(mainSource, /async function opReset[\s\S]{0,200}clearQueue\(/);
  // The line is queue.js as it ships (imported above), made once in main.js with the pack's own parts and pumped every 5 s.
  assert.match(mainSource, /^import \{ createQueue \} from "\.\/queue\.js";$/m);
  // Every dependency by name and in order, so a dep left out (cantStart: forgotten()'s refusal) or swapped is caught.
  const wiring = [
    "const { queue, queuePlace, dequeue, clearQueue, slotBusy, enqueue, pumpQueue, freeRun } = createQueue({",
    ...["system", "get", "site", "online", "runs", "runOf", "statusLine", "sigilsOf", "freeSlot", "start", "resetPending", "cantStart", "forgotten: forget.forgotten"].map((d) => `  ${d},`),
    "});",
    "system.runInterval(pumpQueue, 100);",
  ].join("\n");
  assert.ok(mainSource.includes(`\n${wiring}`), "main.js wires createQueue with exactly the pack's own parts");
  assert.match(mainSource, /forgotten: forget\.forgotten,/);
  assert.doesNotMatch(mainSource, /^const QUEUE_|^let queueHold/m, "no second copy of the line in main.js");
});

const startReal = async (w, p, L = 1, affixes = [], sigil, g) => {
  try {
    await w.ctx.start(p, crypt, L, affixes, sigil, g);
  } catch (e) {
    assert.equal(e.message, "STOP", "production start ran up to layout()");
    return "started";
  }
  return "returned";
};

test("production start: a full house queues before any sigil is taken; a free dungeon goes on to take it; hard blocks still refuse", async () => {
  const w = world({ real: true });
  w.fill(3);
  const a = w.player("a", { sigils: ["line-1"] });
  assert.equal(await startReal(w, a, 3, [], "line-1"), "returned");
  assert.equal(w.q.queue.length, 1);
  assert.deepEqual(w.sigilsUsed, [], "the sigil is not taken while waiting");
  w.runs.delete(1);
  assert.equal(await startReal(w, w.player("b", { sigils: ["line-2"] }), 3, [], "line-2"), "returned", "a new request goes behind the line");
  assert.equal(w.q.queue.length, 2);
  w.q.queue.splice(0);
  assert.equal(await startReal(w, a, 3, [], "line-1"), "started");
  assert.deepEqual(w.sigilsUsed, ["line-1"]);
  w.cfg.enabled = false;
  const c = w.player("c");
  await w.ctx.start(c, crypt, 1, [], undefined, undefined);
  assert.match(c.msgs.at(-1), /disabled/);
  assert.equal(w.q.queue.length, 0);
});

test("production leave: leaves the line, says so, and still sends a returning player back", () => {
  const w = world({ real: true });
  w.fill(3);
  const a = w.player("a");
  w.q.enqueue(a, crypt, 1, [], undefined, undefined);
  w.ctx.leave(a);
  assert.equal(w.q.queue.length, 0);
  assert.match(a.msgs.at(-1), /out of the line/);
  w.ctx.leave(a);
  assert.match(a.msgs.at(-1), /not on an expedition/);
  const b = w.player("b", { props: { return: "{}" } });
  w.q.enqueue(b, crypt, 1, [], undefined, undefined);
  w.ctx.leave(b);
  assert.equal(w.q.queue.length, 0);
  assert.deepEqual(w.sentBack, ["b"]);
});

test("production preview: while queued a paid reroll is refused before any debit, also from a preview opened before the party was queued", async () => {
  const w = world({ real: true });
  w.fill(3);
  w.cfg.rerollCost = 50;
  const a = w.player("a", { rolls: { L3: ["x"] } });
  w.crowns.set("a", 200);
  const reroll = (btns) => btns.findIndex((b) => b.startsWith("Reroll"));
  const back = (btns) => btns.length - 1;
  // queued first, then a preview is opened and Reroll is tapped
  w.q.enqueue(a, crypt, 3, ["x"], undefined, undefined);
  w.screens.push((b) => { assert.ok(b.includes("Leave the line")); return reroll(b); }, (b) => back(b));
  await w.ctx.preview(a, crypt, 3);
  assert.equal(w.crowns.get("a"), 200, "no Crowns taken");
  assert.deepEqual(a.rolls.L3, ["x"], "the queued affixes stay the shown roll");
  assert.match(a.msgs.at(-1), /Leave the line before rerolling/, a.msgs.join(" | "));
  // a preview opened while not queued, the party gets queued while the form is open
  w.q.dequeue("a");
  w.screens.push((b) => { w.q.enqueue(a, crypt, 3, ["x"], undefined, undefined); return reroll(b); }, (b) => back(b));
  await w.ctx.preview(a, crypt, 3);
  assert.equal(w.crowns.get("a"), 200, "a stale preview doesn't debit either");
  assert.deepEqual(a.rolls.L3, ["x"]);
  // not queued: the reroll is paid and rolled as before
  w.q.dequeue("a");
  w.screens.push((b) => reroll(b), (b) => back(b));
  await w.ctx.preview(a, crypt, 3);
  assert.equal(w.crowns.get("a"), 150);
  assert.deepEqual(a.rolls.L3, ["fresh"]);
});

test("production preview: Update my request replaces the queued request; Leave the line leaves", async () => {
  const w = world({ real: true });
  w.fill(3);
  const a = w.player("a");
  w.q.enqueue(a, crypt, 1, [], undefined, undefined);
  w.screens.push((b) => b.findIndex((t) => t.startsWith("Update my request")));
  await w.ctx.preview(a, { id: "vault", name: "Vault" }, 2);
  assert.equal(w.q.queue.length, 1);
  assert.equal(w.q.queue[0].d.id, "vault", "the request was replaced, not duplicated");
  w.screens.push((b) => b.indexOf("Leave the line"), (b) => b.findIndex((t) => t.startsWith("Wait for a dungeon")));
  await w.ctx.preview(a, { id: "vault", name: "Vault" }, 2);
  assert.equal(w.q.queue.length, 1, "left, then asked again");
  assert.match(a.msgs.join("|"), /out of the line/);
});

test("production resetPending pumps the line itself when a box is filled in (no freeRun involved)", async () => {
  const w = world({ real: true });
  w.fill(0);
  w.pending.set(1, { slot: 1 });
  w.runs.set(0, { slot: 0, leader: "L0", members: new Set(["L0"]) });
  w.runs.set(2, { slot: 2, leader: "L2", members: new Set(["L2"]) });
  const a = w.player("a");
  w.q.queue.push({ id: "a", name: "a", d: crypt, L: 1, affixes: [], sigilLine: undefined, g: undefined, at: 0 });
  await w.ctx.resetPending();
  assert.equal(w.pending.size, 0);
  w.flush();
  assert.deepEqual(w.started.length === 0 ? [] : w.started.map((s) => s.id), []);
  assert.equal(w.q.queue.length, 0, "the waiting party was taken out of the line to start");
  assert.match(a.msgs.at(-1), /dungeon is free now/);
});

test("production reset retains a reset slot until its native ticking-area removal has settled", async () => {
  const w = world({ real: true, slots: 1 });
  const dim = { getEntities: () => [] };
  let resume, settleTicks;
  Object.assign(w.ctx, {
    extent: () => ({ o: { x: 0, y: 0, z: 0 }, size: 16, top: 5 }),
    overworld: () => dim,
    waitLoaded: async () => true,
    box: () => ({ from: { x: 0, y: 0, z: 0 }, to: { x: 15, y: 5, z: 15 } }),
    leftoversAfterRestart: () => true,
    findBlocks: () => [],
    surface: () => ({ x: 0, y: 10, z: 0 }),
    fillBoxSteps: () => [],
    runSteps: async () => 0,
    sleep: (ticks) => {
      settleTicks = ticks;
      return new Promise((resolve) => { resume = resolve; });
    },
  });
  vm.runInContext(fnSrc("resetBox"), w.ctx);
  w.pending.set(0, { slot: 0 });
  const completing = w.ctx.resetPending();
  await new Promise(setImmediate);
  assert.deepEqual(w.removedAreas, [0], "the old native loader was asked to go");
  assert.equal(w.pending.has(0), true, "an uncommitted native removal is not a reusable dungeon");
  assert.equal(w.ctx.freeSlot(), undefined);
  assert.ok(settleTicks >= 2, "cross a complete native tick before exposing the slot");
  resume();
  await completing;
  assert.equal(w.pending.size, 0, "the completed reset can now release the slot");
  assert.equal(w.ctx.freeSlot(), 0);
});

test("production prepare: a dungeon area that can't load, or an unsafe site, frees the slot, holds the line a minute and starts nobody", async () => {
  for (const mode of ["unloaded", "foreign"]) {
    const w = world({ real: true });
    w.fill(3);
    const a = w.player("a");
    w.q.queue.push({ id: "a", name: "a", d: crypt, L: 1, affixes: [], sigilLine: undefined, g: undefined, at: 0 });
    const run = { slot: 1, phase: "gathering", o: { x: 0, y: 0, z: 0 }, size: 10, top: 5, lay: { n: 3 }, dungeon: crypt, level: 1, leaderId: "L1" };
    w.runs.set(1, run);
    w.loaded = mode === "foreign";
    w.foreign = mode === "foreign" ? { at: { x: 1, y: 2, z: 3 }, type: "chest" } : undefined;
    await w.ctx.prepare(run);
    w.flush();
    assert.equal(w.runs.has(1), false, `${mode}: slot released`);
    assert.deepEqual(w.removedAreas, [1]);
    w.tickTo(100);
    assert.equal(a.msgs.some((m) => /dungeon is free now/.test(m)), false, `${mode}: held`);
    assert.equal(w.q.queue.length, 1);
    w.tickTo(1200);
    assert.match(a.msgs.at(-1), /dungeon is free now/);
  }
});

test("forget: the hook closes and empties the line and blocks every automatic and direct start until reload", async () => {
  const w = world({ real: true });
  w.fill(3);
  const [a, b] = ["a", "b"].map((id) => w.player(id, { sigils: ["line-1"] }));
  w.q.enqueue(a, crypt, 3, [], "line-1", undefined);
  w.q.enqueue(b, crypt, 1, [], undefined, undefined);
  const hook = w.ctx.__realmDiagForgetHooks.expedition_bp;
  const r = hook();
  assert.ok(r.note, "the forget answered");
  assert.deepEqual(w.saving, [false]);
  assert.equal(w.q.queue.length, 0, "the line is empty");
  assert.match(a.msgs.at(-1), /forgotten/);
  // a slot frees: nothing starts, neither from the line nor directly
  w.runs.clear();
  w.q.pumpQueue();
  w.tickTo(200);
  assert.equal(w.started.length, 0);
  assert.equal(await startReal(w, a, 3, [], "line-1"), "returned");
  assert.deepEqual(w.sigilsUsed, [], "no sigil taken");
  assert.match(a.msgs.at(-1), /wait until the realm reloads/);
  w.q.enqueue(b, crypt, 1, [], undefined, undefined);
  assert.equal(w.q.queue.length, 0, "no new waiting either");
});
