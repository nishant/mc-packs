// F3: page 1 is 24 full stacks of dirt, the player mines dirt on a nearly full page 2. Every pickup is routed past page 1
// (no stack there has room) to page 3. Before F3 each routing pass restored page 1's snapshot only to find no room; the
// profile shows the difference (stash_bp ms/tick). The scenario checks nothing was lost or duplicated, and counts the
// page snapshots stash_bp restores and saves while mining: each save (a storage entity spawned, cause Spawned) is one
// routing pass onto page 3; each restore (the same entity placed from a structure, any other cause) reads a page. On
// 88cc198 every pass also restored page 1, about 2 restores per save; with F3 only page 3 is restored, at most 1 per save.
// Run: node tools/test-bds/run.mjs --quiet --no-relay --profile --only stash_bp --scenario tools/test-bds/examples/stash-autostore-full-page.js
export default async function (t) {
  const mc = t.mc;
  const p = await t.player("Digger", { op: true });
  t.cmd(p, "/gamemode survival");
  const inv = p.getComponent("minecraft:inventory").container;
  const STORAGE = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  const count = (/** @type {string} */ id) => {
    let n = 0;
    for (let s = 0; s < 36; s++) { const it = inv.getItem(s); if (it?.typeId === id) n += it.amount; }
    return n;
  };
  await t.waitUntil(() => inv.getItem(16)?.typeId === "custom:inv_menu", { timeout: 100, message: "pages ready" });
  await t.wait(10);
  // Page 1: 24 x 64 dirt.
  for (const s of STORAGE) inv.setItem(s, new mc.ItemStack("minecraft:dirt", 64));
  await t.wait(10);
  inv.setItem(17, undefined);
  await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: "on page 2" });
  await t.wait(10);
  // Page 2: 22 stacks of stone and two free slots; the hotbar is full so pickups land on the page.
  for (const s of STORAGE.slice(0, 22)) inv.setItem(s, new mc.ItemStack("minecraft:stone", 64));
  for (let s = 0; s < 9; s++) inv.setItem(s, new mc.ItemStack("minecraft:torch", 1 + s));
  await t.wait(20);
  const STORE = "realm:stash_page_store";
  const seen = { saves: 0, restores: 0, loads: 0, unreadable: 0, causes: /** @type {Record<string, number>} */ ({}) };
  let watching = true;
  /** @param {any} entity */
  const isStore = (entity) => {
    try { return entity.typeId === STORE; } catch { seen.unreadable++; return false; }
  };
  t.world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
    if (!watching || !isStore(entity)) return;
    seen.causes[cause] = (seen.causes[cause] ?? 0) + 1;
    if (cause === "Spawned") seen.saves++;
    else seen.restores++;
  });
  t.world.afterEvents.entityLoad?.subscribe(({ entity }) => {
    if (watching && isStore(entity)) seen.loads++;
  });
  const pickups = 120;
  const t0 = Date.now();
  for (let i = 0; i < pickups; i++) {
    inv.addItem(new mc.ItemStack("minecraft:dirt", 1));
    await t.wait(10);
  }
  await t.wait(40);
  watching = false;
  t.log(`while mining: ${seen.saves} page saves, ${seen.restores} restores (entitySpawn causes ${JSON.stringify(seen.causes)}), ${seen.loads} entityLoad events, ${seen.unreadable} unreadable`);
  t.assert(seen.saves >= 20, `the routing passes are visible as page saves (${seen.saves}); if 0, read the logged causes`);
  const restores = Math.max(seen.restores, seen.loads);
  t.assert(restores >= 1, `page restores are visible (${restores}); if 0, read the logged events`);
  t.assert(restores <= seen.saves, `page 1 is never restored: ${restores} restores for ${seen.saves} routing passes (88cc198: about 2 per pass)`);
  const onPage2 = count("minecraft:dirt");
  t.log(`page 2 holds ${onPage2} dirt after ${pickups} pickups; wall ${Date.now() - t0} ms`);
  t.assert(STORAGE.filter((s) => !inv.getItem(s)).length >= 1, "page 2 kept a free slot (routing worked)");
  // Page 3 holds what was routed; page 1 is untouched.
  inv.setItem(17, undefined);
  await t.waitUntil(() => pageNow() === 3, { timeout: 60, message: "on page 3" });
  await t.wait(10);
  const onPage3 = count("minecraft:dirt");
  t.log(`page 3 holds ${onPage3} dirt`);
  t.assert(onPage2 + onPage3 === pickups, `every pickup is on page 2 or 3 exactly once (${onPage2} + ${onPage3})`);
  inv.setItem(15, undefined);
  await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: "back on page 2" });
  inv.setItem(15, undefined);
  await t.waitUntil(() => pageNow() === 1, { timeout: 60, message: "back on page 1" });
  await t.wait(10);
  t.assert(count("minecraft:dirt") === 24 * 64, `page 1 still holds 24 x 64 dirt (${count("minecraft:dirt")})`);
}
