// SOLO Saga "items to have" step with Expansive Inventory routing, using REAL item-entity pickups. /give is not a pickup
// (it lands unrouted on the hotbar), so every pickup here is a spawned item entity the player collects natively while
// standing on a later page with the hotbar full of other items.
// RED source: the commit "Stash: genuine pickups route to the earliest pages ..." (routing without the Saga bridge):
// the routed paper never shows in Saga's live scan and "Have 8 paper" never completes. GREEN: with the bridge.
// Native-only control corrections for the lead: solo objective completion, a real chapter report, exact rewards and native page totals.
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
  const choose = async (key) => {
    let next = t.waitForm(ann, { timeout: 300 });
    send("realm:npc_choose", { player: ann.id, npc: "mara", pack: "saga_bp", key });
    for (let k = 0; k < 20; k++) {
      const f = await next;
      const last = !f.buttons.includes("Next");
      if (!last) next = t.waitForm(ann, { timeout: 300 });
      f.answer(last ? Math.max(0, f.buttons.findIndex((b) => /Accept|Finish/.test(b))) : "Next");
      if (last) return;
    }
    t.fail("story dialogue did not finish in 20 pages");
  };
  await choose("start:last_map");
  await t.waitMessage(ann, /Pins in an Old Map/, { timeout: 300 });

  // Page 1 holds 4 paper; the player stands on page 2 with every hotbar slot taken by something else.
  inv.setItem(20, new mc.ItemStack("minecraft:paper", 4));
  await t.wait(10);
  inv.setItem(17, undefined);
  await t.waitUntil(() => pageNow() === 2, { timeout: 60, message: "on page 2" });
  const fillers = ["stick", "coal", "apple", "bread", "carrot", "dirt", "sand", "gravel", "compass"];
  fillers.forEach((id, slot) => inv.setItem(slot, new mc.ItemStack(`minecraft:${id}`, 1)));
  await t.wait(10);

  // Move an EXISTING stack: creating one with setItem would increase total ownership, not simulate rearrangement.
  const moved = inv.getItem(0);
  inv.setItem(0, undefined);
  inv.setItem(30, moved);
  await t.wait(120); // cover the existing quiet-player sampling cycle, not a production delay
  t.assert(inv.getItem(30)?.typeId === "minecraft:stick", "moving an existing hotbar stack does not route it as a pickup");
  inv.setItem(0, inv.getItem(30));
  inv.setItem(30, undefined);
  await t.wait(10);
  t.assert(pageNow() === 2, "still on page 2");

  // Partial, repeated pickups of real item entities: 2 + 1 + 1 more paper with 4 already on page 1 makes 8.
  const since = t.tick;
  const paperOnPage = () => {
    let count = 0;
    for (let i = 9; i < inv.size; i++) {
      if ([15, 16, 17].includes(i)) continue;
      const item = inv.getItem(i);
      if (item?.typeId === "minecraft:paper") count += item.amount;
    }
    return count;
  };
  for (const n of [2, 1, 1]) {
    const drop = ann.dimension.spawnItem(new mc.ItemStack("minecraft:paper", n), ann.location);
    t.assert(drop.typeId === "minecraft:item", "the native pickup source is an item entity");
    await t.waitUntil(() => !drop.isValid, { timeout: 200, message: "Ann actually collected the item entity" });
    await t.waitUntil(() => paperOnPage() === 0, { timeout: 240, message: "pickup was routed off the viewed page" });
    t.assert(pageNow() === 2, "the player stays on page 2 while picking up");
    t.log(`actual pickup ${n}, active-page paper ${paperOnPage()}, still page ${pageNow()}`);
  }
  await t.waitMessage(ann, /Have 8 paper: done/, { since, timeout: 600 });
  t.log(`counted across pages after ${t.tick - since} ticks`);
  t.assert(fillers.every((id, s) => inv.getItem(s)?.typeId === `minecraft:${id}`), "the hotbar fillers are untouched");

  // Another pickup afterwards must not complete the step again.
  const after = t.tick + 1; // waitMessage's inclusive since must not re-match the completion received this tick.
  const extra = ann.dimension.spawnItem(new mc.ItemStack("minecraft:paper", 1), ann.location);
  await t.waitUntil(() => !extra.isValid, { timeout: 200, message: "the later pickup was collected" });
  await t.waitUntil(() => paperOnPage() === 0, { timeout: 240, message: "the later pickup was also routed" });
  await t.wait(120);
  let again = true;
  try {
    await t.waitMessage(ann, /Have 8 paper: done/, { since: after, timeout: 20 });
  } catch {
    again = false;
  }
  t.assert(!again, "the objective completion line is not repeated by a later pickup (not a reward-payout assertion)");
  const levels = ann.level;
  const bread = inv.getItem(3).amount;
  const reportSince = t.tick;
  await choose("end:last_map");
  await t.waitMessage(ann, /Chapter complete: Pins in an Old Map/, { since: reportSince, timeout: 300 });
  await t.wait(120);
  t.assert(pageNow() === 2, "the solo player receives the actual chapter reward without switching pages");
  t.assert(ann.level === levels + 2 && inv.getItem(3).amount === bread + 8, "the actual report pays exactly two levels and eight bread");
  send("realm:npc_choose", { player: ann.id, npc: "mara", pack: "saga_bp", key: "end:last_map" });
  await t.wait(120);
  t.assert(ann.level === levels + 2 && inv.getItem(3).amount === bread + 8, "repeating the real report does not pay the first chapter twice");
  t.assert(t.messages(ann, { since: reportSince, kind: "chat", pack: "saga_bp" })
    .filter((m) => /Chapter complete: Pins in an Old Map/.test(m.plain)).length === 1, "one actual chapter completion");
  const mapsOnPage = () => {
    let count = 0;
    for (let i = 9; i < inv.size; i++) {
      const item = inv.getItem(i);
      if (item?.typeId === "minecraft:empty_map") count += item.amount;
    }
    return count;
  };
  t.assert(mapsOnPage() === 0, "the actual map reward routed off page 2 too");
  inv.setItem(15, undefined);
  await t.waitUntil(() => pageNow() === 1, { timeout: 60, message: "inspect the earlier page after completion" });
  t.assert(paperOnPage() === 9, "page 1 holds exactly the original 4 plus all 5 collected paper");
  t.assert(mapsOnPage() === 1, "exactly one native empty-map reward, with no duplicate on either page");
}
