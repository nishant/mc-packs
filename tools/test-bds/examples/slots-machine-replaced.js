// Slot Machine: a block made a machine stays one while it's the same block; once it is replaced without a player
// breaking it (a /setblock here; an explosion or a piston in a world), tapping the new block doesn't open the
// machine, and the machine is forgotten.
//   node tools/test-bds/run.mjs --quiet --flat --only slots_bp --scenario tools/test-bds/examples/slots-machine-replaced.js --timeout 300
export default async function (t) {
  t.formTimeout = 200;
  const p = await t.player("Op", { op: true });
  const at = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  t.server(`/setblock ${at.x} ${at.y} ${at.z} gold_block`);
  await t.wait(5);
  p.lookAtBlock(at);
  await t.wait(5);
  t.answerForm(p, "Operator tools", "Make the block I look at a machine");
  t.cmd(p, "/realm:slots");
  await t.waitMessage(p, /is now a slot machine/, { timeout: 200 });
  // A tap opens the machine (its form is closed again); false when no form came.
  const tap = async () => {
    const form = t.waitForm(p, { timeout: 40 }).then((f) => { f.answer(null); return true; }, () => false);
    p.selectedSlotIndex = 0;
    p.getComponent("minecraft:inventory").container.setItem(0, new t.mc.ItemStack("minecraft:stick", 1));
    p.useItemInSlotOnBlock(0, at, t.mc.Direction.Up); // interactWithBlock fires no tap event for a simulated player
    const got = await form;
    await t.wait(20);
    return got;
  };
  t.check(await tap(), "tapping the machine opens it");
  // Replaced by another block without a player breaking it.
  t.server(`/setblock ${at.x} ${at.y} ${at.z} iron_block`);
  await t.wait(5);
  t.check(!(await tap()), "tapping the new block doesn't open the slot machine");
  t.server(`/setblock ${at.x} ${at.y} ${at.z} gold_block`);
  await t.wait(5);
  t.check(!(await tap()), "the machine was forgotten (the gold block is ordinary again)");
}
