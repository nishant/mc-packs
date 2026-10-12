// Easy Building (build_bp): a player who leaves while a cut is still taking blocks away. The cut is abandoned: the
// blocks taken so far go back where they were, no copy is kept (no stale Last copy, no orphan structure).
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-cut-leave.js --timeout 300
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const sm = t.world.structureManager;
  const Y = -60;
  const count = (id, x0, y0, z0, x1, y1, z1) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (dim.getBlock({ x, y, z })?.typeId === id) n++;
    return n;
  };

  await t.loadArea(0, 0, { radius: 4 });
  const cre = await t.player("Cre", { x: 0, z: 0, gameMode: "creative", op: true });
  // 100 blocks a tick: a 16384-block cut takes about 8 seconds, plenty of time to leave in the middle of it.
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "t1", pack: "build_bp", key: "blocksPerTick", value: 100 }));
  await t.wait(5);

  // A 64 x 4 x 64 slab of stone around the spawn (the ticking areas keep it loaded after the player leaves).
  const min = { x: -32, y: Y, z: -32 }, max = { x: 31, y: Y + 3, z: 31 };
  t.server(`/fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} stone`);
  await t.waitUntil(() => count("minecraft:stone", min.x, min.y, min.z, max.x, max.y, max.z) === 16384, { timeout: 100, message: "the slab is filled" });

  // Select its two corners.
  t.cmd(cre, "/realm:build_copy"); // nothing selected yet: starts selecting
  await t.waitMessage(cre, /Selecting a region/);
  const hand = cre.getComponent("inventory").container;
  hand.setItem(cre.selectedSlotIndex, new ItemStack("minecraft:stick", 1));
  const since = t.tick;
  for (const corner of [min, max]) {
    cre.teleport({ x: corner.x + 0.5, y: Y + 4, z: corner.z + 0.5 });
    await t.wait(2);
    cre.lookAtBlock(corner);
    await t.wait(2);
    const ok = cre.useItemInSlotOnBlock(cre.selectedSlotIndex, corner, t.mc.Direction.Up);
    t.check(ok, `corner ${JSON.stringify(corner)} used`);
    await t.wait(3);
    cre.stopInteracting();
    await t.wait(8);
  }
  await t.waitMessage(cre, /Selected 64 x 4 x 64/, { kind: "actionbar", since });

  // Cut, and leave while it is still taking blocks away.
  t.assert(t.cmd(cre, "/realm:build_cut").ok, "cut ran");
  await t.wait(50);
  const gone = 16384 - count("minecraft:stone", min.x, min.y, min.z, max.x, max.y, max.z);
  t.log("stone taken away when the player leaves:", gone);
  t.assert(gone > 500 && gone < 16000, `the cut is in the middle of taking blocks away (${gone} gone)`);
  cre.disconnect();
  await t.wait(200); // long enough for the cut to have finished, had it kept going

  const left = count("minecraft:stone", min.x, min.y, min.z, max.x, max.y, max.z);
  t.log("stone in the slab after the player left:", left);
  t.check(left === 16384, `the cut was abandoned and every block put back (${left} of 16384)`);
  const ids = sm.getWorldStructureIds().filter((id) => /^build:p/.test(id));
  t.log("copy structures left in the world:", ids.join(" ") || "none");
  t.check(ids.length === 0, "no copy is kept from the abandoned cut");
}
