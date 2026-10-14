// Story Questlines defenses can't be won by waiting: story monsters time out after 10 minutes (expireAdds), but a wave
// being fought (the player is there) stays until it falls, so standing around for 10 minutes doesn't count a wave as
// beaten. A wave none of whose monsters fell for 5 minutes (stuck out of reach) regroups in sight of the middle, so a
// defense can't get stuck either. Time is fast-forwarded with realm:saga_debug `age_adds` (every story monster and the
// player's running defenses 10 minutes older, then the expiry pass 2 s later). Reyes's "The Long Watch" (wardens_oath).
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-defend-expire.js --timeout 420
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const offers = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:npc_offer") offers.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, ...msg }));
  const X = 700, Z = 700;
  
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  await t.wait(40);
  const p = await t.player("Tester", { op: true, x: X, z: Z, gameMode: "survival" });
  p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  await t.wait(20);
  t.cmd(p, "/realm:saga_place watchtower");
  await t.wait(20);
  debug(p, { action: "jump", story: "wardens_oath", chapter: "long_watch" });
  await t.wait(5);
  const req = "x1";
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "reyes", req }));
  await t.wait(4);
  const start = offers.find((o) => o.m.req === req && o.m.key === "start:wardens_oath");
  t.assert(start, `Reyes offers The Long Watch (${JSON.stringify(offers.map((o) => o.m.key))})`);
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer("Accept");
    }
  })();
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:wardens_oath" }));
  await accept;
  await t.waitMessage(p, /Hold the Ruined Watchtower/, { since: t.tick - 40, timeout: 200 });
  const adds = () => t.dimension.getEntities({ tags: ["saga:add"] });
  await t.waitUntil(() => adds().length > 0, { timeout: 200, message: "wave 1 comes" });
  t.log(`wave 1: ${adds().length} mobs`);

  const live = () => adds().filter((e) => e.isValid);
  const n1 = live().length;

  // Ten minutes go by with nobody hurt: the wave stays, isn't counted, and regroups (none fell for 5 minutes).
  let since = t.tick;
  debug(p, { action: "age_adds", seconds: 601 });
  await t.seconds(6);
  const lines = t.messages(p, { since }).map((m) => m.plain).filter((m) => /Story/.test(m));
  t.log("after 10 minutes:", JSON.stringify(lines));
  t.check(!lines.some((m) => /Wave \d+ beaten|holds!/.test(m)), "waiting 10 minutes doesn't beat the wave");
  t.check(live().length === n1, `the wave is still there (${live().length} of ${n1})`);
  t.check(lines.some((m) => /last attackers regroup/.test(m)), "a wave nobody beat for 5 minutes regroups");

  // Killing them still counts.
  since = t.tick;
  for (const e of live()) e.kill();
  await t.waitMessage(p, /Wave 1 beaten/, { since, timeout: 100 });
  debug(p, { action: "state" });
  await t.wait(10);
}
