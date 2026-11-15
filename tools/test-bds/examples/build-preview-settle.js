// Easy Building's deferred preview settles once and stays settled while the aim rests (BSE-28). Run with
//   node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp --scenario tools/test-bds/examples/build-preview-settle.js --timeout 300
// A creative player in Floor mode sets a destroy anchor with a pickaxe and holds the aim still on a corner 20 blocks
// away for 160 ticks. With "defer shape" on (the default) the preview first draws the region box ("... region" above
// the hotbar), then, after 10 still ticks, solves the shape ("400 blocks ..."). Before the fix the draw cadence was part
// of the cache key and the solve changed it (a destroy outline always draws every tick, the 20x20 box every 2 ticks),
// so the cached shape was never found again: the preview went back to the box and solved the same shape again about
// every 13 ticks, as long as the player aimed (about 10 solves in 160 ticks). Now it solves once.
export default async function (t) {
  const { ItemStack } = t.mc;
  await t.loadArea(10, 10, { radius: 3 });
  const p = await t.player("Settler", { x: 0, z: 0, gameMode: "creative", op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const floor = Math.floor(p.location.y) - 1;

  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "ps1", pack: "build_bp", key: "floatingUI", value: false, player: p.id }));
  await t.wait(2);
  const formP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
  const form = await formP;
  const floorIdx = form.buttons.findIndex((b) => /Floor/i.test(b) && !/Slope/i.test(b));
  t.assert(floorIdx >= 0, `Floor mode button is in /realm:build menu (${form.buttons.join(" | ")})`);
  form.answer(floorIdx);
  await t.wait(10);

  inv.setItem(0, new ItemStack("minecraft:diamond_pickaxe", 1));
  p.selectedSlotIndex = 0;
  const first = { x: 2, y: floor, z: 2 };
  p.lookAtBlock(first);
  await t.wait(4);
  let since = t.tick;
  p.useItemInSlotOnBlock(0, first, t.mc.Direction.Up);
  await t.waitMessage(p, /destroy_anchor_set|anchor/i, { since, kind: "actionbar", timeout: 100 });
  p.stopUsingItem();
  p.stopInteracting();

  // Aim at the far corner of a 20x20 floor and keep still (the anchor's own bar lock lasts a second).
  p.lookAtBlock({ x: 21, y: floor, z: 21 });
  await t.wait(30);
  since = t.tick;
  await t.wait(160);
  const bars = t.messages(p, { kind: "actionbar", pack: "build_bp", since });
  let solves = 0, boxes = 0, last = "";
  for (const m of bars) {
    const kind = /deferred_head|region/.test(m.plain) ? "box" : /\d+ blocks/.test(m.plain) ? "shape" : "";
    if (!kind) continue;
    if (kind === "box") boxes++;
    if (kind === "shape" && last !== "shape") solves++;
    last = kind;
  }
  t.log(`160 still ticks: ${bars.length} bar writes, ${boxes} box bars, ${solves} solves (last: ${bars.at(-1)?.plain ?? "-"})`);
  t.check(solves >= 1, "the shape was solved");
  t.check(solves <= 1, `the shape was solved once while the aim rested, not again and again (${solves} solves)`);
  t.check(last === "shape", "the preview stays on the solved shape");
}
