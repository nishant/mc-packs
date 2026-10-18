// Community Goals: a goal with hundreds of contributors still saves every donation. Before, each contributor was kept
// by name in the goal's one property: past about 700 of them the goal was too big to save, so a donation took the items
// into the chest but the progress (and every later donation) was gone after a restart.
// node tools/test-bds/run.mjs --quiet --only goals_bp --scenario tools/test-bds/examples/goals-many-donors.js --timeout 600
export default async function (t) {
  const p = await t.player("Op", { op: true });
  const at = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const progress = async () => {
    const menu = t.waitForm(p);
    t.cmd(p, "/realm:goals");
    const m = await menu;
    m.answer(null);
    const b = m.buttons.map((x) => x.replace(/§./g, "")).find((x) => /^Wall/.test(x)) ?? "";
    return b.replace(/\n/g, " / ");
  };
  if (t.phase === 1) {
    t.dimension.getBlock(at).setType("minecraft:chest");
    await t.wait(2);
    p.lookAtBlock(at);
    await t.wait(5);
    const added = t.waitMessage(p, /Goal Wall added/i, { pack: "goals_bp" });
    t.assert(t.cmd(p, "/realm:goals_add cobblestone 100000 Wall").ok, "goals_add ran");
    await added;
    await t.console(`scriptevent realm:goals_test {"donors":900}`);
    await t.wait(5);

    p.giveItem(new t.mc.ItemStack("minecraft:cobblestone", 64), false);
    await t.wait(2);
    const list = t.waitForm(p);
    t.cmd(p, "/realm:goals");
    const l = await list;
    const page = t.waitForm(p);
    l.answer("Wall");
    const g = await page;
    // The goal's page comes back after donating (it didn't when the save failed): close it, if it comes.
    t.answerForm(p, null);
    g.answer("Donate");
    await t.wait(10);
    const before = await progress();
    t.log(`before the restart: ${before}`);
    t.check(/964 \/ 100,000/.test(before), `900 + 64 given (${before})`);
    t.restart("donated; restarting");
    return;
  }
  await t.wait(20);
  const after = await progress();
  t.log(`after the restart: ${after}`);
  t.check(/964 \/ 100,000/.test(after), `the donations are still counted after the restart (${after})`);
  const menu = t.waitForm(p);
  t.cmd(p, "/realm:goals");
  const m = await menu;
  const page = t.waitForm(p);
  m.answer("Wall");
  const g = await page;
  g.answer(null);
  const body = g.body.replace(/§./g, "");
  t.log(body.split("\n").filter((x) => /^\d\. /.test(x)).slice(0, 3).join(" | "));
  t.check(/1\. Op: 64/.test(body), `the biggest contributor still leads the top list (${body.slice(0, 300)})`);
}
