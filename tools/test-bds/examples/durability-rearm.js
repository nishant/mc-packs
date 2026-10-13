// Low Durability Warning: a warning level only clears once the item is repaired a little above it
// (2% of its durability), so a Mending tool hovering at the line doesn't warn again and again.
// A real repair still re-arms it, and critical works the same way. About 15 seconds:
//   node tools/test-bds/run.mjs --quiet --only durability_bp --scenario tools/test-bds/examples/durability-rearm.js
export default async function (t) {
  const { ItemStack } = t.mc;
  const p = await t.player("Tester", { gameMode: "survival" });
  const inv = p.getComponent("inventory").container;
  p.selectedSlotIndex = 0;
  /** An iron sword (250 uses) with `left` uses left, in the hand; then wait for two checks. */
  const hold = async (left) => {
    const s = new ItemStack("minecraft:iron_sword", 1);
    const d = s.getComponent("durability");
    d.damage = d.maxDurability - left;
    inv.setItem(0, s);
    await t.wait(25);
  };
  const warnings = (re) => t.messages(p, { pack: "durability_bp", kind: "actionbar" }).filter((m) => re.test(m.plain)).length;

  await hold(22); // 8.8%: low
  t.assert(warnings(/is low/) === 1, "warns at 8.8%");
  await hold(26); // 10.4%: just above the line (one ore's worth of Mending)
  await hold(23); // 9.2%: back under it
  t.check(warnings(/is low/) === 1, "no second warning while hovering at the line");
  await hold(40); // 16%: properly repaired
  await hold(22);
  t.check(warnings(/is low/) === 2, "warns again after a real repair");

  await hold(5); // 2%: critical
  t.check(warnings(/about to break/) === 1, "critical at 2%");
  await hold(9); // 3.6%: just above critical
  await hold(6); // 2.4%
  t.check(warnings(/about to break/) === 1, "no second critical warning while hovering at the line");
  t.check(warnings(/is low/) === 2, "and no low warning on the way back up");
}
