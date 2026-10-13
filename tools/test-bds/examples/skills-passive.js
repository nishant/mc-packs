// Combat XP for peaceful mobs: a tropical fish (entity id minecraft:tropicalfish) gives passiveXp (2),
// like a cow, not the hostile 10. Run with: node tools/test-bds/run.mjs --quiet --only skills_bp --scenario tools/test-bds/examples/skills-passive.js
export default async function (t) {
  const p = await t.player("Alex");
  const score = () => t.world.scoreboard.getObjective("skill_combat")?.getScore(p) ?? 0;
  const kill = async (type, sel) => {
    const before = score();
    const at = { x: p.location.x + 2, y: p.location.y + 1, z: p.location.z + 2 };
    const e = t.dimension.spawnEntity(type, at);
    await t.wait(2);
    const r = t.server(`/damage @e[type=${sel},r=6,x=${Math.floor(at.x)},y=${Math.floor(at.y)},z=${Math.floor(at.z)}] 200 entity_attack entity @a[name=Alex]`);
    t.assert(r.ok, `/damage ${type} ran (${r.error})`);
    await t.waitUntil(() => !e.isValid, { timeout: 60, message: `${type} died` });
    await t.wait(5);
    const gained = score() - before;
    t.log(`${type}: +${gained} Combat XP`);
    return gained;
  };
  t.check((await kill("minecraft:cow", "cow")) === 2, "a cow gives passive XP (2)");
  t.check((await kill("minecraft:tropicalfish", "tropicalfish")) === 2, "a tropical fish gives passive XP (2), not 10");
  t.check((await kill("minecraft:zombie", "zombie")) === 10, "a zombie gives 10");
}
