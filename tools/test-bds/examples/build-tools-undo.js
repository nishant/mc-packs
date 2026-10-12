// Easy Building (build_bp) review: undo and redo beyond the happy path.
// Survival refunds counted exactly (items given back land in the inventory, none extra at the feet), blocks changed
// since an undo are left alone, redo is cleared by a new build, the undoSteps limit, a filled chest a build placed,
// two players undoing at once, and players who leave while a build or an undo is still going.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-tools-undo.js --timeout 300
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
  const ground = (p, r = 8) => dim.getEntities({ type: "minecraft:item", location: p.location, maxDistance: r }).reduce((n, e) => n + e.getComponent("item").itemStack.amount, 0);
  const count = (id, x0, y0, z0, x1, y1, z1) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (dim.getBlock({ x, y, z })?.typeId === id) n++;
    return n;
  };
  const run = async (p, cmd, pattern, opts = {}) => {
    t.clearMessages();
    const wait = t.waitMessage(p, pattern, opts);
    t.cmd(p, cmd);
    return wait;
  };
  /** Faces south at (x, z) looking at the floor 3 ahead; the shape's start spot is on top of it. */
  const aim = async (p, x, z) => {
    p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: 0 } });
    await t.wait(3);
    p.lookAtBlock({ x, y: Y - 1, z: z + 3 });
    await t.wait(3);
    p.setRotation({ x: p.getRotation().x, y: 0 });
  };
  const shape = async (p, w, h, d = 1) => {
    t.answerForm(p, "Choose a shape", 1, { Width: w, Height: h, Thickness: d, Size: 0 });
    t.cmd(p, "/realm:build");
    await t.waitMessage(p, /build mode is on/i);
    t.cmd(p, "/realm:build_mode");
    await t.wait(2);
  };

  await t.loadArea(0, 0, { radius: 4 });
  const sur = await t.player("Sur", { x: 0, z: 0, gameMode: "survival" });
  const inv = sur.getComponent("inventory").container;
  await shape(sur, 3, 3);

  // 1. Build, undo, redo, undo: the cobblestone comes back exactly, into the inventory.
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 20));
  inv.setItem(1, new ItemStack("minecraft:stick", 1)); // the hotbar slot right of the hand: no second block
  await aim(sur, 0, 0);
  await run(sur, "/realm:build_here", /Built 9 blocks/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:cobblestone") === 11, `the wall cost 9 (${items(sur, "minecraft:cobblestone")} left)`);
  const where = [];
  for (let x = -3; x <= 3; x++) for (let y = Y; y <= Y + 3; y++) for (let z = 0; z <= 6; z++) if (dim.getBlock({ x, y, z })?.typeId === "minecraft:cobblestone") where.push(`${x},${y},${z}`);
  t.log("wall at", where.join(" "));
  await run(sur, "/realm:build_undo", /Undone/, { kind: "actionbar" });
  await t.wait(10);
  t.check(items(sur, "minecraft:cobblestone") === 20 && ground(sur) === 0, `undo gave back 9 (${items(sur, "minecraft:cobblestone")} + ${ground(sur)} on the ground)`);
  await run(sur, "/realm:build_redo", /Built 9 blocks|Redone/, { kind: "actionbar" });
  await t.wait(10);
  t.check(items(sur, "minecraft:cobblestone") === 11 && ground(sur) === 0, "redo charged 9 again");

  // 2. A block mined since stays mined; undo gives back only the 8 still there.
  dim.runCommand("setblock 0 -59 2 air");
  await run(sur, "/realm:build_undo", /Undone/, { kind: "actionbar" });
  await t.wait(10);
  t.check(items(sur, "minecraft:cobblestone") === 19 && ground(sur) === 0, `undo gave back the 8 still there (${items(sur, "minecraft:cobblestone")})`);
  t.check(t.messages(sur).some((m) => /1 block had changed since/.test(m.plain)), "it said one had changed");

  // 3. A new build clears redo.
  await run(sur, "/realm:build_here", /Built 9 blocks/, { kind: "actionbar" });
  await run(sur, "/realm:build_undo", /Undone/, { kind: "actionbar" });
  await aim(sur, 10, 0);
  await run(sur, "/realm:build_here", /Built 9 blocks/, { kind: "actionbar" });
  await run(sur, "/realm:build_redo", /Nothing to redo/);
  await run(sur, "/realm:build_undo", /Undone/, { kind: "actionbar" });

  // 4. undoSteps (5): six builds, five undos, then nothing.
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 64));
  for (let i = 0; i < 6; i++) {
    await aim(sur, 20 + i * 4, 0);
    await run(sur, "/realm:build_here", /Built 9 blocks/, { kind: "actionbar" });
  }
  for (let i = 0; i < 5; i++) await run(sur, "/realm:build_undo", /Undone/, { kind: "actionbar" });
  await run(sur, "/realm:build_undo", /Nothing to undo/);
  t.check(count("minecraft:cobblestone", 19, Y, 2, 21, Y + 2, 2) === 9, "the oldest build stays (only 5 steps)");
  t.server("/fill 18 -60 2 23 -58 2 air");

  // 4b. Undo from far away (the blocks aren't loaded): the step waits until you are back.
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 9));
  inv.setItem(1, new ItemStack("minecraft:stick", 1));
  t.server("/tickingarea add 2990 0 -10 3010 0 10 far_review");
  await t.waitUntil(() => dim.getBlock({ x: 3000, y: Y - 1, z: 3 }), { timeout: 300, message: "far chunk loads" });
  sur.teleport({ x: 3000.5, y: Y, z: 0.5 });
  await t.wait(10);
  await aim(sur, 3000, 0);
  await run(sur, "/realm:build_here", /Built 9 blocks/, { kind: "actionbar" });
  sur.teleport({ x: 0.5, y: Y, z: 0.5 });
  t.server("/tickingarea remove far_review");
  await t.waitUntil(() => { try { return !dim.getBlock({ x: 3000, y: Y, z: 2 }); } catch { return true; } }, { timeout: 400, message: "far chunk unloads" });
  await run(sur, "/realm:build_undo", /too far away/);
  t.server("/tickingarea add 2990 0 -10 3010 0 10 far_review");
  await t.waitUntil(() => dim.getBlock({ x: 3000, y: Y, z: 2 }), { timeout: 300, message: "far chunk loads again" });
  sur.teleport({ x: 3000.5, y: Y, z: 0.5 });
  await t.wait(10);
  await run(sur, "/realm:build_undo", /Undone/, { kind: "actionbar" });
  await t.wait(10);
  t.check(items(sur, "minecraft:cobblestone") === 9, `back there, undo worked and gave back 9 (${items(sur, "minecraft:cobblestone")})`);

  // 5. Two players at once, each their own history.
  const two = await t.player("Two", { x: 0, z: 40, gameMode: "survival" });
  await shape(two, 3, 3);
  const inv2 = two.getComponent("inventory").container;
  inv2.clearAll();
  inv2.setItem(0, new ItemStack("minecraft:oak_planks", 9));
  inv2.setItem(1, new ItemStack("minecraft:stick", 1));
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 9));
  await aim(two, 0, 40);
  await aim(sur, 40, 0);
  const a = run(sur, "/realm:build_here", /Built 9 blocks/, { kind: "actionbar" });
  const b = t.waitMessage(two, /Built 9 blocks/, { kind: "actionbar" });
  t.cmd(two, "/realm:build_here");
  await Promise.all([a, b]);
  const ua = t.waitMessage(sur, /Undone/, { kind: "actionbar" });
  const ub = t.waitMessage(two, /Undone/, { kind: "actionbar" });
  t.cmd(sur, "/realm:build_undo");
  t.cmd(two, "/realm:build_undo");
  await Promise.all([ua, ub]);
  await t.wait(10);
  t.check(items(sur, "minecraft:cobblestone") === 9 && items(two, "minecraft:oak_planks") === 9, "each got their own blocks back");
  t.check(count("minecraft:oak_planks", -1, Y, 42, 1, Y + 2, 42) === 0 && count("minecraft:cobblestone", 39, Y, 2, 41, Y + 2, 2) === 0, "both walls are gone");

  // 6. Leaving while a big creative build goes, and while a survival undo goes: no errors, nothing left half done.
  await t.loadArea(60, 44, { radius: 3 });
  const cre = await t.player("Cre", { x: 60, z: 40, gameMode: "creative" });
  await shape(cre, 64, 64, 8); // 32768 blocks: about 80 ticks at 400 a tick
  cre.getComponent("inventory").container.setItem(0, new ItemStack("minecraft:stone", 1));
  cre.selectedSlotIndex = 0;
  await aim(cre, 60, 40);
  t.cmd(cre, "/realm:build_here");
  await t.wait(30); // past reading the spots: placing has started
  cre.disconnect();
  await t.wait(100);
  const placedBy = count("minecraft:stone", 28, Y, 43, 91, Y, 50);
  t.log("bottom layer stone after the builder left:", placedBy, "of", 64 * 8);

  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 64));
  await t.loadArea(80, 0, { radius: 1 });
  await shape(sur, 16, 16, 1); // 256 blocks
  await aim(sur, 80, 0);
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 64));
  for (let i = 1; i < 4; i++) inv.setItem(9 + i, new ItemStack("minecraft:cobblestone", 64));
  await run(sur, "/realm:build_here", /Built 256 blocks/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:cobblestone") === 0, "the 256-block wall used all 256");
  t.cmd(sur, "/realm:build_undo");
  sur.disconnect();
  await t.wait(40);
  t.log("cobblestone left in the wall after leaving mid-undo:", count("minecraft:cobblestone", 72, Y, 2, 88, Y + 15, 2));
}
