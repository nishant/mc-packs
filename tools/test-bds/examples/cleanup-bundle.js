// Lag Cleanup keeps dropped bundles: a bundle can hold a whole stack of other items, so clearing one loses all of
// them (like a shulker box). Run with
//   node tools/test-bds/run.mjs --quiet --only cleanup_bp --scenario tools/test-bds/examples/cleanup-bundle.js --timeout 300
// Checks: an operator's "Clear now" removes a plain dropped item but keeps a plain and a dyed bundle lying next to it.
export default async function (t) {
  const { ItemStack } = t.mc;
  const p = await t.player("Op", { op: true });
  const base = p.location;
  const dim = p.dimension;
  const at = (dx) => ({ x: Math.floor(base.x) + dx + 0.5, y: Math.floor(base.y) + 1, z: Math.floor(base.z) + 0.5 });
  dim.spawnItem(new ItemStack("minecraft:dirt", 5), at(10));
  dim.spawnItem(new ItemStack("minecraft:bundle", 1), at(12));
  dim.spawnItem(new ItemStack("minecraft:red_bundle", 1), at(14));
  await t.wait(40);
  const ids = () =>
    dim.getEntities({ type: "minecraft:item", location: base, maxDistance: 30 }).map((e) => e.getComponent("minecraft:item")?.itemStack?.typeId);
  t.log("before:", ids().join(", "));
  t.assert(ids().includes("minecraft:bundle") && ids().includes("minecraft:dirt"), "the items lie there");

  const menu = t.waitForm(p);
  t.assert(t.cmd(p, "/realm:cleanup").ok, "cleanup ran");
  const form = await menu;
  const since = t.tick;
  form.answer("Clear now");
  t.log((await t.waitMessage(p, /cleared/i, { since, timeout: 100 })).plain);
  await t.wait(5);
  const after = ids();
  t.log("after:", after.join(", "));
  t.check(!after.includes("minecraft:dirt"), "the plain item was cleared");
  t.check(after.includes("minecraft:bundle"), "the bundle was kept");
  t.check(after.includes("minecraft:red_bundle"), "the dyed bundle was kept");
}
