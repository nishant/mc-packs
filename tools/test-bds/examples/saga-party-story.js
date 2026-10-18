// Story Questlines: Track this quest, and a party's shared main story (saga_bp party.js with party_bp's tags).
//   node tools/test-bds/run.mjs --quiet --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-party-story.js --timeout 600
// Checks:
// 1. Solo, the tracker follows the chapter accepted last; Track this quest (Current quests > the story) switches it.
// 2. A party works on one main-story chapter: Bob (no progress) joins Ann (on "Salt and Silence"): Bob helps with a party
//    quest, and what he does (talk to Reyes) counts for Ann. Ann's other main chapter (Last Map) waits.
// 3. Tracking in a party sets the party's tracked quest: Bob is told.
// 4. Once Bob accepts the same chapter, he gets the progress made so far, and Ann reaching the lighthouse finishes it for both;
//    Ann's report back counts for Bob too.
// 5. Cat (no progress) joins: the party goes back to her chapter; Ann can't start her next chapter, and Bob's help counts for Cat.
// 6. Counts add up: Ann 3 + Bob 4 drowned on "The Drowned Choir" is 7/12 for both.
// 7. Leaving the party or the others going offline gives a player their own story back.
// 8. A step that doesn't apply to a mate (an "either" way needing a pack that isn't installed) isn't shared to them.
//    (Ann accepts that chapter once for the party: Bob gets it without talking to Ida.)
// Also: tracking a daily favor stays personal.
// The story is driven without the Townsfolk pack: the scenario sends realm:npc_choose and realm:npc_talk itself.
export default async function (t) {
  const sys = t.system;
  const ann = await t.player("Ann", { op: true, x: 163, z: 170 });
  const bob = await t.player("Bob", { x: 165, z: 170 });
  const send = (id, msg) => sys.sendScriptEvent(id, JSON.stringify(msg));
  /** Starts or ends a chapter and answers its dialogue: Next through the pages, then Accept / Finish (or the first choice). */
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
  // The story tracker's quest box (realm:side from saga): its first line is the quest it follows ("Last Map: Pins in an Old Map"), other quests get a row each.
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:side") return;
    try {
      sides.push({ tick: sys.currentTick, m: JSON.parse(message) });
    } catch {}
  }, { namespaces: ["realm"] });
  const boxes = (p, since) => sides.filter((s) => s.tick >= since && s.m.player === p.id && s.m.from === "saga" && s.m.text).map((s) => String(s.m.text).replace(/§./g, ""));
  /** Did the tracker box follow this quest (its name on the first line) since a tick? */
  const trackerSays = (p, re, since) => boxes(p, since).some((b) => re.test(b.split("\n")[0]));
  /** Did the tracker box show this quest at all (on top or as another quest's row)? */
  const trackerLists = (p, re, since) => boxes(p, since).some((b) => re.test(b));

  // --- 1. Solo tracking --------------------------------------------------------------------------------------
  let since = t.tick;
  await choose(ann, "tobin", "start:drowned_bell");
  await t.waitMessage(ann, /The Drowned Bell: Salt and Silence/, { since, timeout: 300 });
  await t.wait(30);
  since = t.tick;
  await choose(ann, "mara", "start:last_map");
  await t.waitMessage(ann, /Pins in an Old Map/, { since, timeout: 300 });
  await t.waitUntil(() => trackerSays(ann, /^Last Map:/, since), { timeout: 200, message: "the tracker follows the newest chapter (Last Map)" });

  const trackFromMenu = async (p) => {
    t.answerForm(p, "Current quests", "Drowned Bell", (f) => f.buttons.findIndex((b) => /Track/.test(b)), "OK", "Back", "Close");
    t.assert(t.cmd(p, "/realm:saga").ok, "/realm:saga ran");
  };
  since = t.tick;
  await trackFromMenu(ann);
  await t.waitMessage(ann, /Tracking The Drowned Bell/, { since, timeout: 300 });
  const tracked = t.tick;
  await t.waitUntil(() => trackerSays(ann, /^Drowned Bell:/, tracked), { timeout: 200, message: "the tracker follows the tracked quest" });
  t.log("1. solo tracking: OK");

  // --- 2. Party: Bob (no progress) joins Ann -----------------------------------------------------------------
  since = t.tick;
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite ran");
  await t.waitMessage(bob, /Ann invited you/, { since });
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept ran");
  const m1 = await t.waitMessage(bob, /Party story: The Drowned Bell, "Salt and Silence"/, { since, timeout: 200 });
  t.log("Bob told:", m1.plain);
  await t.waitMessage(ann, /Party story: The Drowned Bell, "Salt and Silence"/, { since, timeout: 200 });

  // Bob hasn't accepted the chapter: he helps. Talking to Reyes counts for Ann.
  since = t.tick;
  send("realm:npc_talk", { player: bob.id, npc: "reyes" });
  await t.waitMessage(ann, /Ask Warden Reyes what the night watch heard: done/, { since, timeout: 100 });
  t.log("2. a helper's step counts for the mate: OK");

  // Ann's Last Map chapter waits: her tracker never shows it while in the party.
  since = t.tick;
  await t.wait(80);
  t.check(!trackerLists(ann, /Last Map/, since), "Ann's other main chapter (Last Map) waits in the party");

  // --- 3. Tracking in a party --------------------------------------------------------------------------------
  since = t.tick;
  await trackFromMenu(ann);
  await t.waitMessage(bob, /Ann set the party's tracked quest: The Drowned Bell\./, { since, timeout: 300 });
  t.log("3. party tracking: OK");

  // A daily favor is personal: tracking it doesn't touch the party.
  await t.wait(40); // the story log menu has closed
  since = t.tick;
  await choose(ann, "tobin", "fvstart:tobin");
  await t.waitMessage(ann, /Daily favor for Old Tobin/, { since, timeout: 200 });
  since = t.tick;
  t.answerForm(ann, "Current quests", "Daily favor", (f) => f.buttons.findIndex((b) => /Track/.test(b)), "Back", "Close");
  t.assert(t.cmd(ann, "/realm:saga").ok, "/realm:saga ran");
  await t.waitMessage(ann, /Tracking Daily favor for Old Tobin/, { since, timeout: 300 });
  await t.wait(40);
  t.check(!t.messages(bob, { since }).some((m) => /tracked quest/.test(m.plain)), "a favor's tracking stays Ann's own");
  t.log("3b. favor tracking is personal: OK");

  // --- 4. Bob accepts the same chapter: progress so far, then shared ---------------------------------------
  since = t.tick;
  await choose(bob, "tobin", "start:drowned_bell");
  await t.waitMessage(bob, /Ask Warden Reyes what the night watch heard: done/, { since, timeout: 300 });
  since = t.tick;
  t.assert(t.cmd(ann, "/realm:saga_place lighthouse").ok, "saga_place ran");
  await t.waitMessage(bob, /"Salt and Silence" is done\. Go back to/, { since, timeout: 200 });
  await t.waitMessage(ann, /"Salt and Silence" is done\. Go back to/, { since, timeout: 200 });
  t.log("4. shared chapter finished for both: OK");
  since = t.tick;
  await choose(ann, "tobin", "end:drowned_bell");
  await t.waitMessage(ann, /Chapter complete: Salt and Silence/, { since, timeout: 300 });
  // Ann's report counts for Bob too (he finished it as well): no second trip to Tobin.
  await t.waitMessage(bob, /Chapter complete: Salt and Silence/, { since, timeout: 100 });

  // --- 5. Cat (no progress) joins: the party goes back to her chapter -------------------------------------
  const cat = await t.player("Cat", { x: 161, z: 170 });
  since = t.tick;
  t.assert(t.cmd(ann, "/realm:party_invite Cat").ok, "invite Cat ran");
  await t.waitMessage(cat, /Ann invited you/, { since });
  t.assert(t.cmd(cat, "/realm:party_accept").ok, "Cat's accept ran");
  await t.waitMessage(ann, /Party story: The Drowned Bell, "Salt and Silence", where Cat is/, { since, timeout: 200 });
  await t.waitMessage(bob, /where Cat is/, { since, timeout: 200 });
  since = t.tick;
  send("realm:npc_choose", { player: ann.id, npc: "reyes", pack: "saga_bp", key: "start:drowned_bell" });
  await t.waitMessage(ann, /Your party is on The Drowned Bell, "Salt and Silence"/, { since, timeout: 200 });
  t.log("5a. Ann's next chapter waits for Cat: OK");
  since = t.tick;
  await choose(cat, "tobin", "start:drowned_bell");
  await t.waitMessage(cat, /The Drowned Bell: Salt and Silence/, { since, timeout: 300 });
  // Ann stands at the lighthouse: her help reaches it for Cat. Reyes wasn't asked yet in Cat's chapter.
  await t.waitMessage(cat, /Climb to the lighthouse: done/, { since, timeout: 100 });
  await t.wait(30);
  t.check(!t.messages(cat, { since }).some((m) => /Ask Warden Reyes what the night watch heard: done/.test(m.plain)), "Cat's chapter starts from her own progress");
  since = t.tick;
  send("realm:npc_talk", { player: bob.id, npc: "reyes" });
  await t.waitMessage(cat, /Ask Warden Reyes what the night watch heard: done/, { since, timeout: 100 });
  t.log("5b. Bob's help counts for Cat: OK");

  // --- 7a. Cat leaves: her own story again; Ann and Bob move on together ------------------------------------
  since = t.tick;
  t.cmd(cat, "/realm:party_leave");
  await t.waitMessage(cat, /Your own story counts again/, { since, timeout: 200 });
  await t.waitMessage(ann, /Party story: The Drowned Bell, "The Drowned Choir"/, { since, timeout: 200 });
  t.log("7a. leaving the party: OK");

  // --- 6. Counts add up ---------------------------------------------------------------------------------------
  since = t.tick;
  await choose(ann, "reyes", "start:drowned_bell");
  await t.waitMessage(ann, /The Drowned Bell: The Drowned Choir/, { since, timeout: 300 });
  await t.wait(30);
  since = t.tick;
  send("realm:saga_debug", { player: "Ann", action: "bump", story: "drowned_bell", i: 0, n: 3 });
  send("realm:saga_debug", { player: "Bob", action: "bump", story: "drowned_bell", i: 0, n: 4 });
  // The tracker box counts down: 7 of 12 reads "Defeat 5 more drowned" (cut to "Defeat 5 more..." on the row of a quest not on top: Ann tracks her favor).
  const says7 = (p) => trackerLists(p, /Defeat 5 more/, since);
  for (let k = 0; k < 100 && !(says7(ann) && says7(bob)); k++) await t.wait(1);
  t.assert(says7(ann) && says7(bob), `3 + 4 drowned is 7/12 for both Ann and Bob (Ann: ${JSON.stringify(boxes(ann, since).slice(-1))}, Bob: ${JSON.stringify(boxes(bob, since).slice(-1))})`);
  t.log("6. counts add up: OK");

  // --- 8. A step that doesn't apply to a mate never reaches them -------------------------------------------
  // Act III "Echoes in Crystal": the expedition way (only with expedition_bp, not installed here) is an "either"
  // with the echo shards and sets shards:"depths". Bob's gets done; Ann's must not (nor her flag), the stealth step is shared.
  for (const who of ["Ann", "Bob"]) for (const story of ["drowned_bell", "last_map", "act1_signs", "act2_choir"]) send("realm:saga_debug", { player: who, action: "finish", story });
  await t.wait(40);
  since = t.tick;
  // Ann accepts it once for the party: Bob gets it too, with no trip to Ida.
  await choose(ann, "ida", "start:act3_deep");
  await t.waitMessage(ann, /Act III|Echoes in Crystal/, { since, timeout: 300 });
  await t.waitMessage(bob, /Ann accepted .*Echoes in Crystal.* for the party/, { since, timeout: 100 });
  await t.wait(30);
  since = t.tick;
  send("realm:saga_debug", { player: "Bob", action: "bump", story: "act3_deep", i: 2, n: 1 });
  send("realm:saga_debug", { player: "Bob", action: "bump", story: "act3_deep", i: 0, n: 1 });
  await t.waitMessage(ann, /Sneak past the Choir diggers to their dig at the mine: done/, { since, timeout: 100 });
  await t.wait(40);
  t.check(!t.messages(ann, { since }).some((m) => /Clear the Sculk Depths expedition/.test(m.plain)), "a step that doesn't apply to Ann isn't shared to her");
  t.log("8. or/when steps stay with whoever they apply to: OK");

  // --- 7b. Bob goes offline: Ann's own story again -----------------------------------------------------------
  since = t.tick;
  bob.disconnect();
  await t.waitMessage(ann, /Your own story counts again/, { since, timeout: 200 });
  t.log("7b. a mate offline: OK");
}
