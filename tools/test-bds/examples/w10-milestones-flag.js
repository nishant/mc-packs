// W10 O53: Milestones sends a player's old top-tier titles to the Titles pack once, and records that on the player's saved
// record (tf: 1), so the same player joining again after a restart does not get them sent again. Before O53 (537cbaf) the
// "already sent" mark lived only in memory, so every restart sent them all again.
// Phase 1: Ann reaches Loyal III (joins 400), the title goes out once, and her saved record carries tf. Phase 2, after a
// physical restart: Ann joins again. A simulated player gets a new id every spawn, so a harness-only probe in a copy of
// the pack (tools/test-bds/hooks/milestones-rejoin.mjs) moves her phase-1 record onto her new id, drops the pack's
// in-memory state as a fresh start would and runs the pack's own join check: no title may be sent again. The probe uses
// no part of the fix, so the same recipe runs the old code (537cbaf as its second argument), which fails at "tf" in
// phase 1 and sends Loyal III again in phase 2. Titles & Trails runs too: since F32 the flag is set only once it confirms
// the title (realm:title_ack); without it see milestones-title-ack.js.
//   mkdir -p /tmp/milestones-flag
//   node tools/test-bds/hooks/milestones-rejoin.mjs /tmp/milestones-flag/packs
//   node tools/test-bds/run.mjs --quiet --packs /tmp/milestones-flag/packs --only milestones_bp,titles_bp --scenario tools/test-bds/examples/w10-milestones-flag.js --timeout 600
export default async function (t) {
  const ANN_ID = "harness_w10_ann_id";
  /** @type {{ id: string, tick: number, m: any }[]} */
  const events = [];
  const reports = new Map();
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    try {
      if (id === "realm:title_unlock") events.push({ id, tick: t.tick, m: JSON.parse(message) });
      if (id === "harness:milestones_report") {
        const r = JSON.parse(message);
        reports.set(r.id, r);
      }
    } catch {}
  });
  let seq = 0;
  const probe = async (body) => {
    const id = `ms-${t.phase}-${++seq}`;
    await t.console(`scriptevent harness:milestones_probe ${JSON.stringify({ id, ...body })}`);
    return t.waitUntil(() => reports.get(id), { timeout: 60, message: "the probe in Milestones answered" });
  };
  const titlesFor = (p, since = 0) => events.filter((e) => e.m.player === p.id && e.tick >= since);

  if (t.phase === 1) {
    await t.console("scoreboard objectives add stats_joins dummy");
    await t.console("scoreboard players set Ann stats_joins 400");
    const ann = await t.player("Ann");
    await t.waitUntil(() => titlesFor(ann).some((e) => e.m.title === "Loyal III"), { timeout: 400, message: "Loyal III" });
    await t.wait(40);
    const sent = titlesFor(ann).filter((e) => e.m.title === "Loyal III").length;
    t.check(sent === 1, `Loyal III was sent once (${sent})`);
    const report = await probe({ report: "Ann" });
    t.log("report:", JSON.stringify(report));
    t.check(report.tf === 1 && !report.error && report.player === ann.id, `the owning pack saved tf on Ann's record (${JSON.stringify(report)})`);
    t.check(report.name === "Ann" && report.joins >= 3, "name and reached tiers stay");
    t.world.setDynamicProperty(ANN_ID, ann.id);
    t.assert(t.failures.length === 0, `phase 1: ${t.failures.length} failed checks`);
    t.restart("Ann's record saved with the flag; restarting");
    return;
  }

  const from = t.world.getDynamicProperty(ANN_ID);
  t.assert(typeof from === "string", `Ann's phase-1 id was kept (${from})`);
  const ann = await t.player("Ann");
  await t.wait(60);
  const since = t.tick;
  const report = await probe({ rejoin: "Ann", from });
  t.log("after rejoin:", JSON.stringify(report));
  t.check(!report.error && report.tf === 1 && report.joins >= 3, `Ann's earlier record is hers again, flag and tiers kept (${JSON.stringify(report)})`);
  await t.wait(40);
  const again = titlesFor(ann, since);
  t.check(again.length === 0, `joining again after a restart sent no title again (${again.map((e) => e.m.title).join(", ")})`);
}
