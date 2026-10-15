// Champions: a champion slowly comes to the nearest player in range, stops short of them, and leaves
// creative players and a disabled approach alone. A spider at noon (not hostile in daylight) so its
// own AI doesn't do the walking. Then: a player in a safe zone draws nobody, and a wall standing over a
// cellar is not stepped through by a zombie (a guard: on BDS the
// physics pushed the old code's step back out of the block, so this case passed before the fix too) (it used to be: a step down only looked at the target column's feet and head).
// Run: node tools/test-bds/run.mjs --quiet --flat --only elite_bp --scenario tools/test-bds/examples/elite-approach.js --timeout 300
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  const p = await t.player("Tester", { op: true });
  const home = { ...p.location };
  const far = { x: Math.floor(home.x) + 30.5, y: home.y, z: Math.floor(home.z) + 0.5 };
  await t.loadArea(far.x, far.z, { radius: 3 });
  const flat = (e) => Math.hypot(e.location.x - p.location.x, e.location.z - p.location.z);
  const spawn = (tag, mob = "minecraft:spider") => {
    t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: far.x, y: far.y, z: far.z, mob, trait: "shielded", tag }));
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

  // 3. A player inside a safe zone (any provider's realm:zones list): no approach.
  p.setGameMode(t.mc.GameMode.Survival);
  t.system.sendScriptEvent("realm:zones", JSON.stringify({ src: "test", part: 1, parts: 1, zones: [{ id: "home", name: "Home", dim: "minecraft:overworld", x: home.x, z: home.z, r: 6 }] }));
  await t.wait(5);
  spawn("realm:test_c");
  const c = await t.waitUntil(() => find("realm:test_c"), { timeout: 60, message: "third champion spawned" });
  const c0 = flat(c);
  await t.seconds(10);
  const c1 = flat(c);
  t.log(`player in a safe zone: ${c0.toFixed(1)} -> ${c1.toFixed(1)}`);
  t.check(c1 > c0 - 4, `no approach toward a player in a safe zone (${c0.toFixed(1)} -> ${c1.toFixed(1)})`);
  c.remove();
  t.system.sendScriptEvent("realm:zones", JSON.stringify({ src: "test", part: 1, parts: 0, zones: [] }));
  await t.wait(5);

  // 4. A wall two high standing over a cellar, between them: the champion doesn't go through.
  const wx = Math.floor(home.x) + 20;
  const fy = Math.floor(home.y);
  t.server(`/fill ${wx} ${fy - 3} ${Math.floor(home.z) - 14} ${wx} ${fy - 1} ${Math.floor(home.z) + 14} air`);
  t.server(`/fill ${wx} ${fy} ${Math.floor(home.z) - 14} ${wx} ${fy + 1} ${Math.floor(home.z) + 14} stone`);
  t.server(`/fill ${wx} ${fy - 4} ${Math.floor(home.z) - 14} ${wx} ${fy - 4} ${Math.floor(home.z) + 14} stone`);
  await t.wait(5);
  spawn("realm:test_d", "minecraft:zombie"); // spiders climb walls
  const d = await t.waitUntil(() => find("realm:test_d"), { timeout: 60, message: "fourth champion spawned" });
  let through = false;
  for (let k = 0; k < 30; k++) {
    await t.wait(10);
    if (d.isValid && d.location.x < wx) through = true;
  }
  t.log(`wall: champion at x ${(d.location.x - wx).toFixed(1)} from the wall, y ${(d.location.y - fy).toFixed(1)}`);
  t.check(!through, "the champion didn't step through the wall into the cellar");
  d.remove();
}
