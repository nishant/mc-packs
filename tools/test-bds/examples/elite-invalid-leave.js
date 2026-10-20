// F22: the Champions commands run their work a tick after the command (forms and world changes can't run inside it).
// A player who leaves in that tick is gone by then: the pack must skip them instead of logging
// "[elite] InvalidEntityError" (their location, dimension or saved kills). Run with --strict: a warning fails the run.
//   node tools/test-bds/run.mjs --quiet --strict --flat --only elite_bp --scenario tools/test-bds/examples/elite-invalid-leave.js --timeout 300
export default async function (t) {
  const keep = await t.player("Keeper", { x: 0, z: 0 });
  for (const [i, cmd] of ["/realm:champions_near", "/realm:champions", "/realm:champions_spawn"].entries()) {
    const p = await t.player(`Leaver${i}`, { x: 4 + i, z: 0, op: true });
    await t.wait(20);
    t.assert(t.cmd(p, cmd).ok, `${cmd} ran`);
    p.disconnect();
    await t.wait(10);
  }
  // The same commands for a player who stays still work (the guard skips only the gone).
  let since = t.tick;
  t.assert(t.cmd(keep, "/realm:champions_near").ok, "/realm:champions_near ran for the player who stayed");
  const m = await t.waitMessage(keep, /within 64 blocks/, { timeout: 40, since });
  t.check(!!m, `the player who stayed got the list (${m?.plain})`);
}
