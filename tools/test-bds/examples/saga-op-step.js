// Story Questlines: an operator finishes a stuck player's current step with /realm:saga_step (F47: there was no way to
// skip a stuck step without /scriptevent and cheats).
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-op-step.js --timeout 400
// Checks: for Bob on "Song in the Dark" it finishes "Creep close to the Gray Ring" (the step
// after it comes next) and tells both; with a side story going too, it finishes the main story's step without a story
// named, and the side story's with it named;
// a party quest a member only helps with isn't theirs to finish.
export default async function (t) {
  const sys = t.system;
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  t.server("/time set noon");
  const ann = await t.player("Ann", { op: true });
  const bob = await t.player("Bob");
  const take = async (p, npc, story) => {
    const w = (async () => {
      for (;;) {
        const f = await t.waitForm(p, { timeout: 200 });
        if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
        else return f.answer(Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))));
      }
    })();
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc, req: `r${p.name}${npc}` }));
    await t.wait(4);
    sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: `start:${story}` }));
    await w;
    await t.wait(10);
  };
  for (const story of ["drowned_bell", "last_map"]) debug(bob, { action: "finish", story });
  debug(bob, { action: "jump", story: "act1_signs", chapter: "song" });
  await t.wait(5);
  await take(bob, "wren", "act1_signs");
  debug(bob, { action: "bump", story: "act1_signs", i: 0, n: 1 });
  await t.wait(10);

  // (Operators only: the command is registered at GameDirectors, which the game enforces; a simulated player's
  // runCommand skips that check, so it isn't tested here.)
  let since;

  // Bob's only chapter: its current step.
  since = t.tick;
  t.assert(t.cmd(ann, "/realm:saga_step Bob").ok, "an operator runs /realm:saga_step Bob");
  await t.waitMessage(bob, /Creep close to the Gray Ring without being seen: done/, { since, timeout: 40 });
  await t.waitMessage(bob, /An operator finished your step "Creep close to the Gray Ring without being seen"/, { since, timeout: 40 });
  await t.waitMessage(ann, /Finished Bob's step "Creep close to the Gray Ring without being seen" in Signs in the Sky/, { since, timeout: 40 });
  await t.waitMessage(bob, /Next: Listen to the Cantor/, { since, timeout: 40 });

  // A side story too: without a story it asks which; with one, it finishes that one's step.
  debug(bob, { action: "jump", story: "graveyard_shift", chapter: "dead_drunk" });
  await t.wait(5);
  await take(bob, "moss", "graveyard_shift");
  since = t.tick;
  t.assert(t.cmd(ann, "/realm:saga_step Bob").ok, "without a story");
  await t.waitMessage(ann, /Finished Bob's step "Listen to the Cantor" in Signs in the Sky/, { since, timeout: 40 });
  await t.wait(10);
  t.check(!t.messages(bob, { since }).some((m) => /Walk Barnaby Pike home to the lighthouse: done/.test(m.plain)), "without a story, only the main story's step");
  since = t.tick;
  t.assert(t.cmd(ann, "/realm:saga_step Bob graveyard_shift").ok, "with a story");
  await t.waitMessage(bob, /Walk Barnaby Pike home to the lighthouse: done/, { since, timeout: 40 });
  await t.wait(10);

  // A helper's party quest isn't theirs to finish.
  for (const story of ["drowned_bell", "last_map", "act1_signs"]) debug(ann, { action: "finish", story });
  await t.wait(5);
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite");
  await t.waitMessage(bob, /Ann invited you/);
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept");
  await t.waitMessage(ann, /Party story: Signs in the Sky, "Song in the Dark"/, { timeout: 100 });
  since = t.tick;
  t.assert(t.cmd(ann, "/realm:saga_step Ann act1_signs").ok, "on the helper");
  await t.waitMessage(ann, /Ann has no chapter of act1_signs going/, { since, timeout: 40 });
  await t.wait(10);
  t.check(!t.messages(bob, { since }).some((m) => /Listen to the Cantor: done/.test(m.plain)), "a helper's party quest is not finished for the party");
}
