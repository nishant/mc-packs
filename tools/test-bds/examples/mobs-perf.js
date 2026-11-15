// Champions, Bounty Board and Dolphin Friends under the per-event and per-rider loads the soaks never make (W11:
// ENT-07, ENT-08, ENT-10, ENT-24, ENT-12), in named phases for the profiler. Meant for run.mjs --profile
// (validate.yml's scenario pairs run it on the base and the head tree); it reports perf-workload, so each phase's
// ms/tick per pack and its slowest tick are listed.
//   node tools/test-bds/run.mjs --quiet --flat --only elite_bp,bounty_bp,dolphin_bp --scenario tools/test-bds/examples/mobs-perf.js --timeout 1200
// Phases (seconds is the length of each, default 30):
//   farm: a mob farm next to a player in daylight (no champion loaded): 20 zombies a second summoned, hurt once
//     and killed by the player the tick after (an entityHurt, a death and its drops each), plus 20 dropped items
//     a second (entitySpawn of an item), the items cleared every second;
//   farm-champ: the same with one champion in a helmet loaded 30 blocks away (the known-champion tests and the
//     helmet watch then have work to do);
//   storm: a thunderstorm with 3 slowed Stormcallers next to the player: a strike every 6 to 10 s each, each one
//     the 81-column build scan (its slowest tick is the point);
//   riders: two players riding tamed dolphins in a pool, turning every half second (the per-rider steering).
// Arguments: seconds (30).
export default async function (t) {
  const { ItemStack, EntityDamageCause, GameMode } = t.mc;
  const SECONDS = Math.max(10, Number(t.args.seconds ?? 30));
  const T0 = t.tick;
  const dim = t.dimension;
  t.server("/gamerule doMobSpawning false");
  t.server("/gamerule doFireTick false");
  t.server("/gamerule doDaylightCycle false");
  t.server("/time set noon");
  t.server("/weather clear");

  // Away from the world spawn (strikes there only crackle). The farm and the storm here, the pool 80 blocks east.
  const first = await t.player("Farmer", { op: true });
  const home = { x: Math.floor(first.location.x) + 150.5, y: first.location.y, z: Math.floor(first.location.z) + 0.5 };
  const pool = { x: Math.floor(home.x) + 80, z: Math.floor(home.z) };
  await t.loadArea(home.x, home.z, { radius: 3 });
  await t.loadArea(pool.x, pool.z, { radius: 2 });
  first.teleport(home);
  first.setGameMode(GameMode.Survival);
  const G = Math.floor(home.y) - 1; // the ground's top block
  const riders = [];
  for (let i = 0; i < 2; i++) riders.push(await t.player(`Rider${i}`, { op: true, x: pool.x, z: pool.z, settle: 2 }));
  const everyone = [first, ...riders];
  for (const p of everyone) {
    p.addEffect("resistance", 20000, { amplifier: 255, showParticles: false });
    p.addEffect("fire_resistance", 20000, { amplifier: 0, showParticles: false });
    p.addEffect("regeneration", 20000, { amplifier: 5, showParticles: false });
  }

  // The pool: a stone basin 15 x 15 on the ground, water 5 deep, the riders in it.
  t.assert(t.server(`/fill ${pool.x - 8} ${G + 1} ${pool.z - 8} ${pool.x + 8} ${G + 6} ${pool.z + 8} stone`).ok, "a stone basin");
  t.assert(t.server(`/fill ${pool.x - 7} ${G + 2} ${pool.z - 7} ${pool.x + 7} ${G + 6} ${pool.z + 7} water`).ok, "filled with water");
  await t.wait(10);
  /** @type {any[]} */
  const dolphins = [];
  for (let i = 0; i < 2; i++) {
    const spot = { x: pool.x - 3 + i * 6 + 0.5, y: G + 3, z: pool.z + 0.5 };
    const d = dim.spawnEntity("minecraft:dolphin", { x: spot.x + 1, y: spot.y, z: spot.z });
    riders[i].teleport(spot);
    dolphins.push(d);
  }
  await t.wait(5);
  for (let i = 0; i < 2; i++) {
    const p = riders[i];
    const inv = p.getComponent("inventory").container;
    inv.setItem(p.selectedSlotIndex, new ItemStack("minecraft:cod", 64));
    let tamed = false;
    for (let n = 0; n < 60 && !tamed; n++) {
      const since = t.tick;
      t.cmd(p, "/scriptevent realm:dolphin_feed");
      await t.wait(2);
      tamed = t.messages(p, { since }).some((m) => /trusts you/.test(m.plain));
    }
    t.assert(tamed, `${p.name}'s dolphin was tamed`);
    inv.setItem(p.selectedSlotIndex, undefined);
  }

  // One player per second for retention: everyone stays the whole window.
  let samples = 0, minValid = everyone.length;
  const sampler = t.system.runInterval(() => {
    samples++;
    minValid = Math.min(minValid, everyone.filter((p) => p.isValid).length);
  }, 20);
  const phases = [];
  let current = null;
  // The slowest tick of each phase, as the server ran it (wall time between two ticks, whatever ran in it).
  let lastTickAt = Date.now();
  const tickWatch = t.system.runInterval(() => {
    const now = Date.now();
    if (current) current.slowestTickMs = Math.max(current.slowestTickMs ?? 0, now - lastTickAt);
    lastTickAt = now;
  }, 1);
  const begin = (name) => { current = { name, startTick: t.tick }; t.log(`phase ${name} starts`); };
  const end = (extra = {}) => { Object.assign(current, extra); current.endTick = t.tick; phases.push(current); t.log(`phase ${current.name}: ${((current.endTick - current.startTick) / 20).toFixed(1)} s, slowest tick ${current.slowestTickMs ?? 0} ms`); current = null; };

  // The farm: a zombie a tick, hurt as it appears and killed by the player a tick later; an item a tick.
  const farmAt = { x: home.x + 6, y: G + 1, z: home.z };
  const farm = async (name) => {
    let kills = 0, items = 0;
    let last = null;
    const run = t.system.runInterval(() => {
      try {
        if (last?.isValid) {
          last.applyDamage(1000, { cause: EntityDamageCause.entityAttack, damagingEntity: first });
          kills++;
        }
      } catch {
        // gone
      }
      try {
        last = dim.spawnEntity("minecraft:zombie", farmAt);
        last.applyDamage(1, { cause: EntityDamageCause.entityAttack, damagingEntity: first });
        dim.spawnItem(new ItemStack("minecraft:cobblestone", 1), { x: farmAt.x - 2, y: farmAt.y + 0.5, z: farmAt.z + (items++ % 5) - 2 });
      } catch {
        // unloaded for a moment
      }
    }, 1);
    const clean = t.system.runInterval(() => {
      for (const e of dim.getEntities({ type: "minecraft:item", location: farmAt, maxDistance: 16 })) e.remove();
      for (const e of dim.getEntities({ type: "minecraft:xp_orb", location: farmAt, maxDistance: 16 })) e.remove();
    }, 20);
    begin(name);
    await t.seconds(SECONDS);
    t.system.clearRun(run);
    t.system.clearRun(clean);
    end({ kills, items });
    for (const e of dim.getEntities({ type: "minecraft:zombie", location: farmAt, maxDistance: 16 })) if (!e.hasTag("realm:champion")) e.remove();
    t.log(`${name}: ${kills} kills, ${items} items`);
    return kills;
  };

  const k1 = await farm("farm");
  // One champion in a helmet, slowed, 30 blocks away (it still counts as loaded for every event).
  t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: home.x - 30, y: G + 1, z: home.z, mob: "minecraft:zombie", trait: "frostbound", tag: "realm:mobs_perf" }));
  const champ = await t.waitUntil(() => dim.getEntities({ tags: ["realm:mobs_perf"] })[0], { timeout: 60, message: "the champion spawned" });
  champ.addEffect("slowness", 20000, { amplifier: 255, showParticles: false });
  await t.wait(10);
  const k2 = await farm("farm-champ");
  champ.remove();

  // The storm: 3 Stormcallers beside the player, slowed and weakened so the player stays put and alive.
  t.server("/weather thunder");
  await t.wait(10);
  let bolts = 0;
  const onSpawn = t.world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    try {
      if (entity.typeId === "minecraft:lightning_bolt") bolts++;
    } catch {
      // gone
    }
  });
  for (let i = 0; i < 3; i++) t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: home.x + 5, y: G + 1, z: home.z - 4 + i * 4, mob: "minecraft:spider", trait: "stormcaller", tag: "realm:mobs_storm" }));
  await t.waitUntil(() => dim.getEntities({ tags: ["realm:mobs_storm"] }).length >= 3, { timeout: 60, message: "the Stormcallers spawned" });
  for (const c of dim.getEntities({ tags: ["realm:mobs_storm"] })) {
    c.addEffect("slowness", 20000, { amplifier: 255, showParticles: false });
    c.addEffect("weakness", 20000, { amplifier: 255, showParticles: false });
  }
  begin("storm");
  await t.seconds(SECONDS + 10);
  end({ bolts });
  t.world.afterEvents.entitySpawn.unsubscribe(onSpawn);
  for (const c of dim.getEntities({ tags: ["realm:mobs_storm"] })) c.remove();
  t.server("/weather clear");
  t.log(`storm: ${bolts} strikes`);

  // The riders: each on their tamed dolphin, turning every 10 ticks.
  for (let i = 0; i < 2; i++) t.assert(dolphins[i].getComponent("minecraft:rideable")?.addRider(riders[i]), `${riders[i].name} is on a dolphin`);
  await t.wait(10);
  let turns = 0;
  const turn = t.system.runInterval(() => {
    turns++;
    for (let i = 0; i < 2; i++) {
      try {
        riders[i].setRotation({ x: (turns % 3) * 10 - 10, y: (turns * 37 + i * 90) % 360 - 180 });
      } catch {
        // gone
      }
    }
  }, 10);
  begin("riders");
  await t.seconds(SECONDS);
  end({ turns });
  t.system.clearRun(turn);
  const stillOn = dolphins.filter((d, i) => d.getComponent("minecraft:rideable")?.getRiders().some((r) => r.id === riders[i].id)).length;

  t.system.clearRun(sampler);
  t.system.clearRun(tickWatch);
  const ticks = t.tick - phases[0].startTick;
  t.report("perf-workload", {
    schema: 1, declared: { players: everyone.length, seconds: Math.floor(ticks / 20) }, spawned: everyone.length, spawnGameSeconds: (phases[0].startTick - T0) / 20,
    kinds: { land: 1, water: 2, nether: 0, groups: 2 },
    soak: { startTick: phases[0].startTick, endTick: t.tick, ticks, seconds: ticks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: everyone.filter((p) => p.isValid).length },
    phases,
  });
  t.check(k1 >= SECONDS * 15 && k2 >= SECONDS * 15, `the farm ran (${k1} and ${k2} kills)`);
  t.check(bolts >= 1, `the Stormcallers struck (${bolts} strikes)`);
  t.check(stillOn === 2, `both riders stayed on (${stillOn} of 2)`);
}
