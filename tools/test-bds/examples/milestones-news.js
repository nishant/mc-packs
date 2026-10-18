// Milestones, town news: reaching a milestone's top tier sends the title with the tier ("Loyal III", Titles) and
// Townsfolk gossip (kind "milestone"), at most one piece per in-game hour from the pack: two players reaching it
// together are two titles but one piece of gossip. A player who already had the top tier when the pack first saw them
// gets the title quietly, without gossip.
// node tools/test-bds/run.mjs --quiet --only milestones_bp,npc_bp,titles_bp --scenario tools/test-bds/examples/milestones-news.js --timeout 300
export default async function (t) {
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:gossip", "realm:title_unlock", "realm:npc_gossip"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id) => events.filter((e) => e.id === id).map((e) => e.m);
  await t.console("scoreboard objectives add stats_joins dummy");
  // Cid already has 400 joins (the Stats pack counted them) before Milestones first sees him.
  await t.console("scoreboard players set Cid stats_joins 400");
  const since = t.tick;
  const ann = await t.player("Ann");
  const bob = await t.player("Bob");
  const cid = await t.player("Cid");
  await t.seconds(12); // every player's first (quiet) check
  t.check(of("realm:title_unlock").some((m) => m.player === cid.id && m.title === "Loyal III"), "Cid's earlier top tier gives the title");
  t.check(of("realm:gossip").length === 0, "no gossip for what a player already had");

  await t.console(`scriptevent realm:milestones_test {"player":"Ann","stat":"joins","count":400}`);
  await t.console(`scriptevent realm:milestones_test {"player":"Bob","stat":"joins","count":400}`);
  await t.seconds(12);
  const titles = of("realm:title_unlock").filter((m) => m.title === "Loyal III").map((m) => m.player);
  t.log("Loyal III titles:", titles.length, "gossip:", JSON.stringify(of("realm:gossip")));
  t.check(titles.includes(ann.id) && titles.includes(bob.id), "Ann and Bob get Loyal III");
  const g = of("realm:gossip").filter((m) => m.kind === "milestone");
  t.check(g.length === 1 && g[0].place === "Loyal III" && [ann.id, bob.id].includes(g[0].player), "one piece of gossip for the two of them");
  await t.waitMessage(ann, /New title unlocked: Loyal III/, { since, timeout: 60 });

  t.system.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  t.check(of("realm:npc_gossip").at(-1).kinds.milestone === 1, "Townsfolk remembers it");
}
