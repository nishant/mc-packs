// Parties: a world saved by an older Parties (every party in one `party:data` property) keeps its parties after the
// update moves each one to its own property. (Simulated players get a new id each time they spawn, so the party is
// two offline players and the pack's console test hook reports what it has.)
// node tools/test-bds/run.mjs --quiet --only party_bp --scenario tools/test-bds/examples/party-legacy.js --timeout 600
export default async function (t) {
  const ann = await t.player("Ann");
  if (t.phase === 1) {
    await t.console(`scriptevent realm:party_test {"legacy":"OLDP"}`);
    await t.wait(10);
    t.restart("old-style party saved; restarting");
    return;
  }
  await t.wait(20);
  const since = t.tick;
  await t.console(`scriptevent realm:party_test {"report":"OLDP"}`);
  const m = await t.waitMessage(ann, /party_test:/, { since });
  t.log(m.plain);
  t.check(/1 parties; OLDP has OldLeader, OldFriend/.test(m.plain), `the old party is kept with both members (${m.plain})`);
  if (t.phase === 2) t.restart("moved to its own property; restarting once more");
}
