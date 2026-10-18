// Story Questlines "items to have" (collect) steps are counted when the inventory changes, not by reading the whole
// inventory every second: a compass given counts within a second or two, and paper given in two goes (3, then 5 more
// a few seconds later, when nothing else changed meanwhile) finishes "Have 8 paper" just as fast. Mara's "Pins in an Old
// Map" (last_map).
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-collect-count.js --timeout 300
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
  const ann = await t.player("Ann", { op: true });
  const box = (since) => sides.filter((s) => s.tick >= since && s.m.player === ann.id && s.m.from === "saga" && s.m.slot === "quest").map((s) => String(s.m.text).replace(/§./g, ""));
  let next = t.waitForm(ann, { timeout: 300 });
  send("realm:npc_choose", { player: ann.id, npc: "mara", pack: "saga_bp", key: "start:last_map" });
  for (let k = 0; k < 20; k++) {
    const f = await next;
    const last = !f.buttons.includes("Next");
    if (!last) next = t.waitForm(ann, { timeout: 300 });
    f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))) : "Next");
    if (last) break;
  }
  await t.waitMessage(ann, /Pins in an Old Map/, { timeout: 300 });
  await t.wait(60);
  let since = t.tick;
  t.assert(t.cmd(ann, "/give @s compass 1").ok, "Ann gets a compass");
  await t.waitMessage(ann, /Have a compass: done/, { since, timeout: 50 });
  t.log(`counted after ${t.tick - since} ticks`);
  since = t.tick;
  t.assert(t.cmd(ann, "/give @s paper 3").ok, "Ann gets 3 paper");
  await t.wait(100);
  t.check(!t.messages(ann, { since }).some((m) => /Have 8 paper: done/.test(m.plain)), "3 paper isn't 8");
  since = t.tick;
  t.assert(t.cmd(ann, "/give @s paper 5").ok, "and 5 more");
  await t.waitMessage(ann, /Have 8 paper: done/, { since, timeout: 50 });
  t.log(`8 paper counted after ${t.tick - since} ticks`);
}
