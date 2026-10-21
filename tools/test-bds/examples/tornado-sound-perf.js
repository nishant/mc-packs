// F19 measurement: players (default 30, --arg players=N: 10 and 40 are the measured counts) near a tornado for 120 s
// (--arg seconds), so every wind pulse reaches the listeners within its range.
// Profile it before and after (one stopsound per wind instead of one per listener):
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-json tools/test-bds/logs/tornado-sound-perf.json --only tornado_bp --scenario tools/test-bds/examples/tornado-sound-perf.js --timeout 3000
export default async function (t) {
  const op = await t.player("Chaser", { op: true });
  const here = op.location;
  const tx = here.x, tz = here.z - 30;
  const { top } = await t.loadArea(tx, tz, { radius: 3 });
  op.lookAtLocation({ x: tx, y: top.location.y + 1, z: tz });
  await t.wait(5);
  t.assert(t.cmd(op, "/realm:tornado_spawn").ok, "/realm:tornado_spawn ran");
  // Profiled with --no-relay, so no chat reaches the scenario: a second spawn being refused proves the tornado is up.
  await t.wait(40);
  t.assert(!t.cmd(op, "/realm:tornado_spawn").ok, "the tornado formed (a second spawn is refused)");
  // Listeners 20 to 40 blocks south of the funnel, out of its pull (and the tornado drifts slowly).
  const players = Math.max(1, Number(t.args?.players ?? 30) || 30);
  for (let i = 0; i < players - 1; i++) await t.player(`L${i}`, { x: tx - Math.floor((players - 1) / 2) + i, z: tz + 25 + (i % 3) * 5, settle: 1 });
  // A 120 s window (--arg seconds); a tornado lives 90 to 180 s, so one that ends is replaced at the same spot.
  const seconds = Math.max(10, Number(t.args?.seconds ?? 120) || 120);
  let respawns = 0;
  for (let s = 0; s < seconds; s += 5) {
    await t.wait(100);
    if (t.cmd(op, "/realm:tornado_spawn").ok) respawns++;
  }
  t.log(`${seconds} s of wind pulses for ${players} players, ${respawns} tornado(es) replaced`);
  t.check(respawns <= 2, `a tornado was up for the whole window (${respawns} replaced)`);
}
