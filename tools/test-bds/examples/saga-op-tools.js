// Story Questlines operator tools when the picked player leaves mid-menu. Run with
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-op-tools.js --timeout 300
// Checks: an operator opens /realm:saga > Operator tools > Finish a player's current step, picks a player on a
// chapter, and that player disconnects before the operator picks the chapter: the operator is told they left
// and the pack logs no error (it used to throw on the gone player and cache an empty save under their id).
// The story is driven without the Townsfolk pack: the scenario sends realm:npc_choose itself.
export default async function (t) {
  const sys = t.system;
  const op = await t.player("Op", { op: true, x: 170, z: 170 });
  const p = await t.player("Tester", { x: 163, z: 170 });

  // Tester accepts the prologue's first chapter (pages with Next, then Accept).
  for (let i = 0; i < 8; i++) t.answerForm(p, (f) => (f.buttons.some((b) => /Accept/.test(b)) ? "Accept" : "Next"));
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ player: p.id, npc: "tobin", pack: "saga_bp", key: "start:drowned_bell" }));
  await t.waitMessage(p, /Salt and Silence/, { timeout: 300 });

  let next = t.waitForm(op, { title: "Story Log" });
  t.assert(t.cmd(op, "/realm:saga").ok, "/realm:saga ran");
  let f = await next;
  next = t.waitForm(op, { title: "Operator tools" });
  f.answer("Operator tools");
  f = await next;
  next = t.waitForm(op, { title: "Finish a step" });
  f.answer("Finish a player");
  f = await next;
  t.assert(f.type === "modal", "player picker is a dropdown form");
  next = t.waitForm(op, { title: "Finish a step" });
  f.answer({ Player: "Tester" });
  f = await next;
  t.assert(f.buttons.some((b) => /Drowned Bell/.test(b)), `Tester's chapter is listed: ${JSON.stringify(f.buttons)}`);

  // Tester leaves while the operator reads the list.
  p.disconnect();
  await t.wait(10);
  const since = t.tick;
  f.answer(0);
  const told = await t.waitMessage(op, /left meanwhile/i, { since, timeout: 100 });
  t.log("operator told:", told.plain);
}
