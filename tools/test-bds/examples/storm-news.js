// Storm Chasing, town news: Storm Glass collected from a charged lightning rod is Townsfolk gossip (realm:gossip kind
// "storm_haul", the glass count as n); a second player's haul right after sends none (one piece per in-game hour from
// the pack). The tap goes through the pack's test hook (realm:storm_test): simulated players' taps can't reach a rod.
// node tools/test-bds/run.mjs --quiet --only storm_bp,npc_bp --scenario tools/test-bds/examples/storm-news.js --timeout 300
export default async function (t) {
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:gossip" && id !== "realm:npc_gossip") return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id) => events.filter((e) => e.id === id).map((e) => e.m);
  const sp = t.world.getDefaultSpawnLocation();
  const ann = await t.player("Ann", { op: true, x: sp.x + 300, z: sp.z });
  const bob = await t.player("Bob", { x: sp.x + 300, z: sp.z + 6 });
  await t.wait(20);
  /** Places a rod beside the player (as a player does), charges it with a bolt, and collects it. */
  const haul = async (p) => {
    const under = p.location;
    const rodAt = { x: Math.floor(under.x) + 2, y: Math.floor(under.y), z: Math.floor(under.z) + 2 };
    t.dimension.getBlock({ x: rodAt.x, y: rodAt.y - 1, z: rodAt.z }).setType("minecraft:stone");
    t.dimension.getBlock(rodAt).setType("minecraft:air");
    p.giveItem(new t.mc.ItemStack("minecraft:lightning_rod", 1), true);
    await t.wait(5);
    p.useItemInSlotOnBlock(p.selectedSlotIndex, { x: rodAt.x, y: rodAt.y - 1, z: rodAt.z }, t.mc.Direction.Up);
    await t.waitUntil(() => t.dimension.getBlock(rodAt)?.typeId === "minecraft:lightning_rod", { timeout: 40, message: "the rod is placed" });
    await t.wait(5);
    t.dimension.spawnEntity("minecraft:lightning_bolt", { x: rodAt.x + 0.5, y: rodAt.y + 1, z: rodAt.z + 0.5 });
    await t.wait(20);
    const since = t.tick;
    await t.console(`scriptevent realm:storm_test ${JSON.stringify({ action: "collect", player: p.name, ...rodAt })}`);
    await t.waitMessage(p, /You collect \d+ Storm Glass/, { since, timeout: 60 });
    await t.wait(5);
  };
  await haul(ann);
  const g = of("realm:gossip").filter((m) => m.kind === "storm_haul");
  t.log("gossip:", JSON.stringify(g));
  t.check(g.length === 1 && g[0].player === ann.id && g[0].n >= 1, "gossip about Ann's haul, with the count");
  await haul(bob);
  t.check(of("realm:gossip").filter((m) => m.kind === "storm_haul").length === 1, "no second haul gossip within the hour");

  t.system.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  t.check(of("realm:npc_gossip").at(-1).kinds.storm_haul === 1, "Townsfolk remembers it");
}
