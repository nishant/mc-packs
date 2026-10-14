// Story Questlines fish objectives count catches, not fish dropped from the inventory next to the hook: an item that
// appears at a player's head (where a drop comes out) isn't a catch; one that appears where the hook is, is.
// Bea's "Catch 8 fish with a rod" (hearth_and_table, chowder).
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-fish-drop.js --timeout 400
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const offers = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:npc_offer") offers.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const X = 300, Z = 300;
  t.server("/gamerule doMobSpawning false");
  await t.loadArea(X, Z, { radius: 2 });
  const p = await t.player("Fisher", { op: true, x: X, z: Z, gameMode: "survival" });
  await t.wait(20);
  sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, action: "jump", story: "hearth_and_table", chapter: "chowder" }));
  await t.wait(5);
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "bea", req: "f1" }));
  await t.wait(4);
  t.assert(offers.some((o) => o.m.req === "f1" && o.m.key === "start:hearth_and_table"), `Bea offers Hearth and Table (${JSON.stringify(offers.map((o) => o.m.key))})`);
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

  // A hook out in front of the player (cast with a rod).
  const inv = p.getComponent("minecraft:inventory").container;
  inv.setItem(0, new t.mc.ItemStack("minecraft:fishing_rod", 1));
  p.selectedSlotIndex = 0;
  p.teleport(p.location, { rotation: { x: 30, y: 0 } });
  await t.wait(5);
  p.useItemInSlot(0);
  const hook = await t.waitUntil(() => t.dimension.getEntities({ type: "minecraft:fishing_hook" })[0], { timeout: 60, message: "the hook is out" });
  await t.wait(10);
  t.log(`hook at ${JSON.stringify(hook.location)}, head at ${JSON.stringify(p.getHeadLocation())}`);

  // Dropped fish: they appear at the head. Standing by the hook (fishing off a dock, straight down), the head is
  // within reach of it.
  const h0 = hook.location;
  p.teleport({ x: h0.x + 1.2, y: p.location.y, z: h0.z }, { rotation: { x: 30, y: 90 } });
  await t.wait(10);
  t.check(hook.isValid, "the hook is still out");
  let since = t.tick;
  t.dimension.spawnItem(new t.mc.ItemStack("minecraft:cod", 8), p.getHeadLocation());
  await t.wait(20);
  const dropped = t.messages(p, { since }).map((m) => m.plain).filter((m) => /Catch 8 fish/.test(m));
  t.log("after the drop:", JSON.stringify(dropped));
  t.check(!dropped.some((m) => /done/.test(m)), "fish dropped at the head don't count");

  // A catch: an item where the hook is, as it is reeled in.
  since = t.tick;
  if (hook.isValid) {
    const at = hook.location;
    t.dimension.spawnItem(new t.mc.ItemStack("minecraft:cod", 8), at);
  }
  await t.waitMessage(p, /Catch 8 fish with a rod: done/, { since, timeout: 60 });
}
