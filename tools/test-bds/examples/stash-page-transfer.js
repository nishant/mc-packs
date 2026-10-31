// Expansive Inventory, "Move to page" (stash_bp): a row of real stacks goes to another page through the /realm:inv menu, whole or
// not at all. The row is a genuine filled shulker box (obtained by mining a placed one), a potion with hidden auxiliary data, and a named,
// damaged, enchanted sword. After the move they are checked natively on their new page (the shulker is placed to read its hidden
// contents, the potion by vanilla hasitem data), the hotbar and the page buttons are untouched, a full destination page refuses the
// next row and leaves its source exactly as it was, and the same move works in the Nether and the End without leaving a storage
// entity in any dimension. The unit model (tools/stash-pages.test.mjs) covers injected snapshot, write and index failures,
// stale selections, deaths and dimension changes; a restart is covered by extending tools/test-bds/stash-persistence.mjs (see the notes).
// Run: node tools/test-bds/run.mjs --quiet --only stash_bp --scenario tools/test-bds/examples/stash-page-transfer.js --timeout 420
// Before the feature (stash_bp at 7dac598c) there is no "Move to page" button, so the first answer fails ("the Move to page form opened").
export default async function (t) {
  const mc = t.mc;
  // Filling whole pages below must not trigger auto-store (it would move the newest stacks to other pages behind the checks).
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "xfer1", pack: "stash_bp", key: "autoStore", value: false }));
  await t.wait(3);
  const p = await t.player("Mover");
  const inv = p.getComponent("minecraft:inventory").container;
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  await t.waitUntil(() => inv.getItem(17)?.typeId === "custom:inv_next", { timeout: 200, message: "buttons placed" });
  const mk = (id, n = 1) => new mc.ItemStack(id, n);
  const blockAt = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 2 };

  // Real stacks on page 1, row 1: a filled shulker box (slot 10), the sword (11), a potion (12). Row 2: cobblestone and emeralds. Hotbar: apples.
  const box = p.dimension.getBlock(blockAt);
  box.setType("minecraft:white_shulker_box");
  const contents = box.getComponent("minecraft:inventory").container;
  const treasure = mk("minecraft:diamond", 37);
  treasure.nameTag = "Inside, not outside";
  contents.setItem(0, treasure);
  contents.setItem(26, mk("minecraft:emerald", 11));
  p.runCommand(`loot replace entity @s slot.inventory 1 mine ${blockAt.x} ${blockAt.y} ${blockAt.z}`);
  box.setType("minecraft:air");
  t.assert(inv.getItem(10)?.typeId === "minecraft:white_shulker_box", "a genuine filled shulker box was obtained");
  p.runCommand("replaceitem entity @s slot.inventory 3 potion 1 14");
  t.assert(inv.getItem(12)?.typeId === "minecraft:potion", "a native potion was obtained");
  const sword = mk("minecraft:diamond_sword");
  sword.nameTag = "Zed's Blade";
  sword.setLore(["one", "two"]);
  sword.getComponent("minecraft:durability").damage = 100;
  sword.getComponent("minecraft:enchantable").addEnchantment({ type: new mc.EnchantmentType("sharpness"), level: 3 });
  inv.setItem(11, sword);
  inv.setItem(18, mk("minecraft:cobblestone", 64));
  inv.setItem(19, mk("minecraft:emerald", 9));
  inv.setItem(0, mk("minecraft:apple", 3));
  await t.wait(10);

  // 1. Row 1 to Page #3, through the menu: Move to page, Whole row 1, Page #3.
  let since = t.tick;
  const opening = t.waitForm(p);
  t.assert(t.cmd(p, "/realm:inv").ok, "the inventory menu opened");
  const inventoryForm = await opening;
  t.assert(inventoryForm.buttons.some((button) => /^Move to page/.test(button)), "the inventory offers the Move to page action");
  const choosingStack = t.waitForm(p);
  inventoryForm.answer("Move to page");
  const stackForm = await choosingStack;
  const choosingPage = t.waitForm(p);
  stackForm.answer("Whole row 1");
  (await choosingPage).answer("Page #3");
  const moved = await t.waitMessage(p, /Moved 3 stacks \(3 items\) to Page #3/, { kind: "actionbar", timeout: 200, since });
  t.log(moved.plain);
  const forms = t.forms(p);
  t.check(forms.some((f) => /Move to page/.test(f.title)), "the Move to page form opened");
  t.check(!forms.some((f) => /Move to which page/.test(f.title) && f.buttons.some((b) => /^Page #1/.test(b))), "the page being shown is not a destination");
  await t.wait(10);
  t.assert(!inv.getItem(10) && !inv.getItem(11) && !inv.getItem(12), "row 1 left the active page");
  t.assert(inv.getItem(18)?.amount === 64 && inv.getItem(19)?.amount === 9, "row 2 stayed");
  t.assert(inv.getItem(0)?.typeId === "minecraft:apple" && inv.getItem(0).amount === 3, "the hotbar is untouched");
  t.assert(inv.getItem(15)?.typeId === "custom:inv_prev" && inv.getItem(16)?.typeId === "custom:inv_menu" && inv.getItem(17)?.typeId === "custom:inv_next", "the page buttons are untouched");
  t.assert(pageNow() === 1, "still on page 1");

  // 2. Page 3 holds them, natively intact.
  const go = async (page) => {
    await t.wait(4);
    t.answerForm(p, `Page #${page}\n`);
    t.assert(t.cmd(p, "/realm:inv").ok, "the inventory menu opened");
    await t.waitUntil(() => pageNow() === page, { timeout: 100, message: `on page ${page}` });
    await t.wait(6);
  };
  await go(3);
  t.assert(inv.getItem(9)?.typeId === "minecraft:white_shulker_box" && inv.getItem(10)?.typeId === "minecraft:diamond_sword" && inv.getItem(11)?.typeId === "minecraft:potion", "page 3 shows the three stacks in order");
  const back = inv.getItem(10);
  t.assert(back.nameTag === "Zed's Blade" && back.getLore().join() === "one,two", "the sword keeps its name and lore");
  t.assert(back.getComponent("minecraft:durability").damage === 100, "the sword keeps its damage");
  const e = back.getComponent("minecraft:enchantable").getEnchantments();
  t.assert(e.length === 1 && e[0].type.id === "sharpness" && e[0].level === 3, "the sword keeps its enchantment");
  inv.swapItems(9, 1, inv);
  p.dimension.getBlock({ ...blockAt, y: blockAt.y - 1 }).setType("minecraft:stone");
  p.teleport({ x: blockAt.x - 1, y: blockAt.y, z: blockAt.z });
  p.selectedSlotIndex = 1;
  p.useItemInSlotOnBlock(1, { ...blockAt, y: blockAt.y - 1 }, mc.Direction.Up);
  await t.wait(4);
  const placed = p.dimension.getBlock(blockAt).getComponent("minecraft:inventory")?.container;
  t.assert(placed?.getItem(0)?.amount === 37 && placed.getItem(0).nameTag === "Inside, not outside", "the filled shulker box's hidden first stack survived the move");
  t.assert(placed?.getItem(26)?.amount === 11, "the filled shulker box's hidden last stack survived the move");
  inv.swapItems(11, 2, inv);
  const potion = t.cmd(p, "testfor @s[hasitem={item=potion,data=14,location=slot.hotbar,slot=2}]");
  t.assert(potion.ok && potion.successCount === 1, "the moved potion keeps its hidden auxiliary data 14, not a default water bottle");
  inv.swapItems(2, 11, inv);
  await go(1);

  // 3. A destination page with no room refuses the next row and leaves everything where it was.
  await go(4);
  for (const s of [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35]) inv.setItem(s, mk("minecraft:stone", 64));
  await go(1);
  since = t.tick;
  t.answerForm(p, "Move to page", "Whole row 2", "Page #4");
  t.assert(t.cmd(p, "/realm:inv").ok, "the inventory menu opened");
  const refused = await t.waitMessage(p, /Page #4 has room for 0 of 2 stacks\. Nothing was moved/, { kind: "actionbar", timeout: 200, since });
  t.log(refused.plain);
  await t.wait(10);
  t.assert(inv.getItem(18)?.amount === 64 && inv.getItem(19)?.amount === 9, "the refused row is still on page 1, untouched");
  t.assert(pageNow() === 1, "still on page 1 after the refusal");
  await go(4);
  t.assert([9, 20, 35].every((s) => inv.getItem(s)?.typeId === "minecraft:stone" && inv.getItem(s).amount === 64), "the full page 4 gained nothing");
  await go(1);

  // 4. The same move in the Nether and the End.
  const nether = t.world.getDimension("nether");
  try { nether.runCommand("tickingarea add circle 0 0 0 2 transfer_nether true"); } catch (err) { t.log(`ticking area: ${err}`); }
  await t.waitUntil(() => nether.getBlock({ x: 0, y: 64, z: 0 }), { timeout: 600, message: "nether chunk loaded" });
  nether.runCommand("fill -4 64 -4 4 69 4 air");
  nether.runCommand("fill -4 63 -4 4 63 4 netherrack");
  const end = t.world.getDimension("the_end");
  try { end.runCommand("tickingarea add circle 100 0 0 2 transfer_end true"); } catch (err) { t.log(`ticking area: ${err}`); }
  await t.waitUntil(() => end.getBlock({ x: 100, y: 49, z: 0 }), { timeout: 600, message: "end chunk loaded" });
  end.runCommand("fill 96 49 -4 104 49 4 obsidian");
  end.runCommand("fill 96 50 -4 104 54 4 air");
  for (const [name, spawn, label, id] of [["NetherMover", { x: 0, y: 64, z: 0, dimension: "nether" }, "the Nether", "minecraft:blaze_rod"], ["EndMover", { x: 100, y: 50, z: 0, dimension: "the_end" }, "the End", "minecraft:ender_pearl"]]) {
    const q = await t.player(name, spawn);
    const qinv = q.getComponent("minecraft:inventory").container;
    await t.waitUntil(() => qinv.getItem(17)?.typeId === "custom:inv_next", { timeout: 200, message: `${name} buttons placed` });
    qinv.setItem(10, mk(id, 7));
    await t.wait(8);
    const mark = t.tick;
    t.answerForm(q, "Move to page", "Whole row 1", "Page #2");
    t.assert(t.cmd(q, "/realm:inv").ok, `${name}: the inventory menu opened`);
    await t.waitMessage(q, /Moved 1 stack \(7 items\) to Page #2/, { kind: "actionbar", timeout: 200, since: mark });
    await t.wait(8);
    t.assert(!qinv.getItem(10), `${label}: the stack left the active page`);
    await t.wait(4);
    t.answerForm(q, "Page #2\n");
    t.cmd(q, "/realm:inv");
    await t.waitUntil(() => Number(/Page (\d+)\//.exec(qinv.getItem(16)?.nameTag ?? "")?.[1] ?? 0) === 2, { timeout: 100, message: `${name} on page 2` });
    await t.wait(6);
    t.assert(qinv.getItem(9)?.typeId === id && qinv.getItem(9).amount === 7, `${label}: the stack is on page 2`);
  }

  await t.wait(60);
  // Storage entities exist only inside one synchronous save or load; none may be left anywhere (older versions leaked them into the Overworld).
  const counts = [nether, end, t.dimension].map((d) => d.getEntities({ type: "realm:stash_page_store" }).length);
  t.assert(counts.every((n) => n === 0), `no storage entities left behind (nether/end/overworld: ${counts.join("/")})`);
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "xfer2", pack: "stash_bp", key: "autoStore", value: true }));
}
