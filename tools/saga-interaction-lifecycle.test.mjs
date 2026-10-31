import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const utilSource = readFileSync(new URL("../packs/saga_bp/scripts/util.js", import.meta.url), "utf8");
const objectivesSource = readFileSync(new URL("../packs/saga_bp/scripts/objectives.js", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../packs/saga_bp/scripts/ui.js", import.meta.url), "utf8");

/** The production source of one top-level function (so the tests run the real code, not a copy). */
function body(source, name) {
  const found = source.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([\\s\\S]*?^\\}`, "m"))?.[0];
  assert.ok(found, `find ${name} in the production source`);
  return found.replace(/^export /, "");
}

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
    camera = { fade() {} };
    effects = [];
    onScreenDisplay = { setTitle() {}, setActionBar() {} };
    addEffect(id) { this.effects.push(id); }
    removeEffect(id) { this.effects = this.effects.filter((e) => e !== id); }
  }
  const player = new Player();
  const newPlayer = (id) => Object.assign(new Player(), { id, name: id });
  class ActionFormData {
    title() { return this; }
    body() { return this; }
    button() { return this; }
    show(p) {
      forms.push({ player: p, form: this });
      return formResponses.length ? Promise.resolve(formResponses.shift()) : new Promise(() => {});
    }
  }
  class MessageFormData extends ActionFormData {
    button1() { return this; }
    button2() { return this; }
  }
  class ModalFormData extends ActionFormData {
    textField() { return this; }
    submitButton() { return this; }
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
  const util = vm.runInNewContext(`${source}\n;({ show, exclusive, busy, alive, lifecycle, claim, release, cancelInteractions, FORM_TICKS, wait, dialog, showOnce: typeof showOnce === "function" ? showOnce : undefined });`, context);
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
  return { player, newPlayer, world, system, forms, closed, formResponses, ActionFormData, MessageFormData, ModalFormData, FormCancelationReason, util, flush, advance, timerCount: () => timers.size };
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
  f.util.cancelInteractions(f.player.id);
  assert.equal(f.closed.length, 0, "another pack's form is never closed");
  assert.equal(f.util.busy.has(f.player.id), false);
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

// ---- multi-step flows, popups, leave generation, riddle cooldown, visions (the second review's findings) ----------

test("an interaction started before a leave stays stale even when the player was never cancelled before", () => {
  const f = fixture();
  const stale = f.util.lifecycle(f.player);
  assert.equal(stale(), false);
  f.util.cancelInteractions(f.player.id, true);
  assert.equal(stale(), true, "the leave itself must end it, not only the player object turning invalid");
});

function codexPageFor(f) {
  return vm.runInNewContext(`(${body(uiSource, "codexPage")})`, {
    ...f.util,
    ActionFormData: f.ActionFormData,
    sagaOf: () => ({ cx: ["a"] }),
    codexById: new Map([["a", { title: "Entry", story: "Story", text: "Text" }]]),
  });
}

for (const [name, cut] of [
  ["respawn", (f) => f.util.cancelInteractions(f.player.id)],
  ["dimension change", (f) => { f.player.dimension = { id: "minecraft:the_end" }; }],
]) {
  test(`a menu does not reopen its parent page after its sub-form was cut by a ${name}`, async () => {
    const f = fixture();
    f.formResponses.push({ canceled: false, selection: 0 });
    let finished = false;
    codexPageFor(f)(f.player).then(() => { finished = true; });
    await f.flush();
    assert.equal(f.forms.length, 2, "the entry list, then one entry that is never answered");
    cut(f);
    await f.advance(6);
    assert.equal(f.forms.length, 2, "the list must not come back in the new lifecycle");
    assert.equal(finished, true);
  });
}

test("a menu does not reopen its parent page after its sub-form timed out unanswered", async () => {
  const f = fixture();
  f.formResponses.push({ canceled: false, selection: 0 });
  let finished = false;
  codexPageFor(f)(f.player).then(() => { finished = true; });
  await f.flush();
  await f.advance(f.util.FORM_TICKS + 5);
  assert.equal(f.forms.length, 2, "an AFK player is not shown the parent page again");
  assert.equal(finished, true);
});

test("a timed-out form ends the player's other work started before it, but showOnce does not", async () => {
  const f = fixture();
  const before = f.util.lifecycle(f.player);
  const pending = deferred();
  const timedOut = f.util.show(f.player, { show: () => pending.promise });
  await f.advance(f.util.FORM_TICKS);
  assert.equal(await timedOut, undefined);
  assert.equal(before(), true, "a menu loop that started earlier must stop too");
  const after = f.util.lifecycle(f.player);
  assert.equal(typeof f.util.showOnce, "function");
  const popup = f.util.showOnce(f.player, { show: () => deferred().promise }, 100);
  await f.advance(100);
  assert.equal(await popup, undefined);
  assert.equal(after(), false, "a popup timing out leaves the player's other interactions alone");
  assert.equal(f.closed.length, 2, "each gave-up form is closed once");
});

function listenInFor(f, extra = {}) {
  const popups = new Set();
  const closes = [];
  const listenIn = vm.runInNewContext(`(${body(uiSource, "listenIn")})`, {
    popups, ActionFormData: f.ActionFormData, busy: f.util.busy, alive: f.util.alive, showOnce: f.util.showOnce, system: f.system,
    closeForms: (p) => closes.push(p), LISTEN_TICKS: 2400, ...extra,
  });
  return { listenIn, popups, closes };
}

test("a dead party mate gets no listening-in popup over their respawn screen", async () => {
  const f = fixture();
  const mate = f.newPlayer("mate");
  mate.health = 0;
  const { listenIn, popups } = listenInFor(f);
  listenIn([mate], "T", "B");
  await f.flush();
  assert.equal(f.forms.length, 0);
  assert.equal(popups.size, 0);
});

test("a listening-in popup nobody answers is bounded and its mark is cleared", async () => {
  const f = fixture();
  const mate = f.newPlayer("mate");
  const { listenIn, popups } = listenInFor(f);
  listenIn([mate], "T", "B");
  await f.flush();
  assert.equal(popups.has("mate"), true);
  await f.advance(2400 + 5);
  assert.equal(popups.has("mate"), false, "a form that never answers cannot hold the popup mark forever");
});

function inviteFor(f) {
  const popups = new Set();
  const accepted = [];
  const sent = [];
  const inviteSide = vm.runInNewContext(`(${body(uiSource, "inviteSide")})`, {
    popups, busy: f.util.busy, exclusive: f.util.exclusive, alive: f.util.alive, lifecycle: f.util.lifecycle, showOnce: f.util.showOnce,
    system: f.system, closeForms: () => {}, MessageFormData: f.MessageFormData, FormCancelationReason: f.FormCancelationReason,
    npcName: () => "Npc", stepsFor: () => [], sagaOf: () => ({}), canTake: () => true, INVITE_TICKS: 1200,
    acceptFor: (...args) => { accepted.push(args); return true; },
    console,
  });
  const by = { name: "Ann", isValid: true, sendMessage: (m) => sent.push(m) };
  const story = { title: "Story" };
  const chapter = { id: "c", title: "Chapter" };
  return { inviteSide: (mates) => inviteSide(by, story, chapter, undefined, mates), popups, accepted };
}

test("a party invite accepted normally still starts the story", async () => {
  const f = fixture();
  const mate = f.newPlayer("mate");
  f.formResponses.push({ canceled: false, selection: 0 });
  const { inviteSide, accepted, popups } = inviteFor(f);
  inviteSide([mate]);
  await f.advance(3);
  assert.equal(accepted.length, 1);
  assert.equal(popups.size, 0);
});

test("a party invite is not shown to a dead mate", async () => {
  const f = fixture();
  const mate = f.newPlayer("mate");
  mate.health = 0;
  const { inviteSide, accepted } = inviteFor(f);
  inviteSide([mate]);
  await f.advance(3);
  assert.equal(f.forms.length, 0);
  assert.equal(accepted.length, 0);
});

for (const [name, cut] of [
  ["respawn", (f, mate) => f.util.cancelInteractions(mate.id)],
  ["dimension change", (f, mate) => { mate.dimension = { id: "minecraft:the_end" }; }],
  ["death", (f, mate) => { mate.health = 0; }],
]) {
  test(`a party invite answered Join after a ${name} does not start the story`, async () => {
    const f = fixture();
    const mate = f.newPlayer("mate");
    const answer = deferred();
    f.formResponses.push(answer.promise);
    const { inviteSide, accepted, popups } = inviteFor(f);
    inviteSide([mate]);
    await f.flush();
    assert.equal(f.forms.length, 1);
    cut(f, mate);
    await f.advance(6);
    answer.resolve({ canceled: false, selection: 0 });
    await f.advance(3);
    assert.equal(accepted.length, 0, "a late Join must not apply a choice or start the chapter");
    assert.equal(popups.has("mate"), false);
  });
}

test("a party invite nobody answers is closed after INVITE_TICKS and its mark cleared", async () => {
  const f = fixture();
  const mate = f.newPlayer("mate");
  const { inviteSide, popups } = inviteFor(f);
  inviteSide([mate]);
  await f.flush();
  await f.advance(1205);
  assert.equal(popups.has("mate"), false);
  assert.equal(f.util.busy.has("mate"), false);
});

function askFor(f, askCool) {
  return vm.runInNewContext(`(${body(objectivesSource, "askAnswer")})`, {
    exclusive: f.util.exclusive, show: f.util.show, alive: f.util.alive, ModalFormData: f.ModalFormData, system: f.system, askCool,
    sagaOf: () => ({}), objDone: () => false, pagesFor: (pages) => pages, resolveAnswer: () => {},
  });
}
const riddle = { story: { title: "S", id: "s" }, chapter: { objectives: [{ question: "Q?", label: "Riddle" }] } };

test("a riddle form closed by the player still starts the re-ask cooldown", async () => {
  const f = fixture();
  const askCool = new Map();
  f.formResponses.push({ canceled: true, cancelationReason: "UserClosed" });
  await askFor(f, askCool)(f.player, riddle, 0);
  assert.equal(askCool.has(f.player.id), true);
});

for (const [name, cut] of [
  ["leave", (f) => { f.player.isValid = false; f.util.cancelInteractions(f.player.id, true); }],
  ["death", (f) => { f.player.health = 0; f.util.cancelInteractions(f.player.id); }],
]) {
  test(`a riddle form cut by a ${name} leaves no cooldown behind`, async () => {
    const f = fixture();
    const askCool = new Map();
    const run = askFor(f, askCool)(f.player, riddle, 0);
    await f.flush();
    assert.equal(f.forms.length, 1);
    cut(f);
    await run;
    assert.equal(askCool.has(f.player.id), false, "a departed player's id must not be written back, and a respawned one is asked again at once");
  });
}

function visionFor(f, watching, dark) {
  const playVision = vm.runInNewContext(`(${body(objectivesSource, "playVision")})`, {
    watching, claim: f.util.claim, release: f.util.release, lifecycle: f.util.lifecycle, alive: f.util.alive, wait: f.util.wait,
    sneaking: () => false, holdTitle: () => {}, send: () => {}, PACK: "saga_bp",
  });
  return (list) => playVision(f.player, list, dark);
}
const scenes = [{ title: "T", text: "x", seconds: 1 }];

test("a vision played to the end credits and releases its lock", async () => {
  const f = fixture();
  const play = visionFor(f, new Map(), true);
  const done = play(scenes);
  await f.advance(24 + 20 + 5);
  assert.equal(await done, true);
  assert.equal(f.util.busy.has(f.player.id), false);
});

for (const [name, cut] of [
  ["respawn", (f) => f.util.cancelInteractions(f.player.id)],
  ["death", (f) => { f.player.health = 0; }],
  ["dimension change", (f) => { f.player.dimension = { id: "minecraft:the_end" }; }],
]) {
  test(`a vision cut short by a ${name} gives no credit, removes its own darkness and cannot release a newer lock`, async () => {
    const f = fixture();
    const watching = new Map();
    const play = visionFor(f, watching, true);
    const done = play(scenes);
    await f.advance(30);
    assert.deepEqual(f.player.effects, ["darkness"]);
    cut(f);
    f.util.busy.delete(f.player.id); // what a leave handler does: a newer operation can now take the lock
    const newer = f.util.claim(f.player.id);
    await f.advance(10);
    assert.equal(await done, false, "no credit for a vision that was cut short");
    assert.deepEqual(f.player.effects, [], "only the darkness this vision added is removed");
    assert.equal(f.util.busy.has(f.player.id), true, "the older vision's finally cannot release the newer operation's lock");
    assert.equal(watching.has(f.player.id), false);
    f.util.release(f.player.id, newer);
  });
}

test("a vision cannot start over one that was cut and has not cleaned up yet, so the old cleanup never reaches a newer vision", async () => {
  const f = fixture();
  const watching = new Map();
  const play = visionFor(f, watching, true);
  const a = play(scenes);
  await f.advance(30);
  f.util.cancelInteractions(f.player.id); // the lock is free again, but vision A has not noticed yet
  assert.equal(await play(scenes), false, "the watching mark still belongs to A: B cannot start");
  assert.deepEqual(f.player.effects, ["darkness"], "B added nothing");
  await f.advance(10);
  assert.equal(await a, false);
  assert.deepEqual(f.player.effects, [], "A removed only its own darkness, before B could exist");
  const b = play(scenes);
  await f.advance(30);
  assert.deepEqual(f.player.effects, ["darkness"], "B's own darkness");
  await f.advance(30);
  assert.equal(await b, true);
  assert.equal(watching.size, 0);
});

function opToolsFor(f, target, calls) {
  class Modal extends f.ModalFormData {
    dropdown() { return this; }
  }
  const entry = { story: { title: "Story" }, chapter: {} };
  return vm.runInNewContext(`${body(uiSource, "pickPlayer")}\n${body(uiSource, "opTools")}\n;opTools`, {
    show: f.util.show, ActionFormData: f.ActionFormData, ModalFormData: Modal, world: { getAllPlayers: () => [target] },
    placesMenu: async () => { calls.places++; }, entries: () => [entry], plain: (s) => s, stepLine: () => "step", sagaOf: () => ({}),
    isOp: () => true, completeStep: (_target, e) => { calls.complete.push(e); return true; }, resetPlayer: (t) => { calls.reset.push(t); },
    // The menu finishes the step through finishStepFor (it logs the operator's change); it completes it the same way.
    finishStepFor: (_target, e) => { calls.complete.push(e); return "step"; },
  });
}

const flows = [
  ["Finish a step", [{ canceled: false, selection: 1 }, { canceled: false, formValues: [0] }, { canceled: false, selection: 0 }], "complete"],
  ["Reset stories", [{ canceled: false, selection: 2 }, { canceled: false, formValues: [0] }, { canceled: false, selection: 0 }], "reset"],
];

for (const [flow, answers, what] of flows) {
  test(`operator tools "${flow}" still apply their one change when nothing was cut`, async () => {
    const f = fixture();
    const calls = { places: 0, complete: [], reset: [] };
    for (const a of answers) f.formResponses.push(a);
    await opToolsFor(f, f.newPlayer("target"), calls)(f.player);
    assert.equal(calls[what].length, 1);
    assert.equal(f.forms.length, 3);
  });

  for (const step of [2, 3]) {
    for (const [cutName, cut] of [
      ["a dimension change", (f) => { f.player.dimension = { id: "minecraft:the_end" }; }],
      ["a death", (f) => { f.player.health = 0; }],
      ["a respawn cancel", (f) => f.util.cancelInteractions(f.player.id)],
    ]) {
      test(`operator tools "${flow}" open no further form and change nothing when ${cutName} lands as form ${step} is answered`, async () => {
        const f = fixture();
        const calls = { places: 0, complete: [], reset: [] };
        const late = deferred();
        for (const a of answers.slice(0, step - 1)) f.formResponses.push(a);
        f.formResponses.push(late.promise);
        const run = opToolsFor(f, f.newPlayer("target"), calls)(f.player);
        for (let k = 0; k < step; k++) await f.flush();
        assert.equal(f.forms.length, step);
        cut(f);
        late.resolve(answers[step - 1]);
        await run;
        assert.equal(f.forms.length, step, "no later form opens");
        assert.equal(calls.complete.length + calls.reset.length, 0, "no mutation");
      });
    }
  }
}