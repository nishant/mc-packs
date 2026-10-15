// Realm Mail: "My party" at the top of the recipient list writes one letter to every party mate (the Parties pack's
// `realm_party:<code>` tag, set here directly), offline mates included (the roster remembers each player's party);
// players outside the party get nothing. The writer gets one "sent to your party" line.
// node tools/test-bds/run.mjs --quiet --only mail_bp --scenario tools/test-bds/examples/mail-party.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann");
  const bob = await t.player("Bob");
  const cat = await t.player("Cat");
  const dan = await t.player("Dan");
  for (const p of [ann, bob, dan]) p.addTag("realm_party:TEST");
  await t.wait(10);

  // Ann opens the letter form once while Dan is online (the roster notes his party), then Dan logs off.
  let f = t.waitForm(ann, { timeout: 60 });
  t.cmd(ann, "/realm:mail");
  (await f).answer("Write a letter");
  f = await t.waitForm(ann, { timeout: 60 });
  f.answer(null);
  await t.wait(5);
  dan.disconnect();
  await t.wait(20);

  f = t.waitForm(ann, { timeout: 60 });
  t.cmd(ann, "/realm:mail");
  (await f).answer("Write a letter");
  f = await t.waitForm(ann, { timeout: 60 });
  const options = f.elements?.find((e) => Array.isArray(e.options))?.options ?? [];
  t.log(`recipients: ${options.join(" | ")}`);
  t.assert(/My party/.test(options[0] ?? "") && /Bob/.test(options[0]) && /Dan/.test(options[0]) && !/Cat/.test(options[0]), "the first choice is My party, with Bob and offline Dan, without Cat");
  const since = t.tick;
  f.answer({ To: 0, Subject: "Raid tonight", "Letter (up to": "Meet at the portal at dusk." });
  const bobGot = await t.waitMessage(bob, /New letter from Ann: "Raid tonight/, { since, timeout: 60 });
  t.log(`Bob: ${bobGot.plain}`);
  const sent = await t.waitMessage(ann, /Letter sent to your party/, { since, timeout: 60 });
  t.log(`Ann: ${sent.plain}`);
  t.check(/Bob/.test(sent.plain) && /Dan/.test(sent.plain), "Ann is told Bob and Dan got it");
  await t.wait(10);
  t.check(!t.messages(cat, { since }).some((m) => /New letter/.test(m.plain)), "Cat, outside the party, got nothing");

  // Ann's Sent list has a copy for each mate.
  f = t.waitForm(ann, { timeout: 60 });
  t.cmd(ann, "/realm:mail");
  (await f).answer("Sent");
  f = await t.waitForm(ann, { timeout: 60 });
  t.log(`Sent: ${f.buttons.join(" | ")}`);
  t.check(f.buttons.filter((b) => /Raid tonight/.test(b)).length === 2, "Sent holds one copy per mate");
}
