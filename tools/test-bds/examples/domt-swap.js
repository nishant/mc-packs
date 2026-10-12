// Deck of Many Things, The Swap: swaps two players in the same dimension, and fizzles when the other
// player is in another dimension, either player is in a Deck arena, or by an Expedition dungeon
// (its tagged mobs within 64 blocks). About 1 minute:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only domt_bp --scenario tools/test-bds/examples/domt-swap.js
export default async function (t) {
  t.server("/time set noon");
  const sp = t.world.getDefaultSpawnLocation();
  const op = await t.player("Tester", { op: true, x: sp.x - 40, z: sp.z - 40 });
  t.server("/effect @a resistance 600 4 true");
  const f = t.waitForm(op);
  t.cmd(op, "/realm:domt_effects");
  (await f).answer("Enable every wild card");
  (await t.waitForm(op)).answer(null);
  const drawFor = async (target, card) => {
    const since = t.tick;
    const f1 = t.waitForm(op);
    t.cmd(op, "/realm:domt");
    (await f1).answer("Draw for a player");
    (await t.waitForm(op)).answer({ Player: target.name, Card: card });
    return t.waitMessage(target.name === op.name ? op : target, /You drew|crumbles to dust/, { since, timeout: 300 });
  };
  // Tester stays out of it: in the Nether.
  const nether = t.world.getDimension("nether");
  await t.loadArea(8, 8, { dimension: nether });
  nether.runCommand("fill 0 57 0 16 68 16 netherrack");
  nether.runCommand("fill 2 59 2 14 66 14 air");
  op.teleport({ x: 8.5, y: 59, z: 8.5 }, { dimension: nether });
  await t.wait(10);

  // 1. Alone in the Overworld (the only other player is in the Nether): fizzles.
  const eve = await t.player("Eve", { x: sp.x, z: sp.z });
  let m = await drawFor(eve, "The Swap");
  t.check(/crumbles/.test(m.plain), `alone in the dimension: fizzles (${m.plain})`);
  // 2. Two players in the Overworld: they swap.
  const fay = await t.player("Fay", { x: sp.x + 20, z: sp.z });
  const e0 = { ...eve.location }, f0 = { ...fay.location };
  m = await drawFor(eve, "The Swap");
  await t.wait(5);
  t.check(/You drew The Swap/.test(m.plain), `swap happens (${m.plain})`);
  t.check(Math.hypot(eve.location.x - f0.x, eve.location.z - f0.z) < 2 && Math.hypot(fay.location.x - e0.x, fay.location.z - e0.z) < 2, "they traded places");
  // 3. By an Expedition dungeon (a tagged mob near Fay): fizzles.
  const mob = t.dimension.spawnEntity("minecraft:armor_stand", fay.location);
  mob.addTag("realm:exp_mob");
  m = await drawFor(eve, "The Swap");
  t.check(/crumbles/.test(m.plain), `other player by an expedition: fizzles (${m.plain})`);
  mob.remove();
  // 4. Fay in a Deck arena: fizzles.
  const ground = fay.location.y;
  await drawFor(fay, "The Arena");
  await t.waitUntil(() => fay.location.y > ground + 8, { timeout: 300, message: "Fay is in the arena" });
  m = await drawFor(eve, "The Swap");
  t.check(/crumbles/.test(m.plain), `other player in an arena: fizzles (${m.plain})`);
  // 5. The arena player draws it: fizzles too.
  m = await drawFor(fay, "The Swap");
  t.check(/crumbles/.test(m.plain), `arena player's own swap fizzles (${m.plain})`);
}
