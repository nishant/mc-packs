// Townsfolk stay home: an operator stands inside a small house, facing west, and places Mara with /realm:npc_add.
// She faces the way the operator faced, and stays on that spot (within 1.5 blocks, no strolling) for 20 seconds with
// a player nearby, through the night (time 14000) and the next day (time 1000).
// node tools/test-bds/run.mjs --quiet --flat --only npc_bp --scenario tools/test-bds/examples/npc-stay-home.js --timeout 600
export default async function (t) {
  const p = await t.player("Op", { op: true, gameMode: "creative" });
  const dim = t.dimension;
  const mara = () => dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:mara"] });
  await t.wait(40);
  const c = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const g = c.y - 1;
  // A 9 x 9 cobblestone house around the operator, a door on the south side.
  const h = { x: c.x - 4, z: c.z - 4 };
  t.server(`/fill ${h.x} ${g} ${h.z} ${h.x + 8} ${g + 5} ${h.z + 8} cobblestone hollow`);
  t.server(`/setblock ${h.x + 4} ${g + 1} ${h.z + 8} wooden_door ["upper_block_bit"=false,"direction"=3]`);
  t.server(`/setblock ${h.x + 4} ${g + 2} ${h.z + 8} wooden_door ["upper_block_bit"=true,"direction"=3]`);
  await t.wait(5);
  t.server("/time set 1000");
  p.teleport({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 }, { rotation: { x: 0, y: 90 } });
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:npc_add mara").ok, "npc_add mara");
  await t.waitMessage(p, /Mara the Cartographer now lives at/, { timeout: 40 });
  await t.wait(10);
  const [m0] = mara();
  t.assert(m0, "mara placed");
  const post = { ...m0.location };
  t.check(Math.hypot(post.x - (c.x + 0.5), post.z - (c.z + 0.5)) < 0.1, `placed where the operator stood (${post.x}, ${post.z})`);

  // Far away (out of faceRange 8): she faces the way the operator faced, west (yaw 90).
  p.teleport({ x: c.x + 30.5, y: c.y, z: c.z + 0.5 });
  await t.wait(60);
  const yaw = mara()[0]?.getRotation().y ?? NaN;
  t.check(Math.abs(((yaw - 90 + 540) % 360) - 180) < 10, `facing the way the operator faced (yaw ${yaw.toFixed(0)})`);

  /** Samples her distance from the post for `ticks`; returns the largest. */
  const watch = async (ticks) => {
    let max = 0;
    for (let i = 0; i < ticks / 10; i++) {
      await t.wait(10);
      const all = mara();
      if (all.length !== 1) t.fail(`exactly one mara (${all.length})`);
      const m = all[0];
      max = Math.max(max, Math.hypot(m.location.x - post.x, m.location.y - post.y, m.location.z - post.z));
    }
    return max;
  };

  // A player nearby (in the house, 3 blocks off): no stroll.
  p.teleport({ x: c.x + 3.5, y: c.y, z: c.z + 2.5 });
  const day1 = await watch(400);
  t.check(day1 <= 1.5, `stays on her spot for 20 s with a player near (max ${day1.toFixed(2)} blocks)`);
  t.server("/time set 14000");
  const night = await watch(300);
  t.check(night <= 1.5, `stays home at night (max ${night.toFixed(2)} blocks)`);
  t.server("/time set 1000");
  const day2 = await watch(300);
  t.check(day2 <= 1.5, `still there the next day (max ${day2.toFixed(2)} blocks)`);
  t.log(`max distance from the post: day ${day1.toFixed(2)}, night ${night.toFixed(2)}, next day ${day2.toFixed(2)}`);
}
