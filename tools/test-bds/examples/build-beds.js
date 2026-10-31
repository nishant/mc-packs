// Native runtime Line pipeline: real first block interaction, then the unchanged owning-addon
// main.confirmPlacement entrypoint via an explicit test-only Server bridge. NOT second-input proof.
// Actual native items, world blocks and real undo/redo commands are checked; not all modes or physical input.
//   node tools/test-bds/build-beds.mjs
export default async function (t) {
  const { BlockPermutation, ItemStack } = t.mc;
  await t.loadArea(0, 0, { radius: 2 });
  const p = await t.player("BedBuilder", { x: 4, z: 1, gameMode: "survival", op: true });
  const dim = p.dimension;
  const interactions = [];
  t.world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    if (event.player.id === p.id) interactions.push({ tick: t.tick, at: event.block.location, face: event.blockFace, item: event.itemStack?.typeId });
  });
  const floor = Math.floor(p.location.y) - 1;
  const support = { x: 4, y: floor + 2, z: 4 };
  const confirmSupport = { x: 6, y: support.y, z: support.z };
  const foot = { x: support.x, y: support.y + 1, z: support.z };
  const head = { x: foot.x, y: foot.y, z: foot.z + 1 };
  for (const at of [support, { ...support, z: support.z + 1 }, confirmSupport, { ...confirmSupport, x: confirmSupport.x + 1 },
    { x: 4, y: floor + 3, z: 1 }, { x: 3, y: floor + 3, z: 4 }])
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

  let preference;
  const sub = t.system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== "realm:cfg_ack") return;
    const m = JSON.parse(event.message);
    if (m.id === "native-bed-ui") preference = m;
  }, { namespaces: ["realm"] });
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "native-bed-ui", pack: "build_bp", key: "floatingUI", value: false, player: p.id }));
  await t.waitUntil(() => preference, { timeout: 80, message: "the owning Build addon acknowledged the plain-menu preference" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
  t.assert(preference.ok === true, `plain-menu preference accepted (${preference.error ?? "ok"})`);
  p.giveItem(new ItemStack("minecraft:bed", 1), true);
  p.selectedSlotIndex = 0;
  const formP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
  const form = await formP;
  const line = form.buttons.findIndex((b) => /Line/i.test(b));
  t.assert(line >= 0, "Line mode is in the menu");
  const options = t.waitForm(p, { title: /options/i, timeout: 100 });
  form.answer(line);
  (await options).answer(null);
  await t.wait(5);
  p.lookAtBlock(support);
  const anchorSince = t.tick;
  t.log(`first native use returned ${p.useItemInSlotOnBlock(0, support, t.mc.Direction.Up)}`);
  await t.waitMessage(p, /anchor[ _]set/i, { since: anchorSince, kind: "actionbar", timeout: 100 });
  t.check(items("minecraft:bed") === 1, "setting the anchor preserves the one survival bed");
  p.stopUsingItem();
  p.stopInteracting();
  await t.wait(6); // the production interaction debounce is 200 real milliseconds
  p.teleport({ x: 3.5, y: floor + 4, z: 4.5 });
  p.lookAtBlock(confirmSupport); // a nonzero x-axis line; the captured bed direction remains south
  const placedSince = t.tick;
  let pipelineReport;
  const pipelineSub = t.system.afterEvents.scriptEventReceive.subscribe((event) => {
    if (event.id !== "realm:build_pipeline_test_report") return;
    const m = JSON.parse(event.message);
    if (m.player === p.id) pipelineReport = m;
  }, { namespaces: ["realm"] });
  t.system.sendScriptEvent("realm:build_pipeline_test", JSON.stringify({ player: p.id, fallback: { x: 6, y: foot.y, z: foot.z } }));
  await t.waitUntil(() => pipelineReport, { timeout: 80, message: "owning-addon main.confirmPlacement was invoked" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(pipelineSub);
  t.assert(pipelineReport.nativeSecondInput === false && pipelineReport.entrypoint === "main.confirmPlacement", "this is a native logic test, explicitly not second-input acceptance");
  t.log(`Actual native before-interact deliveries: ${interactions.length}; test-only main confirmations: 1`);
  try {
    await t.waitMessage(p, /\.placed(?:\(|\s|$)|\bblocks.*placed\b/i, { since: placedSince, kind: "actionbar", timeout: 120 });
  } catch (error) {
    t.log(JSON.stringify({ interactions, foot: dim.getBlock(foot)?.typeId, head: dim.getBlock(head)?.typeId,
      beds: items("minecraft:bed"), bars: t.messages(p, { kind: "actionbar", since: anchorSince }).slice(-8).map((m) => m.plain) }));
    throw error;
  }
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
