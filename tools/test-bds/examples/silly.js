// Silly Enchants: books given and applied (fits, max per item, Random, remove), Hat Trick's rabbit,
// and the hit, kill and hurt effects without errors (Hyper Jump needs a real client). About 1 minute:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only silly_bp --scenario tools/test-bds/examples/silly.js
export default async function (t) {
  t.server("/time set noon");
  const p = await t.player("Tester", { op: true });
  const inv = p.getComponent("inventory").container;
  const eq = p.getComponent("equippable");
  const cfg = (key, value) => t.console(`scriptevent realm:cfg_set ${JSON.stringify({ id: `t${t.tick}`, pack: "silly_bp", key, value })}`);
  const lore = (it) => (it?.getLore() ?? []).map((l) => l.replace(/§./g, ""));
  const books = () => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.nameTag?.includes("Silly Book")) n++;
    return n;
  };
  /** Holds `id` in slot 0 and applies the first book whose button matches `label`. */
  const apply = async (label) => {
    p.selectedSlotIndex = 0;
    const f = t.waitForm(p);
    t.cmd(p, "/realm:silly");
    const menu = await f;
    const g = t.waitForm(p);
    menu.answer("Apply a Silly Book");
    (await g).answer(label);
    await t.wait(3);
  };

  // 1. Books (the boots go in slot 0 first, so no book lands there).
  inv.setItem(0, new t.mc.ItemStack("minecraft:diamond_boots", 1));
  t.cmd(p, "/realm:silly_give Tester hyper_jump 2");
  t.cmd(p, "/realm:silly_give Tester moo 1");
  t.cmd(p, "/realm:silly_give Tester random 3");
  t.cmd(p, "/realm:silly_give Tester squeak 0");
  await t.wait(5);
  t.check(books() === 7, `7 books given (${books()}; amount 0 gives 1)`);

  // 2. Apply: wrong slot, then Hyper Jump, Random, and the limit of 2.
  let since = t.tick;
  await apply("Moo");
  await t.waitMessage(p, /Moo goes on a helmet/, { since });
  await apply("Hyper Jump");
  t.check(lore(inv.getItem(0)).includes("Silly: Hyper Jump"), `Hyper Jump on the boots: ${lore(inv.getItem(0))}`);
  await apply("Random");
  t.check(lore(inv.getItem(0)).filter((l) => l.startsWith("Silly: ")).length === 2, `two on the boots: ${lore(inv.getItem(0))}`);
  since = t.tick;
  await apply("Random");
  await t.waitMessage(p, /at most 2 silly enchants/, { since });
  t.check(books() === 5, `books used up only when applied (${books()} left)`);
  // maxPerItem 3 allows a third.
  await cfg("maxPerItem", 3);
  await t.wait(5);
  await apply("Random");
  t.check(lore(inv.getItem(0)).filter((l) => l.startsWith("Silly: ")).length === 3, `three with maxPerItem 3: ${lore(inv.getItem(0))}`);
  await cfg("maxPerItem", 2);
  await t.wait(5);
  // Remove one.
  const f = t.waitForm(p);
  t.cmd(p, "/realm:silly");
  const menu = await f;
  const g = t.waitForm(p);
  menu.answer("Remove a silly enchant");
  const rm = await g;
  const victim = rm.buttons.find((b) => !/Hyper Jump|Back/.test(b));
  rm.answer(victim);
  await t.wait(3);
  t.check(lore(inv.getItem(0)).filter((l) => l.startsWith("Silly: ")).length === 2, `one removed: ${lore(inv.getItem(0))}`);

  // 3. Hyper Jump can't be tested here: a simulated player's jump fires no button input and doesn't
  // set isJumping, so the boots never launch. Wearing them must not throw.
  eq.setEquipment(t.mc.EquipmentSlot.Feet, inv.getItem(0));
  inv.setItem(0, undefined);
  p.isSneaking = true;
  p.jump();
  await t.seconds(2);
  p.isSneaking = false;
  eq.setEquipment(t.mc.EquipmentSlot.Feet, undefined);

  // 4. Hand enchants: Hat Trick, Grunt Birthday, Confetti Swing, Tiny Thunder, Fish Slap on a sword.
  inv.setItem(0, new t.mc.ItemStack("minecraft:wooden_sword", 1));
  t.cmd(p, "/realm:silly_give Tester hat_trick 1");
  t.cmd(p, "/realm:silly_give Tester grunt_birthday 1");
  await t.wait(5);
  await apply("Hat Trick");
  await apply("Grunt Birthday");
  t.check(lore(inv.getItem(0)).filter((l) => l.startsWith("Silly: ")).length === 2, `sword: ${lore(inv.getItem(0))}`);
  await t.wait(15);
  const at = p.location;
  const pig = t.dimension.spawnEntity("minecraft:pig", { x: at.x + 1.5, y: at.y, z: at.z });
  await t.wait(10);
  // A critical hit: jump, hit while falling.
  let rabbit;
  for (let i = 0; i < 6 && !rabbit; i++) {
    p.lookAtEntity(pig);
    p.jump();
    await t.waitUntil(() => p.getVelocity().y < -0.05, { timeout: 40 });
    p.attackEntity(pig);
    await t.wait(3);
    rabbit = t.dimension.getEntities({ tags: ["silly_rabbit"] })[0];
    await t.wait(10);
  }
  t.check(!!rabbit, "Hat Trick: a rabbit");
  if (rabbit) {
    await t.seconds(12);
    t.check(!t.dimension.getEntities({ tags: ["silly_rabbit"] }).length, "the rabbit vanished after 10 s");
  }
  pig.kill();
  // 5. Moo: hurt with a Moo helmet, no errors.
  inv.setItem(0, new t.mc.ItemStack("minecraft:iron_helmet", 1));
  t.cmd(p, "/realm:silly_give Tester moo 1");
  await t.wait(5);
  await apply("Moo");
  eq.setEquipment(t.mc.EquipmentSlot.Head, inv.getItem(0));
  p.applyDamage(1);
  await t.wait(10);
}
