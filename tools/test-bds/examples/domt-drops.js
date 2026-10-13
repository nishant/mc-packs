// Deck of Many Things, Butterfingers in a narrow mine tunnel and The Magpie in a wide hall, both 25
// blocks underground: the dropped item lands near the player's height (or at their feet), never on the
// surface far above, where it would despawn before they dug up to it. Five draws of each, and at least
// one of them must drop the item. (The Magpie needs a spot 8 to 16 blocks away in sight, so in the
// tunnel it fizzles and the deck draws again: that's why it gets the hall.) About 2 minutes:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only domt_bp --scenario tools/test-bds/examples/domt-drops.js
export default async function (t) {
  t.server("/time set noon");
  const sp = t.world.getDefaultSpawnLocation();
  const x = sp.x - 30;
  const z = sp.z;
  const { top } = await t.loadArea(x, z);
  const g = top.location.y;
  const y = g - 25;
  // A fill can fail while the chunks below the surface are still loading: retry, or there is no tunnel.
  const fill = async (cmd) => {
    for (let i = 0; i < 40; i++) {
      if (t.server(cmd).ok) return;
      await t.wait(5);
    }
    throw new Error(`fill failed: ${cmd}`);
  };
  await fill(`/fill ${x - 10} ${y - 2} ${z - 3} ${x + 10} ${y + 3} ${z + 3} stone`);
  await fill(`/fill ${x - 9} ${y} ${z} ${x + 9} ${y + 1} ${z} air`); // a 1 by 2 tunnel along x
  const p = await t.player("Tester", { op: true, x: x + 0.5, y, z: z + 0.5 });
  t.server(`/effect "${p.name}" resistance 600 4 true`);
  t.server("/gamerule doentitydrops true");
  const items = () => t.dimension.getEntities({ type: "minecraft:item", location: { x, y, z }, maxDistance: 80 });
  for (const card of ["Butterfingers", "The Magpie"]) {
    if (card === "The Magpie") {
      // A 37 by 37 hall, 2 high, with stone around it, so a spot 8 to 16 blocks away can be seen.
      await fill(`/fill ${x - 20} ${y - 2} ${z - 20} ${x + 20} ${y + 3} ${z + 20} stone`);
      await fill(`/fill ${x - 18} ${y} ${z - 18} ${x + 18} ${y + 1} ${z + 18} air`);
      await t.wait(5);
    }
    let landed = 0;
    for (let i = 0; i < 5; i++) {
      for (const e of items()) e.remove();
      p.teleport({ x: x + 0.5, y, z: z + 0.5 }, { dimension: t.dimension });
      const inv = p.getComponent("minecraft:inventory").container;
      inv.clearAll();
      inv.setItem(0, new t.mc.ItemStack("minecraft:cobblestone", 16));
      p.selectedSlotIndex = 0;
      await t.wait(5);
      const since = t.tick;
      const f1 = t.waitForm(p);
      t.cmd(p, "/realm:domt");
      (await f1).answer("Draw for a player");
      (await t.waitForm(p)).answer({ Card: card });
      const msg = await t.waitMessage(p, /You drew|crumbles/, { since, timeout: 300 });
      if (/crumbles/.test(msg.plain)) {
        t.log(`${card}: fizzled (${msg.plain})`);
        continue;
      }
      await t.wait(10);
      const drop = items()[0];
      const inHand = inv.getItem(0);
      if (!drop) {
        t.check(!!inHand, `${card}: the item is somewhere (in hand again)`);
        continue;
      }
      landed++;
      const dy = drop.location.y - y;
      t.log(`${card}: item at dy ${dy.toFixed(1)}, ${Math.hypot(drop.location.x - x, drop.location.z - z).toFixed(1)} blocks away`);
      t.check(Math.abs(dy) <= 3, `${card}: the item stays near the player's height (dy ${dy.toFixed(1)})`);
    }
    t.check(landed > 0, `${card}: at least one draw dropped the item (${landed} of 5)`);
  }
}
