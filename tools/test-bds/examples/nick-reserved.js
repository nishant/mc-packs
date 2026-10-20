// Nicknames, O31 (W5): the reserved names, natively (nick-impersonate.js covers an offline operator's gamertag and the
// de-op during "Clear nickname"; this covers the lists).
// - reservedNames (default "Admin, Owner, Server"): a player can't take them in any case or spacing ("ad_min", "Ad min");
//   an operator may.
// - reservedGamertags: a gamertag listed there is refused even though that player has never joined, for operators too.
// - An online operator's gamertag is reserved without being listed, also when spaced differently ("A_nn" for Ann),
//   while anyone may use their own gamertag.
//   node tools/test-bds/run.mjs --quiet --only nick_bp --scenario tools/test-bds/examples/nick-reserved.js --timeout 300
export default async function (t) {
  const sam = await t.player("Sam");
  const ann = await t.player("Ann", { op: true });
  await t.wait(20);

  /** Types a nickname into the real form; returns what the pack said. */
  const setNick = async (p, name) => {
    let next = t.waitForm(p, { timeout: 100 });
    t.assert(t.cmd(p, "/realm:nick").ok, "/realm:nick ran");
    let f = await next;
    if (/Nicknames/.test(f.title)) {
      next = t.waitForm(p, { timeout: 100, title: "Nickname" });
      f.answer("My nickname");
      f = await next;
    }
    const again = t.waitForm(p, { timeout: 30 }).catch(() => undefined);
    const since = t.tick;
    f.answer({ Nickname: name });
    const reopened = await again;
    reopened?.answer(null);
    await t.wait(2);
    return t.messages(p, { kind: "chat", pack: "nick_bp", since }).map((m) => m.plain).join(" / ");
  };

  for (const name of ["Admin", "ad_min", "Ad min", "OWNER", "Server"]) {
    const said = await setNick(sam, name);
    t.check(/is a reserved name/.test(said) && !/nickname is now/.test(said), `a player can't take "${name}" (${said})`);
  }
  const opSaid = await setNick(ann, "Server");
  t.check(/Your nickname is now/.test(opSaid), `an operator may use a reserved word (${opSaid})`);

  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "n1", pack: "nick_bp", key: "reservedGamertags", value: "NeverSeen, Boss Lady" }));
  await t.wait(5);
  for (const [p, name] of [[sam, "NeverSeen"], [sam, "BossLady"], [ann, "never_seen"]]) {
    const said = await setNick(p, name);
    t.check(/is a reserved name/.test(said), `${p.name} can't take the listed gamertag "${name}", though its player never joined (${said})`);
  }

  const asOp = await setNick(sam, "A_nn");
  t.check(/is a reserved name/.test(asOp), `an online operator's gamertag is reserved, spaced differently too (${asOp})`);
  const own = await setNick(sam, "Sam");
  t.check(/Your nickname is now/.test(own), `a player may use their own gamertag (${own})`);
  const free = await setNick(sam, "Sammy");
  t.check(/Your nickname is now/.test(free), `a free nickname is saved (${free})`);
}
