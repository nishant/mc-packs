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

const entityTap = (w, player, typeId, at = { x: 2, y: 64, z: 2 }, { tags = [], tamed = false } = {}) => {
  const target = { typeId, dimension: { id: OW }, location: at, hasTag: (t) => tags.includes(t), getComponent: (c) => (tamed && c === "minecraft:is_tamed" ? {} : undefined) };
  const event = { player, target, cancel: false };
  w.sim.game.emit("world.before.playerInteractWithEntity", event);
  return event.cancel;
};
const blockTap = (w, player, typeId, at = { x: 3, y: 64, z: 3 }, itemStack = undefined) => {
  const event = { player, blockFace: "Up", isFirstEvent: true, itemStack, block: { typeId, x: at.x, y: at.y, z: at.z, location: at, dimension: { id: OW } }, cancel: false };
  w.sim.game.emit("world.before.playerInteractWithBlock", event);
  return event.cancel;
};

const one = [claim(1, "id-Ann", "Ann", 0, 16)];
const REAL_DOORS = ["minecraft:wooden_door", "minecraft:spruce_door", "minecraft:dark_oak_door", "minecraft:bamboo_door", "minecraft:cherry_door", "minecraft:trapdoor", "minecraft:mangrove_trapdoor", "minecraft:crimson_trapdoor", "minecraft:fence_gate", "minecraft:warped_fence_gate", "minecraft:pale_oak_fence_gate"];

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
  assert.equal(blockTap(w, w.bob, "minecraft:wooden_door"), true);
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
  for (const t of REAL_DOORS) assert.equal(blockTap(w, w.bob, t), false, t);
  for (const t of ["minecraft:iron_door", "minecraft:iron_trapdoor", "minecraft:chest", "minecraft:iron_door"]) assert.equal(blockTap(w, w.bob, t), true, `${t} stays closed`);
  assert.equal(blockTap(w, w.bob, "minecraft:wooden_door", { x: 400, y: 64, z: 3 }), false, "outside");
});

test("a door switch is per claim", async () => {
  const w = await world({ claims: [claim(1, "id-Ann", "Ann", 0, 16, { dr: true }), claim(2, "id-Bob", "Bob", 500, 16)] });
  assert.equal(blockTap(w, w.op, "minecraft:wooden_door"), false);
  assert.equal(blockTap(w, w.ann, "minecraft:wooden_door", { x: 503, y: 64, z: 3 }), true, "Ann is a visitor in Bob's claim");
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
test("O27 review: the door switch needs a plain tap: sneaking, buckets, wax, axes and fire items still can't use a visitor's way in", async () => {
  const w = await world({ claims: [claim(1, "id-Ann", "Ann", 0, 16, { dr: true })] });
  assert.equal(blockTap(w, w.bob, "minecraft:wooden_door"), false, "empty hand opens");
  assert.equal(blockTap(w, w.bob, "minecraft:wooden_door", undefined, { typeId: "minecraft:stick" }), false, "an ordinary item opens");
  for (const item of ["minecraft:lava_bucket", "minecraft:water_bucket", "minecraft:honeycomb", "minecraft:iron_axe", "minecraft:flint_and_steel", "minecraft:fire_charge", "minecraft:shears"]) {
    assert.equal(blockTap(w, w.bob, "minecraft:wooden_door", undefined, { typeId: item }), true, item);
  }
  w.bob.isSneaking = true;
  assert.equal(blockTap(w, w.bob, "minecraft:wooden_door"), true, "sneaking places blocks instead of opening");
  assert.equal(blockTap(w, w.bob, "minecraft:trapdoor", undefined, { typeId: "minecraft:cobblestone" }), true);
});

test("O27 review: story and townsfolk actors stay tappable in a claim; tamed pets and the extended list are protected", async () => {
  const w = await world({ claims: one });
  assert.equal(entityTap(w, w.bob, "minecraft:cat", undefined, { tags: ["saga:actor"] }), false, "a saga actor");
  assert.equal(entityTap(w, w.bob, "minecraft:villager", undefined, { tags: ["realm:npc"] }), false);
  assert.equal(entityTap(w, w.bob, "realm:npc_label"), false);
  assert.equal(entityTap(w, w.bob, "minecraft:parrot", undefined, { tamed: true }), true);
  assert.equal(entityTap(w, w.bob, "minecraft:allay"), true);
  assert.equal(entityTap(w, w.bob, "minecraft:bat", undefined, { tamed: true }), true, "any tamed pet");
  assert.equal(entityTap(w, w.bob, "minecraft:bat"), false);
  assert.equal(entityTap(w, w.ann, "minecraft:bat", undefined, { tamed: true }), false, "the claim owner");
});

test("O27 review: a new claim starts with a last visit, and an owner standing in it keeps it fresh (throttled)", async () => {
  const w = await world({ claims: [] });
  w.ann.location = { x: 0, y: 64, z: 0 };
  w.sim.run("realm:claim", w.ann);
  let f = await w.sim.nextForm();
  w.sim.answer({ selection: f.form.buttons.findIndex((b) => /Claim/i.test(b)) });
  await w.sim.settle();
  while (w.sim.pending.length) w.sim.answer({ canceled: true });
  const key = [...w.sim.props.keys()].find((k) => k.startsWith("claims:c:"));
  assert.ok(key, [...w.sim.props.keys()].join());
  const made = JSON.parse(w.sim.props.get(key)).lv;
  assert.ok(Math.abs(made - Date.now()) < 5000, "set on creation");
  const old = { ...JSON.parse(w.sim.props.get(key)), lv: Date.now() - 3 * DAY };
  w.sim.props.set(key, JSON.stringify(old));
  w.sim.leave(w.bob);
  const w2 = await world({ claims: [claim(1, "id-Ann", "Ann", 0, 16, { lv: Date.now() - 3 * DAY })] });
  w2.ann.location = { x: 1, y: 64, z: 1 };
  w2.sim.step(25);
  assert.ok(JSON.parse(w2.sim.props.get("claims:c:1")).lv > Date.now() - 5000, "refreshed while inside");
  const writes = w2.sim.props.get("claims:c:1");
  w2.sim.step(100);
  assert.equal(w2.sim.props.get("claims:c:1"), writes, "not rewritten within a minute");
});

test("O27 review: the audit list rechecks the operator when it opens", async () => {
  const w = await world({ claims: one });
  w.op.commandPermissionLevel = 0;
  w.sim.run("realm:claim", w.op);
  const f = await w.sim.nextForm();
  assert.ok(!f.form.buttons.some((b) => /All claims/.test(b)));
});