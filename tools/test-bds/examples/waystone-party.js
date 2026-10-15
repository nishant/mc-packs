// Waystones: party mates (the Parties pack's `realm_party:<code>` tag, set here directly) standing near a player who
// starts a trip come along, each paying their own fare; a player outside the party or a mate farther away stays; a
// mate who walks away during the countdown stays behind while the leader still goes; a mate who can't pay is told.
// Taps go through the pack's test hook (simulated players can't tap with an empty hand), as in waystone-trips.js.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only waystone_bp --scenario tools/test-bds/examples/waystone-party.js --timeout 400
export default async function (t) {
  const dim = t.dimension;
  const Y = -60; // flat world: grass at -61
  const ann = await t.player("Ann", { op: true, x: 0, z: 0 });
  const bob = await t.player("Bob", { x: 1, z: 2 });
  const cat = await t.player("Cat", { x: -1, z: -2 });
  const dan = await t.player("Dan", { x: 0, z: 30 });
  const eve = await t.player("Eve", { x: -2, z: 1 });
  for (const p of [ann, bob, dan, eve]) p.addTag("realm_party:TEST");
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `w_${key}`, pack: "waystone_bp", key, value }));
  const crowns = (who) => t.world.scoreboard.getObjective("crowns")?.getScore(who) ?? 0;
  const tap = (who, x, z) => t.console(`scriptevent realm:waystone_test ${JSON.stringify({ action: "tap", player: who.name, x, y: Y, z })}`);
  const raise = async (who, x, z, name) => {
    dim.getBlock({ x, y: Y, z }).setType("minecraft:lodestone");
    const sign = dim.getBlock({ x, y: Y, z: z + 1 });
    sign.setType("minecraft:standing_sign");
    sign.getComponent("minecraft:sign").setText(`Waystone: ${name}`);
    await t.wait(2);
    const since = t.tick;
    await tap(who, x, z);
    const m = await t.waitMessage(who, /raised the waystone/, { since, timeout: 60 });
    t.log(`${name}: ${m.plain}`);
  };
  const travel = async (who, from, dest) => {
    const form = t.waitForm(who, { timeout: 60 });
    await tap(who, from.x, from.z);
    const f = await form;
    t.assert(f.buttons.some((b) => b.includes(dest)), `${dest} is in the travel menu (${f.buttons.join(" | ")})`);
    f.answer(dest);
  };
  const near = (p, w) => Math.hypot(p.location.x - (w.x + 0.5), p.location.z - (w.z + 0.5)) < 4;

  const A = { x: 3, z: 0 };
  const B = { x: 80, z: 0 };
  await raise(ann, A.x, A.z, "Alpha");
  await t.loadArea(B.x, B.z, { radius: 2 });
  await raise(ann, B.x, B.z, "Beta");
  ann.teleport({ x: 0.5, y: Y, z: 0.5 });
  t.server("/scoreboard objectives add crowns dummy Crowns");
  for (const [p, n] of [[ann, 50], [bob, 50], [cat, 50], [dan, 50], [eve, 0]]) t.server(`/scoreboard players set ${p.name} crowns ${n}`);
  cfg("channelSeconds", 3);
  await t.wait(5);

  // ---- 1. Bob (a mate, close) comes along and pays; Cat (no party), Dan (30 blocks away) stay; Eve can't pay ----
  let since = t.tick;
  await travel(ann, A, "Beta");
  const told = await t.waitMessage(bob, /\[Party\] Ann is traveling to Beta/, { since, timeout: 40 });
  t.log(`Bob: ${told.plain}`);
  const lead = await t.waitMessage(ann, /Traveling to Beta in 3 seconds/, { since, timeout: 40 });
  t.log(`Ann: ${lead.plain}`);
  t.check(/Bob comes along/.test(lead.plain), "Ann is told Bob comes along");
  const poor = await t.waitMessage(eve, /can't come along/, { since, timeout: 40 });
  t.log(`Eve: ${poor.plain}`);
  await t.waitUntil(() => near(ann, B), { timeout: 160, message: "Ann arrived at Beta" });
  await t.waitUntil(() => near(bob, B), { timeout: 40, message: "Bob arrived at Beta with Ann" });
  t.check(crowns(bob) === 49, `Bob paid his own fare (${crowns(bob)})`);
  t.check(crowns(ann) === 49, `Ann paid only hers (${crowns(ann)})`);
  t.check(!near(cat, B) && !t.messages(cat, { since }).some((m) => /Ann is traveling/.test(m.plain)), "Cat, outside the party, stayed and wasn't asked");
  t.check(!near(dan, B) && !t.messages(dan, { since }).some((m) => /Ann is traveling/.test(m.plain)), "Dan, 30 blocks away, stayed and wasn't asked");
  t.check(!near(eve, B), "Eve, who can't pay, stayed");

  // ---- 2. Back to Alpha: Bob walks away during the countdown and stays; Ann still goes ----
  await t.wait(110); // the pack's landing checks (up to 100 ticks after the jump) are done
  const at = { ...ann.location };
  bob.teleport({ x: at.x + 1, y: at.y, z: at.z + 1 });
  await t.wait(5);
  since = t.tick;
  await travel(ann, B, "Alpha");
  await t.waitMessage(bob, /\[Party\] Ann is traveling to Alpha/, { since, timeout: 40 });
  bob.teleport({ x: at.x + 6, y: at.y, z: at.z + 6 });
  const stay = await t.waitMessage(bob, /you stay here|without you/, { since, timeout: 60 });
  t.log(`Bob walked off: ${stay.plain}`);
  await t.waitUntil(() => near(ann, A), { timeout: 160, message: "Ann arrived at Alpha alone" });
  await t.wait(10);
  t.check(!near(bob, A), "Bob stayed at Beta");
  t.check(crowns(bob) === 49, `Bob paid nothing for the trip he skipped (${crowns(bob)})`);
}
