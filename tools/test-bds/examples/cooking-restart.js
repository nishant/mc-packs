// Kitchen: a restart in the middle of cooking. The ingredients are taken when the pot starts, so the dish
// must be owed (saved) from that moment, not only kept by the running timer. Also: a normal cook hands
// over exactly one dish and leaves nothing owed. About 50 s (two phases; up to two more when a pot finishes before the
// server stops, which interrupts nothing):
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only cooking_bp --scenario tools/test-bds/examples/cooking-restart.js
const HANDED = "cooking_restart:handed_before_stop";
const TRIES = 3;

export default async function (t) {
  const mc = t.mc;
  let owed;
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cooking_owed") owed = JSON.parse(message);
  });
  const askOwed = async () => {
    owed = undefined;
    await t.console(`scriptevent realm:cooking_owed_ping {}`);
    return t.waitUntil(() => owed, { timeout: 60, message: "cooking answered the owed ping" });
  };
  const p = await t.player("Cook");
  // Kitchen hands a joining player what they are owed 100 ticks after the join (and every online player theirs 100
  // ticks after the world loads). A pot started before then is owed from its start, so that hand-over gave the dish
  // away while the pot still bubbled: the first cook's dish came 2 s early and blocked the next cook ("Your pot is
  // already bubbling"), or the mid-cook dish was handed over before the restart and nothing was owed after it (F75,
  // "the interrupted dish is owed to its cook ({"players":0,"batches":0})": "You cooked" exactly 100 ticks after the
  // spawn). Cook only after both.
  await t.wait(110);
  const inv = p.getComponent("minecraft:inventory").container;
  const count = (test) => {
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && test(it)) n += it.amount;
    }
    return n;
  };
  const chowder = () => count((it) => (it.nameTag ?? "").replace(/§./g, "").includes("Harbor Chowder"));
  const bowls = () => count((it) => it.typeId === "minecraft:bowl" && !it.nameTag);
  const stock = () => {
    for (const id of ["minecraft:bowl", "minecraft:cooked_cod", "minecraft:baked_potato", "minecraft:kelp"]) inv.addItem(new mc.ItemStack(id, 1));
  };
  const cook = () => t.console(`scriptevent realm:cooking_cook ${JSON.stringify({ player: p.id, recipe: "harbor_chowder", times: 1 })}`);
  // Cook, and restart before the 3 s are up. Saved with the world: whether the dish was handed over before the server
  // stopped after all, in which case the next phase knows this restart interrupted nothing.
  const cookAndRestart = async () => {
    t.world.setDynamicProperty(HANDED, undefined);
    stock();
    await cook();
    await t.waitUntil(() => bowls() === 0, { timeout: 60, message: "ingredients taken again" });
    const had = chowder();
    t.system.runInterval(() => {
      try {
        if (chowder() > had) t.world.setDynamicProperty(HANDED, true);
      } catch {
        // stopping
      }
    }, 1);
    t.restart("restart mid-cook");
  };

  if (t.phase === 1) {
    // A normal cook: one dish, nothing left owed.
    stock();
    await cook();
    await t.waitUntil(() => bowls() === 0, { timeout: 60, message: "ingredients taken" });
    await t.waitUntil(() => chowder() === 1, { timeout: 200, message: "one Harbor Chowder handed over" });
    await t.wait(40);
    t.assert(chowder() === 1, `exactly one dish (${chowder()})`);
    const after = await askOwed();
    t.assert(after.batches === 0, `nothing owed after a normal cook (${JSON.stringify(after)})`);
    return cookAndRestart();
  }
  // Simulated players get a new id after a restart, so look at the saved debt itself.
  const left = await askOwed();
  t.log(`owed after the restart: ${JSON.stringify(left)}`);
  if (t.world.getDynamicProperty(HANDED)) {
    // The dish was handed over before the server stopped, so that restart interrupted nothing (the pot finished in
    // the harness's 0.5 s stop delay, on a server catching up on missed ticks). It must not be owed as well. Then try
    // again, a few times, since the restart itself is what this scenario is about.
    t.log(`try ${t.phase - 1}: the dish was handed over before the server stopped; restarting mid-cook again`);
    t.assert(left.batches === 0, `a dish handed over before the restart is not owed as well (${JSON.stringify(left)})`);
    if (t.phase > TRIES) t.fail(`the server finished the cook before it stopped in all ${TRIES} tries`);
    return cookAndRestart();
  }
  t.assert(left.batches === 1 && left.players === 1, `the interrupted dish is owed to its cook (${JSON.stringify(left)})`);
}
