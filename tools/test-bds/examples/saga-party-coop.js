// Story Questlines, co-op: a party accepts and reports back once, and follows side stories together (saga_bp with party_bp).
//   node tools/test-bds/run.mjs --quiet --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-party-coop.js --timeout 600
// Checks:
// 1. Accept once: Ann accepts the party's chapter ("Salt and Silence") at Old Tobin. Bob listens in (a popup with the
//    intro and the steps while she talks), then gets it accepted with no NPC trip: chat says so with the steps, and Old
//    Tobin no longer offers Bob a start. Ann is told it was accepted for Bob too.
// 2. Report once: the shared chapter done, Ann reports back; Bob listens in, gets "Chapter complete" and his own reward,
//    and is on the next chapter (Reyes offers him "The Drowned Choir").
// 3. A choice made in the report counts for everyone: Ann picks "Recast the bell" at Ida; Bob is told, and his own intro
//    of the next chapter is the "recast" one. Ann says Not now to that intro: Bob is told it isn't taken on yet, then
//    Bob accepts it and it's accepted for Ann.
// 4. Side stories: Bob starts Old Tobin's "The One That Got Away"; Ann gets a "Join?" popup and joins.
//    Both trackers keep the party's main chapter on top (Drowned Bell) with Got Away listed under it.
// 5. Bob reports Got Away while Ann still has a step left: Ann is told what's left, reports herself later, accepts the
//    next chapter, and Bob says Not now to her invite (chat tells him he can start it any time).
// The story is driven without the Townsfolk pack: the scenario sends realm:npc_choose and realm:npc_talk itself.
export default async function (t) {
  const sys = t.system;
  const ann = await t.player("Ann", { op: true, x: 163, z: 170 });
  const bob = await t.player("Bob", { x: 165, z: 170 });
  const send = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));

  /** @type {Map<string, string[]>} */
  const offers = new Map();
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        const m = JSON.parse(message);
        if (id === "realm:npc_offer") offers.set(m.req, [...(offers.get(m.req) ?? []), m.key]);
        if (id === "realm:side") sides.push({ tick: sys.currentTick, m });
      } catch {}
    },
    { namespaces: ["realm"] }
  );
  let reqs = 0;
  /** What saga_bp offers a player at an NPC (keys like start:drowned_bell, info:..., end:...). */
  const offersAt = async (p, npc) => {
    const req = `coop${++reqs}`;
    send("realm:npc_talk", { player: p.id, npc, req });
    await t.wait(10);
    return offers.get(req) ?? [];
  };
  const boxes = (p, since) => sides.filter((s) => s.tick >= since && s.m.player === p.id && s.m.from === "saga" && s.m.text).map((s) => String(s.m.text).replace(/§./g, ""));

  /**
   * Starts or ends a chapter and answers its dialogue: Next through the pages, then `pick` on the last (default Accept /
   * Finish / the first choice). `then`: the answer for a dialogue that follows right away (the next chapter's intro).
   * Returns every page seen.
   */
  const choose = async (p, npc, key, pick, then) => {
    const seen = [];
    let next = t.waitForm(p, { timeout: 300 });
    send("realm:npc_choose", { player: p.id, npc, pack: "saga_bp", key });
    for (let k = 0; k < 20; k++) {
      const f = await next;
      seen.push(f);
      const last = !f.buttons.includes("Next");
      if (!last || then) next = t.waitForm(p, { timeout: 300 });
      f.answer(last ? (pick ?? Math.max(0, f.buttons.findIndex((b) => /Accept|Finish/.test(b)))) : "Next");
      if (last) break;
    }
    if (then) {
      for (let k = 0; k < 20; k++) {
        const f = await next;
        seen.push(f);
        // A choice's reply (one OK page) comes before the next chapter's intro.
        const reply = f.buttons.length === 1 && f.buttons[0] === "OK";
        const last = !reply && !f.buttons.includes("Next");
        if (!last) next = t.waitForm(p, { timeout: 300 });
        f.answer(reply ? "OK" : last ? then : "Next");
        if (last) break;
      }
    }
    return seen;
  };

  // --- Party up ---------------------------------------------------------------------------------------------
  let since = t.tick;
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite ran");
  await t.waitMessage(bob, /Ann invited you/, { since });
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept ran");
  await t.waitMessage(bob, /Party story: The Drowned Bell, "Salt and Silence".*starts for the whole party/, { since, timeout: 200 });

  // --- 1. Accept once -----------------------------------------------------------------------------------------
  since = t.tick;
  const bobPopup = t.waitForm(bob, { timeout: 300 });
  await choose(ann, "tobin", "start:drowned_bell");
  const pop = await bobPopup;
  t.log("Bob's popup:", pop.title, pop.body.slice(0, 120).replace(/\n/g, " | "));
  t.check(/Ann is talking to Old Tobin/.test(pop.body) && /Climb to the lighthouse/.test(pop.body), "Bob listens in: the intro and the steps");
  await t.waitMessage(bob, /Ann accepted The Drowned Bell, "Salt and Silence" for the party/, { since, timeout: 100 });
  await t.waitMessage(bob, /Climb to the lighthouse/, { since, timeout: 100 });
  await t.waitMessage(ann, /Accepted for your party too: Bob/, { since, timeout: 100 });
  const o1 = await offersAt(bob, "tobin");
  t.check(o1.includes("info:drowned_bell") && !o1.includes("start:drowned_bell"), `Bob has the chapter without talking to Tobin (offers: ${o1})`);
  t.log("1. accept once: OK");

  // --- 2. Report once -----------------------------------------------------------------------------------------
  since = t.tick;
  send("realm:npc_talk", { player: bob.id, npc: "reyes" });
  t.assert(t.cmd(ann, "/realm:saga_place lighthouse").ok, "saga_place ran");
  await t.waitMessage(bob, /"Salt and Silence" is done\. Go back to/, { since, timeout: 200 });
  await t.waitMessage(ann, /"Salt and Silence" is done\. Go back to/, { since, timeout: 200 });
  await t.wait(110); // Bob's popup from 1 has been closed by the harness
  since = t.tick;
  const bobPopup2 = t.waitForm(bob, { timeout: 300 });
  await choose(ann, "tobin", "end:drowned_bell");
  const pop2 = await bobPopup2;
  t.check(/Ann is reporting back to Old Tobin/.test(pop2.body), `Bob listens in to the report: ${pop2.body.slice(0, 80)}`);
  await t.waitMessage(bob, /Ann reported back to Old Tobin for the party/, { since, timeout: 100 });
  await t.waitMessage(bob, /Chapter complete: Salt and Silence/, { since, timeout: 100 });
  await t.waitMessage(ann, /It counts for Bob too/, { since, timeout: 100 });
  const o2 = await offersAt(bob, "reyes");
  t.check(o2.includes("start:drowned_bell"), `Bob is on the next chapter: Reyes offers it (offers: ${o2})`);
  t.check(!(await offersAt(bob, "tobin")).some((k) => k.startsWith("end:")), "Bob has nothing left to report");
  t.log("2. report once: OK");

  // --- 3. A report's choice counts for everyone ---------------------------------------------------------------
  for (const who of ["Ann", "Bob"]) send("realm:saga_debug", { player: who, action: "jump", story: "drowned_bell", chapter: "iron" });
  await t.wait(110);
  since = t.tick;
  await choose(ann, "ida", "start:drowned_bell");
  await t.waitMessage(bob, /Ann accepted The Drowned Bell, .* for the party/, { since, timeout: 100 });
  send("realm:saga_debug", { player: "Ann", action: "bump", story: "drowned_bell", i: 0, n: 24 });
  send("realm:saga_debug", { player: "Ann", action: "bump", story: "drowned_bell", i: 1, n: 12 });
  await t.waitMessage(bob, /is done\. Go back to/, { since, timeout: 200 });
  await t.wait(110);
  since = t.tick;
  // Ann recasts the bell, then says Not now to the next chapter's intro (Ida tells it right away).
  await choose(ann, "ida", "end:drowned_bell", "Recast", "Not now");
  await t.waitMessage(bob, /Ann reported back to Ida.* for the party and chose: Recast the bell/, { since, timeout: 100 });
  await t.waitMessage(bob, /Ann didn't take on .* yet/, { since, timeout: 300 });
  await t.wait(110);
  since = t.tick;
  const bobIntro = await choose(bob, "ida", "start:drowned_bell");
  t.check(bobIntro.some((f) => /clapper/.test(f.body)), "Bob's own intro is the recast one (Ann's choice set his flag)");
  await t.waitMessage(ann, /Bob accepted The Drowned Bell, .* for the party/, { since, timeout: 100 });
  t.log("3. a report's choice counts for the party: OK");

  // --- 4. Side stories: join, and the trackers ----------------------------------------------------------------
  await t.wait(110);
  since = t.tick;
  t.answerForm(ann, "Join");
  await choose(bob, "tobin", "start:one_that_got_away");
  await t.waitMessage(ann, /Bob started The One That Got Away/, { since, timeout: 100 });
  await t.waitMessage(ann, /You joined Bob: The One That Got Away/, { since, timeout: 200 });
  await t.waitMessage(bob, /Ann joined The One That Got Away/, { since, timeout: 100 });
  const o4 = await offersAt(ann, "tobin");
  t.check(o4.includes("info:one_that_got_away"), `Ann has Got Away (offers: ${o4})`);
  since = t.tick;
  await t.waitUntil(() => [ann, bob].every((p) => boxes(p, since).some((b) => /^Drowned Bell:/.test(b.split("\n")[0]) && b.includes("Got Away"))), {
    timeout: 200,
    message: `both trackers follow the party chapter with Got Away under it (Bob: ${JSON.stringify(boxes(bob, since).slice(-1))})`,
  });
  t.log("4. side story joined, trackers agree: OK");

  // --- 5. A side report with a mate not done yet; a declined invite -------------------------------------------
  send("realm:saga_debug", { player: "Bob", action: "bump", story: "one_that_got_away", i: 0, n: 8 });
  send("realm:saga_debug", { player: "Bob", action: "bump", story: "one_that_got_away", i: 1, n: 1 });
  await t.waitMessage(bob, /"A Fish This Big" is done/, { timeout: 200 });
  // Fish caught away from each other aren't shared: Ann's talk to Elsie is still to do.
  send("realm:saga_debug", { player: "Ann", action: "bump", story: "one_that_got_away", i: 0, n: 8 });
  await t.wait(30);
  since = t.tick;
  await choose(bob, "tobin", "end:one_that_got_away", undefined, "Not now");
  await t.waitMessage(ann, /Bob reported back to Old Tobin on "A Fish This Big"\. Your part isn't done yet: Ask Elsie/, { since, timeout: 100 });
  await t.wait(110);
  send("realm:saga_debug", { player: "Ann", action: "bump", story: "one_that_got_away", i: 1, n: 1 });
  await t.waitMessage(ann, /"A Fish This Big" is done/, { since, timeout: 200 });
  since = t.tick;
  t.answerForm(bob, "Not now");
  await choose(ann, "tobin", "end:one_that_got_away", undefined, "Accept");
  await t.waitMessage(ann, /Chapter complete: A Fish This Big/, { since, timeout: 100 });
  await t.waitMessage(bob, /Ann started The One That Got Away/, { since, timeout: 300 });
  await t.waitMessage(bob, /Not now: Old Tobin can start The One That Got Away for you any time/, { since, timeout: 200 });
  t.log("5. side report with a mate not done, declined invite: OK");
}
