// Story Questlines progress notes don't blank the quest box: a defense's "wave 1 of N" note shows in the small Side HUD
// box at the place the player picked (right4 by default), as a second readout of saga ("saga/note"), while the quest box
// (slot "quest", from "saga") keeps the quest and goes on updating. Reyes's "The Long Watch" (wardens_oath) at the
// Ruined Watchtower.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-note-box.js --timeout 400
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
  const ours = (since) => sides.filter((s) => s.tick >= since && s.m.player === p.id && String(s.m.from).startsWith("saga"));
  const noteAt = await t.waitUntil(() => ours(0).find((s) => /wave 1 of/.test(String(s.m.text))), { timeout: 200, message: "the wave 1 note is shown" });
  t.log(`note: ${JSON.stringify(noteAt.m)}`);
  t.check(noteAt.m.slot !== "quest", `the wave note is not in the quest box (slot ${noteAt.m.slot}, from ${noteAt.m.from})`);
  // While the note shows (60 ticks), the quest box keeps the quest.
  await t.wait(70);
  // (The box is sent only when it changes: the last write up to now, before or during the note, is what shows.)
  const box = ours(0).filter((s) => s.m.slot === "quest" && s.m.from === "saga");
  const last = box[box.length - 1];
  t.log(`quest box writes: ${box.length}; last (tick ${last?.tick}, note at ${noteAt.tick}) ${JSON.stringify(last?.m.text)}`);
  t.check(!!last && /Watch|Wardens/.test(String(last.m.text)) && !/wave 1 of/.test(String(last.m.text)) && last.tick + last.m.ticks > noteAt.tick + 60, "the quest box keeps showing the quest while the note shows");
  t.check(!box.some((s) => /wave 1 of/.test(String(s.m.text))), "the note never went into the quest box");
}
