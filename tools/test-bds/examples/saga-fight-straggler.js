// Story Questlines: a fight at a place never sticks on a straggler. Act II "The Pattern", "Fight off the Choir ambush
// at the Haddock farm" (defeat 6, `spawn` 3 alive at a time, topped up every 20 s).
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-fight-straggler.js --timeout 400
// Ann stands at the farm; one of her 3 mobs is moved 28 blocks away (past 24, short of the 32 where Bedrock may
// despawn it) and held there (out of reach, as one stuck in a cave or on a roof). Check: it is still there after 20 s,
// gone by 40 s (30 s out of reach), and a fresh one comes, so 3 are alive again. Before 1.16.17 it held its place for
// good: no top-up came and the step could never finish.
export default async function (t) {
  const sys = t.system;
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  const s = t.world.getDefaultSpawnLocation();
  const FX = s.x + 70, FZ = s.z - 260; // FARM_3, inside the 300-block knee: not scaled
  await t.loadArea(FX, FZ, { radius: 4 });
  const ann = await t.player("Ann", { op: true, x: s.x, z: s.z });
  ann.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  ann.addEffect("regeneration", 20000, { amplifier: 4, showParticles: false });
  await t.wait(20);
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

  /** Story mobs (saga:add) alive. */
  const adds = () => t.dimension.getEntities({ tags: ["saga:add"] }).filter((e) => e.isValid);
  ann.teleport({ x: FX + 0.5, y: ann.location.y, z: FZ + 0.5 });
  await t.waitUntil(() => adds().length >= 3, { timeout: 100, message: "Ann's group comes" });
  const stray = adds()[0];
  const strayId = stray.id;
  const top = t.dimension.getTopmostBlock({ x: FX + 28, z: FZ });
  stray.teleport({ x: FX + 28.5, y: (top?.location.y ?? ann.location.y) + 1, z: FZ + 0.5 });
  stray.addEffect("slowness", 20000, { amplifier: 255, showParticles: false });
  stray.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  const held = () => {
    // Held in place, out of reach: back where it was put if it moved, and Ann stays in the middle.
    if (stray.isValid) stray.teleport({ x: FX + 28.5, y: stray.location.y, z: FZ + 0.5 });
    ann.teleport({ x: FX + 0.5, y: ann.location.y, z: FZ + 0.5 });
  };
  let lost = -1;
  t.world.afterEvents.entityDie.subscribe((ev) => { if (ev.deadEntity.id === strayId) t.log(`straggler died: ${ev.damageSource.cause}`); });
  for (let k = 0; k < 20; k++) {
    held();
    await t.wait(20);
    if (lost < 0 && !stray.isValid) t.log(`gone at ${(lost = k + 1)} s`);
  }
  t.check(stray.isValid, "the straggler is still there after 20 s");
  let goneAt = -1;
  for (let k = 0; k < 20 && goneAt < 0; k++) {
    held();
    await t.wait(20);
    if (!stray.isValid) goneAt = 20 + k + 1;
  }
  t.check(goneAt > 0, `the straggler is replaced (after ${goneAt} s)`);
  await t.waitUntil(() => adds().length >= 3, { timeout: 100, message: "a fresh one comes" });
  t.check(adds().length === 3, `3 alive again (${adds().length})`);
  t.log("a straggler is replaced: OK");
}
