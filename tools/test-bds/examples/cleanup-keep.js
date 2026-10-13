// Lag Cleanup: what a cleanup keeps, and the reminder before it clears. Run with
//   node tools/test-bds/run.mjs --quiet --only cleanup_bp --scenario tools/test-bds/examples/cleanup-keep.js --timeout 600
// Checks: an operator's "Clear in 30 s" warns in chat, reminds everyone 10 s before, then clears; a plain item
// goes, while an item with lore but no custom name (a silly-enchanted tool), a renamed item and an item next to
// a player stay.
export default async function (t) {
  const { ItemStack } = t.mc;
  const p = await t.player("Op", { op: true });
  const base = p.location;
  const dim = p.dimension;
  const at = (dx) => ({ x: Math.floor(base.x) + dx + 0.5, y: Math.floor(base.y) + 1, z: Math.floor(base.z) + 0.5 });

  const lore = new ItemStack("minecraft:iron_pickaxe", 1);
  lore.setLore(["§r§dSilly: Bouncy"]);
  const named = new ItemStack("minecraft:stick", 1);
  named.nameTag = "Wand";
  dim.spawnItem(new ItemStack("minecraft:dirt", 5), at(10));
  dim.spawnItem(lore, at(13));
  dim.spawnItem(named, at(16));
  dim.spawnItem(new ItemStack("minecraft:cobblestone", 3), at(2)); // within 4 blocks of the player
  await t.wait(40);

  const ids = () =>
    dim.getEntities({ type: "minecraft:item", location: base, maxDistance: 30 }).map((e) => e.getComponent("minecraft:item")?.itemStack?.typeId);
  t.log("before:", ids().join(", "));
  t.assert(ids().includes("minecraft:dirt"), "the plain item lies there");

  const menu = t.waitForm(p);
  t.assert(t.cmd(p, "/realm:cleanup").ok, "cleanup ran");
  const form = await menu;
  t.log(form.buttons);
  const since = t.tick;
  form.answer("Clear in");
  const warn = await t.waitMessage(p, /Clearing .* in 30 s/, { since });
  t.log(warn.plain);
  const remind = await t.waitMessage(p, /in 1?\d s/, { since: warn.tick + 1, timeout: 600 });
  t.log("reminder:", remind.plain, "after", (remind.tick - warn.tick) / 20, "s");
  t.check(remind.tick - warn.tick >= 380 && remind.tick - warn.tick <= 420 && !/Cleared/.test(remind.plain), "a reminder about 10 s before the clearing");
  const done = await t.waitMessage(p, /Cleared/, { since: warn.tick + 1, timeout: 400 });
  t.log(done.plain);
  await t.wait(5);
  const after = ids();
  t.log("after:", after.join(", "));
  t.check(!after.includes("minecraft:dirt"), "the plain item was cleared");
  t.check(after.includes("minecraft:iron_pickaxe"), "the item with lore was kept");
  t.check(after.includes("minecraft:stick"), "the renamed item was kept");
  t.check(after.includes("minecraft:cobblestone"), "the item next to the player was kept");
}
