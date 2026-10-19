// Land Claims public-server protections (audit O27): outsiders can't use farm/pet animals in a claim, a per-claim
// "visitors may open doors" switch, and the operator audit list by size and owner's last visit.
import assert from "node:assert/strict";
import test from "node:test";
import { createSim } from "./lib/pack-sim.mjs";

const DAY = 86_400_000;
const OW = "minecraft:overworld";
const claim = (id, o, n, x, r, extra = {}) => JSON.stringify({ id, o, n, dim: OW, x, z: 0, r, s: [], ...extra });

async function world({ claims, cfg = {} } = {}) {
  const sim = createSim();
  sim.props.set("claims:cfg", JSON.stringify({ enabled: true, ...cfg }));
  for (const c of claims) sim.props.set(`claims:c:${JSON.parse(c).id}`, c);
  await sim.load("claims_bp");
  sim.boot();
  const ann = sim.join("Ann", { id: "id-Ann" });
  const bob = sim.join("Bob", { id: "id-Bob" });
  const op = sim.join("Op", { id: "id-Op", op: true });
  for (const p of [ann, bob, op]) p.dimension = { id: OW };
  return { sim, ann, bob, op };
}

const entityTap = (w, player, typeId, at = { x: 2, y: 64, z: 2 }) => {
  const event = { player, target: { typeId, dimension: { id: OW }, location: at }, cancel: false };
  w.sim.game.emit("world.before.playerInteractWithEntity", event);
  return event.cancel;
};
const blockTap = (w, player, typeId, at = { x: 3, y: 64, z: 3 }, itemStack = undefined) => {
  const event = { player, blockFace: "Up", isFirstEvent: true, itemStack, block: { typeId, x: at.x, y: at.y, z: at.z, location: at, dimension: { id: OW } }, cancel: false };
  w.sim.game.emit("world.before.playerInteractWithBlock", event);
  return event.cancel;
};

const one = [claim(1, "id-Ann", "Ann", 0, 16)];

test("outsiders can't leash, milk, ride or feed farm and pet animals in a claim; the owner can", async () => {
  const w = await world({ claims: one });
  for (const t of ["minecraft:cow", "minecraft:sheep", "minecraft:horse", "minecraft:wolf", "minecraft:cat", "minecraft:chicken"]) {
    assert.equal(entityTap(w, w.bob, t), true, `${t} protected from Bob`);
    assert.equal(entityTap(w, w.ann, t), false, `${t} usable by Ann`);
  }
  assert.equal(entityTap(w, w.bob, "minecraft:cow", { x: 400, y: 64, z: 0 }), false, "outside any claim");
  assert.equal(entityTap(w, w.bob, "minecraft:villager"), false, "villagers stay tradable");
});

test("the animal protection can be switched off", async () => {
  const w = await world({ claims: one, cfg: { protectAnimals: false } });
  assert.equal(entityTap(w, w.bob, "minecraft:cow"), false);
  assert.equal(entityTap(w, w.bob, "minecraft:armor_stand"), true, "existing protected entities unchanged");
});

test("doors: closed to visitors by default, opened per claim by the owner's switch, chests still closed", async () => {
  const w = await world({ claims: one });
  assert.equal(blockTap(w, w.bob, "minecraft:oak_door"), true);
  w.sim.run("realm:claim", w.ann);
  let f = await w.sim.nextForm();
  w.sim.answer({ selection: f.form.buttons.findIndex((b) => /My claim/.test(b)) });
  f = await w.sim.nextForm();
  const i = f.form.buttons.findIndex((b) => /door/i.test(b));
  assert.ok(i >= 0, f.form.buttons.join("|"));
  w.sim.answer({ selection: i });
  await w.sim.settle();
  while (w.sim.pending.length) w.sim.answer({ canceled: true });
  assert.equal(JSON.parse(w.sim.props.get("claims:c:1")).dr, true);
  for (const t of ["minecraft:oak_door", "minecraft:spruce_trapdoor", "minecraft:oak_fence_gate"]) assert.equal(blockTap(w, w.bob, t), false, t);
  assert.equal(blockTap(w, w.bob, "minecraft:chest"), true);
  assert.equal(blockTap(w, w.bob, "minecraft:oak_door", { x: 400, y: 64, z: 3 }), false, "outside");
});

