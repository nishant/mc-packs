// Crowns and Slot Machine (crowns_bp, slots_bp): an operator de-opped while an operator form is open can't submit
// it. Give Crowns gives nothing; the slot machine's Give a Slot Machine gives no item; both say why. An operator
// still can.
// node tools/test-bds/run.mjs --quiet --only crowns_bp,slots_bp --scenario tools/test-bds/examples/crowns-deop-form.js
// Before the fix the de-opped player got the Crowns and the Slot Machine.
export default async function (t) {
  const p = await t.player("Mod", { op: true });
  await t.wait(20);
  const balance = () => {
    try {
      return t.world.scoreboard.getObjective("crowns")?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  const machines = () => {
    const c = p.getComponent("minecraft:inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) if (/slot machine/i.test(c.getItem(i)?.nameTag ?? "")) n += c.getItem(i).amount;
    return n;
  };

  // Give Crowns: the form opens while an operator, the player is de-opped, then submits.
  t.answerForm(p, "Give Crowns");
  const give = t.waitForm(p, { title: "Give Crowns", timeout: 100 });
  t.cmd(p, "/realm:crowns");
  const form = await give;
  t.deop(p);
  const since = t.tick;
  form.answer({ Player: "Mod", Amount: "1000" });
  const said = await t.waitMessage(p, /Only operators|\+1,?000/, { timeout: 60, since });
  t.log(said.plain);
  t.check(balance() === 0 && /Only operators can give Crowns/.test(said.plain), `a de-opped player's Give Crowns gives nothing (balance ${balance()})`);

  // The same as an operator works.
  t.op(p);
  const had = balance();
  t.answerForm(p, "Give Crowns", { Player: "Mod", Amount: "1000" });
  t.cmd(p, "/realm:crowns");
  await t.waitUntil(() => balance() === had + 1000, { timeout: 100, message: "an operator's Give Crowns gives" });

  // Slot Machine: Give a player a Slot Machine item, de-opped before submitting.
  t.answerForm(p, "Operator tools", "Give a player a Slot Machine");
  const slot = t.waitForm(p, { title: "Give a Slot Machine", timeout: 100 });
  t.cmd(p, "/realm:slots");
  const slotForm = await slot;
  t.deop(p);
  const since2 = t.tick;
  slotForm.answer({ Player: "Mod" });
  const said2 = await t.waitMessage(p, /Only operators|Slot Machine/, { timeout: 60, since: since2 });
  t.log(said2.plain);
  await t.wait(5);
  t.check(machines() === 0 && /Only operators/.test(said2.plain), `a de-opped player gets no Slot Machine (${machines()})`);
}
