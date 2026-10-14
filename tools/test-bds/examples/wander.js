// Wanderers of the Wilds (wander_bp) with Story Questlines: nobody appears near a town and someone does out in
// the wilds; a Stranger's one-off offered, accepted, finished and paid; a Recurring Wanderer's chain sets up a
// camp (realm:place_ready) whose wanderer appears when someone on the chain is near, goes when they leave and
// comes back; a second player moving the camp sends the first a letter; a hostile toll man's fight spawns,
// is won and pays; caps (one per player, the road's limit); after a restart a stray entity is swept, the
// camp's wanderer comes back for a player on the chain, and a leftover stranger leaves.
//   node tools/test-bds/run.mjs --quiet --only wander_bp,saga_bp,mail_bp --scenario tools/test-bds/examples/wander.js --timeout 900
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!id.startsWith("realm:wander_") && !["realm:place_ready", "realm:mail_send", "realm:quest_done", "realm:champion_spawn"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const wdebug = (m) => sys.sendScriptEvent("realm:wander_debug", JSON.stringify(m));
  const sdebug = (m) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify(m));
  const ents = (tag) => {
    try {
      return t.dimension.getEntities({ tags: [tag] });
    } catch {
      return [];
    }
  };
  /** Pages with Next until a form with `final`; answers it. Returns that form. */
  const walk = async (p, final) => {
    for (let i = 0; i < 12; i++) {
      const f = await t.waitForm(p, { timeout: 200 });
      const b = f.buttons.find((x) => x.replace(/§./g, "").toLowerCase().includes(final.toLowerCase()));
      if (b !== undefined) {
        f.answer(b);
        return f;
      }
      f.answer("Next");
    }
    t.fail(`no "${final}" button`);
  };
  /** Taps a wanderer and picks the button containing `label` (or null: just look). Returns the form. */
  const talk = async (p, wid, label) => {
    const form = t.waitForm(p, { timeout: 200 });
    wdebug({ player: p.id, action: "tap", wid });
    const f = await form;
    if (label === null) f.answer(null);
    else f.answer(label);
    return f;
  };

  const X = 900, Z = 900; // far from the default spawn (163, 170)

  if (t.phase === 2) {
    const p = await t.player("Back", { op: true, x: X, z: Z });
    await t.loadArea(X, Z, { radius: 3 });
    await t.wait(60);
    t.check(ents("wander:k:stray").length === 0, "the stray wanderer entity was swept at load");
    // The leftover stranger's player is gone (a rejoin is a new player): they leave within a minute or so.
    await t.waitUntil(() => of("realm:wander_gone", (m) => m.why === "far" || m.why === "gone").length > 0, { timeout: 2400, message: "the leftover stranger leaves after the restart" });
    // A player on Hob's chain near the camp: his wanderer appears there again.
    sdebug({ player: p.id, action: "jump", story: "w_hob_tales", chapter: "mule" });
    await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id && m.ch.hob === "o").length > 0, { timeout: 400, message: "Back is on Hob's chain (o)" });
    sys.sendScriptEvent("realm:place_ping", "{}");
    await t.waitUntil(() => of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").length > 0, { timeout: 200, message: "Hob's camp still built after the restart" });
    const camp = of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").at(-1);
    p.teleport({ x: camp.x + 3, y: camp.y + 1, z: camp.z });
    await t.waitUntil(() => ents("wander:c:hob").length === 1, { timeout: 400, message: "Hob is at his camp after the restart" });
    t.pass("phase 2");
    return;
  }

  await t.loadArea(X, Z, { radius: 3 });
  const p = await t.player("Tester", { op: true, x: X, z: Z });
  await t.wait(20);
  p.teleport({ x: X + 0.5, y: p.location.y, z: Z + 0.5 }, { rotation: { x: 0, y: 0 } }); // facing south
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id).length > 0, { timeout: 300, message: "saga sends realm:wander_state" });
  const st0 = of("realm:wander_state", (m) => m.player === p.id).at(-1);
  t.log("state:", JSON.stringify(st0));
  t.check(st0.ch.hob === "n" && st0.ch.rook === "n" && !st0.ch.pell && st0.h.length === 0, "new player: chains without requirements can start, Pell can't, no hostiles");

  // --- Near a town: nobody comes. Out in the wilds: someone does.
  sys.sendScriptEvent("realm:zones", JSON.stringify({ src: "test", part: 1, parts: 1, zones: [{ id: "t", name: "Town", dim: "minecraft:overworld", x: X + 60, z: Z, r: 40 }] }));
  await t.wait(5);
  let since = t.tick;
  wdebug({ player: p.id, action: "roll" });
  await t.wait(40);
  t.check(of("realm:wander_spawn", () => true, since).length === 0, "nobody appears within 160 blocks of a town");
  sys.sendScriptEvent("realm:zones", JSON.stringify({ src: "test", part: 1, parts: 1, zones: [] }));
  await t.wait(5);
  since = t.tick;
  wdebug({ player: p.id, action: "roll" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === p.id, since).length > 0, { timeout: 100, message: "someone appears out in the wilds" });
  const first = of("realm:wander_spawn", (m) => m.player === p.id, since)[0];
  t.log("met:", first.name, first.archetype, first.wid);
  t.check(Math.hypot(first.x - p.location.x, first.z - p.location.z) >= 20, "they stand ahead, not on top of the player");
  // One at a time per player.
  since = t.tick;
  wdebug({ player: p.id, action: "spawn", archetype: "traveler", stranger: true });
  await t.wait(20);
  t.check(of("realm:wander_spawn", () => true, since).length === 0, "a second wanderer for the same player is refused");
  t.cmd(p, "/realm:wander_clear");
  await t.waitUntil(() => ents(`wander:k:${first.wid}`).length === 0, { timeout: 60, message: "wander_clear sends them away" });
  // Cooldown after walking away: a roll now does nothing (the debug spawn below skips it).
  since = t.tick;
  wdebug({ player: p.id, action: "roll" });
  await t.wait(30);
  t.check(of("realm:wander_spawn", () => true, since).length === 0, "a cooldown follows a meeting");

  // --- A Stranger's one-off: offered, accepted, done, paid.
  since = t.tick;
  wdebug({ player: p.id, action: "spawn", archetype: "traveler", stranger: true });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === p.id, since).length > 0, { timeout: 60, message: "a stranger appears" });
  const s1 = of("realm:wander_spawn", (m) => m.player === p.id, since)[0];
  await t.wait(10);
  let f = await talk(p, s1.wid, "Request:");
  t.log("stranger form:", f.title, JSON.stringify(f.buttons));
  t.check(f.buttons.some((b) => b.includes("Request:") && !b.includes("{")), "the stranger offers a request, params filled in");
  await walk(p, "Accept");
  await t.waitUntil(() => of("realm:wander_done", (m) => m.wid === s1.wid && m.how === "accepted").length > 0, { timeout: 100, message: "the one-off is accepted" });
  await t.wait(10);
  sdebug({ player: p.id, action: "wander_finish" });
  await t.waitMessage(p, /Job done: go back/, { timeout: 100 });
  await t.wait(10);
  await talk(p, s1.wid, "report back");
  since = t.tick;
  await walk(p, "Thanks");
  await t.waitMessage(p, /Job done:/, { since, timeout: 100 });
  await t.waitUntil(() => of("realm:quest_done", (m) => m.kind === "wander" && m.player === p.id).length > 0, { timeout: 60, message: "quest_done kind wander" });
  t.check(typeof of("realm:quest_done", (m) => m.kind === "wander").at(-1).guild === "string", "with a guild");
  await t.waitUntil(() => ents(`wander:k:${s1.wid}`).length === 0, { timeout: 60, message: "the stranger leaves once paid" });

  // --- A Recurring Wanderer: Hob's chain sets up a camp, and he waits there.
  since = t.tick;
  wdebug({ player: p.id, action: "spawn", named: "hob" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.wid === "hob", since).length > 0, { timeout: 60, message: "Hob appears" });
  await t.wait(10);
  f = await talk(p, "hob", "Hob's Tall Tales");
  await walk(p, "Accept");
  await t.waitUntil(() => of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").length > 0, { timeout: 600, message: "Hob's camp is built (place_ready)" });
  const camp = of("realm:place_ready", (m) => m.wid === "hob" && m.state === "built").at(-1);
  t.log("camp:", JSON.stringify(camp));
  await t.waitUntil(() => ents("wander:c:hob").length === 1, { timeout: 200, message: "Hob stands at his camp" });
  t.check(ents("wander:k:hob").length === 0, "the Hob on the road is gone (one Hob)");
  // Deliver at the camp: iron and clay, then report.
  const inv = p.getComponent("minecraft:inventory").container;
  inv.addItem(new t.mc.ItemStack("minecraft:iron_ingot", 4));
  inv.addItem(new t.mc.ItemStack("minecraft:clay_ball", 6));
  await t.wait(5);
  f = await talk(p, "hob", "report back");
  await walk(p, "Finish the chapter");
  await walk(p, "Not now"); // the next chapter's intro (same NPC)
  t.check(t.messages(p).some((m) => /Chapter complete: Pots and Pans/.test(m.plain)), "Hob's first chapter is done");
  // Away: the camp's wanderer goes after a while; back: he returns.
  p.teleport({ x: camp.x + 200, y: 120, z: camp.z });
  p.addEffect("slow_falling", 2000, { showParticles: false });
  await t.waitUntil(() => ents("wander:c:hob").length === 0, { timeout: 1200, message: "Hob leaves his camp with nobody near" });
  p.teleport({ x: camp.x + 3, y: camp.y + 1, z: camp.z });
  await t.waitUntil(() => ents("wander:c:hob").length === 1, { timeout: 400, message: "Hob is back when a player on his chain comes near" });

  // --- A second player starts Hob's chain far away: the camp moves, the first gets a letter.
  const sam = await t.player("Sam", { x: X + 120, z: Z + 120 });
  await t.wait(40);
  since = t.tick;
  wdebug({ player: sam.id, action: "spawn", named: "hob" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.wid === "hob" && m.player === sam.id, since).length > 0, { timeout: 60, message: "Hob appears for Sam" });
  await t.wait(10);
  await talk(sam, "hob", "Hob's Tall Tales");
  await walk(sam, "Accept");
  await t.waitUntil(() => of("realm:mail_send", (m) => m.to === p.id && /moved camp/.test(m.subject)).length > 0, { timeout: 200, message: "a letter tells Tester that Hob moved camp" });
  t.log("letter:", JSON.stringify(of("realm:mail_send", (m) => m.to === p.id).at(-1)));

  // --- A hostile: the toll man. Hostiles come once both prologue stories are done.
  sdebug({ player: p.id, action: "finish", story: "drowned_bell" });
  sdebug({ player: p.id, action: "finish", story: "last_map" });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id && m.h.includes("toll")).length > 0, { timeout: 200, message: "hostiles allowed after the prologue" });
  await t.loadArea(X, Z - 150, { radius: 3 });
  p.teleport({ x: X + 0.5, y: (await t.loadArea(X, Z - 150, { radius: 3 })).top.y + 1, z: Z - 150 + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(40);
  since = t.tick;
  wdebug({ player: p.id, action: "spawn", archetype: "traveler", hostile: "toll" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === p.id && m.hostile === "toll", since).length > 0, { timeout: 60, message: "a toll man appears" });
  const h = of("realm:wander_spawn", (m) => m.player === p.id && m.hostile === "toll", since)[0];
  p.teleport({ x: h.x + 2, y: h.y, z: h.z });
  await t.wait(10);
  // The road's cap: one on the road at most, for this test.
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "wander_bp", key: "maxOnRoad", value: 1 }));
  await t.wait(5);
  since = t.tick;
  wdebug({ player: sam.id, action: "spawn", archetype: "traveler", stranger: true });
  await t.wait(20);
  t.check(of("realm:wander_spawn", (m) => m.player === sam.id, since).length === 0, "the road's cap holds (maxOnRoad 1)");
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c2", pack: "wander_bp", key: "maxOnRoad", value: 5 }));
  f = await talk(p, h.wid, "Toll Road");
  await walk(p, "Refuse");
  await t.waitUntil(() => of("realm:wander_done", (m) => m.wid === h.wid && m.how === "turn").length > 0, { timeout: 100, message: "the toll man turns" });
  const tag = `realm:saga:wh_${h.wid}`;
  await t.waitUntil(() => ents(tag).length > 0, { timeout: 300, message: "the Toll Man champion spawns" });
  t.check(ents("saga:add").length >= 2, "his two friends come with him");
  for (const e of ents(tag)) e.kill();
  await t.waitMessage(p, /Ambush beaten/, { timeout: 200 });
  t.check(of("realm:quest_done", (m) => m.kind === "wander" && m.guild === "wardens").length > 0, "the fight pays (Wardens)");

  // --- Leave a stranger on the road for Sam and a stray entity, then restart.
  since = t.tick;
  wdebug({ player: sam.id, action: "spawn", archetype: "traveler", stranger: true });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === sam.id, since).length > 0, { timeout: 60, message: "a stranger for Sam" });
  const stray = t.dimension.spawnEntity("minecraft:npc", { x: X + 0.5, y: p.location.y, z: Z + 4.5 });
  stray.addTag("realm:npc_owner:wander_bp");
  stray.addTag("wander:k:stray");
  await t.wait(40);
  t.restart("restart: sweep, camps, leftovers");
}
