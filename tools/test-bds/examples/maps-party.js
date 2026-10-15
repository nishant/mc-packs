// Treasure Maps: party mates (the Parties pack's `realm_party:<code>` tag, set here directly) near the finder share
// the treasure: half its Crowns each by default (`partyShare`), on top of the finder's, plus the journal entry and
// Exploration XP. A player outside the party, or a mate too far away, gets nothing. The find goes through the pack's
// test hook (realm:maps_test from the console), since a whole hunt takes minutes (see maps-hunt.js for that).
// node tools/test-bds/run.mjs --quiet --only maps_bp --scenario tools/test-bds/examples/maps-party.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann", { op: true });
  const s = ann.location;
  const bob = await t.player("Bob", { x: s.x + 4, z: s.z });
  const cat = await t.player("Cat", { x: s.x - 4, z: s.z });
  const dan = await t.player("Dan", { x: s.x + 100, z: s.z });
  for (const p of [ann, bob, dan]) p.addTag("realm_party:TEST");
  const crowns = (who) => { try { return t.world.scoreboard.getObjective("crowns")?.getScore(who) ?? 0; } catch { return 0; } };
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:skill_xp" || id === "realm:journal") events.push({ id, m: JSON.parse(message) });
  }, { namespaces: ["realm"] });

  let since = t.tick;
  t.assert(t.cmd(ann, "/realm:maps_give Ann").ok, "maps_give ran");
  await t.waitMessage(ann, /treasure map|first clue/i, { since, timeout: 100 });
  await t.wait(10);
  since = t.tick;
  await t.console(`scriptevent realm:maps_test ${JSON.stringify({ action: "found", player: "Ann" })}`);
  const paid = await t.waitMessage(ann, /\+(\d+) Crowns \(Treasure map\)/, { since, timeout: 60 });
  const got = Number(/\+(\d+)/.exec(paid.plain)[1]);
  const bobMsg = await t.waitMessage(bob, /\+(\d+) Crowns \(Treasure map, with Ann\)/, { since, timeout: 60 });
  t.log(`Ann: ${paid.plain} / Bob: ${bobMsg.plain}`);
  t.check(Number(/\+(\d+)/.exec(bobMsg.plain)[1]) === Math.floor(got / 2), "Bob gets half of Ann's Crowns");
  t.check(crowns(bob) === Math.floor(got / 2) && crowns(ann) === got, `scores: Ann ${crowns(ann)}, Bob ${crowns(bob)}`);
  await t.wait(10);
  t.check(crowns(cat) === 0 && !t.messages(cat, { since }).some((m) => /treasure/i.test(m.plain)), "Cat, outside the party, gets nothing");
  t.check(crowns(dan) === 0, "Dan, 100 blocks away, gets nothing");
  t.check(events.some((e) => e.id === "realm:skill_xp" && e.m.player === bob.id), "Bob gets the Exploration XP");
  t.check(events.some((e) => e.id === "realm:journal" && e.m.player === bob.id), "Bob gets the journal entry");
}
