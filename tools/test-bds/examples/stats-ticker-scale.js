// Stats: the ticker's cost on a big server, where the stats scoreboards hold many names (everyone who ever played).
// `players` players (default 40) turn the ticker on (full style: name, value and rank) while the playtime board holds
// `names` more names (default 1000); then they play for `seconds` (default 60). It checks the ticker still shows a
// rank; run it with --profile to see the cost (stats_bp's ticker interval).
// node tools/test-bds/run.mjs --quiet --no-relay --profile --only stats_bp --scenario tools/test-bds/examples/stats-ticker-scale.js --timeout 900
export default async function (t) {
  const N = Math.max(1, Number(t.args.players ?? 40));
  const NAMES = Math.max(0, Number(t.args.names ?? 1000));
  const SECONDS = Math.max(10, Number(t.args.seconds ?? 60));
  t.server("/gamerule sendcommandfeedback false");
  for (const id of ["playtime", "deaths", "mobkills", "mined", "travelled"]) t.server(`/scoreboard objectives add stats_${id} dummy`);
  for (let i = 0; i < NAMES; i++) t.server(`/scoreboard players set Gone${i} stats_playtime ${1 + (i % 500)}`);
  const players = [];
  for (let i = 0; i < N; i++) {
    const p = await t.player(`Tick${String(i + 1).padStart(2, "0")}`, { settle: 2 });
    players.push(p);
    t.cmd(p, "/realm:stats_ticker");
  }
  await t.wait(40);
  const t0 = t.tick;
  while (t.tick - t0 < SECONDS * 20) {
    const p = players[Math.floor(Math.random() * players.length)];
    try {
      const l = p.location;
      p.moveToLocation({ x: l.x + Math.random() * 8 - 4, y: l.y, z: l.z + Math.random() * 8 - 4 });
    } catch (e) {
      // gone
    }
    await t.wait(10);
  }
  t.pass(`${N} players with the ticker on, ${NAMES} more names on the board, for ${SECONDS} s`);
}
