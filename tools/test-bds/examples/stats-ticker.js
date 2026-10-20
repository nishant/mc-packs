// The stats ticker ranks each player against everyone: two players with different scores see "#1 of 2" and
// "#2 of 2" on the same stat in the same second (the ranked lists are shared per tick, never mixed up between players).
// Run with: node tools/test-bds/run.mjs --quiet --only stats_bp --scenario tools/test-bds/examples/stats-ticker.js
export default async function (t) {
  t.echoActionBar = true;
  let offAck;
  const onAck = ({ id, message }) => {
    if (id === "realm:cfg_ack") {
      const m = JSON.parse(message);
      if (m.id === "ticker_fixture_off") offAck = m;
    }
  };
  t.system.afterEvents.scriptEventReceive.subscribe(onAck, { namespaces: ["realm"] });
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "ticker_fixture_off", pack: "stats_bp", key: "tickerDefaultOn", value: false }));
  await t.waitUntil(() => offAck, { timeout: 40, message: "private ticker default-off acknowledgement" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(onAck);
  t.assert(offAck.ok === true, "the rank fixture controls its initial ticker state; default-on has separate coverage");
  const a = await t.player("Ann");
  const b = await t.player("Bob", { x: 168, z: 170 });
  t.server("/scoreboard objectives add stats_deaths dummy");
  await t.wait(2);
  const deaths = t.world.scoreboard.getObjective("stats_deaths");
  deaths.setScore("Ann", 3);
  deaths.setScore("Bob", 7);
  deaths.setScore("Offline Carl", 5);
  for (const p of [a, b]) {
    // Show only Deaths, every chosen stat on one line, full style.
    t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "m" + p.name, pack: "stats_bp", key: "tickerMode", value: "all", player: p.id }));
    for (const s of ["playtime", "mobkills", "mined", "travelled"]) t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "s" + p.name + s, pack: "stats_bp", key: `tickerShows.${s}`, value: false, player: p.id }));
    const since = t.tick;
    t.assert(t.cmd(p, "/realm:stats_ticker").ok, "the ticker toggle runs");
    await t.waitMessage(p, /Stats ticker: Enabled\./, { kind: "chat", timeout: 40, since });
  }
  const [ma, mb] = await Promise.all([t.waitMessage(a, /Deaths/, { kind: "actionbar", timeout: 80 }), t.waitMessage(b, /Deaths/, { kind: "actionbar", timeout: 80 })]);
  t.log("Ann sees:", ma.plain, "| Bob sees:", mb.plain);
  t.check(/Deaths 3 #3 of 3/.test(ma.plain), "Ann is #3 of 3 with 3 deaths");
  t.check(/Deaths 7 #1 of 3/.test(mb.plain), "Bob is #1 of 3 with 7 deaths");
  deaths.setScore("Ann", 9);
  const ma2 = await t.waitMessage(a, /Deaths 9/, { kind: "actionbar", timeout: 80 });
  t.log("Ann now:", ma2.plain);
  t.check(/Deaths 9 #1 of 3/.test(ma2.plain), "a new score changes the rank by the next refresh (within 2 seconds)");
}
