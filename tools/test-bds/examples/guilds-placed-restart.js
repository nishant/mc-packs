// Guilds: pumpkins (and ores) a player placed stay remembered across a restart, so breaking them afterwards earns no
// Growers progress and no extra crop from the Growers' perk. Before, the memory was lost with the server (a Realm
// closes when everyone leaves), and the perk's 25% extra pumpkin made placed pumpkins a way to copy them.
// node tools/test-bds/run.mjs --quiet --flat --only guilds_bp --scenario tools/test-bds/examples/guilds-placed-restart.js --timeout 600
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const N = 30;
  const Y = -60; // the air above the flat world's grass
  const X0 = 2;
  const Z = 4;
  await t.loadArea(X0 + N / 2, Z, { radius: 2 });
  const pumpkins = () => {
    let n = 0;
    for (let x = X0; x < X0 + N; x++) if (dim.getBlock({ x, y: Y, z: Z })?.typeId === "minecraft:pumpkin") n++;
    return n;
  };

  if (t.phase === 1) {
    const p = await t.player("Pip", { x: X0, z: Z - 2, gameMode: "survival" });
    const inv = p.getComponent("inventory").container;
    inv.clearAll();
    inv.setItem(0, new ItemStack("minecraft:pumpkin", 64));
    p.selectedSlotIndex = 0;
    for (let i = 0; i < N; i++) {
      const at = { x: X0 + i, y: Y, z: Z };
      // A simulated player places at most one block every few ticks: try again until it's there.
      for (let k = 0; k < 5 && dim.getBlock(at)?.typeId !== "minecraft:pumpkin"; k++) {
        p.teleport({ x: X0 + i + 0.5, y: Y, z: Z - 1.5 }, { dimension: dim });
        await t.wait(3);
        p.useItemInSlotOnBlock(0, { x: X0 + i, y: Y - 1, z: Z }, t.mc.Direction.Up);
        await t.wait(5);
        p.stopInteracting();
      }
    }
    t.assert(pumpkins() === N, `the player placed ${N} pumpkins (${pumpkins()})`);
    p.disconnect();
    await t.wait(40);
    t.restart("pumpkins placed; restarting");
  }

  t.assert(pumpkins() === N, `the ${N} pumpkins are still there (${pumpkins()})`);
  const p = await t.player("Pip2", { x: X0, z: Z - 2, gameMode: "survival" });
  const rep = () => {
    try {
      return t.world.scoreboard.getObjective("rep_growers")?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  // Journeyman of the Growers: the perk (an extra crop one time in four) is on.
  const since = t.tick;
  t.system.sendScriptEvent("realm:rep_add", JSON.stringify({ player: p.id, guild: "growers", amount: 300, reason: "a test" }));
  await t.waitMessage(p, /Growers' Guild: you are now a Journeyman/, { since });
  t.assert(rep() === 300, `300 Growers rep (${rep()})`);

  const inv = p.getComponent("inventory").container;
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:diamond_axe", 1));
  p.selectedSlotIndex = 0;
  for (const e of dim.getEntities({ type: "minecraft:item" })) e.remove();
  for (let i = 0; i < N; i++) {
    const at = { x: X0 + i, y: Y, z: Z };
    for (let k = 0; k < 5 && dim.getBlock(at)?.typeId === "minecraft:pumpkin"; k++) {
      p.teleport({ x: X0 + i + 0.5, y: Y, z: Z - 1.5 }, { dimension: dim });
      await t.wait(3);
      p.breakBlock(at);
      await t.wait(10);
      p.stopBreakingBlock?.();
    }
  }
  await t.wait(10);
  t.assert(pumpkins() === 0, `every pumpkin was broken (${pumpkins()} left)`);
  let dropped = 0;
  for (const e of dim.getEntities({ type: "minecraft:item" })) {
    const s = e.getComponent("minecraft:item")?.itemStack;
    if (s?.typeId === "minecraft:pumpkin") dropped += s.amount;
  }
  for (const it of [...Array(inv.size).keys()].map((k) => inv.getItem(k))) if (it?.typeId === "minecraft:pumpkin") dropped += it.amount;
  t.log(`pumpkins from ${N} breaks: ${dropped}, Growers rep ${rep()}`);
  t.check(dropped === N, `placed pumpkins give no extra crop after a restart (${dropped} from ${N})`);
  t.check(rep() === 300, `and no Growers progress (rep ${rep()}, was 300)`);
}
