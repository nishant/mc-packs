// SOLO Saga "items to have" step with Expansive Inventory routing: a pickup lands on the open page, and the
// stash then routes it to the earliest page (auto-store), so the live inventory never holds it. The collect step must
// still count it (realm:stash_count), while a delivery step keeps reading only the live inventory.
// RED source: the commit "Stash: genuine pickups route to the earliest pages ..." (routing without the Saga bridge):
// the paper is routed to page 1 while the player is on page 2 and "Have 8 paper" never completes. GREEN: with the bridge.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp,stash_bp --scenario tools/test-bds/examples/stash-saga-solo-gather.js --timeout 600
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
  // Page 1 already holds 4 paper; the player moves to page 2 so later pickups are routed back to page 1.
  inv.setItem(20, new mc.ItemStack("minecraft:paper", 4));
  await t.wait(10);
  inv.setItem(17, undefined);
  await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: "on page 2" });
  await t.wait(10);
  const since = t.tick;
  t.assert(t.cmd(ann, "/give @s paper 4").ok, "Ann picks up 4 paper");
  await t.waitMessage(ann, /Have 8 paper: done/, { since, timeout: 400 });
  t.log(`counted across pages after ${t.tick - since} ticks`);
}
