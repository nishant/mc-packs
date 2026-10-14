// Quick Stack & Sort, Chest Finder and Land Claims (stash_bp, find_bp, claims_bp): the access check. A chest in
// someone else's claim gets nothing from /realm:stash (its stacks couldn't be taken back out), while a chest just
// outside still does; Chest Finder doesn't show that chest to the visitor, but does to the claim's owner.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only claims_bp,stash_bp,find_bp --scenario tools/test-bds/examples/stash-claims-access.js --timeout 420
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const own = await t.player("Owner");
  const base = { x: Math.floor(own.location.x), y: Math.floor(own.location.y), z: Math.floor(own.location.z) };
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(3);
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  t.log((await t.waitMessage(own, /Claimed/, { timeout: 60 })).plain);

  // A chest inside the claim (radius 16) and one just outside, 4 blocks apart, both near the visitor.
  const inside = { x: base.x + 15, y: base.y, z: base.z + 3 };
  const outside = { x: base.x + 19, y: base.y, z: base.z + 3 };
  for (const at of [inside, outside]) dim.getBlock(at).setType("minecraft:chest");
  const chest = (at) => dim.getBlock(at).getComponent("minecraft:inventory").container;
  chest(inside).setItem(0, new ItemStack("minecraft:cobblestone", 1));
  chest(outside).setItem(0, new ItemStack("minecraft:dirt", 1));

  const visitor = await t.player("Visitor", { x: base.x + 22, z: base.z });
  await t.wait(40); // the access check "hello" at world load has been answered by now
  const inv = visitor.getComponent("minecraft:inventory").container;
  inv.setItem(9, new ItemStack("minecraft:cobblestone", 20));
  inv.setItem(10, new ItemStack("minecraft:dirt", 10));

  const since = t.tick;
  t.assert(t.cmd(visitor, "/realm:stash").ok, "/realm:stash ran");
  const note = await t.waitMessage(visitor, /Stash|stash|containers/, { timeout: 100, kind: "actionbar", since }).catch(() => undefined);
  t.log("stash:", note?.plain);
  await t.wait(5);
  const count = (c, id) => {
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) n += c.getItem(i).amount;
    return n;
  };
  t.check(count(chest(inside), "minecraft:cobblestone") === 1, `the chest in Owner's claim got nothing (${count(chest(inside), "minecraft:cobblestone")} cobblestone)`);
  t.check(count(inv, "minecraft:cobblestone") === 20, `the visitor keeps the cobblestone (${count(inv, "minecraft:cobblestone")})`);
  t.check(count(chest(outside), "minecraft:dirt") === 11, `the chest outside the claim still gets the dirt (${count(chest(outside), "minecraft:dirt")})`);

  // Chest Finder: the visitor isn't shown the claimed chest; the owner is.
  const asked = t.tick;
  t.assert(t.cmd(visitor, "/realm:find cobblestone").ok, "the visitor searched");
  const none = await t.waitMessage(visitor, /can't open|No remembered/, { timeout: 120, since: asked }).catch(() => undefined);
  t.log("visitor find:", none?.plain, t.forms(visitor).map((f) => f.buttons));
  t.check(!!none && /can't open/.test(none.plain), "Chest Finder tells the visitor only containers they can't open have it");

  own.teleport({ x: base.x + 10, y: base.y, z: base.z });
  await t.wait(5);
  const ownerForm = t.waitForm(own, { timeout: 100 });
  t.assert(t.cmd(own, "/realm:find cobblestone").ok, "the owner searched");
  const of = await ownerForm;
  t.log("owner find:", of.buttons);
  t.check(of.buttons.some((b) => /Cobblestone/.test(b)), "Chest Finder shows the owner the chest in their claim");
  of.answer(null);
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c2", pack: "claims_bp", key: "enabled", value: false }));
}
