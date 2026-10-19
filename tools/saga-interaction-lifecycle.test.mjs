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
  const context = {
    CommandPermissionLevel: { GameDirectors: 1 },
    Player, system, world, ActionFormData, FormCancelationReason,
    NPC_NAMES: {}, WANDERERS: [], console,
  };
  const source = utilSource.replace(/^import\s[\s\S]*?;\r?$/gm, "").replace(/^export\s+/gm, "");
  const util = vm.runInNewContext(`${source}\n;({ show, exclusive, busy });`, context);
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
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
  return { player, world, system, forms, formResponses, ActionFormData, util, flush, advance };
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
