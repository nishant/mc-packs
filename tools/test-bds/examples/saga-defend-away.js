// Story Questlines defenses can't be won by walking away: a wave whose mobs unload (the player ran off, their chunk
// went) is not "beaten", and the next waves don't come (and get counted) while nobody is there. Coming back, the
// wave that went with the chunk comes again. Reyes's "The Long Watch" (wardens_oath) at the Ruined Watchtower.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-defend-away.js --timeout 500
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
  const AREA = "defend_here";

  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  t.server(`/tickingarea add circle ${X} 0 ${Z} 4 ${AREA} true`);
  await t.loadArea(X + 2000, Z, { radius: 1 });
  await t.wait(40);
  const p = await t.player("Tester", { op: true, x: X, z: Z, gameMode: "survival" });
  p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  await t.wait(20);
  t.cmd(p, "/realm:saga_place watchtower");
  await t.wait(20);
  debug(p, { action: "jump", story: "wardens_oath", chapter: "long_watch" });
  await t.wait(5);
  const req = "d1";
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

  // Run off: the player goes 2,000 blocks away and the watchtower's chunks unload with wave 1 in them.
  let since = t.tick;
  p.teleport({ x: X + 2000.5, y: p.location.y, z: Z + 0.5 });
  t.server(`/tickingarea remove ${AREA}`);
  await t.seconds(20);
  const away = t.messages(p, { since }).map((m) => m.plain);
  t.log("while away:", JSON.stringify(away.filter((m) => /Story/.test(m))));
  t.check(!away.some((m) => /Wave \d+ beaten|holds!|: done/.test(m)), "no wave counts as beaten while the player is away");

  // Back: the wave that unloaded comes again.
  since = t.tick;
  t.server(`/tickingarea add circle ${X} 0 ${Z} 4 ${AREA} true`);
  await t.wait(40);
  p.teleport({ x: X + 0.5, y: p.location.y, z: Z + 0.5 });
  await t.waitUntil(() => adds().filter((e) => e.isValid).length > 0, { timeout: 300, message: "a wave is there again after coming back" });
  for (let k = 0; k < 6; k++) {
    await t.seconds(1);
    t.log(`back +${k + 1}s: ${adds().length} mobs`);
  }
  const back = t.messages(p, { since }).map((m) => m.plain);
  t.log("back:", JSON.stringify(back.filter((m) => /Story/.test(m))));
  t.check(!back.some((m) => /Wave \d+ beaten/.test(m)), "the unloaded wave isn't counted on coming back");
  t.check(back.some((m) => /attackers regroup/.test(m)), "the wave that unloaded regroups");
  debug(p, { action: "state" });
  await t.wait(10);
}
