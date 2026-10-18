// Tornadoes: a survival player shot out the top of the funnel lands alive. A launch carries a player 80-100 blocks
// up, more than slowFallingSeconds (8) of Slow Falling cover: before the fix the Slow Falling ran out about 75 blocks
// above the ground and the fall killed them (and dropped their inventory). Superflat, so the fall is onto land.
// node tools/test-bds/run.mjs --quiet --flat --only tornado_bp --scenario tools/test-bds/examples/tornado-landing.js --timeout 240
export default async function (t) {
  const p = await t.player("Chaser", { op: true });
  const tx = p.location.x, tz = p.location.z - 40;
  const { top } = await t.loadArea(tx, tz, { radius: 3 });
  p.lookAtLocation({ x: tx, y: top.location.y + 1, z: tz });
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:tornado_spawn").ok, "/realm:tornado_spawn ran");
  const rider = await t.player("Rider", { x: tx + 3, z: tz, settle: 1 });
  let died = false;
  t.world.afterEvents.entityDie.subscribe((e) => {
    if (e.deadEntity.id === rider.id) died = true;
  });
  const startY = rider.location.y;
  let highest = startY;
  // Up, then all the way down (the funnel may grab them again on the way: that's fine, they must still land).
  await t.waitUntil(() => {
    if (died || !rider.isValid) return true;
    highest = Math.max(highest, rider.location.y);
    return highest - startY > 30 && rider.isOnGround;
  }, { timeout: 900, message: "the rider went up and came back down" });
  t.log(`rose ${(highest - startY).toFixed(1)} blocks; health ${rider.isValid ? rider.getComponent("health").currentValue : "-"}`);
  t.check(highest - startY > 30, "the rider was launched high");
  t.check(!died, "the rider lands alive");
  t.check(!died && rider.isValid && rider.getComponent("health").currentValue >= 18, "the landing doesn't hurt (Slow Falling until the ground)");
}
