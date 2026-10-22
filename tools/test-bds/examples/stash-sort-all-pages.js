// Quick Stack & Sort: /realm:sort sorts every Expansive Inventory page together. Like stacks on different pages merge,
// the stacks are ordered by item and refill page 1 first, then page 2 and on, so the last pages end up empty; the page
// in view, the hotbar and the page buttons stay as they are, and nothing is lost or duplicated.
//   node tools/test-bds/run.mjs --quiet --only stash_bp --scenario tools/test-bds/examples/stash-sort-all-pages.js
export default async function (t) {
  const mc = t.mc;
  const p = await t.player("Sorter", { op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const STORAGE = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  const mk = (id, n = 1) => new mc.ItemStack(id, n);
  // Dynamic properties are per pack, so the page the player is on is read from the menu button.
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  const go = async (dir) => {
    const want = pageNow() + dir;
    inv.setItem(dir > 0 ? 17 : 15, undefined);
    await t.waitUntil(() => pageNow() === want, { timeout: 60, message: `switched to page ${want}` });
    await t.wait(8);
  };
  const page = () => STORAGE.map((s) => inv.getItem(s)).map((it) => (it ? `${it.typeId.replace("minecraft:", "")} ${it.amount}` : ""));
  const total = (id) => {
    let n = 0;
    for (let s = 0; s < 36; s++) if (inv.getItem(s)?.typeId === id) n += inv.getItem(s).amount;
    return n;
  };

  await t.waitUntil(() => inv.getItem(15)?.typeId === "custom:inv_prev", { timeout: 100, message: "buttons placed" });
  // Page 1: 30 stone and 2 diamonds. Page 2: 50 stone and 3 apples. Page 3 (in view when sorting): 5 emeralds.
  inv.setItem(9, mk("minecraft:stone", 30));
  inv.setItem(10, mk("minecraft:diamond", 2));
  inv.setItem(0, mk("minecraft:bread", 4)); // hotbar
  await t.wait(30);
  await go(1);
  inv.setItem(20, mk("minecraft:stone", 50));
  inv.setItem(35, mk("minecraft:apple", 3));
  await t.wait(30);
  await go(1);
  inv.setItem(9, mk("minecraft:emerald", 5));
  await t.wait(30);
  t.assert(pageNow() === 3, "sorting from page 3");

  t.assert(t.cmd(p, "/realm:sort").ok, "/realm:sort ran");
  const note = await t.waitMessage(p, /Sorted 5 stacks across your pages \(1 in use\)/, { kind: "actionbar", timeout: 40, since: t.tick - 5 }).catch(() => undefined);
  t.check(note !== undefined, "the bar says how many stacks and pages");
  await t.wait(10);
  t.assert(pageNow() === 3, "the page in view stays the same");
  t.check(page().every((x) => x === ""), `page 3 ends empty (${page().filter(Boolean).join(", ")})`);
  t.assert(inv.getItem(0)?.typeId === "minecraft:bread" && inv.getItem(0).amount === 4, "hotbar untouched");
  t.assert(inv.getItem(15)?.typeId === "custom:inv_prev" && inv.getItem(16)?.typeId === "custom:inv_menu" && inv.getItem(17)?.typeId === "custom:inv_next", "buttons stay");

  await go(-1);
  t.check(page().every((x) => x === ""), `page 2 ends empty (${page().filter(Boolean).join(", ")})`);
  await go(-1);
  const one = page();
  t.log(`page 1: ${one.filter(Boolean).join(", ")}`);
  t.check(one.slice(0, 5).join(",") === "apple 3,diamond 2,emerald 5,stone 64,stone 16", "page 1 holds everything, merged and in item order");
  t.check(one.slice(5).every((x) => x === ""), "and nothing after it");
  t.check(total("minecraft:stone") === 80 && total("minecraft:emerald") === 5 && total("minecraft:apple") === 3, "nothing lost or duplicated");
}
