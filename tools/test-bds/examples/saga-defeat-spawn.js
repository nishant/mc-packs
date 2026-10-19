// A `defeat` at a place whose mobs never come there by themselves spawns them (`spawn`): Reyes's "The Pattern"
// (act2_choir), "Fight off the Choir ambush at the Haddock farm" (defeat 6 pillagers or vindicators within 32 blocks).
// Before 1.16.4 nothing came and the chapter could never be finished. Run with
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-defeat-spawn.js --timeout 400
// Checks: nothing comes while the player is far away; at the farm the warning shows and 3 Choir mobs (tagged saga:add and
// saga:choir) come; they are topped up after kills, never more than are left; 6 kills by the player finish the step,
// one of them past the 32-block edge; no mobs are left after.
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const offers = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:npc_offer") offers.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, ...msg }));
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  const s = t.world.getDefaultSpawnLocation();
  const FX = s.x + 70, FZ = s.z - 260; // FARM_3, inside the 300-block knee: not scaled
  await t.loadArea(FX, FZ, { radius: 2 });
  const p = await t.player("Tester", { op: true, x: s.x, z: s.z, gameMode: "survival" });
  p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  p.addEffect("regeneration", 20000, { amplifier: 4, showParticles: false });
  await t.wait(20);
  debug(p, { action: "finish", story: "act1_signs", flags: { "act1:path": "wardens" } });
  await t.wait(5);
  debug(p, { action: "jump", story: "act2_choir", chapter: "pattern" });
  await t.wait(5);
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "reyes", req: "r1" }));
  await t.wait(4);
  t.assert(offers.some((o) => o.m.key === "start:act2_choir"), `Reyes offers The Gray Choir (${JSON.stringify(offers.map((o) => o.m.key))})`);
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer(Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))));
    }
  })();
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:act2_choir" }));
  await accept;
  await t.wait(10);
  for (const i of [0, 1, 2]) debug(p, { action: "bump", story: "act2_choir", i, n: 1e9 });
  await t.wait(10);

  const adds = () => t.dimension.getEntities({ tags: ["saga:add"] }).filter((e) => e.isValid);
  await t.seconds(4);
  t.check(adds().length === 0, `nothing comes while the player is ${Math.round(Math.hypot(70, 260))} blocks away`);

  let since = t.tick;
  p.teleport({ x: FX + 0.5, y: p.location.y, z: FZ + 0.5 });
  await t.waitMessage(p, /Gray hoods rise out of the wheat/, { since, timeout: 100 });
  await t.waitUntil(() => adds().length >= 3, { timeout: 100, message: "3 Choir mobs come" });
  const first = adds();
  t.log(`came: ${first.map((e) => e.typeId).join(", ")}`);
  t.check(first.length === 3, `3 alive at a time (${first.length})`);
  t.check(first.every((e) => ["minecraft:pillager", "minecraft:vindicator"].includes(e.typeId)), "they are pillagers and vindicators");
  t.check(first.every((e) => e.hasTag("saga:choir")), "they are tagged saga:choir (the Gray Choir Mask)");
  t.check(first.every((e) => Math.hypot(e.location.x - FX, e.location.z - FZ) <= 32), "they stand within the step's radius");

  const kill = (e) => e.applyDamage(500, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: p });
  // One killed past the edge (the fight drifted): it still counts.
  first[0].teleport({ x: FX + 40, y: first[0].location.y, z: FZ });
  await t.wait(2);
  kill(first[0]);
  kill(first[1]);
  kill(first[2]);
  await t.seconds(2);
  t.check(adds().length === 0, "no top-up before `every` (20 s) has passed");
  await t.waitUntil(() => adds().length >= 3, { timeout: 500, message: "topped up to 3 after 20 s" });
  for (const e of adds()) kill(e);
  since = t.tick;
  await t.waitMessage(p, /Fight off the Choir ambush|done|complete|Report|report/i, { since, timeout: 100 });
  await t.seconds(3);
  t.log("messages:", JSON.stringify(t.messages(p, { since }).map((m) => m.plain).filter((m) => /Story/.test(m))));
  debug(p, { action: "state" });
  await t.seconds(22);
  t.check(adds().length === 0, `no more come once 6 are down (${adds().length})`);
}
