// Deck of Many Things: runs every card (wild ones too) through the pack's test path and fails if one
// doesn't do its main thing. A second player is there for The Swap. About 5 minutes:
//   node tools/test-bds/run.mjs --quiet --timeout 900 --only domt_bp --scenario tools/test-bds/examples/domt-cards.js
// The Comet can fizzle now and then when every place it tries is ocean; rerun that card alone:
// edit ONLY below to "the_comet".
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
  const bad = results.filter((r) => !r.ok);
  t.log(`tested ${results.length}, failed ${bad.length}: ${bad.map((r) => `${r.id} (${r.why})`).join("; ")}`);
  t.check(!bad.length, "every card passed");
}
