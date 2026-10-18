// Expansive Inventory in the Nether and at the top of the world: pages save and switch, with no warnings.
// Run: node tools/test-bds/run.mjs --quiet --only stash_bp --scenario tools/test-bds/examples/stash-pages-nether.js
export default async function (t) {
  const mc = t.mc;
  const nether = t.world.getDimension("nether");
  const x = 0, z = 0;
  try { nether.runCommand(`tickingarea add circle ${x} 0 ${z} 2 stash_nether true`); } catch (e) { t.log(`ticking area: ${e}`); }
  await t.waitUntil(() => nether.getBlock({ x, y: 64, z }), { timeout: 600, message: "nether chunk loaded" });
  nether.runCommand(`fill ${x - 4} 64 ${z - 4} ${x + 4} 69 ${z + 4} air`);
  nether.runCommand(`fill ${x - 4} 63 ${z - 4} ${x + 4} 63 ${z + 4} netherrack`);
  const a = await t.player("NetherA", { x: x - 1, y: 64, z, dimension: "nether" });
  const b = await t.player("NetherB", { x, y: 64, z, dimension: "nether" });
  for (const p of [a, b]) {
    const inv = p.getComponent("minecraft:inventory").container;
    await t.waitUntil(() => inv.getItem(17)?.typeId === "custom:inv_next", { timeout: 200, message: `${p.name} buttons placed` });
  }
  const inv = a.getComponent("minecraft:inventory").container;
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  inv.setItem(10, new mc.ItemStack("minecraft:diamond", 7));
  await t.wait(8);
  inv.setItem(17, undefined);
  await t.waitUntil(() => pageNow() === 2, { timeout: 80, message: "switched to page 2 in the Nether" });
  t.assert(!inv.getItem(10), "page 2 is empty");
  await t.wait(8);
  inv.setItem(15, undefined);
  await t.waitUntil(() => pageNow() === 1, { timeout: 80, message: "back on page 1" });
  t.assert(inv.getItem(10)?.typeId === "minecraft:diamond" && inv.getItem(10)?.amount === 7, "diamonds came back");

  // The End: the same round trip on the obsidian platform.
  const end = t.world.getDimension("the_end");
  try { end.runCommand("tickingarea add circle 100 0 0 2 stash_end true"); } catch (e) { t.log(`ticking area: ${e}`); }
  await t.waitUntil(() => end.getBlock({ x: 100, y: 49, z: 0 }), { timeout: 600, message: "end chunk loaded" });
  end.runCommand("fill 96 49 -4 104 49 4 obsidian");
  end.runCommand("fill 96 50 -4 104 54 4 air");
  const c = await t.player("EnderC", { x: 100, y: 50, z: 0, dimension: "the_end" });
  const cinv = c.getComponent("minecraft:inventory").container;
  await t.waitUntil(() => cinv.getItem(17)?.typeId === "custom:inv_next", { timeout: 200, message: "EnderC buttons placed" });
  const cPage = () => Number(/Page (\d+)\//.exec(cinv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  cinv.setItem(12, new mc.ItemStack("minecraft:ender_pearl", 5));
  await t.wait(8);
  cinv.setItem(17, undefined);
  await t.waitUntil(() => cPage() === 2, { timeout: 80, message: "switched to page 2 in the End" });
  await t.wait(8);
  cinv.setItem(15, undefined);
  await t.waitUntil(() => cPage() === 1, { timeout: 80, message: "back on page 1 in the End" });
  t.assert(cinv.getItem(12)?.amount === 5, "ender pearls came back");

  await t.wait(60);
  // Older versions leaked the storage entities into the Overworld at the same coordinates.
  const counts = [nether, end, t.dimension].map((d) => d.getEntities({ type: "realm:stash_page_store" }).length);
  t.assert(counts.every((n) => n === 0), `no storage entities left behind (nether/end/overworld: ${counts.join("/")})`);
}
