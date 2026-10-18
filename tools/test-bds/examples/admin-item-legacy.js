// Realm Configuration (admin_bp): an item with the pack's lore is the real item whatever it is made of, so a world
// that changed `itemType` (or a copy made from another item) doesn't leave players with a second, locked,
// undroppable item: it is replaced by one made of the current itemType, and the player still carries exactly one.
//   node tools/test-bds/run.mjs --quiet --only admin_bp --scenario tools/test-bds/examples/admin-item-legacy.js --timeout 300
const LORE = ["§r§7Hold it in your hand and use it", "§r§7to open the realm menu:", "§r§7every realm command you can use,", "§r§7in one place.", "§r§8Red entries: operators only"];

export default async function (t) {
  const guest = await t.player("Guest");
  const op = await t.player("Boss", { op: true });
  await t.wait(70); // the item is handed out 40 ticks after spawn

  const real = (p) => {
    const inv = p.getComponent("inventory").container;
    const out = [];
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && it.getLore().some((l) => l.includes("operators only"))) out.push({ slot: i, type: it.typeId, amount: it.amount });
    }
    return out;
  };

  // 1. A copy made of another item (an old itemType): still the real item, replaced, one in total.
  for (const p of [guest, op]) {
    t.check(real(p).length === 1 && real(p)[0].type === "minecraft:nether_star", `${p.name} starts with one nether star (${JSON.stringify(real(p))})`);
    const old = new t.mc.ItemStack("minecraft:compass", 1);
    old.nameTag = "§r§6Realm Configuration";
    old.setLore(LORE);
    old.keepOnDeath = true;
    old.lockMode = t.mc.ItemLockMode.inventory;
    p.getComponent("inventory").container.setItem(20, old);
  }
  await t.wait(5);
  t.assert(t.cmd(guest, "/realm:admin_item").ok, "/realm:admin_item ran");
  await t.wait(10);
  for (const p of [guest, op]) {
    const r = real(p);
    t.check(r.length === 1 && r[0].amount === 1, `${p.name} carries exactly one real item (${JSON.stringify(r)})`);
    t.check(r.every((x) => x.type === "minecraft:nether_star"), `${p.name}: no locked compass left (${JSON.stringify(r)})`);
  }

  // 2. Only that copy: it becomes a nether star, and nothing else is added.
  const inv = guest.getComponent("inventory").container;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.getLore().length) inv.setItem(i, undefined);
  const old = new t.mc.ItemStack("minecraft:compass", 1);
  old.nameTag = "§r§6Realm Configuration";
  old.setLore(LORE);
  inv.setItem(5, old);
  await t.wait(5);
  t.assert(t.cmd(guest, "/realm:admin_item").ok, "/realm:admin_item ran again");
  await t.wait(10);
  const r = real(guest);
  t.check(r.length === 1 && r[0].type === "minecraft:nether_star" && r[0].slot === 5, `the old copy became a nether star in its slot (${JSON.stringify(r)})`);
}
