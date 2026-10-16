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
  const lines = box.split("\n");
  t.check(lines[0].replace(/§./g, "") === "Got Away", `the newest quest on top: ${JSON.stringify(lines[0])}`);
  t.check(lines[1].includes("Catch 8 fish"), `its step under it: ${JSON.stringify(lines[1])}`);
  t.check(lines.some((l) => l.startsWith("§3Drowned Bell§7: ") && /drowned|fishing/i.test(l)), `the Drowned Bell on its own row with its step: ${JSON.stringify(lines)}`);
  t.check(unescape(encodeURIComponent(box)).length <= 159, `fits the box (${unescape(encodeURIComponent(box)).length} bytes)`);
}
