// Meteor Strikes: a meteor that comes down on a lake makes no crater on the lake bed (where its magma would
// pull swimmers and boats down); with water all around it burns up. getTopmostBlock skips water, so before the
// fix the bed counted as dry ground and the crater was carved under the water. About 1.5 minutes:
//   node tools/test-bds/run.mjs --quiet --flat --only meteor_bp --scenario tools/test-bds/examples/meteor-lake.js --timeout 400
export default async function (t) {
  const p = await t.player("Tester", { op: true });
  const x = Math.floor(p.location.x), z = Math.floor(p.location.z);
  const ground = t.dimension.getTopmostBlock({ x, z });
  // Face east (yaw -90): the meteor lands 100 blocks ahead.
  p.teleport({ x: x + 0.5, y: ground.y + 1, z: z + 0.5 }, { rotation: { x: 0, y: -90 } });
  await t.wait(5);
  const view = p.getViewDirection();
  const at = { x: Math.floor(x + view.x * 100), z: Math.floor(z + view.z * 100) };
  t.log(`aim ${at.x}, ${at.z}`);
  for (const dz of [-24, 24]) for (const dx of [-24, 24]) await t.loadArea(at.x + dx, at.z + dz, { radius: 2 });
  await t.wait(20);
  for (const dz of [-32, 0]) t.assert(t.server(`/fill ${at.x - 32} ${ground.y} ${at.z + dz} ${at.x + 32} ${ground.y} ${at.z + dz + 31} water`).ok, "a lake around the impact");
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:meteor_now").ok, "/realm:meteor_now ran");
  const warn = await t.waitMessage(p, /A meteor is falling! It will land near/, { timeout: 100, since, kind: "broadcast" });
  t.log(warn.plain);
  // Wait by the lake for the impact and the crater check (60 s warning, then every 2 s).
  p.teleport({ x: at.x + 0.5, y: ground.y + 1, z: at.z - 20.5 });
  await t.seconds(75);
  let debris = 0;
  for (let dx = -32; dx <= 32; dx++)
    for (let dz = -32; dz <= 32; dz++)
      for (let y = ground.y - 8; y <= ground.y; y++) {
        try {
          const id = t.dimension.getBlock({ x: at.x + dx, y, z: at.z + dz })?.typeId;
          if (id === "minecraft:ancient_debris" || id === "minecraft:magma") debris++;
        } catch {
          // unloaded
        }
      }
  const burned = t.messages(p).some((m) => m.pack === "meteor_bp" && /burned up before it reached the ground/.test(m.plain));
  t.check(debris === 0, `no magma or ancient debris on the lake bed (${debris})`);
  t.check(burned, "the meteor burned up over the water");
}
