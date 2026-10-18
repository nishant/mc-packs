// Treasure Maps, town news: a found treasure is Townsfolk gossip about the finder (realm:gossip kind "treasure"),
// at most one piece per in-game hour from the pack: a second treasure found right after by someone else sends none.
// The finds go through the pack's test hook (realm:maps_test), since a whole hunt takes minutes.
// node tools/test-bds/run.mjs --quiet --only maps_bp,npc_bp --scenario tools/test-bds/examples/maps-news.js --timeout 300
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
  const ann = await t.player("Ann", { op: true });
  const bob = await t.player("Bob", { x: ann.location.x + 300, z: ann.location.z });
  await t.wait(40);
  for (const p of [ann, bob]) {
    const since = t.tick;
    t.assert(t.cmd(ann, `/realm:maps_give ${p.name}`).ok, `maps_give ${p.name}`);
    await t.waitMessage(p, /treasure map|first clue/i, { since, timeout: 100 });
  }
  await t.wait(10);
  let since = t.tick;
  await t.console(`scriptevent realm:maps_test ${JSON.stringify({ action: "found", player: "Ann" })}`);
  await t.waitMessage(ann, /You found the treasure/, { since, timeout: 60 });
  await t.wait(5);
  const g = of("realm:gossip").filter((m) => m.kind === "treasure");
  t.log("gossip:", JSON.stringify(g));
  t.check(g.length === 1 && g[0].player === ann.id && g[0].name === "Ann", "gossip about Ann's treasure");

  since = t.tick;
  await t.console(`scriptevent realm:maps_test ${JSON.stringify({ action: "found", player: "Bob" })}`);
  await t.waitMessage(bob, /You found the treasure/, { since, timeout: 60 });
  await t.wait(5);
  t.check(of("realm:gossip").filter((m) => m.kind === "treasure").length === 1, "no second treasure gossip within the hour");

  t.system.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  t.check(of("realm:npc_gossip").at(-1).kinds.treasure === 1, "Townsfolk remembers the treasure");
}
