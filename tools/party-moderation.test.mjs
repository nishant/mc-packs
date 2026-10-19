// Party chat moderation (audit O29): the leader mutes members, one chat line a second, W4 tuple/unknown fields kept.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

async function world(party) {
  const sim = createSim();
  sim.props.set("party:p:ABCDEF", JSON.stringify(party));
  await sim.load("party_bp");
  sim.boot();
  const ann = sim.join("Ann", { id: "a" });
  const bob = sim.join("Bob", { id: "b" });
  const cy = sim.join("Cy", { id: "c" });
  sim.step(5);
  return { sim, ann, bob, cy, saved: () => JSON.parse(sim.props.get("party:p:ABCDEF")) };
}
const base = { l: "a", m: [["a", "Ann", 5], ["b", "Bob", 5], ["c", "Cy", 5]], extra: { keep: 1 } };
const heard = (p) => p.messages.filter((m) => /\[Party\]/.test(m));

async function muteBob(w) {
  w.sim.run("realm:party", w.ann);
  const f = await w.sim.nextForm();
  const i = f.form.buttons.findIndex((b) => /mute/i.test(b.text ?? b));
  assert.ok(i >= 0, "leader sees a Mute button: " + JSON.stringify(f.form.buttons));
  w.sim.answer({ selection: i });
  const g = await w.sim.nextForm();
  const j = g.form.buttons.findIndex((b) => /Bob/.test(b.text ?? b));
  w.sim.answer({ selection: j });
  await w.sim.settle();
  while (w.sim.pending.length) w.sim.answer({ canceled: true });
}

test("a muted member's party messages are refused and nobody hears them", async () => {
  const w = await world(base);
  await muteBob(w);
  assert.deepEqual(w.saved().mu, ["b"]);
  w.sim.run("realm:party_chat", w.bob, "hello");
  assert.equal(heard(w.ann).length, 0);
  assert.ok(w.bob.messages.some((m) => /muted/i.test(m)));
  w.sim.run("realm:party_chat", w.cy, "hi all");
  assert.equal(heard(w.ann).length, 1);
});

test("saved party keeps unknown fields and member tuples when muting", async () => {
  const w = await world(base);
  await muteBob(w);
  const s = w.saved();
  assert.deepEqual(s.extra, { keep: 1 });
  assert.deepEqual(s.m, base.m);
});

test("a mute does not stay after the member leaves", async () => {
  const w = await world({ ...base, mu: ["b"] });
  w.sim.run("realm:party_leave", w.bob);
  assert.ok(!(w.saved().mu ?? []).includes("b"));
});

test("only the leader sees the mute button", async () => {
  const w = await world(base);
  w.sim.run("realm:party", w.bob);
  const f = await w.sim.nextForm();
  assert.ok(!f.form.buttons.some((b) => /mute/i.test(b.text ?? b)));
});

test("one party message a second, even from two senders in the same tick", async () => {
  const w = await world(base);
  w.sim.run("realm:party_chat", w.bob, "one");
  w.sim.run("realm:party_chat", w.cy, "two");
  w.sim.run("realm:party_chat", w.bob, "again");
  w.sim.step(1);
  assert.equal(heard(w.ann).length, 2);
  w.sim.step(8);
  w.sim.run("realm:party_chat", w.bob, "still early");
  w.sim.step(1);
  assert.equal(heard(w.ann).length, 2);
  w.sim.step(20);
  w.sim.run("realm:party_chat", w.bob, "now");
  w.sim.step(1);
  assert.equal(heard(w.ann).length, 3);
});