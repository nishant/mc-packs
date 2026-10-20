// Story Questlines: a party catches up at the Gray Ring together (F47). Act I "Song in the Dark": "Creep close to the
// Gray Ring without being seen" (stealth, 4 Gray Choir watchers, radius 48), then "Listen to the Cantor" (a vision).
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-party-stealth.js --timeout 900
// Case A, a party of 3: Ann finished the chapter (she helps: a party quest), Bob and Cat are on the step.
// 1. The watchers are posted once for the party: 4, not a set per mate.
// 2. No watcher snaps back more than 3 times in 2 minutes while the party waits near the ring (they walk their rounds
//    a step every tick; before, they were teleported every 5 ticks while the vanilla AI nudged them in between).
// 3. A watcher who sees Bob sends him back to the edge (and the party is told); one who sees Ann, the helper, sends her
//    back too (before: helpers were invisible to the scene).
// 4. Ann at the goal finishes nothing (a helper can't finish it for others).
// 5. Bob sneaks into the ring: the step is done for Bob and Cat, and the vision plays for both of them.
// Case B, Eve alone after the party's run (and after walking away once): her own watchers come (4), see her, and she
//    finishes the step in the ring and hears the Cantor.
export default async function (t) {
  const sys = t.system;
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  const s = t.world.getDefaultSpawnLocation();
  const R = { x: s.x + 120, z: s.z }; // the Gray Ring
  await t.loadArea(R.x, R.z, { radius: 4 });
  const ann = await t.player("Ann", { op: true, x: s.x, z: s.z });
  const bob = await t.player("Bob", { x: s.x + 1, z: s.z });
  const cat = await t.player("Cat", { x: s.x - 1, z: s.z });
  const y = ann.location.y;
  for (const p of [ann, bob, cat]) p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  ann.teleport({ x: R.x + 0.5, y, z: R.z + 0.5 });
  await t.wait(5);
  t.assert(t.cmd(ann, "/realm:saga_place choir_ring").ok, "set the Gray Ring");
  await t.wait(5);
  ann.teleport({ x: s.x + 0.5, y, z: s.z + 0.5 });

  /** Puts a player on "Song in the Dark" with the pale light followed: the stealth step is next. */
  const onStep = async (p) => {
    for (const story of ["drowned_bell", "last_map"]) debug(p, { action: "finish", story });
    debug(p, { action: "jump", story: "act1_signs", chapter: "song" });
    await t.wait(5);
    const accept = (async () => {
      for (;;) {
        const f = await t.waitForm(p, { timeout: 200 });
        if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
        else return f.answer(Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))));
      }
    })();
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "wren", req: `r${p.name}` }));
    await t.wait(4);
    sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:act1_signs" }));
    await accept;
    await t.wait(10);
    debug(p, { action: "bump", story: "act1_signs", i: 0, n: 1 });
    await t.wait(5);
  };
  for (const p of [bob, cat]) await onStep(p);
  // Ann finished it (and the prologue): she is past the party's chapter.
  for (const story of ["drowned_bell", "last_map"]) debug(ann, { action: "finish", story });
  debug(ann, { action: "jump", story: "act1_signs", chapter: "choice" });
  await t.wait(10);
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite Bob");
  await t.waitMessage(bob, /Ann invited you/);
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "Bob accepts");
  t.assert(t.cmd(ann, "/realm:party_invite Cat").ok, "invite Cat");
  await t.waitMessage(cat, /Ann invited you/);
  t.assert(t.cmd(cat, "/realm:party_accept").ok, "Cat accepts");
  await t.waitMessage(ann, /Party story: Signs in the Sky, "Song in the Dark", where .* Help out/, { timeout: 200 });

  /** Story guards at the ring. */
  const guards = () => t.dimension.getEntities({ type: "minecraft:vindicator", tags: ["saga:actor"] }).filter((e) => e.isValid && Math.hypot(e.location.x - R.x, e.location.z - R.z) < 60);
  const fromRing = (p) => Math.hypot(p.location.x - R.x, p.location.z - R.z);

  // --- 1. One set of watchers for the party ------------------------------------------------------------------
  // Just outside the 48-block area, sneaking: near enough for the watchers to be posted, too far to be seen.
  for (const [k, p] of [[0, ann], [2, bob], [-2, cat]]) {
    p.isSneaking = true;
    p.teleport({ x: R.x - 52 + 0.5, y, z: R.z + k + 0.5 });
  }
  await t.waitUntil(() => guards().length >= 4, { timeout: 100, message: "the watchers are posted" });
  await t.wait(40);
  t.check(guards().length === 4, `one set of 4 watchers for the party, not one per mate (${guards().length})`);

  // --- 2. Watchers don't rubber-band -------------------------------------------------------------------------
  /** Per guard: positions each tick for 2 minutes. A snap back is a tick whose step goes against one of the 3 before. */
  /** @type {Map<string, { x: number, z: number }[]>} */
  const traces = new Map();
  for (let k = 0; k < 2400; k++) {
    for (const g of guards()) {
      const a = traces.get(g.id) ?? [];
      a.push({ x: g.location.x, z: g.location.z });
      traces.set(g.id, a);
    }
    await t.wait(1);
  }
  let worst = 0;
  for (const [id, a] of traces) {
    let back = 0;
    for (let k = 1; k < a.length; k++) {
      const v = { x: a[k].x - a[k - 1].x, z: a[k].z - a[k - 1].z };
      const lv = Math.hypot(v.x, v.z);
      if (lv < 0.02) continue;
      for (let j = Math.max(1, k - 3); j < k; j++) {
        const u = { x: a[j].x - a[j - 1].x, z: a[j].z - a[j - 1].z };
        const lu = Math.hypot(u.x, u.z);
        if (lu >= 0.02 && (u.x * v.x + u.z * v.z) / (lu * lv) < -0.3) {
          back++;
          break;
        }
      }
    }
    t.log(`watcher ${id}: ${back} snaps back in ${a.length} ticks`);
    worst = Math.max(worst, back);
  }
  t.check(traces.size === 4 && worst <= 3, `no watcher snaps back more than 3 times in 2 minutes (worst: ${worst}, watchers traced: ${traces.size})`);

  // --- 3. Spotted: a mate and the helper are each sent back -------------------------------------------------
  /** Stands a player right beside a watcher (closer than 1.8 blocks: seen whichever way it faces). */
  const besideGuard = (p) => {
    const g = guards()[0];
    p.isSneaking = false;
    p.teleport({ x: g.location.x + 1, y: g.location.y, z: g.location.z });
  };
  let since = t.tick;
  besideGuard(bob);
  await t.waitMessage(bob, /Gray Choir watcher spotted you!/, { since, timeout: 60 });
  await t.wait(5);
  t.check(fromRing(bob) >= 50, `Bob is back at the edge (${fromRing(bob).toFixed(1)} blocks from the ring)`);
  await t.waitMessage(cat, /spotted Bob, who slipped back to the edge/, { since, timeout: 20 });
  since = t.tick;
  besideGuard(ann);
  await t.waitMessage(ann, /Gray Choir watcher spotted you!/, { since, timeout: 60 });
  await t.wait(5);
  t.check(fromRing(ann) >= 50, `Ann, the helper, is back at the edge too (${fromRing(ann).toFixed(1)} blocks from the ring)`);
  await t.waitMessage(bob, /spotted Ann, who slipped back to the edge/, { since, timeout: 20 });
  t.log("3. spotted and sent back, mate and helper: OK");

  // --- 4. The helper at the goal finishes nothing ------------------------------------------------------------
  // Brought into the ring by an operator (not walking past the watchers); sneaking, so the nearest can't see her.
  since = t.tick;
  ann.isSneaking = true;
  ann.teleport({ x: R.x + 0.5, y, z: R.z - 2.5 });
  await t.seconds(3);
  const doneRe = /Creep close to the Gray Ring without being seen: done/;
  t.check(![ann, bob, cat].some((p) => t.messages(p, { since }).some((m) => doneRe.test(m.plain))), "the helper in the ring finishes nothing for her mates");
  ann.teleport({ x: R.x - 52 + 0.5, y, z: R.z + 0.5 });

  // --- 5. Bob sneaks into the ring: done for both mates, the vision plays for both ----------------------------
  since = t.tick;
  for (const p of [bob, cat]) p.isSneaking = true;
  cat.teleport({ x: R.x + 3.5, y, z: R.z + 9.5 }); // just outside the stones, inside the vision's 16 blocks
  bob.teleport({ x: R.x + 0.5, y, z: R.z + 4.5 });
  for (const p of [bob, cat]) await t.waitMessage(p, doneRe, { since, timeout: 100 });
  for (const p of [bob, cat]) await t.waitMessage(p, /The Gray Ring: Gray hoods, a dozen or more/, { since, timeout: 200 });
  for (const p of [bob, cat]) await t.waitMessage(p, /Listen to the Cantor: done/, { since, timeout: 1200 });
  t.log("5. both mates finish the step in the ring and hear the Cantor: OK");
  await t.seconds(4);
  t.check(guards().length === 0, `the watchers go once nobody needs the step (${guards().length})`);

  // --- Case B: Eve alone, after the party's run ----------------------------------------------------------------
  const eve = await t.player("Eve", { x: s.x, z: s.z + 3 });
  eve.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  await onStep(eve);
  // Near the ring, then away and back: her own watchers each time, never two sets.
  eve.isSneaking = true;
  eve.teleport({ x: R.x - 52 + 0.5, y, z: R.z + 0.5 });
  await t.waitUntil(() => guards().length >= 4, { timeout: 100, message: "Eve's watchers are posted" });
  eve.teleport({ x: s.x + 0.5, y, z: s.z + 3.5 });
  await t.waitUntil(() => guards().length === 0, { timeout: 100, message: "they go when she walks away" });
  eve.teleport({ x: R.x - 52 + 0.5, y, z: R.z + 0.5 });
  await t.waitUntil(() => guards().length >= 4, { timeout: 100, message: "Eve's watchers come back with her" });
  await t.wait(40);
  t.check(guards().length === 4, `one set of 4 for Eve (${guards().length})`);
  since = t.tick;
  besideGuard(eve);
  await t.waitMessage(eve, /Gray Choir watcher spotted you!/, { since, timeout: 60 });
  since = t.tick;
  eve.isSneaking = true;
  eve.teleport({ x: R.x + 0.5, y, z: R.z + 4.5 });
  await t.waitMessage(eve, doneRe, { since, timeout: 100 });
  await t.waitMessage(eve, /Listen to the Cantor: done/, { since, timeout: 1200 });
  t.log("B. Eve alone after the party's run: OK");
}
