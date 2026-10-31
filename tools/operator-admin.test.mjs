// Operator Tools and Set up this world lifecycle (audit O44): a menu from before a leave must not close the menu
// opened after the player came back, and a step page waiting for a busy client stops when the player dies.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

async function world() {
  const sim = createSim();
  await sim.load("admin_bp");
  sim.boot();
  return sim;
}

/** Opens /realm:admin_setup and taps Start: returns the step page's form. */
async function toStepPage(sim, op) {
  sim.run("realm:admin_setup", op);
  await sim.nextForm(1200);
  sim.answer({ selection: 0 });
  const w = await sim.nextForm(1200);
  assert.match(w.form.titleText, /Set up: step/);
  return w;
}

test("O44: a busy client gets the step page back once chat closes", async () => {
  const sim = await world();
  const op = sim.join("Op", { op: true });
  await toStepPage(sim, op);
  const before = sim.shown.length;
  sim.answer({ canceled: true, cancelationReason: "UserBusy" });
  await sim.until(() => sim.shown.length > before, 200);
  assert.equal(sim.shown.length, before + 1);
});

test("O44: a menu left open by a player who left does not close the one opened after they rejoin", async () => {
  const sim = await world();
  const first = sim.join("Op", { op: true, id: "op1" });
  sim.run("realm:admin_setup", first);
  await sim.nextForm(1200);
  sim.leave(first);
  const back = sim.join("Op", { op: true, id: "op1" });
  sim.run("realm:admin_setup", back);
  await sim.until(() => sim.shown.length >= 2, 1200);
  const shown = sim.shown.length;
  sim.run("realm:admin_setup", back); // a second command while the new menu is open
  await sim.settle(80);
  assert.equal(sim.shown.length, shown, "the second command did not open another menu");
});

