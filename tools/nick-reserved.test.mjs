// Reserved nicknames (audit O31): reserved words and configured operator gamertags, through the real /realm:nick form.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

async function world({ cfg, props = {} } = {}) {
  const sim = createSim();
  if (cfg) sim.props.set("nick:cfg", JSON.stringify(cfg));
  for (const [k, v] of Object.entries(props)) sim.props.set(k, v);
  await sim.load("nick_bp");
  sim.boot();
  return sim;
}

/** Types a nickname into a player's form; returns the player's messages afterwards. */
async function tryNick(sim, p, name) {
  const before = p.messages.length;
  sim.run("realm:nick", p);
  const f = await sim.nextForm();
  sim.answer({ formValues: [undefined, name, 0] });
  await sim.settle();
  const saved = sim.props.get(`nick:p:${p.id}`);
  while (sim.pending.length) sim.answer({ canceled: true }); // a refused name shows the form again
  await sim.settle();
  return { saved: saved ? JSON.parse(saved).n : undefined, said: p.messages.slice(before).join("\n"), f };
}

test("O31: Admin, Owner and Server are refused for players, in any case, with spaces or underscores inside", async () => {
  const sim = await world();
  const p = sim.join("Ann");
  for (const name of ["Admin", "owner", "SERVER", "Ad min", "Admin_", "s_e_r_v_e_r"]) {
    const r = await tryNick(sim, p, name);
    assert.equal(r.saved, undefined, `${name} saved`);
    assert.match(r.said, /reserved/i, name);
  }
  for (const name of ["Admin2", "Owners", "Serverless"]) {
    const r = await tryNick(sim, p, name);
    assert.equal(r.saved, name, `${name} allowed`);
    sim.props.delete(`nick:p:${p.id}`);
  }
});

test("O31: an operator may use a reserved word, checked when the form is answered", async () => {
  const sim = await world();
  const op = sim.join("Boss", { op: true });
  sim.run("realm:nick", op);
  await sim.nextForm();
  sim.answer({ selection: 0 });
  await sim.nextForm();
  op.commandPermissionLevel = 0; // de-opped while the form was open
  sim.answer({ formValues: [undefined, "Admin", 0] });
  await sim.settle();
  assert.equal(sim.props.has(`nick:p:${op.id}`), false);
  while (sim.pending.length) sim.answer({ canceled: true });
  const op2 = sim.join("Boss2", { op: true });
  sim.run("realm:nick", op2);
  await sim.nextForm();
  sim.answer({ selection: 0 });
  await sim.nextForm();
  sim.answer({ formValues: [undefined, "Admin", 0] });
  await sim.settle();
  assert.equal(JSON.parse(sim.props.get(`nick:p:${op2.id}`)).n, "Admin");
});

test("O31: configured operator gamertags are reserved even if that operator never joined, except for their own player", async () => {
  const sim = await world({ cfg: { reservedGamertags: "Notch, Jeb_" } });
  const p = sim.join("Ann");
  for (const name of ["Notch", "jeb", "J e b"]) {
    const r = await tryNick(sim, p, name);
    assert.equal(r.saved, undefined, name);
    assert.match(r.said, /reserved/i);
  }
  const jeb = sim.join("Jeb_");
  const own = await tryNick(sim, jeb, "Jeb_");
  assert.equal(own.saved, "Jeb_");
});

test("O31: an emptied word list reserves nothing, and a malformed saved list falls back to the default", async () => {
  const none = await world({ cfg: { reservedNames: "" } });
  assert.equal((await tryNick(none, none.join("Ann"), "Admin")).saved, "Admin");
  const bad = await world({ cfg: { reservedNames: 5 } });
  assert.equal((await tryNick(bad, bad.join("Ann"), "Admin")).saved, undefined);
});

test("O31: an existing nickname that is now reserved is kept, and the operator list marks it", async () => {
  const sim = await world({ props: { "nick:p:old": JSON.stringify({ n: "Admin", c: "f", g: "Zed", extra: 1 }) } });
  const op = sim.join("Boss", { op: true });
  sim.run("realm:nick", op);
  await sim.nextForm();
  sim.answer({ selection: 1 });
  const w = await sim.nextForm();
  assert.ok(w.form.buttons.some((b) => /Admin/.test(b) && /reserved/i.test(b)), w.form.buttons.join("|"));
  assert.ok(sim.props.has("nick:p:old"));
});

test("O31: a gamertag seen online or offline is still refused as before", async () => {
  const sim = await world({ props: { "nick:g:zed": "zid" } });
  const r = await tryNick(sim, sim.join("Ann"), "Zed");
  assert.equal(r.saved, undefined);
  assert.match(r.said, /gamertag/);
});

test("O31 review: an online operator's gamertag is protected without any config, and only the exact own gamertag is exempt", async () => {
  const sim = await world();
  sim.join("BossOp", { op: true });
  const p = sim.join("Ann");
  for (const name of ["Boss Op", "boss_op", "BOSSOP"]) {
    const r = await tryNick(sim, p, name);
    assert.equal(r.saved, undefined, name);
    assert.match(r.said, /reserved|gamertag/i);
  }
  const sneaky = sim.join("Ad_min");
  const r = await tryNick(sim, sneaky, "Admin");
  assert.equal(r.saved, undefined);
  assert.match(r.said, /reserved/i);
  const own = await tryNick(sim, sneaky, "Ad_min");
  assert.equal(own.saved, "Ad_min");
});
