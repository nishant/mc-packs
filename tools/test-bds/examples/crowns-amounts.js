// Crowns: amounts at the edges. Gives and payments that would push a balance past the scoreboard's
// limit (2,147,483,647) are capped or refused with a message instead of throwing and losing the
// operator's or payer's request; amounts typed with commas work; self, zero and @a payments refuse.
// node tools/test-bds/run.mjs --quiet --only crowns_bp --scenario tools/test-bds/examples/crowns-amounts.js --timeout 600
const MAX = 2147483647;

export default async function (t) {
  const alice = await t.player("Alice", { op: true });
  const bob = await t.player("Bob");
  const cara = await t.player("Cara");
  const obj = () => t.world.scoreboard.getObjective("crowns");
  /** @param {any} p */
  const score = (p) => {
    try {
      return obj()?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  // The daily bonus lands about 10 seconds after joining.
  await t.waitMessage(cara, /Daily login bonus/, { timeout: 400 });

  // A give that would overflow gives what fits and says so.
  t.cmd(alice, "/realm:crowns_give Alice 2147483000");
  await t.waitUntil(() => score(alice) > 2147483000, { message: "first give" });
  let since = t.tick;
  t.cmd(alice, "/realm:crowns_give Alice 1000");
  await t.waitMessage(alice, /the most a balance can hold/, { since, kind: "chat" });
  t.check(score(alice) === MAX, `Alice is at the limit (${score(alice)})`);

  // The operator form with a huge typed amount (beyond what a score can take at all).
  let f = t.waitForm(alice);
  t.cmd(alice, "/realm:crowns");
  (await f).answer("Give Crowns");
  f = t.waitForm(alice);
  since = t.tick;
  (await f).answer({ Player: "Bob", Amount: "99999999999" });
  await t.waitMessage(alice, /Crowns: Bob \+/, { since });
  t.check(score(bob) === MAX, `Bob is at the limit (${score(bob)})`);

  // Paying a player who can't hold more is refused before anything is taken.
  since = t.tick;
  t.cmd(alice, "/realm:crowns_pay Bob 5");
  await t.waitMessage(alice, /can't hold that many more/, { since });
  t.check(score(alice) === MAX, `Alice kept her Crowns (${score(alice)})`);

  // An amount typed with a thousands separator.
  const caraBefore = score(cara);
  f = t.waitForm(alice);
  t.cmd(alice, "/realm:crowns");
  (await f).answer("Pay a player");
  f = t.waitForm(alice);
  since = t.tick;
  (await f).answer({ Player: "Cara", Amount: "1,000" });
  await t.waitMessage(alice, /You paid 1,000 Crowns to Cara/, { since });
  t.check(score(cara) === caraBefore + 1000, `Cara got 1,000 (${score(cara)})`);
  t.check(score(alice) === MAX - 1000, `Alice paid 1,000 (${score(alice)})`);

  // Refusals that take nothing.
  since = t.tick;
  t.cmd(alice, "/realm:crowns_pay Alice 5");
  await t.waitMessage(alice, /can't pay yourself/, { since });
  since = t.tick;
  t.cmd(alice, "/realm:crowns_pay Cara 0");
  await t.waitMessage(alice, /at least 1 Crown/, { since });
  since = t.tick;
  t.cmd(alice, "/realm:crowns_pay @a 5");
  await t.waitMessage(alice, /exactly one player/, { since });
  since = t.tick;
  t.cmd(cara, "/realm:crowns_pay Alice 5000");
  await t.waitMessage(cara, /You have only/, { since });
  t.check(score(alice) === MAX - 1000 && score(cara) === caraBefore + 1000, "refusals moved nothing");
}
