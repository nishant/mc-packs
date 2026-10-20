// Nicknames with AFK: Nicknames no longer compares every player's name tag every 10 ticks. AFK sends realm:nametag when
// it marks someone away or back, and Nicknames puts that player's tag right at once; anything else (here the scenario
// writing the tag itself) is put right by the 5-second sweep (a tenth of the players every 10 ticks).
//   node tools/test-bds/run.mjs --quiet --only nick_bp,afk_bp --scenario tools/test-bds/examples/nick-afk-nametag.js --timeout 300
export default async function (t) {
  const sam = await t.player("Sam");
  await t.wait(20);
  const next = t.waitForm(sam, { timeout: 100, title: "Nickname" });
  t.assert(t.cmd(sam, "/realm:nick").ok, "/realm:nick ran");
  const f = await next;
  const again = t.waitForm(sam, { timeout: 30 }).catch(() => undefined);
  f.answer({ Nickname: "Sammy" });
  (await again)?.answer(null);
  await t.waitUntil(() => sam.nameTag.includes("Sammy"), { timeout: 40, message: "the nickname shows" });

  // 1. Another write to the tag, then /realm:afk: AFK prefixes what it finds and says so; Nicknames puts its own back.
  sam.nameTag = "Somebody";
  t.assert(t.cmd(sam, "/realm:afk").ok, "/realm:afk ran");
  await t.waitUntil(() => sam.hasTag("afk"), { timeout: 20, message: "Sam is AFK" });
  const awayAt = t.tick;
  await t.waitUntil(() => sam.nameTag.startsWith("§7[AFK]§r ") && sam.nameTag.includes("Sammy"), { timeout: 5, message: `AFK tag with the nickname within a few ticks (${sam.nameTag})` });
  t.log(`[AFK] Sammy ${t.tick - awayAt} ticks after the AFK tag`);

  // 2. Nobody says anything: the 5-second sweep puts it right.
  const before = t.tick;
  sam.nameTag = "Somebody else";
  await t.waitUntil(() => sam.nameTag.includes("Sammy"), { timeout: 110, message: `the sweep puts the nickname back (${sam.nameTag})` });
  t.log(`put back by the sweep after ${t.tick - before} ticks`);
  t.check(t.tick - before <= 101, "within 5 seconds");
}
