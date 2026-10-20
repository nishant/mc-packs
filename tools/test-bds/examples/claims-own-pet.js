// F29: a visitor's own tamed pet is theirs to use inside someone else's claim. The visitor tames a wolf outside any
// claim (Land Claims records the tamer, since a vanilla pet loses tamedToPlayerId when tamed), the wolf is moved
// into the owner's claim, and the visitor can leash it there. Another visitor still can't (the claim keeps it).
// Before the fix every tamed animal in a claim was locked to everyone but the claim's players, its tamer included.
//   node tools/test-bds/run.mjs --quiet --flat --only claims_bp --scenario tools/test-bds/examples/claims-own-pet.js --timeout 600
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `p_${key}_${t.tick}`, pack: "claims_bp", key, value }));
  await t.server("/gamerule doMobSpawning false");
  const own = await t.player("Owner", { gameMode: "survival", x: 0, z: 0 });
  const vis = await t.player("Visitor", { gameMode: "survival", x: 30, z: 0 });
  const other = await t.player("Stranger", { gameMode: "survival", x: 32, z: 0 });
  const y = Math.floor(own.location.y);
  cfg("enabled", true);
  await t.wait(3);
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  t.log((await t.waitMessage(own, /Claimed/, { timeout: 60 })).plain);

  const hand = (p, slot, id, n = 1) => {
    p.getComponent("minecraft:inventory").container.setItem(slot, new ItemStack(id, n));
    p.selectedSlotIndex = slot;
  };
  const held = (p, slot) => p.getComponent("minecraft:inventory").container.getItem(slot)?.amount ?? 0;
  const told = (p, since) => t.messages(p, { since }).some((m) => /This land is claimed by Owner/.test(m.plain));
  const tamed = (e) => {
    try {
      return e.getComponent("minecraft:is_tamed") !== undefined;
    } catch {
      return false;
    }
  };
  const use = async (p, e) => {
    const at = e.location;
    p.teleport({ x: at.x - 1.2, y: at.y, z: at.z }, { dimension: dim, facingLocation: at });
    await t.wait(3);
    const ok = p.interactWithEntity(e);
    await t.wait(10);
    return ok;
  };

  await t.loadArea(30, 0, { radius: 2 });
  const wolf = dim.spawnEntity("minecraft:wolf", { x: 30.5, y, z: 6.5 });
  t.assert(wolf?.typeId === "minecraft:wolf", "a wolf spawned outside the claim");
  try {
    wolf.addEffect("slowness", 4000, { amplifier: 255, showParticles: false });
  } catch {}
  await t.wait(10);
  for (let i = 0; i < 40 && !tamed(wolf); i++) {
    hand(vis, 0, "minecraft:bone", 1);
    await use(vis, wolf);
  }
  t.assert(tamed(wolf), "the visitor tamed the wolf with bones");
  await t.wait(20);

  // Into the owner's claim.
  wolf.teleport({ x: 6.5, y, z: 4.5 }, { dimension: dim });
  await t.wait(10);

  // Someone else's tap is still refused there.
  hand(other, 1, "minecraft:lead", 1);
  let since = t.tick;
  await use(other, wolf);
  t.check(held(other, 1) === 1, `another visitor can't leash the visitor's wolf in the claim (${held(other, 1)} lead of 1)`);
  t.check(told(other, since), "and is told whose land it is");

  // The tamer's own tap goes through.
  hand(vis, 1, "minecraft:lead", 1);
  since = t.tick;
  await use(vis, wolf);
  t.check(held(vis, 1) === 0, `the visitor leashes their own wolf in the owner's claim (${held(vis, 1)} lead left of 1)`);
  t.check(!told(vis, since), "and is not told the land is claimed");
}
