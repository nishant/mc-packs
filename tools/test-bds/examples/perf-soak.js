// Performance soak: many simulated players spread around the world for a few minutes, walking, looking
// around, sneaking, jumping and running a few common commands, so the packs do their usual per-player
// work. Meant for run.mjs --profile. A soak only counts as an N-player measurement when all N players
// spawned, all of them stayed in the world at every second of the soak, the declared water and Nether
// players were placed, and the full steady window ran: the scenario fails otherwise and reports
// {declared, spawned, retention, soak window} as `perf-workload`, which run.mjs puts into the profile JSON
// next to its acceptance verdict (lib/perf-acceptance.mjs).
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --scenario tools/test-bds/examples/perf-soak.js --arg players=10 --arg seconds=300 --timeout 900
// Arguments (--arg key=value): players (default 10), seconds (default 300), group (players per
// group, default 5), spread (blocks between far groups, default 240), commands (seconds between one
// player's commands, default 45; 0 = none), water (players put in a pool, default 2), nether
// (players in the Nether, default 2).
// Layout: group 0 at the world spawn and group 1 30 blocks from it; the other groups on a ring of
// `spread`-block steps around spawn (so 200+ blocks apart). Water players stand in a 7x7 pool dug at
// group 1; Nether players stand in a cleared pocket at the spawn's Nether coordinates.
// Bedrock allows 10 ticking areas: the harness adds one per spawn, so this removes them after each
// spawn (the players keep their own chunks loaded).
export default async function (t) {
  const a = t.args;
  const N = Math.max(1, Number(a.players ?? 10));
  const SECONDS = Math.max(10, Number(a.seconds ?? 300));
  const GROUP = Math.max(1, Number(a.group ?? 5));
  const SPREAD = Math.max(50, Number(a.spread ?? 240));
  const CMD_EVERY = Math.max(0, Number(a.commands ?? 45));
  const WATER = Math.min(N, Math.max(0, Number(a.water ?? 2)));
  const NETHER = Math.min(Math.max(0, N - WATER - 1), Math.max(0, Number(a.nether ?? 2)));
  const over = t.world.getDimension("overworld");
  const nether = t.world.getDimension("nether");
  const spawn = t.world.getDefaultSpawnLocation();
  const SX = spawn.x === 0 && spawn.z === 0 ? 163 : spawn.x, SZ = spawn.z === 0 && spawn.x === 0 ? 170 : spawn.z;
  t.server("/gamerule sendcommandfeedback false");
  t.server("/gamerule showcoordinates false");

  const clearAreas = () => {
    for (const d of [over, nether]) { try { d.runCommand("tickingarea remove_all"); } catch (e) { /* none */ } }
  };
  const rnd = (n) => Math.floor(Math.random() * n);
  const ringSpot = (k) => {
    // group k >= 2: k-1 steps of SPREAD on a square spiral (x, z, -x, -z, then 2x, ...)
    const i = k - 2, ring = 1 + Math.floor(i / 8), dir = i % 8;
    const dx = [1, 0, -1, 0, 1, -1, 1, -1][dir], dz = [0, 1, 0, -1, 1, 1, -1, -1][dir];
    return { x: SX + dx * ring * SPREAD, z: SZ + dz * ring * SPREAD };
  };
  const groupSpot = (g) => (g === 0 ? { x: SX, z: SZ } : g === 1 ? { x: SX + 30, z: SZ + 10 } : ringSpot(g));

  /** @type {{ p: any, name: string, home: {x:number, y:number, z:number}, dim: any, kind: string }[]} */
  const players = [];
  const t0 = t.tick;

  // Water pool at group 1 (dug where the ground is, so it stays put).
  let pool = null;
  if (WATER) {
    const c = groupSpot(1);
    const { top } = await t.loadArea(c.x + 20, c.z, { radius: 2 });
    const y = top.location.y;
    const x = Math.floor(c.x + 20), z = Math.floor(c.z);
    t.server(`/fill ${x - 3} ${y - 3} ${z - 4} ${x + 3} ${y + 3} ${z + 3} air`);
    t.server(`/fill ${x - 4} ${y - 4} ${z - 4} ${x + 4} ${y - 4} ${z + 4} stone`);
    t.server(`/fill ${x - 3} ${y - 3} ${z - 3} ${x + 3} ${y} ${z + 3} water`);
    pool = { x, y: y - 2, z };
    clearAreas();
  }
  // Nether pocket.
  let pocket = null;
  if (NETHER) {
    const x = Math.floor(SX / 8), z = Math.floor(SZ / 8);
    try { nether.runCommand(`tickingarea add circle ${x} 0 ${z} 2 soak_nether true`); } catch (e) { t.log(`nether ticking area: ${e}`); }
    const ok = await t.waitUntil(() => nether.getBlock({ x, y: 64, z }), { timeout: 600, message: "nether chunk did not load" }).catch(() => false);
    if (ok) {
      nether.runCommand(`fill ${x - 4} 64 ${z - 4} ${x + 4} 69 ${z + 4} air`);
      nether.runCommand(`fill ${x - 4} 63 ${z - 4} ${x + 4} 63 ${z + 4} netherrack`);
      pocket = { x, y: 64, z };
    }
  }

  let made = 0;
  const name = (i) => `Soak${String(i + 1).padStart(2, "0")}`;
  for (let i = 0; i < N; i++) {
    let kind = "land", dim = over, spot;
    if (i >= 1 && i <= WATER && pool) { kind = "water"; spot = { x: pool.x - 1 + i, y: pool.y, z: pool.z }; }
    else if (i > WATER && i <= WATER + NETHER && pocket) { kind = "nether"; dim = nether; spot = { x: pocket.x - 2 + (i - WATER), y: pocket.y, z: pocket.z }; }
    else {
      const g = Math.floor(i / GROUP);
      const c = groupSpot(g);
      spot = { x: c.x + rnd(9) - 4, z: c.z + rnd(9) - 4 };
    }
    // A busy server sometimes misses the harness's chunk wait: try again a little further on.
    for (let attempt = 0; attempt < 3; attempt++) {
      clearAreas();
      const at = attempt && kind === "land" ? { ...spot, x: spot.x + attempt * 7, z: spot.z - attempt * 5 } : spot;
      try {
        const p = await t.player(name(i), { ...at, dimension: kind === "nether" ? "nether" : "overworld", op: i === 0, settle: 2 });
        const l = p.location;
        players.push({ p, name: name(i), home: { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }, dim, kind });
        made++;
        break;
      } catch (e) {
        t.log(`could not spawn ${name(i)} (${kind}, try ${attempt + 1}): ${e}`);
      }
    }
    clearAreas();
  }
  t.log(`spawned ${made}/${N} players in ${((t.tick - t0) / 20).toFixed(0)} s (${players.filter((x) => x.kind === "water").length} in water, ${players.filter((x) => x.kind === "nether").length} in the Nether, ${Math.ceil(N / GROUP)} groups)`);
  const kinds = { land: players.filter((x) => x.kind === "land").length, water: players.filter((x) => x.kind === "water").length, nether: players.filter((x) => x.kind === "nether").length, groups: Math.ceil(N / GROUP) };
  const declared = { players: N, seconds: SECONDS, group: GROUP, spread: SPREAD, commands: CMD_EVERY, water: WATER, nether: NETHER };
  const spawnGameSeconds = (t.tick - t0) / 20;
  // The profile only counts as an N-player measurement when all N spawned (the old guard was `made > 0`): report what
  // happened first, so a short run is documented in the profile JSON, then fail.
  t.report("perf-workload", { schema: 1, declared, spawned: made, spawnGameSeconds, kinds });
  t.assert(made === N, `all ${N} declared players spawned (${made} did)`);

  const COMMANDS = [
    ["help_bp", "/realm:help"], ["stats_bp", "/realm:stats"], ["hud_bp", "/realm:hud"], ["quests_bp", "/realm:quests"],
    ["map_bp", "/realm:map"], ["party_bp", "/realm:party"], ["death_bp", "/realm:death"], ["weather_bp", "/realm:weather"],
    ["crowns_bp", "/realm:crowns_balance"], ["journal_bp", "/realm:journal"], ["goals_bp", "/realm:goals"], ["calendar_bp", "/realm:calendar"],
  ].filter(([pack]) => t.packs.includes(pack)).map(([, c]) => c);

  // The soak itself: one decision per player per second; commands staggered across players.
  const start = t.tick;
  let commands = 0, moves = 0, lastLog = start, samples = 0, minValid = Infinity;
  const valid = (p) => { try { return p.isValid; } catch (e) { return false; } };
  while (t.tick - start < SECONDS * 20) {
    await t.wait(20);
    const sec = Math.floor((t.tick - start) / 20);
    let validNow = 0;
    for (let i = 0; i < players.length; i++) {
      const s = players[i];
      if (!valid(s.p)) continue;
      validNow++;
      const r = Math.random();
      try {
        if (s.kind === "land" && r < 0.35) {
          s.p.moveToLocation({ x: s.home.x + rnd(17) - 8 + 0.5, y: s.home.y, z: s.home.z + rnd(17) - 8 + 0.5 });
          moves++;
        } else if (r < 0.65) {
          const l = s.p.location;
          s.p.lookAtLocation({ x: l.x + rnd(21) - 10, y: l.y + rnd(5) - 2, z: l.z + rnd(21) - 10 });
        } else if (r < 0.75) {
          s.p.isSneaking = !s.p.isSneaking;
        } else if (r < 0.8) {
          s.p.jump();
        } else if (r < 0.85 && s.kind === "land") {
          s.p.stopMoving();
        }
      } catch (e) { /* a player in an odd spot: ignore */ }
      if (CMD_EVERY && COMMANDS.length && (sec + i * 7) % CMD_EVERY === 0) {
        t.cmd(s.p, COMMANDS[(sec + i) % COMMANDS.length]);
        commands++;
      }
    }
    samples++;
    minValid = Math.min(minValid, validNow);
    if (t.tick - lastLog >= 1200) {
      lastLog = t.tick;
      t.log(`soak ${sec} s: ${players.filter((x) => valid(x.p)).length} players in the world, ${moves} walks, ${commands} commands`);
    }
  }
  const alive = players.filter((x) => valid(x.p)).length;
  t.log(`soak done: ${SECONDS} s, ${alive}/${N} players still in the world, ${moves} walks, ${commands} commands`);
  const soakTicks = t.tick - start;
  t.report("perf-workload", {
    schema: 1, declared, spawned: made, spawnGameSeconds, kinds,
    soak: { startTick: start, endTick: t.tick, ticks: soakTicks, seconds: soakTicks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    walks: moves, commands,
  });
  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed in the world for the whole ${SECONDS} s soak (fewest at any second: ${samples ? minValid : 0}, at the end: ${alive})`);
  t.check(soakTicks >= SECONDS * 20, `the steady window ran its full ${SECONDS} s of game time (${(soakTicks / 20).toFixed(1)} s)`);
}
