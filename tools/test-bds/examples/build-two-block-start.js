// Easy Building (build_bp): a two-block shape whose start block was placed in build mode and whose end comes from
// /realm:build_here. The placed start block only marked the spot: it goes back into your hand, the shape covers its
// spot like any other, and undo leaves nothing behind.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-two-block-start.js --timeout 300
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const Y = -60;
  const items = (p, id) => {
    const c = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) n += c.getItem(i).amount;
    return n;
  };
  const count = (id, x0, y0, z0, x1, y1, z1) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (dim.getBlock({ x, y, z })?.typeId === id) n++;
    return n;
  };

  await t.loadArea(0, 0, { radius: 3 });
  const sur = await t.player("Sur", { x: 0, z: -3, gameMode: "survival" });
  const inv = sur.getComponent("inventory").container;
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 40));
  inv.setItem(1, new ItemStack("minecraft:stick", 1));
  sur.selectedSlotIndex = 0;

  // A wall from two blocks, 3 high from its settings.
  t.answerForm(sur, "Choose a shape", 1, { Width: 5, Height: 3, Thickness: 1, Size: 1 });
  t.assert(t.cmd(sur, "/realm:build").ok, "/realm:build ran");
  await t.waitMessage(sur, /place the start block/i, { pack: "build_bp" });

  // The start: a cobblestone placed on the floor 2 blocks ahead (build mode keeps it there until the end is set).
  // The player stands one block up, so the line of sight to the floor farther on clears the start block.
  dim.setBlockType({ x: 0, y: Y, z: -3 }, "minecraft:stone");
  sur.teleport({ x: 0.5, y: Y + 1, z: -2.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(4);
  sur.useItemInSlotOnBlock(0, { x: 0, y: Y - 1, z: 0 }, t.mc.Direction.Up);
  await t.waitMessage(sur, /Start set/, { kind: "actionbar" });
  await t.wait(4);
  sur.stopInteracting();
  t.assert(dim.getBlock({ x: 0, y: Y, z: 0 })?.typeId === "minecraft:cobblestone", "the start block stays until the end is set");
  const afterStart = items(sur, "minecraft:cobblestone");
  t.log("cobblestone after placing the start:", afterStart);

  // The end: the floor 8 blocks ahead, with /realm:build_here (over the start block, so the look target is the floor).
  sur.lookAtBlock({ x: 0, y: Y - 1, z: 8 });
  await t.wait(4);
  const hit = sur.getBlockFromViewDirection({ maxDistance: 16 });
  t.assert(hit && hit.block.location.z === 8 && hit.face === "Up", `the player looks at the floor at z 8 (${hit?.block.location.z}, ${hit?.face})`);
  t.clearMessages();
  t.cmd(sur, "/realm:build_here");
  const built = await t.waitMessage(sur, /Built \d+ blocks/, { kind: "actionbar" });
  t.log("two-block wall:", built.plain, "cobblestone left", items(sur, "minecraft:cobblestone"));
  // 9 columns of 3: the start block's own spot is built (and paid) like the others, since the start went back to the hand.
  t.check(/Built 27 blocks/.test(built.plain), `the wall covers the start block's spot too (${built.plain})`);
  t.check(count("minecraft:cobblestone", 0, Y, 0, 0, Y + 2, 8) === 27, "27 cobblestone stand from the start to the end");

  // Undo takes the whole wall back, the start block included: nothing is left standing, every block is given back.
  t.clearMessages();
  t.cmd(sur, "/realm:build_undo");
  await t.waitMessage(sur, /Undone/, { kind: "actionbar" });
  await t.wait(10);
  const left = count("minecraft:cobblestone", 0, Y, 0, 0, Y + 2, 8);
  t.check(left === 0, `nothing of the wall is left after undo, the start block included (${left} left)`);
  const back = items(sur, "minecraft:cobblestone");
  // 40, or 41 when the simulated player's placement didn't use up the start block it placed.
  t.check(back === 40 || back === 41, `all 40 cobblestone are back (${back})`);
}
