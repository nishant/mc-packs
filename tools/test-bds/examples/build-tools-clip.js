// Easy Building (build_bp) review: copy, cut and paste beyond the happy path.
// Rotation at all four facings for many turned blocks (checked against the game's StructureRotation), copy limits,
// a cut that leaves chests (and their items) alone, survival costs and refunds counted exactly, the free paste of
// a cut through undo and redo (blocks are never made or lost), an undo that would remove a filled chest, mirror
// modifiers on a paste, air corners, corners in two dimensions, a copy in the Nether with bedrock inside, saved
// copies (slot 19, odd names, delete), a second player who can't paste the first one's copy.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-tools-clip.js --timeout 400
export default async function (t) {
  const { ItemStack, BlockPermutation, StructureRotation } = t.mc;
  const dim = t.dimension;
  const sm = t.world.structureManager;
  const Y = -60; // first air layer of the flat world

  const key = (perm) => {
    // powered_bit: an observer may fire; in_wall_bit: the game's own placement updates gates next to walls.
    const { powered_bit: _a, in_wall_bit: _b, ...st } = perm.getAllStates();
    return `${perm.type.id.replace("minecraft:", "")}${JSON.stringify(st)}`;
  };
  /** Non-air blocks in a box, keyed relative to the lowest corner of what is there. */
  const scan = (d, x0, y0, z0, x1, y1, z1) => {
    const found = [];
    let mx = Infinity, my = Infinity, mz = Infinity;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const b = d.getBlock({ x, y, z });
          if (!b || b.isAir) continue;
          found.push({ x, y, z, perm: b.permutation });
          mx = Math.min(mx, x);
          my = Math.min(my, y);
          mz = Math.min(mz, z);
        }
    const out = new Map();
    for (const f of found) out.set(`${f.x - mx},${f.y - my},${f.z - mz}`, f.perm);
    return out;
  };
  const items = (p, id) => {
    const c = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) n += c.getItem(i).amount;
    return n;
  };
  const count = (id, x0, y0, z0, x1, y1, z1, d = dim) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (d.getBlock({ x, y, z })?.typeId === id) n++;
    return n;
  };
  const clearItems = (loc, r = 8) => {
    for (const e of dim.getEntities({ type: "minecraft:item", location: loc, maxDistance: r })) e.remove();
  };
  /** Stands the player at x, z facing yaw, looking at the floor 4 ahead; returns the spot on top of it. */
  const aim = async (p, x, z, yaw) => {
    const F = { 0: [0, 1], 90: [-1, 0], 180: [0, -1], "-90": [1, 0] }[String(yaw)];
    p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: yaw }, dimension: dim });
    await t.wait(4);
    await t.waitUntil(() => p.dimension.id === "minecraft:overworld" && dim.getBlock({ x, y: Y - 1, z }), { message: "back in the overworld" });
    const m = { x: x + F[0] * 4, y: Y - 1, z: z + F[1] * 4 };
    p.lookAtBlock(m);
    await t.wait(4);
    p.setRotation({ x: p.getRotation().x, y: yaw });
    const hit = p.getBlockFromViewDirection({ maxDistance: 16 });
    t.assert(hit && hit.face === "Up", `the player looks at the floor (${hit?.face})`);
    return { x: hit.block.location.x, y: hit.block.location.y + 1, z: hit.block.location.z };
  };
  /** Sets a corner where the player stands (menu: Corner where you stand). */
  const standCorner = async (p, pos, d = dim) => {
    // A glass column to stand on for a corner above the floor (taken away again after).
    const col = [];
    if (d === dim) for (let y = Y; y < pos.y; y++) if (dim.getBlock({ x: pos.x, y, z: pos.z })?.isAir) {
      dim.setBlockType({ x: pos.x, y, z: pos.z }, "minecraft:glass");
      col.push(y);
    }
    p.teleport({ x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 }, { dimension: d });
    await t.wait(3);
    const since = t.tick;
    t.answerForm(p, "Copy, cut and paste", "Corner where you stand");
    t.cmd(p, "/realm:build");
    const msg = await t.waitMessage(p, /Corner 1|Selected/, { kind: "actionbar", since });
    for (const y of col) dim.setBlockType({ x: pos.x, y, z: pos.z }, "minecraft:air");
    return msg;
  };
  /** Starts a fresh selection from the menu. */
  const fresh = async (p) => {
    for (let i = 0; i < 2; i++) {
      let pressed = "";
      t.answerForm(p, "Copy, cut and paste", (f) => {
        pressed = f.buttons.find((b) => /Select a region|Stop selecting/.test(b)) ?? "Back";
        return pressed;
      });
      const since = t.tick;
      t.cmd(p, "/realm:build");
      await t.waitUntil(() => pressed, { message: "clipboard menu shown" });
      if (/Select a region/.test(pressed)) return t.waitMessage(p, /Selecting a region/, { since });
      await t.wait(2);
    }
  };
  const select = async (p, a, b, c) => {
    await fresh(p);
    await standCorner(p, a);
    await standCorner(p, b);
    if (c) await standCorner(p, c);
  };
  /** Runs a command and waits for the first matching message it causes (older messages are cleared first). */
  const run = async (p, cmd, pattern, opts = {}) => {
    t.clearMessages();
    const wait = t.waitMessage(p, pattern, opts);
    t.cmd(p, cmd);
    return wait;
  };

  await t.loadArea(0, 0, { radius: 4 });
  const cre = await t.player("Cre", { x: 0, z: 0, gameMode: "creative", op: true });

  // ---------------------------------------------------------------------------
  // 1. Rotation at all four facings
  // ---------------------------------------------------------------------------
  const R0 = { x: 0, z: 10 };
  /** @type {[number, number, number, string, any][]} */
  const blocks = [
    [0, 0, 0, "minecraft:stone_brick_stairs", { weirdo_direction: 1, upside_down_bit: true }],
    [1, 0, 0, "minecraft:standing_banner", { ground_sign_direction: 5 }],
    [2, 0, 0, "minecraft:wall_banner", { facing_direction: 2 }],
    [3, 0, 0, "minecraft:wall_sign", { facing_direction: 4 }],
    [0, 0, 1, "minecraft:oak_hanging_sign", { facing_direction: 5, attached_bit: false, hanging: false, ground_sign_direction: 0 }],
    [1, 0, 1, "minecraft:unpowered_repeater", { "minecraft:cardinal_direction": "west", repeater_delay: 2 }],
    [2, 0, 1, "minecraft:unpowered_comparator", { "minecraft:cardinal_direction": "north" }],
    [3, 0, 1, "minecraft:golden_rail", { rail_direction: 3, rail_data_bit: false }],
    [0, 0, 2, "minecraft:stone_button", { facing_direction: 4 }],
    [1, 0, 2, "minecraft:chest", { "minecraft:cardinal_direction": "east" }],
    [2, 0, 2, "minecraft:end_rod", { facing_direction: 5 }],
    [3, 0, 2, "minecraft:piston", { facing_direction: 2 }],
    [0, 0, 3, "minecraft:hopper", { facing_direction: 5 }],
    [1, 0, 3, "minecraft:chain", { pillar_axis: "x" }],
    [2, 0, 3, "minecraft:amethyst_cluster", { "minecraft:block_face": "west" }],
    [3, 0, 3, "minecraft:tripwire_hook", { direction: 1 }],
    [0, 0, 4, "minecraft:carved_pumpkin", { "minecraft:cardinal_direction": "west" }],
    [1, 0, 4, "minecraft:anvil", { "minecraft:cardinal_direction": "south" }],
    [2, 0, 4, "minecraft:grindstone", { attachment: "side", direction: 2 }],
    [3, 0, 4, "minecraft:campfire", { "minecraft:cardinal_direction": "east" }],
    [0, 1, 0, "minecraft:iron_door", { "minecraft:cardinal_direction": "north", upper_block_bit: false, door_hinge_bit: true }],
    [0, 2, 0, "minecraft:iron_door", { "minecraft:cardinal_direction": "north", upper_block_bit: true, door_hinge_bit: true }],
    [1, 1, 0, "minecraft:skeleton_skull", { facing_direction: 3 }],
    [2, 1, 0, "minecraft:big_dripleaf", { "minecraft:cardinal_direction": "south", big_dripleaf_head: true }],
    [3, 1, 0, "minecraft:pink_petals", { "minecraft:cardinal_direction": "north", growth: 2 }],
    [1, 1, 1, "minecraft:crafter", { orientation: "east_up" }],
    [2, 1, 1, "minecraft:lectern", { "minecraft:cardinal_direction": "west" }],
    [3, 1, 1, "minecraft:cocoa", { direction: 2, age: 1 }],
    [1, 1, 2, "minecraft:sculk_vein", { multi_face_direction_bits: 2 | 8 }],
    [2, 1, 2, "minecraft:spruce_fence_gate", { "minecraft:cardinal_direction": "south", open_bit: true }],
    [3, 1, 2, "minecraft:stone_brick_wall", { wall_connection_type_east: "short", wall_connection_type_south: "tall", wall_post_bit: true }],
        [2, 1, 3, "minecraft:bedrock", {}], // forbidden: left out of the copy
    [3, 1, 3, "minecraft:torch", { torch_facing_direction: "east" }],
    [1, 1, 4, "minecraft:ladder", { facing_direction: 4 }],
    [2, 1, 4, "minecraft:quartz_block", { pillar_axis: "z" }],
    [3, 1, 4, "minecraft:soul_lantern", { hanging: true }],
  ];
  let placedRef = 0;
  for (const [dx, dy, dz, id, st] of blocks) {
    let perm;
    try {
      perm = BlockPermutation.resolve(id, st);
    } catch (e) {
      try {
        perm = BlockPermutation.resolve(id);
        t.log("states refused for", id, String(e).slice(0, 100));
      } catch (e2) {
        t.log("no such block", id, String(e2).slice(0, 80));
        continue;
      }
    }
    dim.getBlock({ x: R0.x + dx, y: Y + dy, z: R0.z + dz }).setPermutation(perm);
    placedRef++;
  }
  // A bed: forbidden, so left out of the copy.
  dim.getBlock({ x: R0.x + 1, y: Y + 1, z: R0.z + 3 }).setPermutation(BlockPermutation.resolve("minecraft:bed", { direction: 0, head_piece_bit: false }));
  await t.wait(2);
  const W = 4, H = 3, D = 5;
  t.log("region blocks:", scan(dim, R0.x, Y, R0.z, R0.x + W - 1, Y + H - 1, R0.z + D - 1).size, "placed", placedRef);
  cre.teleport({ x: R0.x + 1.5, y: Y, z: R0.z - 3.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(3);
  cre.setRotation({ x: 0, y: 0 }); // copy facing south
  await select(cre, { x: R0.x, y: Y, z: R0.z }, { x: R0.x + W - 1, y: Y, z: R0.z + D - 1 }, { x: R0.x - 2, y: Y + H - 1, z: R0.z - 2 });
  t.log("selected:", t.messages(cre, { kind: "actionbar" }).map((m) => m.plain).filter((x) => /Selected/.test(x)).pop());
  cre.teleport({ x: R0.x + 1.5, y: Y, z: R0.z - 3.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(3);
  t.log((await run(cre, "/realm:build_copy", /Copied \d+ blocks/, { kind: "actionbar" })).plain);
  const copyId = `build:p${cre.id}_0`;
  const st0 = sm.get(copyId);
  t.assert(st0, "Last copy saved");
  let forb = 0;
  for (let x = 0; x < st0.size.x; x++) for (let y = 0; y < st0.size.y; y++) for (let z = 0; z < st0.size.z; z++) {
    const id = st0.getBlockPermutation({ x, y, z })?.type.id;
    if (id === "minecraft:bed" || id === "minecraft:bedrock") forb++;
  }
  t.check(forb === 0, `bed and bedrock left out of the copy (${forb})`);
  const yaws = [0, 90, 180, -90];
  const rots = [StructureRotation.None, StructureRotation.Rotate90, StructureRotation.Rotate180, StructureRotation.Rotate270];
  for (let k = 0; k < 4; k++) {
    const bx = 30 + k * 20;
    const T = await aim(cre, bx, 0, yaws[k]);
    await run(cre, "/realm:build_paste", /Built \d+ blocks/, { kind: "actionbar" });
    const mine = scan(dim, T.x - 8, Y, T.z - 8, T.x + 8, Y + 4, T.z + 8);
    sm.place(copyId, dim, { x: bx, y: Y, z: 40 }, { rotation: rots[k], includeEntities: false });
    await t.wait(2);
    const theirs = scan(dim, bx - 1, Y, 39, bx + 8, Y + 4, 48);
    let same = 0;
    for (const [kk, perm] of theirs) {
      const m = mine.get(kk);
      if (m && key(m) === key(perm)) same++;
      else t.log(`k=${k} differs at`, kk, "mine:", m ? key(m) : "none", "game:", key(perm));
    }
    t.check(same === theirs.size && mine.size === theirs.size, `facing ${yaws[k]}: paste matches the game's rotation (${same} of ${theirs.size}, mine ${mine.size})`);
  }

  // ---------------------------------------------------------------------------
  // 2. Copy limits
  // ---------------------------------------------------------------------------
  await select(cre, { x: -40, y: Y, z: -40 }, { x: 24, y: Y, z: 0 }); // 65 across
  t.log((await run(cre, "/realm:build_copy", /at most 64 blocks across/)).plain);
  await select(cre, { x: -40, y: Y, z: -40 }, { x: 23, y: Y + 8, z: 23 }); // 64 x 9 x 64 = 36864
  t.log((await run(cre, "/realm:build_copy", /most one copy can hold is 32768/)).plain);
  t.server("/fill -40 -60 -40 23 -53 23 stone");
  await select(cre, { x: -40, y: Y, z: -40 }, { x: 23, y: Y + 7, z: 23 }); // 64 x 8 x 64 = 32768
  t.log((await run(cre, "/realm:build_copy", /Copied 32768 blocks/, { kind: "actionbar", timeout: 400 })).plain);
  t.server("/fill -40 -60 -40 23 -53 23 air");

  // ---------------------------------------------------------------------------
  // 3. Survival: a cut leaves a filled chest alone; cut, paste and undo costs counted exactly
  // ---------------------------------------------------------------------------
  const sur = await t.player("Sur", { x: 120, z: 0, gameMode: "survival" });
  const inv = sur.getComponent("inventory").container;
  inv.clearAll();
  const S = { x: 120, z: 10 };
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) dim.setBlockType({ x: S.x + dx, y: Y + dy, z: S.z + dz }, "minecraft:cobblestone");
  dim.getBlock({ x: S.x + 1, y: Y + 1, z: S.z + 1 }).setPermutation(BlockPermutation.resolve("minecraft:chest"));
  dim.getBlock({ x: S.x + 1, y: Y + 1, z: S.z + 1 }).getComponent("inventory").container.setItem(0, new ItemStack("minecraft:diamond", 5));
  dim.setBlockType({ x: S.x, y: Y + 1, z: S.z }, "minecraft:air");
  await select(sur, { x: S.x, y: Y, z: S.z }, { x: S.x + 1, y: Y + 1, z: S.z + 1 });
  t.log((await run(sur, "/realm:build_cut", /Cut \d+ blocks/, { kind: "actionbar" })).plain);
  await t.wait(4);
  const chestAfterCut = dim.getBlock({ x: S.x + 1, y: Y + 1, z: S.z + 1 });
  t.check(chestAfterCut.typeId === "minecraft:chest" && chestAfterCut.getComponent("inventory").container.getItem(0)?.amount === 5, "the cut left the chest and its 5 diamonds");
  t.check(count("minecraft:cobblestone", S.x, Y, S.z, S.x + 1, Y + 1, S.z + 1) === 0, "the cut took the cobblestone");
  const S_COBBLE = 6; // 8 spots minus the chest and an empty one
  const conserve = (where) => {
    const world = count("minecraft:cobblestone", S.x, Y, S.z, S.x + 1, Y + 1, S.z + 1) + count("minecraft:cobblestone", 130, Y, 0, 160, Y + 3, 30);
    const total = world + items(sur, "minecraft:cobblestone");
    t.log(`${where}: world ${world}, inventory ${items(sur, "minecraft:cobblestone")}`);
    return total;
  };
  // Free paste, undo it (free again), undo the cut, redo the cut, redo the paste (paid), paste free again.
  let P = await aim(sur, 140, 0, 0);
  await run(sur, "/realm:build_paste", /Built 6 blocks/, { kind: "actionbar" });
  t.check(conserve("after the free paste") === S_COBBLE, "free paste: no cobblestone made");
  await run(sur, "/realm:build_paste", /Not enough blocks|Nothing was built/);
  await run(sur, "/realm:build_undo", /Undone: Paste/, { kind: "actionbar" });
  await run(sur, "/realm:build_undo", /Undone: Cut/, { kind: "actionbar" });
  t.check(count("minecraft:cobblestone", S.x, Y, S.z, S.x + 1, Y + 1, S.z + 1) === S_COBBLE, "undo of the cut put 6 cobblestone back");
  t.check(conserve("after undoing paste and cut") === S_COBBLE, "no cobblestone made");
  const redoCut = await run(sur, "/realm:build_redo", /Redone: Cut|Nothing was built|can't be built|Not enough/);
  t.check(/Redone: Cut/.test(redoCut.plain), `survival redo of a cut works (${redoCut.plain})`);
  t.check(count("minecraft:cobblestone", S.x, Y, S.z, S.x + 1, Y + 1, S.z + 1) === 0, "redo of the cut took the blocks again");
  t.check(conserve("after redoing the cut") === 0, "and gave nothing");
  inv.setItem(5, new ItemStack("minecraft:cobblestone", 6));
  await run(sur, "/realm:build_redo", /Built 6 blocks|Redone/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:cobblestone") === 0, "redo of the free paste was paid for");
  P = await aim(sur, 150, 0, 0);
  const freeAgain = await run(sur, "/realm:build_paste", /Built \d+ blocks|Not enough|Nothing/);
  t.check(/Built 6/.test(freeAgain.plain), `the cut still pastes once for free after its redo (${freeAgain.plain})`);
  t.check(conserve("after the second free paste") === 12, "6 cut + 6 paid = 12, nothing more");
  // The free paste is used: the cut can't be undone before that paste.
  await run(sur, "/realm:build_undo", /Undone: Paste/, { kind: "actionbar" }); // free paste: nothing back
  await run(sur, "/realm:build_undo", /Undone: Paste/, { kind: "actionbar" }); // the paid one: 6 back
  t.check(items(sur, "minecraft:cobblestone") === 6, `undo of the paid paste refunded 6 (${items(sur, "minecraft:cobblestone")})`);
  await run(sur, "/realm:build_undo", /Undone: Cut/, { kind: "actionbar" });
  t.check(conserve("end") === 12, "end: 12 cobblestone, none made or lost");

  // An undo that would remove a chest someone filled since: the chest and its items stay.
  inv.clearAll();
  await select(sur, { x: 170, y: Y, z: 10 }, { x: 170, y: Y, z: 10 });
  dim.getBlock({ x: 170, y: Y, z: 10 }).setPermutation(BlockPermutation.resolve("minecraft:chest"));
  await run(sur, "/realm:build_copy", /Copied 1 block/, { kind: "actionbar" });
  inv.setItem(3, new ItemStack("minecraft:chest", 1));
  const C = await aim(sur, 170, 20, 0);
  await run(sur, "/realm:build_paste", /Built 1 block/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:chest") === 0, "the pasted chest cost a chest");
  dim.getBlock(C).getComponent("inventory").container.setItem(0, new ItemStack("minecraft:gold_ingot", 9));
  await run(sur, "/realm:build_undo", /Undone|changed since/);
  await t.wait(3);
  const ch = dim.getBlock(C);
  const kept = ch.typeId === "minecraft:chest" && ch.getComponent("inventory")?.container.getItem(0)?.amount === 9;
  t.check(kept, `undo leaves a filled chest and its items (${ch.typeId})`);
  t.check(items(sur, "minecraft:chest") === (kept ? 0 : 1), "and gives back a chest only if it took one");
  clearItems(C);

  // Survival cut limit: 4352 blocks is more than 4096.
  await t.loadArea(208, 8, { radius: 1 });
  t.server("/fill 200 -60 0 216 -45 15 dirt");
  await select(sur, { x: 200, y: Y, z: 0 }, { x: 216, y: Y + 15, z: 15 });
  t.log((await run(sur, "/realm:build_cut", /most you can cut at once is 4096/)).plain);
  t.check(count("minecraft:dirt", 200, Y, 0, 216, Y, 15) === 17 * 16, "nothing was cut");
  t.server("/fill 200 -60 0 216 -45 15 air");

  // ---------------------------------------------------------------------------
  // 4. Paste with a mirror modifier (survival pays for both)
  // ---------------------------------------------------------------------------
  inv.clearAll();
  await t.loadArea(248, 8, { radius: 1 });
  dim.setBlockType({ x: 240, y: Y, z: 10 }, "minecraft:oak_planks");
  dim.setBlockType({ x: 241, y: Y, z: 10 }, "minecraft:oak_planks");
  await select(sur, { x: 240, y: Y, z: 10 }, { x: 241, y: Y, z: 10 });
  await run(sur, "/realm:build_copy", /Copied 2 blocks/, { kind: "actionbar" });
  sur.teleport({ x: 250.5, y: Y, z: 0.5 });
  await t.wait(3);
  t.answerForm(sur, "Modifiers", { Center: 2, "Mirror X": true });
  t.cmd(sur, "/realm:build");
  await t.waitMessage(sur, /Modifiers:/);
  inv.setItem(4, new ItemStack("minecraft:oak_planks", 10));
  const M = await aim(sur, 254, 0, 0);
  await run(sur, "/realm:build_paste", /Built 4 blocks/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:oak_planks") === 6, `the mirrored paste cost 4 planks (${items(sur, "minecraft:oak_planks")} left)`);
  await run(sur, "/realm:build_undo", /Undone: Paste/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:oak_planks") === 10, "undo gave all 4 back");
  t.answerForm(sur, "Modifiers", { "Mirror X": false, Center: 3 });
  t.cmd(sur, "/realm:build");
  await t.waitMessage(sur, /Modifiers:/);
  void M;

  // Paste mode: placing a block pastes there; the block goes back to the hand (exactly one).
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:cobblestone", 5));
  inv.setItem(9, new ItemStack("minecraft:oak_planks", 10));
  sur.selectedSlotIndex = 0;
  t.answerForm(sur, "Copy, cut and paste", (f) => f.buttons.find((b) => /Paste mode/.test(b)));
  await run(sur, "/realm:build", /Paste mode on/, { kind: "actionbar" });
  const PM = await aim(sur, 260, 0, 0);
  const below = { x: PM.x, y: PM.y - 1, z: PM.z };
  sur.lookAtBlock(below);
  await t.wait(2);
  t.clearMessages();
  const pm = t.waitMessage(sur, /Built \d+ blocks|Nothing|Not enough/);
  t.log("placed:", sur.useItemInSlotOnBlock(0, below, t.mc.Direction.Up));
  t.log("paste mode:", (await pm).plain);
  await t.wait(10);
  t.check(items(sur, "minecraft:cobblestone") === 5 && items(sur, "minecraft:oak_planks") === 8, `paste mode: the block came back, the paste cost 2 planks (${items(sur, "minecraft:cobblestone")} cobblestone, ${items(sur, "minecraft:oak_planks")} planks)`);
  t.check(count("minecraft:cobblestone", PM.x - 2, Y, PM.z - 2, PM.x + 2, Y + 2, PM.z + 2) === 0 && count("minecraft:oak_planks", PM.x - 2, Y, PM.z - 2, PM.x + 2, Y + 2, PM.z + 2) === 2, "the copy is there, the marker block isn't");
  t.answerForm(sur, "Copy, cut and paste", (f) => f.buttons.find((b) => /Paste mode/.test(b)));
  await run(sur, "/realm:build", /Paste mode off/, { kind: "actionbar" });

  // ---------------------------------------------------------------------------
  // 5. Selecting: a corner in the air, corners in two dimensions, the Nether with bedrock
  // ---------------------------------------------------------------------------
  cre.teleport({ x: 0.5, y: Y, z: 0.5 }, { rotation: { x: -90, y: 0 } }); // looking straight up
  await t.wait(3);
  await fresh(cre);
  cre.getComponent("inventory").container.setItem(cre.selectedSlotIndex, new ItemStack("minecraft:stick", 1));
  let since = t.tick;
  t.log("useItemInSlot:", cre.useItemInSlot(cre.selectedSlotIndex));
  const air = await t.waitMessage(cre, /Corner 1/, { kind: "actionbar", since });
  t.log("air corner:", air.plain);
  const head = cre.getHeadLocation(), view = cre.getViewDirection();
  const want = `${Math.floor(head.x + view.x * 4)} ${Math.floor(head.y + view.y * 4)} ${Math.floor(head.z + view.z * 4)}`;
  t.check(air.plain.includes(want), `the air corner is 4 blocks in front of the eyes (${want})`);
  // Corner 2 in the Nether starts over there.
  const neth = t.world.getDimension("nether");
  await t.loadArea(0, 0, { dimension: neth, radius: 1, timeout: 100 }).catch(() => undefined);
  cre.teleport({ x: 0.5, y: 100, z: 0.5 }, { dimension: neth });
  await t.wait(20);
  await t.waitUntil(() => neth.getBlock({ x: 0, y: 100, z: 0 }) !== undefined, { timeout: 200, message: "the Nether chunk loads" });
  neth.runCommand("fill -3 97 -3 3 104 3 air");
  neth.runCommand("fill -1 98 -1 1 98 1 bedrock");
  neth.runCommand("fill -1 99 -1 1 99 1 netherrack");
  since = t.tick;
  t.answerForm(cre, "Copy, cut and paste", "Corner where you stand");
  cre.teleport({ x: -0.5, y: 97, z: -0.5 }, { dimension: neth });
  await t.wait(3);
  t.cmd(cre, "/realm:build");
  const nc = await t.waitMessage(cre, /Corner 1|Selected/, { kind: "actionbar", since });
  t.check(/Corner 1/.test(nc.plain), `a corner in another dimension starts a new box (${nc.plain})`);
  cre.teleport({ x: 1.5, y: 100, z: 1.5 }, { dimension: neth });
  await t.wait(3);
  since = t.tick;
  t.answerForm(cre, "Copy, cut and paste", "Corner where you stand");
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Selected 3 x 4 x 3/, { kind: "actionbar", since });
  await run(cre, "/realm:build_copy", /Copied 9 blocks/, { kind: "actionbar" });
  const NT = await aim(cre, 60, 60, 0);
  t.check(cre.dimension.id === "minecraft:overworld", "back in the overworld");
  await run(cre, "/realm:build_paste", /Built 9 blocks/, { kind: "actionbar" });
  t.check(count("minecraft:netherrack", NT.x - 2, NT.y, NT.z, NT.x + 2, NT.y + 2, NT.z + 4) === 9 && count("minecraft:bedrock", NT.x - 2, NT.y, NT.z, NT.x + 2, NT.y + 2, NT.z + 4) === 0, "a Nether copy pastes in the overworld without its bedrock");

  // ---------------------------------------------------------------------------
  // 6. Saved copies: slot 19, an odd name, rename, delete; another player can't use them
  // ---------------------------------------------------------------------------
  t.answerForm(cre, "Copy, cut and paste", "Saved copies", 19, "Save Last copy here", { Name: "  §cHéllo… <World> & 'Q' \"x\" 1234567890ABCDEFGHIJ  " });
  t.cmd(cre, "/realm:build");
  const saved = await t.waitMessage(cre, /Saved as/);
  t.log("saved:", saved.plain);
  t.check(/^Saved as [\x20-\x7e]{1,24} \(/.test(saved.plain) && !saved.plain.includes("…"), "the name is plain ASCII, at most 24 letters");
  t.check(!!sm.get(`build:p${cre.id}_19`), "slot 19 is a structure");
  t.answerForm(cre, "Copy, cut and paste", "Saved copies", 19, "Rename", { Name: "" });
  t.cmd(cre, "/realm:build");
  t.log("rename to empty:", (await t.waitMessage(cre, /Renamed to/)).plain);
  const other = await t.player("Other", { x: 60, z: 70, gameMode: "creative" });
  await aim(other, 60, 70, 0);
  await run(other, "/realm:build_paste", /Nothing to paste/);
  t.check(!sm.getWorldStructureIds().some((id) => id.startsWith(`build:p${other.id}_`)), "the other player has no copies");
  t.answerForm(cre, "Copy, cut and paste", "Saved copies", 19, "Delete", "Delete");
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /Deleted/);
  t.check(!sm.get(`build:p${cre.id}_19`), "deleting the copy deleted its structure");
  // Pasting falls back to Last copy after the active slot was deleted.
  await aim(cre, 60, 80, 0);
  await run(cre, "/realm:build_paste", /Built 9 blocks/, { kind: "actionbar" });
}
