// Realm Settings: closing My preferences with X doesn't open a second "Nothing was saved" popup (it came on every
// close, even after only looking); chat says it instead, once, with how to get back. Saving still works after it.
//   node tools/test-bds/run.mjs --quiet --only settings_bp,welcome_bp --scenario tools/test-bds/examples/settings-prefs-close.js --timeout 300
export default async function (t) {
  const p = await t.player("Ann");
  await t.wait(60); // past the welcome popup's first try
  for (const f of t.forms(p)) if (!f.answered) f.answer(null);
  await t.wait(5);

  // 1. Closed with X: no second form, one chat line.
  let next = t.waitForm(p, { timeout: 200, title: "My preferences" });
  let since = t.tick;
  t.assert(t.cmd(p, "/realm:prefs").ok, "/realm:prefs ran");
  let f = await next;
  f.answer(null);
  const popup = await t.waitForm(p, { timeout: 60 }).catch(() => undefined);
  t.check(!popup, `no second popup after closing with X (got "${popup?.title ?? ""}")`);
  popup?.answer(null);
  const told = t.messages(p, { pack: "settings_bp", since }).filter((m) => /nothing was saved/i.test(m.plain));
  t.check(told.length === 1, `chat says nothing was saved, once (${told.length}: ${told.map((m) => m.plain).join(" / ")})`);
  t.check(told.some((m) => /\/realm:prefs/.test(m.plain)), "and how to open it again");

  // 2. The menu isn't stuck: it opens again and saves.
  next = t.waitForm(p, { timeout: 200, title: "My preferences" });
  since = t.tick;
  t.assert(t.cmd(p, "/realm:prefs").ok, "/realm:prefs ran again");
  f = await next;
  next = t.waitForm(p, { timeout: 100 });
  f.answer({ "Welcome popup when I join": false });
  const report = await next;
  t.check(/1 change saved/.test(String(report.title)), `saving works after a close (${report.title})`);
  report.answer(1);
  t.check(t.messages(p, { pack: "settings_bp", since }).some((m) => /Welcome popup when I join/.test(m.plain)), "the saved change is in chat");
}
