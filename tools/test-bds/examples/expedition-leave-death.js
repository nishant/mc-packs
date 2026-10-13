// Expeditions: a member who leaves (/realm:expedition_leave or the menu's Leave) and dies in the moment before the
// fade sends her home (a monster's last hit, lava). Her body must not be "sent back" (that loses her start spot: she
// would respawn at her bed or the world spawn), and what she dropped in the dungeon must come back to her rather
// than be swept away when the box is filled in.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-leave-death.js --timeout 900
import { ItemStack } from "@minecraft/server";
const active = (t) => t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "run active" });
const over = (t) => t.waitUntil(async () => { const s = await state(t); return s && s.phase === "none" && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "run over and the box reset" });
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
  // She starts away from world spawn (where she'd respawn), so being sent back is told apart from a plain respawn.
  const hx = Math.floor(ann.location.x) + 100;
  const hz = Math.floor(ann.location.z);
  const there = await t.loadArea(hx, hz, { radius: 1 });
  ann.teleport({ x: hx + 0.5, y: there.top.y + 1, z: hz + 0.5 });
  await t.wait(10);
  ann.getComponent("minecraft:inventory").container.setItem(3, new ItemStack("minecraft:emerald", 7));

  t.answerForm(ann, "Start an expedition", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Start");
  t.cmd(ann, "/realm:expedition");
  await active(t);
  await t.wait(40);
  t.check(ann.hasTag("realm_expedition"), "Ann is in the run");
  t.cmd(ann, "/realm:expedition_leave");
  await t.wait(3);
  ann.kill(); // the last hit lands before the fade is over
  await t.wait(10);
  await over(t);
  ann.respawn();
  await t.wait(120);
  t.check(Math.abs(ann.location.x - hx) < 3 && Math.abs(ann.location.z - hz) < 3, `Ann was sent back to where she started (${Math.round(ann.location.x)}, ${Math.round(ann.location.z)} vs ${hx}, ${hz})`);
  t.check(count(ann, "minecraft:emerald") === 7, `her emeralds came back (${count(ann, "minecraft:emerald")} of 7)`);
  t.check(!ann.hasTag("realm_expedition"), "Ann's tag is gone");
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
