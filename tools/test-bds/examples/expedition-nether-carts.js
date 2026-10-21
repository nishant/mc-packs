// Expeditions: a Fixed loadout Gauntlet started from the Nether. Leaving sends the player back to the Nether, and
// their own items must come back there: the stash's carts are put down at their feet in the Nether (not in the
// Overworld at the same coordinates, where world.structureManager.place() leaves a structure's entities while that
// Overworld chunk is loaded), and no stash cart is left anywhere afterwards. On BDS the engine bug shows only for a
// player who spawned in the Nether and stayed there (a simulated player sent back by teleport is placed correctly,
// and one that rejoins gets a new id), so this is NOT a fail-before test: the claim that it fails on the old code is
// withdrawn (not reproducible on BDS). It guards the round trip only.
// node tools/test-bds/run.mjs --quiet --flat --only expedition_bp --scenario tools/test-bds/examples/expedition-nether-carts.js --timeout 600
export default async function (t) {
  t.formTimeout = 400;
  const nether = t.world.getDimension("nether");
  const x = 0, z = 0;
  try { nether.runCommand(`tickingarea add circle ${x} 0 ${z} 2 exp_nether true`); } catch (e) { t.log(`ticking area: ${e}`); }
  // The fills span chunks -1 and 0 on both axes, and a fill with any part in an unloaded chunk places nothing: wait for
  // all four corners (on a slow runner the center chunk loads first, and the runner then fell to the lava sea).
  const corners = [[x - 4, z - 4], [x - 4, z + 4], [x + 4, z - 4], [x + 4, z + 4]];
  const readable = () => corners.every(([cx, cz]) => { try { return !!nether.getBlock({ x: cx, y: 64, z: cz }); } catch (e) { return false; } });
  await t.waitUntil(readable, { timeout: 600, message: "nether chunks loaded" });
  await t.wait(20);
  nether.runCommand(`fill ${x - 4} 64 ${z - 4} ${x + 4} 69 ${z + 4} air`);
  nether.runCommand(`fill ${x - 4} 63 ${z - 4} ${x + 4} 63 ${z + 4} netherrack`);
  t.assert(corners.every(([cx, cz]) => nether.getBlock({ x: cx, y: 63, z: cz })?.typeId === "minecraft:netherrack"), "the Nether floor is in place");
  // The bug shows when the Overworld at the same coordinates is loaded (someone there, a ticking area): the
  // structure's entities go there instead.
  await t.loadArea(x, z, { radius: 2 });
  await t.player("OverworldNeighbor", { x, z });
  const p = await t.player("NetherRunner", { op: true, x, y: 64, z, dimension: "nether" });
  const sx = 300, sz = 0; // the dungeon site, in the Overworld
  await t.loadArea(sx, sz, { radius: 4 });
  t.assert(t.cmd(p, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
  await t.waitMessage(p, /site set/i, { timeout: 200 });
  const inv = p.getComponent("minecraft:inventory").container;
  const sword = new t.mc.ItemStack("minecraft:diamond_sword", 1);
  sword.nameTag = "Nether Keeper";
  inv.setItem(3, sword);
  inv.setItem(20, new t.mc.ItemStack("minecraft:dirt", 37));
  t.answerForm(p, "Start a Gauntlet", "Crypt", (f) => f.buttons.findIndex((b) => b.startsWith("Easy")), "Fixed loadout", "Start the Gauntlet");
  t.cmd(p, "/realm:expedition");
  const st = await t.waitUntil(async () => { const s = await state(t); return s?.phase === "active" ? s : undefined; }, { timeout: 1200, interval: 20, message: "Gauntlet active" });
  t.check(st.loadout, "fixed loadout");
  await t.wait(30);
  t.check(inv.getItem(3)?.nameTag !== "Nether Keeper", "own sword stored away");
  const since = t.system.currentTick;
  t.cmd(p, "/realm:expedition_leave");
  await t.waitUntil(() => p.dimension.id === "minecraft:nether", { timeout: 300, interval: 5, message: "sent back to the Nether" });
  const back = (await t.waitMessage(p, /own items are back|couldn't be found/i, { timeout: 400, since }).catch(() => undefined))?.plain;
  t.check(!!back && /own items are back/i.test(back), `items handed back (${back ?? "no message"})`);
  t.check(inv.getItem(3)?.nameTag === "Nether Keeper", `the sword is back in slot 3 (${inv.getItem(3)?.typeId})`);
  t.check(inv.getItem(20)?.typeId === "minecraft:dirt" && inv.getItem(20)?.amount === 37, "the dirt is back in slot 20");
  await t.wait(20);
  for (const d of ["overworld", "nether", "the_end"]) {
    const left = t.world.getDimension(d).getEntities({ type: "minecraft:chest_minecart" }).length;
    t.check(left === 0, `no carts left in ${d} (${left})`);
  }
  t.check(t.world.structureManager.getWorldStructureIds().filter((id) => id.startsWith("expedition:stash")).length === 0, "the stash structure is deleted");
}
// shared helpers (pasted into each scenario: scenarios can't import)
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
