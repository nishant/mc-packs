// Parties: invite by name, accept, the shared tag, party chat (an empty message gets a reply instead of nothing),
// the leader leaving (the next member leads) and the last member leaving (the party is gone, the tag too).
// node tools/test-bds/run.mjs --quiet --only party_bp --scenario tools/test-bds/examples/party-basics.js --timeout 420
export default async function (t) {
  const ann = await t.player("Ann");
  const bob = await t.player("Bob");
  const tagOf = (p) => p.getTags().find((x) => x.startsWith("realm_party:"));

  let since = t.tick;
  t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite ran");
  await t.waitMessage(bob, /Ann invited you to their party/, { since });
  since = t.tick;
  t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept ran");
  await t.waitMessage(bob, /You joined the party/, { since });
  await t.waitUntil(() => tagOf(ann) && tagOf(ann) === tagOf(bob), { timeout: 100, message: "both carry the party tag" });

  since = t.tick;
  t.cmd(bob, '/realm:party_chat "meet at the portal"');
  await t.waitMessage(ann, /\[Party\] Bob: meet at the portal/, { since });

  since = t.tick;
  t.cmd(bob, '/realm:party_chat "   "');
  await t.waitMessage(bob, /Type a message/, { since });

  since = t.tick;
  t.cmd(ann, "/realm:party_leave");
  await t.waitMessage(ann, /You left the party/, { since });
  await t.waitMessage(bob, /Ann left the party\. Bob leads the party now\./, { since });
  await t.waitUntil(() => !tagOf(ann), { timeout: 100, message: "Ann lost the tag" });

  since = t.tick;
  t.cmd(bob, "/realm:party_leave");
  await t.waitMessage(bob, /You left the party/, { since });
  await t.waitUntil(() => !tagOf(bob), { timeout: 100, message: "Bob lost the tag" });
  since = t.tick;
  t.cmd(bob, "/realm:party_leave");
  await t.waitMessage(bob, /not in a party/, { since });
}
