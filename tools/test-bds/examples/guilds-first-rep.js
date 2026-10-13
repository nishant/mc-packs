// Guilds: reputation for a player who has no score on any scoreboard yet (a new player, or the
// Guilds pack installed without Crowns). getScore throws "Failed to resolve identity" for them, which
// used to drop every point of reputation they earned.
// node tools/test-bds/run.mjs --quiet --only guilds_bp --scenario tools/test-bds/examples/guilds-first-rep.js --timeout 600
export default async function (t) {
  const p = await t.player("Gus");
  /** @param {string} g */
  const rep = (g) => {
    try {
      return t.world.scoreboard.getObjective(`rep_${g}`)?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  let since = t.tick;
  t.system.sendScriptEvent("realm:rep_add", JSON.stringify({ player: p.id, guild: "wardens", amount: 120, reason: "a story choice" }));
  await t.waitMessage(p, /\+120 Wardens rep \(a story choice\)/, { since });
  await t.waitMessage(p, /Wardens' Guild: you are now a Member/, { since });
  t.check(rep("wardens") === 120, `Wardens rep is 120 (${rep("wardens")})`);

  since = t.tick;
  t.system.sendScriptEvent("realm:quest_done", JSON.stringify({ player: p.id, kind: "mine", label: "Mine 12 coal ore" }));
  await t.waitMessage(p, /\+10 Miners rep \(Mine 12 coal ore\)/, { since });
  t.check(rep("miners") === 10, `Miners rep is 10 (${rep("miners")})`);
}
