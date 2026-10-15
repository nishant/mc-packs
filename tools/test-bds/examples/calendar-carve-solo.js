// Realm Calendar: on a quiet realm the Pumpkin Carve-off's only entry wins unopposed when the Lantern Fair ends (nobody
// may vote for their own pumpkin, so a solo player could never win before).
// node tools/test-bds/run.mjs --quiet --flat --only calendar_bp --scenario tools/test-bds/examples/calendar-carve-solo.js --timeout 300
export default async function (t) {
  const Y = -60; // flat world: grass at -61
  const p = await t.player("Solo", { op: true, x: 0, z: 0 });
  let since = t.tick;
  t.assert(t.cmd(p, "/realm:calendar_set 58").ok, "calendar_set 58 ran (the Lantern Fair)");
  await t.wait(40);
  p.getComponent("inventory").container.setItem(p.selectedSlotIndex, new t.mc.ItemStack("minecraft:carved_pumpkin", 1));
  since = t.tick;
  const ok = p.useItemInSlotOnBlock(p.selectedSlotIndex, { x: 2, y: Y - 1, z: 0 }, t.mc.Direction.Up);
  t.log(`placed: ${ok}`);
  await t.waitMessage(p, /entered in the carve-off/, { since, timeout: 60 });
  since = t.tick;
  t.assert(t.cmd(p, "/realm:calendar_set 70").ok, "calendar_set 70 ran (after the fair)");
  const won = await t.waitMessage(p, /won the Pumpkin|unopposed|Nobody voted/, { since, timeout: 100 });
  t.log(won.plain);
  t.check(/only entry, so Solo wins the Pumpkin Carve-off unopposed/.test(won.plain), "the lone entry wins unopposed");
}
