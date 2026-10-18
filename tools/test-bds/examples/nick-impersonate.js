// Nicknames: a nickname can't be the gamertag of a player who has played here and is offline now (before, only the
// gamertags of players online or with a nickname were checked, so anyone could take an offline operator's name).
// And an operator who is de-opped while the "Clear nickname" question is open clears nothing.
//   node tools/test-bds/run.mjs --quiet --only nick_bp --scenario tools/test-bds/examples/nick-impersonate.js --timeout 300
export default async function (t) {
  const boss = await t.player("BossMan", { op: true });
  await t.wait(20);
  boss.disconnect();
  await t.wait(20);
  const sam = await t.player("Sam");
  const ann = await t.player("Ann", { op: true });
  await t.wait(20);

  const setNick = async (p, name) => {
    const next = t.waitForm(p, { timeout: 100, title: "Nickname" });
    t.assert(t.cmd(p, "/realm:nick").ok, "/realm:nick ran");
    const f = await next;
    const again = t.waitForm(p, { timeout: 30 }).catch(() => undefined);
    const since = t.tick;
    f.answer({ Nickname: name });
    const reopened = await again;
    reopened?.answer(null);
    await t.wait(2);
    return t.messages(p, { kind: "chat", pack: "nick_bp", since }).map((m) => m.plain).join(" / ");
  };

  // 1. The offline operator's gamertag, any case: refused.
  const said = await setNick(sam, "bossman");
  t.check(/someone else's gamertag/.test(said), `an offline player's gamertag is refused (${said})`);
  t.check(!/§.bossman/i.test(sam.nameTag), `Sam's tag isn't BossMan (${sam.nameTag})`);

  // 2. A free name works.
  const ok = await setNick(sam, "Sammy");
  t.check(/Your nickname is now/.test(ok), `a free nickname is saved (${ok})`);

  // 3. Ann (operator) picks Sam's nickname to clear, is de-opped before she confirms: nothing is cleared.
  let next = t.waitForm(ann, { timeout: 100, title: "Nicknames" });
  t.cmd(ann, "/realm:nick");
  let f = await next;
  next = t.waitForm(ann, { timeout: 100 });
  f.answer(1);
  f = await next;
  next = t.waitForm(ann, { timeout: 100 });
  f.answer("Sammy");
  f = await next;
  t.assert(/Clear nickname/.test(String(f.title)), `the confirmation opened (${f.title})`);
  t.deop(ann);
  const since = t.tick;
  f.answer(0);
  await t.wait(10);
  t.check(sam.nameTag.includes("Sammy"), `Sam keeps the nickname (${sam.nameTag})`);
  t.check(t.messages(ann, { kind: "chat", pack: "nick_bp", since }).some((m) => /operators/i.test(m.plain)), "Ann is told it's for operators");
  for (const x of t.forms(ann)) if (!x.answered) x.answer(null);
}
