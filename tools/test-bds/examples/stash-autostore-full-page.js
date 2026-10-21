// F3: page 1 is 24 full stacks of dirt, the player mines dirt on a nearly full page 2. Every pickup is routed past page 1
// (no stack there has room) to page 3. Before F3 each routing pass restored page 1's snapshot only to find no room; the
// profile shows the difference (stash_bp ms/tick). The scenario checks nothing was lost or duplicated, and counts the
// page snapshots stash_bp writes and reads while mining. Every auto-store pass is one commit, which writes 3 snapshots
// (page 3, and the inventory's before and after images; spawnEntity, entitySpawn cause Spawned), and reads each back
// once (structure load, entityLoad). Reads beyond those read-backs are page reads: with F3 only page 3 (one per pass,
// none the first time), at 88cc198 page 1 too (two per pass). Auto-store is off while the pages are filled, or filling
// page 1 would itself route its newest stacks to other pages and page 1 would never be full.
// Run: node tools/test-bds/run.mjs --quiet --no-relay --profile --only stash_bp --scenario tools/test-bds/examples/stash-autostore-full-page.js
export default async function (t) {
  const mc = t.mc;
  const setAuto = async (/** @type {boolean} */ value) => {
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `full-page-${value}`, pack: "stash_bp", key: "autoStore", value }));
    await t.wait(3);
  };
  await setAuto(false);
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
  await setAuto(true);
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
  const passes = seen.saves / 3;
  const pageReads = Math.max(seen.restores, seen.loads) - seen.saves;
  t.log(`while mining: ${seen.saves} snapshot saves (${passes} auto-store passes), ${seen.loads} entityLoad events, ${pageReads} page reads beyond read-backs (entitySpawn causes ${JSON.stringify(seen.causes)}, ${seen.unreadable} unreadable)`);
  t.assert(seen.saves >= 60 && Number.isInteger(passes), `the auto-store passes are visible as 3 snapshot saves each (${seen.saves}); if not, read the logged causes`);
  t.assert(Math.max(seen.restores, seen.loads) >= seen.saves, `every snapshot save is read back (${seen.loads} loads for ${seen.saves} saves); if not, read the logged events`);
  t.assert(pageReads <= passes, `page 1 is never read: ${pageReads} page reads for ${passes} passes (88cc198: about 2 per pass)`);
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
