// Silly Enchants (silly_bp): right-clicking a villager with an Enchanted Book prompts to convert and lock them
// as a Novice Librarian trading that Enchanted Book, and trading with the locked Librarian exchanges Emeralds +
// Books for copies of that Enchanted Book.
//   node tools/test-bds/run.mjs --quiet --flat --only silly_bp --scenario tools/test-bds/examples/librarian-book.js
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  const p = await t.player("Tester", { op: true, gameMode: "survival" });
  const inv = p.getComponent("inventory").container;
  const at = p.location;

  // Spawn an adult villager right in front of the player and freeze its movement for reliable interaction.
  const villager = t.dimension.spawnEntity(
    "minecraft:villager_v2",
    { x: at.x + 1.5, y: at.y, z: at.z },
    { spawnEvent: "minecraft:spawn_from_village" },
  );
  try {
    villager.triggerEvent("minecraft:ageable_grow_up");
    villager.triggerEvent("minecraft:become_unskilled");
  } catch {}
  villager.addEffect("slowness", 2000, { amplifier: 255, showParticles: false });
  await t.wait(5);

  // Give player Mending I Enchanted Book in slot 0, plus 32 Emeralds and 4 Books.
  const mendingBook = new t.mc.ItemStack("minecraft:enchanted_book", 1);
  mendingBook
    .getComponent("minecraft:enchantable")
    .addEnchantment({ type: new t.mc.EnchantmentType("mending"), level: 1 });
  inv.setItem(0, mendingBook);
  inv.setItem(1, new t.mc.ItemStack("minecraft:emerald", 32));
  inv.setItem(2, new t.mc.ItemStack("minecraft:book", 4));
  p.selectedSlotIndex = 0;
  await t.wait(3);

  const countType = (typeId) => {
    let total = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && it.typeId === typeId) total += it.amount;
    }
    return total;
  };
  const countMendingBooks = () => {
    let total = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (!it || it.typeId !== "minecraft:enchanted_book") continue;
      const enchs = it.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
      if (enchs.some((e) => String(e.type?.id ?? "").replace(/^minecraft:/, "") === "mending" && e.level === 1)) {
        total += it.amount;
      }
    }
    return total;
  };

  const interact = (entity) => {
    p.lookAtEntity(entity);
    p.interactWithEntity(entity);
    t.system.sendScriptEvent(
      "realm:silly_villager_interact",
      JSON.stringify({ player: p.id, target: entity.id }),
    );
  };

  // 1. Right-click villager with Mending I Enchanted Book -> conversion popup & chat prompt.
  let since = t.tick;
  const convertFormPromise = t.waitForm(p, { timeout: 100 });
  interact(villager);
  await t.waitMessage(p, /Convert this villager into a Novice Librarian locked to.*Mending I/i, { since, timeout: 60 });
  const convertForm = await convertFormPromise;
  t.check(convertForm.title.includes("Convert to Novice Librarian"), `conversion popup title: ${convertForm.title}`);
  since = t.tick;
  convertForm.answer(0);
  await t.waitMessage(p, /now a Novice Librarian locked to.*Mending I/i, { since, timeout: 60 });
  await t.wait(5);

  t.check(villager.hasTag("realm:locked_librarian"), "villager has realm:locked_librarian tag");
  t.check(villager.nameTag.includes("Mending I"), `villager nameTag includes Mending I ("${villager.nameTag}")`);
  t.check(countMendingBooks() === 1, "original Enchanted Book kept in hand after conversion");

  // 2. Right-click locked Librarian again -> trade 1x Mending I for 10 Emeralds + 1 Book.
  since = t.tick;
  const tradeFormPromise = t.waitForm(p, { timeout: 100 });
  interact(villager);
  const tradeForm = await tradeFormPromise;
  t.check(tradeForm.title.includes("Mending I"), `trade popup title: ${tradeForm.title}`);
  tradeForm.answer("Trade 1x Mending I");
  await t.waitMessage(p, /Traded.*10 Emeralds \+ 1 Book.*Mending I/i, { since, timeout: 60 });
  await t.wait(5);

  t.check(countType("minecraft:emerald") === 22, `emeralds decreased by 10 (${countType("minecraft:emerald")} left)`);
  t.check(countType("minecraft:book") === 3, `books decreased by 1 (${countType("minecraft:book")} left)`);
  t.check(countMendingBooks() === 2, `received second Mending I Enchanted Book (${countMendingBooks()} total)`);
}
