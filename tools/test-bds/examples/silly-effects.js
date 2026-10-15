// Silly Enchants: every enchant a simulated player can trigger plays its effects, with the ids from the
// Silly Enchants resource pack where vanilla falls short (Disco's floor and lights, the rainbow trail,
// bubbles that live in air, confetti, the Grunt Birthday cheer). The test server has no client to draw
// or play anything, so the pack's test hook (`scriptevent realm:silly_trace on`) reports each particle
// and sound as a `realm:silly_fx` event. Hyper Jump needs a real jump, Hiccups is random (about one
// hiccup in 30 seconds), Hat Trick is in silly.js. About 1.5 minutes:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only silly_bp,silly_rp --scenario tools/test-bds/examples/silly-effects.js
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  /** @type {{ tick: number, kind: string, id: string }[]} */
  const fx = [];
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:silly_fx") return;
    try {
      const m = JSON.parse(message);
      fx.push({ tick: t.tick, kind: m.kind, id: m.id });
    } catch {
      // not ours
    }
  });
  const p = await t.player("Tester", { op: true });
  await t.console("scriptevent realm:silly_trace on");
  const inv = p.getComponent("inventory").container;
  const eq = p.getComponent("equippable");
  const S = t.mc.EquipmentSlot;
  /** An item with silly lore lines, as a Silly Book leaves them. */
  const item = (id, ...names) => {
    const it = new t.mc.ItemStack(id, 1);
    it.setLore(names.map((n) => `§r§dSilly: ${n}`));
    return it;
  };
  const clear = () => {
    for (const s of [S.Head, S.Chest, S.Legs, S.Feet]) eq.setEquipment(s, undefined);
    inv.setItem(0, undefined);
  };
  /** Waits for an effect id (string or RegExp) after `since`. */
  const saw = async (label, want, since, timeout = 60) => {
    const match = (e) => e.tick >= since && (typeof want === "string" ? e.id === want : want.test(e.id));
    try {
      await t.waitUntil(() => fx.some(match), { timeout, message: label });
      t.log(`${label}: ok`);
      return true;
    } catch {
      const seen = [...new Set(fx.filter((e) => e.tick >= since).map((e) => e.id))].join(", ");
      t.check(false, `${label}: no ${want} (saw: ${seen || "nothing"})`);
      return false;
    }
  };
  const ids = (since) => new Set(fx.filter((e) => e.tick >= since).map((e) => e.id));
  /** Walks the player in small steps (simulated players don't walk on their own here). */
  const walk = async (ticks) => {
    const o = p.location;
    for (let i = 0; i < ticks; i++) {
      p.teleport({ x: o.x + i * 0.2, y: o.y, z: o.z });
      await t.wait(1);
    }
    p.teleport(o);
  };
  p.selectedSlotIndex = 0;

  // 1. Disco (armor): the dance floor and the lights, standing still.
  let since = t.tick;
  eq.setEquipment(S.Chest, item("minecraft:iron_chestplate", "Disco"));
  await saw("Disco floor", "realm:silly_floor", since);
  await saw("Disco lights", "realm:silly_light", since);
  clear();
  await t.wait(12);

  // 2. Rainbow Trail and Squeak (boots), Bubbles (leggings): nothing standing still, effects when walking.
  eq.setEquipment(S.Feet, item("minecraft:iron_boots", "Rainbow Trail", "Squeak"));
  eq.setEquipment(S.Legs, item("minecraft:iron_leggings", "Bubbles"));
  await t.wait(15);
  since = t.tick;
  await t.wait(20);
  const still = ids(since);
  t.check(!still.has("realm:silly_trail") && !still.has("realm:silly_bubble") && !still.has("mob.bat.idle"), `nothing while standing still (${[...still].join(", ")})`);
  since = t.tick;
  await walk(40);
  await saw("Rainbow Trail", "realm:silly_trail", since, 5);
  await saw("Bubbles on land", "realm:silly_bubble", since, 5);
  t.check(!ids(since).has("minecraft:basic_bubble_particle_manual"), "no water-only bubbles on land");
  await saw("Squeak", /^mob\.(bat|rabbit)\.idle$/, since, 5);
  clear();
  await t.wait(12);

  // 3. Glow (helmet) at night, Duck (armor) on sneaking.
  t.server("/time set midnight");
  since = t.tick;
  eq.setEquipment(S.Head, item("minecraft:iron_helmet", "Glow", "Duck"));
  await saw("Glow at night", "minecraft:endrod", since);
  since = t.tick;
  p.isSneaking = true;
  await saw("Duck", "mob.chicken.say", since, 20);
  p.isSneaking = false;
  t.server("/time set noon");
  // Moo (same helmet slot): hurt.
  eq.setEquipment(S.Head, item("minecraft:iron_helmet", "Moo"));
  await t.wait(12);
  since = t.tick;
  p.applyDamage(1);
  await saw("Moo", /^mob\.(cow|pig|sheep|chicken)\.say$|^mob\.cat\.meow$/, since, 20);
  clear();

  // 4. Hand: Confetti Swing and Fish Slap on a hit, Grunt Birthday and Tiny Thunder on a defeat.
  inv.setItem(0, item("minecraft:diamond_sword", "Confetti Swing", "Fish Slap"));
  await t.wait(12);
  const at = p.location;
  const pig = t.dimension.spawnEntity("minecraft:pig", { x: at.x + 1.5, y: at.y, z: at.z });
  await t.wait(5);
  since = t.tick;
  p.lookAtEntity(pig);
  p.attackEntity(pig);
  await saw("Confetti Swing", "realm:silly_confetti", since, 20);
  await saw("Fish Slap", "mob.fish.flop", since, 20);
  pig.remove();

  inv.setItem(0, item("minecraft:diamond_sword", "Grunt Birthday", "Tiny Thunder"));
  await t.wait(12);
  const chick = t.dimension.spawnEntity("minecraft:chicken", { x: at.x + 1.5, y: at.y, z: at.z });
  await t.wait(5);
  since = t.tick;
  for (let i = 0; i < 4 && chick.isValid; i++) {
    p.lookAtEntity(chick);
    p.attackEntity(chick);
    await t.wait(12);
  }
  t.check(!chick.isValid, "the chicken was defeated");
  await saw("Grunt Birthday cheer", "realm.silly.yay", since, 20);
  await saw("Grunt Birthday confetti", "realm:silly_confetti", since, 20);
  const loud = ["raid.horn", "firework.large_blast", "random.explode"].filter((id) => ids(since).has(id));
  t.check(!loud.length, `no loud party noises (${loud.join(", ")})`);
  await saw("Tiny Thunder", "ambient.weather.thunder", since, 20);
  clear();
  await t.console("scriptevent realm:silly_trace off");
}
