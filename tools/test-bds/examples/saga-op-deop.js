// Story Questlines operator tools check operator rights again on the press, not only when the menu opened: an operator
// opens /realm:saga > Operator tools > Reset a player's stories, picks Tester, loses operator rights while the "Reset
// stories?" question is open, then presses Reset: nothing is reset and they are told why. The same for a story place's
// page (/realm:saga_places): Remove after losing rights removes nothing.
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-op-deop.js --timeout 300
export default async function (t) {
  const sys = t.system;
  const op = await t.player("Op", { op: true, x: 170, z: 170 });
  const p = await t.player("Tester", { x: 163, z: 170 });

  // Tester accepts the prologue's first chapter (pages with Next, then Accept).
  for (let i = 0; i < 8; i++) t.answerForm(p, (f) => (f.buttons.some((b) => /Accept/.test(b)) ? "Accept" : "Next"));
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ player: p.id, npc: "tobin", pack: "saga_bp", key: "start:drowned_bell" }));
  await t.waitMessage(p, /Salt and Silence/, { timeout: 300 });
  await t.wait(10);
  // Dynamic properties are per pack: Tester's quests are read from /realm:saga_log, the places from /realm:saga_place.
  const onQuest = async () => {
    const f = t.waitForm(p, { title: "Current quests", timeout: 100 });
    t.cmd(p, "/realm:saga_log");
    const g = await f.catch(() => undefined);
    g?.answer(g.buttons.length - 1);
    return !!g?.buttons.some((b) => /Drowned Bell/.test(b));
  };
  const lighthouseSet = async () => {
    const since = t.tick;
    t.cmd(op, "/realm:saga_place");
    const m = await t.waitMessage(op, /Story places/, { since, timeout: 60 });
    return /lighthouse[^\n]*in the Overworld/i.test(m.plain);
  };
  t.check(await onQuest(), "Tester is on The Drowned Bell");

  let next = t.waitForm(op, { title: "Story Log" });
  t.assert(t.cmd(op, "/realm:saga").ok, "/realm:saga ran");
  let f = await next;
  next = t.waitForm(op, { title: "Operator tools" });
  f.answer("Operator tools");
  f = await next;
  next = t.waitForm(op, { title: "Reset stories" });
  f.answer("Reset a player");
  f = await next;
  next = t.waitForm(op, { title: "Reset stories?" });
  f.answer({ Player: "Tester" });
  f = await next;
  // Rights taken away while the question is open.
  t.deop(op);
  let since = t.tick;
  f.answer("Reset");
  t.check(!!(await t.waitMessage(op, /Only operators/, { since, timeout: 100 }).catch(() => undefined)), "the operator is told only operators can reset");
  await t.wait(10);
  t.check(!t.messages(p, { since }).some((m) => /stories were reset/.test(m.plain)), "Tester was not told of a reset");
  t.check(await onQuest(), "Tester's stories were not reset");

  // A story place: set one as an operator, open its page, lose rights, press Remove.
  t.op(op);
  t.assert(t.cmd(op, "/realm:saga_place lighthouse").ok, "set the lighthouse");
  await t.wait(10);
  next = t.waitForm(op, { title: "Story places" });
  t.assert(t.cmd(op, "/realm:saga_places").ok, "/realm:saga_places ran");
  f = await next;
  next = t.waitForm(op, { title: "Story place" });
  f.answer(f.buttons.findIndex((b) => /Lighthouse/i.test(b)));
  f = await next;
  t.deop(op);
  since = t.tick;
  f.answer("Remove");
  // Before the fix the "Are you sure?" question came and Yes removed the place.
  const sure = t.waitForm(op, { title: "Are you sure?", timeout: 40 }).then((g) => (g.answer("Yes"), true)).catch(() => false);
  await t.waitMessage(op, /Only operators/, { since, timeout: 100 }).catch(() => undefined);
  const asked = await sure;
  await t.wait(10);
  t.check(!asked, "no Remove question after losing rights");
  t.op(op);
  t.check(await lighthouseSet(), "the lighthouse is still set");
}
