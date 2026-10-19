// Mail moderation (audit O29): per-player block list, per-sender unread cap and the operator purge by sender,
// through the real /realm:mail menus.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const roster = (...names) => JSON.stringify(names.map((n, k) => ({ i: `id-${n}`, n, t: 1000 - k })));
const letter = (id, f, fn, t, tn, extra = {}) => JSON.stringify({ id, f, fn, t, tn, s: `S${id}`, b: "hi", at: 1_700_000_000_000 + id, r: 0, di: 0, ds: 0, ...extra });

async function world({ cfg = { sendCooldownSeconds: 0 }, letters = [], names = ["Ann", "Bob", "Cy", "Di"] } = {}) {
  const sim = createSim();
  sim.props.set("mail:cfg", JSON.stringify(cfg));
  sim.props.set("mail:roster", roster(...names));
  letters.forEach((l, k) => sim.props.set(`mail:l:${k + 1}`, l));
  sim.props.set("mail:next", letters.length + 1);
  await sim.load("mail_bp");
  sim.boot();
  const people = {};
  for (const n of names) people[n] = sim.join(n, { id: `id-${n}` });
  return { sim, people, stored: () => [...sim.props].filter(([k]) => k.startsWith("mail:l:")).map(([, v]) => JSON.parse(v)) };
}

const drain = (sim) => {
  while (sim.pending.length) sim.answer({ canceled: true });
};

/** Writes a one-line letter through the form; returns what the sender was told. */
async function sendTo(w, from, toName, body = "hello") {
  const before = from.messages.length;
  w.sim.run("realm:mail", from);
  await w.sim.nextForm();
  w.sim.answer({ selection: 1 });
  const f = await w.sim.nextForm();
  const dd = f.form.parts.find((p) => p.kind === "dropdown");
  const to = dd.items.findIndex((x) => x.replace(/ §a\(online\)/, "") === toName);
  assert.ok(to >= 0, `${toName} in ${dd.items}`);
  w.sim.answer({ formValues: [to, "subj", body, "", "", "", "", ""] });
  await w.sim.settle();
  const form = w.sim.pending.length ? w.sim.pending[0].form : undefined;
  const problem = form?.parts.find((p) => p.kind === "dropdown")?.label;
  drain(w.sim);
  await w.sim.settle();
  return { said: from.messages.slice(before).join("\n"), problem: problem ?? "" };
}

test("O29: a blocked sender's letters are refused with no letter stored, and unblocking restores delivery", async () => {
  const w = await world({ letters: [letter(1, "id-Ann", "Ann", "id-Bob", "Bob")] });
  const { Ann, Bob } = w.people;
  // Bob reads Ann's letter and blocks her.
  w.sim.run("realm:mail", Bob);
  await w.sim.nextForm();
  w.sim.answer({ selection: 0 }); // inbox
  let f = await w.sim.nextForm();
  w.sim.answer({ selection: 0 }); // the letter
  f = await w.sim.nextForm();
  const block = f.form.buttons.findIndex((b) => /block/i.test(b));
  assert.ok(block >= 0, f.form.buttons.join("|"));
  w.sim.answer({ selection: block });
  await w.sim.settle();
  drain(w.sim);
  const r = await sendTo(w, Ann, "Bob");
  assert.match(r.problem + r.said, /isn't accepting letters from you/);
  assert.equal(w.stored().filter((l) => l.t === "id-Bob").length, 1, "only the old letter");
  // Cy is unaffected.
  await sendTo(w, Ann, "Cy");
  assert.equal(w.stored().filter((l) => l.t === "id-Cy").length, 1);
  // Bob unblocks from the main menu.
  w.sim.run("realm:mail", Bob);
  await w.sim.nextForm();
  const main = w.sim.pending[0].form.buttons;
  const bl = main.findIndex((b) => /^Blocked players/.test(b));
  assert.ok(bl >= 0, main.join("|"));
  w.sim.answer({ selection: bl });
  f = await w.sim.nextForm();
  w.sim.answer({ selection: f.form.buttons.findIndex((b) => /Ann/.test(b)) });
  await w.sim.settle();
  drain(w.sim);
  const again = await sendTo(w, Ann, "Bob");
  assert.equal(again.problem, "");
  assert.equal(w.stored().filter((l) => l.t === "id-Bob").length, 2);
});

test("O29: the block list is bounded and remembered per player as JSON of ids and names", async () => {
  const w = await world();
  w.sim.props.set("mail:b:id-Bob", JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ i: `x${i}`, n: `X${i}` }))));
  const { Bob } = w.people;
  w.sim.props.set("mail:l:9", letter(9, "id-Ann", "Ann", "id-Bob", "Bob"));
  w.sim.props.set("mail:next", 10);
  w.sim.run("realm:mail", Bob);
  await w.sim.nextForm();
  w.sim.answer({ selection: 0 });
  await w.sim.nextForm();
  w.sim.answer({ selection: 0 });
  const f = await w.sim.nextForm();
  w.sim.answer({ selection: f.form.buttons.findIndex((b) => /block/i.test(b)) });
  await w.sim.settle();
  drain(w.sim);
  assert.equal(JSON.parse(w.sim.props.get("mail:b:id-Bob")).length, 30, "never past 30");
  assert.match(Bob.messages.join("\n"), /30/);
});

