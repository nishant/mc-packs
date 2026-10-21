// Silly Enchants follows gear by events: switching the hotbar to a sword with Confetti Swing works on the very next
// hit (no wait for a refresh), switching away stops it at once, and a death puts the effects of armor that was
// dropped away. Uses the pack's trace hook like silly-effects.js. About 30 seconds:
//   node tools/test-bds/run.mjs --quiet --only silly_bp,silly_rp --scenario tools/test-bds/examples/silly-gear-events.js
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  t.server("/gamerule keepinventory false");
  /** @type {{ tick: number, id: string }[]} */
  const fx = [];
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:silly_fx") return;
    try {
      fx.push({ tick: t.tick, id: JSON.parse(message).id });
    } catch {
      // not ours
    }
  });
  const p = await t.player("Tester", { op: true });
  await t.console("scriptevent realm:silly_trace on");
  const inv = p.getComponent("inventory").container;
  const eq = p.getComponent("equippable");
  const item = (id, ...names) => {
    const it = new t.mc.ItemStack(id, 1);
    it.setLore(names.map((n) => `§r§dSilly: ${n}`));
    return it;
  };
  const seen = (want, since) => fx.some((e) => e.tick >= since && e.id === want);

  // 1. A plain item in slot 0, the Confetti Swing sword in slot 1; wait out any refresh, then switch and hit at once.
  p.selectedSlotIndex = 0;
  inv.setItem(0, new t.mc.ItemStack("minecraft:stick", 1));
  inv.setItem(1, item("minecraft:diamond_sword", "Confetti Swing"));
  await t.wait(30);
  const at = p.location;
  const pig = t.dimension.spawnEntity("minecraft:pig", { x: at.x + 1.5, y: at.y, z: at.z });
  await t.wait(5);
  let since = t.tick;
  p.lookAtEntity(pig);
  p.attackEntity(pig);
  await t.wait(3);
  t.check(!seen("realm:silly_confetti", since), "no confetti from a plain stick");
  // A mob ignores hits for 10 ticks after one lands (no entityHitEntity at all), so each hit waits that out first.
  await t.wait(10);
  p.selectedSlotIndex = 1;
  await t.wait(1);
  since = t.tick;
  p.lookAtEntity(pig);
  p.attackEntity(pig);
  await t.waitUntil(() => seen("realm:silly_confetti", since), { timeout: 3, message: "no confetti on the first hit after switching to the sword" });
  t.log("confetti on the first hit after the switch");
  await t.wait(10);
  p.selectedSlotIndex = 0;
  await t.wait(1);
  since = t.tick;
  let hits = 0;
  const hitSub = t.world.afterEvents.entityHitEntity.subscribe(({ hitEntity }) => {
    if (hitEntity === pig) hits++;
  });
  p.lookAtEntity(pig);
  p.attackEntity(pig);
  await t.wait(3);
  t.world.afterEvents.entityHitEntity.unsubscribe(hitSub);
  t.check(hits > 0, "the hit with the stick landed");
  t.check(!seen("realm:silly_confetti", since), "switching back to the stick stops it at once");
  pig.remove();

  // 2. Disco on a chestplate, then a death drops it: the floor stops after the respawn.
  eq.setEquipment(t.mc.EquipmentSlot.Chest, item("minecraft:iron_chestplate", "Disco"));
  since = t.tick;
  await t.waitUntil(() => seen("realm:silly_floor", since), { timeout: 60, message: "no Disco floor" });
  p.kill();
  await t.wait(10);
  p.respawn();
  await t.wait(20);
  t.check(!eq.getEquipment(t.mc.EquipmentSlot.Chest), "the chestplate dropped at the death");
  since = t.tick;
  await t.wait(40);
  t.check(!seen("realm:silly_floor", since), "no Disco floor after the respawn without the chestplate");
  await t.console("scriptevent realm:silly_trace off");
}
