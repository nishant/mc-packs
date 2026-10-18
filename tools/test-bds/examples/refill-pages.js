// Hotbar Refill 1.1.0 + Quick Stack & Sort 1.8.0: a used-up hotbar stack is refilled from the open inventory page, and,
// when that page has none, from another Expansive Inventory page (realm:refill_need), with nothing lost or doubled.
// Then: a rocket with a long lore (over 2000 characters) still refills (refill_need carries the lore's start and a
// hash); a banner never comes from another page (its pattern isn't compared); and a player who just died gets
// nothing moved into the hotbar (it would drop with the death loot).
//   node tools/test-bds/run.mjs --quiet --flat --only refill_bp,stash_bp --scenario tools/test-bds/examples/refill-pages.js --timeout 600
export default async function (t) {
  const mc = t.mc;
  const p = await t.player("Flyer", { op: true });
  t.cmd(p, "/gamemode survival");
  const inv = p.getComponent("minecraft:inventory").container;
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "r1", pack: "refill_bp", key: "on", value: true, player: p.id }));
  await t.waitUntil(() => inv.getItem(16)?.typeId === "custom:inv_menu", { timeout: 100, message: "pages ready" });
  const ROCKET = "minecraft:firework_rocket";
  const count = () => {
    let n = 0;
    for (let s = 0; s < inv.size; s++) if (inv.getItem(s)?.typeId === ROCKET) n += inv.getItem(s).amount;
    return n;
  };
  const loc = p.location;
  const ground = { x: Math.floor(loc.x) + 1, y: Math.floor(loc.y) - 1, z: Math.floor(loc.z) };
  /** Fires the last rocket of hotbar slot 0 (used on the ground, which uses it up like gliding does). */
  const useLast = async (make = () => new mc.ItemStack(ROCKET, 1)) => {
    p.selectedSlotIndex = 0;
    inv.setItem(0, make());
    await t.wait(2);
    const ok = p.useItemInSlotOnBlock(0, ground, mc.Direction.Up);
    await t.wait(10);
    return ok;
  };

  // 1. A spare on the open page: swapped in.
  inv.setItem(20, new mc.ItemStack(ROCKET, 64));
  t.check(await useLast(), "the rocket was used");
  t.check(inv.getItem(0)?.typeId === ROCKET && inv.getItem(0).amount === 64 && !inv.getItem(20), `refilled from this page (${inv.getItem(0)?.amount})`);

  // 2. The spare is on page 1, the player is on page 2: it comes from page 1.
  inv.setItem(0, undefined);
  inv.setItem(20, new mc.ItemStack(ROCKET, 64));
  inv.setItem(17, undefined); // next page
  await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: "on page 2" });
  await t.wait(8);
  t.check(count() === 0, "no rockets on page 2");
  const since = t.tick;
  t.check(await useLast(), "the rocket was used");
  await t.waitUntil(() => inv.getItem(0)?.typeId === ROCKET, { timeout: 40, message: "refilled from page 1" });
  t.check(inv.getItem(0).amount === 64, `64 from page 1 (${inv.getItem(0).amount})`);
  const note = t.messages(p, { since, kind: "actionbar" }).find((m) => /Refilled/.test(m.plain));
  t.check(/Page #1.*Refilled 64x Firework rocket/.test(note?.plain ?? ""), `the bar says from where (${note?.plain})`);
  // Back on page 1, the stack is gone from there: moved, not copied.
  inv.setItem(15, undefined);
  await t.waitUntil(() => pageNow() === 1, { timeout: 60, message: "back on page 1" });
  await t.wait(8);
  t.check(!inv.getItem(20) && count() === 64, `moved, not copied (${count()} rockets in all)`);

  const toPage = async (n) => {
    if (pageNow() === n) return;
    inv.setItem(n > pageNow() ? 17 : 15, undefined);
    await t.waitUntil(() => pageNow() === n, { timeout: 60, message: `on page ${n}` });
    await t.wait(8);
  };

  // 3. A long lore (20 lines, 2000 characters): realm:refill_need stays under 2048 and it still matches.
  for (let s = 0; s < inv.size; s++) if (inv.getItem(s)?.typeId === ROCKET) inv.setItem(s, undefined);
  const lore = Array.from({ length: 20 }, (_, k) => `Line ${String(k).padStart(2, "0")} `.padEnd(100, "x"));
  const lored = (n) => {
    const it = new mc.ItemStack(ROCKET, n);
    it.setLore(lore);
    return it;
  };
  inv.setItem(20, lored(64));
  await t.wait(5);
  await toPage(2);
  t.check(await useLast(() => lored(1)), "the lored rocket was used");
  const longOk = await t.waitUntil(() => inv.getItem(0)?.typeId === ROCKET, { timeout: 40, message: "lored refill" }).then(() => true, () => false);
  t.check(longOk && inv.getItem(0)?.amount === 64 && inv.getItem(0)?.getLore().length === 20, `the lored rocket refilled from page 1 (${inv.getItem(0)?.amount}, ${inv.getItem(0)?.getLore().length} lines)`);
  inv.setItem(0, undefined);

  // 4. Banners carry a pattern the API can't compare: one on page 1 never replaces a used-up banner on page 2.
  await toPage(1);
  inv.setItem(21, new mc.ItemStack("minecraft:banner", 16));
  await t.wait(5);
  await toPage(2);
  const ground2 = { x: ground.x, y: ground.y, z: ground.z + 2 };
  p.selectedSlotIndex = 0;
  inv.setItem(0, new mc.ItemStack("minecraft:banner", 1));
  await t.wait(2);
  t.check(p.useItemInSlotOnBlock(0, ground2, mc.Direction.Up), "the banner was placed");
  await t.wait(20);
  t.check(!inv.getItem(0), `no banner came from page 1 (${inv.getItem(0)?.typeId})`);
  await toPage(1);
  t.check(inv.getItem(21)?.typeId === "minecraft:banner" && inv.getItem(21)?.amount === 16, "the banners stay on page 1");

  // 5. Dead: a refill request for a player who just died moves nothing (it would drop with the death loot).
  inv.setItem(22, new mc.ItemStack(ROCKET, 64));
  await t.wait(5);
  await toPage(2);
  for (let s = 0; s < 9; s++) inv.setItem(s, undefined);
  await t.wait(2);
  p.kill();
  t.system.sendScriptEvent("realm:refill_need", JSON.stringify({ player: p.id, slot: 0, id: ROCKET }));
  await t.wait(20);
  p.respawn();
  await t.wait(40);
  await toPage(1);
  t.check(inv.getItem(22)?.typeId === ROCKET && inv.getItem(22)?.amount === 64, `the rockets stay on page 1 (${inv.getItem(22)?.amount})`);
}
