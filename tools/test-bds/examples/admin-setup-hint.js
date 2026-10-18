// Realm Configuration (admin_bp), first run on a new world: an operator's first Realm Configuration item comes with
// one chat line that points to Operator Tools' server setup checklist; players who aren't operators don't get it,
// and an operator gets it once (not again after a rejoin or a second item).
//   node tools/test-bds/run.mjs --quiet --only admin_bp --scenario tools/test-bds/examples/admin-setup-hint.js --timeout 300
export default async function (t) {
  const guest = await t.player("Guest");
  const op = await t.player("Boss", { op: true });
  await t.wait(70); // the item is handed out 40 ticks after spawn
  const hint = (p) => t.messages(p, { kind: "chat", pack: "admin_bp" }).filter((m) => /setup checklist/i.test(m.plain));
  t.check(hint(op).length === 1, `the operator hears about the setup checklist once (${hint(op).length})`);
  t.check(hint(op).every((m) => /Operator Tools/.test(m.plain)), `it says where it is (${hint(op)[0]?.plain})`);
  t.check(hint(guest).length === 0, `the player who isn't an operator doesn't (${hint(guest).length})`);

  // Lose the item and get a new one: no second hint.
  const inv = op.getComponent("inventory").container;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.getLore().length) inv.setItem(i, undefined);
  await t.wait(5);
  t.assert(t.cmd(op, "/realm:admin_item").ok, "/realm:admin_item ran");
  await t.waitMessage(op, /You have the Realm Configuration item/, { pack: "admin_bp", since: t.tick - 5 });
  await t.wait(5);
  t.check(hint(op).length === 1, `still one hint after a second item (${hint(op).length})`);
}
