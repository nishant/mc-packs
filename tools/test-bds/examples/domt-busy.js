// Deck of Many Things: a draw for a player whose last card is still running (The Comet, a few seconds
// in the air) says so, instead of doing nothing without a word. About 1 minute:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only domt_bp --scenario tools/test-bds/examples/domt-busy.js
export default async function (t) {
  t.server("/time set noon");
  const op = await t.player("Tester", { op: true });
  const buddy = await t.player("Buddy");
  t.server("/effect @a resistance 600 4 true");
  const f1 = t.waitForm(op);
  t.cmd(op, "/realm:domt");
  (await f1).answer("Draw for a player");
  (await t.waitForm(op)).answer({ Player: "Buddy", Card: "The Comet" });
  await t.waitUntil(() => buddy.location.y > 250, { timeout: 300, message: "Buddy is held in the air" });
  const since = t.tick;
  t.cmd(op, "/realm:domt_draw Buddy");
  await t.waitMessage(op, /Buddy is still drawing a card/, { since, timeout: 60 });
  // The first card still finishes. The Comet picks 4 random spots 150 to 300 blocks away and gives up
  // (crumbles to dust) when all of them are ocean, which the cached world around spawn often is, so
  // either ending counts: this scenario is about the busy message, not the landing.
  await t.waitMessage(buddy, /You drew The Comet|The Comet crumbles to dust/, { timeout: 1200 });
}
