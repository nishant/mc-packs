// Champions: a Stormcaller's lightning stays out of safe zones, land claims and towns (any provider's realm:zones
// list): a player inside one hears it crackle, but no bolt lands there (a bolt sets fires and turns villagers into
// witches and pigs into piglins). Outside a zone it strikes as before. Not --flat: strikes there only crackle (the build check reads 4 blocks down, below the floor). About 1 minute:
//   node tools/test-bds/run.mjs --quiet --only elite_bp --scenario tools/test-bds/examples/elite-storm-zones.js --timeout 300
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
  const near = (since) => bolts.filter((b) => b.tick >= since && Math.hypot(b.x - home.x, b.z - home.z) < 20).length;

  // A Stormcaller 6 blocks away, held still (its own AI would walk off or attack).
  t.system.sendScriptEvent("realm:champion_spawn", JSON.stringify({ x: home.x + 6, y: home.y, z: home.z, mob: "minecraft:spider", trait: "stormcaller", tag: "realm:test_storm" }));
  const c = await t.waitUntil(() => t.dimension.getEntities({ tags: ["realm:test_storm"] })[0], { timeout: 60, message: "stormcaller spawned" });
  c.addEffect("slowness", 4000, { amplifier: 255, showParticles: false });
  c.addEffect("weakness", 4000, { amplifier: 255, showParticles: false });

  // 1. The player stands in a safe zone: 25 s of storm (a strike every 6-10 s), no bolt near them.
  t.system.sendScriptEvent("realm:zones", JSON.stringify({ src: "test", part: 1, parts: 1, zones: [{ id: "home", name: "Home", dim: "minecraft:overworld", x: home.x, z: home.z, r: 12 }] }));
  await t.wait(5);
  let since = t.tick;
  await t.seconds(25);
  const inZone = near(since);
  t.log(`in a safe zone: ${inZone} bolts near the player in 25 s`);
  t.check(inZone === 0, `no lightning lands in a safe zone (${inZone})`);

  // 2. No zone: it strikes near the player again.
  t.system.sendScriptEvent("realm:zones", JSON.stringify({ src: "test", part: 1, parts: 0, zones: [] }));
  await t.wait(5);
  since = t.tick;
  await t.seconds(25);
  const outside = near(since);
  t.log(`outside any zone: ${outside} bolts near the player in 25 s`);
  t.check(outside >= 1, `outside a zone it still strikes (${outside})`);
  c.remove();
  t.server("/weather clear");
}
