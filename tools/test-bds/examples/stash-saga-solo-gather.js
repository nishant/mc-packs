// SOLO Saga "items to have" step with Expansive Inventory routing, using REAL item-entity pickups. /give is not a pickup
// (it lands unrouted on the hotbar), so every pickup here is a spawned item entity the player collects natively while
// standing on a later page with the hotbar full of other items.
// RED source: the commit "Stash: genuine pickups route to the earliest pages ..." (routing without the Saga bridge):
// the routed paper never shows in Saga's live scan and "Have 8 paper" never completes. GREEN: with the bridge.
// Not run by the author: queued for the lead. The reward-once check is only that the completion line appears once.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,stash_bp --scenario tools/test-bds/examples/stash-saga-solo-gather.js --timeout 900
export default async function (t) {
  const mc = t.mc;
  const ann = await t.player("Ann", { op: true });
  t.cmd(ann, "/gamemode survival");
  const inv = ann.getComponent("minecraft:inventory").container;
  const send = (id, msg) => t.system.sendScriptEvent(id, JSON.stringify(msg));
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  await t.waitUntil(() => inv.getItem(16)?.typeId === "custom:inv_menu", { timeout: 200, message: "pages ready" });
  send("realm:cfg_set", { id: "g1", pack: "stash_bp", key: "autoStore", value: true, player: ann.id });
  let next = t.waitForm(ann, { timeout: 300 });
  send("realm:npc_choose", { player: ann.id, npc: "mara", pack: "saga_bp", key: "start:last_map" });
  for (let k = 0; k < 20; k++) {
    const f = await next;
    const last = !f.buttons.includes("Next");
    if (!last) next = t.waitForm(ann, { timeout: 300 });
    f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))) : "Next");
    if (last) break;
  }
  await t.waitMessage(ann, /Pins in an Old Map/, { timeout: 300 });

  // Page 1 holds 4 paper; the player stands on page 2 with every hotbar slot taken by something else.
  inv.setItem(20, new mc.ItemStack("minecraft:paper", 4));
  await t.wait(10);
  inv.setItem(17, undefined);
  await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: "on page 2" });
  const fillers = ["stick", "coal", "apple", "bread", "carrot", "dirt", "sand", "gravel", "clay_ball"];
  fillers.forEach((id, slot) => inv.setItem(slot, new mc.ItemStack(`minecraft:${id}`, 1)));
  await t.wait(10);

  // Not a pickup: a stack placed by hand stays where it is and is never routed.
  inv.setItem(30, new mc.ItemStack("minecraft:paper", 1));
  await t.wait(60);
  t.assert(inv.getItem(30)?.typeId === "minecraft:paper", "a stack set by hand (not a pickup) stays where it is");
  inv.setItem(30, undefined);
  await t.wait(10);
  t.assert(pageNow() === 2, "still on page 2");

  // Partial, repeated pickups of real item entities: 2 + 1 + 1 more paper with 4 already on page 1 makes 8.
  const since = t.tick;
  for (const n of [2, 1, 1]) {
    ann.dimension.spawnItem(new mc.ItemStack("minecraft:paper", n), ann.location);
    await t.wait(80);
    t.assert(pageNow() === 2, "the player stays on page 2 while picking up");
  }
  await t.waitMessage(ann, /Have 8 paper: done/, { since, timeout: 600 });
  t.log(`counted across pages after ${t.tick - since} ticks`);
  t.assert(fillers.every((id, s) => inv.getItem(s)?.typeId === `minecraft:${id}`), "the hotbar fillers are untouched");

  // Another pickup afterwards must not complete the step again.
  const after = t.tick;
  ann.dimension.spawnItem(new mc.ItemStack("minecraft:paper", 1), ann.location);
  await t.wait(120);
  let again = true;
  try {
    await t.waitMessage(ann, /Have 8 paper: done/, { since: after, timeout: 20 });
  } catch {
    again = false;
  }
  t.assert(!again, "the completion line is not repeated by a later pickup");
}
