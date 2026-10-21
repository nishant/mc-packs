// F32: Milestones marks a player's old top-tier titles as sent (tf) only once Titles & Trails confirms them with
// realm:title_ack. Run without titles_bp, so nobody confirms: tf stays 0 and a later join check sends the title
// again. Then the scenario answers the way titles_bp does, and from then on no title is sent again.
// Before F32 the flag was set as soon as the titles went out, so with Titles missing the backfill never came again.
//   node tools/test-bds/run.mjs --quiet --only milestones_bp --scenario tools/test-bds/examples/milestones-title-ack.js --timeout 600
export default async function (t) {
  /** @type {{ tick: number, m: any }[]} */
  const titles = [];
  /** @type {any[]} */
  const reports = [];
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    try {
      if (id === "realm:title_unlock") titles.push({ tick: t.tick, m: JSON.parse(message) });
      if (id === "realm:milestones_test_report") reports.push(JSON.parse(message));
    } catch {}
  });
  const report = async () => {
    const n = reports.length;
    await t.console(`scriptevent realm:milestones_test {"player":"Ann","report":true}`);
    await t.waitUntil(() => reports.length > n, { timeout: 60, message: "Milestones answered the report" });
    return reports[reports.length - 1];
  };
  const loyal = (since) => titles.filter((e) => e.m.title === "Loyal III" && e.tick >= since);

  await t.console("scoreboard objectives add stats_joins dummy");
  await t.console("scoreboard players set Ann stats_joins 400");
  const ann = await t.player("Ann");
  await t.waitUntil(() => loyal(0).length > 0, { timeout: 400, message: "Loyal III was sent" });
  await t.wait(40);
  const first = await report();
  t.log("after the first check:", JSON.stringify(first));
  t.check(first.tf === 0 && first.player === ann.id, `with no Titles pack to confirm, tf is not set (${JSON.stringify(first)})`);

  let since = t.tick;
  await t.console(`scriptevent realm:milestones_test {"player":"Ann","recheck":true}`);
  await t.wait(40);
  t.check(loyal(since).length === 1, `the next join check sends Loyal III again (${loyal(since).length})`);
  t.check(loyal(since).every((e) => e.m.ack === "milestones_bp"), "the title asks for a confirmation");

  await t.console(`scriptevent realm:title_ack ${JSON.stringify({ player: ann.id, title: "Loyal III", ack: "milestones_bp" })}`);
  await t.wait(20);
  const after = await report();
  t.log("after the confirmation:", JSON.stringify(after));
  t.check(after.tf === 1, `Titles' confirmation sets tf (${JSON.stringify(after)})`);

  since = t.tick;
  await t.console(`scriptevent realm:milestones_test {"player":"Ann","recheck":true}`);
  await t.wait(40);
  t.check(loyal(since).length === 0, `once confirmed, a join check sends no title again (${loyal(since).length})`);
}
