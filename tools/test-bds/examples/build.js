// Easy Building (build_bp) with Land Claims: shapes from the menus, /realm:build_here, build mode
// (placing a block builds the shape), survival costs and partial builds, undo/redo refunds, two-block
// mode, mirror copies and a claim that refuses a build.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp,claims_bp --scenario tools/test-bds/examples/build.js
export default async function (t) {
  const { ItemStack, BlockPermutation } = t.mc;
  const dim = t.dimension;
  const Y = -60; // first air layer of the flat world

  /** Counts blocks of a type in a box. */
  const count = (id, x0, y0, z0, x1, y1, z1) => {
    let n = 0;
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) if (dim.getBlock({ x, y, z })?.typeId === id) n++;
    return n;
  };
  const items = (p, id) => {
    const c = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it?.typeId === id) n += it.amount;
    }
    return n;
  };
  const hold = (p, id, n) => {
    const c = p.getComponent("inventory").container;
    c.clearAll();
    c.setItem(0, new ItemStack(id, n));
    p.selectedSlotIndex = 0;
  };
  /** Stands the player at x, z facing south, looking at a marker block 4 ahead; returns the build spot. */
  const aim = async (p, x, z) => {
    p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: 0 } });
    await t.waitUntil(() => dim.getBlock({ x, y: Y, z: z + 4 }) && dim.getBlock({ x: x + 8, y: Y, z: z + 12 }), { timeout: 200, message: "chunks load" });
    dim.setBlockType({ x, y: Y, z: z + 4 }, "minecraft:bedrock");
    await t.wait(2);
    p.lookAtBlock({ x, y: Y, z: z + 4 });
    await t.wait(4);
    const hit = p.getBlockFromViewDirection({ maxDistance: 16 });
    t.assert(hit, "the player looks at the marker");
    const n = { Up: [0, 1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0], Down: [0, -1, 0] }[hit.face];
    return { x: hit.block.location.x + n[0], y: hit.block.location.y + n[1], z: hit.block.location.z + n[2] };
  };
  /** Picks a shape in /realm:build and answers its settings form. */
  const shape = async (p, index, answers) => {
    t.answerForm(p, "Choose a shape", index, answers);
    t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
    await t.waitMessage(p, /build mode is on|place the start block/i, { pack: "build_bp" });
  };

  // ---- Creative: a 5 x 3 wall at the look target, undo, redo ----
  await t.loadArea(0, 0, { radius: 3 });
  const cre = await t.player("Cre", { x: 0, z: 0, gameMode: "creative", op: true });
  hold(cre, "minecraft:stone_bricks", 64);
  await shape(cre, 1, { Width: 5, Height: 3, Thickness: 1, Size: 0 });
  let T = await aim(cre, 0, 0);
  t.log("wall target", JSON.stringify(T));
  t.assert(t.cmd(cre, "/realm:build_here").ok, "build_here ran");
  await t.waitMessage(cre, /Built 15 blocks/, { kind: "actionbar" });
  // Facing south, right is west: the wall runs x - 2 .. x + 2 across z.
  t.check(count("minecraft:stone_bricks", T.x - 2, T.y, T.z, T.x + 2, T.y + 2, T.z) === 15, "wall: 15 stone bricks");
  t.assert(t.cmd(cre, "/realm:build_undo").ok, "undo ran");
  await t.waitMessage(cre, /Undone/, { kind: "actionbar" });
  t.check(count("minecraft:stone_bricks", T.x - 2, T.y, T.z, T.x + 2, T.y + 2, T.z) === 0, "undo: wall gone");
  t.cmd(cre, "/realm:build_redo");
  await t.waitMessage(cre, /Built 15 blocks/, { kind: "actionbar" });
  t.check(count("minecraft:stone_bricks", T.x - 2, T.y, T.z, T.x + 2, T.y + 2, T.z) === 15, "redo: wall back");
  t.check(items(cre, "minecraft:stone_bricks") === 64, "creative builds are free");

  // ---- Creative: hollow glass sphere (typed block), mirrored tower copies ----
  t.answerForm(cre, "Blocks and placing", { "Main block": 2, "Main block id": "minecraft:glass" });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Saved/, { pack: "build_bp" });
  await shape(cre, 12, { Radius: 3, Hollow: true, Size: 0 }); // sphere
  T = await aim(cre, 30, 0);
  t.cmd(cre, "/realm:build_here");
  const sphereMsg = await t.waitMessage(cre, /Built \d+ blocks/, { kind: "actionbar" });
  const glass = count("minecraft:glass", T.x - 3, T.y, T.z, T.x + 3, T.y + 6, T.z + 6);
  t.log("sphere:", sphereMsg.plain, "glass in box:", glass);
  t.check(glass > 80 && glass < 200, `sphere r3 has a sensible block count (${glass})`);
  t.check(dim.getBlock({ x: T.x, y: T.y + 3, z: T.z + 3 })?.typeId === "minecraft:air", "sphere is hollow");

  // ---- Two-block mode: a line from one spot to another ----
  t.answerForm(cre, "Blocks and placing", { "Main block": 2, "Main block id": "minecraft:oak_planks" });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Saved/, { pack: "build_bp" });
  await shape(cre, 0, { Size: 1 }); // line, from two blocks
  T = await aim(cre, 60, 0);
  t.cmd(cre, "/realm:build_here");
  await t.waitMessage(cre, /Start set/, { kind: "actionbar" });
  cre.teleport({ x: 60.5, y: Y, z: -9.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(2);
  const T2 = await aim(cre, 66, 0);
  t.cmd(cre, "/realm:build_here");
  const lineMsg = await t.waitMessage(cre, /Built \d+ blocks/, { kind: "actionbar" });
  t.log("line", JSON.stringify(T), "->", JSON.stringify(T2), lineMsg.plain);
  t.check(/Built 7 blocks/.test(lineMsg.plain), "line between two spots 6 apart is 7 blocks");

  // ---- Every shape with its default settings, holding oak stairs (stairs, roofs and pyramids use them) ----
  hold(cre, "minecraft:oak_stairs", 64);
  cre.getComponent("inventory").container.setItem(1, new ItemStack("minecraft:spruce_log", 64));
  t.answerForm(cre, "Blocks and placing", { "Main block": 0, "Second block (patterns": 0 });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Saved/, { pack: "build_bp" });
  await t.loadArea(400, 0, { radius: 4 });
  const spot = (/** @type {number} */ i) => ({ x: 360 + (i % 6) * 16, z: -40 + Math.floor(i / 6) * 24 });
  const sizes = [];
  for (let i = 0; i < 22; i++) {
    t.answerForm(cre, "Choose a shape", i, (form) => (form.elements?.some((e) => e.label === "Size") ? { Size: 0 } : true));
    t.cmd(cre, "/realm:build");
    await t.waitMessage(cre, /build mode is on|place the start block/i, { pack: "build_bp" });
    T = await aim(cre, spot(i).x, spot(i).z);
    t.cmd(cre, "/realm:build_here");
    const m = await t.waitMessage(cre, /Built \d+ blocks|Nothing|Start set/i, { pack: "build_bp" });
    sizes.push(`${i}:${(/Built (\d+)/.exec(m.plain) ?? [, m.plain])[1]}`);
    t.check(/Built \d+ blocks/.test(m.plain), `shape ${i} builds (${m.plain})`);
  }
  t.log("shape sizes:", sizes.join(" "));
  // Stairs face the way they climb: a staircase built facing south rises south (weirdo_direction 2).
  const st = dim.getBlock({ x: spot(7).x, y: Y, z: spot(7).z + 3 });
  t.log("staircase first step:", st?.typeId, JSON.stringify(st?.permutation.getAllStates()));
  t.check(st?.permutation.getState("weirdo_direction") === 2, "staircase steps rise away from the player");
  const ladder = dim.getBlock({ x: spot(18).x, y: Y + 1, z: spot(18).z + 4 });
  t.log("tower ladder:", ladder?.typeId, JSON.stringify(ladder?.permutation.getAllStates()));
  t.check(ladder?.typeId === "minecraft:ladder" && ladder.permutation.getState("facing_direction") === 2, "the tower's ladder faces the player (north)");

  // ---- Build here now: outline, then a confirm with the cost; mirror both ways and repeats ----
  t.answerForm(cre, "Blocks and placing", { Copies: 3, "Repeat in a row": 3, "Gap between repeats": 2 });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Saved/, { pack: "build_bp" });
  await shape(cre, 4, { Height: 3, "Column width": 1, "Base and top": false });
  T = await aim(cre, 400, 60);
  const confirm = t.waitForm(cre, { timeout: 300 });
  t.answerForm(cre, "Build here now");
  t.cmd(cre, "/realm:build");
  const f = await confirm;
  const f2 = f.type === "message" ? f : await t.waitForm(cre, { timeout: 300 });
  t.log("confirm:", f2.body.replace(/\n/g, " | "));
  f2.answer(0);
  const mm = await t.waitMessage(cre, /Built \d+ blocks/, { kind: "actionbar" });
  // Columns at 0, 3 and 6 blocks away, mirrored front-back too: 5 columns of 3 (the left-right mirror overlaps).
  t.check(/Built 15 blocks/.test(mm.plain), `3 columns of 3 mirrored both ways = 15 blocks (${mm.plain})`);
  t.answerForm(cre, "Blocks and placing", { Copies: 0, "Repeat in a row": 1 });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Saved/, { pack: "build_bp" });

  // ---- Survival: costs, partial build, refunds, build mode by placing a block ----
  await t.loadArea(100, 0, { radius: 3 });
  const sur = await t.player("Sur", { x: 100, z: 0, gameMode: "survival" });
  hold(sur, "minecraft:cobblestone", 10);
  await shape(sur, 1, { Width: 5, Height: 3, Thickness: 1, Size: 0 });
  T = await aim(sur, 100, 0);
  t.cmd(sur, "/realm:build_here");
  await t.waitMessage(sur, /Out of blocks: built 10 of 15/, { pack: "build_bp" });
  t.check(items(sur, "minecraft:cobblestone") === 0, "survival: 10 cobblestone used");
  t.check(count("minecraft:cobblestone", T.x - 2, T.y, T.z, T.x + 2, T.y + 2, T.z) === 10, "survival: partial wall of 10");
  t.cmd(sur, "/realm:build_undo");
  await t.waitMessage(sur, /Undone/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:cobblestone") === 10, "undo gives the 10 cobblestone back");

  // Build mode: placing one oak plank builds the whole wall from the inventory.
  hold(sur, "minecraft:oak_planks", 20);
  T = await aim(sur, 120, 0);
  const ground = dim.getBlock({ x: T.x, y: T.y - 1, z: T.z });
  sur.useItemInSlotOnBlock(0, { x: 120, y: Y - 1, z: 3 }, t.mc.Direction.Up);
  const placedMsg = await t.waitMessage(sur, /Built \d+ blocks/, { kind: "actionbar" });
  t.log("placed:", placedMsg.plain, "ground", ground?.typeId);
  t.check(/Built 15 blocks/.test(placedMsg.plain), "placing a block builds the 15-block wall");
  t.check(items(sur, "minecraft:oak_planks") === 5, `20 planks - 15 = 5 left (${items(sur, "minecraft:oak_planks")})`);

  // Two-block mode in survival: a diagonal wall 3 high from one look target to another.
  hold(sur, "minecraft:oak_planks", 64);
  await shape(sur, 1, { Width: 5, Height: 3, Thickness: 1, Size: 1 });
  const A = await aim(sur, 140, 0);
  t.cmd(sur, "/realm:build_here");
  await t.waitMessage(sur, /Start set/, { kind: "actionbar" });
  const B = await aim(sur, 144, 4);
  t.cmd(sur, "/realm:build_here");
  const diag = await t.waitMessage(sur, /Built \d+ blocks/, { kind: "actionbar" });
  t.log("diagonal wall", JSON.stringify(A), "->", JSON.stringify(B), diag.plain, "planks left", items(sur, "minecraft:oak_planks"));
  // (140, 3) to (144, 7), both at the same height, so 3 high from the settings: 5 columns of 3, less the marker in the way.
  const placedDiag = count("minecraft:oak_planks", 139, Y, 2, 145, Y + 2, 8);
  t.check(placedDiag >= 12 && items(sur, "minecraft:oak_planks") === 64 - placedDiag, `diagonal wall paid block for block (${placedDiag} placed)`);
  t.check(dim.getBlock({ x: 142, y: Y, z: 5 })?.typeId === "minecraft:oak_planks", "the wall runs diagonally");

  // ---- Land Claims: a build reaching into someone else's claim is refused ----
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "t1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(5);
  await t.loadArea(200, 0, { radius: 3 });
  const own = await t.player("Owner", { x: 200, z: 10 });
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  await t.wait(20);
  hold(cre, "minecraft:stone_bricks", 64);
  t.answerForm(cre, "Blocks and placing", { "Main block": 0 });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Saved/, { pack: "build_bp" });
  await shape(cre, 1, { Width: 5, Height: 3, Thickness: 1, Size: 0 });
  T = await aim(cre, 200, -8); // the wall goes at z -5, inside the claim (z -6 .. 26)
  t.cmd(cre, "/realm:build_here");
  const refused = await t.waitMessage(cre, /claim|Built/i, { pack: "build_bp" });
  t.log("claims:", refused.plain);
  t.check(/Owner's claim/.test(refused.plain), "a build in someone else's claim is refused");
  t.check(count("minecraft:stone_bricks", T.x - 2, T.y, T.z, T.x + 2, T.y + 2, T.z) === 0, "nothing built in the claim");
}
