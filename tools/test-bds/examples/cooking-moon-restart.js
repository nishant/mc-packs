// Kitchen: a Blood Moon's window follows game time. A restart in the middle of the night (a realm
// that closed while empty) keeps it open, so a repeat of the same moon isn't announced again; a game
// day later it's closed even if the moon never set, so the next one is. The window is real time
// before the fix (20 minutes), so the restart half only fails before with MOON_MAX_MS made short.
// About 1 minute (two phases):
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only cooking_bp --scenario tools/test-bds/examples/cooking-moon-restart.js
export default async function (t) {
  const p = await t.player("Tester", { op: true });
  const ev = (id, msg) => t.console(`scriptevent ${id} ${JSON.stringify(msg)}`);
  const salt = () => t.messages(p).filter((m) => m.pack === "cooking_bp" && /Moon Salt/.test(m.plain)).length;
  if (t.phase === 1) {
    t.server("/time set midnight");
    await ev("realm:moon", { state: "blood" });
    await t.wait(10);
    t.check(salt() === 1, `the Blood Moon is announced (${salt()})`);
    t.restart("mid-moon restart");
    return;
  }
  await t.seconds(3);
  await ev("realm:moon", { state: "blood" });
  await t.wait(10);
  t.check(salt() === 0, `after the restart the moon is still up: no second announcement (${salt()})`);
  t.server("/time add 24000");
  await t.wait(5);
  await ev("realm:moon", { state: "blood" });
  await t.wait(10);
  t.check(salt() === 1, `a day later yesterday's moon is over: the new one is announced (${salt()})`);
}
