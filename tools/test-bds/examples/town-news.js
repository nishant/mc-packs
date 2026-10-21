// Town Projects, town news: a finished project is Townsfolk gossip about the top contributor (kind "town_project")
// and a letter (realm:mail_send) to each contributor who is offline, telling them their Crowns wait; online ones get
// none (they are paid and told right away). A second project finished within the in-game hour sends its letters
// but no second piece of gossip. Contributors are added through the pack's test hook (realm:town_test "finish").
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp,npc_bp --scenario tools/test-bds/examples/town-news.js --timeout 300
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:gossip", "realm:mail_send", "realm:town_list", "realm:npc_gossip"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id) => events.filter((e) => e.id === id).map((e) => e.m);
  t.server("/gamerule domobspawning false"); // a flat world spawns slimes by day; one killed a survival player mid-run (O80)
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.wait(40);
  sys.sendScriptEvent("realm:town_test", JSON.stringify({ action: "add", player: "Ann", name: "Riverside" }));
  await t.waitUntil(() => of("realm:town_list").some((m) => m.parts > 0 && m.towns?.length), { timeout: 100, message: "realm:town_list" });
  const town = of("realm:town_list").filter((m) => m.parts > 0).at(-1).towns[0];

  let since = t.tick;
  sys.sendScriptEvent("realm:town_test", JSON.stringify({ action: "finish", player: "Ann", town: town.id, project: "well", donors: 3, give: 20 }));
  await t.waitMessage(p, /finished its Well/, { since, timeout: 60 });
  await t.wait(5);
  const g = of("realm:gossip").filter((m) => m.kind === "town_project");
  t.log("gossip:", JSON.stringify(g));
  t.check(g.length === 1 && g[0].player === p.id && /Well in Riverside/.test(g[0].place), "gossip about Ann, the top contributor");
  const mail = of("realm:mail_send");
  t.log("letters:", mail.map((m) => `${m.to} "${m.subject}": ${m.body.replace(/\n/g, " ")}`).join(" | "));
  t.check(mail.length === 3 && mail.every((m) => /^-42949/.test(m.to)), "a letter to each of the three offline contributors");
  t.check(!mail.some((m) => m.to === p.id), "no letter to Ann, who is online");
  // Ann (online) is first; the next two places earn Crowns (topCrowns), the fourth none.
  t.check(mail.filter((m) => /35 Crowns wait|20 Crowns wait/.test(m.body)).length === 2 && mail.every((m) => m.subject === "Well is finished" && m.body.length <= 600), "the letters say whose Crowns wait");

  since = t.tick;
  sys.sendScriptEvent("realm:town_test", JSON.stringify({ action: "finish", player: "Ann", town: town.id, project: "notice_board", donors: 3, give: 20 }));
  await t.waitMessage(p, /finished its Notice Board/, { since, timeout: 60 });
  await t.wait(5);
  t.check(of("realm:gossip").filter((m) => m.kind === "town_project").length === 1, "no second town gossip within the hour");
  t.check(of("realm:mail_send").length === 6, `letters for the second project too (${of("realm:mail_send").length})`);
  sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ action: "gossip" }));
  await t.waitUntil(() => of("realm:npc_gossip").length > 0, { timeout: 60, message: "npc_gossip answer" });
  t.check(of("realm:npc_gossip").at(-1).kinds.town_project === 1, "Townsfolk remembers it");
}
