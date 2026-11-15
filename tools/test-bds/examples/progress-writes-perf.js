// Saved-data writes of the progress packs (W14a): half the players mine and build (each second a stone block broken,
// or a dirt or plank block placed and cleared again), the other half walk up and down their lane, and every player has
// today's quests set to "Mine 64 stone", "Place 64 blocks" and "Travel 1,000 blocks" (set again halfway, so they keep
// counting). Daily Quests counts every break, place and step; Skills remembers placed blocks; Milestones and Titles count
// the walking; Realm News keeps everyone's "last seen". Meant for run.mjs --profile: read each pack's dynW/t (and the
// bundle's setDynamicProperty chars/tick) next to its ms/tick. Reports perf-workload like perf-soak.js:
//   node tools/test-bds/run.mjs --quiet --no-relay --flat --profile --only quests_bp,skills_bp,milestones_bp,titles_bp,news_bp,guilds_bp --scenario tools/test-bds/examples/progress-writes-perf.js --timeout 900
// Arguments (--arg key=value): players (default 10, at most 10: one lane each), seconds (default 120).
export default async function (t) {
  const a = t.args;
  const N = Math.min(10, Math.max(2, Number(a.players ?? 10)));
  const SECONDS = Math.max(20, Number(a.seconds ?? 120));
  const { ItemStack, Direction } = t.mc;
  const dim = t.dimension;
  const Y = -60; // the air above the flat world's grass
  const Z = 4;
  const LANE = 4;
  t.server("/gamerule sendcommandfeedback false");
  t.server("/gamerule domobspawning false");
  t.server("/time set day");
  t.server("/weather clear");
  await t.loadArea(LANE * N / 2, 18, { radius: 2, whole: true, timeout: 1200 });
  for (const e of dim.getEntities({ location: { x: LANE * N / 2, y: Y, z: 18 }, maxDistance: 64 })) if (e.typeId !== "minecraft:player") e.remove();

  const valid = (e) => { try { return !!e && e.isValid; } catch { return false; } };
  /** @type {{ p: any, x: number, builder: boolean }[]} */
  const crew = [];
  const t0 = t.tick;
  for (let i = 0; i < N; i++) {
    const x = LANE * i + 2;
    try {
      const p = await t.player(`Worker${String(i + 1).padStart(2, "0")}`, { x: x + 0.5, y: Y, z: Z - 1.5, op: i === 0, gameMode: "survival", settle: 2, area: false });
      const inv = p.getComponent("inventory").container;
      inv.clearAll();
      inv.setItem(0, new ItemStack("minecraft:netherite_pickaxe", 1));
      inv.setItem(1, new ItemStack("minecraft:dirt", 64));
      inv.setItem(2, new ItemStack("minecraft:oak_planks", 64));
      p.selectedSlotIndex = 0;
      crew.push({ p, x, builder: i % 2 === 0 });
    } catch (e) {
      t.log(`could not spawn worker ${i + 1}: ${e}`);
    }
  }
  const made = crew.length;
  const spawnGameSeconds = (t.tick - t0) / 20;
  const declared = { players: N, seconds: SECONDS };
  const kinds = { land: made, water: 0, nether: 0, groups: 1 };
  t.report("perf-workload", { schema: 1, declared, spawned: made, spawnGameSeconds, kinds });
  t.assert(made === N, `all ${N} declared players spawned (${made} did)`);

  const QUESTS = ["mine_stone", "place_blocks", "travel_1k"];
  const setQuests = () => { for (const c of crew) if (valid(c.p)) t.system.sendScriptEvent("realm:quests_test", JSON.stringify({ player: c.p.name, ids: QUESTS })); };
  const stoneAt = (c) => ({ x: c.x, y: Y - 1, z: Z });
  const placeAt = (c) => ({ x: c.x + 1, y: Y, z: Z });
  for (const c of crew) if (c.builder) t.server(`/setblock ${c.x} ${Y - 1} ${Z} stone`);
  setQuests();
  await t.wait(20);

  const start = t.tick;
  let samples = 0, minValid = Infinity, broken = 0, placed = 0, walks = 0;
  for (let sec = 1; t.tick - start < SECONDS * 20; sec++) {
    await t.wait(20);
    if (sec === Math.floor(SECONDS / 2)) setQuests(); // the 64s are done by now: count again
    let validNow = 0;
    for (const c of crew) {
      if (!valid(c.p)) continue;
      validNow++;
      const p = c.p;
      try {
        if (!c.builder) {
          // Up and down the lane: about 30 blocks every 8 s.
          if (sec % 8 === 1) { p.moveToLocation({ x: c.x + 0.5, y: Y, z: (sec / 8) % 2 < 1 ? Z + 30 : Z }); walks++; }
          continue;
        }
        const s = stoneAt(c), q = placeAt(c);
        if (sec % 2) {
          try { p.stopInteracting(); } catch { /* not using */ }
          if (dim.getBlock(q)?.typeId !== "minecraft:air") { t.server(`/setblock ${q.x} ${q.y} ${q.z} air`); placed++; }
          if (dim.getBlock(s)?.typeId === "minecraft:stone") {
            p.selectedSlotIndex = 0;
            p.lookAtBlock(s);
            p.breakBlock(s);
          }
        } else {
          try { p.stopBreakingBlock(); } catch { /* not breaking */ }
          if (dim.getBlock(s)?.typeId !== "minecraft:stone") { broken++; t.server(`/setblock ${s.x} ${s.y} ${s.z} stone`); }
          p.useItemInSlotOnBlock((sec / 2) % 2 ? 1 : 2, { x: q.x, y: q.y - 1, z: q.z }, Direction.Up);
        }
      } catch (e) {
        t.log(`${p.name}: ${e}`);
      }
    }
    samples++;
    minValid = Math.min(minValid, validNow);
  }
  const alive = crew.filter((c) => valid(c.p)).length;
  const ticks = t.tick - start;
  t.log(`soak done: ${SECONDS} s, ${alive}/${N} players, ${broken} stone broken, ${placed} blocks placed, ${walks} walks`);
  t.report("perf-workload", {
    schema: 1, declared, spawned: made, spawnGameSeconds, kinds,
    soak: { startTick: start, endTick: t.tick, ticks, seconds: ticks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    broken, placed, walks,
  });
  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed in the world for the whole ${SECONDS} s soak`);
  t.check(ticks >= SECONDS * 20, `the steady window ran its full ${SECONDS} s (${(ticks / 20).toFixed(1)} s)`);
  const builders = crew.filter((c) => c.builder).length;
  t.check(broken >= builders * SECONDS / 4, `the builders broke stone (${broken})`);
  t.check(placed >= builders * SECONDS / 4, `and placed blocks (${placed})`);
}
