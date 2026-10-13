// News draft: /realm:news_body opens the editor, but chat is still open (UserBusy), so the operator pastes
// the next part with /realm:news_add. When the editor finally shows, it must hold the whole draft, and saving
// must keep every part.
// Run with: node tools/test-bds/run.mjs --quiet --only news_bp --scenario tools/test-bds/examples/news-draft-busy.js --timeout 600
export default async function (t) {
  const p = await t.player("Editor", { op: true });
  await t.wait(120); // past the join news popup (release news), answered below if it shows
  for (const f of t.forms(p)) if (!f.answered) f.answer(0);

  const first = t.waitForm(p, { title: "Edit Realm news" });
  t.assert(t.cmd(p, '/realm:news_body "Part one. "').ok, "news_body ran");
  const busy = await first;
  const second = t.waitForm(p, { title: "Edit Realm news", timeout: 400 });
  busy.answer("busy"); // chat still open
  await t.wait(2);
  t.assert(t.cmd(p, '/realm:news_add "Part two."').ok, "news_add ran");

  const form = await second;
  const boxes = form.elements.filter((e) => /Body, part/.test(e.label ?? "")).map((e) => e.default ?? "");
  t.log("editor body:", JSON.stringify(boxes.join("")));
  t.check(boxes.join("") === "Part one. Part two.", "editor shows the whole draft");
  form.answer(true); // Save with what is shown
  await t.waitMessage(p, /News saved/i, { pack: "news_bp" });
  const read = t.waitForm(p);
  t.cmd(p, "/realm:news_read");
  const news = await read;
  t.log("saved body:", JSON.stringify(news.body));
  t.check(news.body === "Part one. Part two.", "saved news keeps both parts");
  news.answer(0);
}