test("O29: each sender has an unread cap per recipient, counted per sender and freed when a letter is read", async () => {
  const w = await world({ cfg: { sendCooldownSeconds: 0, senderUnreadCap: 3 } });
  const { Ann, Bob, Cy } = w.people;
  for (let i = 0; i < 3; i++) assert.equal((await sendTo(w, Ann, "Bob")).problem, "");
  const over = await sendTo(w, Ann, "Bob");
  assert.match(over.problem + over.said, /3 unread letters from you/);
  assert.equal(w.stored().filter((l) => l.f === "id-Ann").length, 3);
  // another sender is separate, and two senders racing past the cap each get their own
  for (let i = 0; i < 3; i++) assert.equal((await sendTo(w, Cy, "Bob")).problem, "");
  assert.match((await sendTo(w, Cy, "Bob")).problem, /unread/);
  assert.equal(w.stored().filter((l) => l.t === "id-Bob").length, 6);
  // Bob reads one of Ann's letters: she may send one more
  w.sim.run("realm:mail", Bob);
  await w.sim.nextForm();
  w.sim.answer({ selection: 0 });
  const inbox = await w.sim.nextForm();
  const annLetter = inbox.form.buttons.findIndex((b) => /from Ann/.test(b));
  w.sim.answer({ selection: annLetter });
  await w.sim.nextForm();
  drain(w.sim);
  assert.equal((await sendTo(w, Ann, "Bob")).problem, "");
});

test("O29: a cap of 0 is no cap, and the cap leaves letters from packs alone", async () => {
  const w = await world({ cfg: { sendCooldownSeconds: 0, senderUnreadCap: 0 } });
  for (let i = 0; i < 8; i++) assert.equal((await sendTo(w, w.people.Ann, "Bob")).problem, "");
  assert.equal(w.stored().length, 8);
});

test("O29: an operator deletes every letter from a player, in every inbox and Sent, and nobody else's", async () => {
  const w = await world({
    letters: [
      letter(1, "id-Ann", "Ann", "id-Bob", "Bob"),
      letter(2, "id-Ann", "Ann", "id-Cy", "Cy", { r: 1 }),
      letter(3, "id-Cy", "Cy", "id-Bob", "Bob"),
      letter(4, "id-Ann", "Ann", "id-Di", "Di", { di: 1 }),
      letter(5, "", "Quill the Trader", "id-Bob", "Bob", { ds: 1 }),
      letter(6, "id-Bob", "Bob", "id-Ann", "Ann"),
    ],
  });
  const op = w.sim.join("Boss", { op: true, id: "id-Boss" });
  w.sim.run("realm:mail", op);
  await w.sim.nextForm();
  const main = w.sim.pending[0].form.buttons;
  const purge = main.findIndex((b) => /delete letters/i.test(b));
  assert.ok(purge >= 0, main.join("|"));
  w.sim.answer({ selection: purge });
  const ask = await w.sim.nextForm();
  w.sim.answer({ formValues: ["ann"] });
  const sure = await w.sim.nextForm();
  assert.match(sure.form.bodyText, /3 letters/);
  w.sim.answer({ selection: 0 });
  await w.sim.settle();
  drain(w.sim);
  assert.deepEqual(w.stored().map((l) => l.id).sort(), [3, 5, 6]);
  assert.match(op.messages.join("\n"), /Deleted 3 letters from Ann/);
});

test("O29: the purge needs an operator when the menu opens and again when it is confirmed", async () => {
  const w = await world({ letters: [letter(1, "id-Ann", "Ann", "id-Bob", "Bob")] });
  const plain = w.people.Cy;
  w.sim.run("realm:mail", plain);
  await w.sim.nextForm();
  assert.ok(!w.sim.pending[0].form.buttons.some((b) => /delete letters/i.test(b)));
  drain(w.sim);
  const op = w.sim.join("Boss", { op: true, id: "id-Boss" });
  w.sim.run("realm:mail", op);
  await w.sim.nextForm();
  w.sim.answer({ selection: w.sim.pending[0].form.buttons.findIndex((b) => /delete letters/i.test(b)) });
  await w.sim.nextForm();
  w.sim.answer({ formValues: ["Ann"] });
  await w.sim.nextForm();
  op.commandPermissionLevel = 0;
  w.sim.answer({ selection: 0 });
  await w.sim.settle();
  drain(w.sim);
  assert.equal(w.stored().length, 1, "nothing deleted by a de-opped player");
  assert.match(op.messages.join("\n"), /operator/i);
});

test("O29: the purge says so when the name matches no letters", async () => {
  const w = await world({ letters: [letter(1, "id-Ann", "Ann", "id-Bob", "Bob")] });
  const op = w.sim.join("Boss", { op: true, id: "id-Boss" });
  w.sim.run("realm:mail", op);
  await w.sim.nextForm();
  w.sim.answer({ selection: w.sim.pending[0].form.buttons.findIndex((b) => /delete letters/i.test(b)) });
  await w.sim.nextForm();
  w.sim.answer({ formValues: ["Nobody"] });
  await w.sim.settle();
  drain(w.sim);
  assert.match(op.messages.join("\n"), /No letters from "Nobody"/);
  assert.equal(w.stored().length, 1);
});
