// Realm News on a new world (or a server that just added the pack): the bundle's release news (what changed since the
// last update) doesn't pop up, since nothing changed here yet; the next update's news is the first. And the default
// chat tips are only about the packs installed here: with only news_bp and nick_bp, the tips list and the posted tip
// are the Nicknames one, never /realm:stats or other packs (before, all 12, three of them about other add-ons).
//   node tools/test-bds/run.mjs --quiet --only news_bp,nick_bp --scenario tools/test-bds/examples/news-new-world.js --timeout 300
export default async function (t) {
  const p = await t.player("Owner", { op: true });
  await t.wait(160); // the news popup comes 100 ticks after joining
  const popups = t.forms(p).filter((f) => f.pack === "news_bp");
  t.check(popups.length === 0, `no release news pops up on a new world (${popups.map((f) => f.title).join(", ")})`);
  for (const f of popups) if (!f.answered) f.answer(0);

  // The tips menu lists only the installed packs' tips.
  let next = t.waitForm(p, { timeout: 100, title: "Tips" });
  t.assert(t.cmd(p, "/realm:news_tips").ok, "/realm:news_tips ran");
  let f = await next;
  const tips = f.buttons.slice(3).map((b) => b.replace(/§./g, ""));
  t.log("tips:", tips.join(" | "));
  t.check(tips.length === 1 && /realm:nick/.test(tips[0]), `only the Nicknames tip (${tips.length}: ${tips.join(" | ")})`);

  // Posted now: the same one.
  const since = t.tick;
  next = t.waitForm(p, { timeout: 100, title: "Tips" });
  f.answer("Post the next tip now");
  const tip = await t.waitMessage(p, /\[Tip\]/, { since });
  t.check(/realm:nick/.test(tip.plain), `the posted tip is about an installed pack (${tip.plain})`);
  f = await next.catch(() => undefined);
  f?.answer(null);
}
