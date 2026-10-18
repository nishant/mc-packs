// Parties: a world with hundreds of parties (offline players' parties stay until they leave them) still saves a new
// one. Before, every party was one JSON property capped at 30,000 characters: past about 280 parties of two, nothing
// was saved any more (only a warning in the log), so parties made after that were gone after a restart. (Simulated
// players get a new id each time they spawn, so after the restart the pack's console test hook reports what it has.)
// node tools/test-bds/run.mjs --quiet --only party_bp --scenario tools/test-bds/examples/party-many.js --timeout 600
export default async function (t) {
  const tagOf = (p) => p.getTags().find((x) => x.startsWith("realm_party:"));
  if (t.phase === 1) {
    const ann = await t.player("Ann");
    const bob = await t.player("Bob");
    await t.console(`scriptevent realm:party_test {"fill":400}`);
    await t.wait(10);
    let since = t.tick;
    t.assert(t.cmd(ann, "/realm:party_invite Bob").ok, "invite ran");
    await t.waitMessage(bob, /Ann invited you to their party/, { since });
    since = t.tick;
    t.assert(t.cmd(bob, "/realm:party_accept").ok, "accept ran");
    await t.waitMessage(bob, /You joined the party/, { since });
    await t.waitUntil(() => tagOf(ann) && tagOf(ann) === tagOf(bob), { timeout: 100, message: "both carry the party tag" });
    const code = tagOf(ann).slice("realm_party:".length);
    t.world.setDynamicProperty("scenario:code", code);
    t.log(`Ann and Bob's party: ${code}`);
    t.restart("401 parties saved; restarting");
    return;
  }
  const ann = await t.player("Ann");
  await t.wait(20);
  const code = t.world.getDynamicProperty("scenario:code");
  const since = t.tick;
  await t.console(`scriptevent realm:party_test {"report":"${code}"}`);
  const m = await t.waitMessage(ann, /party_test:/, { since });
  t.log(m.plain);
  t.check(/^party_test: 401 parties/.test(m.plain), `all 401 parties are still there after the restart (${m.plain})`);
  t.check(new RegExp(`${code} has Ann, Bob`).test(m.plain), `Ann and Bob's party ${code} is still there (${m.plain})`);
}
