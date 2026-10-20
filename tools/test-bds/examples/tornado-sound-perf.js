// F19 measurement: 30 players within the wind's range of a tornado for a minute, so every wind pulse reaches them all.
// Profile it before and after (one stopsound per wind instead of one per listener):
//   node tools/test-bds/run.mjs --quiet --no-relay --profile --profile-json <out.json> --only tornado_bp --scenario tools/test-bds/examples/tornado-sound-perf.js --timeout 3000
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
  for (let i = 0; i < 29; i++) await t.player(`L${i}`, { x: tx - 14 + i, z: tz + 25 + (i % 3) * 5, settle: 1 });
  await t.wait(1200);
  t.check(!t.cmd(op, "/realm:tornado_spawn").ok, "the tornado lasted the whole minute of wind pulses for 30 listeners");
}
