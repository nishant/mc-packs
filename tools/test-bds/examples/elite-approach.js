// Champions: a champion slowly comes to the nearest player in range, stops short of them, and leaves
// creative players and a disabled approach alone. A spider at noon (not hostile in daylight) so its
// own AI doesn't do the walking.
// Run: node tools/test-bds/run.mjs --quiet --flat --only elite_bp --scenario tools/test-bds/examples/elite-approach.js --timeout 300
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  const p = await t.player("Tester", { op: true });
  const home = { ...p.location };
  const far = { x: Math.floor(home.x) + 30.5, y: home.y, z: Math.floor(home.z) + 0.5 };
  await t.loadArea(far.x, far.z, { radius: 3 });
  const flat = (e) => Math.hypot(e.location.x - p.location.x, e.location.z - p.location.z);
  const spawn = (tag) => {
    t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: far.x, y: far.y, z: far.z, mob: "minecraft:spider", trait: "shielded", tag }));
  };
  const find = (tag) => t.dimension.getEntities({ tags: [tag] })[0];

  // 1. Survival player: the champion closes in.
  p.setGameMode(t.mc.GameMode.Survival);
  spawn("realm:test_a");
  const a = await t.waitUntil(() => find("realm:test_a"), { timeout: 60, message: "champion spawned" });
  const d0 = flat(a);
  await t.seconds(12);
  const d1 = flat(a);
  t.log(`survival: ${d0.toFixed(1)} -> ${d1.toFixed(1)} blocks after 12 s`);
  t.check(d1 < d0 - 6, `champion came closer (${d0.toFixed(1)} -> ${d1.toFixed(1)})`);
  await t.seconds(16);
  const d2 = flat(a);
  t.log(`after 28 s: ${d2.toFixed(1)}`);
  t.check(d2 <= 14, `champion reached the player's area (${d2.toFixed(1)})`);
  t.check(d2 >= 6, `champion stops short instead of stepping onto the player (${d2.toFixed(1)})`);
  a.remove();

  // 2. Creative player: nobody to come for.
  p.setGameMode(t.mc.GameMode.Creative);
  spawn("realm:test_b");
  const b = await t.waitUntil(() => find("realm:test_b"), { timeout: 60, message: "second champion spawned" });
  const b0 = flat(b);
  await t.seconds(10);
  const b1 = flat(b);
  t.log(`creative: ${b0.toFixed(1)} -> ${b1.toFixed(1)}`);
  t.check(b1 > b0 - 4, `no approach toward a creative player (${b0.toFixed(1)} -> ${b1.toFixed(1)})`);
  b.remove();
}
