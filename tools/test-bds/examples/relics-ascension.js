// Relic Ascension (Relics): the Storm Staff to +1, +2 and +3 at the relicsmith with shards, Storm Glass and Crowns taken
// once per stage (name and lore follow, gold and Starlit at +3, gossip), a story relic (Hal's Compass) stopping at +1
// until the Gull flag, a duplicate broken into 4 Relic Essence that pays for the next stage first, the Storm set on and
// off (realm:relic_sets) with lightning that can't hurt, and the stage kept on the item across a restart.
// Simulated players can't tap townsfolk, so the test sends Townsfolk's realm:npc_choose for the Relic forge itself.
//   node tools/test-bds/run.mjs --quiet --only relics_bp --scenario tools/test-bds/examples/relics-ascension.js --timeout 400
export default async function (t) {
  const sys = t.system;
  const { ItemStack } = t.mc;
  const SHARD_LORE = "§7Bring 8 to a relicsmith";
  const GLASS_LORE = "§7Charged by a lightning strike";
  const ESSENCE_LORE = "§7From a broken relic: ascends relics";

  if (t.phase === 2) {
    const p = await t.player("Back", { op: true });
    const at = JSON.parse(String(t.world.getDynamicProperty("harness:chest")));
    await t.loadArea(at.x, at.z);
    const chest = t.dimension.getBlock(at).getComponent("minecraft:inventory").container;
    const staff = chest.getItem(0);
    t.log("staff after the restart:", staff?.nameTag, JSON.stringify(staff?.getLore()));
    t.check(staff?.nameTag?.includes("+3"), "the chest's staff is still +3");
    // In the hotbar the pack rewrites name and lore from relic:asc: still +3 means the stage itself was kept.
    p.getComponent("inventory").container.setItem(0, staff);
    chest.setItem(0, undefined);
    await t.wait(50);
    const now = p.getComponent("inventory").container.getItem(0);
    t.log("staff in the hotbar:", now?.nameTag, JSON.stringify(now?.getLore()));
    t.check(now?.nameTag === "§r§6Storm Staff +3" && now.getLore().some((l) => l.includes("Starlit")), "relic:asc survived the restart");
    return;
  }

  /** @type {{ id: string, m: any }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:relic_sets" && id !== "realm:gossip") return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const p = await t.player("Ida's Customer", { op: true });
  await t.wait(30);
  const inv = p.getComponent("inventory").container;
  const sb = t.world.scoreboard;
  const crowns = sb.getObjective("crowns") ?? sb.addObjective("crowns", "Crowns");
  crowns.setScore(p, 2000);
  const count = (lore) => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const s = inv.getItem(i);
      if (s && s.getLore()[0] === lore) n += s.amount;
    }
    return n;
  };
  const find = (name) => {
    for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.nameTag?.includes(name)) return i;
    return -1;
  };
  const glass = new ItemStack("minecraft:prismarine_crystals", 20);
  glass.nameTag = "§r§bStorm Glass";
  glass.setLore([GLASS_LORE]);
  inv.addItem(glass);
  sys.sendScriptEvent("realm:shard_give", JSON.stringify({ player: p.id, amount: 64 }));
  sys.sendScriptEvent("realm:relic_give", JSON.stringify({ player: p.id, relic: "storm_staff" }));
  await t.waitMessage(p, /Storm Staff/, { timeout: 60 });
  await t.wait(5);
  t.assert(count(SHARD_LORE) === 64 && count(GLASS_LORE) === 20, "shards and glass to start");

  /** Opens the forge's ascension list and picks `name`; returns the confirm form (or the info form for a gated relic). */
  const openAscend = async (name) => {
    const forge = t.waitForm(p);
    sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ player: p.id, npc: "ida", pack: "relics_bp", key: "forge" }));
    (await forge).answer("Ascend a relic");
    const list = await t.waitForm(p);
    const button = list.buttons.find((b) => b.includes(name));
    if (!button) {
      list.answer(null);
      return { button, form: undefined };
    }
    const pick = t.waitForm(p);
    list.answer(button);
    return { button, form: await pick };
  };
  const ascendOnce = async (name, stage) => {
    const { form } = await openAscend(name);
    const next = t.waitForm(p);
    const since = t.tick;
    form.answer(0); // Ascend
    await t.waitMessage(p, new RegExp(`${name} is now \\+${stage}`), { since, timeout: 40 });
    (await next).answer(null);
    await t.wait(3);
  };
  const costs = [
    [6, 1, 60],
    [12, 3, 150],
    [20, 5, 400],
  ];
  let shards = 64;
  let glassN = 20;
  let money = 2000;
  for (let stage = 1; stage <= 3; stage++) {
    await ascendOnce("Storm Staff", stage);
    const [s, g, c] = costs[stage - 1];
    shards -= s;
    glassN -= g;
    money -= c;
    t.check(count(SHARD_LORE) === shards && count(GLASS_LORE) === glassN && crowns.getScore(p) === money, `+${stage} took ${s} shards, ${g} glass, ${c} Crowns once (now ${count(SHARD_LORE)}, ${count(GLASS_LORE)}, ${crowns.getScore(p)})`);
  }
  const staffSlot = find("Storm Staff");
  const staff = inv.getItem(staffSlot);
  t.log("staff:", staff?.nameTag, JSON.stringify(staff?.getLore()));
  t.check(staff?.nameTag === "§r§6Storm Staff +3", "gold name with +3");
  t.check(staff?.getLore().some((l) => l.includes("Starlit")) && staff.getLore().some((l) => l.includes("Cooldown: 15s")), "Starlit lore and a 15 s cooldown");
  t.check(events.some((e) => e.id === "realm:gossip" && e.m.kind === "relic_starlit" && e.m.place === "Storm Staff"), "gossip relic_starlit");
  const { button: none } = await openAscend("Storm Staff");
  t.check(!none, "a Starlit relic isn't in the list");
  await t.wait(5);

  // --- A story relic stops at +1 until its condition (Hal's Compass: the Gull flag or Tobin as a Confidant).
  sys.sendScriptEvent("realm:relic_give", JSON.stringify({ player: p.id, relic: "hal_compass" }));
  await t.waitMessage(p, /Hal's Compass/, { timeout: 60 });
  await ascendOnce("Hal's Compass", 1);
  const gated = await openAscend("Hal's Compass");
  t.check(/needs a story or a friend/.test(gated.button ?? ""), `gated at +1 (${gated.button})`);
  t.check(/Gull/.test(gated.form.body), "the forge says what it needs");
  const back = t.waitForm(p);
  gated.form.answer("Back");
  (await back).answer(null);
  sys.sendScriptEvent("realm:npc_flags", JSON.stringify({ player: p.id, flags: { "g:gull": "sailed" } }));
  await t.wait(3);
  await ascendOnce("Hal's Compass", 2);
  shards -= 18;

  // --- Two Rain Charms: one breaks into 4 Relic Essence, which pays first for the next stage.
  sys.sendScriptEvent("realm:relic_give", JSON.stringify({ player: p.id, relic: "rain_charm" }));
  sys.sendScriptEvent("realm:relic_give", JSON.stringify({ player: p.id, relic: "rain_charm" }));
  await t.wait(10);
  const forge = t.waitForm(p);
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ player: p.id, npc: "ida", pack: "relics_bp", key: "forge" }));
  (await forge).answer("Break a duplicate");
  const bl = await t.waitForm(p);
  const cfP = t.waitForm(p);
  bl.answer("Rain Charm");
  const cf = await cfP;
  const again = t.waitForm(p);
  cf.answer(0);
  await t.waitMessage(p, /into 4 Relic Essence/, { timeout: 40 });
  (await again).answer(null);
  let charms = 0;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.nameTag?.includes("Rain Charm")) charms++;
  t.check(charms === 1 && count(ESSENCE_LORE) === 4, `one charm left and 4 essence (${charms}, ${count(ESSENCE_LORE)})`);
  const before = count(SHARD_LORE);
  await ascendOnce("Rain Charm", 1);
  t.check(count(ESSENCE_LORE) === 0 && count(SHARD_LORE) === before - 2, `essence first, then 2 shards (${count(ESSENCE_LORE)}, ${before - count(SHARD_LORE)})`);

  // --- The Storm set: staff, meter and charm in the hotbar; lightning can't hurt. First without it: lightning hurts.
  const health = p.getComponent("health");
  t.dimension.spawnEntity("minecraft:lightning_bolt", p.location);
  await t.wait(30);
  t.log("health after lightning without the set:", health.currentValue);
  t.check(health.currentValue < 19, `lightning hurts without the set (${health.currentValue})`);
  p.extinguishFire(false);
  health.resetToMaxValue();
  sys.sendScriptEvent("realm:relic_give", JSON.stringify({ player: p.id, relic: "storm_meter" }));
  await t.wait(10);
  for (const [name, slot] of [["Storm Staff", 0], ["Storm Meter", 1], ["Rain Charm", 2]]) {
    const i = find(name);
    if (i !== slot) inv.swapItems(i, slot, inv);
  }
  p.selectedSlotIndex = 4;
  await t.waitUntil(() => events.some((e) => e.id === "realm:relic_sets" && e.m.player === p.id && e.m.sets.includes("storm")), { timeout: 80, message: "the Storm set is on" });
  t.dimension.spawnEntity("minecraft:lightning_bolt", p.location);
  await t.wait(40);
  t.log("health after lightning:", health.currentValue);
  t.check(health.currentValue >= 19, `lightning didn't hurt (${health.currentValue})`);
  inv.swapItems(1, 30, inv); // the meter out of the hotbar
  await t.waitUntil(() => events.filter((e) => e.id === "realm:relic_sets" && e.m.player === p.id).at(-1)?.m.sets.length === 0, { timeout: 80, message: "the Storm set is off" });

  // --- The +3 staff into a chest, for after the restart.
  const at = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  t.server(`/setblock ${at.x} ${at.y} ${at.z} chest`);
  await t.wait(2);
  t.dimension.getBlock(at).getComponent("minecraft:inventory").container.setItem(0, inv.getItem(0));
  inv.setItem(0, undefined);
  t.world.setDynamicProperty("harness:chest", JSON.stringify(at));
  await t.wait(20);
  t.restart("the +3 staff is in the chest");
}
