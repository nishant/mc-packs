// Native slot/form logic, not physical GUI input.
// Run: node tools\test-bds\run.mjs --quiet --only stash_bp --scenario tools\test-bds\examples\stash-pages-fill.js
export default async function (t) {
  const p = await t.player("PageFiller", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const mk = (id, n = 1) => new t.mc.ItemStack(id, n);
  const page = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  const switchTo = async (target) => {
    while (page() !== target) {
      const next = page() + 1;
      inv.setItem(17, undefined);
      await t.waitUntil(() => page() === next, { timeout: 80, message: `page ${next}` });
    }
    await t.wait(20);
  };
  const menuAction = async (label) => {
    const waiting = t.waitForm(p, { timeout: 100 });
    t.assert(t.cmd(p, "/realm:inv").ok, "inventory menu command");
    const form = await waiting;
    form.answer(label);
    await t.wait(4);
  };
  const automatic = async (enabled) => {
    const settings = t.waitForm(p, { timeout: 100, title: /Inventory settings/ });
    await menuAction("Inventory settings");
    (await settings).answer({ "Auto-store pickups": enabled });
    await t.wait(20);
  };
  await t.waitUntil(() => page() === 1, { timeout: 100, message: "controls ready" });
  inv.setItem(9, mk("minecraft:diamond", 60));
  inv.setItem(0, mk("minecraft:apple", 5));
  await switchTo(3);
  await automatic(false);
  inv.setItem(10, mk("minecraft:diamond", 20));
  // Establish a pre-existing partial stack, then add only seven new items.
  await t.wait(20);
  await automatic(true);
  inv.setItem(10, mk("minecraft:diamond", 27));
  await t.waitUntil(() => inv.getItem(10)?.amount === 20, { timeout: 60, message: "only pickup delta routed" });
  t.assert(page() === 3, "auto-store keeps active page");
  t.assert(inv.getItem(0)?.amount === 5, "hotbar preserved");
  const equipment = p.getComponent("minecraft:equippable");
  equipment.setEquipment(t.mc.EquipmentSlot.Head, mk("minecraft:diamond_helmet"));
  equipment.setEquipment(t.mc.EquipmentSlot.Offhand, mk("minecraft:totem_of_undying"));
  await t.wait(20);
  inv.setItem(9, equipment.getEquipment(t.mc.EquipmentSlot.Head));
  inv.setItem(14, equipment.getEquipment(t.mc.EquipmentSlot.Offhand));
  equipment.setEquipment(t.mc.EquipmentSlot.Head, undefined);
  equipment.setEquipment(t.mc.EquipmentSlot.Offhand, undefined);
  await t.wait(20);
  t.assert(inv.getItem(9)?.typeId === "minecraft:diamond_helmet" && inv.getItem(14)?.typeId === "minecraft:totem_of_undying", "unequipping armor and offhand is not a pickup");
  inv.setItem(9, undefined);
  inv.setItem(14, undefined);
  await switchTo(5);
  inv.setItem(17, undefined);
  await t.waitUntil(() => page() === 1, { timeout: 80, message: "wrap to page 1" });
  t.assert(inv.getItem(9)?.amount === 64, "earliest partial stack topped up");
  t.assert(inv.getItem(10)?.amount === 3, "earliest free slot used before later pages");

  // Disable automatic routing through the real settings form before arranging manual sources.
  await automatic(false);
  await switchTo(3);
  const tool = mk("minecraft:diamond_pickaxe");
  tool.nameTag = "Page Fill Tool";
  tool.setLore(["native", "metadata"]);
  tool.getComponent("minecraft:durability").damage = 123;
  tool.getComponent("minecraft:enchantable").addEnchantment({ type: new t.mc.EnchantmentType("efficiency"), level: 3 });
  tool.setDynamicProperty("fill:marker", "preserved");
  inv.setItem(11, tool);
  const blockAt = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 2 };
  const block = p.dimension.getBlock(blockAt);
  block.setType("minecraft:white_shulker_box");
  const contents = block.getComponent("minecraft:inventory").container;
  const treasure = mk("minecraft:diamond", 37);
  treasure.nameTag = "Hidden treasure";
  contents.setItem(0, treasure);
  contents.setItem(26, mk("minecraft:emerald", 11));
  p.runCommand(`loot replace entity @s slot.inventory 3 mine ${blockAt.x} ${blockAt.y} ${blockAt.z}`);
  const box = inv.getItem(12);
  t.assert(box?.typeId === "minecraft:white_shulker_box", "genuine filled shulker obtained");
  block.setType("minecraft:air");
  box.nameTag = "Native Box";
  inv.setItem(12, box);
  p.runCommand("replaceitem entity @s slot.inventory 4 potion 1 14");
  await t.wait(20);
  t.assert(inv.getItem(11)?.nameTag === "Page Fill Tool", "disabled auto-store leaves source alone");
  await menuAction("Fill earlier pages");
  t.assert(page() === 3, "manual fill keeps active page");
  t.assert(!inv.getItem(10) && !inv.getItem(11) && !inv.getItem(12) && !inv.getItem(13), "manual sources emptied");
  t.assert(inv.getItem(0)?.amount === 5, "manual fill keeps hotbar");
  t.assert(inv.getItem(15)?.typeId === "custom:inv_prev" && inv.getItem(17)?.typeId === "custom:inv_next", "manual fill keeps controls");
  await switchTo(5);
  inv.setItem(17, undefined);
  await t.waitUntil(() => page() === 1, { timeout: 80, message: "inspect filled page" });
  t.assert(inv.getItem(10)?.amount === 23, "manual fill merges compatible stack");
  const restored = inv.getItem(11);
  t.assert(restored?.nameTag === "Page Fill Tool", "slot order, not alphabetical sorting");
  t.assert(restored.getLore().join("|") === "native|metadata", "lore preserved");
  t.assert(restored.getComponent("minecraft:durability").damage === 123, "durability preserved");
  t.assert(restored.getComponent("minecraft:enchantable").getEnchantments()[0]?.level === 3, "enchantment preserved");
  t.assert(restored.getDynamicProperty("fill:marker") === "preserved", "native item dynamic property preserved");
  t.assert(inv.getItem(12)?.nameTag === "Native Box", "native unstackable retained");
  await menuAction("Fill earlier pages");
  t.assert(page() === 1 && inv.getItem(11)?.nameTag === "Page Fill Tool", "repeat fill is idempotent");
  inv.swapItems(12, 1, inv);
  p.dimension.getBlock({ ...blockAt, y: blockAt.y - 1 }).setType("minecraft:stone");
  p.teleport({ x: blockAt.x - 1, y: blockAt.y, z: blockAt.z });
  p.selectedSlotIndex = 1;
  p.useItemInSlotOnBlock(1, { ...blockAt, y: blockAt.y - 1 }, t.mc.Direction.Up);
  await t.wait(4);
  const placed = p.dimension.getBlock(blockAt).getComponent("minecraft:inventory")?.container;
  t.assert(placed?.getItem(0)?.amount === 37 && placed.getItem(0).nameTag === "Hidden treasure", "filled shulker first hidden stack retained");
  t.assert(placed?.getItem(26)?.amount === 11, "filled shulker last hidden stack retained");
  inv.swapItems(13, 2, inv);
  const potion = t.cmd(p, "testfor @s[hasitem={item=potion,data=14,location=slot.hotbar,slot=2}]");
  t.assert(potion.ok && potion.successCount === 1, "potion hidden auxiliary data 14 retained");
}
