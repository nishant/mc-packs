// Deck of Many Things, The Void: the player swaps places with a plain nearby creature, never with a
// tamed wolf, a named or leashed mob, a tamed horse or a villager, even when those are nearer. About 1 minute:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only domt_bp --scenario tools/test-bds/examples/domt-void.js
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  const p = await t.player("Tester", { op: true });
  t.server(`/effect "${p.name}" resistance 600 4 true`);
  const dim = t.dimension;
  const at = { ...p.location };
  for (const e of dim.getEntities({ location: at, maxDistance: 30, excludeTypes: ["minecraft:player"] })) e.remove();
  /** A mob `dx`, `dz` from the player, on the ground. */
  const put = (type, dx, dz) => {
    const x = Math.floor(at.x) + dx + 0.5;
    const z = Math.floor(at.z) + dz + 0.5;
    const top = dim.getTopmostBlock({ x, z });
    const e = dim.spawnEntity(type, { x, y: top.location.y + 1, z });
    e.addEffect("minecraft:slowness", 2000, { amplifier: 10, showParticles: false });
    return e;
  };
  const wolf = put("minecraft:wolf", 4, 0);
  wolf.getComponent("minecraft:tameable").tame(p);
  const named = put("minecraft:cow", -4, 0);
  named.nameTag = "Bessie";
  const villager = put("minecraft:villager_v2", 0, 4);
  const horse = put("minecraft:horse", 0, -4);
  horse.getComponent("minecraft:tamemount").tameToPlayer(true, p);
  const leashed = put("minecraft:sheep", 4, 4);
  leashed.getComponent("minecraft:leashable").leashTo(p);
  const plain = put("minecraft:pig", -9, -9);
  await t.wait(20);
  const spared = [wolf, named, villager, horse, leashed].map((e) => ({ e, from: { ...e.location } }));
  const pigAt = { ...plain.location };
  const since = t.tick;
  const f1 = t.waitForm(p);
  t.cmd(p, "/realm:domt");
  (await f1).answer("Draw for a player");
  (await t.waitForm(p)).answer({ Card: "The Void" });
  const msg = await t.waitMessage(p, /swapped places|crumbles/, { since, timeout: 300 });
  t.log(msg.plain);
  t.check(/with a pig/.test(msg.plain), `swapped with the plain pig: ${msg.plain}`);
  for (const { e, from } of spared) t.check(e.isValid && Math.hypot(e.location.x - from.x, e.location.z - from.z) < 2, `${e.typeId} stayed where it was`);
  t.check(Math.hypot(p.location.x - pigAt.x, p.location.z - pigAt.z) < 2, "the player is where the pig was");
}
