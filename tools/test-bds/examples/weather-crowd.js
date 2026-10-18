// Weather events with a crowd: N simulated players stand together (within about 20 blocks) 300 blocks from the world
// spawn while one of each weather event happens to all of them at once, so a profile shows whether an event's cost
// grows with the players around it (one storm cell, one tornado, one meteor for everyone). Meant for --profile; it
// checks only that the players stay in the world.
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-json /tmp/wc.json --only rain_bp,weather_bp,storm_bp,climate_bp,calendar_bp,tornado_bp,rainbow_bp,moon_bp,meteor_bp,night_bp,leaves_bp,translucent_bp --scenario tools/test-bds/examples/weather-crowd.js --arg players=10 --timeout 1500
// Arguments: players (default 10), storm (seconds of the thunderstorm phase, default 60), clear (seconds of the clear
// night phase, default 40).
// Phase 1, thunderstorm at night: rain extras for everyone, a forced storm cell over the crowd, a tornado 40 blocks
// from the operator, a Blood Moon and a meteor. Phase 2, clear night: a rainbow (its pot), shooting stars and the
// aurora roll. Players walk around a little the whole time.
export default async function (t) {
  const N = Math.max(1, Number(t.args.players ?? 10));
  const STORM = Math.max(10, Number(t.args.storm ?? 60));
  const CLEAR = Math.max(10, Number(t.args.clear ?? 40));
  const over = t.world.getDimension("overworld");
  const sp = t.world.getDefaultSpawnLocation();
  const cx = sp.x + 300, cz = sp.z;
  t.server("/gamerule sendcommandfeedback false");
  const clearAreas = () => { try { over.runCommand("tickingarea remove_all"); } catch { /* none */ } };
  const rnd = (n) => Math.floor(Math.random() * n);
  const players = [];
  for (let i = 0; i < N; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      clearAreas();
      try {
        const p = await t.player(`Crowd${String(i + 1).padStart(2, "0")}`, { x: cx + rnd(41) - 20 + attempt * 3, z: cz + rnd(41) - 20, op: i === 0, settle: 2 });
        players.push({ p, home: { ...p.location } });
        break;
      } catch (e) {
        t.log(`spawn ${i + 1} try ${attempt + 1}: ${e}`);
      }
    }
  }
  clearAreas();
  t.log(`spawned ${players.length}/${N} at ${cx}, ${cz}`);
  t.assert(players.length > 0, "players spawned");
  const op = players[0].p;
  const has = (pack) => t.packs.includes(pack);
  const run = (cmd) => { const r = t.cmd(op, cmd); if (!r.ok) t.log(`${cmd}: ${r.error ?? "failed"}`); };
  const walk = async (seconds) => {
    for (let s = 0; s < seconds; s++) {
      await t.wait(20);
      for (const { p, home } of players) {
        try {
          if (!p.isValid) continue;
          const r = Math.random();
          if (r < 0.3) p.moveToLocation({ x: home.x + rnd(13) - 6, y: home.y, z: home.z + rnd(13) - 6 });
          else if (r < 0.6) p.lookAtLocation({ x: p.location.x + rnd(21) - 10, y: p.location.y + rnd(5) - 2, z: p.location.z + rnd(21) - 10 });
        } catch { /* an odd spot */ }
      }
    }
  };

  // Phase 1: a thunderstorm at night.
  t.server("/time set 14000");
  run(has("weather_bp") ? "/realm:weather_set thunder 30" : "/weather thunder");
  await t.wait(40);
  if (has("storm_bp")) run("/realm:storm_cell true");
  if (has("moon_bp")) run("/realm:moon_set blood");
  if (has("meteor_bp")) run("/realm:meteor_now");
  if (has("tornado_bp")) {
    op.lookAtLocation({ x: op.location.x, y: op.location.y, z: op.location.z - 40 });
    await t.wait(2);
    run("/realm:tornado_spawn");
  }
  await walk(STORM);
  // Phase 2: a clear night.
  run(has("weather_bp") ? "/realm:weather_set clear 30" : "/weather clear");
  t.server("/time set 15000");
  await t.wait(20);
  if (has("rainbow_bp")) run("/realm:rainbow_now");
  await walk(CLEAR);
  const left = players.filter(({ p }) => { try { return p.isValid; } catch { return false; } }).length;
  t.log(`${left} players still in the world`);
  t.check(left === players.length, "every player is still in the world");
}
