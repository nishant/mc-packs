// Platypus: name tags, feeding (fish heals a hurt one), breeding with raw cod or salmon (a baby that grows up into an
// adult that can breed), and old or event-summoned platypuses getting their adult group. The lead's tie point is a
// model locator (platypus_rp), which only a client draws. Run with --strict so content log errors in the JSON fail it.
// About 1 minute:
//   node tools/test-bds/run.mjs --quiet --strict --timeout 600 --only platypus_bp,platypus_rp --scenario tools/test-bds/examples/platypus-feed.js
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  const p = await t.player("Tester", { op: true });
  const inv = p.getComponent("inventory").container;
  const at = p.location;
  const fx = Math.floor(at.x), fy = Math.floor(at.y), fz = Math.floor(at.z);
  const plats = () => t.dimension.getEntities({ type: "realm:platypus" });
  const adult = (e) => e.getComponent("minecraft:mark_variant")?.value === 1;
  const baby = (e) => !!e.getComponent("minecraft:is_baby");
  const hp = (e) => e.getComponent("minecraft:health").currentValue;
  /** Holds `item` in slot 0 and uses it on `e`. */
  const use = async (e, item) => {
    p.selectedSlotIndex = 0;
    inv.setItem(0, item);
    await t.wait(2);
    p.lookAtEntity(e);
    const ok = p.interactWithEntity(e);
    await t.wait(4);
    return ok;
  };

  // 1. Adults: a natural summon, and summons with a variant event (no entity_spawned) grown up by the script.
  t.server(`/summon realm:platypus ${fx + 2} ${fy} ${fz}`);
  t.server(`/summon realm:platypus ${fx - 2} ${fy} ${fz} 0 0 realm:platypus_make_perry`);
  t.server(`/summon realm:platypus ${fx} ${fy} ${fz + 2} 0 0 realm:platypus_make_brown`);
  await t.wait(10);
  t.check(plats().length === 3 && plats().every(adult), `three adults (${plats().map(adult).join(",")})`);
  const [a, b, c] = plats();
  for (const e of [a, b, c]) e.teleport({ x: fx + 1.5, y: fy, z: fz + 0.5 });
  await t.wait(2);

  // 2. A name tag.
  const tag = new t.mc.ItemStack("minecraft:name_tag", 1);
  tag.nameTag = "Pudding";
  await use(a, tag);
  t.check(a.nameTag === "Pudding", `named with a name tag ("${a.nameTag}")`);

  // 3. Feeding heals a hurt platypus (damage with no attacker, so it doesn't get angry).
  b.applyDamage(5);
  await t.wait(2);
  const before = hp(b);
  await use(b, new t.mc.ItemStack("minecraft:cod", 4));
  t.check(hp(b) > before, `cod healed it (${before} -> ${hp(b)})`);
  t.check((inv.getItem(0)?.amount ?? 0) === 3, `one cod eaten (${inv.getItem(0)?.amount})`);

  // 4. Breeding: feed two full-health adults raw salmon, a baby is born.
  c.getComponent("minecraft:health").resetToMaxValue();
  a.getComponent("minecraft:health").resetToMaxValue();
  await use(a, new t.mc.ItemStack("minecraft:salmon", 2));
  await use(c, new t.mc.ItemStack("minecraft:salmon", 2));
  const kid = await t.waitUntil(() => plats().find(baby), { timeout: 400, message: "a baby platypus is born" });
  t.check(kid.getComponent("minecraft:scale")?.value === 0.5, "the baby is half size");
  t.check(kid.getComponent("minecraft:variant")?.value !== undefined, "the baby has a variant");
  // Feeding the baby fish makes it grow up faster; growing up makes it an adult.
  kid.triggerEvent("minecraft:ageable_grow_up");
  await t.wait(5);
  t.check(!baby(kid) && adult(kid), "grown up into an adult");
}
