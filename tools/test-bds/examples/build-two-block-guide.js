// Easy Building (build_bp): the guide of a big two-block shape while you aim the end. Aimed farther away than a shape
// may be, it isn't laid out at all (it used to be: about 9 seconds per look for a sphere 100 blocks away, and the
// watchdog shut the server down); aimed within reach, a 51 x 64 x 50 sphere is laid out over the next ticks instead of
// stalling the server for over a second at every look. The build itself is unchanged.
// Only the stall (tick length) and the build are checked here, not that the big guide is drawn: guide particles go
// through player.spawnParticle, which the harness shim doesn't relay, and the layout cache is private to the pack
// (no test hook). Check the guide by eye in game after changing guideFor's layout job.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-two-block-guide.js --timeout 600
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const Y = -60;
  await t.loadArea(0, 0, { radius: 3 });
  await t.loadArea(50, 50, { radius: 3 });
  await t.loadArea(110, 100, { radius: 3 });
  t.server("/gamerule domobspawning false");
  const cre = await t.player("Cre", { x: 0, z: -3, gameMode: "creative", op: true });
  const inv = cre.getComponent("inventory").container;
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:stone", 64));
  cre.selectedSlotIndex = 0;

  // The longest gap between two ticks while the player aims (a stall of the whole server).
  let last = Date.now(), worst = 0;
  const watch = t.system.runInterval(() => {
    const now = Date.now();
    worst = Math.max(worst, now - last);
    last = now;
  }, 1);
  /** Looks at marker blocks from x0 on, one block further each time, `n` times, holding each look for 12 ticks. */
  const aimAlong = async (x0, h, n) => {
    for (let k = 0; k < n; k++) {
      const m = { x: x0 + k, y: Y + h, z: h };
      dim.setBlockType(m, "minecraft:bedrock");
      dim.setBlockType({ x: m.x, y: m.y - 1, z: h - 4 }, "minecraft:glass"); // something to stand on
      cre.teleport({ x: m.x + 0.5, y: m.y, z: h - 3.5 }, { dimension: dim });
      await t.wait(2);
      cre.lookAtBlock(m);
      await t.wait(10);
    }
  };

  // A hollow sphere between two blocks; the start placed in build mode at 0 -60 0.
  t.answerForm(cre, "Choose a shape", 14, { Radius: 3, Hollow: true, Size: 1 });
  t.assert(t.cmd(cre, "/realm:build").ok, "/realm:build ran");
  await t.waitMessage(cre, /place the start block/i, { pack: "build_bp" });
  dim.setBlockType({ x: 0, y: Y, z: -3 }, "minecraft:stone");
  cre.teleport({ x: 0.5, y: Y + 1, z: -2.5 }, { dimension: dim, rotation: { x: 0, y: 0 } });
  await t.wait(4);
  t.clearMessages();
  cre.useItemInSlotOnBlock(0, { x: 0, y: Y - 1, z: 0 }, t.mc.Direction.Up);
  await t.waitMessage(cre, /Start set/, { kind: "actionbar" });
  await t.wait(4);
  cre.stopInteracting();

  // The end 100 blocks away and 100 up: too far for any shape (64 by default).
  last = Date.now();
  worst = 0;
  await aimAlong(100, 100, 6);
  t.check(worst < 1000, `aiming 100 blocks away doesn't stall the server (longest tick ${worst} ms)`);

  // The end within reach: a 51 x 64 x 50 box between the two blocks.
  last = Date.now();
  worst = 0;
  await aimAlong(56, 50, 8);
  t.check(worst < 1000, `aiming a big sphere's end doesn't stall the server (longest tick ${worst} ms)`);
  t.system.clearRun(watch);

  // Building it is the same as before: the end at the spot in front of the last marker.
  const hit = cre.getBlockFromViewDirection({ maxDistance: 16 });
  t.assert(hit && hit.block.location.x === 63 && hit.face === "North", `the player looks at the last marker's near face (${hit?.block.location.x}, ${hit?.face})`);
  t.clearMessages();
  t.cmd(cre, "/realm:build_here");
  const built = await t.waitMessage(cre, /Built \d+ blocks|more than|apart/, { kind: "actionbar" });
  t.log("sphere:", built.plain);
  const n = Number(/Built (\d+) blocks/.exec(built.plain)?.[1] ?? 0);
  t.check(n > 5000, `the sphere between the two blocks is built (${built.plain})`);
  t.clearMessages();
  t.cmd(cre, "/realm:build_undo");
  await t.waitMessage(cre, /Undone/, { kind: "actionbar" });
}
