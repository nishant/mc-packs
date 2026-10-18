// Deck of Many Things, The Steed: "A tamed horse, and a saddle for it." The horse is always grown and tamed.
// Before the fix one horse in five spawned as a foal, which has no tamemount, so the player got a wild baby horse.
// Draws the card 12 times (all adults by chance: 0.8^12, about 7%). About 2 minutes:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only domt_bp --scenario tools/test-bds/examples/domt-steed.js
export default async function (t) {
  t.server("/time set noon");
  t.server("/gamerule domobspawning false");
  const p = await t.player("Tester", { op: true });
  t.server(`/effect "${p.name}" resistance 600 4 true`);
  const dim = t.dimension;
  const horses = () => dim.getEntities({ type: "minecraft:horse", location: p.location, maxDistance: 24 });
  for (const h of horses()) h.remove();
  const DRAWS = 12;
  let tamed = 0;
  let foals = 0;
  for (let k = 0; k < DRAWS; k++) {
    const since = t.tick;
    const f1 = t.waitForm(p);
    t.cmd(p, "/realm:domt");
    (await f1).answer("Draw for a player");
    (await t.waitForm(p)).answer({ Card: "The Steed" });
    await t.waitMessage(p, /You drew/, { since, timeout: 300 });
    const found = await t.waitUntil(() => horses()[0], { timeout: 100, message: "a horse came" });
    await t.wait(10);
    if (found.getComponent("minecraft:is_tamed")) tamed++;
    if (found.getComponent("minecraft:is_baby")) foals++;
    for (const h of horses()) h.remove();
    await t.wait(5);
  }
  t.log(`${DRAWS} draws: ${tamed} tamed, ${foals} foals`);
  t.check(tamed === DRAWS, `every Steed is tamed (${tamed} of ${DRAWS})`);
  t.check(foals === 0, `no Steed is a foal (${foals})`);
}
