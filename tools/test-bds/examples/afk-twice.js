// /realm:afk while already AFK answers "You're already AFK. Move to come back." (with announcements on, nothing
// else would: the AFK announcement only goes out once). Run with: node tools/test-bds/run.mjs --quiet --only afk_bp --scenario tools/test-bds/examples/afk-twice.js
export default async function (t) {
  const p = await t.player("Alex");
  t.assert(t.cmd(p, "/realm:afk").ok, "first /realm:afk ran");
  await t.waitMessage(p, /is now AFK/i, { kind: "broadcast" });
  await t.wait(5);
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:afk").ok, "second /realm:afk ran");
  const m = await t.waitMessage(p, /already AFK/i, { since, timeout: 40 });
  t.log("second time:", m.plain);
  t.check(p.hasTag("afk"), "still AFK");
}
