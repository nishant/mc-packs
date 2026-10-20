// Chest Finder: the saved index across saves and a restart. Run with
//   node tools/test-bds/run.mjs --quiet --only find_bp --scenario tools/test-bds/examples/find-index.js --timeout 600
// Checks (the private index: the player placed both barrels): a container read (by a search nearby), saved
// (a player leaving saves), changed, read and saved again is found after a restart with its new contents, from
// beyond the live scan radius, and a second container saved once is still there.
// The private index lists only containers the searcher placed or opened, and a simulated player's open fires no
// interact event, so the fixture's searchers place their containers (native playerPlaceBlock, as saga-content-replacements).
async function place(t, p, loc, type) {
  const inv = p.getComponent("minecraft:inventory").container;
  inv.setItem(p.selectedSlotIndex, new t.mc.ItemStack(type, 1));
  p.useItemInSlotOnBlock(p.selectedSlotIndex, { x: loc.x, y: loc.y - 1, z: loc.z }, t.mc.Direction.Up);
  await t.waitUntil(() => t.dimension.getBlock(loc).typeId === type, { timeout: 40, message: `${p.name} placed ${type}` });
}
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  if (t.phase === 1) {
    const p = await t.player("Opener");
    const at = (dx) => ({ x: Math.floor(p.location.x) + dx, y: Math.floor(p.location.y), z: Math.floor(p.location.z) + 2 });
    const a = at(0), b = at(3);
    for (const loc of [a, b]) await place(t, p, loc, "minecraft:barrel");
    const inv = (loc) => dim.getBlock(loc).getComponent("minecraft:inventory").container;
    inv(a).setItem(0, new ItemStack("minecraft:diamond", 3));
    inv(b).setItem(0, new ItemStack("minecraft:emerald", 5));
    t.world.setDynamicProperty("test:spots", JSON.stringify({ a, b, owner: p.id }));
    async function scan() {
      const menu = t.waitForm(p);
      t.assert(t.cmd(p, "/realm:find diamond").ok, "find nearby");
      (await menu).answer(null);
      await t.wait(5);
    }
    await scan();
    const q = await t.player("Visitor", { x: a.x + 6, z: a.z });
    q.disconnect(); // a player leaving saves the index
    await t.wait(10);
    inv(a).setItem(0, new ItemStack("minecraft:diamond", 7));
    await scan();
    p.disconnect();
    await t.wait(10);
    t.restart("index saved twice");
    return;
  }
  const { a, owner } = JSON.parse(String(t.world.getDynamicProperty("test:spots")));
  const p = await t.player("Opener", { x: a.x + 40, z: a.z });
  t.assert(p.id === owner, `the owner rejoins with the same id (${p.id} vs ${owner})`);
  for (const [query, want] of [["diamond", /7 Diamond/], ["emerald", /5 Emerald/]]) {
    const menu = t.waitForm(p);
    t.assert(t.cmd(p, `/realm:find ${query}`).ok, `find ${query}`);
    const form = await menu;
    t.log(query, form.buttons);
    t.check(form.buttons.length === 1 && want.test(form.buttons[0]), `${query}: the saved entry, as last seen`);
    form.answer(null);
    await t.wait(5);
  }
}
