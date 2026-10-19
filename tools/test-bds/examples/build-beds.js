// Easy Building beds through the pack's own place, destroy, and undo.
// Queued for the lead. Do not treat a local author run as a pass.
// node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp --scenario tools/test-bds/examples/build-beds.js --timeout 300
export default async function (t) {
  const { BlockPermutation, ItemStack } = t.mc;
  await t.loadArea(0, 0, { radius: 6 });
  const p = await t.player("BedBuilder", { x: 0, z: 0, gameMode: "survival", op: true });
  const dim = p.dimension;
  const items = (id) => {
    const c = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) n += c.getItem(i).amount;
    return n;
  };

  let resolved = false;
  try { BlockPermutation.resolve("minecraft:end_gateway"); resolved = true; } catch { resolved = false; }
  const gate = { x: 2, y: -58, z: 2 };
  const set = t.cmd(p, `/setblock ${gate.x} ${gate.y} ${gate.z} end_gateway`);
  const gateType = dim.getBlock(gate)?.typeId;
  t.log(`end_gateway resolve=${resolved} setblock=${set.statusMessage ?? set.status} type=${gateType}`);
  t.check(!(resolved && gateType !== "minecraft:end_gateway"), "a resolved end_gateway must place");
  t.check(!(!resolved && gateType === "minecraft:end_gateway"), "an unresolved end_gateway must not place");

  p.giveItem(new ItemStack("minecraft:bed", 1), true);
  p.selectedSlotIndex = 0;
  const formP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
  const form = await formP;
  const line = form.buttons.findIndex((b) => /Line/i.test(b));
  t.assert(line >= 0, "Line mode is in the menu");
  form.answer(line);
  await t.wait(5);
  const foot = { x: 4, y: -60, z: 4 };
  p.lookAtBlock({ x: foot.x, y: foot.y - 1, z: foot.z });
  p.useItemInSlot(0);
  await t.wait(10);
  const head = { x: foot.x, y: foot.y, z: foot.z + 1 };
  t.check(dim.getBlock(foot)?.typeId === "minecraft:bed" && dim.getBlock(head)?.typeId === "minecraft:bed", "pack place keeps both bed halves");
  t.check(items("minecraft:bed") === 0, "one bed item was charged");
  t.assert(t.cmd(p, "/realm:build_undo").ok, "/realm:build_undo ran");
  await t.wait(5);
  t.check(dim.getBlock(foot)?.typeId !== "minecraft:bed" && dim.getBlock(head)?.typeId !== "minecraft:bed", "undo removes both halves");
  t.check(items("minecraft:bed") === 1, "undo refunds one bed");
  t.assert(t.cmd(p, "/realm:build_redo").ok, "/realm:build_redo ran");
  await t.wait(5);
  t.check(dim.getBlock(foot)?.typeId === "minecraft:bed" && dim.getBlock(head)?.typeId === "minecraft:bed", "redo restores both halves");

  if (gateType === "minecraft:end_gateway") {
    const menu = t.waitForm(p, { timeout: 100 });
    t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
    const destroy = await menu;
    const idx = destroy.buttons.findIndex((b) => /Destroy/i.test(b));
    t.assert(idx >= 0, "Destroy mode is in the menu");
    destroy.answer(idx);
    await t.wait(5);
    p.giveItem(new ItemStack("minecraft:diamond_pickaxe", 1), true);
    p.lookAtBlock(gate);
    p.breakBlock(gate);
    await t.wait(5);
    t.check(dim.getBlock(gate)?.typeId === "minecraft:end_gateway", "destroy mode left end_gateway in place");
  } else {
    t.check(resolved === false, "end_gateway stayed unbreakable because native resolve and setblock did not prove the id");
  }
}
