// Easy Building (build_bp) with Land Claims: shapes from the menus, /realm:build_here, build mode
// (placing a block builds the shape), survival costs and partial builds, undo/redo refunds, two-block
// mode, mirror copies, a claim that refuses a build, and v2: modifiers (mirror, radial, array), palette
// patterns, ellipse and curve block counts, Air Build, the Building Book and modifiers on hand placing/breaking.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp,claims_bp --scenario tools/test-bds/examples/build.js
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
  await shape(cre, 14, { Radius: 3, Hollow: true, Size: 0 }); // sphere
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
  for (let i = 0; i < 26; i++) {
    if (i === 19 || i === 20) continue; // the curves are built through points (below)
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
  const ladder = dim.getBlock({ x: spot(22).x, y: Y + 1, z: spot(22).z + 4 });
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

  // ===================== v2 =====================
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "t2", pack: "claims_bp", key: "enabled", value: false }));
  t.server("/tickingarea remove_all"); // Bedrock allows 10 ticking areas; the ones above are done with
  await t.wait(2);
  await t.loadArea(600, 0, { radius: 4 });
  const v2 = await t.player("Vee", { x: 600, z: 0, gameMode: "creative", op: true });
  /** Saves a form reached from a /realm:build button. */
  const viaMenu = async (p, button, answers, done = /Saved|Modifiers:|Palette:/) => {
    t.answerForm(p, button, answers);
    t.cmd(p, "/realm:build");
    return t.waitMessage(p, done, { pack: "build_bp" });
  };
  hold(v2, "minecraft:stone", 64);

  // ---- Modifiers: a 3-high column 6 blocks east of a center, mirrored on X; radial 4; array ----
  await shape(v2, 4, { Height: 3, "Column width": 1, "Base and top": false });
  t.cmd(v2, "/realm:build_mode"); // build mode off again (choosing a shape turned it on)
  const C = await aim(v2, 600, 0); // looks at the marker at (600, Y, 4)
  await viaMenu(v2, "Modifiers", { Center: 1, "Mirror X": true });
  const center = { x: 600, y: Y, z: 4 };
  T = await aim(v2, 606, 0);
  t.log("modifier center", JSON.stringify(center), "target", JSON.stringify(T), "C", JSON.stringify(C));
  t.cmd(v2, "/realm:build_here");
  let m = await t.waitMessage(v2, /Built \d+ blocks|Nothing/, { kind: "actionbar" });
  t.check(/Built 6 blocks/.test(m.plain), `mirror X: column and its mirror = 6 (${m.plain})`);
  t.check(count("minecraft:stone", 2 * center.x - T.x, T.y, T.z, 2 * center.x - T.x, T.y + 2, T.z) === 3, "the mirrored column is at x = 2 * center - x");
  t.cmd(v2, "/realm:build_undo");
  await t.waitMessage(v2, /Undone/, { kind: "actionbar" });
  await viaMenu(v2, "Modifiers", { "Mirror X": false, "Radial: turned": true, "Radial slices": 4 });
  t.cmd(v2, "/realm:build_here");
  m = await t.waitMessage(v2, /Built \d+ blocks|Nothing/, { kind: "actionbar" });
  t.check(/Built 12 blocks/.test(m.plain), `radial 4: four columns = 12 (${m.plain})`);
  // A quarter turn around the center block takes (dx, dz) to (-dz, dx).
  const qx = center.x - (T.z - center.z), qz = center.z + (T.x - center.x);
  t.check(count("minecraft:stone", qx, T.y, qz, qx, T.y + 2, qz) === 3, `radial: a column a quarter turn around at ${qx} ${qz}`);
  t.cmd(v2, "/realm:build_undo");
  await t.waitMessage(v2, /Undone/, { kind: "actionbar" });
  await viaMenu(v2, "Modifiers", { "Radial: turned": false, "Array: repeat": true, "Array step X": 0, "Array step Y": 0, "Array step Z": 3, "Array copies": 2 });
  t.cmd(v2, "/realm:build_here");
  m = await t.waitMessage(v2, /Built \d+ blocks|Nothing/, { kind: "actionbar" });
  t.check(/Built 9 blocks/.test(m.plain), `array 2 copies 3 apart: 9 blocks (${m.plain})`);
  t.check(count("minecraft:stone", T.x, T.y, T.z + 6, T.x, T.y + 2, T.z + 6) === 3, "array: the second copy is 6 blocks south");
  // Stairs turn with a mirror: built facing south, a stair's mirror across Z faces north.
  await viaMenu(v2, "Modifiers", { "Array: repeat": false, "Mirror Z": true });
  hold(v2, "minecraft:oak_stairs", 64);
  await shape(v2, 7, { Width: 1, Height: 2, "Fill underneath": false, Size: 0 }); // staircase
  t.cmd(v2, "/realm:build_mode");
  T = await aim(v2, 620, 0);
  t.cmd(v2, "/realm:build_here");
  m = await t.waitMessage(v2, /Built \d+ blocks|Nothing/, { kind: "actionbar" });
  const mirrored = dim.getBlock({ x: T.x, y: T.y, z: 2 * center.z - T.z });
  t.log("mirrored stair:", m.plain, mirrored?.typeId, JSON.stringify(mirrored?.permutation.getAllStates()));
  t.check(mirrored?.typeId === "minecraft:oak_stairs" && mirrored.permutation.getState("weirdo_direction") === 3, "a stair mirrored on Z rises north (weirdo_direction 3)");
  await viaMenu(v2, "Modifiers", { "Mirror Z": false, Center: 3 });

  // ---- Palette: checkerboard and gradient over a wall of stone and oak planks ----
  const inv = v2.getComponent("inventory").container;
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:stone", 64));
  inv.setItem(1, new ItemStack("minecraft:oak_planks", 64));
  v2.selectedSlotIndex = 0;
  await viaMenu(v2, "Palette", { "Build with the palette": true, Pattern: 4, "Pattern size": 1 });
  await shape(v2, 1, { Width: 4, Height: 2, Thickness: 1, Pattern: 0, Size: 0 });
  t.cmd(v2, "/realm:build_mode");
  T = await aim(v2, 640, 0);
  t.cmd(v2, "/realm:build_here");
  m = await t.waitMessage(v2, /Built \d+ blocks|Nothing/, { kind: "actionbar" });
  const box = [T.x - 2, T.y, T.z, T.x + 2, T.y + 1, T.z];
  const stn = count("minecraft:stone", ...box), pln = count("minecraft:oak_planks", ...box);
  t.check(stn === 4 && pln === 4, `checkerboard: 4 stone and 4 planks (${stn}, ${pln})`);
  await viaMenu(v2, "Palette", { Pattern: 6, Direction: 0 });
  await shape(v2, 1, { Width: 5, Height: 4, Thickness: 1, Size: 0 });
  t.cmd(v2, "/realm:build_mode");
  T = await aim(v2, 660, 0);
  t.cmd(v2, "/realm:build_here");
  m = await t.waitMessage(v2, /Built \d+ blocks|Nothing/, { kind: "actionbar" });
  t.check(count("minecraft:stone", T.x - 2, T.y, T.z, T.x + 2, T.y + 1, T.z) === 10 && count("minecraft:oak_planks", T.x - 2, T.y + 2, T.z, T.x + 2, T.y + 3, T.z) === 10, "gradient up: stone below, planks above");
  await t.loadArea(740, 0, { radius: 4 });
  for (const pat of [1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13]) {
    await viaMenu(v2, "Palette", { Pattern: pat, "Pattern size": 2 });
    T = await aim(v2, 680 + pat * 8, 0);
    t.cmd(v2, "/realm:build_here");
    m = await t.waitMessage(v2, /Built \d+ blocks|Nothing/, { kind: "actionbar" });
    t.check(/Built 20 blocks/.test(m.plain), `palette pattern ${pat} builds the 5 x 4 wall (${m.plain})`);
  }
  await viaMenu(v2, "Palette", { "Build with the palette": false, Pattern: 0 });

  // ---- Ellipse, semicircle and a leaning cone: block counts ----
  hold(v2, "minecraft:stone", 64);
  const counts = [
    [11, { "Radius left to right": 6, "Radius away from you": 3, Thickness: 1, Filled: false, Size: 0 }, 28, "ellipse 6 x 3 ring"],
    [11, { "Radius left to right": 6, "Radius away from you": 3, Filled: true, Size: 0 }, 75, "filled ellipse 6 x 3"],
    [12, { Radius: 4, Thickness: 1, Filled: false }, 13, "semicircle radius 4"],
    [17, { Radius: 3, Height: 6, Hollow: false, Points: 2, Size: 0 }, 98, "cone lying down"],
    [17, { Radius: 3, Height: 6, Hollow: false, Points: 1, Size: 0 }, 98, "leaning cone"],
  ];
  await t.loadArea(640, 40, { radius: 4 });
  for (const [i, [idx, answers, want, label]] of counts.entries()) {
    await shape(v2, idx, answers);
    t.cmd(v2, "/realm:build_mode");
    T = await aim(v2, 600 + i * 20, 40);
    dim.setBlockType({ x: 600 + i * 20, y: Y, z: 44 }, "minecraft:air"); // the marker would take a spot of the filled shapes
    t.cmd(v2, "/realm:build_here");
    m = await t.waitMessage(v2, /Built \d+ blocks|Nothing/, { kind: "actionbar" });
    t.check(new RegExp(`Built ${want} blocks`).test(m.plain), `${label}: ${want} blocks (${m.plain})`);
  }

  // ---- Curved line through three points: 25 blocks; curved wall 3 high: 75 ----
  await t.loadArea(730, 85, { radius: 3 });
  for (const [idx, answers, want] of [[19, { Thickness: 1 }, 25], [20, { Kind: 0, Height: 3 }, 75]]) {
    await shape(v2, idx, answers);
    const base = idx === 19 ? 700 : 740;
    for (const [dx, dz] of [[0, 0], [8, 4], [16, 0]]) {
      await aim(v2, base + dx, 80 + dz);
      t.cmd(v2, "/realm:build_here");
      await t.waitMessage(v2, /Point \d+ set/, { kind: "actionbar" });
    }
    t.cmd(v2, "/realm:build_finish");
    m = await t.waitMessage(v2, /Built \d+ blocks|Nothing|curve/, { pack: "build_bp" });
    t.log("curve:", m.plain);
    t.check(new RegExp(`Built ${want} blocks`).test(m.plain), `curve ${idx}: ${want} blocks (${m.plain})`);
  }

  // ---- Air Build: one block in midair, then a whole shape ----
  hold(v2, "minecraft:glass", 64);
  await shape(v2, 4, { Height: 3, "Column width": 1, "Base and top": false });
  t.cmd(v2, "/realm:build_mode"); // off: one block at a time
  await viaMenu(v2, "Guides, reach and Air Build", { "Air Build:": true, "Air Build distance": 4 }, /Saved/);
  await t.loadArea(805, 0, { radius: 2 });
  dim.setBlockType({ x: 800, y: Y + 9, z: 0 }, "minecraft:stone");
  dim.setBlockType({ x: 810, y: Y + 9, z: 0 }, "minecraft:stone");
  v2.teleport({ x: 800.5, y: Y + 10, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.waitUntil(() => dim.getBlock({ x: 800, y: Y, z: 8 }), { timeout: 200, message: "air area loads" });
  await t.wait(5);
  const head = v2.getHeadLocation(), view = v2.getViewDirection();
  const A1 = { x: Math.floor(head.x + view.x * 4), y: Math.floor(head.y + view.y * 4), z: Math.floor(head.z + view.z * 4) };
  v2.useItemInSlot(0);
  m = await t.waitMessage(v2, /Built \d+ block|Nothing|Look/, { pack: "build_bp" });
  t.log("air:", m.plain, JSON.stringify(A1));
  t.check(dim.getBlock(A1)?.typeId === "minecraft:glass", "Air Build puts one glass block 4 blocks in front, in midair");
  t.cmd(v2, "/realm:build_mode"); // on: the column
  await t.wait(10);
  v2.teleport({ x: 810.5, y: Y + 10, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(5);
  v2.useItemInSlot(0);
  m = await t.waitMessage(v2, /Built \d+ block|Nothing/, { pack: "build_bp" });
  t.check(/Built 3 blocks/.test(m.plain), `Air Build in build mode builds the column in midair (${m.plain})`);
  t.cmd(v2, "/realm:build_mode");

  // ---- The Building Book: /realm:build_book, use opens the menu, sneak-use toggles build mode ----
  const bk = await t.player("Book", { x: 805, z: 0, gameMode: "creative" });
  bk.getComponent("inventory").container.clearAll();
  bk.selectedSlotIndex = 0;
  t.cmd(bk, "/realm:build_book");
  await t.waitMessage(bk, /Building Book/, { pack: "build_bp" });
  t.check(items(bk, "realm:building_book") === 1, "/realm:build_book gives one Building Book");
  const menu = t.waitForm(bk, { timeout: 100 });
  bk.useItemInSlot(0);
  const bookForm = await menu;
  t.check(bookForm.title === "Easy Building", `using the book opens Easy Building (${bookForm.title})`);
  bookForm.answer(null);
  await t.wait(12);
  bk.stopUsingItem();
  bk.isSneaking = true;
  bk.useItemInSlot(0);
  m = await t.waitMessage(bk, /Build mode/, { kind: "actionbar" });
  t.check(/Build mode on/.test(m.plain), `sneak-using the book turns build mode on (${m.plain})`);
  bk.isSneaking = false;

  // ---- Modifiers on hand placing and breaking (survival pays for the copy) ----
  await t.loadArea(900, 0, { radius: 2 });
  const hp = await t.player("Hand", { x: 900, z: 0, gameMode: "survival" });
  hold(hp, "minecraft:oak_planks", 10);
  await viaMenu(hp, "Guides, reach and Air Build", { "Modifiers copy": true }, /Saved/);
  hp.teleport({ x: 900.5, y: Y, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(5);
  await viaMenu(hp, "Modifiers", { Center: 2, "Mirror X": true });
  hp.useItemInSlotOnBlock(0, { x: 903, y: Y - 1, z: 2 }, t.mc.Direction.Up);
  await t.waitUntil(() => dim.getBlock({ x: 897, y: Y, z: 2 })?.typeId === "minecraft:oak_planks", { timeout: 60, message: "the mirrored plank appears" });
  t.check(dim.getBlock({ x: 903, y: Y, z: 2 })?.typeId === "minecraft:oak_planks", "the hand-placed plank stays");
  t.check(items(hp, "minecraft:oak_planks") === 8, `one plank placed by hand plus one copy paid: 8 left (${items(hp, "minecraft:oak_planks")})`);
  t.cmd(hp, "/realm:build_undo"); // takes back only the copy
  await t.waitMessage(hp, /Undone/, { kind: "actionbar" });
  t.check(dim.getBlock({ x: 897, y: Y, z: 2 })?.typeId === "minecraft:air" && items(hp, "minecraft:oak_planks") === 9, "undo takes the copy back and refunds it");
  dim.setBlockType({ x: 897, y: Y, z: 2 }, "minecraft:oak_planks");
  hp.breakBlock({ x: 903, y: Y, z: 2 });
  await t.waitUntil(() => dim.getBlock({ x: 897, y: Y, z: 2 })?.typeId === "minecraft:air", { timeout: 300, message: "breaking by hand breaks the mirrored copy" });
  t.log("hand break: the copy at 897 is gone");
}
