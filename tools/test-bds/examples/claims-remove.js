// Land Claims (claims_bp): a claim protects its blocks from other players; removing your own claim from
// "My claim" asks first ("Keep it" leaves the claim and its protection, "Remove it" removes it), and the
// protection goes with the claim.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only claims_bp --scenario tools/test-bds/examples/claims-remove.js --timeout 300
export default async function (t) {
  const dim = t.dimension;
  const Y = -60; // flat world: grass at -61
  const own = await t.player("Owner");
  const base = { x: Math.floor(own.location.x), z: Math.floor(own.location.z) };
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(3);
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  const claimed = await t.waitMessage(own, /Claimed/, { timeout: 60 });
  t.log(claimed.plain);

  // Another player inside the claim can't break the ground there.
  const other = await t.player("Other", { x: base.x + 6, z: base.z });
  const at = (dx) => ({ x: base.x + dx, y: Y - 1, z: base.z + 1 });
  const tryBreak = async (where) => {
    other.breakBlock(where);
    await t.wait(60);
    other.stopBreakingBlock?.();
    return dim.getBlock(where)?.typeId;
  };
  const refused = t.waitMessage(other, /claimed by Owner/, { timeout: 80, kind: "actionbar" }).catch(() => undefined);
  t.check((await tryBreak(at(6))) === "minecraft:grass_block", "another player can't break inside the claim");
  t.check((await refused) !== undefined, "they're told whose land it is");

  // "Remove this claim" asks first; "Keep it" changes nothing.
  let f = t.waitForm(own, { timeout: 60 });
  t.cmd(own, "/realm:claim");
  (await f).answer("My claim");
  f = await t.waitForm(own, { timeout: 60 });
  t.assert(f.buttons.some((b) => /Remove this claim/.test(b)), `the claim menu has "Remove this claim" (${f.buttons.join(" | ")})`);
  f.answer("Remove this claim");
  const ask = await t.waitForm(own, { timeout: 40 }).catch(() => undefined);
  t.check(ask !== undefined && /remove/i.test(ask.title), `removing your claim asks first (${ask ? ask.title : "no form"})`);
  if (ask) ask.answer("Keep it");
  await t.wait(10);
  t.check(!t.messages(own).some((m) => /removed/i.test(m.plain)), "Keep it removes nothing");
  t.check((await tryBreak(at(7))) === "minecraft:grass_block", "the claim still protects after Keep it");

  // "Remove it" removes the claim, and the land is open again.
  f = t.waitForm(own, { timeout: 60 });
  t.cmd(own, "/realm:claim");
  (await f).answer("My claim");
  (await t.waitForm(own, { timeout: 60 })).answer("Remove this claim");
  const ask2 = await t.waitForm(own, { timeout: 40 }).catch(() => undefined);
  if (ask2) ask2.answer("Remove it");
  const gone = await t.waitMessage(own, /removed/i, { timeout: 60 });
  t.log(gone.plain);
  t.check((await tryBreak(at(8))) !== "minecraft:grass_block", "after removing the claim, anyone can break there");

  f = t.waitForm(own, { timeout: 60 });
  t.cmd(own, "/realm:claim");
  const main = await f;
  t.check(!main.buttons.some((b) => /My claim/.test(b)), "no claim left in the menu");
  main.answer(null);
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c2", pack: "claims_bp", key: "enabled", value: false }));
}
