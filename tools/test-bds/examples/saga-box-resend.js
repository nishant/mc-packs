// Story Questlines' quest box is sent only when it changes (and again shortly before it runs out): a player standing
// still with a quest gets at most a couple of realm:side writes in 12 seconds (it was one every 2 seconds, each parsed by
// every side-box pack), and the box is taken down (an empty write) as soon as the quest is gone.
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-box-resend.js --timeout 300
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:side") return;
    try {
      sides.push({ tick: sys.currentTick, m: JSON.parse(message) });
    } catch {}
  }, { namespaces: ["realm"] });
  const send = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  t.server("/gamerule doDaylightCycle false");
  const ann = await t.player("Ann", { op: true });
  const box = (since) => sides.filter((s) => s.tick >= since && s.m.player === ann.id && s.m.from === "saga" && s.m.slot === "quest");
  let next = t.waitForm(ann, { timeout: 300 });
  send("realm:npc_choose", { player: ann.id, npc: "tobin", pack: "saga_bp", key: "start:one_that_got_away" });
  for (let k = 0; k < 20; k++) {
    const f = await next;
    const last = !f.buttons.includes("Next");
    if (!last) next = t.waitForm(ann, { timeout: 300 });
    f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))) : "Next");
    if (last) break;
  }
  await t.waitUntil(() => box(0).some((s) => /Got Away/.test(String(s.m.text))), { timeout: 200, message: "the quest box shows the quest" });
  await t.wait(40);
  const since = t.tick;
  await t.wait(240);
  const writes = box(since);
  t.log(`quest box writes in 12 s standing still: ${writes.length} (${JSON.stringify(writes.map((s) => s.m.ticks))})`);
  t.check(writes.length <= 2, `an unchanged quest box isn't sent every 2 seconds (${writes.length} writes in 12 s)`);
  const gone = t.tick;
  send("realm:saga_debug", { player: ann.id, action: "finish", story: "one_that_got_away" });
  await t.waitUntil(() => box(gone).some((s) => !s.m.text) || sides.some((s) => s.tick >= gone && s.m.player === ann.id && s.m.from === "saga" && s.m.slot === "" && !s.m.text), { timeout: 100, message: "the quest box is taken down when the quest is gone" });
  t.log("box taken down: OK");
}
