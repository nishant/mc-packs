// F29: a visitor's own tamed pet is theirs to use inside someone else's claim. The visitor tames a wolf outside any
// claim (Land Claims records the tamer, since a vanilla pet loses tamedToPlayerId when tamed), the wolf is moved
// into the owner's claim, and the visitor can leash it there. Another visitor still can't (the claim keeps it).
// Before the fix every tamed animal in a claim was locked to everyone but the claim's players, its tamer included.
// A simulated player's interactWithEntity never fires beforeEvents.playerInteractWithEntity, which is where Land Claims
// both watches a taming and refuses a tap, so the taps that matter go through the harness-only probe that claims-animals
// uses (tools/test-bds/hooks/claims-taps.mjs): it hands claims_bp's own tap handlers the tap a real player's would be,
// with the real player, wolf and held item. Each bone is tapped through the probe (the pack starts watching) and then
// fed for real (the game tames the wolf); the leash taps in the claim go through the probe, which reports whether the
// pack canceled them, and the visitor's leash is then made for real. Before F29 (5f88e080^ as the hook's second
// argument) the probe's tap of the tamer on their own wolf in the claim is canceled: this fails there.
//   mkdir -p /tmp/claims-own-pet
//   node tools/test-bds/hooks/claims-taps.mjs /tmp/claims-own-pet/packs
//   node tools/test-bds/run.mjs --quiet --flat --packs /tmp/claims-own-pet/packs --only claims_bp --scenario tools/test-bds/examples/claims-own-pet.js --timeout 600
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

  // claims_bp's own tap handlers, through the probe (see the header): { handlers, cancel }.
  const reports = new Map();
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "harness:claims_tap_report") return;
      try {
        const r = JSON.parse(message);
        reports.set(r.id, r);
      } catch {}
    },
    { namespaces: ["harness"] },
  );
  let seq = 0;
  const tapEntity = async (p, e, item) => {
    const id = `p${++seq}`;
    await t.console(`scriptevent harness:claims_tap ${JSON.stringify({ id, kind: "entity", player: p.name, entity: e.id, item })}`);
    const r = await t.waitUntil(() => reports.get(id), { timeout: 60, message: "the tap probe in claims_bp answered" });
    t.assert(!r.error && r.handlers >= 1, `the probe reached claims_bp's entity tap handlers (${r.error ?? r.handlers})`);
    await t.wait(3); // the pack says whose land it is a tick later (system.run)
    return r.cancel;
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
    await tapEntity(vis, wolf, "minecraft:bone");
    await use(vis, wolf);
  }
  t.assert(tamed(wolf), "the visitor tamed the wolf with bones");
  await t.wait(20);

  // Into the owner's claim.
  // The tamer comes along (a tamed wolf more than 12 blocks from its owner teleports back to them).
  vis.teleport({ x: 8.5, y, z: 6.5 }, { dimension: dim });
  other.teleport({ x: 10.5, y, z: 6.5 }, { dimension: dim });
  wolf.teleport({ x: 6.5, y, z: 4.5 }, { dimension: dim });
  await t.wait(10);
  const at = wolf.location;
  t.assert(Math.abs(at.x) <= 16 && Math.abs(at.z) <= 16, `the wolf is in the owner's claim (${at.x.toFixed(1)}, ${at.z.toFixed(1)})`);

  // Someone else's tap is still refused there.
  let since = t.tick;
  t.check(await tapEntity(other, wolf, "minecraft:lead"), "another visitor can't leash the visitor's wolf in the claim (the tap is canceled)");
  t.check(told(other, since), "and is told whose land it is");

  // The tamer's own tap goes through.
  since = t.tick;
  t.check(!(await tapEntity(vis, wolf, "minecraft:lead")), "the visitor's own leash tap on their wolf in the owner's claim goes through");
  t.check(!told(vis, since), "and is not told the land is claimed");
  hand(vis, 1, "minecraft:lead", 1);
  await use(vis, wolf);
  t.check(held(vis, 1) === 0, `the visitor leashes their own wolf in the owner's claim (${held(vis, 1)} lead left of 1)`);
}
