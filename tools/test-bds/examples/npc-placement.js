// Townsfolk placement: an operator flying in creative places an NPC (it must land on the ground, not bob in the
// air being put back every half second), and after a restart each townsfolk still exists exactly once.
// node tools/test-bds/run.mjs --quiet --only npc_bp --scenario tools/test-bds/examples/npc-placement.js --timeout 600
export default async function (t) {
  const p = await t.player("Op", { op: true, gameMode: "creative" });
  const npcs = (id) => t.dimension.getEntities({ type: "minecraft:npc", tags: [`realm:npc_id:${id}`] });
  if (t.phase === 1) {
    await t.wait(40);
    t.assert(t.cmd(p, "/realm:npc_add bea").ok, "npc_add bea");
    await t.wait(10);
    const l = p.location;
    p.teleport({ x: l.x + 4, y: l.y + 6, z: l.z });
    p.fly();
    await t.wait(5);
    t.assert(!p.isOnGround, "the operator is in the air");
    t.assert(t.cmd(p, "/realm:npc_add mara").ok, "npc_add mara");
    await t.wait(10);
    const ys = [];
    for (let i = 0; i < 12; i++) {
      const [m] = npcs("mara");
      ys.push(m ? Math.round(m.location.y * 100) / 100 : NaN);
      await t.wait(5);
    }
    t.log("mara y over 60 ticks:", ys.join(" "));
    t.check(ys.every((y) => y === ys[0]), "mara stands still (no bobbing)");
    const [m] = npcs("mara");
    const below = m && t.dimension.getBlock({ x: Math.floor(m.location.x), y: Math.floor(m.location.y) - 1, z: Math.floor(m.location.z) });
    t.check(!!below && !below.isAir, `mara stands on a block (${below?.typeId})`);
    t.check(npcs("bea").length === 1 && npcs("mara").length === 1, "one of each before the restart");
    await t.wait(20);
    t.restart("placed, restarting");
  }
  await t.wait(200);
  t.log(`after restart: bea ${npcs("bea").length}, mara ${npcs("mara").length}`);
  t.check(npcs("bea").length === 1, "one bea after the restart");
  t.check(npcs("mara").length === 1, "one mara after the restart");
}
