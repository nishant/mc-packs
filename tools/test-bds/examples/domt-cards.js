// Deck of Many Things: runs every card (wild ones too) through the pack's test path and fails if one
// doesn't do its main thing. A second player is there for The Swap. About 5 minutes:
//   node tools/test-bds/run.mjs --quiet --timeout 900 --only domt_bp --scenario tools/test-bds/examples/domt-cards.js
// A card that fails in the long run is tried once more on its own, by a fresh player each: a simulated player that has
// been through 147 cards can come out of The Kick's knockback short or turn back from Topsy Turvy's spin within
// 5 ticks (its own movement, not the card's), and The Comet can fizzle when every place it tries is ocean. Only a
// card that fails twice fails the run. To test one card or a few:
// edit ONLY below (a card id, or ids separated by commas).
const ONLY = "all";

export default async function (t) {
  await t.player("Tester", { op: true });
  await t.player("Buddy", { x: 40, z: 40 });
  const results = [];
  let last = t.tick;
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:domt_tested") return;
    results.push(JSON.parse(message));
    last = t.tick;
  });
  await t.console(`scriptevent realm:domt_test {"effect":"${ONLY}","player":"Tester"}`);
  // Done when no card has reported for 20 seconds (a card takes at most about 12).
  await t.waitUntil(() => results.length > 0 && t.tick - last > 400, { timeout: 20 * 60 * 14, interval: 20, message: "the deck finished testing" });
  let bad = results.filter((r) => !r.ok);
  t.log(`tested ${results.length}, failed ${bad.length}: ${bad.map((r) => `${r.id} (${r.why})`).join("; ")}`);
  if (bad.length) {
    const retry = bad.map((r) => r.id);
    results.length = 0;
    for (const [i, id] of retry.entries()) {
      const fresh = `Retry${i}`;
      await t.player(fresh, { op: true });
      await t.console(`scriptevent realm:domt_test {"effect":"${id}","player":"${fresh}"}`);
      await t.waitUntil(() => results.length > i, { timeout: 20 * 20 + 400, interval: 20, message: `the retried ${id}` });
    }
    bad = results.filter((r) => !r.ok);
    t.log(`retried ${retry.length} one by one, failed ${bad.length}: ${bad.map((r) => `${r.id} (${r.why})`).join("; ")}`);
  }
  t.check(!bad.length, "every card passed");
}