test("a door switch is per claim", async () => {
  const w = await world({ claims: [claim(1, "id-Ann", "Ann", 0, 16, { dr: true }), claim(2, "id-Bob", "Bob", 500, 16)] });
  assert.equal(blockTap(w, w.op, "minecraft:oak_door"), false);
  assert.equal(blockTap(w, w.ann, "minecraft:oak_door", { x: 503, y: 64, z: 3 }), true, "Ann is a visitor in Bob's claim");
});

async function audit(w, sortWord) {
  w.sim.run("realm:claim", w.op);
  let f = await w.sim.nextForm();
  w.sim.answer({ selection: f.form.buttons.findIndex((b) => /All claims/.test(b)) });
  f = await w.sim.nextForm();
  w.sim.answer({ selection: f.form.buttons.findIndex((b) => new RegExp(sortWord, "i").test(b)) });
  f = await w.sim.nextForm();
  const rows = f.form.buttons.filter((b) => /^(Ann|Bob|Cy)\b/.test(b));
  w.sim.answer({ canceled: true });
  return { rows, body: f.form.bodyText };
}

test("operator audit list sorts by claim size and by the owner's last visit, showing both", async () => {
  const now = Date.now();
  const w = await world({ claims: [claim(1, "off-Ann", "Ann", 0, 16, { lv: now - DAY }), claim(2, "off-Bob", "Bob", 500, 30), claim(3, "off-Cy", "Cy", 1000, 8, { lv: now - 40 * DAY })] });
  const bySize = await audit(w, "size");
  assert.deepEqual(bySize.rows.map((r) => r.split(":")[0]), ["Bob", "Ann", "Cy"]);
  assert.match(bySize.rows[0], /61 x 61/);
  const byVisit = await audit(w, "visit");
  assert.deepEqual(byVisit.rows.map((r) => r.split(":")[0]), ["Bob", "Cy", "Ann"]);
  assert.match(byVisit.rows[0], /unknown/i);
  assert.match(byVisit.rows[1], /40 days/);
});

test("an owner's last visit is saved on join and on leave, unknown fields kept", async () => {
  const now = Date.now();
  const w = await world({ claims: [claim(1, "id-Ann", "Ann", 0, 16, { keep: 7, lv: now - 9 * DAY })] });
  w.sim.game.emit("world.after.playerSpawn", { player: w.ann, initialSpawn: true });
  let c = JSON.parse(w.sim.props.get("claims:c:1"));
  assert.ok(c.lv >= now, "set on join");
  assert.equal(c.keep, 7);
  c.lv = now - 5 * DAY;
  w.sim.props.set("claims:c:1", JSON.stringify(c));
  w.sim.leave(w.ann);
  c = JSON.parse(w.sim.props.get("claims:c:1"));
  assert.ok(c.lv >= now, "set on leave: " + c.lv);
});

test("O28 access answer: the owner and a shared player get 'ours'; a stranger is closed; an operator bypass is not ownership", async () => {
  for (const bypass of [false, true]) {
    const w = await world({ claims: [claim(1, "id-Ann", "Ann", 0, 16, { s: [{ i: "id-Bob", n: "Bob" }] })], cfg: { operatorsBypass: bypass } });
    const ask = (player) => {
      const before = w.sim.game.sent.length;
      w.sim.game.deliver("realm:access_check", JSON.stringify({ id: "t", player, spots: [[OW, 3, 64, 3], [OW, 400, 64, 0]] }));
      const r = w.sim.game.sent.slice(before).find((s) => s.id === "realm:access_check_result");
      return JSON.parse(r.message);
    };
    assert.deepEqual([ask("id-Ann").closed, ask("id-Ann").ours], [[], [0]]);
    assert.deepEqual([ask("id-Bob").closed, ask("id-Bob").ours], [[], [0]]);
    assert.deepEqual([ask("id-Cy").closed, ask("id-Cy").ours], [[0], []]);
    const op = ask("id-Op");
    assert.deepEqual([op.closed, op.ours], [bypass ? [] : [0], []]);
  }
});