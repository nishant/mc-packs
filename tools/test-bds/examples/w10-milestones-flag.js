// W10 O53: the owning pack reports the saved join flag. The harness add-on cannot read another pack's
// dynamic properties. A recheck of the same player sends no extra title. Not run by the author.
//   node tools/test-bds/run.mjs --quiet --only milestones_bp --scenario tools/test-bds/examples/w10-milestones-flag.js --timeout 300
export default async function (t) {
  /** @type {{ id: string, m: any }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:title_unlock" && id !== "realm:milestones_test_report") return;
      try {
        events.push({ id, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  await t.console("scoreboard objectives add stats_joins dummy");
  await t.console("scoreboard players set Ann stats_joins 400");
  const ann = await t.player("Ann");
  await t.waitUntil(() => events.some((e) => e.id === "realm:title_unlock" && e.m.player === ann.id && e.m.title === "Loyal III"), { timeout: 400, message: "Loyal III" });
  const before = events.filter((e) => e.id === "realm:title_unlock" && e.m.player === ann.id).length;
  const n = events.length;
  await t.console('scriptevent realm:milestones_test {"player":"Ann","report":true}');
  await t.waitUntil(() => events.length > n && events.at(-1)?.id === "realm:milestones_test_report", { timeout: 60, message: "owning report" });
  const report = events.at(-1)?.m;
  t.log("report:", JSON.stringify(report));
  t.check(report?.tf === 1 && !report?.error && report?.player === ann.id, "owning pack persisted tf");
  t.check(report?.name === "Ann" && report?.joins >= 3, "name and reached tiers stay");
  await t.console('scriptevent realm:milestones_test {"player":"Ann","recheck":true}');
  await t.wait(40);
  const after = events.filter((e) => e.id === "realm:title_unlock" && e.m.player === ann.id).length;
  t.check(after === before, `recheck sent no extra title (${after - before})`);
}
