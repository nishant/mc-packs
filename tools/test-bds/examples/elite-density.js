// Champions, O3: natural champions are capped by the players online (maxAlivePerPlayer 0.8, at least 1, up to the
// maxAlive ceiling of 80) and by the champions already near a new one (maxAliveNearby 3 within 64 blocks), so a quiet
// world or one busy spot no longer fills up with champions as night falls. Before O3 (4b79281^) a fixed maxAlive of 8
// let one player meet four here and a fourth join three neighbors: this fails there at "one player online: 1 champion".
// Hostile spawns are made by the scenario at chosen spots 50+ blocks apart (natural ones keep areaSpacing, 48 blocks),
// with every spawn a champion candidate (chance 0.25 x the Blood Moon multiplier 4). Every spot has a player within 40
// blocks for the whole run: BDS 1.26 despawns a hostile mob 44 or more blocks from every player within 2 ticks (measured),
// before the pack's conversion a tick later could see it, and would take a champion from its spot. Where the players
// stand changes no cap (those count players online, and champions near a spot).
//   node tools/test-bds/run.mjs --quiet --flat --only elite_bp --scenario tools/test-bds/examples/elite-density.js --timeout 600
export default async function (t) {
  const dim = t.dimension;
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `e_${key}_${t.tick}`, pack: "elite_bp", key, value }));
  t.server("/gamerule doMobSpawning false");
  t.server("/time set midnight");
  t.server("/gamerule doDaylightCycle false");
  const first = await t.player("Solo", { x: 25, z: 25, gameMode: "creative" }); // 35 blocks from spots 1 and 2
  cfg("chance", 0.25);
  cfg("bloodMoonMultiplier", 4);
  t.system.sendScriptEvent("realm:moon", JSON.stringify({ state: "blood" }));
  await t.wait(10);
  // Spots: P4 has P1-P3 within 64 blocks; every two are at least 48 apart; P5 is more than 64 from all.
  const P = { 1: [50, 0], 2: [0, 50], 3: [-50, 0], 4: [0, 0], 5: [0, -110] };
  const ground = {};
  for (const [k, [x, z]] of Object.entries(P)) ground[k] = (await t.loadArea(x, z, { radius: 2 })).top.location.y + 1;
  const champions = () => dim.getEntities({ tags: ["realm:champion"] });
  const at = (k) => champions().some((e) => Math.hypot(e.location.x - P[k][0], e.location.z - P[k][1]) < 12);
  /** A hostile spawn at spot k, the way a night spawn reaches the pack (entitySpawn, cause Spawned). */
  const spawnAt = async (k) => {
    const [x, z] = P[k];
    const e = dim.spawnEntity("minecraft:zombie", { x: x + 0.5, y: ground[k], z: z + 0.5 });
    try {
      e.addEffect("slowness", 6000, { amplifier: 255, showParticles: false });
    } catch {}
    await t.wait(10);
    return e;
  };
  const count = () => champions().length;

  // One player online: 0.8 a player, at least 1.
  await spawnAt(1);
  await spawnAt(2);
  t.check(count() === 1 && at(1), `one player online: 1 champion (${count()})`);

  // Five players: 5 x 0.8 = 4 at most; spots 2 and 3 become champions, spot 4 already has three neighbors.
  // Each by a spot the first player is too far from (Dee stays with Solo).
  const stand = { Ann: [-50, -10], Bob: [0, -10], Cid: [0, -100], Dee: [25, 25] };
  for (const [name, [x, z]] of Object.entries(stand)) await t.player(name, { x, z, gameMode: "creative" });
  await t.wait(10);
  await spawnAt(2);
  await spawnAt(3);
  t.check(count() === 3 && at(2) && at(3), `five players: spots 2 and 3 became champions (${count()})`);
  await spawnAt(4);
  t.check(count() === 3 && !at(4), `a spawn with three champions within 64 blocks stays a plain mob (${count()})`);

  // No nearby limit: spot 4 is the fourth, which is all five players allow; spot 5 (far from all) is refused.
  cfg("maxAliveNearby", 0);
  await t.wait(5);
  await spawnAt(4);
  t.check(count() === 4 && at(4), `with maxAliveNearby 0, spot 4 becomes the fourth champion (${count()})`);
  await spawnAt(5);
  t.check(count() === 4 && !at(5), `five players allow 4: a fifth is refused far from the others too (${count()})`);

  // No per-player limit: only the ceiling (80) is left.
  cfg("maxAlivePerPlayer", 0);
  await t.wait(5);
  await spawnAt(5);
  t.check(count() === 5 && at(5), `with maxAlivePerPlayer 0, only maxAlive caps them (${count()})`);
  t.log(`first player ${first.name}; champions at ${champions().map((e) => `${Math.round(e.location.x)},${Math.round(e.location.z)}`).join(" ")}`);
}
