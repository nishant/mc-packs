// Easy Building (build_bp) edge cases: two-block fences and same-height shapes, a forbidden block next to your
// hand, Air Build above the world, named items used last, special blocks placed in build mode (double slabs,
// candles, doors, snow, water), modifier copies of turned blocks (rails, torches, doors, trapdoors, logs, signs),
// curve limits, adventure mode, palettes from the inventory, safe zones, hand copies in claims, two builders at once.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp,claims_bp --scenario tools/test-bds/examples/build-edge.js
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const Y = -60;
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
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) n += c.getItem(i).amount;
    return n;
  };
  const hold = (p, id, n) => {
    const c = p.getComponent("inventory").container;
    c.clearAll();
    c.setItem(0, new ItemStack(id, n));
    p.selectedSlotIndex = 0;
  };
  const aim = async (p, x, z) => {
    p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: 0 } });
    await t.waitUntil(() => dim.getBlock({ x, y: Y, z: z + 4 }), { timeout: 200, message: "chunks load" });
    dim.setBlockType({ x, y: Y, z: z + 4 }, "minecraft:bedrock");
    await t.wait(2);
    p.lookAtBlock({ x, y: Y, z: z + 4 });
    await t.wait(4);
    return { x, y: Y, z: z + 3 };
  };
  const shape = async (p, index, answers) => {
    t.answerForm(p, "Choose a shape", index, answers);
    t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
    await t.waitMessage(p, /build mode is on|place the start block/i, { pack: "build_bp" });
  };
  const viaMenu = async (p, button, answers, done = /Saved|Modifiers:|Palette:|Not saved/) => {
    t.answerForm(p, button, answers);
    t.cmd(p, "/realm:build");
    return t.waitMessage(p, done, { pack: "build_bp" });
  };
  const result = /Built \d+ blocks?|That's|Nothing|Out of|Not enough|can't|claim|safe zone|don't work|Point \d+|Start set|outside/;
  const here = async (p) => {
    const since = t.tick;
    t.cmd(p, "/realm:build_here");
    return t.waitMessage(p, result, { pack: "build_bp", since, timeout: 300 });
  };
  const states = (b) => JSON.stringify(b?.permutation.getAllStates());

  await t.loadArea(0, 0, { radius: 3 });
  const cre = await t.player("Cre", { x: 0, z: 0, gameMode: "creative", op: true });

  // ---- Two-block fence at the same height: rails and posts, not just torches ----
  hold(cre, "minecraft:oak_fence", 64);
  t.cmd(cre, "/realm:build");
  t.answerForm(cre, "Blocks and placing", { "Second block (patterns": 1 });
  await t.waitMessage(cre, /Saved/, { pack: "build_bp" });
  await shape(cre, 5, { Width: 9, Height: 1, Size: 1 });
  await aim(cre, 0, 0);
  t.cmd(cre, "/realm:build_here");
  await t.waitMessage(cre, /Start set/, { pack: "build_bp" });
  await aim(cre, 6, 0);
  let m = await here(cre);
  const fence = count("minecraft:oak_fence", -1, Y, 0, 7, Y, 6);
  t.log("two-block fence:", m.plain, "fence blocks on the ground:", fence);
  t.check(fence >= 5, `a two-block fence at one height has its rails (${fence})`);

  // ---- Same-height box from two blocks keeps its height ----
  hold(cre, "minecraft:stone", 64);
  await shape(cre, 3, { Width: 5, Height: 4, Depth: 5, Size: 1 });
  await aim(cre, 20, 0);
  t.cmd(cre, "/realm:build_here");
  await t.waitMessage(cre, /Start set/, { pack: "build_bp" });
  await aim(cre, 24, 0);
  m = await here(cre);
  t.log("two-block box:", m.plain);
  t.check(count("minecraft:stone", 19, Y + 3, 0, 25, Y + 3, 6) > 0, "a same-height two-block box is as high as its setting (4)");

  // ---- A forbidden block right of your hand doesn't stop a build that needs no second block ----
  const inv = cre.getComponent("inventory").container;
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:stone", 64));
  inv.setItem(1, new ItemStack("minecraft:tnt", 4));
  cre.selectedSlotIndex = 0;
  await viaMenu(cre, "Blocks and placing", { "Second block (patterns": 0 });
  await shape(cre, 1, { Width: 3, Height: 2, Thickness: 1, Pattern: 0, Size: 0 });
  t.cmd(cre, "/realm:build_mode");
  await aim(cre, 40, 0);
  m = await here(cre);
  t.log("tnt next to the hand:", m.plain);
  t.check(/Built 6 blocks/.test(m.plain), `a plain wall builds with TNT in the next slot (${m.plain})`);

  // ---- Air Build above the top of the world says why nothing was built ----
  hold(cre, "minecraft:glass", 64);
  await viaMenu(cre, "Guides, reach and Air Build", { "Air Build:": true, "Air Build distance": 8 }, /Saved/);
  await shape(cre, 4, { Height: 3, "Column width": 1, "Base and top": false });
  cre.teleport({ x: 0.5, y: 330, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(10);
  m = await here(cre);
  t.log("air build above the world:", m.plain);
  t.check(/above or below the world/.test(m.plain), `above the world says so (${m.plain})`);
  await viaMenu(cre, "Guides, reach and Air Build", { "Air Build:": false }, /Saved/);
  cre.teleport({ x: 0.5, y: Y, z: 0.5 });
  await t.wait(10);

  // ---- Survival: named and plain stacks of the same block: the plain ones go first ----
  await t.loadArea(100, 0, { radius: 2 });
  const sur = await t.player("Sur", { x: 100, z: 0, gameMode: "survival" });
  const sc = sur.getComponent("inventory").container;
  sc.clearAll();
  const named = new ItemStack("minecraft:stone_bricks", 10);
  named.nameTag = "Keepsake";
  sc.setItem(0, named);
  sc.setItem(9, new ItemStack("minecraft:stone_bricks", 10));
  sur.selectedSlotIndex = 0;
  await shape(sur, 1, { Width: 5, Height: 1, Thickness: 1, Size: 0 });
  await aim(sur, 100, 0);
  m = await here(sur);
  const keep = sc.getItem(0);
  t.log("named items:", m.plain, "slot 0:", keep?.typeId, keep?.amount, keep?.nameTag);
  t.check(keep?.nameTag === "Keepsake" && keep.amount === 10, "the named stack is used last");
  t.check(items(sur, "minecraft:stone_bricks") === 15, "5 stone bricks were used");

  // ---- Build mode by placing: double slab, second candle, door, water and tall grass ----
  t.cmd(sur, "/realm:build_mode"); // shape choice turned it on: off, then on again below
  await t.wait(2);
  t.cmd(sur, "/realm:build_mode");
  await t.wait(2);
  sc.clearAll();
  sc.setItem(0, new ItemStack("minecraft:oak_slab", 16));
  sc.setItem(9, new ItemStack("minecraft:oak_slab", 16));
  sur.selectedSlotIndex = 0;
  dim.setBlockType({ x: 110, y: Y, z: 3 }, "minecraft:oak_slab");
  sur.teleport({ x: 110.5, y: Y, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(4);
  sur.useItemInSlotOnBlock(0, { x: 110, y: Y, z: 3 }, t.mc.Direction.Up);
  await t.wait(10);
  const dbl = dim.getBlock({ x: 110, y: Y, z: 3 });
  t.log("slab on slab:", dbl?.typeId);
  t.check(/double_slab/.test(dbl?.typeId ?? "") && count("minecraft:oak_slab", 108, Y, 3, 112, Y, 3) === 0, "a slab made double places normally");

  // Candle on a cake: a candle cake, placed normally (not taken back with the cake).
  sc.setItem(0, new ItemStack("minecraft:candle", 4));
  dim.setBlockType({ x: 114, y: Y, z: 3 }, "minecraft:cake");
  sur.teleport({ x: 114.5, y: Y, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(4);
  sur.useItemInSlotOnBlock(0, { x: 114, y: Y, z: 3 }, t.mc.Direction.Up);
  await t.wait(10);
  const cc = dim.getBlock({ x: 114, y: Y, z: 3 });
  t.log("candle on cake:", cc?.typeId, "candles left", items(sur, "minecraft:candle"));
  t.check(cc?.typeId !== "minecraft:air", `the cake isn't taken away (${cc?.typeId})`);

  // A door places normally in build mode.
  sc.setItem(0, new ItemStack("minecraft:wooden_door", 1));
  sur.teleport({ x: 118.5, y: Y, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(4);
  sur.useItemInSlotOnBlock(0, { x: 118, y: Y - 1, z: 3 }, t.mc.Direction.Up);
  await t.wait(10);
  t.check(dim.getBlock({ x: 118, y: Y, z: 3 })?.typeId === "minecraft:wooden_door", "a door places normally in build mode");

  // A plank placed into water and one into tall grass build the wall there (5 x 1).
  sc.setItem(0, new ItemStack("minecraft:oak_planks", 20));
  dim.setBlockType({ x: 122, y: Y, z: 3 }, "minecraft:water");
  sur.teleport({ x: 122.5, y: Y, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(4);
  let since = t.tick;
  sur.useItemInSlotOnBlock(0, { x: 122, y: Y - 1, z: 3 }, t.mc.Direction.Up);
  m = await t.waitMessage(sur, result, { pack: "build_bp", since, timeout: 100 }).catch(() => undefined);
  t.log("plank into water:", m?.plain, count("minecraft:oak_planks", 120, Y, 3, 124, Y, 3));
  dim.setBlockType({ x: 130, y: Y, z: 3 }, "minecraft:short_grass");
  sur.teleport({ x: 130.5, y: Y, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(4);
  since = t.tick;
  sur.useItemInSlotOnBlock(0, { x: 130, y: Y, z: 3 }, t.mc.Direction.Up); // on the grass itself: it's replaced
  m = await t.waitMessage(sur, result, { pack: "build_bp", since, timeout: 100 }).catch(() => undefined);
  t.log("plank into grass:", m?.plain, count("minecraft:oak_planks", 128, Y, 3, 132, Y, 3), dim.getBlock({ x: 130, y: Y, z: 3 })?.typeId);
  if (dim.getBlock({ x: 130, y: Y, z: 3 })?.typeId === "minecraft:short_grass") t.log("(the simulated player can't place into short grass: not checked)");
  else t.check(count("minecraft:oak_planks", 128, Y, 3, 132, Y, 3) === 5, "placing into short grass builds the wall");
  t.log("planks left:", items(sur, "minecraft:oak_planks"));

  // ---- Adventure mode: refused ----
  sur.setGameMode(t.mc.GameMode.Adventure);
  hold(sur, "minecraft:stone", 10);
  await aim(sur, 140, 0);
  m = await here(sur);
  t.check(/don't work in adventure/.test(m.plain), `adventure: refused (${m.plain})`);
  sur.setGameMode(t.mc.GameMode.Survival);

  // ---- Modifier copies of turned blocks, placed by hand (creative, mirror X around x = 200) ----
  await t.loadArea(200, 0, { radius: 2 });
  const hm = await t.player("Hm", { x: 200, z: 0, gameMode: "creative", op: true });
  await viaMenu(hm, "Guides, reach and Air Build", { "Modifiers copy": true }, /Saved/);
  hm.teleport({ x: 200.5, y: Y, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(5);
  await viaMenu(hm, "Modifiers", { Center: 2, "Mirror X": true });
  const place = async (id, x, z, face = t.mc.Direction.Up, on) => {
    hold(hm, id, 4);
    hm.teleport({ x: x + 0.5, y: Y, z: z - 2.5 }, { rotation: { x: 30, y: 0 } });
    await t.wait(3);
    const tgt = on ?? { x, y: Y - 1, z };
    hm.useItemInSlotOnBlock(0, tgt, face);
    await t.wait(8);
  };
  const pair = (x, z, y = Y) => [dim.getBlock({ x, y, z }), dim.getBlock({ x: 400 - x, y, z })];
  // A wall torch on the east face of a block at 205: faces east; its mirror at 195 should face west.
  dim.setBlockType({ x: 205, y: Y, z: 4 }, "minecraft:stone");
  dim.setBlockType({ x: 195, y: Y, z: 4 }, "minecraft:stone");
  hold(hm, "minecraft:torch", 4);
  hm.teleport({ x: 207.5, y: Y, z: 4.5 }, { rotation: { x: 0, y: 90 } });
  await t.wait(3);
  hm.useItemInSlotOnBlock(0, { x: 205, y: Y, z: 4 }, t.mc.Direction.East);
  await t.wait(8);
  let [a, b] = [dim.getBlock({ x: 206, y: Y, z: 4 }), dim.getBlock({ x: 194, y: Y, z: 4 })];
  t.log("torch:", a?.typeId, states(a), "mirror:", b?.typeId, states(b));
  t.check(b?.typeId === "minecraft:torch" && b.permutation.getState("torch_facing_direction") !== a?.permutation.getState("torch_facing_direction"), "a mirrored wall torch faces the other way");
  // A curved rail: place rails to make a corner.
  hold(hm, "minecraft:rail", 8);
  dim.setBlockPermutation({ x: 210, y: Y, z: 8 }, t.mc.BlockPermutation.resolve("minecraft:rail", { rail_direction: 6 })); // south-east curve
  [a, b] = pair(210, 8);
  t.log("rail set directly (no event):", states(a));
  hm.teleport({ x: 212.5, y: Y, z: 6.5 }, { rotation: { x: 30, y: 0 } });
  await t.wait(3);
  hm.useItemInSlotOnBlock(0, { x: 212, y: Y - 1, z: 8 }, t.mc.Direction.Up);
  await t.wait(8);
  [a, b] = pair(212, 8);
  t.log("rail:", states(a), "mirror:", b?.typeId, states(b));
  t.check(b?.typeId === "minecraft:rail", "a rail gets its mirror copy");
  const RAILS = [["north", "south"], ["east", "west"], ["east"], ["west"], ["north"], ["south"], ["south", "east"], ["south", "west"], ["north", "west"], ["north", "east"]];
  const flipX = (s) => s.map((d) => (d === "east" ? "west" : d === "west" ? "east" : d)).sort().join();
  if (a && b) {
    const want = flipX(RAILS[a.permutation.getState("rail_direction")]);
    t.check(RAILS[b.permutation.getState("rail_direction")].slice().sort().join() === want, `the mirrored rail joins the mirrored sides (${want})`);
  }
  // A door placed facing south: its mirror copy (both halves) has the hinge on the other side.
  await place("minecraft:wooden_door", 216, 8);
  [a, b] = pair(216, 8);
  t.log("door:", states(a), "mirror:", b?.typeId, states(b));
  if (b?.typeId === "minecraft:wooden_door") t.check(b.permutation.getState("door_hinge_bit") !== a?.permutation.getState("door_hinge_bit"), "a mirrored door hinges on the other side");
  // Logs lying east-west stay east-west in an X mirror; a trapdoor flips east to west.
  await place("minecraft:oak_log", 220, 8, t.mc.Direction.East, { x: 219, y: Y, z: 8 });
  [a, b] = pair(220, 8);
  t.log("log:", states(a), "mirror:", states(b));
  // Standing sign: rotation mirrored.
  await place("minecraft:oak_sign", 224, 8);
  [a, b] = pair(224, 8);
  t.log("sign:", a?.typeId, states(a), "mirror:", b?.typeId, states(b));
  await viaMenu(hm, "Modifiers", { "Mirror X": false });

  // ---- Curves: 33rd point refused; points in another dimension don't count ----
  hold(hm, "minecraft:stone", 64);
  await shape(hm, 19, { Thickness: 1 });
  for (let i = 0; i < 33; i++) {
    hm.teleport({ x: 200.5 + (i % 8), y: Y, z: -10.5 }, { rotation: { x: 0, y: 0 } });
    await t.wait(1);
    hm.lookAtBlock({ x: 200 + (i % 8), y: Y - 1, z: -6 - Math.floor(i / 8) });
    await t.wait(2);
    t.cmd(hm, "/realm:build_here");
    await t.wait(2);
  }
  m = t.messages(hm, { pack: "build_bp" }).filter((x) => /Point \d+|32 points/.test(x.plain)).pop();
  t.log("after 33 points:", m?.plain);
  t.check(/32 points/.test(m?.plain ?? ""), "the 33rd point is refused");
  // Into the Nether: finishing there finds no points.
  hm.teleport({ x: 0, y: 64, z: 0 }, { dimension: t.world.getDimension("nether") });
  await t.wait(40);
  since = t.tick;
  t.cmd(hm, "/realm:build_finish");
  m = await t.waitMessage(hm, /at least two points|Built/, { pack: "build_bp", since });
  t.check(/at least two points/.test(m.plain), `a curve in another dimension doesn't count (${m.plain})`);
  hm.teleport({ x: 200.5, y: Y, z: 0.5 }, { dimension: dim });
  await t.wait(20);
  // Forget the curve points.
  t.answerForm(hm, "Forget the curve points");
  t.cmd(hm, "/realm:build");
  await t.waitMessage(hm, /forgotten/, { pack: "build_bp" });

  // ---- Palette from the inventory: non-block items are ignored ----
  const hc = hm.getComponent("inventory").container;
  hc.clearAll();
  hc.setItem(0, new ItemStack("minecraft:diamond_sword", 1));
  hc.setItem(9, new ItemStack("minecraft:diamond", 5));
  hc.setItem(10, new ItemStack("minecraft:red_wool", 10));
  hc.setItem(11, new ItemStack("minecraft:wheat_seeds", 5));
  hc.setItem(12, new ItemStack("minecraft:blue_wool", 10));
  hm.selectedSlotIndex = 0;
  await viaMenu(hm, "Palette", { "Build with the palette": true, "Blocks from": 1, Pattern: 4, "Pattern size": 1 });
  await shape(hm, 1, { Width: 4, Height: 2, Thickness: 1, Pattern: 0, Size: 0 });
  let T = await aim(hm, 240, 0);
  m = await here(hm);
  const red = count("minecraft:red_wool", T.x - 2, T.y, T.z, T.x + 2, T.y + 1, T.z), blue = count("minecraft:blue_wool", T.x - 2, T.y, T.z, T.x + 2, T.y + 1, T.z);
  t.check(red === 4 && blue === 4, `inventory palette: 4 red and 4 blue wool, nothing else (${red}, ${blue}; ${m.plain})`);
  await viaMenu(hm, "Palette", { "Build with the palette": false, "Blocks from": 0, Pattern: 0 });

  // ---- Safe zones: a non-operator is refused, an operator builds ----
  t.system.sendScriptEvent("realm:zones", JSON.stringify({ src: "zones", part: 0, parts: 1, zones: [{ id: "z1", name: "Spawn", dim: "minecraft:overworld", x: 300, z: 5, r: 6 }] }));
  await t.wait(5);
  await t.loadArea(300, 0, { radius: 2 });
  const mem = await t.player("Mem", { x: 300, z: 0, gameMode: "creative" });
  hold(mem, "minecraft:stone", 64);
  await shape(mem, 1, { Width: 3, Height: 2, Thickness: 1, Size: 0 });
  await aim(mem, 300, 0);
  m = await here(mem);
  t.check(/safe zone Spawn/.test(m.plain), `a non-operator can't build in a safe zone (${m.plain})`);
  hold(hm, "minecraft:stone", 64);
  await shape(hm, 1, { Width: 3, Height: 2, Thickness: 1, Size: 0 });
  await aim(hm, 302, 0);
  m = await here(hm);
  t.check(/Built 6 blocks/.test(m.plain), `an operator builds in a safe zone (${m.plain})`);
  t.system.sendScriptEvent("realm:zones", JSON.stringify({ src: "zones", part: 0, parts: 0, zones: [] }));

  // ---- Hand copies in someone else's claim: the copy isn't placed, nor broken ----
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c1", pack: "claims_bp", key: "enabled", value: true }));
  await t.wait(5);
  const own = await t.player("Owner", { x: 330, z: 0 });
  t.answerForm(own, "Claim this land");
  t.cmd(own, "/realm:claim");
  await t.wait(20);
  own.teleport({ x: 330.5, y: Y, z: 60.5 });
  const hs = await t.player("Hs", { x: 300, z: 0, gameMode: "survival" });
  await viaMenu(hs, "Guides, reach and Air Build", { "Modifiers copy": true }, /Saved/);
  hs.teleport({ x: 310.5, y: Y, z: 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(5);
  await viaMenu(hs, "Modifiers", { Center: 2, "Mirror X": true }); // center x 310: a block at 306 mirrors to 314, inside the claim (314 .. 346)
  hold(hs, "minecraft:oak_planks", 10);
  hs.teleport({ x: 306.5, y: Y, z: -1.5 }, { rotation: { x: 30, y: 0 } });
  await t.wait(3);
  hs.useItemInSlotOnBlock(0, { x: 306, y: Y - 1, z: 1 }, t.mc.Direction.Up);
  m = await t.waitMessage(hs, /claim|Built/, { pack: "build_bp", timeout: 60 }).catch(() => undefined);
  t.log("hand copy into a claim:", m?.plain);
  t.check(dim.getBlock({ x: 314, y: Y, z: 1 })?.typeId !== "minecraft:oak_planks" && items(hs, "minecraft:oak_planks") === 9, "the copy isn't placed in the claim, and costs nothing");
  dim.setBlockType({ x: 314, y: Y, z: 1 }, "minecraft:oak_planks");
  hs.breakBlock({ x: 306, y: Y, z: 1 });
  await t.wait(20);
  t.check(dim.getBlock({ x: 314, y: Y, z: 1 })?.typeId === "minecraft:oak_planks", "breaking by hand leaves the copy in the claim");
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "c2", pack: "claims_bp", key: "enabled", value: false }));

  // ---- Two builders at once; one leaves mid-build ----
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "b1", pack: "build_bp", key: "blocksPerTick", value: 50 }));
  t.server("/tickingarea remove_all"); // Bedrock allows 10 ticking areas
  await t.wait(2);
  await t.loadArea(400, 100, { radius: 3 });
  const p1 = await t.player("One", { x: 400, z: 100, gameMode: "survival" });
  const p2 = await t.player("Two", { x: 430, z: 100, gameMode: "creative" });
  const p1c = p1.getComponent("inventory").container;
  p1c.clearAll();
  for (let i = 0; i < 20; i++) p1c.setItem(i, new ItemStack("minecraft:stone", 64));
  p1.selectedSlotIndex = 0;
  hold(p2, "minecraft:glass", 64);
  await shape(p1, 1, { Width: 30, Height: 30, Thickness: 1, Size: 0 });
  await shape(p2, 1, { Width: 30, Height: 30, Thickness: 1, Size: 0 });
  await aim(p1, 400, 100);
  await aim(p2, 430, 100);
  t.cmd(p1, "/realm:build_here");
  t.cmd(p2, "/realm:build_here");
  await t.wait(6);
  p1.disconnect();
  m = await t.waitMessage(p2, /Built \d+ blocks/, { pack: "build_bp", timeout: 200 });
  t.check(/Built 900 blocks/.test(m.plain), `the other builder's wall is whole (${m.plain})`);
  await t.wait(40);
  t.log("stone placed before One left:", count("minecraft:stone", 385, Y, 103, 415, Y + 29, 103), "(the rest is owed to One: build:owed, not readable from here)");
}
