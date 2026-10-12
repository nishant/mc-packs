// Expeditions: a Gauntlet with Fixed loadout on a flat world. Checks the build (every room reachable on foot),
// plays it room by room (puzzles and fights skipped with realm:expedition_debug {skip}, the trap hall crossed,
// both sanctuaries' boon forms answered, the boss killed), then leaves and checks the player's own items came
// back into their slots exactly (enchantments, name, lore, durability) and the kit gear is gone.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-gauntlet.js --timeout 600
import { EnchantmentType, EquipmentSlot, ItemStack } from "@minecraft/server";
function fp(it) {
  if (!it) return null;
  const en = it.getComponent("minecraft:enchantable")?.getEnchantments().map((e) => `${e.type.id}:${e.level}`).sort() ?? [];
  const dur = it.getComponent("minecraft:durability")?.damage ?? null;
  return JSON.stringify({ id: it.typeId, n: it.amount, name: it.nameTag ?? null, lore: it.getLore(), en, dur });
}
function snapshot(p) {
  const inv = p.getComponent("minecraft:inventory").container;
  const eq = p.getComponent("minecraft:equippable");
  const out = [];
  for (let k = 0; k < 36; k++) out.push(fp(inv.getItem(k)));
  for (const s of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) out.push(fp(eq.getEquipment(s)));
  return out;
}
export default async function (t) {
  t.formTimeout = 400;
  const p = await t.player("Tester", { op: true });
  const sx = Math.floor(p.location.x) + 300;
  const sz = Math.floor(p.location.z);
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(p, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(p, /site set/i, { timeout: 200 });
  // Own items: enchanted, named, damaged, armor, offhand, stacks.
  const inv = p.getComponent("minecraft:inventory").container;
  const eq = p.getComponent("minecraft:equippable");
  const sword = new ItemStack("minecraft:diamond_sword", 1);
  sword.getComponent("minecraft:enchantable").addEnchantment({ type: new EnchantmentType("sharpness"), level: 5 });
  sword.getComponent("minecraft:enchantable").addEnchantment({ type: new EnchantmentType("looting"), level: 3 });
  sword.nameTag = "Old Faithful";
  sword.setLore(["Forged in the deep"]);
  sword.getComponent("minecraft:durability").damage = 123;
  inv.setItem(3, sword);
  inv.setItem(20, new ItemStack("minecraft:dirt", 37));
  inv.setItem(35, new ItemStack("minecraft:totem_of_undying", 1));
  const plate = new ItemStack("minecraft:diamond_chestplate", 1);
  plate.getComponent("minecraft:enchantable").addEnchantment({ type: new EnchantmentType("protection"), level: 4 });
  eq.setEquipment(EquipmentSlot.Chest, plate);
  eq.setEquipment(EquipmentSlot.Offhand, new ItemStack("minecraft:shield", 1));
  const before = snapshot(p);
  t.log(`own items: ${before.filter((x) => x).length}`);
  // Gauntlet, Easy, Fixed loadout switched on.
  t.answerForm(p, "Start a Gauntlet", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Fixed loadout", "Start the Gauntlet");
  t.cmd(p, "/realm:expedition");
  let st = await t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "Gauntlet active" });
  t.check(st.long && st.loadout, "long run with fixed loadout");
  await t.wait(30);
  const during = snapshot(p);
  t.check(!during.includes(before[3]), "own sword stored away");
  t.check(during.some((x) => x && x.includes("Expedition gear")), "kit gear given");
  t.log(`kit: ${during.filter((x) => x).map((x) => JSON.parse(x).id).join(", ")}`);
  await checkBuild(t, st, "Gauntlet");
  let guard = 0;
  let boons = 0;
  let traps = 0;
  while (guard++ < 80) {
    st = await state(t);
    if (!st || st.phase !== "active") break;
    const rm = st.rm;
    const entry = rm.doors.find((d) => d[0] === "back" && d[3] === 0);
    const [u, v] = entry ? onSide("back", entry[1], rm.r) : [0, 0];
    if (rm.kind !== "entry") p.teleport(local(rm, u, v, 1));
    if (rm.kind === "boon") {
      const f = await t.waitForm(p, { timeout: 100, title: "boon" });
      t.log(`boon offer: ${f.buttons.map((b) => b.split("\n")[0]).join(" | ")}`);
      f.answer(boons % 3);
      boons++;
      await t.waitMessage(p, /everyone has chosen/i, { timeout: 100 });
      continue;
    }
    await t.wait(20);
    if (rm.kind === "trap") {
      traps++;
      t.log(`trap hall ${rm.i}: shape ${rm.shape}, r ${rm.r}, lane ${rm.lane}, doors ${JSON.stringify(rm.doors)}`);
      await t.wait(80); // flames and arrows fire meanwhile
      p.teleport(rm.zone);
      await t.waitMessage(p, /made it through/i, { timeout: 100 });
      continue;
    }
    if (rm.kind === "boss") {
      await t.wait(60);
      for (let k = 0; k < 10 && (await state(t))?.phase === "active"; k++) { t.server("/kill @e[tag=realm:exp_mob]"); await t.wait(20); }
      break;
    }
    t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ skip: true }));
    await t.wait(10);
  }
  st = await state(t);
  t.assert(st?.phase === "finishing", `finishing (${st?.phase})`);
  t.check(boons >= 2, `two sanctuaries (${boons})`);
  t.check(traps >= 1, `a trap hall (${traps})`);
  t.log(`boons: ${JSON.stringify(st.boons)}`);
  // Mess with the inventory: take something into the freed sword slot so the restore must go elsewhere.
  inv.setItem(3, new ItemStack("minecraft:stick", 5));
  t.cmd(p, "/realm:expedition_leave");
  await t.waitMessage(p, /own items are back/i, { timeout: 300 });
  await t.wait(10);
  const after = snapshot(p);
  for (let k = 0; k < before.length; k++) {
    if (k === 3 || before[k] === null) continue;
    t.check(after[k] === before[k], `slot ${k} restored exactly: ${after[k]} vs ${before[k]}`);
  }
  t.check(after.some((x) => x === before[3]), "the sword came back (moved: its slot was taken)");
  t.check(after[3]?.includes("stick"), "the stick wasn't overwritten");
  t.check(!after.some((x) => x && x.includes("Expedition gear")), "kit gear taken away");
  t.check(!p.getDynamicProperty("expedition:stash"), "stash cleared");
  t.check(t.world.structureManager.getWorldStructureIds().filter((x) => x.startsWith("expedition:stash")).length === 0, "stash structure deleted");
  const carts = t.dimension.getEntities({ type: "minecraft:chest_minecart" });
  t.check(carts.length === 0, `no carts left (${carts.length})`);
}
// shared helpers (pasted into each scenario: scenarios can't import)
const PASS = /air|bars|sign|button|plate|ladder|lever|web|fire|lantern|torch|water|carpet|chain/;
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
/** BFS over the box at feet level from a world spot; returns a Set of "x,z" */
function worldWalk(t, st, from) {
  const dim = t.dimension;
  const y = st.o.y + 1;
  const seen = new Set();
  const ok = (x, z) => {
    if (x < st.o.x || z < st.o.z || x >= st.o.x + st.size || z >= st.o.z + st.size) return false;
    for (const dy of [0, 1]) {
      const b = dim.getBlock({ x, y: y + dy, z });
      if (!b) return false;
      if (!(b.isAir || b.isLiquid || PASS.test(b.typeId))) return false;
    }
    return true;
  };
  const q = [[Math.floor(from.x), Math.floor(from.z)]];
  seen.add(`${q[0][0]},${q[0][1]}`);
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${z + dz}`;
      if (seen.has(k) || !ok(x + dx, z + dz)) continue;
      seen.add(k);
      q.push([x + dx, z + dz]);
    }
  }
  return seen;
}
async function allRooms(t, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((await state(t, i))?.rm);
  return out;
}
/** Checks every room's build: the floor walk reaches each room until a shaft's high exit. */
async function checkBuild(t, st, label) {
  const total = st.sides.length + st.n;
  const rooms = await allRooms(t, total);
  const entry = rooms[0];
  const start = local(entry, 0, 0, 1);
  const seen = worldWalk(t, st, start);
  let reachedUntil = -1;
  const shapes = {};
  for (let i = 0; i < rooms.length; i++) {
    const rm = rooms[i];
    if (!rm) { t.check(false, `${label} room ${i} state`); continue; }
    shapes[rm.shape] = (shapes[rm.shape] ?? 0) + 1;
    let any = false;
    for (let u = -rm.r; u <= rm.r && !any; u++) for (let v = -rm.r; v <= rm.r && !any; v++) {
      const w = local(rm, u, v, 1);
      if (seen.has(`${Math.floor(w.x)},${Math.floor(w.z)}`)) any = true;
    }
    if (any && i < st.n && reachedUntil === i - 1) reachedUntil = i;
    // A room after a shaft is reached through the chute: don't count it.
    const prevShaft = i > 0 && rooms[i - 1]?.kind === "shaft";
    if (!any && !prevShaft && i < st.n && !rooms.slice(0, i).some((x) => x?.kind === "shaft")) t.check(false, `${label}: room ${i} (${rm.kind} ${rm.shape} r${rm.r}) not reachable on foot`);
  }
  t.log(`${label}: ${st.n} path rooms + ${st.sides.length} side, box ${st.size}, cell ${st.cell}; walkable cells ${seen.size}; reached rooms 0..${reachedUntil}; shapes ${JSON.stringify(shapes)}`);
  return rooms;
}
