// Run: node tools/test-bds/stash-persistence.mjs --scenario tools/test-bds/examples/stash-page-transfer-restart.js
// A MOVED row of native opaque stacks survives two actual BDS restarts. The existing test-only
// adapter transfers exact native snapshot handles to a new simulated ID; it never serializes items.
export default async function (t) {
  const p = await t.player("MovedRow", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const page = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  const identity = async (op) => {
    const done = t.waitMessage(p, `stash identity ${op} done`);
    const status = op === "status" ? t.waitMessage(p, /stash layout status /) : undefined;
    p.runCommand(`scriptevent harness:stash_identity ${JSON.stringify({ name: p.name, op })}`);
    await done;
    await t.wait(3);
    if (status) {
      const text = (await status).plain;
      return JSON.parse(text.slice(text.indexOf("{")));
    }
  };
  const go = async (n) => {
    if (page() === n) return;
    const opening = t.waitForm(p);
    t.cmd(p, "/realm:inv");
    (await opening).answer(`Page #${n}\n`);
    await t.waitUntil(() => page() === n, { timeout: 100, message: `page ${n} active` });
    await t.wait(4);
  };
  const move = async (n) => {
    const since = t.tick;
    const opening = t.waitForm(p);
    t.cmd(p, "/realm:inv");
    const menu = await opening;
    t.assert(menu.buttons.some((b) => /^Move to page/.test(b)), "Move to page is available");
    const stacks = t.waitForm(p);
    menu.answer("Move to page");
    const stackForm = await stacks;
    const destination = t.waitForm(p, { title: /Move to which page/ });
    stackForm.answer("Whole row 1");
    (await destination).answer(`Page #${n}`);
    await t.waitMessage(p, new RegExp(`Moved 3 stacks \\(3 items\\) to Page #${n}`), { since, timeout: 200 });
    await t.wait(4);
  };
  const mk = (id, amount = 1) => new t.mc.ItemStack(id, amount);
  await t.waitUntil(() => inv.getItem(17)?.typeId === "custom:inv_next", { timeout: 100, message: "page controls ready" });
  await identity("configure");

  if (t.phase === 1) {
    inv.setItem(0, mk("minecraft:apple", 3));
    const at = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 2 };
    const block = p.dimension.getBlock(at);
    block.setType("minecraft:white_shulker_box");
    const contents = block.getComponent("minecraft:inventory").container;
    const diamonds = mk("minecraft:diamond", 37);
    diamonds.nameTag = "Moved inside, never copied";
    contents.setItem(0, diamonds);
    contents.setItem(26, mk("minecraft:emerald", 11));
    p.runCommand(`loot replace entity @s slot.inventory 1 mine ${at.x} ${at.y} ${at.z}`);
    block.setType("minecraft:air");
    p.runCommand("replaceitem entity @s slot.inventory 3 potion 1 14");
    const sword = mk("minecraft:diamond_sword");
    sword.nameTag = "Moved Blade";
    sword.setLore(["native row", "restart"]);
    sword.getComponent("minecraft:durability").damage = 117;
    sword.getComponent("minecraft:enchantable").addEnchantment({ type: new t.mc.EnchantmentType("sharpness"), level: 3 });
    inv.setItem(11, sword);
    await t.wait(8);
    await move(3);
    t.assert(page() === 1 && !inv.getItem(10) && !inv.getItem(11) && !inv.getItem(12), "the moved row left page 1 without switching it");
    await identity("checkpoint");
    return t.restart("three native opaque stacks moved to saved page 3");
  }

  await identity("restore");
  const state = await identity("status");
  t.assert(typeof state.savedPlayerId === "string" && state.savedPlayerId !== p.id, "a real restart changed the simulated ID; the adapter restored exact native handles");
  if (t.phase === 2) {
    t.assert(page() === 1, "active page 1 survived the first restart");
    await go(3);
    t.assert(inv.getItem(9)?.typeId === "minecraft:white_shulker_box" && inv.getItem(10)?.nameTag === "Moved Blade" && inv.getItem(11)?.typeId === "minecraft:potion", "the moved row survived on page 3 in order");
    await move(4);
    t.assert(page() === 3 && !inv.getItem(9) && !inv.getItem(10) && !inv.getItem(11), "the second move left page 3 empty without switching");
    await identity("checkpoint");
    return t.restart("the same opaque row moved again, to saved page 4");
  }
  t.assert(t.phase === 3 && page() === 3, "the second physical restart preserved active page 3");
  await go(4);
  const sword = inv.getItem(10);
  t.assert(sword?.nameTag === "Moved Blade" && sword.getLore().join("|") === "native row|restart", "moved sword name and lore survived both restarts");
  t.assert(sword.getComponent("minecraft:durability").damage === 117, "moved sword damage survived");
  const enchants = sword.getComponent("minecraft:enchantable").getEnchantments();
  t.assert(enchants.length === 1 && enchants[0].type.id === "sharpness" && enchants[0].level === 3, "moved sword enchantment survived");
  const opening = t.waitForm(p);
  t.cmd(p, "/realm:inv");
  const menu = await opening;
  const scanned = t.waitForm(p);
  menu.answer("Scan all items");
  const scan = await scanned;
  const items = scan.buttons.filter((button) => / x\d+/.test(button));
  t.assert(items.length === 3 && items.every((button) => / x1\b/.test(button)), "all committed pages contain exactly one of each moved stack");
  scan.answer(null);
  t.assert(inv.getItem(0)?.typeId === "minecraft:apple" && inv.getItem(0).amount === 3, "the shared hotbar survived unchanged");
  t.assert(inv.getItem(15)?.typeId === "custom:inv_prev" && inv.getItem(16)?.typeId === "custom:inv_menu" && inv.getItem(17)?.typeId === "custom:inv_next", "controls survived both restarts");
  const at = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 2 };
  inv.swapItems(9, 1, inv);
  p.dimension.getBlock({ ...at, y: at.y - 1 }).setType("minecraft:stone");
  p.teleport({ x: at.x - 1, y: at.y, z: at.z });
  p.selectedSlotIndex = 1;
  p.useItemInSlotOnBlock(1, { ...at, y: at.y - 1 }, t.mc.Direction.Up);
  await t.wait(4);
  const contents = p.dimension.getBlock(at).getComponent("minecraft:inventory")?.container;
  t.assert(contents?.getItem(0)?.amount === 37 && contents.getItem(0).nameTag === "Moved inside, never copied", "hidden shulker first stack survived both moves and restarts");
  t.assert(contents?.getItem(26)?.amount === 11, "hidden shulker last stack survived both moves and restarts");
  inv.swapItems(11, 2, inv);
  const potion = t.cmd(p, "testfor @s[hasitem={item=potion,data=14,location=slot.hotbar,slot=2}]");
  t.assert(potion.ok && potion.successCount === 1, "the moved potion's hidden auxiliary data survived both restarts");
}
