// Deck of Many Things, Crowns cards for a player with no score anywhere yet (a new player): The
// Taxman says there was nothing to take, instead of crumbling to dust because reading the missing
// score threw. About 1 minute:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only domt_bp --scenario tools/test-bds/examples/domt-crowns.js
export default async function (t) {
  t.server("/time set noon");
  const p = await t.player("Tester", { op: true });
  const since = t.tick;
  const f1 = t.waitForm(p);
  t.cmd(p, "/realm:domt");
  (await f1).answer("Draw for a player");
  (await t.waitForm(p)).answer({ Card: "The Taxman" });
  const msg = await t.waitMessage(p, /You drew|crumbles/, { since, timeout: 300 });
  t.check(/You drew/.test(msg.plain), `The Taxman is drawn, not crumbled: ${msg.plain}`);
  await t.waitMessage(p, /nothing to take/, { since, timeout: 100 });
  const score = t.world.scoreboard.getObjective("crowns")?.getScores().find((s) => s.participant.displayName === p.name)?.score;
  t.check(score === 0, `Crowns score is 0 (${score})`);
}
