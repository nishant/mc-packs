// Performance soak for the packs that follow fishing hooks (fishing_bp, saga_bp, skills_bp, journal_bp, quests_bp):
// perf-soak.js casts no rod, so their hook loops and catch paths never run there. Here every player stands on the rim
// of a pool with a bobber out for the whole window, and every `catch` seconds each player (staggered) lands a catch:
// a single cod appears where its hook is as the hook goes (the way a reeled-in catch looks to the packs), then the
// player casts again. Meant for run.mjs --profile (add --profile-json <file> to keep the figures), and reports
// perf-workload like perf-soak.js:
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --only fishing_bp,saga_bp,skills_bp,journal_bp,quests_bp --scenario tools/test-bds/examples/fishing-perf.js --timeout 900
// Arguments (--arg key=value): players (default 10, at most 10: they share one pool's rim), seconds (default 60),
// catch (seconds between one player's catches, default 15; 0 = none, only bobbers out).
export default async function (t) {
  const a = t.args;
  const N = Math.min(10, Math.max(1, Number(a.players ?? 10)));
  const SECONDS = Math.max(10, Number(a.seconds ?? 60));
  const CATCH = Math.max(0, Number(a.catch ?? 15));
  const { ItemStack } = t.mc;
  const over = t.world.getDimension("overworld");
  const spawn = t.world.getDefaultSpawnLocation();
  const CX = Math.floor(spawn.x === 0 && spawn.z === 0 ? 163 : spawn.x), CZ = Math.floor(spawn.z === 0 && spawn.x === 0 ? 170 : spawn.z);
  t.server("/gamerule sendcommandfeedback false");
  t.server("/gamerule domobspawning false");
  t.server("/time set day");
  t.server("/weather clear");

  // The pool: 15 x 15 water, 2 deep, on a stone floor, with a stone rim to stand on; built above the ground there.
  const { top } = await t.loadArea(CX, CZ, { radius: 2, whole: true, timeout: 1200 });
  const Y = Math.min(300, top.location.y + 1);
  t.server(`/fill ${CX - 10} ${Y} ${CZ - 10} ${CX + 10} ${Y + 12} ${CZ + 10} air`);
  t.server(`/fill ${CX - 8} ${Y} ${CZ - 8} ${CX + 8} ${Y + 2} ${CZ + 8} stone`);
  t.server(`/fill ${CX - 7} ${Y + 1} ${CZ - 7} ${CX + 7} ${Y + 2} ${CZ + 7} water`);
  await t.wait(5);

  // Spots on the rim, facing the water (yaw 0 = +z, 180 = -z, -90 = +x, 90 = -x), looking down a little.
  const rim = [
    ...[-4, 0, 4].map((d) => ({ x: CX + d, z: CZ - 8, yaw: 0 })),
    ...[-4, 0, 4].map((d) => ({ x: CX + d, z: CZ + 8, yaw: 180 })),
    ...[-3, 3].map((d) => ({ x: CX - 8, z: CZ + d, yaw: -90 })),
    ...[-3, 3].map((d) => ({ x: CX + 8, z: CZ + d, yaw: 90 })),
  ];

  /** @type {{ p: any, spot: { x: number, z: number, yaw: number }, hook: any, castAt: number }[]} */
  const fishers = [];
  const t0 = t.tick;
  for (let i = 0; i < N; i++) {
    const spot = rim[i];
    try {
      const p = await t.player(`Fisher${String(i + 1).padStart(2, "0")}`, { x: spot.x + 0.5, y: Y + 3, z: spot.z + 0.5, op: i === 0, settle: 2, area: false });
      p.teleport({ x: spot.x + 0.5, y: Y + 3, z: spot.z + 0.5 }, { rotation: { x: 35, y: spot.yaw } });
      p.getComponent("minecraft:inventory").container.setItem(0, new ItemStack("minecraft:fishing_rod", 1));
      p.selectedSlotIndex = 0;
      fishers.push({ p, spot, hook: undefined, castAt: -100 });
    } catch (e) {
      t.log(`could not spawn fisher ${i + 1}: ${e}`);
    }
  }
  const made = fishers.length;
  const spawnGameSeconds = (t.tick - t0) / 20;
  const declared = { players: N, seconds: SECONDS, catch: CATCH };
  const kinds = { land: made, water: 0, nether: 0, groups: 1 };
  t.report("perf-workload", { schema: 1, declared, spawned: made, spawnGameSeconds, kinds });
  t.assert(made === N, `all ${N} declared players spawned (${made} did)`);

  const valid = (e) => { try { return !!e && e.isValid; } catch { return false; } };
  /** The player's bobber: the hook whose projectile owner it is. */
  const hookOf = (p) => {
    for (const h of over.getEntities({ type: "minecraft:fishing_hook", location: p.location, maxDistance: 24 })) {
      try {
        if (h.getComponent("minecraft:projectile")?.owner?.id === p.id) return h;
      } catch { /* no owner */ }
    }
    return undefined;
  };
  let casts = 0;
  const cast = (f) => {
    try {
      f.p.teleport({ x: f.spot.x + 0.5, y: Y + 3, z: f.spot.z + 0.5 }, { rotation: { x: 35, y: f.spot.yaw } });
      f.p.selectedSlotIndex = 0;
      f.p.useItemInSlot(0);
      f.castAt = t.tick;
      f.hook = undefined;
      casts++;
    } catch (e) {
      t.log(`cast for ${f.p.name}: ${e}`);
    }
  };
  /** Finds hooks for casts that have none yet; recasts a player whose hook went missing. */
  const tend = () => {
    let out = 0;
    for (const f of fishers) {
      if (!valid(f.p)) continue;
      if (!valid(f.hook)) f.hook = t.tick - f.castAt >= 2 ? hookOf(f.p) : undefined;
      if (valid(f.hook)) out++;
      else if (t.tick - f.castAt > 40) cast(f);
    }
    return out;
  };
  for (const f of fishers) {
    cast(f);
    await t.wait(1);
  }
  await t.wait(60); // the bobbers settle in the water (and are old enough to catch: the packs ignore a hook's first 30 ticks)
  const ready = tend();
  t.log(`bobbers out before the soak: ${ready}/${made}`);

  const start = t.tick;
  let samples = 0, minValid = Infinity, catches = 0, hookSamples = 0;
  for (let sec = 1; t.tick - start < SECONDS * 20; sec++) {
    await t.wait(20);
    let validNow = 0;
    for (let i = 0; i < fishers.length; i++) {
      const f = fishers[i];
      if (!valid(f.p)) continue;
      validNow++;
      // A catch: one cod where the hook is, and the hook goes in the same tick (as a reeled-in catch looks).
      if (CATCH && sec % CATCH === i % CATCH && valid(f.hook) && t.tick - f.castAt >= 40) {
        try {
          over.spawnItem(new ItemStack("minecraft:cod", 1), f.hook.location);
          f.hook.remove();
          f.hook = undefined;
          f.castAt = t.tick - 30; // cast again in about 10 ticks
          catches++;
        } catch (e) {
          t.log(`catch for ${f.p.name}: ${e}`);
        }
      }
    }
    hookSamples += tend();
    samples++;
    minValid = Math.min(minValid, validNow);
  }
  const alive = fishers.filter((f) => valid(f.p)).length;
  const ticks = t.tick - start;
  const hooksOut = samples ? hookSamples / samples : 0;
  t.log(`soak done: ${SECONDS} s, ${alive}/${N} players, ${casts} casts, ${catches} catches, ${hooksOut.toFixed(1)} bobbers out on average`);
  t.report("perf-workload", {
    schema: 1, declared, spawned: made, spawnGameSeconds, kinds,
    soak: { startTick: start, endTick: t.tick, ticks, seconds: ticks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    casts, catches, hooksOut,
  });
  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed in the world for the whole ${SECONDS} s soak`);
  t.check(ticks >= SECONDS * 20, `the steady window ran its full ${SECONDS} s (${(ticks / 20).toFixed(1)} s)`);
  t.check(hooksOut >= N * 0.8, `a bobber was out for most players most of the time (${hooksOut.toFixed(1)} of ${N} on average)`);
  if (CATCH) t.check(catches >= Math.floor(SECONDS / CATCH) * N * 0.8, `the catches landed (${catches})`);
}
