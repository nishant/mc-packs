// Story Questlines: a party mate helping with a fight (their party quest) keeps its group of story mobs while the mate
// who needs the step is elsewhere. Act II "The Pattern", "Fight off the Choir ambush at the Haddock farm" (defeat 6,
// `spawn` 3 alive at a time, topped up every 20 s).
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-party-fight-helper.js --timeout 400
// Ann is on the step and stays in town; Bob is past the chapter (he helps) and goes to the farm alone.
// Check: Bob's group comes once and stays for 15 s: the same 3 mobs, one warning and one horn. Before, the party's
// shared scene was kept only by mates who needed the step, so every ~2 s it was dropped (its mobs vanished) and a new
// group came at once with the warning again.
export default async function (t) {
  const sys = t.system;
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  const s = t.world.getDefaultSpawnLocation();
  const FX = s.x + 70, FZ = s.z - 260; // FARM_3, inside the 300-block knee: not scaled
  await t.loadArea(FX, FZ, { radius: 2 });
  const ann = await t.player("Ann", { op: true, x: s.x, z: s.z });
  const bob = await t.player("Bob", { x: s.x + 1, z: s.z });
  for (const p of [ann, bob]) {
    p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
    p.addEffect("regeneration", 20000, { amplifier: 4, showParticles: false });
  }
  await t.wait(20);
  // Ann takes "The Pattern" from Reyes, the farms searched: the fight is next.
  for (const story of ["drowned_bell", "last_map"]) debug(ann, { action: "finish", story });
  debug(ann, { action: "finish", story: "act1_signs", flags: { "act1:path": "wardens" } });
  await t.wait(5);
  debug(ann, { action: "jump", story: "act2_choir", chapter: "pattern" });
  await t.wait(5);
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(ann, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer(Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))));
    }
  })();
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: ann.id, npc: "reyes", req: "rAnn" }));
  await t.wait(4);
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: ann.id, key: "start:act2_choir" }));
  await accept;
  await t.wait(10);
  for (const i of [0, 1, 2]) debug(ann, { action: "bump", story: "act2_choir", i, n: 1e9 });
  // Bob is past it (the next chapter): he helps with the party's chapter.
  for (const story of ["drowned_bell", "last_map"]) debug(bob, { action: "finish", story });
  debug(bob, { action: "finish", story: "act1_signs", flags: { "act1:path": "wardens" } });
  await t.wait(5);
  debug(bob, { action: "jump", story: "act2_choir", chapter: "pip" });
  await t.wait(10);
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite Bob");
  await t.waitMessage(bob, /Ann invited you/);
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "Bob accepts");
  await t.waitMessage(bob, /Party story: The Gray Choir, "The Pattern"/, { timeout: 200 });

  /** Story mobs (saga:add) alive. */
  const adds = () => t.dimension.getEntities({ tags: ["saga:add"] }).filter((e) => e.isValid);
  const warnRe = /Gray hoods rise out of the wheat/;
  const since = t.tick;
  bob.teleport({ x: FX + 0.5, y: bob.location.y, z: FZ + 0.5 });
  await t.waitMessage(bob, warnRe, { since, timeout: 100 });
  await t.waitUntil(() => adds().length >= 3, { timeout: 100, message: "Bob's group comes" });
  const first = new Set(adds().map((e) => e.id));
  /** Every story mob seen in the 15 s. */
  const seen = new Set(first);
  let fewest = 3;
  for (let k = 0; k < 300; k++) {
    for (const e of adds()) seen.add(e.id);
    fewest = Math.min(fewest, adds().length);
    await t.wait(1);
  }
  const warnings = t.messages(bob, { since }).filter((m) => warnRe.test(m.plain)).length;
  t.check(fewest === 3, `Bob's group stays while Ann is in town (fewest alive: ${fewest})`);
  t.check(seen.size === 3 && adds().every((e) => first.has(e.id)), `the same 3 mobs all along, no new group (${seen.size} seen)`);
  t.check(warnings === 1, `one warning for Bob, not one per new group (${warnings})`);
  t.check(!t.messages(ann, { since }).some((m) => warnRe.test(m.plain)), "Ann in town isn't warned");
  t.log("the helper alone keeps the party's fight: OK");
}
