// Expansive Inventory: 24 full native stacks, and shrinking an operator's pages keeps every item.
// Run: node tools/test-bds/run.mjs --quiet --only stash_bp --scenario tools/test-bds/examples/stash-pages-shrink.js
export default async function (t) {
  const mc = t.mc;
  const p = await t.player("Shrinker", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const STORAGE = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  const mk = (id, n = 1) => new mc.ItemStack(id, n);
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  const click = async (slot, page) => {
    await t.wait(8);
    inv.setItem(slot, undefined);
    await t.waitUntil(() => pageNow() === page, { timeout: 60, message: `on page ${page}` });
  };
  await t.waitUntil(() => inv.getItem(17)?.typeId === "custom:inv_next", { timeout: 100, message: "buttons placed" });
  const opening = t.waitForm(p);
  t.cmd(p, "/realm:inv");
  (await opening).answer("Inventory settings");
  const settings = await t.waitForm(p);
  settings.answer({ "Auto-store pickups": false });
  await t.wait(4);

  // 1. Every slot has substantial metadata; disable auto-store to isolate full-page switching.
  const heavy = (i) => {
    const it = mk("minecraft:iron_sword");
    it.nameTag = `Blade ${i} ` + "n".repeat(100);
    it.setLore(Array.from({ length: 8 }, (_, k) => `${i}-${k} ` + "l".repeat(150)));
    it.getComponent("minecraft:durability").damage = i + 1;
    return it;
  };
  STORAGE.forEach((s, i) => inv.setItem(s, heavy(i)));
  await click(17, 2);
  t.assert(STORAGE.every((s) => !inv.getItem(s)), "page 2 is empty");
  await click(15, 1);
  let same = 0;
  STORAGE.forEach((s, i) => {
    const it = inv.getItem(s);
    if (it && it.nameTag === heavy(i).nameTag && it.getLore().join() === heavy(i).getLore().join() && it.getComponent("minecraft:durability").damage === i + 1) same++;
  });
  t.assert(same === 24, `all 24 heavy stacks came back exactly (${same})`);
  STORAGE.forEach((s) => inv.setItem(s, undefined));

  // 2. Items on pages 1 to 4, then the operator drops to 2 pages
  inv.setItem(10, mk("minecraft:stone", 10));
  await click(17, 2);
  inv.setItem(10, mk("minecraft:diamond", 3));
  await click(17, 3);
  inv.setItem(10, mk("minecraft:emerald", 4));
  await click(17, 4);
  inv.setItem(10, mk("minecraft:gold_ingot", 5));
  inv.setItem(11, mk("minecraft:apple", 2));
  await t.wait(10);
  t.assert(t.cmd(p, "/realm:inv_pages 2").ok, "/realm:inv_pages 2 ran");
  await t.waitUntil(() => pageNow() === 1 && inv.getItem(17)?.nameTag?.includes("Page 2/2"), { timeout: 80, message: "page 1 of 2" });
  await t.wait(10);
  t.log(`buttons: ${inv.getItem(15)?.nameTag} | ${inv.getItem(16)?.nameTag}`);

  const scan = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:inv").ok, "/realm:inv ran");
  const menu = await scan;
  t.log(`menu: ${menu.buttons.join(" / ").replace(/\n/g, " ")}`);
  t.assert(menu.buttons.filter((b) => /^Page #/.test(b)).length === 2, "two pages listed");
  menu.answer("Scan all items");
  const list = await t.waitForm(p, { timeout: 100 });
  t.log(`scan: ${list.buttons.join(" / ")}`);
  for (const need of [/Stone x10/, /Diamond x3/, /Emerald x4/, /Gold ingot x5/, /Apple x2/]) t.assert(list.buttons.some((b) => need.test(b)), `${need} still there`);
  list.answer(null);

  // 3. Back to the realm default (5 pages): the buttons count five again
  t.assert(t.cmd(p, "/realm:inv_pages 0").ok, "/realm:inv_pages 0 ran");
  await t.waitUntil(() => inv.getItem(17)?.nameTag?.includes("/5"), { timeout: 80, message: "5 pages again" });
  // Out of range is refused
  t.assert(!t.cmd(p, "/realm:inv_pages 99").ok, "99 pages refused");
  const disabling = t.waitForm(p);
  t.cmd(p, "/realm:inv");
  (await disabling).answer("Use normal inventory");
  await t.waitUntil(() => inv.getItem(16)?.typeId !== "custom:inv_menu", { timeout: 80, message: "normal inventory has no buttons" });
  let diamonds = 0;
  for (let s = 0; s < inv.size; s++) if (inv.getItem(s)?.typeId === "minecraft:diamond") diamonds += inv.getItem(s).amount;
  t.assert(diamonds === 3, "disabling extra pages returns native saved items exactly once");
  const enabling = t.waitForm(p);
  t.cmd(p, "/realm:inv");
  (await enabling).answer("Enable Expansive Inventory");
  await t.waitUntil(() => inv.getItem(16)?.nameTag?.includes("Page 1/5"), { timeout: 80, message: "extra pages re-enabled" });
}
