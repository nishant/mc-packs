// A player with no score on any objective (Stats added while they were online, or their scores reset) still
// sees the stats ticker, at 0: getScore throws "Failed to resolve identity" for such a name, which used to stop
// the ticker (a warning every second) until they earned a first score.
// Run with: node tools/test-bds/run.mjs --quiet --only stats_bp --scenario tools/test-bds/examples/stats-new-name.js
export default async function (t) {
  t.echoActionBar = true;
  const p = await t.player("Nell");
  await t.wait(10);
  // No score anywhere: forget every score the joining counted.
  for (const o of t.world.scoreboard.getObjectives()) {
    try {
      o.removeParticipant("Nell");
    } catch {
      // not on this one
    }
  }
  await t.wait(2);
  t.check(t.world.scoreboard.getParticipants().every((id) => id.displayName !== "Nell"), "Nell has no score on any objective");
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "m", pack: "stats_bp", key: "tickerMode", value: "all", player: p.id }));
  for (const s of ["playtime", "mobkills", "mined", "travelled"])
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "s" + s, pack: "stats_bp", key: `tickerShows.${s}`, value: s === "mined", player: p.id }));
  const since = t.tick;
  t.cmd(p, "/realm:stats_ticker");
  const m = await t.waitMessage(p, /Mined/i, { kind: "actionbar", timeout: 100, since });
  t.log("Nell sees:", m.plain);
  t.check(/Mined 0/i.test(m.plain), "the ticker shows 0 for a name with no scores");
}
