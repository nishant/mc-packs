// Meteor Strikes: a meteor that was going to burst in the sky (a story meteor with burst: true) and was
// still falling when the server stopped never makes a crater after the restart. Before the fix it was
// counted as landed and carved a crater (with ancient debris) once a player came near.
// About 1.5 minutes (two phases):
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only meteor_bp --scenario tools/test-bds/examples/meteor-restart.js
export default async function (t) {
  const sp = t.world.getDefaultSpawnLocation();
  const at = { x: Math.floor(sp.x) + 150, z: Math.floor(sp.z) + 20 };
  const p = await t.player("Tester", { op: true, x: at.x + 3, z: at.z + 3 });
  if (t.phase === 1) {
    await t.loadArea(at.x, at.z, { radius: 2 });
    const since = t.tick;
    await t.console(`scriptevent realm:sky_request ${JSON.stringify({ kind: "meteor", x: at.x, z: at.z, burst: true, from: "test" })}`);
    await t.waitMessage(p, /break apart high above/, { kind: "broadcast", pack: "meteor_bp", timeout: 100, since });
    t.restart("restart while the story meteor is falling");
    return;
  }
  await t.loadArea(at.x, at.z, { radius: 2 });
  // checkPending runs every 2 s; a crater, if made, is carved within a few seconds, then "found" right away.
  await t.seconds(15);
  const found = t.messages(p).filter((m) => m.pack === "meteor_bp" && /found the meteor crater/.test(m.plain)).length;
  let debris = 0;
  for (let dx = -30; dx <= 30; dx++)
    for (let dz = -30; dz <= 30; dz++)
      for (let y = 40; y <= 110; y++) {
        try {
          if (t.dimension.getBlock({ x: at.x + dx, y, z: at.z + dz })?.typeId === "minecraft:ancient_debris") debris++;
        } catch {
          // unloaded
        }
      }
  t.check(found === 0, `no crater found message (${found})`);
  t.check(debris === 0, `no ancient debris around the aim (${debris})`);
}
