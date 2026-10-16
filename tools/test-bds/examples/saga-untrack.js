// The story tracker lists every quest going: Ann is on "The Drowned Choir" (Drowned Bell) and accepts Old Tobin's
// "The One That Got Away" after it. The box follows the newest (Got Away, its step in white) and still lists the
// Drowned Bell under it, on one row with its own next step; tracking the Drowned Bell swaps them round.
//   node tools/test-bds/run.mjs --quiet --only saga_bp --scenario tools/test-bds/examples/saga-quest-log.js --timeout 300
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
  const ann = await t.player("Ann", { op: true });
  const send = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  const tracker = (since) => sides.filter((s) => s.tick >= since && s.m.player === ann.id && s.m.from === "saga" && s.m.slot === "right4").map((s) => String(s.m.text));
  /** Talks to an NPC (played by the scenario) and accepts what it offers. */
  async function accept(npc, key) {
    let next = t.waitForm(ann, { timeout: 300 });
    send("realm:npc_choose", { player: ann.id, npc, pack: "saga_bp", key });
    for (let k = 0; k < 20; k++) {
      const f = await next;
      const last = !f.buttons.includes("Next");
      if (!last) next = t.waitForm(ann, { timeout: 300 });
      f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept|Finish/.test(b))) : "Next");
      if (last) break;
    }
  }
  send("realm:saga_debug", { player: "Ann", action: "jump", story: "drowned_bell", chapter: "choir" });
  await t.wait(10);
  let since = t.tick;
  await accept("reyes", "start:drowned_bell");
  await t.waitMessage(ann, /The Drowned Bell: The Drowned Choir/, { since, timeout: 300 });
  since = t.tick;
  await accept("tobin", "start:one_that_got_away");
  await t.waitMessage(ann, /The One That Got Away/, { since, timeout: 300 });
  since = t.tick;
  const box = await t.waitUntil(() => tracker(since).find((s) => s.includes("Got Away") && s.includes("Drowned Bell")), { timeout: 80, message: `both quests in the box; wrote ${JSON.stringify(tracker(since))}` });
  t.log(`box: ${JSON.stringify(box)}`);
  const tracks = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:track") return;
    try {
      tracks.push({ tick: sys.currentTick, m: JSON.parse(message) });
    } catch {}
  }, { namespaces: ["realm"] });
  /** /realm:saga_log, pick a quest, press a button. */
  async function logPress(quest, button) {
    const f1 = t.waitForm(ann, { timeout: 200 });
    t.cmd(ann, "/realm:saga_log");
    const a = await f1;
    t.log(`log: ${JSON.stringify(a.buttons)}`);
    const f2 = t.waitForm(ann, { timeout: 200 });
    a.answer(a.buttons.find((b) => b.includes(quest)));
    const b = await f2;
    t.log(`page: ${JSON.stringify(b.buttons)}`);
    const f3 = t.waitForm(ann, { timeout: 200 });
    b.answer(b.buttons.find((x) => x.startsWith(button)));
    const c = await f3;
    t.log(`back on: ${JSON.stringify(c.buttons)}`);
    const f4 = t.waitForm(ann, { timeout: 200 });
    c.answer("OK");
    (await f4).answer("Back");
    await t.wait(5);
    return c;
  }
  await logPress("One That Got Away", "Stop tracking");
  since = t.tick;
  const box2 = await t.waitUntil(() => tracker(since).find((s) => s.includes("Drowned Bell")), { timeout: 80, message: `box after untrack; wrote ${JSON.stringify(tracker(since))}` });
  t.log(`box after untrack: ${JSON.stringify(box2)}`);
  t.check(!box2.includes("Got Away"), "Got Away is off the tracker");
  await t.wait(60);
  const last = tracks.filter((x) => x.m.player === ann.id).pop();
  t.log(`last track: ${JSON.stringify(last)}`);
  t.check(!String(last?.m.label ?? "").includes("Got Away"), "Minimap target not Got Away");
  const page = await logPress("Drowned", "Stop tracking");
  since = t.tick;
  await t.wait(80);
  const last2 = tracks.filter((x) => x.m.player === ann.id).pop();
  t.log(`after untracking both: ${JSON.stringify(last2)} boxes ${JSON.stringify(tracker(since))}`);
  t.check(last2 && last2.m.label === undefined, "no Minimap target with both untracked");
  await logPress("One That Got Away", "Track this quest");
  since = t.tick;
  const box3 = await t.waitUntil(() => tracker(since).find((s) => s.includes("Got Away")), { timeout: 80, message: `box after re-track; wrote ${JSON.stringify(tracker(since))}` });
  t.log(`box after re-track: ${JSON.stringify(box3)}`);
  t.check(!box3.includes("Drowned Bell"), "Drowned Bell still untracked");
}
