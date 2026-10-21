// Kitchen: a cook started in a player's first 100 ticks online. The join handover runs 100 ticks after the spawn and
// hands over what the player is owed; a batch in the pot is owed from its start, so before cooking_bp 1.1.15 that
// handover gave it away while the pot still bubbled (the dish came early, and the pot was still "bubbling"). The dish
// must come only after cookSeconds (3 s), exactly once, with nothing left owed. About 20 s:
//   node tools/test-bds/run.mjs --quiet --timeout 300 --only cooking_bp --scenario tools/test-bds/examples/cooking-early.js
const START_AFTER_SPAWN = 70; // ticks: the pot is still bubbling at spawn + 100
const COOK_TICKS = 60; // cookSeconds 3

export default async function (t) {
  const mc = t.mc;
  let owed;
  let spawnTick;
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cooking_owed") owed = JSON.parse(message);
  });
  t.world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (initialSpawn && player.name === "EarlyCook" && spawnTick === undefined) spawnTick = t.system.currentTick;
  });
  const askOwed = async () => {
    owed = undefined;
    await t.console(`scriptevent realm:cooking_owed_ping {}`);
    return t.waitUntil(() => owed, { timeout: 60, message: "cooking answered the owed ping" });
  };
  const p = await t.player("EarlyCook");
  await t.waitUntil(() => spawnTick !== undefined, { timeout: 40, message: "the initial spawn event" });
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
  for (const id of ["minecraft:bowl", "minecraft:cooked_cod", "minecraft:baked_potato", "minecraft:kelp"]) inv.addItem(new mc.ItemStack(id, 1));
  const wait = spawnTick + START_AFTER_SPAWN - t.system.currentTick;
  t.assert(wait > 5, `time left to cook before the join handover (${wait} ticks)`);
  await t.wait(wait);
  await t.console(`scriptevent realm:cooking_cook ${JSON.stringify({ player: p.id, recipe: "harbor_chowder", times: 1 })}`);
  await t.waitUntil(() => bowls() === 0, { timeout: 20, message: "ingredients taken" });
  const started = t.system.currentTick;
  t.log(`pot started ${started - spawnTick} ticks after the spawn; the join handover runs at 100`);
  // Past the join handover, still well short of cookSeconds.
  await t.waitUntil(() => t.system.currentTick - spawnTick >= 110, { timeout: 60, message: "past the join handover" });
  const early = t.system.currentTick - started;
  t.assert(early < COOK_TICKS - 5, `still inside the cook (${early} of ${COOK_TICKS} ticks)`);
  t.assert(chowder() === 0, `no dish before the pot is done (${chowder()} after ${early} ticks)`);
  await t.waitUntil(() => chowder() === 1, { timeout: 120, message: "one Harbor Chowder handed over when the pot is done" });
  const took = t.system.currentTick - started;
  t.assert(took >= COOK_TICKS - 5, `the dish took the whole cook (${took} ticks)`);
  await t.wait(40);
  t.assert(chowder() === 1, `exactly one dish (${chowder()})`);
  const after = await askOwed();
  t.assert(after.batches === 0, `nothing owed after the early cook (${JSON.stringify(after)})`);
}
