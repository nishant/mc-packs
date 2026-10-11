// Saved data across a server restart: phase 1 changes something, t.restart() stops the server and
// starts it again on the same world, then the scenario runs again with t.phase === 2.
// Note: a simulated player gets a new player.id each time it spawns, so data a pack keys by
// player.id does not follow it; world-level data (dynamic properties, scoreboards) does.
export default async function (t) {
  if (t.phase === 1) {
    t.world.setDynamicProperty("harness:marker", "kept");
    t.server("/scoreboard objectives add harness_test dummy");
    t.server("/scoreboard players set fake_player harness_test 42");
    await t.wait(20);
    t.restart("saved, restarting");
  }
  t.assert(t.world.getDynamicProperty("harness:marker") === "kept", "dynamic property survived the restart");
  const score = t.world.scoreboard.getObjective("harness_test")?.getScores().find((s) => s.participant.displayName === "fake_player")?.score;
  t.assert(score === 42, `scoreboard survived the restart (${score})`);
}
