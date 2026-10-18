// Story Questlines 1.16.0: the tracker's quest box (Side HUD's "quest" segment, next to the box the player picked),
// and a party sharing every step, items to have on you too.
//   node tools/test-bds/run.mjs --quiet --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-quest-box.js --timeout 600
// Checks:
// 1. The box: the quest and chapter, "Steps, in any order:", a checklist row per step, the party line; sent as slot
//    "quest" starting with the questCode of Right 4 (the default), within 511 bytes and 10 rows of 32 characters.
// 2. A party: Ann accepts "Pins in an Old Map" once for both; only Ann carries a compass and 8 paper, and the steps
//    are done for Bob too; Ann's report counts for Bob (no second trip to Mara), and both move on together.
// 3. A vigil at the wrong time of day says what it waits for: "wait for nightfall (in about N min)".
export default async function (t) {
  const sys = t.system;
  const ann = await t.player("Ann", { op: true, x: 163, z: 170 });
  const bob = await t.player("Bob", { x: 165, z: 170 });
  const send = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  const choose = async (p, npc, key) => {
    let next = t.waitForm(p, { timeout: 300 });
    send("realm:npc_choose", { player: p.id, npc, pack: "saga_bp", key });
    for (let k = 0; k < 20; k++) {
      const f = await next;
      const last = !f.buttons.includes("Next");
      if (!last) next = t.waitForm(p, { timeout: 300 });
      f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept|Finish/.test(b))) : "Next");
      if (last) return;
    }
  };
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:side") return;
    try {
      sides.push({ tick: sys.currentTick, m: JSON.parse(message) });
    } catch {}
  }, { namespaces: ["realm"] });
  const raw = (p, since) => sides.filter((s) => s.tick >= since && s.m.player === p.id && s.m.from === "saga" && s.m.text).map((s) => s.m);
  const boxes = (p, since) => raw(p, since).map((m) => String(m.text).replace(/§./g, ""));
  const last = (p, since) => boxes(p, since).at(-1) ?? "";

  // Both past the first main chapter, so the party's chapter is Last Map's first.
  for (const who of ["Ann", "Bob"]) send("realm:saga_debug", { player: who, action: "finish", story: "drowned_bell" });
  let since = t.tick;
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite ran");
  await t.waitMessage(bob, /Ann invited you/, { since });
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept ran");
  await t.waitMessage(bob, /Party story: The Cartographer's Last Map/, { since, timeout: 200 });

  since = t.tick;
  await choose(ann, "mara", "start:last_map");
  await t.waitMessage(ann, /Accepted for your party too: Bob/, { since, timeout: 300 });
  await t.waitUntil(() => /Steps, in any order/.test(last(bob, since)) && /Steps, in any order/.test(last(ann, since)), { timeout: 200, message: "both quest boxes up" });
  const box = last(ann, since);
  t.log(`Ann's box:\n${box}`);
  t.log(`Bob's box:\n${last(bob, since)}`);
  const m = raw(ann, since).at(-1);
  t.check(m.slot === "quest", `sent as the quest segment (${m.slot})`);
  t.check(String(m.text).startsWith("§s§q§4"), "with Right 4's questCode");
  t.check(/^Last Map: Pins in an Old Map/.test(box), "quest and chapter on the first line");
  t.check(/\[[ >]\] Have a compass/.test(box) && /\[[ >]\] Have 8 paper/.test(box), "a checklist row for each step");
  t.check(/Party: all progress shared with Bob/.test(box) && /Party: all progress shared with Ann/.test(last(bob, since)), "the party line names who shares it");
  const utf8 = (s) => [...s].reduce((n, ch) => { const c = ch.codePointAt(0); return n + (c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4); }, 0);
  const fits = (b) => b.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 32)), 0) <= 10;
  t.check(raw(ann, since).every((x) => utf8(String(x.text)) <= 511) && boxes(ann, since).every(fits), "every box within 511 bytes and 10 rows");

  // Only Ann carries the items: the steps are done for both.
  since = t.tick;
  t.assert(t.cmd(ann, "/give @s compass 1").ok && t.cmd(ann, "/give @s paper 8").ok, "Ann gets a compass and 8 paper");
  await t.waitMessage(bob, /Have a compass: done/, { since, timeout: 100 });
  await t.waitMessage(bob, /"Pins in an Old Map" is done/, { since, timeout: 100 });
  await t.waitUntil(() => /report to Mara/i.test(last(bob, since)), { timeout: 100, message: "Bob's box says report to Mara" });
  t.log(`Bob's box when done:\n${last(bob, since)}`);
  t.check(/\[x\] Have a compass/.test(last(bob, since)), "done steps are checked off");

  since = t.tick;
  await choose(ann, "mara", "end:last_map");
  await t.waitMessage(ann, /Chapter complete: Pins in an Old Map/, { since, timeout: 300 });
  await t.waitMessage(bob, /Chapter complete: Pins in an Old Map/, { since, timeout: 100 });
  t.log("2. one report for both: OK");

  // Mara tells the next chapter straight on; accepting it takes Bob along.
  await t.waitMessage(ann, /Three Pins/, { since, timeout: 300 }).catch(() => undefined);
  await t.wait(40);
  since = t.tick;
  await t.waitUntil(() => /Three Pins/.test(last(bob, since)), { timeout: 200, message: "Bob is on Three Pins too" }).catch(async () => {
    await choose(ann, "mara", "start:last_map");
    await t.waitUntil(() => /Three Pins/.test(last(bob, since)), { timeout: 200, message: "Bob is on Three Pins too" });
  });
  t.log(`Bob's box on Three Pins:\n${last(bob, since)}`);
  t.check(/Steps, in any order/.test(last(bob, since)), "three pins in any order");

  // 3. A vigil at the wrong time: Signs in the Sky's lighthouse watch at noon.
  for (const who of ["Ann", "Bob"]) send("realm:saga_debug", { player: who, action: "finish", story: "last_map" });
  t.assert(t.cmd(ann, "/realm:saga_place lighthouse").ok, "lighthouse placed");
  t.cmd(ann, "/time set noon");
  await t.wait(40);
  since = t.tick;
  await choose(ann, "sol", "start:act1_signs");
  await t.waitUntil(() => /wait for nightfall \(in about \d+ min\)/.test(boxes(ann, since).join("\n")), { timeout: 200, message: "the vigil says it waits for nightfall" });
  t.log(`Ann's box at noon:\n${last(ann, since)}`);
}
