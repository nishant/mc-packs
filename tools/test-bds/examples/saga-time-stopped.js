// Story Questlines with the daylight cycle off: a vigil that waits for a time of day ("Stand watch on the tower after
// midnight", Reyes's "The Long Watch") is met, not stuck on a night that never comes or a countdown that never moves.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-time-stopped.js --timeout 400
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:side") sides.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, ...msg }));
  const X = 700, Z = 700;
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  const p = await t.player("Tester", { op: true, x: X, z: Z, gameMode: "survival" });
  p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  await t.wait(20);
  t.cmd(p, "/realm:saga_place watchtower");
  await t.wait(20);
  debug(p, { action: "jump", story: "wardens_oath", chapter: "long_watch" });
  await t.wait(5);
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
  // The defense done, the vigil is the step the tracker points at. Time is stopped, so the night window counts as met:
  // the row names the vigil's own work, with no wait for midnight and no countdown.
  debug(p, { action: "bump", story: "wardens_oath", i: 0, n: 99 });
  const since = t.tick;
  const box = await t.waitUntil(() => sides.filter((s) => s.tick >= since && s.m.player === p.id && s.m.from === "saga" && s.m.slot === "quest").map((s) => String(s.m.text).replace(/§./g, "")).find((x) => x.length > 0), { timeout: 200, message: "the quest box shows the vigil" });
  t.log(`box: ${JSON.stringify(box)}`);
  t.check(!/in about \d+ min/.test(box), "no countdown while the daylight cycle is off");
  t.check(!/wait for midnight|time of day is stopped/.test(box), "the vigil does not wait for a night that never comes");
}
