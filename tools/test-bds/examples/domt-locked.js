// Deck of Many Things: Butterfingers never drops a locked item (like the Realm Configuration item, locked in the
// inventory): the card can't happen and the deck draws again, and the item stays in hand. Before the fix it was
// taken out of the inventory and dropped on the ground for anyone to pick up. About 30 seconds:
//   node tools/test-bds/run.mjs --quiet --timeout 300 --only domt_bp --scenario tools/test-bds/examples/domt-locked.js
export default async function (t) {
  t.server("/time set noon");
  const p = await t.player("Tester", { op: true });
  t.server(`/effect "${p.name}" resistance 600 4 true`);
  const inv = p.getComponent("minecraft:inventory").container;
  inv.clearAll();
  const it = new t.mc.ItemStack("minecraft:stick", 1);
  it.nameTag = "Locked Stick";
  it.lockMode = t.mc.ItemLockMode.inventory;
  inv.setItem(0, it);
  p.selectedSlotIndex = 0;
  await t.wait(5);
  const since = t.tick;
  const f1 = t.waitForm(p);
  t.cmd(p, "/realm:domt");
  (await f1).answer("Draw for a player");
  (await t.waitForm(p)).answer({ Card: "Butterfingers" });
  const msg = await t.waitMessage(p, /You drew|crumbles/, { since, timeout: 300 });
  t.log(msg.plain);
  await t.wait(20);
  const held = inv.getItem(0);
  const dropped = t.dimension.getEntities({ type: "minecraft:item", location: p.location, maxDistance: 16 }).filter((e) => e.getComponent("minecraft:item")?.itemStack?.nameTag === "Locked Stick");
  t.check(/crumbles/.test(msg.plain), "Butterfingers can't happen with a locked item in hand");
  t.check(held?.nameTag === "Locked Stick", `the locked item is still in hand (${held?.typeId})`);
  t.check(dropped.length === 0, `nothing locked was dropped (${dropped.length})`);
}
