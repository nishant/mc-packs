// Community Goals: an operator mistypes the item in the Add a goal form; the form comes back with what was typed
// and the error, the fix is accepted, and donating the whole amount finishes the goal with one announcement.
// Run with: node tools/test-bds/run.mjs --quiet --only goals_bp --scenario tools/test-bds/examples/goals-add-form.js --timeout 600
export default async function (t) {
  const p = await t.player("Op", { op: true });
  const at = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  t.dimension.getBlock(at).setType("minecraft:chest");
  await t.wait(2);
  p.lookAtBlock(at);
  await t.wait(5);

  const menu = t.waitForm(p);
  t.cmd(p, "/realm:goals");
  const m = await menu;
  const add = t.waitForm(p);
  m.answer("Add a goal");
  const f1 = await add;
  t.assert(f1.type === "modal", `add form is modal (got ${f1.type} ${f1.title})`);
  const again = t.waitForm(p);
  f1.answer({ "Item id": "cobblestonee", Amount: "100", Name: "Wall" });
  const f2 = await again;
  const values = f2.elements.filter((e) => e.kind === "textField").map((e) => e.default);
  const label = f2.elements.find((e) => e.kind === "label")?.text ?? "";
  t.log("second form:", JSON.stringify(values), label);
  t.check(f2.type === "modal" && /Unknown item "cobblestonee"/.test(label), "form shown again with the error");
  t.check(values[1] === "100" && values[2] === "Wall", "typed amount and name kept");
  const added = t.waitMessage(p, /Goal Wall added/i, { pack: "goals_bp" });
  f2.answer({ "Item id": "cobblestone" });
  await added;

  // Donate exactly the target: one "reached" announcement.
  p.giveItem(new t.mc.ItemStack("minecraft:cobblestone", 64), false);
  p.giveItem(new t.mc.ItemStack("minecraft:cobblestone", 64), false);
  await t.wait(2);
  const list = t.waitForm(p);
  t.cmd(p, "/realm:goals");
  const l = await list;
  const page = t.waitForm(p);
  l.answer("Wall");
  const g = await page;
  const back = t.waitForm(p);
  g.answer("Donate");
  const after = await back;
  after.answer(null);
  await t.wait(5);
  const reached = t.messages(p).filter((x) => /reached/.test(x.plain));
  t.log("reached messages:", reached.length, reached[0]?.plain);
  t.check(reached.length === 1, "goal reached announced once");
  t.check(t.messages(p).some((x) => /You gave 100 Cobblestone/.test(x.plain)), "100 given");
}
