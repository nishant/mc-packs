// Realm Mail with Parties: "My party" at the top of the recipient list writes one letter to every party mate, offline
// mates included (party_bp's realm:party_members list); players outside the party get nothing. The writer gets one
// "sent to your party" line, and Sent keeps a copy per mate.
// node tools/test-bds/run.mjs --quiet --only mail_bp,party_bp --scenario tools/test-bds/examples/mail-party.js --timeout 300
export default async function (t) {
  const ann = await t.player("Ann");
  const bob = await t.player("Bob");
  const cat = await t.player("Cat");
  const dan = await t.player("Dan");
  await t.wait(10);
  for (const p of [bob, dan]) {
    const since = t.tick;
    t.assert(t.cmd(ann, `/realm:party_invite ${p.name}`).ok, `invite ${p.name}`);
    await t.waitMessage(p, /invited you/, { since });
    t.assert(t.cmd(p, "/realm:party_accept").ok, `${p.name} accepts`);
    await t.waitMessage(p, /You joined the party/, { since });
  }
  await t.wait(10);
  dan.disconnect(); // offline, still in the party
  await t.wait(20);

  let f;
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
