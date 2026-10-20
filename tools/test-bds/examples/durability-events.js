// Low Durability Warning without a poll: a tool that wears down by mining, armor that wears down when its wearer is
// hurt (put on by a script, so no inventory event), and armor changed with no event at all (only the 5 s sweep sees
// it) all still warn. The timeouts are the old poll's (a check every 10 ticks, armor every 40) plus the sweep, so
// this passes before and after the event-driven checks. About 30 seconds:
//   node tools/test-bds/run.mjs --quiet --only durability_bp --scenario tools/test-bds/examples/durability-events.js
export default async function (t) {
  const { ItemStack, EquipmentSlot } = t.mc;
  const p = await t.player("Tester", { gameMode: "survival" });
  const inv = p.getComponent("inventory").container;
  const eq = p.getComponent("equippable");
  p.selectedSlotIndex = 0;
  const bars = (re) => t.messages(p, { pack: "durability_bp", kind: "actionbar" }).filter((m) => re.test(m.plain));
  /** A new item of `id` with `over` uses left above the 10% line. */
  const worn = (id, over) => {
    const s = new ItemStack(id, 1);
    const d = s.getComponent("durability");
    d.damage = d.maxDurability - (Math.floor(d.maxDurability * 0.1) + over);
    return s;
  };
  const damage = (s) => s?.getComponent("durability")?.damage ?? -1;

  // 1. Mining: a shovel two uses above the line, dirt dug until it crosses; the warning follows the break.
  inv.setItem(0, worn("minecraft:iron_shovel", 2));
  await t.wait(25);
  t.assert(bars(/Iron Shovel is low/).length === 0, "no warning above the line");
  const at = p.location;
  const x = Math.floor(at.x) + 1, y = Math.floor(at.y), z = Math.floor(at.z);
  const start = damage(inv.getItem(0));
  let wornAt = -1;
  for (let i = 0; i < 8 && wornAt < 0; i++) {
    t.server(`/setblock ${x} ${y} ${z} dirt`);
    await t.wait(2);
    p.lookAtBlock({ x, y, z });
    p.breakBlock({ x, y, z });
    await t.waitUntil(() => t.dimension.getBlock({ x, y, z })?.typeId === "minecraft:air", { timeout: 60 }).catch(() => undefined);
    if (damage(inv.getItem(0)) >= start + 2) wornAt = t.tick;
    await t.wait(2);
  }
  t.assert(wornAt >= 0, `digging wore the shovel down (damage ${start} -> ${damage(inv.getItem(0))})`);
  await t.waitUntil(() => bars(/Iron Shovel is low/).length > 0, { timeout: 25, message: "no warning within 25 ticks of the shovel crossing the line" });
  t.log(`shovel warning ${bars(/Iron Shovel is low/)[0].tick - wornAt} ticks after the wear was seen`);
  inv.setItem(0, undefined);

  // 2. Armor put on by a script (no inventory event), one use above the line: a hit wears it across, and the warning follows.
  eq.setEquipment(EquipmentSlot.Chest, worn("minecraft:iron_chestplate", 1));
  await t.wait(25);
  t.check(bars(/Iron Chestplate is low/).length === 0, "no armor warning above the line");
  const before = damage(eq.getEquipment(EquipmentSlot.Chest));
  const hitAt = t.tick;
  p.applyDamage(8, { cause: t.mc.EntityDamageCause.entityAttack });
  await t.wait(2);
  t.assert(damage(eq.getEquipment(EquipmentSlot.Chest)) > before, `the hit wore the chestplate down (${before} -> ${damage(eq.getEquipment(EquipmentSlot.Chest))})`);
  await t.waitUntil(() => bars(/Iron Chestplate is low/).length > 0, { timeout: 45, message: "no chestplate warning within 45 ticks of the hit" });
  t.log(`chestplate warning ${bars(/Iron Chestplate is low/)[0].tick - hitAt} ticks after the hit`);
  eq.setEquipment(EquipmentSlot.Chest, undefined);

  // 3. Armor changed with no event at all: the sweep (every 5 s) still finds it.
  const quiet = worn("minecraft:iron_leggings", 0);
  quiet.getComponent("durability").damage += 5; // below the line already
  eq.setEquipment(EquipmentSlot.Legs, quiet);
  const putAt = t.tick;
  await t.waitUntil(() => bars(/Iron Leggings is low/).length > 0, { timeout: 120, message: "no leggings warning within 6 s" });
  t.log(`leggings warning ${bars(/Iron Leggings is low/)[0].tick - putAt} ticks after they were put on`);
  eq.setEquipment(EquipmentSlot.Legs, undefined);
  t.check(bars(/is low|about to break/).length === 3, `exactly three warnings (${bars(/is low|about to break/).map((m) => m.plain).join(" / ")})`);
}
