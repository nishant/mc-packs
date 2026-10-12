// Expeditions: edge cases around leaving a run. (A) A member teleported out of the dungeon dies out there within
// the 5 seconds before she counts as gone: what she (and anyone near her) dropped out there must stay on the ground,
// not be scooped into an expedition parcel. (B) An operator resets while a Nightmare Sigil run is still asking the
// party: the sigil comes back to the leader. (C) The last member dies with a wave alive and stays on the death screen
// while the dungeon is filled in: the reset still removes the mobs, keeps her return spot, and she is sent back to
// where she started when she respawns.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-edge.js --timeout 900
import { ItemStack } from "@minecraft/server";
const sigils = (p) => {
  const inv = p.getComponent("minecraft:inventory").container;
  let n = 0;
  for (let k = 0; k < inv.size; k++) {
    const it = inv.getItem(k);
    if (it && it.typeId === "minecraft:echo_shard" && (it.nameTag ?? "").includes("Nightmare Sigil")) n += it.amount;
  }
  return n;
};
const active = (t) => t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "run active" });
const over = (t) => t.waitUntil(async () => { const s = await state(t); return s && s.phase === "none" && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "run over and the box reset" });
/** Teleports players to just inside the current room's entrance. */
async function enter(t, players) {
  const st = await state(t);
  const rm = st.rm;
  const entry = rm.doors.find((d) => d[0] === "back" && d[3] === 0);
  const [u, v] = entry ? onSide("back", entry[1], rm.r) : [0, 0];
  players.forEach((p, k) => p.teleport(local(rm, u + (k % 2), v + 1 + Math.floor(k / 2), 1)));
  return st;
}

