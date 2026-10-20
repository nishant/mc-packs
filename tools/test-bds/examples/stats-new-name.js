// A player with no score on any objective (Stats added while they were online, or their scores reset) still
// sees the stats ticker, at 0: getScore throws "Failed to resolve identity" for such a name, which used to stop
// the ticker (a warning every second) until they earned a first score. Also: a changed ticker setting applies at once.
// Run with: node tools/test-bds/run.mjs --quiet --only stats_bp --scenario tools/test-bds/examples/stats-new-name.js
export default async function (t) {
  t.echoActionBar = true;
  let offAck;
  const onAck = ({ id, message }) => {
    if (id === "realm:cfg_ack") {
      const m = JSON.parse(message);
      if (m.id === "zero_fixture_off") offAck = m;
    }
  };
  t.system.afterEvents.scriptEventReceive.subscribe(onAck, { namespaces: ["realm"] });
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "zero_fixture_off", pack: "stats_bp", key: "tickerDefaultOn", value: false }));
  await t.waitUntil(() => offAck, { timeout: 40, message: "private ticker default-off acknowledgement" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(onAck);
  t.assert(offAck.ok === true, "the zero-score fixture controls its initial ticker state; default-on has separate coverage");
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
  t.assert(t.cmd(p, "/realm:stats_ticker").ok, "the ticker toggle runs");
  await t.waitMessage(p, /Stats ticker: Enabled\./, { kind: "chat", timeout: 40, since });
  const m = await t.waitMessage(p, /Mined/i, { kind: "actionbar", timeout: 100, since });
  t.log("Nell sees:", m.plain);
  t.check(/Mined 0/i.test(m.plain), "the ticker shows 0 for a name with no scores");
  // The ticker keeps each player's settings between passes: a change in /realm:prefs still shows within a second.
  const since2 = t.tick;
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "st", pack: "stats_bp", key: "tickerStyle", value: "compact", player: p.id }));
  const m2 = await t.waitMessage(p, /^(?!.*Blocks).*Mined 0/, { kind: "actionbar", timeout: 60, since: since2 });
  t.log("after the style change:", m2.plain);
}
