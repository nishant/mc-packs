// Nicknames operator list (audit O42): the list is paged and searchable instead of one button per nickname.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

async function world(count) {
  const sim = createSim();
  for (let i = 0; i < count; i++) sim.props.set(`nick:p:id${i}`, JSON.stringify({ n: `Nick${String(i).padStart(3, "0")}`, c: "f", g: `Gamer${i}` }));
  const mod = await sim.load("nick_bp");
  sim.boot();
  return { sim, mod };
}

async function openList(sim, op) {
  sim.run("realm:nick", op);
  await sim.nextForm();
  sim.answer({ selection: 1 });
  return sim.nextForm();
}

test("O42: the operator list shows one bounded page with paging buttons", async () => {
  const { sim } = await world(120);
  const op = sim.join("Op", { op: true });
  const w = await openList(sim, op);
  assert.ok(w.form.buttons.length <= 25, `a page has few buttons, saw ${w.form.buttons.length}`);
  assert.ok(w.form.buttons.some((b) => /next page/i.test(b)), "a next page button");
  assert.ok(w.form.buttons.some((b) => /search/i.test(b)), "a search button");
});

test("O42: paging reaches every nickname exactly once", async () => {
  const { sim } = await world(50);
  const op = sim.join("Op", { op: true });
  let w = await openList(sim, op);
  const seen = new Set();
  for (let guard = 0; guard < 10; guard++) {
    for (const b of w.form.buttons) if (/Nick\d{3}/.test(b)) seen.add(b.match(/Nick\d{3}/)[0]);
    const next = w.form.buttons.findIndex((b) => /next page/i.test(b));
    if (next < 0) break;
    sim.answer({ selection: next });
    w = await sim.nextForm();
  }
  assert.equal(seen.size, 50);
});

test("O42: search matches a nickname or a gamertag, and clearing the right one works from a filtered page", async () => {
  const { sim } = await world(80);
  const op = sim.join("Op", { op: true });
  let w = await openList(sim, op);
  sim.answer({ selection: w.form.buttons.findIndex((b) => /search/i.test(b)) });
  w = await sim.nextForm();
  sim.answer({ formValues: ["gamer77"] });
  w = await sim.nextForm();
  const hits = w.form.buttons.filter((b) => /Nick\d{3}/.test(b));
  assert.equal(hits.length, 1);
  assert.match(hits[0], /Nick077/);
  sim.answer({ selection: 0 });
  w = await sim.nextForm();
  sim.answer({ selection: 0 });
  await sim.settle();
  assert.equal(sim.props.has("nick:p:id77"), false, "that nickname is cleared");
  assert.equal(sim.props.has("nick:p:id76"), true, "the neighbors stay");
});

test("O42: a de-opped player cannot clear a nickname from an open list", async () => {
  const { sim } = await world(5);
  const op = sim.join("Op", { op: true });
  await openList(sim, op);
  sim.answer({ selection: 0 });
  await sim.nextForm();
  op.commandPermissionLevel = 0;
  sim.answer({ selection: 0 });
  await sim.settle();
  assert.equal(sim.props.size, 5);
});
