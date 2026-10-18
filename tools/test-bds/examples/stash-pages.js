// Expansive Inventory: buttons, page switching without losing items, auto-store, shrinking pages.
// Run: node tools/test-bds/run.mjs --quiet --only stash_bp --scenario tools/test-bds/examples/stash-pages.js
export default async function (t) {
  const mc = t.mc;
  const p = await t.player("Pager", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const STORAGE = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  const mk = (id, n = 1) => new mc.ItemStack(id, n);
  // Dynamic properties are per pack, so the page the player is on is read from the menu button.
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);

  // These are native slot transactions, not physical GUI clicks.
  // 1. Buttons appear together in the top row's last three slots.
  await t.waitUntil(() => inv.getItem(15)?.typeId === "custom:inv_prev", { timeout: 100, message: "buttons placed" });
  t.assert(inv.getItem(16)?.typeId === "custom:inv_menu", "menu button in slot 16");
  t.assert(inv.getItem(17)?.typeId === "custom:inv_next", "next button in slot 17");
  t.log(inv.getItem(15).nameTag + " | " + inv.getItem(16).nameTag + " | " + inv.getItem(17).nameTag);
  t.assert(inv.getItem(15).nameTag === "§r§8[§b<§8] §fPage 5/5 §7(Prev)", "prev name");
  t.assert(inv.getItem(17).nameTag === "§r§8[§b>§8] §fPage 2/5 §7(Next)", "next name");

  // 2. Items on page 1, including awkward ones
  const sword = mk("minecraft:diamond_sword");
  sword.getComponent("minecraft:enchantable").addEnchantment({ type: new mc.EnchantmentType("sharpness"), level: 3 });
  sword.nameTag = "Zed's Blade";
  sword.setLore(["one", "two"]);
  sword.getComponent("minecraft:durability").damage = 100;
  inv.setItem(10, sword);
  inv.setItem(11, mk("minecraft:diamond", 40));
  inv.setItem(12, mk("minecraft:white_shulker_box"));
  inv.setItem(14, mk("minecraft:potion"));
  inv.setItem(0, mk("minecraft:apple", 3)); // hotbar

  // 3. Click "next": the button leaves slot 17
  inv.setItem(17, undefined);
  await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: "switched to page 2" });
  await t.wait(8);
  t.assert(inv.getItem(17)?.typeId === "custom:inv_next", "next button restored");
  t.assert(inv.getItem(17).nameTag.includes("Page 3/5"), "next button now points at page 3");
  t.assert(inv.getItem(16).nameTag.includes("Page 2/5"), "menu button shows page 2");
  t.assert(!inv.getItem(10) && !inv.getItem(11), "page 2 starts empty");
  t.assert(!inv.getItem(12), "shulker box belongs to page 1");
  t.assert(!inv.getItem(14), "potion belongs to page 1");
  t.assert(inv.getItem(0)?.typeId === "minecraft:apple", "hotbar untouched");

  // 4. Back to page 1 with the prev button: everything returns exactly
  inv.setItem(15, undefined);
  await t.waitUntil(() => pageNow() === 1, { timeout: 60, message: "back on page 1" });
  await t.wait(8);
  const back = inv.getItem(10);
  t.assert(back?.typeId === "minecraft:diamond_sword", "sword back in slot 10");
  t.assert(back.nameTag === "Zed's Blade" && back.getLore().join() === "one,two", "name and lore kept");
  t.assert(back.getComponent("minecraft:durability").damage === 100, "damage kept");
  const e = back.getComponent("minecraft:enchantable").getEnchantments();
  t.assert(e.length === 1 && e[0].type.id === "sharpness" && e[0].level === 3, "enchantment kept");
  t.assert(inv.getItem(11)?.typeId === "minecraft:diamond" && inv.getItem(11).amount === 40, "diamonds back");
  t.assert(inv.getItem(12)?.typeId === "minecraft:white_shulker_box" && inv.getItem(14)?.typeId === "minecraft:potion", "carried items still there");

  // 5. A real item dropped onto a button slot is rescued, never lost
  const menu = t.waitForm(p, { timeout: 100 }).catch(() => undefined);
  inv.setItem(16, mk("minecraft:emerald", 7)); // swapped onto the menu button's slot
  await t.wait(6);
  let emeralds = 0;
  for (let i = 0; i < 36; i++) if (inv.getItem(i)?.typeId === "minecraft:emerald") emeralds += inv.getItem(i).amount;
  t.assert(emeralds === 7, `emeralds rescued (found ${emeralds})`);
  t.assert(inv.getItem(16)?.typeId === "custom:inv_menu", "menu button restored");
  const m = await menu;
  t.check(m !== undefined, "the inventory menu opened");
  if (m) {
    t.log(`menu "${m.title}": ${m.buttons.join(" / ")}`);
    m.answer(null);
  }

  // 6. A stray button (shift-clicked out of its slot) is cleared; the click still counts once
  inv.setItem(17, undefined);
  inv.setItem(1, mk("custom:inv_next"));
  await t.wait(6);
  t.assert(!inv.getItem(1), "stray button cleared from the hotbar");
  t.assert(pageNow() === 2, "one click, one switch");
  inv.setItem(15, undefined);
  await t.wait(10);
  t.assert(pageNow() === 1, "back to page 1");

  // 6b. A button dropped as an item entity is removed and counts as the click
  await t.wait(8);
  inv.setItem(17, undefined);
  p.dimension.spawnItem(mk("custom:inv_next"), p.location);
  await t.waitUntil(() => pageNow() === 2, { timeout: 40, message: "drop counted as a click" });
  await t.wait(4);
  const left = p.dimension.getEntities({ type: "minecraft:item", location: p.location, maxDistance: 8 }).filter((en) => en.getComponent("minecraft:item").itemStack.typeId.startsWith("custom:inv_"));
  t.assert(left.length === 0, "the dropped button is gone");
  await t.wait(8);
  inv.setItem(15, undefined);
  await t.waitUntil(() => pageNow() === 1, { timeout: 40, message: "back to page 1" });
  await t.wait(8);

  // 6c. A button in the hand goes back to its slot and does its action
  inv.setItem(2, mk("custom:inv_next"));
  const used = p.useItemInSlot(2);
  await t.waitUntil(() => pageNow() === 2, { timeout: 40, message: "using the button in hand switched" });
  t.assert(!inv.getItem(2), "the button left the hotbar");
  await t.wait(8);
  inv.setItem(15, undefined);
  await t.waitUntil(() => pageNow() === 1, { timeout: 40, message: "back to page 1 again" });
  await t.wait(8);
  // 6d. Sorting leaves the buttons where they are
  inv.setItem(35, mk("minecraft:apple", 2));
  t.assert(t.cmd(p, "/realm:sort").ok, "/realm:sort ran");
  await t.wait(10);
  t.assert(inv.getItem(15)?.typeId === "custom:inv_prev" && inv.getItem(16)?.typeId === "custom:inv_menu" && inv.getItem(17)?.typeId === "custom:inv_next", "buttons survive /realm:sort");
  t.assert(pageNow() === 1, "sorting is not a click");
  inv.setItem(35, undefined);
  // 7. Auto-store: a page down to its last free slot sends the newest stack to another page
  for (let i = 0; i < 21; i++) if (!inv.getItem(STORAGE[i])) inv.setItem(STORAGE[i], mk("minecraft:cobblestone", 64));
  for (let i = 21; i < STORAGE.length; i++) inv.setItem(STORAGE[i], undefined);
  await t.wait(24);
  inv.setItem(STORAGE[21], mk("minecraft:gold_ingot", 9));
  await t.wait(24);
  t.assert(inv.getItem(STORAGE[21])?.typeId === "minecraft:gold_ingot", "two free slots left: nothing moves");
  inv.setItem(STORAGE[22], mk("minecraft:iron_ingot", 5));
  await t.waitUntil(() => !inv.getItem(STORAGE[22]), { timeout: 60, message: "last free slot: newest stack auto-stored" });
  t.assert(inv.getItem(STORAGE[21])?.typeId === "minecraft:gold_ingot", "the older gold stays");
  const note = await t.waitMessage(p, /Auto-stored/, { kind: "actionbar", timeout: 40, since: t.tick - 60 }).catch(() => undefined);
  t.check(note !== undefined, "auto-store note shown");
  if (note) t.log(note.plain);
  inv.setItem(STORAGE[21], undefined);
  await t.wait(24);
  // 8. Operator trims their own pages to 1: page 2's gold comes back to the inventory, nothing is lost
  t.assert(t.cmd(p, "/realm:inv_pages 1").ok, "inv_pages 1 ran");
  await t.wait(10);
  let gold = 0;
  for (let i = 0; i < 36; i++) if (inv.getItem(i)?.typeId === "minecraft:iron_ingot") gold += inv.getItem(i).amount;
  const dropped = p.dimension.getEntities({ type: "minecraft:item", location: p.location, maxDistance: 6 }).filter((en) => en.getComponent("minecraft:item").itemStack.typeId === "minecraft:iron_ingot");
  t.log(`iron in inventory ${gold}, on the floor ${dropped.length}`);
  t.assert(gold + dropped.reduce((a, en) => a + en.getComponent("minecraft:item").itemStack.amount, 0) === 5, "no iron lost");
  t.assert(!inv.getItem(15) || inv.getItem(15).typeId !== "custom:inv_prev", "buttons removed with one page");
  t.assert(!inv.getItem(16) || inv.getItem(16).typeId !== "custom:inv_menu", "menu button removed too");

  // 9. Back to the realm default: the buttons return
  t.assert(t.cmd(p, "/realm:inv_pages 0").ok, "inv_pages 0 ran");
  await t.waitUntil(() => inv.getItem(15)?.typeId === "custom:inv_prev", { timeout: 60, message: "buttons back" });

  // 10. /realm:inv scan
  const scan = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:inv").ok, "/realm:inv ran");
  const form = await scan;
  t.log(`menu: ${form.buttons.join(" / ")}`);
  t.assert(form.buttons.some((b) => /Page #1 \(Active\)/.test(b)), "page 1 active");
  form.answer("Scan all items");
  const list = await t.waitForm(p, { timeout: 100 });
  t.log(`scan: ${list.buttons.slice(0, 6).join(" / ")}`);
  t.assert(list.buttons.some((b) => /Cobblestone x/.test(b)), "cobblestone listed");
  list.answer(null);

  // Native event ordering/echo coverage. setItem is NOT proof of physical inventory UI interaction.
  const rapid = await t.player("EventPager", { op: true });
  const grid = rapid.getComponent("minecraft:inventory").container;
  const current = () => Number(/Page (\d+)\//.exec(grid.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  await t.waitUntil(() => current() === 1, { timeout: 100, message: "event test controls" });
  let events = 0;
  const listener = mc.world.afterEvents.playerInventoryItemChange.subscribe((event) => {
    if (event.player.id !== rapid.id || ![15, 16, 17].includes(event.slot)) return;
    if (++events <= 8) t.log(`native event tick=${t.tick} inventory=${event.inventoryType} slot=${event.slot} committed-label=${current()}`);
  });
  const go = async (slot, expected) => {
    grid.setItem(slot, undefined);
    await t.waitUntil(() => current() === expected, { timeout: 60, message: `event page ${expected}` });
  };
  const types = ["minecraft:redstone", "minecraft:emerald", "minecraft:iron_ingot", undefined, "minecraft:nether_star"];
  try {
    for (let page = 1; page <= 5; page++) {
      if (page > 1) await go(17, page);
      if (types[page - 1]) grid.setItem(18, mk(types[page - 1], page));
    }
    await go(17, 1);
    for (const autoStore of [false, true]) {
      const opening = t.waitForm(rapid);
      t.cmd(rapid, "/realm:inv");
      (await opening).answer("Inventory settings");
      const settings = await t.waitForm(rapid);
      settings.answer({ "Auto-store pickups": autoStore });
      await t.wait(4);
      for (const [slot, expected] of [[17, 2], [17, 3], [15, 2], [17, 3], [17, 4], [17, 5], [17, 1], [15, 5], [17, 1]]) {
        await go(slot, expected);
        t.assert(grid.getItem(18)?.typeId === types[expected - 1], `event page ${expected} contents agree (auto=${autoStore})`);
        t.log(`native request slot=${slot} committed-label=${current()} item=${grid.getItem(18)?.typeId ?? "empty"}`);
      }
      await t.wait(12);
      t.assert(current() === 1 && grid.getItem(18)?.typeId === types[0], "settled native echoes never add a switch");
      const menu = t.waitForm(rapid);
      t.cmd(rapid, "/realm:inv");
      const form = await menu;
      t.assert(form.buttons.some((b) => /Page #1 \(Active\)/.test(b)), "native menu active marker agrees");
      form.answer(null);
      await t.wait(2);
      const since = t.tick;
      grid.setItem(17, undefined);
      grid.setItem(15, undefined);
      await t.wait(8);
      const commits = t.messages(rapid, { kind: "actionbar", pack: "stash_bp", since })
        .map((message) => /Page #(\d+)\/5/.exec(message.plain)?.[1]).filter(Boolean);
      t.assert(commits.join(",") === "2,1" && current() === 1, `batched genuine requests keep order and commit once each (${commits})`);
      t.assert(grid.getItem(18)?.typeId === types[0], "batched requests return exact page one content");
    }
    const tripleSince = t.tick;
    const tripleMenu = t.waitForm(rapid);
    for (const [slot, hotbar] of [[17, 1], [15, 2], [16, 3]]) {
      const button = grid.getItem(slot);
      grid.setItem(slot, undefined);
      grid.setItem(hotbar, button);
    }
    const triple = await tripleMenu;
    const tripleCommits = t.messages(rapid, { kind: "actionbar", pack: "stash_bp", since: tripleSince })
      .map((message) => /Page #(\d+)\/5/.exec(message.plain)?.[1]).filter(Boolean);
    t.assert(tripleCommits.join(",") === "2,1", "three genuine queued gestures commit Next, Prev and open Menu");
    t.assert(triple.buttons.some((b) => /Page #1 \(Active\)/.test(b)), "third queued gesture shows the committed page one menu");
    triple.answer(null);
    await t.wait(2);
    const wipeSince = t.tick;
    for (const slot of [15, 16, 17]) grid.setItem(slot, undefined);
    await t.wait(8);
    t.assert(current() === 1 && [15, 16, 17].every((slot) => grid.getItem(slot)?.typeId.startsWith("custom:inv_")), "actual co-observed clear restores all controls");
    t.assert(!t.messages(rapid, { kind: "actionbar", pack: "stash_bp", since: wipeSince })
      .some((message) => /Page #\d+\/5/.test(message.plain)), "actual clear never commits queued gestures");

    const busyOpening = t.waitForm(rapid);
    t.cmd(rapid, "/realm:inv");
    const busy = await busyOpening;
    t.assert(/^Page #1 of 5/.test(busy.body), "busy menu initially describes committed page one");
    busy.answer("busy");
    const retryOpening = t.waitForm(rapid);
    await go(17, 2);
    grid.setItem(19, mk("minecraft:diamond", 3));
    const retry = await retryOpening;
    t.assert(/^Page #2 of 5/.test(retry.body) && /5 of 120 slots used/.test(retry.body), "UserBusy retry rebuilds current page and current usage");
    t.assert(retry.buttons.some((b) => /Page #2 \(Active\)/.test(b)) && !retry.buttons.some((b) => /Page #1 \(Active\)/.test(b)), "UserBusy retry active marker agrees with controls");
    retry.answer(null);
    await t.wait(2);

    const countOpening = t.waitForm(rapid);
    t.cmd(rapid, "/realm:inv");
    (await countOpening).answer("busy");
    const countRetryOpening = t.waitForm(rapid);
    t.assert(t.cmd(rapid, "/realm:inv_pages 2").ok, "change page count while menu is UserBusy");
    const countRetry = await countRetryOpening;
    t.assert(/^Page #2 of 2/.test(countRetry.body) && countRetry.buttons[4].startsWith("Fill earlier pages") && countRetry.buttons[5].startsWith("Sort this page"), "busy retry rebuilds page-count-dependent action indices");
    const sorted = t.waitMessage(rapid, /Sorted .* in your inventory/, { kind: "actionbar", pack: "stash_bp" });
    countRetry.answer(5);
    await sorted;
    t.assert(current() === 2, "rebuilt Sort selection executes Sort, not stale Page #4");
    t.assert(events > 0, "engine actually emitted native control-slot change events");
    t.log(`Native event/control coverage: ${events} events, one committed label/content change per slot request; GUI clicks still require a client.`);
  } finally {
    mc.world.afterEvents.playerInventoryItemChange.unsubscribe(listener);
  }
}
