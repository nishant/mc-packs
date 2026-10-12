// Easy Building (build_bp) review: destroy mode beyond the happy path.
// Wrong tools and tiers, axes and shovels, Silk Touch, a tool that breaks with a spare swapped in, a tool that
// breaks with no spare, protected blocks (a filled chest) and liquids left alone, doors and tall flowers (both
// halves), undo and redo in survival counted exactly (no items made), creative (no drops), a player who leaves
// while blocks are breaking, and a second player destroying at the same time.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-tools-destroy.js --timeout 400
export default async function (t) {
  const { ItemStack, BlockPermutation, EnchantmentType } = t.mc;
  const dim = t.dimension;
  const Y = -60;

  const items = (p, id) => {
    const c = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) n += c.getItem(i).amount;
    return n;
  };
  /** Picks up the item entities near the player into a tally (and removes them). */
  const pickUp = (p, r = 6) => {
    const got = new Map();
    for (const e of dim.getEntities({ type: "minecraft:item", location: p.location, maxDistance: r })) {
      const s = e.getComponent("item").itemStack;
      got.set(s.typeId, (got.get(s.typeId) ?? 0) + s.amount);
      e.remove();
    }
    return got;
  };
  const allItemsNear = (loc, r = 40) => dim.getEntities({ type: "minecraft:item", location: loc, maxDistance: r }).map((e) => e.getComponent("item").itemStack);
  const count = (id, x0, y0, z0, x1, y1, z1) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (dim.getBlock({ x, y, z })?.typeId === id) n++;
    return n;
  };
  /** Runs a command and waits for the first matching message it causes (older messages are cleared first). */
  const run = async (p, cmd, pattern, opts = {}) => {
    t.clearMessages();
    const wait = t.waitMessage(p, pattern, opts);
    t.cmd(p, cmd);
    return wait;
  };
  const wall = (x, z, id) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 3; dy++) dim.setBlockType({ x: x + dx, y: Y + dy, z }, id);
  };
  /** Destroy here now at the block (x, Y, z) from 3 blocks south of it, facing north... we face south: stand at z-3. */
  const destroyHere = async (p, x, z, pattern = /Destroyed \d+ blocks?|Nothing was broken|Hold a pickaxe/) => {
    p.teleport({ x: x + 0.5, y: Y, z: z - 2.5 }, { rotation: { x: 0, y: 0 } });
    await t.wait(3);
    p.lookAtBlock({ x, y: Y, z });
    await t.wait(2);
    p.setRotation({ x: p.getRotation().x, y: 0 });
    t.answerForm(p, "Destroy mode", "Destroy here now", "Break them");
    const wait = t.waitMessage(p, pattern, { timeout: 400 });
    t.cmd(p, "/realm:build");
    return wait;
  };
  const hold = (p, stack, extra = []) => {
    const inv = p.getComponent("inventory").container;
    inv.clearAll();
    inv.setItem(0, stack);
    extra.forEach((s, i) => inv.setItem(9 + i, s));
    p.selectedSlotIndex = 0;
  };
  const tool = (id, ench = {}, damage = 0) => {
    const s = new ItemStack(id, 1);
    for (const [e, lvl] of Object.entries(ench)) s.getComponent("enchantable").addEnchantment({ type: new EnchantmentType(e), level: lvl });
    if (damage) s.getComponent("durability").damage = damage;
    return s;
  };

  await t.loadArea(0, 0, { radius: 4 });
  const sur = await t.player("Sur", { x: 0, z: 0, gameMode: "survival" });
  // A 3 x 3 x 1 wall, the default size (Wall 5 x 3 x 1 changed to 3 wide).
  t.answerForm(sur, "Choose a shape", 1, { Width: 3, Height: 3, Thickness: 1, Size: 0 });
  t.cmd(sur, "/realm:build");
  await t.waitMessage(sur, /build mode is on/i);
  t.cmd(sur, "/realm:build_mode");
  await run(sur, "/realm:build_destroy", /Destroy mode on/, { kind: "actionbar" });

  // 1. No tool in hand.
  wall(0, 4, "minecraft:stone");
  hold(sur, new ItemStack("minecraft:stick", 1));
  t.log((await destroyHere(sur, 0, 4)).plain);
  t.check(count("minecraft:stone", -1, Y, 4, 1, Y + 2, 4) === 9, "a stick breaks nothing");

  // 2. Wrong tool: a shovel on stone and planks; a wooden pickaxe on iron ore and obsidian; an axe on planks.
  wall(0, 4, "minecraft:stone");
  dim.setBlockType({ x: -1, y: Y, z: 4 }, "minecraft:oak_planks");
  dim.setBlockType({ x: 0, y: Y + 1, z: 4 }, "minecraft:dirt");
  dim.setBlockType({ x: 1, y: Y + 2, z: 4 }, "minecraft:glass");
  hold(sur, tool("minecraft:iron_shovel"));
  const sh = await destroyHere(sur, 0, 4);
  t.log("shovel:", sh.plain);
  t.check(count("minecraft:dirt", -1, Y, 4, 1, Y + 2, 4) === 0 && count("minecraft:glass", -1, Y, 4, 1, Y + 2, 4) === 0, "a shovel breaks dirt and glass");
  t.check(count("minecraft:stone", -1, Y, 4, 1, Y + 2, 4) === 6 && count("minecraft:oak_planks", -1, Y, 4, 1, Y + 2, 4) === 1, "but not stone or planks");
  const shDrops = pickUp(sur);
  t.log("shovel drops:", [...shDrops].join(" "));
  t.check((shDrops.get("minecraft:dirt") ?? 0) + items(sur, "minecraft:dirt") === 1 && !shDrops.has("minecraft:glass"), "dirt drops, glass doesn't (no Silk Touch)");
  hold(sur, tool("minecraft:iron_axe"));
  await destroyHere(sur, 0, 4);
  t.check(count("minecraft:oak_planks", -1, Y, 4, 1, Y + 2, 4) === 0 && count("minecraft:stone", -1, Y, 4, 1, Y + 2, 4) === 6, "an axe breaks the planks only");
  pickUp(sur);
  wall(0, 4, "minecraft:iron_ore");
  dim.setBlockType({ x: 0, y: Y, z: 4 }, "minecraft:obsidian");
  hold(sur, tool("minecraft:wooden_pickaxe"));
  t.log("wooden pickaxe:", (await destroyHere(sur, 0, 4)).plain);
  t.check(count("minecraft:iron_ore", -1, Y, 4, 1, Y + 2, 4) === 8 && count("minecraft:obsidian", -1, Y, 4, 1, Y + 2, 4) === 1, "a wooden pickaxe breaks no iron ore or obsidian");
  hold(sur, tool("minecraft:stone_pickaxe"));
  await destroyHere(sur, 0, 4);
  t.check(count("minecraft:iron_ore", -1, Y, 4, 1, Y + 2, 4) === 0 && count("minecraft:obsidian", -1, Y, 4, 1, Y + 2, 4) === 1, "a stone pickaxe breaks iron ore, not obsidian");
  const ore = pickUp(sur);
  t.check((ore.get("minecraft:raw_iron") ?? 0) === 8, `8 raw iron (${ore.get("minecraft:raw_iron")})`);
  dim.setBlockType({ x: 0, y: Y, z: 4 }, "minecraft:air");

  // 3. Silk Touch drops the blocks themselves, and undo charges exactly those.
  wall(0, 4, "minecraft:stone");
  dim.setBlockType({ x: 0, y: Y + 1, z: 4 }, "minecraft:diamond_ore");
  hold(sur, tool("minecraft:diamond_pickaxe", { silk_touch: 1 }));
  await destroyHere(sur, 0, 4);
  await t.wait(4);
  const silk = pickUp(sur);
  for (const [id, n] of silk) sur.getComponent("inventory").container.addItem(new ItemStack(id, n));
  t.log("silk touch:", [...silk].join(" "));
  t.check(items(sur, "minecraft:stone") === 8 && items(sur, "minecraft:diamond_ore") === 1, "Silk Touch: 8 stone and 1 diamond ore");
  await run(sur, "/realm:build_undo", /Undone: Destroy/, { kind: "actionbar" });
  t.check(count("minecraft:stone", -1, Y, 4, 1, Y + 2, 4) === 8 && count("minecraft:diamond_ore", -1, Y, 4, 1, Y + 2, 4) === 1, "undo put all 9 back");
  t.check(items(sur, "minecraft:stone") === 0 && items(sur, "minecraft:diamond_ore") === 0, "and took exactly those 9 items");
  await run(sur, "/realm:build_redo", /Redone: Destroy/, { kind: "actionbar" });
  t.check(items(sur, "minecraft:stone") === 8 && items(sur, "minecraft:diamond_ore") === 1 && count("minecraft:stone", -1, Y, 4, 1, Y + 2, 4) === 0, "redo broke them and gave the 9 back");
  await t.wait(4);
  t.check(allItemsNear(sur.location, 10).length === 0, "redo drops nothing on top");
  await run(sur, "/realm:build_undo", /Undone: Destroy/, { kind: "actionbar" });
  await run(sur, "/realm:build_redo", /Redone: Destroy/, { kind: "actionbar" });
  await t.wait(4);
  t.log("after undo + redo again:", items(sur, "minecraft:stone"), items(sur, "minecraft:diamond_ore"), count("minecraft:stone", -1, Y, 4, 1, Y + 2, 4), [...pickUp(sur)].join(" "));
  t.check(items(sur, "minecraft:stone") === 8 && items(sur, "minecraft:diamond_ore") === 1, "undo + redo again: still 9, none made");

  // 4. The tool breaks halfway: a spare of the same kind goes into the hand; then with no spare it stops.
  wall(0, 4, "minecraft:cobblestone");
  const worn = tool("minecraft:stone_pickaxe", {}, 0);
  const max = worn.getComponent("durability").maxDurability;
  worn.getComponent("durability").damage = max - 3;
  hold(sur, worn, [tool("minecraft:wooden_shovel"), tool("minecraft:golden_pickaxe")]);
  const br = await destroyHere(sur, 0, 4);
  t.log("worn pickaxe:", br.plain);
  t.check(count("minecraft:cobblestone", -1, Y, 4, 1, Y + 2, 4) === 0, "all 9 broke with the spare");
  t.check(sur.getComponent("inventory").container.getItem(0)?.typeId === "minecraft:golden_pickaxe", "the golden pickaxe was swapped in");
  t.check(items(sur, "minecraft:wooden_shovel") === 1, "the shovel stayed");
  pickUp(sur);
  wall(0, 4, "minecraft:cobblestone");
  const worn2 = tool("minecraft:stone_pickaxe");
  worn2.getComponent("durability").damage = worn2.getComponent("durability").maxDurability - 2;
  hold(sur, worn2);
  await destroyHere(sur, 0, 4);
  const stopped = await t.waitMessage(sur, /no spare/, { since: t.tick - 40 });
  t.log(stopped.plain);
  const leftC = count("minecraft:cobblestone", -1, Y, 4, 1, Y + 2, 4);
  t.check(leftC >= 6 && leftC <= 7, `it stopped when the tool broke (${leftC} left)`);
  t.check(!sur.getComponent("inventory").container.getItem(0), "the broken tool is gone");
  pickUp(sur);

  // 5. Protected blocks and liquids stay; a filled chest keeps its items.
  wall(0, 4, "minecraft:stone");
  dim.getBlock({ x: 0, y: Y + 1, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:chest"));
  dim.getBlock({ x: 0, y: Y + 1, z: 4 }).getComponent("inventory").container.setItem(0, new ItemStack("minecraft:emerald", 3));
  dim.setBlockType({ x: 1, y: Y + 2, z: 4 }, "minecraft:lava");
  dim.getBlock({ x: -1, y: Y + 2, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:standing_sign"));
  hold(sur, tool("minecraft:iron_pickaxe"));
  t.log("protected:", (await destroyHere(sur, 0, 4)).plain);
  const chest = dim.getBlock({ x: 0, y: Y + 1, z: 4 });
  t.check(chest.typeId === "minecraft:chest" && chest.getComponent("inventory").container.getItem(0)?.amount === 3, "the chest and its 3 emeralds stay");
  // The sign stands on stone that breaks: it pops off as an item, like mining that stone by hand would.
  t.log("the sign on top:", dim.getBlock({ x: -1, y: Y + 2, z: 4 }).typeId);
  pickUp(sur);
  t.server("/fill -3 -60 3 3 -55 6 air");

  // 6. Doors and tall flowers: both halves go, and undo can't make a half door or a free item.
  t.server("/fill -3 -60 3 3 -55 6 air");
  dim.getBlock({ x: -1, y: Y, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:wooden_door", { upper_block_bit: false, "minecraft:cardinal_direction": "north" }));
  dim.getBlock({ x: -1, y: Y + 1, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:wooden_door", { upper_block_bit: true, "minecraft:cardinal_direction": "north" }));
  dim.getBlock({ x: 1, y: Y, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:sunflower", { upper_block_bit: false }));
  dim.getBlock({ x: 1, y: Y + 1, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:sunflower", { upper_block_bit: true }));
  dim.setBlockType({ x: 0, y: Y, z: 4 }, "minecraft:oak_planks");
  await t.wait(2);
  hold(sur, tool("minecraft:iron_axe"));
  t.log("door:", (await destroyHere(sur, 0, 4)).plain);
  await t.wait(4);
  const doorDrops = pickUp(sur);
  t.log("door drops:", [...doorDrops].join(" "));
  t.check(count("minecraft:wooden_door", -1, Y, 4, -1, Y + 1, 4) === 0 && count("minecraft:sunflower", 1, Y, 4, 1, Y + 1, 4) === 0, "the door and the sunflower broke");
  t.check((doorDrops.get("minecraft:wooden_door") ?? doorDrops.get("minecraft:oak_door") ?? 0) === 1, "one door dropped");
  // Undo with no door and no sunflower in the inventory: nothing half-built.
  const inv = sur.getComponent("inventory").container;
  inv.addItem(new ItemStack("minecraft:oak_planks", 1));
  await run(sur, "/realm:build_undo", /Undone: Destroy|Not enough|Out of blocks/);
  await t.wait(3);
  const halves = [Y, Y + 1].map((y) => `${dim.getBlock({ x: -1, y, z: 4 }).typeId}/${dim.getBlock({ x: 1, y, z: 4 }).typeId}`);
  t.log("after undo without a door:", halves.join(" "));
  t.check(dim.getBlock({ x: -1, y: Y + 1, z: 4 }).typeId !== "minecraft:wooden_door" || dim.getBlock({ x: -1, y: Y, z: 4 }).typeId === "minecraft:wooden_door", "no lone top half of a door");
  t.check(dim.getBlock({ x: 1, y: Y + 1, z: 4 }).typeId !== "minecraft:sunflower" || dim.getBlock({ x: 1, y: Y, z: 4 }).typeId === "minecraft:sunflower", "no lone top half of a sunflower");
  // Break whatever came back by hand: no more doors than the one we had.
  for (const y of [Y + 1, Y]) for (const x of [-1, 1]) if (!dim.getBlock({ x, y, z: 4 }).isAir) dim.runCommand(`setblock ${x} ${y} 4 air destroy`);
  await t.wait(4);
  const extra = pickUp(sur);
  t.log("hand-broken after undo:", [...extra].join(" "));
  t.check(!extra.has("minecraft:wooden_door") && !extra.has("minecraft:sunflower"), "no free door or sunflower");
  t.server("/fill -3 -60 3 3 -55 6 air");
  // Again, now with a door and a sunflower to pay: undo puts back both halves of each.
  const twoHalves = () => {
    dim.getBlock({ x: -1, y: Y, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:wooden_door", { upper_block_bit: false, "minecraft:cardinal_direction": "north" }));
    dim.getBlock({ x: -1, y: Y + 1, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:wooden_door", { upper_block_bit: true, "minecraft:cardinal_direction": "north" }));
    dim.getBlock({ x: 1, y: Y, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:sunflower", { upper_block_bit: false }));
    dim.getBlock({ x: 1, y: Y + 1, z: 4 }).setPermutation(BlockPermutation.resolve("minecraft:sunflower", { upper_block_bit: true }));
    dim.setBlockType({ x: 0, y: Y, z: 4 }, "minecraft:oak_planks");
  };
  twoHalves();
  await t.wait(2);
  hold(sur, tool("minecraft:iron_axe"));
  await destroyHere(sur, 0, 4);
  await t.wait(4);
  pickUp(sur);
  hold(sur, tool("minecraft:iron_axe"), [new ItemStack("minecraft:wooden_door", 1), new ItemStack("minecraft:sunflower", 1), new ItemStack("minecraft:oak_planks", 1)]);
  await run(sur, "/realm:build_undo", /Undone: Destroy|Not enough|Out of blocks/);
  await t.wait(3);
  t.check(count("minecraft:wooden_door", -1, Y, 4, -1, Y + 1, 4) === 2 && count("minecraft:sunflower", 1, Y, 4, 1, Y + 1, 4) === 2, "undo put back both halves of the door and the sunflower");
  t.check(items(sur, "minecraft:wooden_door") === 0 && items(sur, "minecraft:sunflower") === 0, `for one door and one sunflower (left: ${items(sur, "minecraft:wooden_door")} ${items(sur, "minecraft:sunflower")} ${items(sur, "minecraft:oak_planks")})`);
  await run(sur, "/realm:build_redo", /Redone: Destroy/, { kind: "actionbar" });
  await t.wait(3);
  t.check(items(sur, "minecraft:wooden_door") === 1 && items(sur, "minecraft:sunflower") === 1 && items(sur, "minecraft:oak_planks") === 1 && allItemsNear(sur.location, 10).length === 0, "redo gave back one door and one sunflower, nothing dropped");
  // Breaking a block by hand in destroy mode: the door and the sunflower in the shape go whole.
  twoHalves();
  dim.setBlockType({ x: 0, y: Y, z: 4 }, "minecraft:oak_planks");
  sur.teleport({ x: 0.5, y: Y, z: 1.5 }, { rotation: { x: 0, y: 0 } });
  hold(sur, tool("minecraft:iron_axe"));
  await t.wait(3);
  const sinceBreak = t.tick;
  sur.breakBlock({ x: 0, y: Y, z: 4 }, t.mc.Direction.North);
  t.log("break the planks:", (await t.waitMessage(sur, /Destroyed|Nothing/, { since: sinceBreak })).plain);
  await t.wait(4);
  t.check(count("minecraft:wooden_door", -1, Y, 4, -1, Y + 1, 4) === 0, "the door broke with the shape");
  pickUp(sur);
  hold(sur, tool("minecraft:iron_axe"), [new ItemStack("minecraft:wooden_door", 1), new ItemStack("minecraft:sunflower", 1)]);
  await run(sur, "/realm:build_undo", /Undone: Destroy|Not enough|Out of blocks|Nothing/);
  await t.wait(3);
  t.log("after undo:", [Y, Y + 1].map((y) => `${dim.getBlock({ x: -1, y, z: 4 }).typeId}/${dim.getBlock({ x: 1, y, z: 4 }).typeId}`).join(" "));
  t.check(count("minecraft:wooden_door", -1, Y, 4, -1, Y + 1, 4) === 2 && count("minecraft:sunflower", 1, Y, 4, 1, Y + 1, 4) === 2, "undo put the door and the sunflower back whole");
  t.check(items(sur, "minecraft:wooden_door") === 0 && items(sur, "minecraft:sunflower") === 0, "for one of each");
  t.server("/fill -3 -60 3 3 -55 6 air");

  // Silk Touch: a door drops one door, a double slab two slabs, budding amethyst nothing.
  twoHalves();
  dim.setBlockType({ x: 1, y: Y, z: 4 }, "minecraft:air");
  dim.setBlockType({ x: 1, y: Y + 1, z: 4 }, "minecraft:air");
  dim.setBlockType({ x: 0, y: Y + 1, z: 4 }, "minecraft:oak_double_slab");
  dim.setBlockType({ x: 1, y: Y, z: 4 }, "minecraft:oak_planks");
  hold(sur, tool("minecraft:iron_axe", { silk_touch: 1 }));
  await destroyHere(sur, 0, 4);
  await t.wait(6);
  const silkDrops = pickUp(sur);
  for (const id of ["minecraft:wooden_door", "minecraft:oak_slab", "minecraft:oak_planks"]) silkDrops.set(id, (silkDrops.get(id) ?? 0) + items(sur, id));
  t.log("silk touch axe:", [...silkDrops].join(" "));
  t.check(silkDrops.get("minecraft:wooden_door") === 1, `Silk Touch on a door: one door (${silkDrops.get("minecraft:wooden_door")})`);
  t.check(silkDrops.get("minecraft:oak_slab") === 2, `Silk Touch on a double slab: two slabs (${silkDrops.get("minecraft:oak_slab")})`);
  dim.setBlockType({ x: 0, y: Y, z: 4 }, "minecraft:budding_amethyst");
  hold(sur, tool("minecraft:iron_pickaxe", { silk_touch: 1 }));
  await destroyHere(sur, 0, 4);
  await t.wait(6);
  t.check(items(sur, "minecraft:budding_amethyst") === 0 && !pickUp(sur).has("minecraft:budding_amethyst"), "Silk Touch: no budding amethyst");
  t.server("/fill -3 -60 3 3 -55 6 air");

  // 7. Creative: no drops; two players at once; a player who leaves mid-destroy.
  const cre = await t.player("Cre", { x: 40, z: 0, gameMode: "creative" });
  t.answerForm(cre, "Choose a shape", 1, { Width: 31, Height: 31, Thickness: 4, Size: 0 });
  t.cmd(cre, "/realm:build");
  await t.waitMessage(cre, /build mode is on/i);
  t.cmd(cre, "/realm:build_mode");
  await run(cre, "/realm:build_destroy", /Destroy mode on/, { kind: "actionbar" });
  t.server("/fill 25 -60 6 55 -30 9 stone");
  t.server("/fill -15 -60 26 15 -30 29 stone");
  const sur2 = sur;
  t.answerForm(sur2, "Choose a shape", 1, { Width: 31, Height: 31, Thickness: 4, Size: 0 });
  t.cmd(sur2, "/realm:build");
  await t.waitMessage(sur2, /build mode is on/i);
  t.cmd(sur2, "/realm:build_mode");
  hold(sur2, tool("minecraft:netherite_pickaxe", { unbreaking: 3 }));
  hold(cre, tool("minecraft:diamond_pickaxe"));
  const a = destroyHere(cre, 40, 6, /Destroyed \d+ blocks?/);
  const b = destroyHere(sur2, 0, 26, /Destroyed \d+ blocks?/);
  const [ma, mb] = await Promise.all([a, b]);
  t.log("together:", ma.plain, "|", mb.plain);
  t.check(count("minecraft:stone", 25, Y, 6, 55, Y + 30, 9) === 0, "creative wall gone");
  const creDrops = dim.getEntities({ type: "minecraft:item", location: { x: 40, y: Y + 15, z: 7 }, maxDistance: 25 }).map((e) => `${e.getComponent("item").itemStack.typeId} at ${Math.floor(e.location.x)} ${Math.floor(e.location.z)}`);
  t.check(creDrops.length === 0, `creative: no drops (${creDrops.join(", ")})`);
  t.check(count("minecraft:stone", -15, Y, 26, 15, Y + 30, 29) === 0, "survival wall gone too");
  const survDrops = allItemsNear(sur2.location, 6).reduce((n, s) => n + s.amount, 0) + items(sur2, "minecraft:cobblestone");
  t.log("survival drops at the feet:", survDrops);
  t.check(survDrops === 31 * 31 * 4, `every broken stone dropped one cobblestone at the feet (${survDrops} of ${31 * 31 * 4})`);
  pickUp(sur2, 10);
  // Leaves mid-destroy.
  t.server("/fill 25 -60 6 55 -30 9 stone");
  const gone = destroyHere(cre, 40, 6, /Destroyed|Nothing/).catch(() => undefined);
  await t.waitUntil(() => t.forms(cre).some((f) => f.title === "Destroy" && f.answered), { timeout: 200 });
  await t.wait(2);
  cre.disconnect();
  await t.wait(60);
  void gone;
  t.log("blocks left after leaving mid-destroy:", count("minecraft:stone", 25, Y, 6, 55, Y + 30, 9));
}
