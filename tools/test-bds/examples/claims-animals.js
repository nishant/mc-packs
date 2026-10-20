// Land Claims, O27 (W5): animals, the "Visitors may open doors" switch and the operators' audit list, natively.
// - protectAnimals (default on): a visitor can't feed a cow or shear a sheep in someone's claim (the interaction is
//   canceled: the wheat stays in hand, the wool on the sheep, and the visitor is told whose land it is); the same
//   visitor can outside the claim (the positive control: the harness's interactions really reach the game), and the
//   owner can inside it. With protectAnimals disabled the visitor can feed a cow in the claim again.
// - The door switch: a visitor can't flip a trapdoor in the claim until the owner enables "Visitors may open doors"
//   in the claim menu; then the trapdoor opens, while a chest next to it stays closed to them (doors only).
// - The audit list: an operator's "All claims (operator)" lists the claim with its size and last visit, and re-sorts it.
// Animal damage, fire, flowing liquids, pistons and endermen are not covered: the stable API has no cancelable event for
// them (PACKS.md says so), so nothing here claims them.
//   node tools/test-bds/run.mjs --quiet --flat --only claims_bp --scenario tools/test-bds/examples/claims-animals.js --timeout 600
export default async function (t) {
  const { ItemStack, Direction } = t.mc;
  const dim = t.dimension;
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `a_${key}_${t.tick}`, pack: "claims_bp", key, value }));
  await t.server("/gamerule doMobSpawning false");
  const own = await t.player("Owner", { gameMode: "survival", x: 0, z: 0 });
  const vis = await t.player("Visitor", { gameMode: "survival", x: 3, z: 0 });
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
  const spawn = (type, x, z) => {
    const e = dim.spawnEntity(type, { x: x + 0.5, y, z: z + 0.5 });
    t.assert(e?.typeId === type, `${type} spawned at ${x}, ${z}`);
    try {
      e.addEffect("slowness", 2000, { amplifier: 255, showParticles: false });
    } catch {}
    return e;
  };
  /** Stands next to the animal and uses the held item on it; returns whether the game took the interaction. */
  const use = async (p, e) => {
    const at = e.location;
    p.teleport({ x: at.x - 1.2, y: at.y, z: at.z }, { dimension: dim, facingLocation: at });
    await t.wait(3);
    const ok = p.interactWithEntity(e);
    await t.wait(10);
    return ok;
  };
  const sheared = (e) => {
    try {
      return e.getComponent("minecraft:is_sheared") !== undefined;
    } catch {
      return false;
    }
  };

  await t.loadArea(30, 0, { radius: 2 });
  const cowIn = spawn("minecraft:cow", 6, 4);
  const cowOut = spawn("minecraft:cow", 30, 4);
  const cowOwn = spawn("minecraft:cow", 6, -4);
  const sheepIn = spawn("minecraft:sheep", 8, 6);
  const sheepOut = spawn("minecraft:sheep", 30, 8);
  await t.wait(10);

  // The positive control first: outside any claim the visitor's wheat feeds a cow and the shears shear a sheep.
  hand(vis, 0, "minecraft:wheat", 5);
  await use(vis, cowOut);
  t.assert(held(vis, 0) === 4, `outside a claim the visitor feeds a cow: the interaction reaches the game (${held(vis, 0)} wheat left of 5)`);
  hand(vis, 1, "minecraft:shears");
  await use(vis, sheepOut);
  t.assert(sheared(sheepOut), "outside a claim the visitor shears a sheep");

  // In the owner's claim: canceled, and the visitor is told.
  hand(vis, 0, "minecraft:wheat", 5);
  let since = t.tick;
  await use(vis, cowIn);
  t.check(held(vis, 0) === 5, `the visitor can't feed a cow in the claim (${held(vis, 0)} wheat of 5)`);
  t.check(told(vis, since), "the visitor is told whose land it is");
  hand(vis, 1, "minecraft:shears");
  since = t.tick;
  await use(vis, sheepIn);
  t.check(!sheared(sheepIn), "the visitor can't shear a sheep in the claim");
  t.check(told(vis, since), "and is told whose land it is");

  // The owner can.
  hand(own, 0, "minecraft:wheat", 5);
  await use(own, cowOwn);
  t.check(held(own, 0) === 4, `the owner feeds a cow in their claim (${held(own, 0)} wheat left of 5)`);

  // protectAnimals disabled: the visitor can feed a cow in the claim again.
  cfg("protectAnimals", false);
  await t.wait(5);
  hand(vis, 0, "minecraft:wheat", 5);
  await use(vis, cowIn);
  t.check(held(vis, 0) === 4, `with protectAnimals disabled the visitor feeds the cow in the claim (${held(vis, 0)} wheat left of 5)`);
  cfg("protectAnimals", true);
  await t.wait(5);

  // The door switch. A trapdoor and a chest in the claim, tapped with a stick in hand (a simulated player's empty-hand
  // tap fires no event; a stick does nothing to either but open it).
  const trap = { x: 4, y, z: -6 };
  const chest = { x: 6, y, z: -6 };
  dim.getBlock(trap).setType("minecraft:trapdoor");
  dim.getBlock(chest).setType("minecraft:chest");
  const open = () => dim.getBlock(trap)?.permutation.getState("open_bit") === true;
  const tap = async (p, at) => {
    hand(p, 2, "minecraft:stick");
    p.teleport({ x: at.x + 0.5, y: at.y, z: at.z - 1.5 }, { dimension: dim, facingLocation: { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 } });
    await t.wait(3);
    const r = p.useItemInSlotOnBlock(2, at, Direction.Up);
    await t.wait(10);
    return r;
  };
  t.assert(!open(), "the trapdoor starts closed");
  since = t.tick;
  await tap(vis, trap);
  t.check(!open(), "with the switch disabled the visitor can't open the trapdoor");
  t.check(told(vis, since), "and is told whose land it is");

  let f = t.waitForm(own, { timeout: 60 });
  t.cmd(own, "/realm:claim");
  (await f).answer("My claim");
  f = await t.waitForm(own, { timeout: 60 });
  t.assert(f.buttons.some((b) => /Visitors may open doors: Disabled/.test(b)), `the claim menu has the door switch, disabled (${f.buttons.join(" | ")})`);
  f.answer("Visitors may open doors");
  await t.waitMessage(own, /Claim updated/, { timeout: 40 });

  await tap(vis, trap);
  t.check(open(), "with the switch enabled the visitor opens the trapdoor");
  since = t.tick;
  await tap(vis, chest);
  t.check(told(vis, since), "a chest stays closed to the visitor: the switch is for doors, trapdoors and gates only");

  // The audit list (operators): every claim with its size and last visit, and the sorts.
  const admin = await t.player("Admin", { op: true, x: 40, z: 0 });
  f = t.waitForm(admin, { timeout: 60 });
  t.cmd(admin, "/realm:claim");
  const main = await f;
  t.assert(main.buttons.some((b) => /All claims \(operator\)/.test(b)), `an operator's claim menu has the audit list (${main.buttons.join(" | ")})`);
  main.answer("All claims");
  const list = await t.waitForm(admin, { timeout: 60 });
  t.check(/1 claim, by owner/.test(list.body ?? ""), `the list counts the claims and says its order (${list.body})`);
  t.check(list.buttons.some((b) => /^Owner: 33 x 33/.test(b) && /last visit online now/.test(b)), `the claim is listed with its size and last visit (${list.buttons.join(" | ")})`);
  t.check(list.buttons.some((b) => /Sort by size/.test(b)) && list.buttons.some((b) => /Sort by owner's last visit/.test(b)), "it can be sorted by size and by last visit");
  list.answer("Sort by size");
  const bySize = await t.waitForm(admin, { timeout: 60 });
  t.check(/by size, biggest first/.test(bySize.body ?? ""), `sorted by size (${bySize.body})`);
  bySize.answer(null);
  f = t.waitForm(vis, { timeout: 60 });
  t.cmd(vis, "/realm:claim");
  const visMenu = await f;
  t.check(!visMenu.buttons.some((b) => /All claims/.test(b)), "a player who isn't an operator has no audit list");
  visMenu.answer(null);
}
