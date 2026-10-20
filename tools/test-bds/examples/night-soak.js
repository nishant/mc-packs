// Night soak: perf-soak's crowd (groups of simulated players spread over the world, walking and looking around) through
// one whole night, so the costs that only come with the dark show up: natural monsters, Champions (0.8 a player as the
// owner keeps it, ceiling 80: up to 3 near each group, the nearby limit, and the rest far from every player, in
// ticking areas, so both the near and the far champion paths cost what they do), their aura and approach, a Blood Moon's fog and waves, wanderers at night,
// and the dawn cleanup. The night is played fast: the clock runs and the scenario adds time every second so that dusk
// to dawn fits in `seconds`. The window is split into phases (dusk, early, mid, late, dawn) that the profiler reports
// one by one (lib/profile-report.mjs), to see how a cost grows from the start to the end of the night (O3, O7).
// Players get Resistance 255 so the night's monsters don't kill them (a dead player would leave the population).
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --only wander_bp,elite_bp,npc_bp,caravan_bp,moon_bp --scenario tools/test-bds/examples/night-soak.js --arg players=10 --arg seconds=180 --timeout 1500
// For the O3/O7 measurements: --profile-json <out>.json and --arg players=40 (or 100) --arg seconds=300 --timeout 3000.
// Arguments (--arg key=value): players (default 10), seconds (dusk to dawn, default 300), blood (1 = a Blood Moon if
// moon_bp is loaded, default 1), champions (champions asked for at dusk, default ceil(0.8 * players), at most 80),
// near (how many of them come 20-35 blocks from a group, default 3 per group, the nearby limit; the rest go to up to
// 4 far spots, at least 110 blocks from every group and kept loaded by a ticking area), group (players per group,
// default 5), spread (blocks between far groups, default 240).
export default async function (t) {
  const a = t.args;
  const N = Math.max(1, Number(a.players ?? 10));
  const SECONDS = Math.max(60, Number(a.seconds ?? 300));
  const GROUP = Math.max(1, Number(a.group ?? 5));
  const SPREAD = Math.max(50, Number(a.spread ?? 240));
  const BLOOD = Number(a.blood ?? 1) === 1 && t.packs.includes("moon_bp");
  const GROUPS = Math.ceil(N / GROUP);
  const CHAMPIONS = Math.min(80, Math.max(0, Number(a.champions ?? Math.ceil(0.8 * N))));
  const NEAR = Math.min(CHAMPIONS, Math.max(0, Number(a.near ?? GROUPS * 3)));
  const over = t.world.getDimension("overworld");
  const spawn = t.world.getDefaultSpawnLocation();
  const SX = spawn.x === 0 && spawn.z === 0 ? 163 : spawn.x, SZ = spawn.z === 0 && spawn.x === 0 ? 170 : spawn.z;
  t.server("/gamerule sendcommandfeedback false");
  t.server("/gamerule showcoordinates false");
  t.server("/gamerule dodaylightcycle false");
  t.server("/time set 6000");

  const clearedAreas = new Set();
  // Bedrock allows 10 ticking areas: the harness adds one per spawn, so they are removed after each (the players keep
  // their own chunks loaded). Never a production pack's loader.
  const clearAreas = () => {
    const raw = t.world.getDynamicProperty("harness:tickingAreas");
    const areas = raw === undefined ? [] : JSON.parse(raw);
    if (!Array.isArray(areas)) throw new Error("The harness ticking-area list is not an array");
    for (const area of areas) {
      const key = `${area.dimension}|${area.name}`;
      if (clearedAreas.has(key)) continue;
      if (!/^harness_\d+_\d+$/.test(area.name) || !["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].includes(area.dimension))
        throw new Error("Refusing to remove an area not owned by the harness");
      const result = t.world.getDimension(area.dimension).runCommand(`tickingarea remove "${area.name}"`);
      if (!(result.successCount > 0)) throw new Error(`Could not remove fixture area ${area.name}`);
      clearedAreas.add(key);
    }
  };
  const rnd = (n) => Math.floor(Math.random() * n);
  const ringSpot = (k) => {
    const i = k - 2, ring = 1 + Math.floor(i / 8), dir = i % 8;
    const dx = [1, 0, -1, 0, 1, -1, 1, -1][dir], dz = [0, 1, 0, -1, 1, 1, -1, -1][dir];
    return { x: SX + dx * ring * SPREAD, z: SZ + dz * ring * SPREAD };
  };
  const groupSpot = (g) => (g === 0 ? { x: SX, z: SZ } : g === 1 ? { x: SX + 30, z: SZ + 10 } : ringSpot(g));
  // Far spots for the champions over the nearby limit: halfway between the groups' grid points, at least FAR_GAP blocks
  // from every group (Champions' aura reaches 64 blocks and the approach 48 + 16 of sorting room; players walk 8 from
  // home and groups spread 4), nearest the spawn first. Each is kept loaded by its own ticking area (radius 2 chunks).
  const FAR_GAP = 110;
  /** @type {{ x: number, z: number }[]} */
  const farSpots = [];
  if (CHAMPIONS > NEAR) {
    const cands = [];
    for (let i = -3; i <= 2; i++) for (let j = -3; j <= 2; j++) cands.push({ x: Math.round(SX + (i + 0.5) * SPREAD), z: Math.round(SZ + (j + 0.5) * SPREAD) });
    cands.sort((p, q) => (p.x - SX) ** 2 + (p.z - SZ) ** 2 - ((q.x - SX) ** 2 + (q.z - SZ) ** 2));
    for (const c of cands) {
      if (farSpots.length >= 4) break;
      let ok = true;
      for (let g = 0; g < GROUPS && ok; g++) {
        const s = groupSpot(g);
        if ((s.x - c.x) ** 2 + (s.z - c.z) ** 2 < FAR_GAP * FAR_GAP) ok = false;
      }
      if (ok) farSpots.push(c);
    }
  }

  /** @type {{ p: any, name: string, home: {x:number, y:number, z:number}, g: number }[]} */
  const players = [];
  const t0 = t.tick;
  let made = 0;
  const name = (i) => `Night${String(i + 1).padStart(2, "0")}`;
  for (let i = 0; i < N; i++) {
    const g = Math.floor(i / GROUP);
    const c = groupSpot(g);
    const spot = { x: c.x + rnd(9) - 4, z: c.z + rnd(9) - 4 };
    for (let attempt = 0; attempt < 3; attempt++) {
      clearAreas();
      await t.wait(1);
      const at = attempt ? { ...spot, x: spot.x + attempt * 7, z: spot.z - attempt * 5 } : spot;
      try {
        const p = await t.player(name(i), { ...at, dimension: "overworld", op: i === 0, settle: 2 });
        const l = p.location;
        players.push({ p, name: name(i), home: { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }, g });
        made++;
        break;
      } catch (e) {
        t.log(`could not spawn ${name(i)} (try ${attempt + 1}): ${e}`);
      }
    }
    clearAreas();
    await t.wait(1);
  }
  t.log(`spawned ${made}/${N} players in ${((t.tick - t0) / 20).toFixed(0)} s (0 in water, 0 in the Nether, ${GROUPS} groups)`);
  const kinds = { land: made, water: 0, nether: 0, groups: GROUPS };
  const FAR = farSpots.length ? CHAMPIONS - NEAR : 0;
  const declared = { players: N, seconds: SECONDS, group: GROUP, spread: SPREAD, commands: 0, water: 0, nether: 0, blood: BLOOD, champions: NEAR + FAR, nearChampions: NEAR, farChampions: FAR, farSpots: farSpots.length };
  const spawnGameSeconds = (t.tick - t0) / 20;
  t.report("perf-workload", { schema: 1, declared, spawned: made, spawnGameSeconds, kinds });
  t.assert(made === N, `all ${N} declared players spawned (${made} did)`);
  t.server("/effect @a resistance 100000 255 true");
  t.server("/effect @a saturation 100000 255 true");
  // The far spots load during dusk (about 20 s before nightfall), ready for their champions.
  farSpots.forEach((s, k) => t.server(`/tickingarea add circle ${s.x} 64 ${s.z} 2 night_far${k} true`));
  if (farSpots.length) await t.wait(100);
  if (CHAMPIONS > NEAR && !farSpots.length) t.log(`no far spot ${FAR_GAP} blocks from every group: only the ${NEAR} near champions come`);

  // Dusk: a Blood Moon is chosen for tonight (it starts at nightfall), the clock runs from just before dark.
  const champCount = () => {
    try {
      return over.getEntities({ tags: ["realm:champion"] }).length;
    } catch (e) {
      return -1;
    }
  };
  // Champions loaded at the far spots (within 40 blocks of one), to see the far ones stay put and loaded.
  const farCount = () => {
    let n = 0;
    for (const s of farSpots) {
      try {
        n += over.getEntities({ tags: ["realm:champion"], location: { x: s.x, y: 64, z: s.z }, maxDistance: 40 }).length;
      } catch (e) {
        return -1;
      }
    }
    return n;
  };
  const monsters = () => {
    try {
      return over.getEntities({ families: ["monster"] }).length;
    } catch (e) {
      return -1;
    }
  };
  if (BLOOD) t.assert(t.cmd(players[0].p, "/realm:moon_set blood").ok, "moon_set blood ran");
  t.server("/time set 12000");
  t.server("/gamerule dodaylightcycle true");
  // Dusk to dawn (12000 to 24000 plus 1000 of morning) in SECONDS: the clock gives 20 ticks a second, the rest is added.
  const SPAN = 13000;
  const add = Math.max(0, Math.round(SPAN / SECONDS) - 20);
  const phaseOf = (time) => (time < 13000 ? "dusk" : time < 15500 ? "early" : time < 20500 ? "mid" : time < 23000 ? "late" : "dawn");
  /** @type {{ name: string, startTick: number, endTick: number, champions: number, far: number, monsters: number }[]} */
  const phases = [];
  let askedChampions = false;
  const start = t.tick;
  let moves = 0, samples = 0, minValid = Infinity, lastLog = start;
  const valid = (p) => { try { return p.isValid; } catch (e) { return false; } };
  while (t.tick - start < SECONDS * 20) {
    await t.wait(20);
    if (add) t.server(`/time add ${add}`);
    const time = t.world.getTimeOfDay() + (t.tick - start > 40 && t.world.getTimeOfDay() < 12000 ? 24000 : 0);
    const ph = phaseOf(time);
    const cur = phases[phases.length - 1];
    if (!cur || cur.name !== ph) {
      if (cur) {
        cur.endTick = t.tick;
        cur.champions = champCount();
        cur.far = farCount();
        cur.monsters = monsters();
        t.log(`phase ${cur.name} done: ${((cur.endTick - cur.startTick) / 20).toFixed(0)} s, ${cur.champions} champions (${cur.far} far), ${cur.monsters} monsters loaded`);
      }
      phases.push({ name: ph, startTick: t.tick, endTick: t.tick, champions: 0, far: 0, monsters: 0 });
    }
    // At nightfall the champions the owner's density allows come: 3 near each group (the nearby limit), the rest at the
    // far spots, where no player comes (they take only their sort, never an aura or approach turn).
    if (!askedChampions && time >= 13000 && t.packs.includes("elite_bp")) {
      askedChampions = true;
      for (let k = 0; k < NEAR + FAR; k++) {
        const near = k < NEAR;
        const c = near ? groupSpot(k % GROUPS) : farSpots[(k - NEAR) % farSpots.length];
        const angle = Math.random() * Math.PI * 2, r = near ? 20 + rnd(15) : rnd(11);
        const x = Math.floor(c.x + Math.cos(angle) * r) + 0.5, z = Math.floor(c.z + Math.sin(angle) * r) + 0.5;
        let y = 64;
        try { y = (over.getTopmostBlock({ x, z })?.location.y ?? 63) + 1; } catch (e) { /* unloaded: the default height */ }
        t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ dim: "minecraft:overworld", x, y, z }));
      }
      t.log(`asked for ${NEAR + FAR} champions at nightfall: ${NEAR} near the groups, ${FAR} at ${farSpots.length} far spots`);
    }
    let validNow = 0;
    for (const s of players) {
      if (!valid(s.p)) continue;
      validNow++;
      const r = Math.random();
      try {
        if (r < 0.35) {
          s.p.moveToLocation({ x: s.home.x + rnd(17) - 8 + 0.5, y: s.home.y, z: s.home.z + rnd(17) - 8 + 0.5 });
          moves++;
        } else if (r < 0.65) {
          const l = s.p.location;
          s.p.lookAtLocation({ x: l.x + rnd(21) - 10, y: l.y + rnd(5) - 2, z: l.z + rnd(21) - 10 });
        } else if (r < 0.75) {
          s.p.jump();
        }
      } catch (e) { /* a player in an odd spot: ignore */ }
    }
    samples++;
    minValid = Math.min(minValid, validNow);
    if (t.tick - lastLog >= 1200) {
      lastLog = t.tick;
      t.log(`night ${Math.floor((t.tick - start) / 20)} s, time ${t.world.getTimeOfDay()}: ${validNow} players, ${champCount()} champions, ${monsters()} monsters`);
    }
  }
  const last = phases[phases.length - 1];
  if (last) {
    last.endTick = t.tick;
    last.champions = champCount();
    last.far = farCount();
    last.monsters = monsters();
    t.log(`phase ${last.name} done: ${((last.endTick - last.startTick) / 20).toFixed(0)} s, ${last.champions} champions (${last.far} far), ${last.monsters} monsters loaded`);
  }
  farSpots.forEach((s, k) => t.server(`/tickingarea remove night_far${k}`));
  const alive = players.filter((x) => valid(x.p)).length;
  t.log(`soak done: ${SECONDS} s, ${alive}/${N} players still in the world, ${moves} walks, 0 commands`);
  const soakTicks = t.tick - start;
  t.report("perf-workload", {
    schema: 1, declared, spawned: made, spawnGameSeconds, kinds,
    soak: { startTick: start, endTick: t.tick, ticks: soakTicks, seconds: soakTicks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    walks: moves, commands: 0,
    phases,
  });
  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed in the world for the whole ${SECONDS} s night (fewest at any second: ${samples ? minValid : 0}, at the end: ${alive})`);
  t.check(soakTicks >= SECONDS * 20, `the night ran its full ${SECONDS} s of game time (${(soakTicks / 20).toFixed(1)} s)`);
  t.check(phases.some((p) => p.name === "mid") && phases.some((p) => p.name === "dawn"), `the soak went from dusk through the night to dawn (${phases.map((p) => p.name).join(", ")})`);
}
