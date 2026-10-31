// W10 O52: two new Masters in one hour each get their rank titles, and the town gossips once.
// Not run by the author.
//   node tools/test-bds/run.mjs --quiet --only guilds_bp --scenario tools/test-bds/examples/w10-guilds-news.js --timeout 180
export default async function (t) {
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:gossip" && id !== "realm:title_unlock") return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const ann = await t.player("Ann");
  const bob = await t.player("Bob");
  await t.wait(40);
  const add = (p) => t.system.sendScriptEvent("realm:rep_add", JSON.stringify({ player: p.id, guild: "miners", amount: 1500, reason: "test" }));
  add(ann);
  await t.wait(5);
  add(bob);
  await t.wait(20);
  const titles = events.filter((e) => e.id === "realm:title_unlock").map((e) => e.m.player);
  const gossip = events.filter((e) => e.id === "realm:gossip" && e.m.kind === "guild_master");
  t.log("titles:", titles.length, "gossip:", JSON.stringify(gossip));
  t.check(titles.includes(ann.id) && titles.includes(bob.id), "both Masters get a title");
  t.check(gossip.length === 1 && [ann.id, bob.id].includes(gossip[0].m.player), "one piece of town news");
}