export default async function (t) {
  t.formTimeout = 500;
  const ann = await t.player("Ann", { op: true });
  const sx = Math.floor(ann.location.x) + 300;
  const sz = Math.floor(ann.location.z);
  const home = { x: ann.location.x, z: ann.location.z };
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  const bea = await t.player("Bea", { x: Math.floor(home.x) + 2, z: Math.floor(home.z) });
  for (const p of [ann, bea]) {
    p.addTag("realm_party:t1");
    p.getComponent("minecraft:inventory").container.setItem(3, new ItemStack("minecraft:emerald", 5));
  }
  // The far spot Bea is thrown out to: loaded, well outside the box.
  const fx = Math.floor(home.x) + 150;
  const fz = Math.floor(home.z);
  const far = await t.loadArea(fx, fz, { radius: 1 });

  // (A) Death outside the dungeon.
  t.answerForm(bea, "Join");
  t.answerForm(ann, "Start an expedition", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Start");
  t.cmd(ann, "/realm:expedition");
  await active(t);
  await t.wait(30);
  t.check(bea.hasTag("realm_expedition"), "Bea is in the run");
  const spot = { x: fx + 0.5, y: far.top.y + 1, z: fz + 0.5 };
  bea.teleport(spot);
  await t.wait(5);
  t.dimension.spawnItem(new ItemStack("minecraft:apple", 3), { x: spot.x + 1, y: spot.y, z: spot.z });
  await t.wait(5);
  bea.kill();
  await t.waitMessage(ann, /Bea fell/i, { timeout: 100 });
  await t.wait(40);
  const left = t.dimension.getEntities({ type: "minecraft:item", location: spot, maxDistance: 6 });
  t.log(`items left where Bea died out there: ${left.map((e) => e.getComponent("minecraft:item")?.itemStack?.typeId).join(", ") || "none"}`);
  t.check(left.some((e) => e.getComponent("minecraft:item")?.itemStack?.typeId === "minecraft:apple"), "the apple on the ground out there was left alone");
  t.check(left.some((e) => e.getComponent("minecraft:item")?.itemStack?.typeId === "minecraft:emerald"), "Bea's own drops out there stay where she died");
  const since = t.tick;
  bea.respawn();
  await t.wait(100);
  t.check(!t.messages(bea, { since }).some((m) => /dropped in the dungeon/i.test(m.plain)), "no parcel for a death outside the dungeon");
  t.check(Math.abs(bea.location.x - (home.x + 2)) < 3, `Bea was still sent back to where she started (${Math.round(bea.location.x)} vs ${Math.round(home.x + 2)})`);
  t.check(!bea.hasTag("realm_expedition"), "Bea's tag is gone");
  t.cmd(ann, "/realm:expedition_leave");
  await over(t);
  ann.teleport({ x: home.x, y: ann.location.y, z: home.z });

  // (B) An operator reset while a sigil run is gathering its party.
  t.answerForm(ann, "Operator tools", "Create a Nightmare Sigil", true);
  t.cmd(ann, "/realm:expedition");
  await t.waitMessage(ann, /Created a Nightmare Sigil/i, { timeout: 200 });
  t.check(sigils(ann) === 1, `Ann holds one sigil (${sigils(ann)})`);
  bea.teleport({ x: home.x + 2, y: ann.location.y, z: home.z });
  await t.wait(10);
  const ask = t.waitForm(bea, { timeout: 300 });
  t.answerForm(ann, "Use a Nightmare Sigil", 0, "Start (uses the sigil)");
  t.cmd(ann, "/realm:expedition");
  const form = await ask;
  t.check(/Join/.test(form.body), "Bea is being asked along");
  await t.wait(10);
  t.check((await state(t))?.phase === "gathering", "the run is gathering");
  t.check(sigils(ann) === 0, "the sigil was taken when the run started");
  t.cmd(ann, "/realm:expedition_reset");
  await t.wait(40);
  t.check(sigils(ann) === 1, `the sigil came back after the reset (${sigils(ann)})`);
  form.answer(null);
  await over(t);
  t.check(sigils(ann) === 1, `still one sigil once the party answered (${sigils(ann)})`);

  // (C) The last member dies with a wave alive and stays dead while the box is filled in.
  for (const p of [ann, bea]) p.removeTag("realm_party:t1");
  t.answerForm(ann, "Start an expedition", "Spider Nest", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Start");
  t.cmd(ann, "/realm:expedition");
  let st = await active(t);
  await t.wait(30);
  const start = { x: ann.location.x, z: ann.location.z };
  t.log(`Ann is in the dungeon at ${Math.round(start.x)}, ${Math.round(start.z)}`);
  // On to the first fight (other rooms skipped), until a wave is up.
  for (let guard = 0; guard < 12; guard++) {
    t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ skip: true }));
    await t.wait(15);
    st = await enter(t, [ann]);
    t.log(`room ${st.room}: ${st.rm.kind}`);
    if (st.rm.kind === "combat" || st.rm.kind === "elite") break;
  }
  await t.waitUntil(async () => ((await state(t))?.alive ?? 0) > 0, { timeout: 300, interval: 10, message: "a wave" });
  const box = { o: st.o, size: st.size, top: st.top };
  ann.kill();
  await t.wait(10);
  t.log(`dead players the box query sees: ${t.dimension.getEntities({ type: "minecraft:player", location: ann.location, maxDistance: 4 }).length}`);
  await over(t);
  t.log(`Ann's return spot after the reset: ${ann.getDynamicProperty("expedition:return") ?? "none"}`);
  t.check(typeof ann.getDynamicProperty("expedition:return") === "string", "Ann keeps her return spot while dead");
  const mid = { x: box.o.x + Math.floor(box.size / 2), y: box.o.y + 1, z: box.o.z + Math.floor(box.size / 2) };
  const mobs = t.dimension.getEntities({ tags: ["realm:exp_mob"] }).length;
  t.check(mobs === 0, `no dungeon mobs left after the reset (${mobs})`);
  t.check(t.dimension.getBlock(mid)?.typeId === "minecraft:deepslate", `the box is filled in (${t.dimension.getBlock(mid)?.typeId})`);
  ann.respawn();
  await t.wait(80);
  t.check(Math.abs(ann.location.x - home.x) < 3 && Math.abs(ann.location.z - home.z) < 3, `Ann was sent back to where she started (${Math.round(ann.location.x)}, ${Math.round(ann.location.z)} vs ${Math.round(home.x)}, ${Math.round(home.z)})`);
  t.check(!ann.hasTag("realm_expedition"), "Ann's tag is gone");
  t.check(typeof ann.getDynamicProperty("expedition:return") !== "string", "her return spot is forgotten once she is back");
}
// shared helpers (pasted into each scenario: scenarios can't import)
async function state(t, room) {
  const parts = [];
  let want = 0;
  const done = new Promise((res) => {
    const sub = t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
      if (ev.id !== "realm:expedition_state") return;
      const m = JSON.parse(ev.message);
      parts[m.part] = m.data;
      want = m.parts;
      if (parts.filter((x) => x !== undefined).length === want) {
        t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
        res(JSON.parse(parts.join("")));
      }
    });
  });
  t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify(room === undefined ? {} : typeof room === "object" ? room : { room }));
  return Promise.race([done, t.wait(40).then(() => undefined)]);
}
const local = (rm, u, v, y) => {
  const f = rm.fwd;
  const ac = { x: -f.z, z: f.x };
  return { x: Math.floor(rm.c.x) + ac.x * u + f.x * v + 0.5, y: rm.c.y + (y - 1), z: Math.floor(rm.c.z) + ac.z * u + f.z * v + 0.5 };
};
const onSide = (side, a, d) => (side === "back" ? [a, -d] : side === "fwd" ? [a, d] : side === "left" ? [-d, a] : [d, a]);
