// Titles & Trails operator tools (audit O41, O42): taking a title away, and finding offline holders without
// scanning every saved record. Runs the real packs/titles_bp/scripts/main.js against tools/lib/pack-sim.mjs.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const record = (n, t, extra = {}) => JSON.stringify({ n, t, r: [], tr: "", s: { d: 0, n: 0, w: 0 }, ls: Date.now(), ...extra });
const saved = (sim, id) => JSON.parse(sim.props.get(`titles:p:${id}`));

async function world(seed = {}) {
  const sim = createSim();
  for (const [k, v] of Object.entries(seed)) sim.props.set(k, v);
  await sim.load("titles_bp");
  sim.boot();
  return sim;
}

test("O41: /realm:titles_take removes one title, case-insensitively, from an offline player", async () => {
  const sim = await world({ "titles:p:a1": record("Alex", ["Dragon Slayer", "Explorer"], { zz: "kept" }) });
  const op = sim.join("Op", { op: true });
  assert.ok(sim.commands.has("realm:titles_take"), "the take command is registered");
  const def = sim.commands.get("realm:titles_take").def;
  assert.equal(def.permissionLevel, 1);
  assert.deepEqual(def.mandatoryParameters.map((p) => p.name), ["player", "title"]);
  sim.run("realm:titles_take", op, "alex", "dragon slayer");
  await sim.settle();
  assert.deepEqual(saved(sim, "a1").t, ["Explorer"]);
  assert.equal(saved(sim, "a1").zz, "kept", "unknown fields survive");
  assert.match(op.messages.at(-1), /Took .*Dragon Slayer/);
  sim.run("realm:titles_take", op, "Alex", "Dragon Slayer");
  await sim.settle();
  assert.deepEqual(saved(sim, "a1").t, ["Explorer"], "taking it twice changes nothing");
  assert.match(op.messages.at(-1), /doesn't have/);
});

test("O41: taking the worn title of an online player clears the worn tag, and an unknown name is reported", async () => {
  const sim = await world({ "titles:p:b1": record("Bea", ["Wanderer"]) });
  const op = sim.join("Op", { op: true });
  const bea = sim.join("Bea", { id: "b1" });
  bea.addTag("realm_title:Wanderer");
  sim.run("realm:titles_take", op, "Bea", "Wanderer");
  await sim.settle();
  assert.deepEqual(saved(sim, "b1").t, []);
  assert.equal(bea.getTags().some((t) => t.startsWith("realm_title:")), false);
  sim.run("realm:titles_take", op, "Nobody", "Wanderer");
  await sim.settle();
  assert.match(op.messages.at(-1), /No player called "Nobody"/);
});

test("O41: the give form has a take toggle; it needs operator permission when opened and when submitted", async () => {
  const sim = await world({ "titles:p:a1": record("Alex", ["Explorer"]) });
  const op = sim.join("Op", { op: true });
  sim.run("realm:titles", op);
  let w = await sim.nextForm();
  sim.answer({ selection: 2 });
  w = await sim.nextForm();
  assert.ok(w.form.parts.some((p) => p.kind === "toggle" && /take/i.test(p.label)), "a take toggle");
  op.commandPermissionLevel = 0; // de-opped while the form was open
  sim.answer({ formValues: [0, "Alex", "Explorer", true] });
  await sim.settle();
  assert.deepEqual(saved(sim, "a1").t, ["Explorer"], "a de-opped player cannot take");
  op.commandPermissionLevel = 1;
  sim.run("realm:titles", op);
  await sim.nextForm();
  sim.answer({ selection: 2 });
  await sim.nextForm();
  sim.answer({ formValues: [0, "Alex", "Explorer", true] });
  await sim.settle();
  assert.deepEqual(saved(sim, "a1").t, []);
  sim.run("realm:titles", op);
  await sim.nextForm();
  sim.answer({ selection: 2 });
  await sim.nextForm();
  sim.answer({ formValues: [0, "Alex", "Explorer", false] });
  await sim.settle();
  assert.deepEqual(saved(sim, "a1").t, ["Explorer"], "the toggle off still gives");
});

test("O42: an offline name resolves through a lowercase index without reading every record", async () => {
  const seed = {};
  for (let i = 0; i < 400; i++) seed[`titles:p:p${i}`] = record(`Player${i}`, ["Explorer"]);
  seed["titles:p:legacy"] = record("Legacy Name", []);
  const sim = await world(seed);
  const op = sim.join("Op", { op: true });
  sim.run("realm:titles_give", op, "legacy name", "Veteran");
  await sim.settle();
  assert.deepEqual(saved(sim, "legacy").t, ["Veteran"], "an old record without an index entry is still found");
  assert.ok(sim.props.get("titles:n:legacy name"), "the lookup learned the index entry");
  sim.counts.get = 0;
  sim.run("realm:titles_give", op, "LEGACY NAME", "Elder");
  await sim.settle();
  assert.deepEqual(saved(sim, "legacy").t, ["Veteran", "Elder"]);
  assert.ok(sim.counts.get <= 12, `an indexed lookup reads a few properties, not ${sim.counts.get}`);
});

test("O42: a miss for an unknown name reads a bounded number of records", async () => {
  const seed = {};
  for (let i = 0; i < 1500; i++) seed[`titles:p:p${i}`] = record(`Player${i}`, []);
  const sim = await world(seed);
  const op = sim.join("Op", { op: true });
  sim.counts.get = 0;
  sim.run("realm:titles_give", op, "Nobody", "Veteran");
  await sim.settle();
  assert.match(op.messages.at(-1), /No player called/);
  assert.ok(sim.counts.get <= 600, `bounded reads, saw ${sim.counts.get}`);
});

test("O42: a new title for a player writes the index entry, and a colliding name keeps both records", async () => {
  const sim = await world({ "titles:p:x1": record("Sam", ["A"]), "titles:p:x2": record("sam", ["B"]) });
  const op = sim.join("Op", { op: true });
  sim.run("realm:titles_give", op, "sam", "C");
  await sim.settle();
  const holders = ["x1", "x2"].filter((id) => saved(sim, id).t.includes("C"));
  assert.equal(holders.length, 1, "exactly one record is changed");
  assert.deepEqual(saved(sim, "x1").t.concat(saved(sim, "x2").t).sort(), ["A", "B", "C"]);
});

test("O42: a renamed player drops the old index entry (only if it was theirs) and claims the new name", async () => {
  const sim = await world({ "titles:p:r1": record("Oldie", ["A"]), "titles:n:oldie": "r1", "titles:n:newbie": "stale-id", "titles:n:shared": "other" });
  const p = sim.join("Newbie", { id: "r1" });
  sim.game.emit("world.after.playerSpawn", { player: p, initialSpawn: true });
  await sim.settle();
  assert.equal(sim.props.has("titles:n:oldie"), false, "the old name no longer points at them");
  assert.equal(sim.props.get("titles:n:newbie"), "r1", "an online player's current name is theirs");
  const q = sim.join("Quirk", { id: "r2" });
  sim.props.set("titles:p:r2", record("Shared", []));
  sim.game.emit("world.after.playerSpawn", { player: q, initialSpawn: true });
  await sim.settle();
  assert.equal(sim.props.get("titles:n:shared"), "other", "someone else's entry survives a rename");
  const r = sim.join("Renamer", { id: "r3" });
  sim.props.set("titles:p:r3", record("Shared", []));
  sim.props.set("titles:n:shared", "r2");
  sim.game.emit("world.after.playerSpawn", { player: r, initialSpawn: true });
  await sim.settle();
  assert.equal(sim.props.get("titles:n:shared"), "r2", "an entry owned by someone else is left alone");
});

test("O42: a stale index entry that matches nobody is cleared on a failed lookup", async () => {
  const sim = await world({ "titles:p:z1": record("Someone", []), "titles:n:ghost": "z1" });
  const op = sim.join("Op", { op: true });
  sim.run("realm:titles_give", op, "ghost", "X");
  await sim.settle();
  assert.match(op.messages.at(-1), /No player called/);
  assert.equal(sim.props.has("titles:n:ghost"), false);
});

test("O42: giving to an online player whose record has no name saves the name and indexes it", async () => {
  const sim = await world();
  const op = sim.join("Op", { op: true });
  sim.join("Eve", { id: "e1" });
  sim.run("realm:titles_give", op, "Eve", "Veteran");
  await sim.settle();
  assert.equal(saved(sim, "e1").n, "Eve");
  assert.equal(sim.props.get("titles:n:eve"), "e1");
});

test("O42: a pruned record's index entry goes, and the player can be indexed again when they return", async () => {
  const sim = await world({ "titles:p:g1": record("Gone", ["A"], { ls: Date.now() - 400 * 86400000 }), "titles:n:gone": "g1" });
  await sim.until(() => !sim.props.has("titles:p:g1"), 3000);
  assert.equal(sim.props.has("titles:p:g1"), false, "the old record is pruned");
  assert.equal(sim.props.has("titles:n:gone"), false);
  const p = sim.join("Gone", { id: "g1" });
  sim.game.emit("world.after.playerSpawn", { player: p, initialSpawn: true });
  await sim.settle();
  assert.equal(sim.props.get("titles:n:gone"), "g1");
});
