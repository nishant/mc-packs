// Skills: logs a player placed just before leaving stay remembered across a restart, so chopping them afterwards gives
// no Woodcutting XP. Before, the placed blocks were saved only every 30 seconds, so logs placed in the last 30 s before
// the Realm closed (it closes soon after the last player leaves) gave XP again after the restart. A log set by the
// server (not placed by a player) still gives XP, so the test can tell "no XP" from "XP never works".
// node tools/test-bds/run.mjs --quiet --flat --only skills_bp --scenario tools/test-bds/examples/skills-placed-restart.js --timeout 600
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const N = 5;
  const Y = -60; // the air above the flat world's grass
  const X0 = 2;
  const Z = 4;
  const LOG = "minecraft:oak_log";
  await t.loadArea(X0 + N / 2, Z, { radius: 2 });
  const logs = () => {
    let n = 0;
    for (let x = X0; x < X0 + N; x++) if (dim.getBlock({ x, y: Y, z: Z })?.typeId === LOG) n++;
    return n;
  };
  const clearRow = () => {
    for (const e of dim.getEntities({ location: { x: X0 + N / 2, y: Y, z: Z }, maxDistance: 16 })) if (e.typeId !== "minecraft:player") e.remove();
  };

  if (t.phase === 1) {
    t.server("/gamerule doMobSpawning false");
    clearRow();
    const p = await t.player("Pip", { x: X0, z: Z - 2, gameMode: "survival" });
    const inv = p.getComponent("inventory").container;
    inv.clearAll();
    inv.setItem(0, new ItemStack(LOG, 64));
    p.selectedSlotIndex = 0;
    for (let i = 0; i < N; i++) {
      const at = { x: X0 + i, y: Y, z: Z };
      // A simulated player places at most one block every few ticks: try again until it's there.
      for (let k = 0; k < 5 && dim.getBlock(at)?.typeId !== LOG; k++) {
        if (k > 0) clearRow();
        p.teleport({ x: X0 + i + 0.5, y: Y, z: Z - 1.5 }, { dimension: dim });
        await t.wait(2);
        p.useItemInSlotOnBlock(0, { x: X0 + i, y: Y - 1, z: Z }, t.mc.Direction.Up);
        await t.wait(4);
        p.stopInteracting();
      }
    }
    t.assert(logs() === N, `the player placed ${N} logs (${logs()})`);
    // Leave at once and restart: well inside Skills' 30-second save, so only a save on leave keeps them.
    p.disconnect();
    await t.wait(20);
    t.restart("logs placed; restarting");
  }

  t.assert(logs() === N, `the ${N} logs are still there (${logs()})`);
  clearRow();
  const p = await t.player("Pip2", { x: X0, z: Z - 2, gameMode: "survival" });
  const xp = () => {
    try {
      return t.world.scoreboard.getObjective("skill_woodcutting")?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  const inv = p.getComponent("inventory").container;
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:netherite_axe", 1));
  p.selectedSlotIndex = 0;
  /** @param {{ x: number, y: number, z: number }} at */
  const chop = async (at) => {
    for (let k = 0; k < 5 && dim.getBlock(at)?.typeId === LOG; k++) {
      p.teleport({ x: at.x + 0.5, y: Y, z: Z - 1.5 }, { dimension: dim });
      await t.wait(3);
      p.lookAtBlock(at);
      p.breakBlock(at);
      await t.waitUntil(() => dim.getBlock(at)?.typeId !== LOG, { timeout: 60 }).catch(() => undefined);
      p.stopBreakingBlock?.();
    }
  };
  for (let i = 0; i < N; i++) await chop({ x: X0 + i, y: Y, z: Z });
  await t.wait(10);
  t.assert(logs() === 0, `every placed log was chopped (${logs()} left)`);
  const afterPlaced = xp();
  t.check(afterPlaced === 0, `placed logs give no Woodcutting XP after a restart (${afterPlaced} XP from ${N} logs)`);

  // The control: a log the server set (nobody placed it) gives XP.
  const wild = { x: X0 + N + 2, y: Y, z: Z };
  t.server(`/setblock ${wild.x} ${wild.y} ${wild.z} oak_log`);
  await t.wait(5);
  await chop(wild);
  await t.waitUntil(() => xp() > afterPlaced, { timeout: 100, message: "a server-set log gave Woodcutting XP" });
}
