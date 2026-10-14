// Realm Calendar: a regatta course set on a lake puts its checkpoints on the water and says so. getTopmostBlock
// skips water (it answers the lake bed), so before the fix every checkpoint read as dry land ("0 of 9").
// About 30 seconds:
//   node tools/test-bds/run.mjs --quiet --flat --only calendar_bp --scenario tools/test-bds/examples/calendar-course.js --timeout 300
export default async function (t) {
  const p = await t.player("Captain", { op: true });
  const x = Math.floor(p.location.x), z = Math.floor(p.location.z);
  const ground = t.dimension.getTopmostBlock({ x, z });
  t.assert(ground, "ground under the player");
  // Face south (yaw 0): the course loops 40 blocks out to the player's right (west, -x), up to about 90 blocks away.
  for (const dz of [-32, 32]) for (const dx of [-72, -8]) await t.loadArea(x + dx, z + dz, { radius: 3 });
  for (const x0 of [x - 92, x - 45]) t.assert(t.server(`/fill ${x0} ${ground.y} ${z - 54} ${x0 + 46} ${ground.y} ${z + 54} water`).ok, "a lake");
  await t.wait(10);
  p.teleport({ x: x + 0.5, y: ground.y + 1, z: z + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(5);
  t.answerForm(p, "Operators", "Set the regatta course");
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:calendar").ok, "/realm:calendar ran");
  const msg = await t.waitMessage(p, /checkpoints are on water/, { timeout: 200, since });
  t.log(msg.plain);
  const m = /(\d+) of (\d+) checkpoints are on water/.exec(msg.plain);
  t.check(!!m && Number(m[1]) >= Number(m[2]) - 1, `the checkpoints are on the lake (${m?.[1]} of ${m?.[2]})`);
}
