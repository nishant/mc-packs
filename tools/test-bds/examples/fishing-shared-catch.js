// One catch counts once in every pack that counts catches (Skills XP, the Journal's fish page, a Daily Quests fish quest
// and a Story Questlines fish objective), with Fishing Rewards installed (it sends one realm:fish_caught per catch and
// the others stop following hooks themselves) and without it (each pack follows the hooks itself). A catch here is an
// item that appears where the player's bobber is as the bobber goes, the way a reeled-in catch looks to the packs; an
// item dropped at the player's head next to the bobber counts nowhere.
//   node tools/test-bds/run.mjs --quiet --flat --only fishing_bp,saga_bp,skills_bp,journal_bp,quests_bp --scenario tools/test-bds/examples/fishing-shared-catch.js --timeout 900
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,skills_bp,journal_bp,quests_bp --scenario tools/test-bds/examples/fishing-shared-catch.js --timeout 900
export default async function (t) {
  const sys = t.system;
  const { ItemStack } = t.mc;
  const has = (pack) => t.packs.includes(pack);
  const shared = has("fishing_bp");
  const events = { caught: 0, pongs: 0, offers: /** @type {any[]} */ ([]) };
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id === "realm:fish_caught") events.caught++;
      else if (id === "realm:fish_pong") events.pongs++;
      else if (id === "realm:npc_offer") {
        try {
          events.offers.push(JSON.parse(message));
        } catch {}
      }
    },
    { namespaces: ["realm"] },
  );
  t.server("/gamerule doMobSpawning false");
  t.server("/time set day");
  t.server("/weather clear");

  // A 15 x 15 pool with a stone rim, built on the ground.
  const X = 300, Z = 300;
  const { top } = await t.loadArea(X, Z, { radius: 2, whole: true, timeout: 1200 });
  const Y = top.location.y + 1;
  t.server(`/fill ${X - 10} ${Y} ${Z - 10} ${X + 10} ${Y + 10} ${Z + 10} air`);
  t.server(`/fill ${X - 8} ${Y} ${Z - 8} ${X + 8} ${Y + 2} ${Z + 8} stone`);
  t.server(`/fill ${X - 7} ${Y + 1} ${Z - 7} ${X + 7} ${Y + 2} ${Z + 7} water`);
  await t.wait(5);
  const spot = { x: X + 0.5, y: Y + 3, z: Z - 8 + 0.5 };
  const p = await t.player("Angler", { ...spot, op: true, gameMode: "survival", area: false });
  await t.wait(20);
  // The catch counters asked at world load, before this scenario listened: ask again.
  sys.sendScriptEvent("realm:fish_ping", "test");
  await t.wait(5);
  t.check(shared ? events.pongs === 1 : events.pongs === 0, `${shared ? "Fishing Rewards" : "nobody"} answers realm:fish_ping (${events.pongs} pongs)`);

  // Story Questlines: Bea's "Catch 8 fish with a rod" (any item counts).
  if (has("saga_bp")) {
    sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, action: "jump", story: "hearth_and_table", chapter: "chowder" }));
    await t.wait(5);
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "bea", req: "f1" }));
    await t.wait(4);
    t.assert(events.offers.some((o) => o.req === "f1" && o.key === "start:hearth_and_table"), "Bea offers Hearth and Table");
    const accept = (async () => {
      for (;;) {
        const f = await t.waitForm(p, { timeout: 200 });
        if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
        else return f.answer(f.buttons.find((b) => /Accept/.test(b)) ?? 0);
      }
    })();
    sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:hearth_and_table" }));
    await accept;
    await t.wait(10);
  }
  // Daily Quests: "Catch 5 fish" (cod, salmon, tropical fish, pufferfish).
  if (has("quests_bp")) await t.console(`scriptevent realm:quests_test ${JSON.stringify({ player: p.name, ids: ["fish"] })}`);
  await t.wait(10);

  const inv = p.getComponent("minecraft:inventory").container;
  inv.setItem(0, new ItemStack("minecraft:fishing_rod", 1));
  p.selectedSlotIndex = 0;
  const xp = () => {
    try {
      return t.world.scoreboard.getObjective("skill_fishing")?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  const hookOf = () => t.dimension.getEntities({ type: "minecraft:fishing_hook", location: p.location, maxDistance: 24 })[0];
  let hook;
  const cast = async () => {
    p.teleport(spot, { rotation: { x: 35, y: 0 } });
    await t.wait(2);
    p.useItemInSlot(0);
    hook = await t.waitUntil(() => hookOf(), { timeout: 60, message: "the bobber is out" });
    await t.wait(50); // in the water, and older than the packs' 30-tick minimum
  };
  /** A catch: `amount` of `item` where the bobber is, and the bobber goes in the same tick. */
  const land = async (item, amount = 1) => {
    await cast();
    t.dimension.spawnItem(new ItemStack(item, amount), hook.location);
    hook.remove();
    await t.wait(15);
  };
  let since = t.tick;
  const said = (re) => t.messages(p, { since }).some((m) => re.test(m.plain));

  // A fish dropped at the head, next to the bobber as it goes, isn't a catch.
  await cast();
  const h0 = hook.location;
  p.teleport({ x: h0.x + 1.2, y: Y + 3, z: h0.z });
  await t.wait(5);
  const xp0 = xp();
  const caught0 = events.caught;
  t.dimension.spawnItem(new ItemStack("minecraft:cod", 1), p.getHeadLocation());
  if (hook.isValid) hook.remove();
  await t.wait(15);
  t.check(xp() === xp0, `a fish dropped at the head gives no fishing XP (${xp0} -> ${xp()})`);
  t.check(events.caught === caught0, "a fish dropped at the head is not sent as a catch");

  // Junk: Skills gives its junk XP (5) once.
  since = t.tick;
  const xp1 = xp();
  await land("minecraft:bowl");
  if (has("skills_bp")) t.check(xp() - xp1 === 5, `one junk catch gives 5 fishing XP once (${xp1} -> ${xp()})`);

  // Four single cod: the quest (5) is not done yet; the Journal has its Cod entry.
  for (let i = 0; i < 4; i++) await land("minecraft:cod");
  if (has("quests_bp")) t.check(!said(/Quest complete: Catch 5 fish/), "four cod don't finish Catch 5 fish (each catch counts once)");
  if (has("journal_bp")) t.check(said(/Journal: New entry in .*Cod/), "the Journal records the cod");
  if (has("saga_bp")) t.check(!said(/Catch 8 fish with a rod: done/), "five catches don't finish Catch 8 fish");
  await land("minecraft:cod");
  if (has("quests_bp")) await t.waitMessage(p, /Quest complete: Catch 5 fish/, { since, timeout: 40 });
  if (has("saga_bp")) {
    t.check(!said(/Catch 8 fish with a rod: done/), "six catches don't finish Catch 8 fish");
    await land("minecraft:cod", 2); // a stack of two counts two
    await t.waitMessage(p, /Catch 8 fish with a rod: done/, { since, timeout: 40 });
  }
  const catches = has("saga_bp") ? 7 : 6;
  if (shared) t.check(events.caught === catches, `Fishing Rewards sent each of the ${catches} catches once (${events.caught})`);
  else t.check(events.caught === 0, "without Fishing Rewards nobody sends realm:fish_caught");
  t.log(`fishing XP ${xp()}, realm:fish_caught ${events.caught}, pongs ${events.pongs}`);
}
