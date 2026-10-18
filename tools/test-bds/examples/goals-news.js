// Community Goals, town news: a reached goal is Townsfolk gossip about the top contributor (realm:gossip kind "goal",
// kept by Townsfolk), the title "Pillar of <goal>" for them (Titles), and a thank-you letter (realm:mail_send) to each
// of the top contributors, offline ones too. A second goal reached right after still sends its title and letters,
// but no gossip: one piece per in-game hour from the pack.
// node tools/test-bds/run.mjs --quiet --only goals_bp,npc_bp,titles_bp --scenario tools/test-bds/examples/goals-news.js --timeout 600
export default async function (t) {
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:gossip", "realm:mail_send", "realm:title_unlock", "realm:npc_gossip"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id) => events.filter((e) => e.id === id).map((e) => e.m);
  const p = await t.player("Op", { op: true });
  await t.wait(40);
  const base = { x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const goals = [
    { name: "Wall", item: "cobblestone", at: base },
    { name: "Bridge Over The Long River", item: "dirt", at: { ...base, x: base.x - 4 } },
  ];
  for (const g of goals) {
    t.dimension.getBlock(g.at).setType("minecraft:chest");
    await t.wait(2);
    p.lookAtBlock(g.at);
    await t.wait(5);
    const added = t.waitMessage(p, /added/i, { pack: "goals_bp" });
    t.assert(t.cmd(p, `/realm:goals_add ${g.item} 8 "${g.name}"`).ok, `goals_add ${g.name}`);
    await added;
  }
  // Three offline contributors on each goal (1 each), as on a big server.
  await t.console(`scriptevent realm:goals_test {"donors":3}`);
  await t.wait(5);

  const donate = async (g) => {
    p.giveItem(new t.mc.ItemStack(`minecraft:${g.item}`, 5), false);
    await t.wait(2);
    const list = t.waitForm(p);
    t.cmd(p, "/realm:goals");
    const l = await list;
    const page = t.waitForm(p);
    l.answer(g.name.split(" ")[0]);
    const f = await page;
    t.answerForm(p, null);
    f.answer("Donate");
    await t.wait(10);
  };
  const since = t.tick;
  await donate(goals[0]);
  await t.waitMessage(p, /reached/, { pack: "goals_bp", since, timeout: 60 });
  await t.wait(10);
  const g1 = of("realm:gossip").filter((m) => m.kind === "goal");
  t.log("gossip:", JSON.stringify(g1));
  t.check(g1.length === 1 && g1[0].player === p.id && g1[0].place === "Wall", "one gossip about the top contributor of Wall");
  t.check(of("realm:title_unlock").some((m) => m.player === p.id && m.title === "Pillar of Wall"), "title Pillar of Wall sent");
  await t.waitMessage(p, /New title unlocked: Pillar of Wall/, { since, timeout: 60 });
  const mail1 = of("realm:mail_send");
  t.log("letters:", mail1.map((m) => `${m.to}: ${m.subject}`).join(" | "));
  t.check(mail1.length === 4, `four thank-you letters (${mail1.length})`);
  t.check(mail1.some((m) => m.to === p.id && /more than anyone/.test(m.body)), "the top contributor's letter");
  t.check(mail1.filter((m) => m.to !== p.id && /^-4294[89]/.test(m.to)).length === 3, "letters to the three offline contributors");
  t.check(mail1.every((m) => m.subject.length <= 40 && m.body.length <= 600), "letters within Realm Mail's limits");

  // Townsfolk kept it.
  t.system.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  const store = of("realm:npc_gossip").at(-1);
  t.log("townsfolk gossip:", JSON.stringify(store));
  t.check(store.kinds.goal === 1, "Townsfolk remembers the goal gossip");

  // A second goal right after: title and letters, but no second gossip within the in-game hour.
  await donate(goals[1]);
  await t.wait(10);
  t.check(of("realm:gossip").filter((m) => m.kind === "goal").length === 1, "no second goal gossip within the hour");
  t.check(of("realm:title_unlock").some((m) => m.title === "Pillar of the Town"), "a long goal name gives Pillar of the Town");
  t.check(of("realm:mail_send").length === 8, `four more letters (${of("realm:mail_send").length})`);
}
