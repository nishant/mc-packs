// Expeditions F6: when one of the two stash carts disappears while the stash is being handed back, the survivor's items
// are given back, the structure is NOT placed over it again (that would duplicate items), and the player is told
// "Only 1 of 2" truthfully. The removal races the hand-back by design: the cart is removed the moment the carts
// appear, which is inside the window cartsOf waits for the second one, so a run that misses the window fails the
// first check instead of passing silently. Queued for the lead; not run by the worker.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-carts-partial.js --timeout 600
export default async function (t) {
  t.formTimeout = 400;
  const sx = 300, sz = 0;
  await t.loadArea(sx, sz, { radius: 4 });
  const p = await t.player("CartPartial", { op: true, x: 0, y: 64, z: 0 });
  t.assert(t.cmd(p, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(p, /site set/i, { timeout: 200 });
  const inv = p.getComponent("minecraft:inventory").container;
  inv.setItem(20, new t.mc.ItemStack("minecraft:dirt", 37));
  inv.setItem(30, new t.mc.ItemStack("minecraft:cobblestone", 11));
  t.answerForm(p, "Start a Gauntlet", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Fixed loadout", "Start the Gauntlet");
  t.cmd(p, "/realm:expedition");
  await t.waitUntil(async () => (await state(t))?.phase === "active", { timeout: 1200, interval: 20, message: "Gauntlet active" });
  await t.wait(30);
  const since = t.system.currentTick;
  t.cmd(p, "/realm:expedition_leave");
  const dims = ["overworld", "nether", "the_end"].map((d) => t.world.getDimension(d));
  const carts = () => dims.flatMap((d) => d.getEntities({ tags: ["realm:exp_stash_1"] }).concat(d.getEntities({ type: "minecraft:chest_minecart" })));
  const first = await t.waitUntil(() => carts()[0], { timeout: 400, interval: 1, message: "stash carts appear" });
  first.getComponent("minecraft:inventory")?.container?.clearAll();
  first.remove();
  const msg = (await t.waitMessage(p, /own items are back|couldn't be found/i, { timeout: 400, since }).catch(() => undefined))?.plain;
  t.check(!!msg, "the hand-back finished");
  const warn = (await t.waitMessage(p, /Only \d of 2 storage carts/i, { timeout: 200, since }).catch(() => undefined))?.plain;
  t.check(!!warn, `a partial hand-back is reported (${warn ?? "no message"})`);
  await t.wait(60);
  const left = dims.reduce((n, d) => n + d.getEntities({ type: "minecraft:chest_minecart" }).length, 0);
  t.check(left === 0, `nothing was placed over the survivor and no cart is left (${left})`);
  t.check(inv.getItem(20)?.amount !== 74, "the dirt was not handed out twice");
}
async function state(t, room) {
  const parts = [];
  let want = 0;
  const done = new Promise((res) => {
    const sub = t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
      if (ev.id !== "realm:expedition_state") return;
      const m = JSON.parse(ev.message);
      parts[m.part] = m.data;
      want = m.parts;
      if (parts.filter((x) => x !== undefined).length === want) {
        t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
        res(JSON.parse(parts.join("")));
      }
    });
  });
  t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify(room === undefined ? {} : typeof room === "object" ? room : { room }));
  return Promise.race([done, t.wait(40).then(() => undefined)]);
}