test("O45: a forget answered after the wait still reaches the operator, not a false 'nothing was deleted'", async () => {
  const sim = await world();
  const op = sim.join("Op", { op: true });
  const sys = sim.server.system;
  const orig = sys.sendScriptEvent;
  const forgets = [];
  sys.sendScriptEvent = (id, message) => {
    orig(id, message);
    let m = {};
    try {
      m = JSON.parse(message);
    } catch {
      // not a JSON message
    }
    if (id === "realm:diag_ping") orig("realm:diag_pong", JSON.stringify({ id: m.id, pack: "titles_bp", name: "Titles", version: "1.0.0", props: 3, bytes: 100, mpt: 0.01, ticks: 20 }));
    if (id === "realm:diag_forget") forgets.push(m);
  };
  sim.run("realm:diag", op, 1);
  let w = await sim.nextForm(3000);
  assert.match(w.form.titleText, /Pack diagnostics/);
  const open = async () => {
    sim.answer({ selection: 0 });
    w = await sim.nextForm(300);
    sim.answer({ selection: 0 }); // Forget this pack's saved data
    w = await sim.nextForm(300);
    sim.answer({ selection: 0 }); // Forget it
  };
  await open();
  await sim.until(() => forgets.length === 1, 100);
  await sim.settle(260); // the old 40-tick wait would have given up and said nothing was deleted
  assert.ok(!op.messages.some((t) => /nothing was deleted/.test(t)), op.messages.join(" | "));
  assert.ok(op.messages.some((t) => /hasn't answered yet/.test(t)), op.messages.join(" | "));
  orig("realm:diag_forgot", JSON.stringify({ id: forgets[0].id, pack: "titles_bp", ok: true, removed: 3, bytes: 100 }));
  await sim.settle(5);
  assert.ok(op.messages.some((t) => /forgot 3 saved entries/.test(t)), op.messages.join(" | "));
});

test("O44: a step page waiting for a busy client stops when the player dies", async () => {
  const sim = await world();
  const op = sim.join("Op", { op: true });
  await toStepPage(sim, op);
  sim.answer({ canceled: true, cancelationReason: "UserBusy" });
  sim.game.emit("world.after.entityDie", { deadEntity: op });
  const before = sim.shown.length;
  await sim.settle(150);
  assert.equal(sim.shown.length, before, "no page pops up after the death");
});

async function pendingForget() {
  const sim = await world();
  const op = sim.join("Op", { op: true });
  const sys = sim.server.system;
  const orig = sys.sendScriptEvent;
  const forgets = [];
  sys.sendScriptEvent = (id, message) => {
    orig(id, message);
    let m = {};
    try {
      m = JSON.parse(message);
    } catch {
      // not a JSON message
    }
    if (id === "realm:diag_ping") orig("realm:diag_pong", JSON.stringify({ id: m.id, pack: "titles_bp", name: "Titles", version: "1.0.0", props: 3, bytes: 100, mpt: 0.01, ticks: 20 }));
    if (id === "realm:diag_forget") forgets.push(m);
  };
  sim.run("realm:diag", op, 1);
  await sim.nextForm(3000);
  const forget = async () => {
    sim.answer({ selection: 0 });
    await sim.nextForm(300);
    sim.answer({ selection: 0 });
    await sim.nextForm(300);
    sim.answer({ selection: 0 });
  };
  return { sim, op, orig, forgets, forget };
}

test("O45: a late answer for another id or pack is ignored, and a pack with a forget pending refuses a second", async () => {
  const { sim, op, orig, forgets, forget } = await pendingForget();
  await forget();
  await sim.until(() => forgets.length === 1, 100);
  await sim.settle(260);
  orig("realm:diag_forgot", JSON.stringify({ id: "nope", pack: "titles_bp", ok: true, removed: 9, bytes: 1 }));
  orig("realm:diag_forgot", JSON.stringify({ id: forgets[0].id, pack: "other_bp", ok: true, removed: 9, bytes: 1 }));
  await sim.settle(5);
  assert.ok(!op.messages.some((t) => /forgot 9/.test(t)), "mismatched answers are not a success");
  sim.answer({ canceled: true, cancelationReason: "UserClosed" });
  await sim.settle(5);
  const again = op.messages.length;
  sim.run("realm:diag", op, 1);
  await sim.nextForm(3000);
  await forget();
  await sim.settle(60);
  assert.ok(op.messages.slice(again).some((t) => /still waiting for its answer/.test(t)), op.messages.slice(again).join(" | "));
  assert.equal(forgets.length, 1, "no second forget is sent while one is pending");
});

test("O44: dying while the setup wizard waits for the installed-pack ping shows no step page", async () => {
  const sim = await world();
  const op = sim.join("Op", { op: true });
  sim.run("realm:admin_setup", op);
  await sim.nextForm(1200);
  sim.answer({ selection: 0 });
  sim.game.emit("world.after.entityDie", { deadEntity: op });
  const before = sim.shown.length;
  await sim.settle(260);
  assert.ok(sim.shown.length <= before + 0, "no step page after the death");
});

async function manyPacks(count) {
  const sim = await world();
  const op = sim.join("Op", { op: true });
  const sys = sim.server.system;
  const orig = sys.sendScriptEvent;
  const forgets = [];
  sys.sendScriptEvent = (id, message) => {
    orig(id, message);
    let m = {};
    try {
      m = JSON.parse(message);
    } catch {
      // not a JSON message
    }
    if (id === "realm:diag_ping") {
      for (let i = 0; i < count; i++) {
        const pack = `p${String(i).padStart(2, "0")}_bp`;
        orig("realm:diag_pong", JSON.stringify({ id: m.id, pack, name: `Pack${i}`, version: "1.0.0", props: 3, bytes: 4096, mpt: 1 - i * 0.01, ticks: 20 }));
      }
    }
    if (id === "realm:diag_forget") forgets.push(m);
  };
  /** Forgets the pack at list position `i` (position = descending script time) and closes the form shown after. */
  const forget = async (i) => {
    sim.run("realm:diag", op, 1);
    await sim.nextForm(3000);
    sim.answer({ selection: i });
    await sim.nextForm(300);
    sim.answer({ selection: 0 });
    await sim.nextForm(300);
    sim.answer({ selection: 0 });
    await sim.until(() => sim.pending.length === 0 || /Pack diagnostics/.test(sim.pending[0].form.titleText), 600);
    await sim.settle(250);
  };
  return { sim, op, orig, forgets, forget };
}

test("O45: 17 distinct packs waiting cap at 16: the 17th forget is refused and nothing is sent", async () => {
  const { sim, op, forgets, forget } = await manyPacks(17);
  for (let i = 0; i < 16; i++) {
    await forget(i);
    sim.pending.length = 0;
  }
  assert.equal(forgets.length, 16);
  const before = op.messages.length;
  await forget(16);
  assert.equal(forgets.length, 16, "the 17th is not sent");
  assert.ok(op.messages.slice(before).some((t) => /Too many forgets/.test(t)), op.messages.slice(before).join(" | "));
});

test("O45: a forget older than 12000 ticks expires: a stale reply is not accepted, and a new forget is sent", async () => {
  const { sim, op, orig, forgets, forget } = await manyPacks(2);
  await forget(0);
  sim.pending.length = 0;
  assert.equal(forgets.length, 1);
  await sim.settle(12001);
  orig("realm:diag_forgot", JSON.stringify({ id: forgets[0].id, pack: "p00_bp", ok: true, removed: 3, bytes: 4096 }));
  await sim.settle(5);
  assert.ok(!op.messages.some((t) => /forgot 3/.test(t)), "an expired answer is not reported as a success");
  await forget(0);
  assert.equal(forgets.length, 2, "a new forget for the pack is allowed after expiry");
});

test("O45: a late answer updates the open pack record: its page shows no Forget button and no stale size", async () => {
  const { sim, op, orig, forgets, forget } = await manyPacks(1);
  sim.run("realm:diag", op, 1);
  await sim.nextForm(3000);
  sim.answer({ selection: 0 });
  await sim.nextForm(300);
  sim.answer({ selection: 0 });
  await sim.nextForm(300);
  sim.answer({ selection: 0 });
  await sim.until(() => forgets.length === 1, 100);
  await sim.settle(260);
  const list = await sim.nextForm(300);
  assert.match(list.form.titleText, /Pack diagnostics/);
  orig("realm:diag_forgot", JSON.stringify({ id: forgets[0].id, pack: "p00_bp", ok: true, removed: 3, bytes: 4096 }));
  await sim.settle(3);
  sim.answer({ selection: 0 });
  const page = await sim.nextForm(300);
  assert.ok(!page.form.buttons.some((b) => /Forget this pack/.test(b)), page.form.buttons.join(" | "));
  assert.match(page.form.bodyText, /forgotten/);
  assert.match(page.form.bodyText, /0 entries, 0 B/);
  void forget;
});
