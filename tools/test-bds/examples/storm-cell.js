// Storm Chasing: an operator forces a storm cell near them; the pack announces it in chat, reports it with
// realm:storm_cell, a clock reads it, lightning strikes near the cell (loaded ground), a lightning rod is placed
// and struck without errors, the forced cell survives a restart, and "End the storm cell" clears it.
// node tools/test-bds/run.mjs --quiet --only storm_bp --scenario tools/test-bds/examples/storm-cell.js --timeout 360
export default async function (t) {
  const reports = [];
  t.system.afterEvents.scriptEventReceive.subscribe((e) => {
    if (e.id === "realm:storm_cell") reports.push(JSON.parse(e.message));
  }, { namespaces: ["realm"] });
  // Away from the world spawn: no lightning lands within avoidSpawn (64) blocks of it, and the cell forms only 48 to 96
  // blocks from the operator, so a player standing at the spawn would see most strikes skipped.
  const sp = t.world.getDefaultSpawnLocation();
  const p = await t.player("Chaser", { op: true, x: sp.x + 300, z: sp.z });
  if (t.phase === 1) {
    t.assert(t.cmd(p, "/realm:storm_cell true").ok, "/realm:storm_cell true ran");
    const note = await t.waitMessage(p, /storm cell is forming to the/, { timeout: 60 });
    t.log(note.plain);
    await t.waitUntil(() => reports.some((r) => r.dim), { timeout: 60, message: "realm:storm_cell report" });
    const cell = reports.find((r) => r.dim);
    const dist = Math.hypot(cell.x - p.location.x, cell.z - p.location.z);
    t.log(`cell at ${cell.x}, ${cell.z}: ${Math.round(dist)} blocks away, strength ${cell.strength}`);
    t.check(dist >= 40 && dist <= 110, "the cell is 48 to 96 blocks away (plus a second of drift)");

    // Reading it needs a clock.
    t.assert(t.cmd(p, "/realm:storm_read").ok, "/realm:storm_read ran");
    await t.waitMessage(p, /Hold a clock/, { timeout: 40 });
    p.giveItem(new t.mc.ItemStack("minecraft:clock", 1), true);
    await t.wait(5);
    t.assert(t.cmd(p, "/realm:storm_read").ok, "/realm:storm_read ran with a clock");
    const read = await t.waitMessage(p, /Cell: \d+m/, { timeout: 40 });
    t.log(read.plain);

    // Lightning lands near the cell once the ground there is loaded.
    await t.loadArea(cell.x, cell.z, { radius: 3 });
    const bolts = [];
    t.world.afterEvents.entitySpawn.subscribe((e) => {
      if (e.entity.typeId === "minecraft:lightning_bolt") bolts.push({ ...e.entity.location });
    });
    await t.waitUntil(() => bolts.length > 0, { timeout: 600, message: "a lightning bolt near the cell" });
    t.log(`first bolt at ${JSON.stringify(bolts[0])}`);

    // A rod placed by a player is remembered; a bolt next to it charges it.
    const under = p.location;
    const rodAt = { x: Math.floor(under.x) + 2, y: Math.floor(under.y), z: Math.floor(under.z) + 2 };
    t.dimension.getBlock({ x: rodAt.x, y: rodAt.y - 1, z: rodAt.z }).setType("minecraft:stone");
    t.dimension.getBlock(rodAt).setType("minecraft:air");
    p.giveItem(new t.mc.ItemStack("minecraft:lightning_rod", 1), true);
    await t.wait(5);
    p.useItemInSlotOnBlock(p.selectedSlotIndex, { x: rodAt.x, y: rodAt.y - 1, z: rodAt.z }, t.mc.Direction.Up);
    await t.waitUntil(() => t.dimension.getBlock(rodAt)?.typeId === "minecraft:lightning_rod", { timeout: 40, message: "the rod is placed" });
    // The rod is remembered (playerPlaceBlock) and a bolt next to it charges it (entitySpawn): nothing may be logged.
    // Tapping it for the Storm Glass can't be driven from here: a simulated player's useItemOnBlock reaches
    // playerInteractWithBlock with isFirstEvent false and interactWithBlock fires nothing, so the collect path is
    // hand-tested against a copy of the pack that ignores isFirstEvent (see the audit notes).
    t.dimension.spawnEntity("minecraft:lightning_bolt", { x: rodAt.x + 0.5, y: rodAt.y + 1, z: rodAt.z + 0.5 });
    await t.wait(20);
    t.restart("cell saved, restarting");
  }
  // Phase 2: the forced cell is still there.
  await t.waitUntil(() => reports.some((r) => r.dim), { timeout: 200, message: "the restored cell is reported" });
  t.log(`after the restart: cell at ${reports[0].x}, ${reports[0].z}`);
  const menuP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:storm").ok, "/realm:storm ran");
  const menu = await menuP;
  t.check(/There's a storm cell out there/.test(menu.body), `the menu knows about the cell (${menu.body.slice(0, 50)})`);
  menu.answer("End the storm cell");
  await t.waitMessage(p, /storm cell is gone/, { timeout: 60 });
  await t.waitUntil(() => reports.at(-1).dim === null, { timeout: 60, message: "realm:storm_cell { dim: null } once the cell is gone" });
}
