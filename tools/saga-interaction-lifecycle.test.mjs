import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const utilSource = readFileSync(new URL("../packs/saga_bp/scripts/util.js", import.meta.url), "utf8");
const objectivesSource = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");

function signal() {
  const listeners = new Set();
  return {
    subscribe(fn) { listeners.add(fn); return fn; },
    unsubscribe(fn) { listeners.delete(fn); },
    emit(event) { for (const fn of listeners) fn(event); },
  };
}

function fixture() {
  let nextId = 0;
  const timers = new Map();
  const signals = () => new Proxy({}, {
    get(target, key) { return target[key] ??= signal(); },
  });
  const forms = [];
  const formResponses = [];
  const system = {
    currentTick: 0,
    beforeEvents: signals(),
    afterEvents: signals(),
    runTimeout(fn, ticks = 1) {
      const id = ++nextId;
      timers.set(id, { fn, at: this.currentTick + Math.max(1, ticks) });
      return id;
    },
    run(fn) { return this.runTimeout(fn); },
    runInterval(fn, ticks = 1) {
      const id = ++nextId;
      timers.set(id, { fn, at: this.currentTick + ticks, interval: ticks });
      return id;
    },
    clearRun(id) { timers.delete(id); },
    sendScriptEvent() {},
  };
  const world = {
    beforeEvents: signals(),
    afterEvents: signals(),
    getAllPlayers: () => [player].filter((p) => p.isValid),
  };
  class Player {
    id = "same-player-id";
    name = "ClueSearcher";
    isValid = true;
    health = 20;
    dimension = { id: "minecraft:overworld" };
    location = { x: 0, y: 64, z: 0 };
    messages = [];
    getComponent(id) {
      if (id === "minecraft:health" || id === "health") return { currentValue: this.health };
      return undefined;
    }
    sendMessage(text) { this.messages.push(text); }
    playSound() {}
  }
  const player = new Player();
  class ActionFormData {
    title() { return this; }
    body() { return this; }
    button() { return this; }
    show(p) {
      forms.push({ player: p, form: this });
      return formResponses.length ? Promise.resolve(formResponses.shift()) : new Promise(() => {});
    }
  }
  const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
  const closed = [];
  const uiManager = { closeAllForms(p) { closed.push(p); } };
  const context = {
    CommandPermissionLevel: { GameDirectors: 1 },
    Player, system, world, ActionFormData, FormCancelationReason, uiManager,
    NPC_NAMES: {}, WANDERERS: [], console,
  };
  const source = utilSource.replace(/^import\s[\s\S]*?;\r?$/gm, "").replace(/^export\s+/gm, "");
  const util = vm.runInNewContext(`${source}\n;({ show, exclusive, busy, alive, lifecycle, claim, release, cancelInteractions, onCancel, FORM_TICKS });`, context);
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  async function advance(ticks) {
    for (let i = 0; i < ticks; i++) {
      system.currentTick++;
      for (const [id, timer] of [...timers]) {
        if (timer.at > system.currentTick) continue;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(id);
        timer.fn();
      }
      await flush();
    }
  }
  return { player, world, system, forms, closed, formResponses, ActionFormData, util, flush, advance, timerCount: () => timers.size };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("a found inspect clue keeps its text and progress without opening a blocking form", async () => {
  const f = fixture();
  const entry = { story: { id: "act1_signs" }, st: {} };
  const objective = { clues: [{ text: "The grave carries a star-shaped mark." }] };
  let progress = 0;
  const body = objectivesSource.match(/^function clueFound\([\s\S]*?^\}/m)?.[0];
  assert.ok(body, "exercise the production clue discovery handler");
  const clueFound = vm.runInNewContext(`(${body})`, {
    ...f.util,
    ActionFormData: f.ActionFormData,
    sagaOf: () => ({}),
    pagesFor: (pages) => pages,
    bump: () => progress++,
  });
  clueFound(f.player, entry, 0, objective, 0);
  clueFound(f.player, entry, 0, objective, 0);
  await f.flush();
  assert.equal(entry.st.x["0"], 1, "the real clue bit is saved once");
  assert.equal(progress, 1, "repeated discovery does not double credit");
  assert.equal(f.player.messages.length, 1, "clue text remains available in chat history");
  assert.match(f.player.messages[0], /\[Clue 1\/1\].*star-shaped mark/);
  assert.equal(f.forms.length, 0, "automatic clue discovery must not cover combat or respawn with a modal");
});

for (const [transition, change] of [
  ["death", (f) => { f.player.health = 0; }],
  ["dimension change", (f) => { f.player.dimension = { id: "minecraft:nether" }; }],
  ["leave", (f) => { f.player.isValid = false; }],
]) {
  test(`a form response arriving after ${transition} cannot apply a stale choice`, async () => {
    const f = fixture();
    const response = deferred();
    const showing = f.util.show(f.player, { show: () => response.promise });
    await f.flush();
    change(f);
    response.resolve({ canceled: false, selection: 0 });
    const result = await showing;
    assert.equal(result, undefined, "a completed promise is not permission to act in an invalid lifecycle");
  });
}

test("an old exclusive finally cannot release a newer interaction after leave cleanup", async () => {
  const f = fixture();
  const oldResponse = deferred();
  const newResponse = deferred();
  const old = f.util.exclusive(f.player, () => oldResponse.promise);
  assert.equal(f.util.busy.has(f.player.id), true);
  // This is the published leave handler's cleanup of the exported busy set.
  f.util.busy.delete(f.player.id);
  const newer = f.util.exclusive(f.player, () => newResponse.promise);
  oldResponse.resolve();
  await old;
  const stillOwned = f.util.busy.has(f.player.id);
  newResponse.resolve();
  await newer;
  assert.equal(stillOwned, true, "only the owning operation may release the current busy lock");
  assert.equal(f.util.busy.has(f.player.id), false);
});

test("a permanently pending form has a bounded operation lifetime", async () => {
  const f = fixture();
  const response = deferred();
  let settled = false;
  const showing = f.util.show(f.player, { show: () => response.promise }).then((value) => {
    settled = true;
    return value;
  });
  await f.advance(2400);
  const settledBeforeLateClose = settled;
  response.resolve({ canceled: true, cancelationReason: "UserClosed" });
  await showing;
  assert.equal(settledBeforeLateClose, true, "a missing native form response cannot retain the interaction forever");
});

test("UserBusy retries later while UserClosed does not reopen the form", async () => {
  const f = fixture();
  f.formResponses.push(
    { canceled: true, cancelationReason: "UserBusy" },
    { canceled: true, cancelationReason: "UserClosed" },
  );
  const showing = f.util.show(f.player, new f.ActionFormData());
  await f.flush();
  assert.equal(f.forms.length, 1);
  await f.advance(10);
  const result = await showing;
  assert.equal(result.cancelationReason, "UserClosed");
  assert.equal(f.forms.length, 2, "only UserBusy caused a retry");
  await f.advance(20);
  assert.equal(f.forms.length, 2);
});

test("a cancelled interaction closes the form it opened, answers undefined and ignores the late reply", async () => {
  const f = fixture();
  const response = deferred();
  const showing = f.util.show(f.player, { show: () => response.promise });
  await f.flush();
  f.util.cancelInteractions(f.player.id);
  assert.equal(await showing, undefined);
  assert.equal(f.closed.length, 1, "only the form this show opened is closed");
  assert.equal(f.closed[0], f.player);
  response.resolve({ canceled: false, selection: 0 });
  await f.flush();
  assert.equal(f.closed.length, 1);
  assert.equal(f.timerCount(), 0, "no watchdog or timeout is left running");
});

test("cancelling with no form of ours open closes nothing and only clears our own lock", async () => {
  const f = fixture();
  const token = f.util.claim(f.player.id);
  assert.ok(token);
  const seen = [];
  f.util.onCancel((id) => seen.push(id));
  f.util.cancelInteractions(f.player.id);
  assert.equal(f.closed.length, 0, "another pack's form is never closed");
  assert.equal(f.util.busy.has(f.player.id), false);
  assert.deepEqual(seen, [f.player.id]);
});

test("an answered form closes nothing and leaves no timers behind", async () => {
  const f = fixture();
  f.formResponses.push({ canceled: false, selection: 1 });
  const res = await f.util.show(f.player, new f.ActionFormData());
  assert.equal(res.selection, 1);
  assert.equal(f.closed.length, 0);
  assert.equal(f.timerCount(), 0);
});

test("a form nobody answers is closed by the pack before any shim fallback", async () => {
  const f = fixture();
  const response = deferred();
  const showing = f.util.show(f.player, { show: () => response.promise });
  await f.advance(f.util.FORM_TICKS - 1);
  assert.equal(f.closed.length, 0, "still within its lifetime");
  await f.advance(1);
  assert.equal(await showing, undefined);
  assert.equal(f.closed.length, 1);
  assert.equal(f.timerCount(), 0);
});

test("a death that fires no event (simulated players) is still noticed and closes the open form", async () => {
  const f = fixture();
  const response = deferred();
  const showing = f.util.show(f.player, { show: () => response.promise });
  await f.flush();
  f.player.health = 0;
  await f.advance(5);
  assert.equal(await showing, undefined);
  assert.equal(f.closed.length, 1);
});

test("a dead player is never given a form or a dialogue", async () => {
  const f = fixture();
  f.player.health = 0;
  assert.equal(await f.util.show(f.player, new f.ActionFormData()), undefined);
  assert.equal(f.forms.length, 0);
  let ran = false;
  assert.equal(await f.util.exclusive(f.player, async () => { ran = true; }), false);
  assert.equal(ran, false);
  assert.equal(f.util.busy.has(f.player.id), false);
});

test("after a cancel a second interaction starts normally and its answer counts", async () => {
  const f = fixture();
  const response = deferred();
  const old = f.util.exclusive(f.player, async () => {
    await f.util.show(f.player, { show: () => response.promise });
  });
  await f.flush();
  f.util.cancelInteractions(f.player.id);
  f.formResponses.push({ canceled: false, selection: 2 });
  let picked;
  const next = await f.util.exclusive(f.player, async () => {
    picked = (await f.util.show(f.player, new f.ActionFormData()))?.selection;
  });
  await old;
  assert.equal(next, true);
  assert.equal(picked, 2);
  assert.equal(f.util.busy.has(f.player.id), false);
});

test("a stale claim cannot release a newer one", () => {
  const f = fixture();
  const first = f.util.claim(f.player.id);
  assert.equal(f.util.claim(f.player.id), undefined, "one operation at a time");
  f.util.cancelInteractions(f.player.id);
  const second = f.util.claim(f.player.id);
  f.util.release(f.player.id, first);
  assert.equal(f.util.busy.has(f.player.id), true);
  f.util.release(f.player.id, second);
  assert.equal(f.util.busy.has(f.player.id), false);
});

test("an inspect tap finds a clue only near it, once, and not for a dead player", () => {
  const f = fixture();
  const clueBody = objectivesSource.match(/^function clueFound\([\s\S]*?^\}/m)?.[0];
  const touchBody = objectivesSource.match(/^function inspectTouch\([\s\S]*?^\}/m)?.[0];
  assert.ok(clueBody && touchBody, "exercise the production tap handler");
  const objective = { clues: [{ text: "First." }, { text: "Second." }], spots: [{ dim: "minecraft:overworld", x: 10.5, y: 64.5, z: 10.5 }, { dim: "minecraft:overworld", x: 40.5, y: 64.5, z: 40.5 }] };
  const entry = { story: { id: "act1_signs" }, st: {} };
  let progress = 0;
  const { inspectTouch } = vm.runInNewContext(`${clueBody}\n${touchBody}\n;({ inspectTouch })`, {
    alive: f.util.alive,
    scenes: new Map([["p|k", { data: {} }]]),
    sk: (pid, key) => `${pid}|${key}`,
    objKey: () => "k",
    clueSpot: (_s, obj, k) => obj.spots[k],
    dist3: (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z),
    sagaOf: () => ({}),
    pagesFor: (pages) => pages,
    bump: () => progress++,
  });
  f.player.id = "p";
  const dim = "minecraft:overworld";
  inspectTouch(f.player, entry, 0, objective, { x: 80, y: 64, z: 80 }, dim);
  assert.equal(f.player.messages.length, 0, "a tap on unrelated ground does nothing");
  inspectTouch(f.player, entry, 0, objective, { x: 10.5, y: 65, z: 11.5 }, dim);
  inspectTouch(f.player, entry, 0, objective, { x: 10.5, y: 65, z: 11.5 }, dim);
  assert.equal(f.player.messages.length, 1, "a tap next to a clue finds it once");
  assert.equal(progress, 1);
  f.player.health = 0;
  inspectTouch(f.player, entry, 0, objective, { x: 40.5, y: 65, z: 40.5 }, dim);
  assert.equal(f.player.messages.length, 1, "a dead player finds nothing");
});
