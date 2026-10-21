// Champions, O3 perf workload: a night crowd of champions around the players, so the aura and approach round robins
// (12 and 8 champions a run) carry the whole crowd. It asserts only that the crowd and players stay for the window;
// the cost is what --profile measures (elite_bp ms/tick in the steady window). A short run (the suite's):
//   node tools/test-bds/run.mjs --quiet --no-relay --flat --only elite_bp --scenario tools/test-bds/examples/elite-crowd-perf.js --arg players=2 --arg champions=20 --arg seconds=20 --timeout 400
// The measurement, after and before O3 (the code before it, 4b79281^, exported with git archive to <before>), on the
// same machine with nothing else running; compare elite_bp's steady ms/tick:
//   run.mjs --quiet --no-relay --flat --profile --profile-json <after.json> --only elite_bp --scenario <this file> --arg players=10 --arg champions=40 --arg seconds=120 --timeout 900
//   run.mjs ... the same with --packs <before>/packs --profile-json <before.json>
// Arguments: players (10), champions (40), seconds (120).
export default async function (t) {
  const players = Math.max(1, Number(t.args.players ?? 10));
  const wanted = Math.max(1, Number(t.args.champions ?? 40));
  const seconds = Math.max(10, Number(t.args.seconds ?? 120));
  const dim = t.dimension;
  t.server("/gamerule doMobSpawning false");
  t.server("/time set midnight");
  t.server("/gamerule doDaylightCycle false");
  const list = [];
  for (let i = 0; i < players; i++) {
    const p = await t.player(`Crowd${i}`, { x: (i % 5) * 6, z: Math.floor(i / 5) * 6, gameMode: "survival", settle: 2 });
    p.addEffect("resistance", 20000 + seconds * 20, { amplifier: 255, showParticles: false });
    p.addEffect("regeneration", 20000 + seconds * 20, { amplifier: 5, showParticles: false });
    list.push(p);
  }
  const y = Math.floor(list[0].location.y);
  // Champions on a ring 20-40 blocks out: inside the aura's 64 and the approach's 48, outside its stop distance.
  for (let i = 0; i < wanted; i++) {
    const a = (i / wanted) * Math.PI * 2;
    const r = 20 + (i % 3) * 10;
    t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: Math.cos(a) * r + 12.5, y, z: Math.sin(a) * r + 3.5, mob: "minecraft:zombie", trait: ["frostbound", "shielded", "vampiric"][i % 3], tag: "realm:crowd" }));
    if (i % 8 === 7) await t.wait(1);
  }
  await t.wait(40);
  const count = () => dim.getEntities({ tags: ["realm:crowd"] }).length;
  t.assert(count() >= wanted * 0.9, `the crowd is there (${count()} of ${wanted})`);
  const startTick = t.tick;
  let low = count();
  for (let s = 0; s < seconds; s += 5) {
    await t.seconds(5);
    low = Math.min(low, count());
    // Keep them coming: a champion that reached a player is pushed back out, so the approach keeps working.
    for (const e of dim.getEntities({ tags: ["realm:crowd"] })) {
      const near = list.some((p) => Math.hypot(p.location.x - e.location.x, p.location.z - e.location.z) < 12);
      if (near) {
        const a = Math.random() * Math.PI * 2;
        e.teleport({ x: Math.cos(a) * 35 + 12.5, y, z: Math.sin(a) * 35 + 3.5 }, { dimension: dim });
      }
    }
  }
  t.report("elite-crowd", { players, champions: wanted, seconds, ticks: t.tick - startTick, lowest: low, online: t.world.getAllPlayers().length });
  t.check(t.world.getAllPlayers().length === players, `every player stayed (${t.world.getAllPlayers().length} of ${players})`);
  t.check(low >= wanted * 0.75, `the crowd stayed for the window (lowest ${low} of ${wanted})`);
}
