// Performance soak for the packs that read players' gear and inventories (silly_bp, admin_bp, durability_bp, relics_bp,
// skills_bp): perf-soak.js gives nobody silly enchants or relics, so their wearer paths never run there. Here a share of
// the players (`share`, default 0.5) wear Silly Enchants armor (Disco, Rainbow Trail, Glow), hold a Confetti Swing
// sword and carry a relic in the hotbar, and every second each player walks, switches hotbar slots, picks up a block
// now and then (an inventory change) or takes a small hit (armor wear, Moo). Meant for run.mjs --profile, like
// perf-soak.js, and reports the same perf-workload (no water or Nether players):
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --only silly_bp,admin_bp,durability_bp,relics_bp,skills_bp --scenario tools/test-bds/examples/gear-perf.js --arg players=40 --arg seconds=120 --timeout 3000
// Arguments (--arg key=value): players (default 10), seconds (default 120), share (default 0.5), group (players per
// group, default 5), spread (blocks between groups, default 48).
export default async function (t) {
  const a = t.args;
  const N = Math.max(1, Number(a.players ?? 10));
  const SECONDS = Math.max(10, Number(a.seconds ?? 120));
  const SHARE = Math.min(1, Math.max(0, Number(a.share ?? 0.5)));
  const GROUP = Math.max(1, Number(a.group ?? 5));
  const SPREAD = Math.max(16, Number(a.spread ?? 48));
  const { ItemStack, EquipmentSlot } = t.mc;
  const spawn = t.world.getDefaultSpawnLocation();
  const SX = spawn.x === 0 && spawn.z === 0 ? 163 : spawn.x, SZ = spawn.z === 0 && spawn.x === 0 ? 170 : spawn.z;
  t.server("/gamerule sendcommandfeedback false");
  t.server("/gamerule domobspawning false");

  // Bedrock allows 10 ticking areas: the harness adds one per spawn, so remove them after each spawn (as perf-soak.js).
  const cleared = new Set();
  const clearAreas = () => {
    const raw = t.world.getDynamicProperty("harness:tickingAreas");
    const areas = raw === undefined ? [] : JSON.parse(raw);
    for (const area of areas) {
      const key = `${area.dimension}|${area.name}`;
      if (cleared.has(key) || !/^harness_\d+_\d+$/.test(area.name)) continue;
      t.world.getDimension(area.dimension).runCommand(`tickingarea remove "${area.name}"`);
      cleared.add(key);
    }
  };
  const rnd = (n) => Math.floor(Math.random() * n);
  const groupSpot = (g) => {
    const ring = Math.ceil(Math.sqrt(g + 1));
    return { x: SX + ((g % ring) - ring / 2) * SPREAD, z: SZ + (Math.floor(g / ring) - ring / 2) * SPREAD };
  };
  const silly = (id, ...names) => {
    const it = new ItemStack(id, 1);
    it.setLore(names.map((n) => `§r§dSilly: ${n}`));
    return it;
  };
  const RELICS = ["miners_lamp", "lantern_shard", "rain_charm", "wayfarer_boots"];

  /** @type {{ p: any, home: { x: number, y: number, z: number }, geared: boolean }[]} */
  const players = [];
  const t0 = t.tick;
  for (let i = 0; i < N; i++) {
    const c = groupSpot(Math.floor(i / GROUP));
    for (let attempt = 0; attempt < 3; attempt++) {
      clearAreas();
      await t.wait(1);
      try {
        const p = await t.player(`Gear${String(i + 1).padStart(3, "0")}`, { x: c.x + rnd(9) - 4 + attempt * 7, z: c.z + rnd(9) - 4, op: i === 0, settle: 2 });
        const l = p.location;
        players.push({ p, home: { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }, geared: i < Math.round(N * SHARE) });
        break;
      } catch (e) {
        t.log(`could not spawn player ${i + 1} (try ${attempt + 1}): ${e}`);
      }
    }
    clearAreas();
  }
  const made = players.length;
  t.log(`spawned ${made}/${N} players in ${((t.tick - t0) / 20).toFixed(0)} s, ${players.filter((s) => s.geared).length} with silly gear and a relic`);
  const declared = { players: N, seconds: SECONDS, share: SHARE, group: GROUP, spread: SPREAD };
  const kinds = { land: made, water: 0, nether: 0, groups: Math.ceil(N / GROUP), geared: players.filter((s) => s.geared).length };
  const spawnGameSeconds = (t.tick - t0) / 20;
  t.report("perf-workload", { schema: 1, declared, spawned: made, spawnGameSeconds, kinds });
  t.assert(made === N, `all ${N} declared players spawned (${made} did)`);

  // Gear: armor and a sword for the geared share, a relic in their hotbar; a plain sword and armor for the rest.
  for (const s of players) {
    try {
      const inv = s.p.getComponent("minecraft:inventory").container;
      const eq = s.p.getComponent("minecraft:equippable");
      if (s.geared) {
        eq.setEquipment(EquipmentSlot.Head, silly("minecraft:iron_helmet", "Glow"));
        eq.setEquipment(EquipmentSlot.Chest, silly("minecraft:iron_chestplate", "Disco"));
        eq.setEquipment(EquipmentSlot.Feet, silly("minecraft:iron_boots", "Rainbow Trail", "Squeak"));
        inv.setItem(1, silly("minecraft:iron_sword", "Confetti Swing"));
        t.system.sendScriptEvent("realm:relic_give", JSON.stringify({ player: s.p.id, relic: RELICS[players.indexOf(s) % RELICS.length] }));
      } else {
        eq.setEquipment(EquipmentSlot.Chest, new ItemStack("minecraft:iron_chestplate", 1));
        inv.setItem(1, new ItemStack("minecraft:iron_sword", 1));
      }
      inv.setItem(2, new ItemStack("minecraft:iron_pickaxe", 1));
    } catch (e) {
      t.log(`gear for ${s.p.name}: ${e}`);
    }
    await t.wait(1);
  }
  await t.wait(40);

  // The soak: one decision per player per second.
  const valid = (p) => { try { return p.isValid; } catch { return false; } };
  const start = t.tick;
  let samples = 0, minValid = Infinity, moves = 0, switches = 0, pickups = 0, hits = 0;
  while (t.tick - start < SECONDS * 20) {
    await t.wait(20);
    let validNow = 0;
    for (let i = 0; i < players.length; i++) {
      const s = players[i];
      if (!valid(s.p)) continue;
      validNow++;
      const r = Math.random();
      try {
        if (r < 0.35) {
          s.p.moveToLocation({ x: s.home.x + rnd(17) - 8 + 0.5, y: s.home.y, z: s.home.z + rnd(17) - 8 + 0.5 });
          moves++;
        } else if (r < 0.55) {
          s.p.selectedSlotIndex = rnd(4); // empty, sword, pickaxe or the relic's slot
          switches++;
        } else if (r < 0.7) {
          const inv = s.p.getComponent("minecraft:inventory").container;
          inv.setItem(8, new ItemStack("minecraft:cobblestone", 1 + rnd(64)));
          pickups++;
        } else if (r < 0.75) {
          s.p.applyDamage(1);
          hits++;
        } else if (r < 0.85) {
          s.p.isSneaking = !s.p.isSneaking;
        }
      } catch (e) { /* a player in an odd spot: ignore */ }
    }
    samples++;
    minValid = Math.min(minValid, validNow);
  }
  const alive = players.filter((s) => valid(s.p)).length;
  const ticks = t.tick - start;
  t.log(`soak done: ${SECONDS} s, ${alive}/${N} players, ${moves} walks, ${switches} hotbar switches, ${pickups} pickups, ${hits} hits`);
  t.report("perf-workload", {
    schema: 1, declared, spawned: made, spawnGameSeconds, kinds,
    soak: { startTick: start, endTick: t.tick, ticks, seconds: ticks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    walks: moves, switches, pickups, hits,
  });
  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed in the world for the whole ${SECONDS} s soak`);
  t.check(ticks >= SECONDS * 20, `the steady window ran its full ${SECONDS} s (${(ticks / 20).toFixed(1)} s)`);
}
