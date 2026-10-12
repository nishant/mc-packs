// Expeditions: a party of four on a 10-room Gauntlet (a sanctuary every 3 rooms) with Fixed loadout, started far from
// spawn (so coming home lands in chunks that aren't loaded yet). Mixed states: Dee leaves mid-run, Bea closes her first
// boon form and picks later from /realm:expedition, Cal disconnects, Bea ignores the second form (the sanctuary fades
// after a minute) and then dies, Ann beats the boss and leaves the treasure room with the gold button's command.
// Checks each player's own items came back exactly, kit and boon gear are gone, boon food is kept, wolves, mobs and
// carts are gone, the box is filled in, and only the disconnected player's stash is still waiting.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-party.js --timeout 900
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
const gear = (snap) => snap.filter((x) => x && x.includes("Expedition gear"));
function giveOwn(p, k) {
  const inv = p.getComponent("minecraft:inventory").container;
  const eq = p.getComponent("minecraft:equippable");
  const sword = new ItemStack("minecraft:diamond_sword", 1);
  sword.getComponent("minecraft:enchantable").addEnchantment({ type: new EnchantmentType("sharpness"), level: 2 + k });
  sword.nameTag = `${p.name}'s blade`;
  sword.getComponent("minecraft:durability").damage = 10 + k;
  inv.setItem(k, sword);
  inv.setItem(10 + k, new ItemStack("minecraft:oak_log", 20 + k));
  eq.setEquipment(EquipmentSlot.Head, new ItemStack("minecraft:golden_helmet", 1));
}
function compare(t, who, before, after) {
  let bad = 0;
  for (let k = 0; k < before.length; k++) if (before[k] && after[k] !== before[k]) bad++;
  t.check(bad === 0, `${who}: own items restored exactly (${bad} slots differ)`);
  t.check(gear(after).length === 0, `${who}: no run gear left (${gear(after).length})`);
}
const cfg = (t, key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `t${key}`, pack: "expedition_bp", key, value }));

