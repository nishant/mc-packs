// Easy Building (build_bp): copy, cut and paste, saved copies, destroy mode and undo of each.
// Copies a region of turned blocks, pastes it facing another way and compares it block by block with the
// game's own structure rotation; cuts and pastes once for free in survival; saves a named copy and checks
// it is still in the world after a restart; destroys a wall in survival with a Fortune pickaxe; undoes each.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-clipboard.js
export default async function (t) {
  const { ItemStack, BlockPermutation, StructureRotation } = t.mc;
  const dim = t.dimension;
  const sm = t.world.structureManager;
  const Y = -60; // first air layer of the flat world

  if (t.phase === 2) {
    const ids = sm.getWorldStructureIds().filter((id) => /^build:p-?\d+_1$/.test(id));
    t.log("saved copies after the restart:", ids.join(" "));
    t.assert(ids.length === 1, "the named copy is still saved in the world");
    const st = sm.get(ids[0]);
    t.assert(st && st.size.x === 3 && st.size.y === 3 && st.size.z === 4, `its size is kept (${JSON.stringify(st?.size)})`);
    return;
  }

  /** Non-air blocks (above the floor) in a box, keyed relative to the box's lowest corner. */
  const scan = (x0, z0, x1, z1, y1 = Y + 6) => {
    /** @type {Map<string, any>} */
    const out = new Map();
    let mx = Infinity, my = Infinity, mz = Infinity;
    const found = [];
    for (let x = x0; x <= x1; x++)
      for (let y = Y; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const b = dim.getBlock({ x, y, z });
          if (!b || b.isAir) continue;
          found.push({ x, y, z, perm: b.permutation });
          mx = Math.min(mx, x);
          my = Math.min(my, y);
          mz = Math.min(mz, z);
        }
    for (const f of found) out.set(`${f.x - mx},${f.y - my},${f.z - mz}`, f.perm);
    return out;
  };
  const describe = (perm) => `${perm.type.id.replace("minecraft:", "")}${JSON.stringify(perm.getAllStates())}`;
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
  /** Stands the player at x, z facing yaw, looking at the floor 4 ahead; returns the spot on top of it. */
  const aim = async (p, x, z, yaw) => {
    const F = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], "-90": [1, 0] }[String(yaw)];
    p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: yaw } });
    await t.wait(4);
    const m = { x: x + F[0] * 4, y: Y - 1, z: z + F[1] * 4 };
    p.lookAtBlock(m);
    await t.wait(4);
    p.setRotation({ x: p.getRotation().x, y: yaw });
    const hit = p.getBlockFromViewDirection({ maxDistance: 16 });
    t.assert(hit && hit.face === "Up", `the player looks at the floor (${hit?.face})`);
    return { marker: m, T: { x: hit.block.location.x, y: hit.block.location.y + 1, z: hit.block.location.z } };
  };
  const select = async (p, a, b, c) => {
    p.teleport({ x: a.x - 1.5, y: Y, z: a.z - 1.5 }, { rotation: { x: 0, y: 0 } });
    await t.wait(4);
    t.cmd(p, "/realm:build_copy"); // nothing selected yet: starts selecting
    await t.waitMessage(p, /Selecting a region/);
    const since = t.tick;
    const hand = p.getComponent("inventory").container;
    if (!hand.getItem(p.selectedSlotIndex)) hand.setItem(p.selectedSlotIndex, new ItemStack("minecraft:stick", 1));
    for (const corner of [a, b, c].filter(Boolean)) {
      p.teleport({ x: corner.x - 1.5, y: Y, z: corner.z - 1.5 });
      await t.wait(2);
      p.lookAtBlock(corner);
      await t.wait(2);
      const ok = p.useItemInSlotOnBlock(p.selectedSlotIndex, corner, t.mc.Direction.North);
      t.check(ok, `corner ${JSON.stringify(corner)} used`);
      await t.wait(3);
      p.stopInteracting();
      await t.wait(8);
    }
    await t.waitMessage(p, /Selected \d+ x \d+ x \d+/, { kind: "actionbar", since });
  };

  await t.loadArea(0, 0, { radius: 4 });
  const cre = await t.player("Cre", { x: 0, z: 0, gameMode: "creative", op: true });

  // ---- A region of blocks that point somewhere: 3 wide (x), 3 high, 4 deep (z) ----
  const R0 = { x: 0, z: 10 };
  const put = (dx, dy, dz, id, states) => dim.getBlock({ x: R0.x + dx, y: Y + dy, z: R0.z + dz }).setPermutation(BlockPermutation.resolve(id, states));
  put(0, 0, 0, "minecraft:stone_bricks");
  put(1, 0, 0, "minecraft:oak_stairs", { weirdo_direction: 2 });
  put(2, 0, 0, "minecraft:oak_log", { pillar_axis: "x" });
  put(0, 0, 1, "minecraft:spruce_trapdoor", { direction: 0, open_bit: true });
  put(1, 0, 1, "minecraft:furnace", { "minecraft:cardinal_direction": "north" });
  put(2, 0, 1, "minecraft:rail", { rail_direction: 6 });
  put(0, 0, 2, "minecraft:observer", { "minecraft:facing_direction": "east" });
  put(1, 0, 2, "minecraft:standing_sign", { ground_sign_direction: 3 });
  put(2, 0, 2, "minecraft:bell", { direction: 1, attachment: "standing" });
  put(0, 0, 3, "minecraft:spruce_door", { "minecraft:cardinal_direction": "east", upper_block_bit: false });
  put(0, 1, 3, "minecraft:spruce_door", { "minecraft:cardinal_direction": "east", upper_block_bit: true });
  put(1, 0, 3, "minecraft:lever", { lever_direction: "up_north_south" });
  put(2, 0, 3, "minecraft:stone_bricks");
  put(2, 1, 3, "minecraft:torch", { torch_facing_direction: "west" });
  put(1, 1, 0, "minecraft:ladder", { facing_direction: 3 });
  put(1, 1, 1, "minecraft:vine", { vine_direction_bits: 3 });
  put(0, 1, 0, "minecraft:glow_lichen", { multi_face_direction_bits: 1 | 4 | 32 });
  put(2, 1, 0, "minecraft:cobblestone_wall", { wall_connection_type_north: "tall", wall_post_bit: true });
  put(1, 2, 2, "minecraft:dispenser", { facing_direction: 4 });
  put(0, 2, 2, "minecraft:brain_coral_wall_fan", { coral_direction: 2 });
  await t.wait(2);

  // Copy facing south (two corners on the floor, a third for the height).
  cre.teleport({ x: R0.x + 1.5, y: Y, z: R0.z - 5.5 }, { rotation: { x: 0, y: 0 } }); // copy facing south
  await select(cre, { x: R0.x, y: Y, z: R0.z }, { x: R0.x + 2, y: Y, z: R0.z + 3 }, { x: R0.x + 1, y: Y + 2, z: R0.z + 2 });
  t.assert(t.cmd(cre, "/realm:build_copy").ok, "copy ran");
  const copied = await t.waitMessage(cre, /Copied \d+ blocks/, { kind: "actionbar" });
  t.log(copied.plain);
  const copyId = `build:p${cre.id}_0`;
  t.assert(sm.get(copyId), "Last copy is a structure in the world");
  const original = scan(R0.x, R0.z, R0.x + 2, R0.z + 3);

  // Paste facing east (three quarter turns from south) and compare with the game's own 270 degree turn.
  const { T } = await aim(cre, 40, 0, -90);
  t.assert(t.cmd(cre, "/realm:build_paste").ok, "paste ran");
  t.log((await t.waitMessage(cre, /Built \d+ blocks/, { kind: "actionbar" })).plain);
  const mine = scan(T.x - 1, T.z - 6, T.x + 6, T.z + 6);
  sm.place(copyId, dim, { x: 40, y: Y, z: 30 }, { rotation: StructureRotation.Rotate270, includeEntities: false });
  await t.wait(2);
  const theirs = scan(38, 28, 46, 36);
  for (const [k, perm] of mine) if (!theirs.has(k)) t.log("only mine at", k, describe(perm));
  t.check(mine.size === original.size, `paste has every block (${mine.size} of ${original.size})`);
  let same = 0;
  for (const [k, perm] of theirs) {
    const m = mine.get(k);
    if (m && describe(m) === describe(perm)) same++;
    else t.log("differs at", k, "mine:", m ? describe(m) : "none", "game:", describe(perm));
  }
  t.check(same === theirs.size, `turned paste matches the game's rotation (${same} of ${theirs.size})`);
  t.cmd(cre, "/realm:build_undo");
  await t.waitMessage(cre, /Undone: Paste/, { kind: "actionbar" });
  t.check(scan(T.x - 1, T.z - 6, T.x + 6, T.z + 6).size === 0, "undo took the paste away");

  // ---- Save Last copy as a named copy (menus) ----
  t.answerForm(cre, "Copy, cut and paste", "Saved copies", 1, "Save Last copy here", { Name: "Tower" });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Saved as Tower/);
  t.assert(sm.get(`build:p${cre.id}_1`), "the named copy is a structure");

  // ---- Survival: cut a small block of cobblestone (no drops), paste it once for free ----
  const sur = await t.player("Sur", { x: 80, z: 0, gameMode: "survival" });
  const S0 = { x: 80, z: 10 };
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) dim.setBlockType({ x: S0.x + dx, y: Y + dy, z: S0.z + dz }, "minecraft:cobblestone");
  dim.getBlock({ x: S0.x, y: Y + 2, z: S0.z }).setPermutation(BlockPermutation.resolve("minecraft:torch", { torch_facing_direction: "top" }));
  const inv = sur.getComponent("inventory").container;
  inv.clearAll();
  await select(sur, { x: S0.x, y: Y, z: S0.z }, { x: S0.x + 1, y: Y, z: S0.z + 1 }, { x: S0.x, y: Y + 2, z: S0.z });
  t.cmd(sur, "/realm:build_cut");
  await t.waitMessage(sur, /Cut 9 blocks/, { kind: "actionbar" });
  await t.wait(5);
  t.check(count("minecraft:cobblestone", S0.x, Y, S0.z, S0.x + 1, Y + 1, S0.z + 1) === 0, "cut took the blocks");
  const drops = dim.getEntities({ type: "minecraft:item", location: { x: S0.x + 1, y: Y + 1, z: S0.z + 1 }, maxDistance: 6 });
  t.check(drops.length === 0, `a cut drops nothing (${drops.length} items)`);
  const P = await aim(sur, 100, 0, 0);
  t.cmd(sur, "/realm:build_paste");
  await t.waitMessage(sur, /Built 9 blocks/, { kind: "actionbar" });
  t.check(count("minecraft:cobblestone", P.T.x - 1, P.T.y, P.T.z, P.T.x + 1, P.T.y + 1, P.T.z + 2) === 8, "the free paste placed the 8 cobblestone");
  t.cmd(sur, "/realm:build_paste");
  await t.waitMessage(sur, /Nothing was built|Not enough blocks/);
  t.cmd(sur, "/realm:build_undo");
  await t.waitMessage(sur, /Undone: Paste/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:cobblestone") === 0, "undo of a free paste gives nothing back");
  t.cmd(sur, "/realm:build_undo");
  await t.waitMessage(sur, /Undone: Cut/, { kind: "actionbar" });
  t.check(count("minecraft:cobblestone", S0.x, Y, S0.z, S0.x + 1, Y + 1, S0.z + 1) === 8, "undo of the cut put the blocks back");
  t.cmd(sur, "/realm:build_paste");
  await t.waitMessage(sur, /Not enough blocks/);

  // ---- Survival destroy mode: a 3 x 3 stone wall with an ore and a dirt block, Fortune III iron pickaxe ----
  t.answerForm(sur, "Choose a shape", 1, { Width: 3, Height: 3, Thickness: 1, Size: 0 });
  t.cmd(sur, "/realm:build");
  await t.waitMessage(sur, /build mode is on/i);
  t.cmd(sur, "/realm:build_mode"); // build mode off again
  const D = await aim(sur, 120, 0, 0);
  const W = { x: 120, z: 4 };
  for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 3; dy++) dim.setBlockType({ x: W.x + dx, y: Y + dy, z: W.z }, "minecraft:stone");
  dim.setBlockType({ x: W.x - 1, y: Y + 1, z: W.z }, "minecraft:diamond_ore");
  dim.setBlockType({ x: W.x + 1, y: Y + 2, z: W.z }, "minecraft:dirt");
  const pick = new ItemStack("minecraft:iron_pickaxe", 1);
  pick.getComponent("enchantable").addEnchantment({ type: new t.mc.EnchantmentType("fortune"), level: 3 });
  inv.clearAll();
  inv.setItem(0, pick);
  inv.setItem(1, new ItemStack("minecraft:iron_pickaxe", 1));
  sur.selectedSlotIndex = 0;
  t.cmd(sur, "/realm:build_destroy");
  await t.waitMessage(sur, /Destroy mode on/, { kind: "actionbar" });
  sur.lookAtBlock({ x: W.x, y: Y, z: W.z });
  await t.wait(2);
  t.answerForm(sur, "Destroy mode", "Destroy here now", "Break them");
  t.cmd(sur, "/realm:build");
  await t.waitMessage(sur, /Destroyed \d+ blocks/, { kind: "actionbar", timeout: 400 });
  await t.wait(10);
  const left = count("minecraft:stone", W.x - 1, Y, W.z, W.x + 1, Y + 2, W.z) + count("minecraft:diamond_ore", W.x - 1, Y, W.z, W.x + 1, Y + 2, W.z);
  t.check(left === 0, `stone and ore broken (${left} left)`);
  t.check(count("minecraft:dirt", W.x - 1, Y, W.z, W.x + 1, Y + 2, W.z) === 1, "dirt needs a shovel: it stays");
  const atFeet = dim.getEntities({ type: "minecraft:item", location: sur.location, maxDistance: 3 }).map((e) => e.getComponent("item").itemStack);
  const got = (id) => atFeet.filter((s) => s.typeId === id).reduce((a, s) => a + s.amount, 0) + items(sur, id);
  t.log("drops at the feet:", atFeet.map((s) => `${s.typeId}x${s.amount}`).join(" "));
  t.check(got("minecraft:cobblestone") === 7, `7 cobblestone dropped at the feet (${got("minecraft:cobblestone")})`);
  t.check(got("minecraft:diamond") >= 1, `diamonds dropped (${got("minecraft:diamond")})`);
  const held = inv.getItem(0);
  let dmg;
  try {
    dmg = held?.getComponent("durability")?.damage;
  } catch (e) {
    t.log("durability:", String(e));
  }
  t.log("slot 0 holds", held?.typeId, "damage", dmg, "inventory:", [...Array(inv.size).keys()].map((i) => inv.getItem(i)).filter(Boolean).map((i) => `${i.typeId}x${i.amount}`).join(" "));
  t.check(dmg === 8, `the pickaxe wore by 8 (${dmg})`);
  // Undo in survival puts the blocks back from your inventory: 5 stone for 7 spots, partial.
  for (const e of dim.getEntities({ type: "minecraft:item", location: sur.location, maxDistance: 4 })) e.remove();
  inv.setItem(2, new ItemStack("minecraft:stone", 5));
  t.cmd(sur, "/realm:build_undo");
  await t.waitMessage(sur, /Out of blocks|Undone: Destroy/);
  await t.wait(5);
  t.check(count("minecraft:stone", W.x - 1, Y, W.z, W.x + 1, Y + 2, W.z) === 5, "undo of destroy rebuilt 5 stone from the inventory");
  t.check(items(sur, "minecraft:stone") === 0, "and took the stone");
  t.cmd(sur, "/realm:build_redo");
  await t.waitMessage(sur, /Redone: Destroy/, { kind: "actionbar" });
  t.check(count("minecraft:stone", W.x - 1, Y, W.z, W.x + 1, Y + 2, W.z) === 0 && items(sur, "minecraft:stone") === 5, "redo broke them again and gave the stone back");

  // Destroy mode by breaking a block: a 3 x 3 wall in creative.
  for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 3; dy++) dim.setBlockType({ x: W.x + dx, y: Y + dy, z: W.z + 3 }, "minecraft:oak_planks");
  t.answerForm(cre, "Choose a shape", 1, { Width: 3, Height: 3, Thickness: 1, Size: 0 });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /build mode is on/i);
  t.cmd(cre, "/realm:build_mode");
  t.cmd(cre, "/realm:build_destroy");
  cre.teleport({ x: W.x + 0.5, y: Y, z: W.z - 1 + 0.5 }, { rotation: { x: 0, y: 0 } });
  const cinv = cre.getComponent("inventory").container;
  cinv.setItem(0, new ItemStack("minecraft:diamond_axe", 1));
  cre.selectedSlotIndex = 0;
  await t.wait(4);
  cre.breakBlock({ x: W.x, y: Y, z: W.z + 3 }, t.mc.Direction.North);
  await t.waitMessage(cre, /Destroyed 8 blocks/, { kind: "actionbar" });
  t.check(count("minecraft:oak_planks", W.x - 1, Y, W.z + 3, W.x + 1, Y + 2, W.z + 3) === 0, "breaking one plank broke the whole wall");

  t.restart("saved copy written; restarting to check it is still there");
}
