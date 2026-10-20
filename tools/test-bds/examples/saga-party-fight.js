// Story Questlines: a party fighting a `defeat` with `spawn` together shares one group of story mobs (F63), and only
// story mobs spawned for a player's (or their party's) own step count toward it (F62). Act II "The Pattern", "Fight off
// the Choir ambush at the Haddock farm" (defeat 6, `spawn` 3 alive at a time, topped up every 20 s).
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-party-fight.js --timeout 600
// Checks:
// 1. Ann, Bob and Cat (one party, all on the step) at the farm: one group of 3 comes, never more (before: 3 each, 9).
// 2. Ann's kills count for the whole party (the party story shares them).
// 3. Dan (no party, on the same step, 5 of 6 done) kills one of the party's mobs far from the farm: it doesn't count for
//    him (before: any story mob counted for any defeat-with-spawn step, wherever and whoever it was spawned for).
// 4. Dan at the farm gets his own group; killing one of his own finishes his step.
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
  const cat = await t.player("Cat", { x: s.x - 1, z: s.z });
  const dan = await t.player("Dan", { x: s.x, z: s.z + 2 });
  const all = [ann, bob, cat, dan];
  for (const p of all) {
    p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
    p.addEffect("regeneration", 20000, { amplifier: 4, showParticles: false });
  }
  await t.wait(20);
  /** Takes "The Pattern" (Act II) from Reyes, the farms searched: the fight is next. */
  const onFight = async (p) => {
    for (const story of ["drowned_bell", "last_map"]) debug(p, { action: "finish", story });
    debug(p, { action: "finish", story: "act1_signs", flags: { "act1:path": "wardens" } });
    await t.wait(5);
    debug(p, { action: "jump", story: "act2_choir", chapter: "pattern" });
    await t.wait(5);
    const accept = (async () => {
      for (;;) {
        const f = await t.waitForm(p, { timeout: 200 });
        if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
        else return f.answer(Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))));
      }
    })();
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "reyes", req: `r${p.name}` }));
    await t.wait(4);
    sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:act2_choir" }));
    await accept;
    await t.wait(10);
    for (const i of [0, 1, 2]) debug(p, { action: "bump", story: "act2_choir", i, n: 1e9 });
    await t.wait(10);
  };
  for (const p of all) await onFight(p);
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite Bob");
  await t.waitMessage(bob, /Ann invited you/);
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "Bob accepts");
  t.assert(t.cmd(ann, "/realm:party_invite Cat").ok, "invite Cat");
  await t.waitMessage(cat, /Ann invited you/);
  t.assert(t.cmd(cat, "/realm:party_accept").ok, "Cat accepts");
  await t.waitMessage(cat, /Party story: The Gray Choir, "The Pattern"/, { timeout: 200 });

  /** Story mobs (saga:add) alive. */
  const adds = () => t.dimension.getEntities({ tags: ["saga:add"] }).filter((e) => e.isValid);
  // --- 1. One group for the party -----------------------------------------------------------------------------
  let since = t.tick;
  for (const [k, p] of [ann, bob, cat].entries()) p.teleport({ x: FX + 0.5 + k, y: p.location.y, z: FZ + 0.5 });
  for (const p of [ann, bob, cat]) await t.waitMessage(p, /Gray hoods rise out of the wheat/, { since, timeout: 100 });
  await t.waitUntil(() => adds().length >= 3, { timeout: 100, message: "the party's group comes" });
  let most = 0;
  for (let k = 0; k < 60; k++) {
    most = Math.max(most, adds().length);
    await t.wait(1);
  }
  t.check(most === 3, `one group of 3 for a party of 3 on the step, not one each (most alive: ${most})`);

  // --- 2 and 3. Kills: the party's own count for every mate; Dan's kill of a party mob counts for nobody ---------
  const kill = (e, by) => e.applyDamage(500, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: by });
  debug(dan, { action: "bump", story: "act2_choir", i: 3, n: 5 });
  await t.wait(10);
  since = t.tick;
  for (const e of adds()) kill(e, ann); // 3 of 6 for the party
  await t.waitUntil(() => adds().length >= 3, { timeout: 500, message: "the party's group is topped up to 3 after 20 s" });
  most = 0;
  for (let k = 0; k < 40; k++) {
    most = Math.max(most, adds().length);
    await t.wait(1);
  }
  t.check(most === 3, `the top-up is one group of 3 too (most alive: ${most})`);
  const [b1, d1, c1] = adds();
  kill(b1, bob); // 4 of 6
  kill(d1, dan); // the party's mob, killed by Dan far from the farm: counts for nobody
  kill(c1, cat); // 5 of 6
  await t.seconds(3);
  t.check(!t.messages(dan, { since }).some((m) => /Fight off the Choir ambush at the Haddock farm: done/.test(m.plain)), "a mob spawned for the party's step doesn't count for Dan's step");
  t.check(![ann, bob, cat].some((p) => t.messages(p, { since }).some((m) => /Fight off the Choir ambush at the Haddock farm: done/.test(m.plain))), "Dan's kill doesn't count for the party either (5 of 6)");
  // The last one comes alone (never more than are left) and finishes the step for all three.
  await t.waitUntil(() => adds().length >= 1, { timeout: 500, message: "the last one comes" });
  await t.wait(20);
  t.check(adds().length === 1, `only as many come as are left (${adds().length})`);
  kill(adds()[0], ann);
  for (const p of [ann, bob, cat]) await t.waitMessage(p, /Fight off the Choir ambush at the Haddock farm: done/, { since, timeout: 100 });
  t.log("1-3. one group for the party, its kills shared, Dan's kill of theirs not counted: OK");

  // --- 4. Dan's own group: his kill counts ------------------------------------------------------------------------
  since = t.tick;
  dan.teleport({ x: FX - 20.5, y: dan.location.y, z: FZ + 20.5 });
  await t.waitMessage(dan, /Gray hoods rise out of the wheat/, { since, timeout: 100 });
  // His own group: tagged with his owner tag (saga:o:<hash of his id>, actors.js), not the party's.
  const danTag = `saga:o:${fnv(dan.id).toString(36)}`;
  let mine;
  await t.waitUntil(() => (mine = adds().find((e) => e.hasTag(danTag))), { timeout: 100, message: "Dan's own group comes" });
  since = t.tick;
  kill(mine, dan);
  await t.waitMessage(dan, /Fight off the Choir ambush at the Haddock farm: done/, { since, timeout: 100 });
  t.log("4. Dan's own mob counts: OK");

}

/** FNV-1a, as saga_bp util.js hash(). @param {string} str */
function fnv(str) {
  let h = 0x811c9dc5;
  for (let k = 0; k < str.length; k++) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
