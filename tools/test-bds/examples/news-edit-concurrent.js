// Realm News: two operators edit the news at once. Bob saves a new body first; Ann, whose editor was already open,
// then changes only the title: Bob's body stays (before, Ann's save put back the body her editor opened with).
//   node tools/test-bds/run.mjs --quiet --only news_bp --scenario tools/test-bds/examples/news-edit-concurrent.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann", { op: true });
  const bob = await t.player("Bob", { op: true });
  await t.wait(130); // past the join news popup, if any
  for (const p of [ann, bob]) for (const f of t.forms(p)) if (!f.answered) f.answer(0);
  await t.wait(5);

  const open = async (p) => {
    const next = t.waitForm(p, { timeout: 100, title: "Edit Realm news" });
    t.assert(t.cmd(p, "/realm:news_edit").ok, `${p.name} opened the editor`);
    return next;
  };
  const parts = (f) => (f.elements ?? []).filter((e) => /Body, part/.test(e.label ?? "")).map((e) => e.label);

  const a = await open(ann);
  const b = await open(bob);
  b.answer({ ...Object.fromEntries(parts(b).map((l, i) => [l, i === 0 ? "Market day is Saturday" : ""])), "Pop up": false });
  await t.waitMessage(bob, /News saved/, { pack: "news_bp" });
  a.answer({ Title: "Town crier", "Pop up": false });
  await t.waitMessage(ann, /News saved/, { pack: "news_bp" });

  const next = t.waitForm(ann, { timeout: 100 });
  t.cmd(ann, "/realm:news_read");
  const f = await next;
  f.answer(0);
  t.check(String(f.title).includes("Town crier"), `Ann's title was saved (${f.title})`);
  t.check(String(f.body) === "Market day is Saturday", `Bob's body was kept (${String(f.body).slice(0, 80)})`);
}
