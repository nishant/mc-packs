// Meteor Strikes: a crater whose build scan reaches columns that aren't ticking yet (the edge of what a player near
// it keeps loaded) waits for them instead of burning up. getTopmostBlock on such a column hands back a block (at
// y 319) that throws as soon as it's read: before the fix the throw ended the crater job, logged
// `[meteor] crater: LocationInUnloadedChunkError` and dropped the crater for good (no crater when the player came).
// The player stands 63 blocks west of the impact (within craterDistance, 64), at the east end of a chunk: the
// impact's chunk is loaded but not ticking around a simulated player. Then they walk closer and the crater is made.
//   node tools/test-bds/run.mjs --quiet --flat --only meteor_bp --scenario tools/test-bds/examples/meteor-edge.js --timeout 400
export default async function (t) {
  // Facing east from x 234, meteor_now aims 100 blocks ahead: at x = 334 (chunk 20), the player waits at 271
  // (the last column of chunk 16).
  const z0 = 8;
  const p = await t.player("Tester", { op: true, x: 234, z: z0 });
  const ground = t.dimension.getTopmostBlock({ x: 234, z: z0 });
  p.teleport({ x: 234.5, y: ground.y + 1, z: z0 + 0.5 }, { rotation: { x: 0, y: -90 } });
  await t.wait(5);
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:meteor_now").ok, "/realm:meteor_now ran");
  const warn = await t.waitMessage(p, /A meteor is falling! It will land near/, { timeout: 100, since, kind: "broadcast" });
  const [, ax, az] = /near (-?\d+), (-?\d+)/.exec(warn.plain) ?? [];
  const at = { x: Number(ax), z: Number(az) };
  t.log(`${warn.plain} (aim ${at.x}, ${at.z})`);
  t.assert(at.x === 334 && at.z === z0, `the meteor aims at 334, ${z0}`);
  p.teleport({ x: 271.5, y: ground.y + 1, z: z0 + 0.5 });
  // The impact (60 s warning), then a few of the crater checks (every 2 s) with the impact's chunk not ticking.
  await t.seconds(75);
  const burned = () => t.messages(p).some((m) => m.pack === "meteor_bp" && /burned up before it reached the ground/.test(m.plain));
  t.check(!burned(), "no burned-up meteor while the crater's columns aren't ticking");
  // Closer: the whole scan ticks now.
  p.teleport({ x: 300.5, y: ground.y + 1, z: z0 + 0.5 });
  let debris = 0;
  for (let i = 0; i < 12 && !debris && !burned(); i++) {
    await t.seconds(2);
    for (let dx = -30; dx <= 30; dx++)
      for (let dz = -30; dz <= 30; dz++)
        for (let y = ground.y - 8; y <= ground.y; y++) {
          try {
            const id = t.dimension.getBlock({ x: at.x + dx, y, z: at.z + dz })?.typeId;
            if (id === "minecraft:ancient_debris" || id === "minecraft:magma") debris++;
          } catch {
            // unloaded
          }
        }
  }
  t.check(debris > 0, `the crater is made once its columns tick (${debris} magma or debris blocks)`);
}
