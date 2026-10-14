// Expeditions: two members die in the same tick a few blocks apart (one blast wipes out the party). What each dropped
// comes back to its owner when they respawn. Before, the first death collected every item within 6 blocks, so the
// first player got both players' things and the second got nothing back.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-deaths.js --timeout 900
import { ItemStack } from "@minecraft/server";
const count = (p, id) => {
  const inv = p.getComponent("minecraft:inventory").container;
  let n = 0;
  for (let k = 0; k < inv.size; k++) {
    const it = inv.getItem(k);
    if (it?.typeId === id) n += it.amount;
  }
  return n;
};

export default async function (t) {
  t.formTimeout = 500;
  const ann = await t.player("Ann", { op: true });
  const sx = Math.floor(ann.location.x) + 300;
  const sz = Math.floor(ann.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(ann, /site set/i, { timeout: 200 });
  const bob = await t.player("Bob", { x: Math.floor(ann.location.x) + 1, z: sz });
  for (const p of [ann, bob]) {
    p.addTag("realm_party:t1");
    p.getComponent("minecraft:inventory").container.clearAll();
  }
  ann.getComponent("minecraft:inventory").container.setItem(3, new ItemStack("minecraft:emerald", 7));
  bob.getComponent("minecraft:inventory").container.setItem(5, new ItemStack("minecraft:diamond", 5));

  t.answerForm(bob, "Join");
  t.answerForm(ann, "Start an expedition", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Start");
  t.cmd(ann, "/realm:expedition");
  await t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "run active" });
  await t.wait(40);
  t.assert(ann.hasTag("realm_expedition") && bob.hasTag("realm_expedition"), "both are in the run");
  // Side by side, 3 blocks apart, and both die in the same tick.
  const a = ann.location;
  bob.teleport({ x: a.x + 3, y: a.y, z: a.z });
  await t.wait(5);
  ann.kill();
  bob.kill();
  await t.wait(10);
  await t.waitUntil(async () => { const s = await state(t); return s && s.phase === "none" && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "run over and the box reset" });
  ann.respawn();
  bob.respawn();
  await t.wait(160);
  const ae = count(ann, "minecraft:emerald"), ad = count(ann, "minecraft:diamond");
  const be = count(bob, "minecraft:emerald"), bd = count(bob, "minecraft:diamond");
  t.log(`Ann: ${ae} emeralds, ${ad} diamonds; Bob: ${be} emeralds, ${bd} diamonds`);
  t.check(ae === 7 && ad === 0, `Ann got her own emeralds back and nothing of Bob's (${ae} emeralds, ${ad} diamonds)`);
  t.check(bd === 5 && be === 0, `Bob got his own diamonds back and nothing of Ann's (${bd} diamonds, ${be} emeralds)`);
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
