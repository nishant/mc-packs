// Community Goals: after an operator's button on a goal's page (link it to another chest, mark it finished,
// remove it), the menu comes back instead of closing: the goal's page after linking, the goals list after the others.
// Run with: node tools/test-bds/run.mjs --quiet --only goals_bp --scenario tools/test-bds/examples/goals-op-back.js --timeout 420
export default async function (t) {
  const p = await t.player("Op", { op: true });
  const base = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const a = { ...base, x: base.x + 2 };
  const b = { ...base, x: base.x - 2 };
  t.dimension.getBlock(a).setType("minecraft:chest");
  t.dimension.getBlock(b).setType("minecraft:barrel");
  await t.wait(2);
  p.lookAtBlock(a);
  await t.wait(5);
  const added = t.waitMessage(p, /Goal Wall added/i, { pack: "goals_bp" });
  t.cmd(p, "/realm:goals_add cobblestone 100 Wall");
  await added;

  /** Opens the goal's page from the list. */
  const page = async () => {
    const list = t.waitForm(p);
    t.cmd(p, "/realm:goals");
    const l = await list;
    const next = t.waitForm(p);
    l.answer("Wall");
    return next;
  };

  // Link to the barrel: the goal's page comes back.
  p.lookAtBlock(b);
  await t.wait(10);
  const g1 = await page();
  const back1 = t.waitForm(p);
  g1.answer("Link to the block");
  const after1 = await back1;
  t.log("after linking:", after1.title);
  t.check(after1.title.includes("Wall"), "the goal's page comes back after linking");
  t.check(t.messages(p).some((m) => /now collects into the container/.test(m.plain)), "linked");
  after1.answer(null);
  await t.wait(5);

  // Mark finished: the goals list comes back.
  const g2 = await page();
  const back2 = t.waitForm(p);
  g2.answer("Mark finished");
  const after2 = await back2;
  t.log("after finishing:", after2.title, after2.buttons);
  t.check(after2.title.includes("Community Goals"), "the goals list comes back after marking it finished");

  // Remove it (from Finished goals): the list comes back without it.
  const fin = t.waitForm(p);
  after2.answer("Finished goals");
  const f = await fin;
  const gp = t.waitForm(p);
  f.answer("Wall");
  const g3 = await gp;
  const sure = t.waitForm(p);
  g3.answer("Remove this goal");
  const s = await sure;
  const back3 = t.waitForm(p);
  s.answer("Remove it");
  const after3 = await back3;
  t.log("after removing:", after3.title, after3.buttons);
  t.check(after3.title.includes("Community Goals") && !after3.buttons.some((x) => /Wall|Finished/.test(x)), "the goals list comes back after removing, without it");
  after3.answer(null);
}
