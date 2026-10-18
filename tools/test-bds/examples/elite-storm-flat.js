// Champions on a superflat world: a Stormcaller's lightning strikes near a player in a storm. The build check reads
// 4 blocks down from the surface; on superflat that went below the world floor, the read threw, and every column
// counted as built, so Stormcallers only crackled. About 40 seconds:
//   node tools/test-bds/run.mjs --quiet --flat --only elite_bp --scenario tools/test-bds/examples/elite-storm-flat.js --timeout 300
export default async function (t) {
  t.server("/gamerule domobspawning false");
  t.server("/gamerule dofiretick false");
  const p0 = await t.player("Tester", { op: true });
  // Away from the world spawn (strikes there only crackle anyway).
  const home = { x: Math.floor(p0.location.x) + 150.5, y: p0.location.y, z: Math.floor(p0.location.z) + 0.5 };
  await t.loadArea(home.x, home.z, { radius: 3 });
  p0.teleport(home);
  p0.setGameMode(t.mc.GameMode.Survival);
  await t.wait(20);
  t.log(`ground at y ${Math.floor(p0.location.y)}, world floor ${t.dimension.heightRange.min}`);
  t.server("/weather thunder");
  await t.wait(10);
  const bolts = [];
  t.world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    try {
      if (entity.typeId === "minecraft:lightning_bolt") bolts.push({ tick: t.tick, x: entity.location.x, z: entity.location.z });
    } catch {
      // gone
    }
  });
  t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: home.x + 6, y: home.y, z: home.z, mob: "minecraft:spider", trait: "stormcaller", tag: "realm:test_storm" }));
  const c = await t.waitUntil(() => t.dimension.getEntities({ tags: ["realm:test_storm"] })[0], { timeout: 60, message: "stormcaller spawned" });
  c.addEffect("slowness", 4000, { amplifier: 255, showParticles: false });
  c.addEffect("weakness", 4000, { amplifier: 255, showParticles: false });
  const since = t.tick;
  await t.seconds(30);
  const near = bolts.filter((b) => b.tick >= since && Math.hypot(b.x - home.x, b.z - home.z) < 20).length;
  t.log(`${near} bolts near the player in 30 s`);
  t.check(near >= 1, `a Stormcaller strikes on superflat (${near})`);
  c.remove();
}