export default async function (t) {
  t.formTimeout = 300;
  cfg(t, "gauntletRooms", 10);
  cfg(t, "boonEvery", 3);
  const a0 = await t.player("Ann", { op: true });
  const fx = Math.floor(a0.location.x) + 2000;
  const fz = Math.floor(a0.location.z);
  const sx = Math.floor(a0.location.x) + 300;
  await t.loadArea(sx, fz, { radius: 4 });
  t.assert(t.cmd(a0, `/realm:expedition_site ${sx} ${fz}`).ok, "site");
  await t.waitMessage(a0, /site set/i, { timeout: 200 });
  await t.loadArea(fx, fz, { radius: 1 });
  const ann = a0;
  const bea = await t.player("Bea", { x: fx + 1, z: fz });
  const cal = await t.player("Cal", { x: fx - 1, z: fz });
  const dee = await t.player("Dee", { x: fx, z: fz + 1 });
  ann.teleport({ x: fx + 0.5, y: bea.location.y, z: fz + 0.5 });
  t.server("/tickingarea remove_all"); // only the players keep the far chunks loaded from now on
  await t.wait(20);
  const all = [ann, bea, cal, dee];
  all.forEach((p, k) => {
    p.addTag("realm_party:t1");
    giveOwn(p, k);
  });
  const before = new Map(all.map((p) => [p.name, snapshot(p)]));
  for (const p of [bea, cal, dee]) t.answerForm(p, "Join");
  t.answerForm(ann, "Start a Gauntlet", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Fixed loadout", "Start the Gauntlet");
  t.cmd(ann, "/realm:expedition");
  let st = await t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "Gauntlet active" });
  t.check(st.n === 10 && st.loadout, `10 rooms with fixed loadout (${st.n})`);
  await t.wait(30);
  for (const p of all) t.check(gear(snapshot(p)).length >= 8, `${p.name} got the kit`);
  for (const p of all) t.check(p.hasTag("realm_expedition"), `${p.name} has the realm_expedition tag`);
  const inRun = new Set(all.map((p) => p.name));
  let boons = 0;
  let guard = 0;
  while (guard++ < 60) {
    st = await state(t);
    if (!st || st.phase !== "active") break;
    const rm = st.rm;
    const entry = rm.doors.find((d) => d[0] === "back" && d[3] === 0);
    const [u, v] = entry ? onSide("back", entry[1], rm.r) : [0, 0];
    const here = all.filter((p, k) => inRun.has(["Ann", "Bea", "Cal", "Dee"][k]));
    if (rm.kind !== "entry") here.forEach((p, k) => p.teleport(local(rm, u + (k % 2), v + 1 + Math.floor(k / 2), 1)));
    if (st.room === 2 && inRun.has("Dee")) {
      // Dee leaves mid-run (not the last one): back home far away, own items back.
      t.cmd(dee, "/realm:expedition_leave");
      inRun.delete("Dee");
      // A simulated player doesn't load the chunks it's teleported into: they stay unloaded until the ticking area
      // below (a real client loads them a moment later). The stash must wait for them, not vanish.
      await t.wait(80);
      t.check(!t.messages(dee).some((m) => /own items are back/i.test(m.plain)), "Dee's items wait for her chunks to load");
      t.check(t.world.structureManager.getWorldStructureIds().filter((x) => x.startsWith("expedition:stash")).length === 4, "every stash still saved meanwhile");
      t.server(`/tickingarea add circle ${fx} -60 ${fz} 2 far`);
      await t.waitMessage(dee, /own items are back/i, { timeout: 400 });
      await t.wait(10);
      compare(t, "Dee (left)", before.get("Dee"), snapshot(dee));
      t.check(!dee.hasTag("realm_expedition"), "Dee's tag is gone");
      t.check(Math.abs(dee.location.x - fx) < 3, `Dee is back where she started (${Math.round(dee.location.x)})`);
    }
    if (rm.kind === "boon") {
      boons++;
      if (boons === 1) {
        const fa = t.waitForm(ann, { timeout: 100, title: "boon" });
        const fb = t.waitForm(bea, { timeout: 100, title: "boon" });
        const fc = t.waitForm(cal, { timeout: 100, title: "boon" });
        const [a, b, c] = await Promise.all([fa, fb, fc]);
        t.log(`sanctuary 1 offers: Ann ${a.buttons.map((x) => x.split("\n")[0]).join(" | ")}`);
        const item = a.buttons.findIndex((x) => /Quiver|Blade|Plate|Rations|Feast|Second Wind|Wolf/.test(x));
        a.answer(item >= 0 ? item : 0);
        b.answer(null);
        c.answer(1);
        await t.wait(60);
        st = await state(t);
        t.check(st.room === rm.i, `sanctuary waits for Bea (room ${st.room})`);
        // Bea picks from the run menu.
        t.answerForm(bea, "Choose your boon", 2);
        t.cmd(bea, "/realm:expedition");
        await t.waitMessage(ann, /everyone has chosen/i, { timeout: 200 });
        st = await state(t);
        t.log(`boons after 1: ${JSON.stringify(st.boons)}`);
        t.check(Object.keys(st.boons).length === 3, "three players have a boon");
        // Cal disconnects.
        cal.disconnect();
        inRun.delete("Cal");
        await t.waitMessage(ann, /Cal left the game/i, { timeout: 100 });
      } else {
        const fa = t.waitForm(ann, { timeout: 100, title: "boon" });
        const fb = t.waitForm(bea, { timeout: 100, title: "boon" });
        const [a, b] = await Promise.all([fa, fb]);
        const item = a.buttons.findIndex((x) => /Quiver|Blade|Plate|Rations|Feast|Second Wind|Wolf/.test(x));
        a.answer(item >= 0 ? item : 0);
        b.answer(null); // ignored
        // Simulated players don't fight back: mobs left from the skipped elite hall would kill them during the minute.
        t.server("/kill @e[tag=realm:exp_mob]");
        t.server("/effect @a resistance 70 255 true");
        const t0 = t.tick;
        await t.waitMessage(ann, /light fades/i, { timeout: 1400 });
        t.log(`sanctuary 2 faded after ${t.tick - t0} ticks`);
        st = await state(t);
        t.log(`boons after 2: ${JSON.stringify(st.boons)}`);
      }
      continue;
    }
    await t.wait(20);
    if (rm.kind === "trap") {
      for (const p of here) p.teleport(rm.zone);
      await t.waitMessage(ann, /made it through/i, { timeout: 100 });
      continue;
    }
    if (rm.kind === "boss") {
      // Bea dies in the boss room.
      const beaInv = snapshot(bea).filter((x) => x).length;
      bea.kill();
      inRun.delete("Bea");
      await t.waitMessage(ann, /Bea fell/i, { timeout: 100 });
      t.log(`Bea carried ${beaInv} stacks when she fell`);
      await t.wait(40);
      const left = t.dimension.getEntities({ type: "minecraft:item", location: bea.location, maxDistance: 8 });
      t.check(left.length === 0, `Bea's drops were collected (${left.length} left)`);
      bea.respawn();
      await t.waitMessage(bea, /own items are back/i, { timeout: 400 });
      await t.wait(20);
      const bAfter = snapshot(bea);
      compare(t, "Bea (died)", before.get("Bea"), bAfter);
      t.check(!bea.hasTag("realm_expedition"), "Bea's tag is gone");
      t.log(`Bea after: ${bAfter.filter((x) => x).map((x) => JSON.parse(x).id).join(", ")}`);
      await t.wait(60);
      for (let k = 0; k < 10 && (await state(t))?.phase === "active"; k++) { t.server("/kill @e[tag=realm:exp_mob]"); await t.wait(20); }
      break;
    }
    t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify({ skip: true }));
    await t.wait(10);
  }
  st = await state(t);
  t.assert(st?.phase === "finishing", `finishing (${st?.phase})`);
  t.check(boons === 2, `two sanctuaries (${boons})`);
  const wolves = t.dimension.getEntities({ type: "minecraft:wolf" }).length;
  t.log(`wolves during treasure: ${wolves}`);
  const annBoons = st.boons[ann.id] ?? [];
  t.cmd(ann, "/realm:expedition_leave");
  await t.waitMessage(ann, /own items are back/i, { timeout: 300 });
  await t.waitMessage(ann, /treasure left in the chests/i, { timeout: 200 });
  await t.wait(20);
  const aAfter = snapshot(ann);
  compare(t, "Ann (finished)", before.get("Ann"), aAfter);
  t.check(!ann.hasTag("realm_expedition"), "Ann's tag is gone");
  t.log(`Ann's boons ${JSON.stringify(annBoons)}; after: ${aAfter.filter((x) => x).map((x) => JSON.parse(x).id).join(", ")}`);
  if (annBoons.includes("rations") || annBoons.includes("feast")) t.check(aAfter.some((x) => x && x.includes("golden_apple")), "boon food kept");
  t.check(Math.abs(ann.location.x - fx) < 3, `Ann is back where she started (${Math.round(ann.location.x)})`);
  // The run is over: the dungeon is filled in.
  await t.waitUntil(async () => (await state(t))?.phase === "none", { timeout: 600, interval: 20, message: "run gone" });
  await t.loadArea(sx, fz, { radius: 4 });
  await t.wait(40);
  t.check(t.dimension.getEntities({ tags: ["realm:exp_mob"] }).length === 0, "no dungeon mobs");
  t.check(t.dimension.getEntities({ type: "minecraft:wolf" }).length === 0, "no wolves");
  t.check(t.dimension.getEntities({ type: "minecraft:chest_minecart" }).length === 0, "no carts");
  const stashes = t.world.structureManager.getWorldStructureIds().filter((x) => x.startsWith("expedition:stash"));
  const parcels = t.world.structureManager.getWorldStructureIds().filter((x) => x.startsWith("expedition:parcel"));
  t.check(stashes.length === 1, `only Cal's stash waits (${stashes.join(",")})`);
  t.log(`parcels left: ${parcels.join(",") || "none"}`);
  const b = t.dimension.getBlock({ x: st.o.x + Math.floor(st.size / 2), y: st.o.y + 1, z: st.o.z + Math.floor(st.size / 2) });
  t.log(`box middle after reset: ${b?.typeId}`);
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
