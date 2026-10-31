// Land Claims: "Share with my party" in "My claim" lets everyone in the owner's party build in the claim; others still
// can't, nor can members of a party that no longer has the owner (removed while offline) or a later party reusing the
// code; the claim follows the owner into a new party; "Stop sharing with my party" closes it again. The Parties pack's
// `realm_party:<code>` tags and its realm:party_members broadcast are faked here.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only claims_bp --scenario tools/test-bds/examples/claims-party.js --timeout 400
export default async function (t) {
  const dim = t.dimension;
  const Y = -60; // flat world: grass at -61
  const own = await t.player("Owner");
  const base = { x: Math.floor(own.location.x), z: Math.floor(own.location.z) };
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(3);
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  t.log((await t.waitMessage(own, /Claimed/, { timeout: 60 })).plain);

  const mate = await t.player("Mate", { x: base.x + 6, z: base.z });
  const cat = await t.player("Cat", { x: base.x + 6, z: base.z + 5 });
  // The Parties pack's tags and its member broadcast (realm:party_members), faked here so only claims_bp runs.
  const members = async (code, list) => {
    t.system.sendScriptEvent("realm:party_members", JSON.stringify({ code, l: list[0]?.id ?? "", m: list.map((p) => [p.id, p.name]) }));
    await t.wait(2);
  };
  own.addTag("realm_party:AAAA");
  mate.addTag("realm_party:AAAA");
  await members("AAAA", [own, mate]);
  let n = 0;
  /** Breaks a fresh grass block inside the claim as `who`; true when it broke. */
  const canBreak = async (who) => {
    const where = { x: base.x + 2 + n++, y: Y - 1, z: base.z + 3 };
    who.breakBlock(where);
    await t.wait(60);
    who.stopBreakingBlock?.();
    return dim.getBlock(where)?.typeId !== "minecraft:grass_block";
  };
  const claimMenu = async () => {
    const f = t.waitForm(own, { timeout: 60 });
    t.cmd(own, "/realm:claim");
    (await f).answer("My claim");
    return await t.waitForm(own, { timeout: 60 });
  };

  t.check(!(await canBreak(mate)), "before sharing, a party mate can't build in the claim");

  let f = await claimMenu();
  t.assert(f.buttons.some((b) => /Share with my party/.test(b)), `the claim menu offers "Share with my party" (${f.buttons.join(" | ")})`);
  f.answer("Share with my party");
  await t.wait(5);
  t.check(await canBreak(mate), "a party mate can build once the claim is shared with the party");
  t.check(!(await canBreak(cat)), "a player outside the party still can't");

  // The owner was removed from the party (say while offline): the mate still has the tag, but the party's list
  // no longer has the owner, so the claim is closed to it.
  await members("AAAA", [mate]);
  t.check(!(await canBreak(mate)), "once the owner is out of the party, its members can't build");

  // The party is gone and a new party gets the same code: its members are strangers to the owner.
  await members("AAAA", []);
  mate.removeTag("realm_party:AAAA");
  cat.addTag("realm_party:AAAA");
  await members("AAAA", [cat]);
  t.check(!(await canBreak(cat)), "a later party with the same code can't build");
  cat.removeTag("realm_party:AAAA");

  // The owner moves to another party: the claim follows (checked once a second).
  own.removeTag("realm_party:AAAA");
  own.addTag("realm_party:BBBB");
  cat.addTag("realm_party:BBBB");
  await members("BBBB", [own, cat]);
  await t.wait(30);
  t.check(await canBreak(cat), "the claim follows the owner into their new party");

  f = await claimMenu();
  t.check(/Shared with your party/.test(f.body ?? ""), `the claim page says it's shared with the party (${f.body})`);
  f.answer("Stop sharing with my party");
  await t.wait(5);
  t.check(!(await canBreak(cat)), "after Stop sharing with my party, mates can't build");
}
