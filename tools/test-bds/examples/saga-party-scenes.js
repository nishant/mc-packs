// Story Questlines: a party shares one scene per place and step for the steps that put characters in the world (the
// "solo" steps of F47 besides stealth): one escorted character, one defense with one ward and one set of waves, one story
// character to meet, instead of one each standing in the same spot.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-party-scenes.js --timeout 900
// A. Escort (side story "Graveyard Shift", "Dead Drunk", party sharing): Bob and Cat both on it: one Barnaby Pike waits
//    at the graveyard; he follows Bob; when he is safe at the lighthouse the step is done for Bob and for Cat beside them.
// B. Defend (Act I "Report or Pursue", the party story): Bob and Cat on it, Ann helping: one Brother Hollis and one first
//    wave (3 vindicators, not 3 each); beating it counts for Bob and Cat.
// C. Meet (Act I "Fenn's Second Map", another party): Dan and Eve on it: one Fenn's echo; Dan's talk finishes it for both,
//    and the echo goes after.
export default async function (t) {
  const sys = t.system;
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  const s = t.world.getDefaultSpawnLocation();
  const G = { x: s.x + 60, z: s.z }; // the Old Graveyard
  const L = { x: s.x + 60, z: s.z + 40 }; // the Lighthouse
  const C = { x: s.x - 70, z: s.z }; // the Old Chapel
  const O = { x: s.x, z: s.z - 90 }; // the Stargazer's Ruin
  for (const at of [G, L, C, O]) await t.loadArea(at.x, at.z, { radius: 3 });
  const ann = await t.player("Ann", { op: true, x: s.x, z: s.z });
  const bob = await t.player("Bob", { x: s.x + 1, z: s.z });
  const cat = await t.player("Cat", { x: s.x - 1, z: s.z });
  const y = ann.location.y;
  const at = (p, x, z) => p.teleport({ x: x + 0.5, y, z: z + 0.5 });
  for (const [name, spot] of [["graveyard", G], ["lighthouse", L], ["old_chapel", C], ["observatory", O]]) {
    at(ann, spot.x, spot.z);
    await t.wait(5);
    t.assert(t.cmd(ann, `/realm:saga_place ${name}`).ok, `set ${name}`);
    await t.wait(3);
  }
  at(ann, s.x, s.z);
  /** Answers a dialogue: Next through the pages, then `last` (a label regex) or the first button. */
  const pages = async (p, last) => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 300 });
      if (f.buttons.some((b) => /^next$/i.test(b))) {
        f.answer("Next");
        continue;
      }
      return f.answer(Math.max(0, f.buttons.findIndex((b) => last.test(b))));
    }
  };
  /** Takes a story's offered chapter from its NPC. */
  const take = async (p, npc, story) => {
    const w = pages(p, /Accept/);
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc, req: `r${p.name}${npc}` }));
    await t.wait(4);
    sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: `start:${story}` }));
    await w;
    await t.wait(10);
  };
  const actorsNamed = (re) => t.dimension.getEntities({ tags: ["saga:actor"] }).filter((e) => e.isValid && re.test(String(e.nameTag ?? "")));
  const party = async (lead, ...mates) => {
    for (const m of mates) {
      t.assert(t.cmd(lead, `/realm:party_invite ${m.name}`).ok, `invite ${m.name}`);
      await t.waitMessage(m, new RegExp(`${lead.name} invited you`));
      t.assert(t.cmd(m, "/realm:party_accept").ok, `${m.name} accepts`);
      await t.wait(10);
    }
  };

  // --- A. Escort ---------------------------------------------------------------------------------------------
  for (const p of [bob, cat]) {
    debug(p, { action: "jump", story: "graveyard_shift", chapter: "dead_drunk" });
    await t.wait(5);
    await take(p, "moss", "graveyard_shift");
  }
  await party(ann, bob, cat);
  let since = t.tick;
  at(bob, G.x - 6, G.z);
  at(cat, G.x - 6, G.z + 2);
  for (const p of [bob, cat]) await t.waitMessage(p, /Barnaby Pike is waiting for you/, { since, timeout: 100 });
  await t.wait(40);
  t.check(actorsNamed(/Barnaby Pike/).length === 1, `one Barnaby Pike for the party (${actorsNamed(/Barnaby Pike/).length})`);
  const barnaby = actorsNamed(/Barnaby Pike/)[0];
  t.assert(barnaby, "Barnaby is there");
  since = t.tick;
  bob.teleport({ x: barnaby.location.x + 1.5, y, z: barnaby.location.z });
  await t.waitMessage(bob, /Barnaby Pike follows you/, { since, timeout: 60 });
  // Bob walks him to the lighthouse, 2 blocks at a time; Cat comes along.
  for (let k = 1; k <= 25; k++) {
    const px = G.x + 1 + (L.x - G.x) * (k / 25);
    const pz = G.z + (L.z - G.z + 4) * (k / 25);
    bob.teleport({ x: px + 0.5, y, z: pz + 0.5 });
    cat.teleport({ x: px - 2.5, y, z: pz - 2.5 });
    await t.wait(12);
  }
  for (const p of [bob, cat]) await t.waitMessage(p, /Walk Barnaby Pike home to the lighthouse: done/, { since, timeout: 400 });
  t.log("A. one escort for the party, done for both: OK");

  // --- B. Defend -----------------------------------------------------------------------------------------------
  for (const p of [ann, bob, cat]) for (const story of ["drowned_bell", "last_map"]) debug(p, { action: "finish", story });
  debug(ann, { action: "finish", story: "act1_signs" });
  since = t.tick;
  for (const p of [bob, cat]) debug(p, { action: "jump", story: "act1_signs", chapter: "choice" });
  await t.waitMessage(bob, /Party story: Signs in the Sky, "Report or Pursue"/, { since, timeout: 100 });
  since = t.tick;
  await take(bob, "hollis", "act1_signs");
  await t.waitMessage(cat, /Bob accepted .*Report or Pursue.* for the party/, { since, timeout: 200 });
  await t.wait(40);
  since = t.tick;
  for (const [k, p] of [ann, bob, cat].entries()) at(p, C.x + k, C.z + 2);
  for (const p of [bob, cat]) await t.waitMessage(p, /Hold (the )?Old Chapel!/, { since, timeout: 100 });
  await t.wait(25);
  const wards = actorsNamed(/Brother Hollis/);
  t.check(wards.length === 1, `one Brother Hollis to defend for the party (${wards.length})`);
  const adds = () => t.dimension.getEntities({ tags: ["saga:add"] }).filter((e) => e.isValid);
  await t.waitUntil(() => adds().length >= 3, { timeout: 200, message: "the first wave comes" });
  await t.wait(10);
  t.check(adds().length === 3, `one first wave of 3 for the party, not 3 each (${adds().length})`);
  since = t.tick;
  for (const e of adds()) e.applyDamage(500, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: bob });
  for (const p of [bob, cat]) await t.waitMessage(p, /Wave 1 beaten/, { since, timeout: 100 });
  t.log("B. one defense for the party, its waves count for both: OK");
  for (const p of [ann, bob, cat]) at(p, s.x, s.z);
  t.cmd(bob, "/realm:party_leave");
  t.cmd(cat, "/realm:party_leave");
  await t.wait(40);

  // --- C. Meet -------------------------------------------------------------------------------------------------
  const dan = await t.player("Dan", { x: s.x, z: s.z + 3 });
  const eve = await t.player("Eve", { x: s.x, z: s.z - 3 });
  for (const p of [dan, eve]) {
    for (const story of ["drowned_bell", "last_map"]) debug(p, { action: "finish", story });
    debug(p, { action: "jump", story: "act1_signs", chapter: "echo" });
    await t.wait(5);
  }
  await t.wait(10);
  await take(dan, "mara", "act1_signs");
  await take(eve, "mara", "act1_signs");
  for (const p of [dan, eve]) for (const i of [0, 1]) debug(p, { action: "bump", story: "act1_signs", i, n: 1 });
  await t.wait(10);
  since = t.tick;
  await party(dan, eve);
  await t.waitMessage(eve, /Party story: Signs in the Sky, "Fenn's Second Map"/, { since, timeout: 200 });
  since = t.tick;
  at(dan, O.x + 20, O.z);
  at(eve, O.x + 22, O.z);
  for (const p of [dan, eve]) await t.waitMessage(p, /Fenn's echo is here/, { since, timeout: 100 });
  await t.wait(20);
  t.check(actorsNamed(/Fenn's echo/).length === 1, `one Fenn's echo for the party (${actorsNamed(/Fenn's echo/).length})`);
  const echo = actorsNamed(/Fenn's echo/)[0];
  since = t.tick;
  const talk = pages(dan, /Goodbye/);
  dan.teleport({ x: echo.location.x + 1, y: echo.location.y, z: echo.location.z });
  await talk;
  for (const p of [dan, eve]) await t.waitMessage(p, /Listen to Fenn's echo: done/, { since, timeout: 100 });
  await t.waitUntil(() => actorsNamed(/Fenn's echo/).length === 0, { timeout: 300, message: "the echo goes once nobody needs it" });
  t.log("C. one character to meet for the party: OK");
}
