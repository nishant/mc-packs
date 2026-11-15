// ENT-25: a townsfolk with no saved skin and another entity within 2 blocks (here an armor stand) can't have its skin
// snapshot taken. That refusal used to come after its name label was taken down, at every audit (10 s): the label was
// removed and spawned again every 10 s while a player watched. Now the label stays (one helper, the same one, for the
// whole 35 s), and the skin is still saved once the neighbor is gone (at a later audit, within two minutes).
//   node tools/test-bds/run.mjs --quiet --only npc_bp,build_rp --scenario tools/test-bds/examples/npc-skin-neighbor.js --timeout 600
export default async function (t) {
  t.server("/gamerule domobspawning false");
  const dim = t.dimension;
  const op = await t.player("Op", { op: true, gameMode: "creative" });
  await t.wait(20);
  const l = op.location;
  const at = { x: Math.floor(l.x) + 0.5, y: Math.floor(l.y), z: Math.floor(l.z) + 0.5 };
  const sm = t.world.structureManager;
  if (sm.get("realm_npc:mara")) sm.delete("realm_npc:mara");
  const stand = dim.spawnEntity("minecraft:armor_stand", { x: at.x + 1, y: at.y, z: at.z });
  op.teleport(at);
  await t.wait(5);
  t.assert(t.cmd(op, "/realm:npc_add mara").ok, "npc_add mara");
  await t.waitUntil(() => dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:mara"] }).length, { timeout: 100, interval: 5, message: "mara placed" });
  // The player stands 6 blocks off (in the label's range, out of the skin's 2 blocks), still.
  op.teleport({ x: at.x + 6, y: at.y, z: at.z });
  const helpers = () => dim.getEntities({ type: "realm:npc_label", tags: ["realm:npc_label_id:mara"] });
  await t.waitUntil(() => helpers().length === 1, { timeout: 60, interval: 2, message: "mara's label shown" });
  /** @type {Set<string>} */
  const ids = new Set();
  let gaps = 0;
  for (let i = 0; i < 70; i++) {
    const h = helpers();
    if (!h.length) gaps++;
    for (const e of h) ids.add(e.id);
    await t.wait(10);
  }
  t.log(`35 s with an armor stand next to mara: ${ids.size} helper(s) seen, ${gaps} half-second(s) without one; skin saved: ${!!sm.get("realm_npc:mara")}`);
  t.check(stand.isValid, "the armor stand is still there");
  t.check(!sm.get("realm_npc:mara"), "no skin was saved with the armor stand next to her");
  t.check(ids.size === 1 && gaps === 0, `her label stayed up, the same helper all along (${ids.size} helpers, ${gaps} gaps)`);
  stand.remove();
  await t.waitUntil(() => !!sm.get("realm_npc:mara"), { timeout: 2600, interval: 20, message: "the skin saved once the armor stand is gone (the audit, once a minute)" });
  t.log("skin saved after the armor stand went");
}
