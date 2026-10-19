// Native Line placement through both real block interactions, then the real undo/redo commands.
// This does not certify every mode, physical mouse input, or the destruction path.
// node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp --scenario tools/test-bds/examples/build-beds.js --timeout 300
export default async function (t) {
  const { BlockPermutation, ItemStack } = t.mc;
  await t.loadArea(0, 0, { radius: 2 });
  const p = await t.player("BedBuilder", { x: 4, z: 1, gameMode: "survival", op: true });
  const dim = p.dimension;
  const floor = Math.floor(p.location.y) - 1;
  const support = { x: 4, y: floor + 2, z: 4 };
  const foot = { x: support.x, y: support.y + 1, z: support.z };
  const head = { x: foot.x, y: foot.y, z: foot.z + 1 };
  for (const at of [support, { ...support, z: support.z + 1 }, { x: 4, y: floor + 3, z: 1 }])
    t.assert(t.server(`setblock ${at.x} ${at.y} ${at.z} stone`).ok, "native fixture support placed");
  p.teleport({ x: 4.5, y: floor + 4, z: 1.5 });
  const items = (id) => {
    const c = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) n += c.getItem(i).amount;
    return n;
  };

  let resolved = false;
  try { BlockPermutation.resolve("minecraft:end_gateway"); resolved = true; } catch { resolved = false; }
  const gate = { x: 12, y: floor + 1, z: 0 };
  const set = t.cmd(p, `/setblock ${gate.x} ${gate.y} ${gate.z} end_gateway`);
  const gateType = dim.getBlock(gate)?.typeId;
  t.log(`end_gateway resolve=${resolved} setblock.ok=${set.ok} native type=${gateType}`);
  t.check(resolved || gateType === "minecraft:end_gateway", "native APIs recognize end_gateway, so its unbreakable guard must remain");

  p.giveItem(new ItemStack("minecraft:bed", 1), true);
  p.selectedSlotIndex = 0;
  const formP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
  const form = await formP;
  const line = form.buttons.findIndex((b) => /Line/i.test(b));
  t.assert(line >= 0, "Line mode is in the menu");
  form.answer(line);
  await t.wait(5);
  p.lookAtBlock(support);
  const anchorSince = t.tick;
  p.useItemInSlotOnBlock(0, support, t.mc.Direction.Up);
  await t.waitMessage(p, /Anchor set/i, { since: anchorSince, kind: "actionbar", timeout: 100 });
  t.check(items("minecraft:bed") === 1, "setting the anchor preserves the one survival bed");
  await t.wait(6); // the production interaction debounce is 200 real milliseconds
  p.lookAtBlock(support);
  const placedSince = t.tick;
  p.useItemInSlotOnBlock(0, support, t.mc.Direction.Up);
  await t.waitMessage(p, /blocks.*placed/i, { since: placedSince, kind: "actionbar", timeout: 120 });
  await t.wait(5);
  t.check(dim.getBlock(foot)?.typeId === "minecraft:bed" && dim.getBlock(head)?.typeId === "minecraft:bed", "pack place keeps both bed halves");
  t.check(items("minecraft:bed") === 0, "one bed item was charged");
  t.assert(t.cmd(p, "/realm:build_undo").ok, "/realm:build_undo ran");
  await t.wait(5);
  t.check(dim.getBlock(foot)?.typeId !== "minecraft:bed" && dim.getBlock(head)?.typeId !== "minecraft:bed", "undo removes both halves");
  t.check(items("minecraft:bed") === 1, "undo refunds one bed");
  t.assert(t.cmd(p, "/realm:build_redo").ok, "/realm:build_redo ran");
  await t.wait(5);
  t.check(dim.getBlock(foot)?.typeId === "minecraft:bed" && dim.getBlock(head)?.typeId === "minecraft:bed", "redo restores both halves");

}
