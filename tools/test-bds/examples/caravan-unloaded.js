// Merchant Caravan: a caravan that arrives at the world spawn while nobody is near it waits for the spot to load
// before it reads the ground. getTopmostBlock on a column that isn't ticking hands back a block at y 319 instead of
// throwing, so before the fix the caravan took y 320 as its spot (above the world): it was never put down, and a
// player who came to see it found nothing for the whole visit.
//   node tools/test-bds/run.mjs --quiet --only caravan_bp --scenario tools/test-bds/examples/caravan-unloaded.js --timeout 400
export default async function (t) {
  const spawn = t.world.getDefaultSpawnLocation();
  // Far from spawn: nothing keeps the spawn chunks loaded.
  const p = await t.player("Ann", { op: true, x: spawn.x + 600, z: spawn.z + 600 });
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:caravan_call").ok, "caravan_call ran");
  await t.waitMessage(p, /caravan has arrived at world spawn/, { since, timeout: 100 });
  await t.seconds(8); // a few of the caravan's 2-second checks with the spot unloaded
  const { top } = await t.loadArea(spawn.x, spawn.z, { radius: 2 });
  p.teleport({ x: spawn.x + 3, y: (top?.y ?? 70) + 1, z: spawn.z + 3 });
  const traders = await t.waitUntil(() => {
    const list = t.dimension.getEntities({ tags: ["realm:caravan"], type: "minecraft:npc" });
    return list.length ? list : undefined;
  }, { timeout: 400, interval: 20, message: "caravan traders at spawn" });
  const ys = traders.map((e) => Math.round(e.location.y));
  t.log(`ground ${top?.y}, traders at y ${ys.join(", ")}`);
  t.check(ys.every((y) => Math.abs(y - ((top?.y ?? 70) + 1)) <= 6), "the traders stand on the ground at spawn");
}
