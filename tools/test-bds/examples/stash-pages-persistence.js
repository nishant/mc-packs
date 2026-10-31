// Run: node tools/test-bds/stash-persistence.mjs (test-only simulated-player identity adapter).
export default async function (t) {
  const SLOTS = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  let p = await t.player("DurablePager", { op: true });
  let inv = p.getComponent("minecraft:inventory").container;
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  const identity = async (op) => {
    const message = t.waitMessage(p, `stash identity ${op} done`);
    const status = op === "status" ? t.waitMessage(p, /stash layout status /) : undefined;
    p.runCommand(`scriptevent harness:stash_identity ${JSON.stringify({ name: p.name, op })}`);
    await message;
    await t.wait(3);
    if (status) {
      const text = (await status).plain;
      t.log(text);
      return JSON.parse(text.slice(text.indexOf("{")));
    }
  };
  const go = async (page) => {
    if (pageNow() === page) return;
    await t.wait(2);
    const opening = t.waitForm(p);
    t.assert(t.cmd(p, "/realm:inv").ok, "inventory menu opened");
    (await opening).answer(`Page #${page}\n`);
    await t.waitUntil(() => pageNow() === page, { timeout: 80, message: `on page ${page}` });
  };
  await t.waitUntil(() => !!inv.getItem(16), { timeout: 80, message: "buttons ready" });
  await identity("configure");
  const blockAt = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 2 };
  if (t.phase === 1) {
    inv.setItem(0, new t.mc.ItemStack("minecraft:apple", 3));
    // Obtain a genuine filled shulker via vanilla loot, not a mocked metadata field.
    const box = p.dimension.getBlock(blockAt);
    box.setType("minecraft:white_shulker_box");
    const contents = box.getComponent("minecraft:inventory").container;
    const treasure = new t.mc.ItemStack("minecraft:diamond", 37);
    treasure.nameTag = "Inside, not outside";
    contents.setItem(0, treasure);
    contents.setItem(26, new t.mc.ItemStack("minecraft:emerald", 11));
    p.runCommand(`loot replace entity @s slot.inventory 1 mine ${blockAt.x} ${blockAt.y} ${blockAt.z}`);
    t.assert(inv.getItem(10)?.typeId === "minecraft:white_shulker_box", "genuine filled shulker obtained");
    box.setType("minecraft:air");
    // Potion auxiliary data is deliberately opaque to stable 2.1.0 scripts.
    p.runCommand("replaceitem entity @s slot.inventory 3 potion 1 14");
    t.assert(inv.getItem(12)?.typeId === "minecraft:potion", "native potion obtained");
    for (let page = 1; page <= 5; page++) {
      await go(page);
      for (const s of SLOTS) {
        if (page === 1 && (s === 10 || s === 12)) continue;
        const item = new t.mc.ItemStack("minecraft:diamond_sword");
        item.nameTag = `page-${page}-slot-${s}`;
        item.setLore([`durable-${page}-${s}`]);
        item.getComponent("minecraft:durability").damage = page * 10 + s;
        item.getComponent("minecraft:enchantable").addEnchantment({ type: new t.mc.EnchantmentType("sharpness"), level: 3 });
        inv.setItem(s, item);
      }
      t.assert(SLOTS.every((s) => !!inv.getItem(s)), `page ${page} has all 24 slots`);
    }
    await identity("legacy_checkpoint");
    return t.restart("five full OLD-layout native pages committed; restart before migration");
  }
  await identity("restore");
  if (t.phase === 2) {
    t.assert(pageNow() === 5, "old active page index survived actual server restart");
    const state = await identity("status");
    t.assert(state.layout === 2 && Object.values(state.refs).includes(1), "active layout committed while inactive refs remain legacy");
    await go(3);
    t.assert(inv.getItem(9)?.nameTag === "page-3-slot-9", "old inactive native page mapped by ordinal");
    await identity("checkpoint");
    return t.restart("restart with migrated active page and mixed old/new lazy native refs");
  }
  t.assert(pageNow() === 3, "mixed-layout checkpoint active index survived second restart");
  const state = await identity("status");
  t.assert(state.layout === 2 && Object.values(state.refs).includes(1) && Object.values(state.refs).includes(2), "mixed old/new native ref versions persisted across second restart");
  for (let page = 5; page >= 1; page--) {
    await go(page);
    for (const s of SLOTS) {
      if (page === 1 && (s === 10 || s === 12)) continue;
      const item = inv.getItem(s);
      t.assert(item?.nameTag === `page-${page}-slot-${s}`, `restart page ${page} slot ${s} identity`);
      t.assert(item.getComponent("minecraft:durability").damage === page * 10 + s, `restart page ${page} slot ${s} damage`);
      t.assert(item.getComponent("minecraft:enchantable").getEnchantments()[0]?.level === 3, `restart page ${page} slot ${s} enchantment`);
    }
    t.assert(inv.getItem(0)?.amount === 3, "shared hotbar survived unchanged");
  }
  t.assert(inv.getItem(10)?.typeId === "minecraft:white_shulker_box", "opaque shulker survived restart");
  t.assert(inv.getItem(12)?.typeId === "minecraft:potion", "opaque potion survived restart");
  await go(2);
  await identity("checkpoint");
  const departed = p.id;
  p.disconnect();
  await t.wait(4);
  const drops = t.dimension.getEntities({ type: "minecraft:item" });
  t.assert(!drops.some((e) => e.getComponent("minecraft:item").itemStack.typeId === "minecraft:white_shulker_box"), "logout never drops inactive shulker");
  p = await t.player("DurablePager", { op: true });
  inv = p.getComponent("minecraft:inventory").container;
  t.assert(p.id !== departed, "simulated rejoin identity changed (test adapter required)");
  await identity("restore");
  // Normal death drops only the active page; inactive snapshots are not resurrected or dropped.
  p.kill();
  await t.wait(4);
  p.respawn();
  await t.wait(8);
  await go(1);
  t.assert(inv.getItem(10)?.typeId === "minecraft:white_shulker_box", "inactive shulker survives logout/rejoin and death");
  // Place the restored item to inspect its hidden block-entity contents.
  inv.swapItems(10, 1, inv);
  p.dimension.getBlock({ ...blockAt, y: blockAt.y - 1 }).setType("minecraft:stone");
  p.teleport({ x: blockAt.x - 1, y: blockAt.y, z: blockAt.z });
  p.selectedSlotIndex = 1;
  p.useItemInSlotOnBlock(1, { ...blockAt, y: blockAt.y - 1 }, t.mc.Direction.Up);
  await t.wait(4);
  const placed = p.dimension.getBlock(blockAt).getComponent("minecraft:inventory")?.container;
  t.assert(placed?.getItem(0)?.amount === 37 && placed.getItem(0).nameTag === "Inside, not outside", "filled shulker's hidden first stack survived restart");
  t.assert(placed?.getItem(26)?.amount === 11, "filled shulker's hidden last stack survived restart");
  inv.swapItems(12, 2, inv);
  const potion = t.cmd(p, "testfor @s[hasitem={item=potion,data=14,location=slot.hotbar,slot=2}]");
  t.assert(potion.ok && potion.successCount === 1, "restored potion retains hidden auxiliary data 14, not a default water bottle");
  const OLD = [10, 11, 12, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  for (const mode of ["normal", "hidden"]) {
    p = await t.player(`${mode}Legacy`, { op: true });
    inv = p.getComponent("minecraft:inventory").container;
    await identity(`${mode}_legacy`);
    for (const [old, slot] of [...OLD.map((s, i) => [s, SLOTS[i]]), [9, 15], [13, 16], [17, 17]]) {
      const item = inv.getItem(slot);
      t.assert(item?.nameTag === `full-old-${old}` && item.getComponent("minecraft:durability").damage === old,
        `${mode} full27 upgrade old slot ${old} -> ${slot} preserves identity/damage`);
    }
    const status = await identity("status");
    t.assert(status.layout === 2 && status.cur === 1, `${mode} active layout commit`);
    if (mode === "hidden") {
      t.log(`hidden fixture hotbar before enabling: ${Array.from({ length: 9 }, (_, s) => inv.getItem(s)?.nameTag ?? inv.getItem(s)?.typeId ?? "empty").join(",")}`);
      const opening = t.waitForm(p);
      t.cmd(p, "/realm:inv");
      (await opening).answer("Inventory settings");
      const settings = await t.waitForm(p);
      settings.answer({ "In-inventory page buttons": true, "Auto-store pickups": false });
      await t.waitUntil(() => pageNow() === 1, { timeout: 80, message: "hidden full27 buttons enabled safely" });
      const names = [];
      for (let s = 0; s < 36; s++) if (inv.getItem(s)?.nameTag?.startsWith("full-old-")) names.push(inv.getItem(s).nameTag);
      t.log(`hidden fixture carried originals after enabling: ${names.length}; ${names.join(",")}`);
      // Earlier death drops can fill this simulated player's hotbar. Reserved stacks may therefore
      // be rescued to an inactive native page; count every page, not just the carried inventory.
      const openingScan = t.waitForm(p);
      t.cmd(p, "/realm:inv");
      (await openingScan).answer("Scan all items");
      const scan = await t.waitForm(p);
      const originals = scan.buttons.filter((button) => /^full-old-\d+ x/.test(button));
      const counts = new Map(originals.map((button) => {
        const match = /^(full-old-\d+) x(\d+)/.exec(button);
        return [match[1], Number(match[2])];
      }));
      // The page scan intentionally excludes the shared hotbar.
      for (let s = 0; s < 9; s++) {
        const item = inv.getItem(s);
        if (item?.nameTag?.startsWith("full-old-")) counts.set(item.nameTag, (counts.get(item.nameTag) ?? 0) + item.amount);
      }
      t.assert(counts.size === 27 && [...counts.values()].every((count) => count === 1), "enabling buttons rescues all 27 originals exactly once across native pages and hotbar");
      scan.answer(null);
    }
  }
  t.log("PASS: 120 slots across five pages, full27 normal/hidden upgrades, reserved-slot rescue, two World restarts, mixed lazy refs, native hidden shulker contents/potion data, death/rejoin/shared hotbar");
}
