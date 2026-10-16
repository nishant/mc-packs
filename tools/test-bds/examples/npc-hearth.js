// Townsfolk, Hearth & Hearsay: a gift by sneak-tap, affinity from Story Questlines' quest_done, the level-up
// event and the Close letter through Realm Mail, the heart story it unlocks in Story Questlines (g:aff_tobin),
// gossip heard in a greeting, the "Ask about..." topics, realm:mail_send, and
// the Realm day counter (a dawn counts once the night was seen; /time set back to morning never counts), kept
// across a restart.
//   node tools/test-bds/run.mjs --quiet --only npc_bp,saga_bp,mail_bp --scenario tools/test-bds/examples/npc-hearth.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:affinity", "realm:calendar", "realm:mail_send", "realm:npc_offer", "realm:npc_flags"].includes(id)) return;
      try {
        events.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  // Simulated players' taps fire no interact events: tap through the pack's debug event.
  const tap = (pl, npc, sneak = false) => sys.sendScriptEvent("realm:npc_debug", JSON.stringify({ player: pl.id, action: "tap", npc, sneak }));
  const cal = () => events.filter((e) => e.id === "realm:calendar").map((e) => e.m);

  if (t.phase === 2) {
    await t.player("Back", { op: true });
    await t.waitUntil(() => cal().length > 0, { timeout: 200, message: "a calendar broadcast after the restart" });
    const last = cal().at(-1);
    t.log("calendar after restart:", JSON.stringify(last));
    t.check(last.day === 2, `the Realm day survived the restart (day ${last.day})`);
    t.check(last.season === "thaw" && last.doy === 2 && last.year === 1, "day 2 is Thaw, day 2 of year 1");
    return;
  }

  const p = await t.player("Tester", { op: true });
  const sam = await t.player("Sam", { x: 175, z: 170 });
  await t.wait(40);
  // Gossip in every greeting, so the test can see it.
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "g1", pack: "npc_bp", key: "gossipChance", value: 100 }));

  // --- Calendar: the first broadcast is day 1; a /time set back to the morning never counts.
  await t.waitUntil(() => cal().length > 0, { timeout: 200, message: "a calendar broadcast on join" });
  t.check(cal().at(-1).day === 1, `day 1 at the start (${JSON.stringify(cal().at(-1))})`);
  t.server("/time set 3000");
  await t.wait(30);
  t.server("/time set 100");
  await t.wait(30);
  t.check(cal().at(-1).day === 1, "a rewind from day to morning is not a dawn");

  // --- Place Tobin and Mara beside the tester.
  t.assert(t.cmd(p, "/realm:npc_add tobin").ok, "npc_add tobin");
  const l = p.location;
  p.teleport({ x: l.x + 3, y: l.y, z: l.z });
  await t.wait(10);
  t.assert(t.cmd(p, "/realm:npc_add mara").ok, "npc_add mara");
  await t.wait(10);
  const npc = (id) => t.dimension.getEntities({ type: "minecraft:npc", tags: [`realm:npc_id:${id}`] })[0];
  t.assert(npc("tobin") && npc("mara"), "both NPCs exist");

  // --- A gift: sneak-tap Tobin holding a salmon (loved, +40).
  const inv = p.getComponent("minecraft:inventory").container;
  inv.setItem(0, new t.mc.ItemStack("minecraft:salmon", 3));
  p.selectedSlotIndex = 0;
  await t.wait(2);
  let since = t.tick;
  tap(p, "tobin", true);
  const giftMsg = await t.waitMessage(p, /Salmon: \+40/, { since, timeout: 60 });
  t.log("gift:", giftMsg.plain);
  t.check(inv.getItem(0)?.amount === 2, "one salmon was taken");
  await t.wait(12);
  // A second gift the same day is refused, nothing taken.
  since = t.tick;
  tap(p, "tobin", true);
  await t.waitMessage(p, /already gave me something today/, { since, timeout: 60 });
  t.check(inv.getItem(0)?.amount === 2, "the second gift took nothing");
  await t.wait(12);

  // --- Story chapters with Tobin (+20 each) up to Close (500): level-ups and the letter.
  for (let i = 0; i < 23; i++) {
    sys.sendScriptEvent("realm:quest_done", JSON.stringify({ player: p.id, pack: "saga_bp", id: `test:${i}`, kind: "story", npcs: ["tobin"] }));
    await t.wait(1);
  }
  await t.wait(10);
  const affs = events.filter((e) => e.id === "realm:affinity" && e.m.npc === "tobin").map((e) => e.m.level);
  t.log("tobin level events:", affs.join(","));
  t.check(affs.includes(1) && affs.includes(2) && affs.includes(3), "Acquaintance, Friend and Close sent as realm:affinity");
  const friend = events.find((e) => e.id === "realm:affinity" && e.m.npc === "tobin" && e.m.level === 2);
  t.check(friend?.m.off === 10, `a Friend gets 10 off (${friend?.m.off})`);
  t.check(events.some((e) => e.id === "realm:mail_send" && e.m.to === p.id && e.m.from === "Old Tobin"), "Tobin writes a letter at Close");
  await t.waitMessage(p, /New letter from Old Tobin/, { since: since, timeout: 60 });

  // --- Story Questlines saved g:aff_tobin = 3: the heart story is offered (after the prologue story it needs).
  sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, action: "finish", story: "drowned_bell" }));
  await t.wait(10);
  const req = "hearth1";
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "tobin", req, roles: ["fisher"] }));
  await t.wait(6);
  const offers = events.filter((e) => e.id === "realm:npc_offer" && e.m.req === req).map((e) => e.m.key);
  t.log("offers at tobin:", offers.join(", "));
  t.check(offers.includes("start:heart_tobin"), "Tobin offers his heart story");
  // Start it: the intro pages, then Accept.
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 100 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer("Accept");
    }
  })();
  since = t.tick;
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, npc: "tobin", key: "start:heart_tobin" }));
  await accept;
  await t.waitMessage(p, /Tar and Timber/, { since, timeout: 60 });
  // Within 5 seconds Story Questlines tells Townsfolk the player finished it (realm:npc_flags).
  await t.waitUntil(() => events.some((e) => e.id === "realm:npc_flags" && e.m.player === p.id && e.m.flags?.["fin:drowned_bell"] === "1"), {
    timeout: 140,
    message: "Story Questlines sends fin:drowned_bell to Townsfolk",
  });

  // --- Gossip about Sam, heard in Tobin's greeting; then Ask about...
  sys.sendScriptEvent("realm:gossip", JSON.stringify({ kind: "champion", player: sam.id, place: "Grimtooth" }));
  await t.wait(5);
  since = t.tick;
  inv.setItem(0, new t.mc.ItemStack("minecraft:stick", 1));
  const formP = t.waitForm(p, { timeout: 80 });
  tap(p, "tobin");
  const form = await formP;
  t.log("tobin's menu:", JSON.stringify(form.body), JSON.stringify(form.buttons));
  t.check(/Sam/.test(form.body) && /Grimtooth/.test(form.body), "the greeting is the gossip about Sam");
  t.check(/Close/.test(form.body), "the menu shows the level (Close)");
  t.check(form.buttons.some((b) => /^Give Stick/.test(b)), "a Give button for the held item");
  const topics = t.waitForm(p, { timeout: 80 });
  form.answer("Ask about");
  const tf = await topics;
  t.check(tf.buttons.some((b) => /The Gull/.test(b)), `Tobin's topics (${tf.buttons.join(", ")})`);
  const reply = t.waitForm(p, { timeout: 80 });
  tf.answer("The Gull");
  const rf = await reply;
  t.check(/Hal built her/.test(rf.body), "the topic text");
  rf.answer("Goodbye");
  await t.wait(12);

  // --- A Hollow-Crowned player (the dark ending) gets Mara's cold greeting, gossip or not.
  sys.sendScriptEvent("realm:npc_flags", JSON.stringify({ player: p.id, flags: { "g:ending": "crown" } }));
  await t.wait(2);
  const coldP = t.waitForm(p, { timeout: 80 });
  tap(p, "mara");
  const cold = await coldP;
  t.check(/Keep walking|off the map on purpose/.test(cold.body), `Mara is cold to the Crowned (${cold.body})`);
  cold.answer("Goodbye");
  sys.sendScriptEvent("realm:npc_flags", JSON.stringify({ player: p.id, flags: {} }));
  await t.wait(12);

  // --- realm:mail_send from any pack.
  since = t.tick;
  sys.sendScriptEvent("realm:mail_send", JSON.stringify({ to: "Sam", from: "The Realm", subject: "Hello", body: "A test letter." }));
  await t.waitMessage(sam, /New letter from The Realm: "Hello/, { since, timeout: 40 });

  // --- A dawn: night seen, then morning.
  t.server("/time set 14000");
  await t.wait(30);
  t.server("/time set 200");
  await t.waitUntil(() => cal().some((c) => c.day === 2), { timeout: 100, message: "day 2 at the dawn" });
  t.server("/time set 300");
  await t.wait(30);
  t.check(cal().at(-1).day === 2, "still day 2");
  await t.wait(20);
  t.restart("day 2, restarting");
}
