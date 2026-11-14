// Easy Building's longest ticks on big jobs (W7, BSE-01/02/28): one creative builder, every click a real one
// (useItemInSlotOnBlock), in named phases for the profiler. Meant for run.mjs --profile (validate.yml's scenario pairs
// run it on the base and the head tree); it reports perf-workload so each phase's ms/tick and slowest tick are listed.
//   node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp --scenario tools/test-bds/examples/build-big-perf.js --timeout 1500
// Phases:
//   preview: a 20x20 Cube footprint held while the height changes every 15 ticks for 20 s (each height a 20x20xH
//     shape of up to 8,000 cells that the deferred preview solves once it rests 10 ticks);
//   place8k: that cube confirmed at 20 high (8,000 blocks);
//   place: a 40x40x30 Cube (48,000 blocks) from the first click to the last block written;
//   copy: the same box copied (48,000 cells read);
//   paste: the copy pasted beside it (48,000 queued writes);
//   cut: the first box cut (48,000 cells read and set to air).
// Checks only that each job finished; the figures are the point.
export default async function (t) {
  const { ItemStack, Direction } = t.mc;
  const T0 = t.tick;
  await t.loadArea(50, 20, { radius: 4 });
  const p = await t.player("BigBuilder", { x: 0, z: 0, gameMode: "creative", op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const ow = p.dimension;
  const G = Math.floor(p.location.y) - 1; // the ground's top block
  const Y = G + 1;                        // the first layer above it
  inv.setItem(0, new ItemStack("minecraft:stone", 64));
  p.selectedSlotIndex = 0;
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "bbp1", pack: "build_bp", key: "floatingUI", value: false, player: p.id }));
  await t.wait(4);

  // One player for the whole window: count it every second (perf-workload retention).
  let samples = 0, minValid = 1;
  const sampler = t.system.runInterval(() => { samples++; if (!p.isValid) minValid = 0; }, 20);
  const typeAt = (pos) => { try { return ow.getBlock(pos)?.typeId; } catch { return undefined; } };
  const phases = [];
  let current = null;
  const begin = (name) => { current = { name, startTick: t.tick }; t.log(`phase ${name} starts`); };
  const end = () => { current.endTick = t.tick; phases.push(current); t.log(`phase ${current.name}: ${((current.endTick - current.startTick) / 20).toFixed(1)} s`); current = null; };

  const pickMode = async (re) => {
    const formP = t.waitForm(p, { timeout: 100 });
    t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
    const form = await formP;
    const i = form.buttons.findIndex((b) => re.test(b));
    t.assert(i >= 0, `mode ${re} is in the menu (${form.buttons.join(" | ")})`);
    form.answer(i);
    // Some modes open their options next (Copy / Paste: the clipboard or Done): close it with its last button.
    await t.wait(10);
    for (const f of t.forms(p)) if (!f.answered && f.buttons?.length) f.answer(f.buttons.length - 1);
    await t.wait(4);
  };
  const stand = async (x, z, y = Y) => { p.teleport({ x: x + 0.5, y, z: z + 0.5 }); await t.wait(3); };
  /** A real click on a block (the anchor gaps are 200 ms, so wait 6 ticks after). */
  const click = async (pos, face = Direction.Up) => {
    const used = p.useItemInSlotOnBlock(0, pos, face);
    if (!used) t.log(`click on ${pos.x},${pos.y},${pos.z} ${face}: not used`);
    p.stopUsingItem();
    p.stopInteracting();
    await t.wait(6);
  };
  const lookAt = async (loc) => { p.lookAtLocation(loc); await t.wait(2); };
  const waitBar = (re, since, timeout = 400) => t.waitMessage(p, re, { since, kind: "actionbar", pack: "build_bp", timeout });

  // Cube: click the ground at the first corner (the anchor), the ground at the opposite corner (the footprint), then
  // a height read from the aim 6 blocks from that corner's column.
  const cubeCorners = async (a, b) => {
    await stand(a.x, a.z - 3);
    await lookAt({ x: a.x + 0.5, y: G + 1, z: a.z + 0.5 });
    let since = t.tick;
    await click({ x: a.x, y: G, z: a.z });
    await waitBar(/anchor_set/, since);
    await stand(b.x + 3, b.z + 2);
    await lookAt({ x: b.x + 0.5, y: G + 0.95, z: b.z + 0.5 });
    since = t.tick;
    await click({ x: b.x, y: G, z: b.z });
    await waitBar(/xz_set/, since);
    await stand(b.x, b.z + 6);
  };
  const aimHeight = async (b, top) => lookAt({ x: b.x + 0.5, y: top + 0.5, z: b.z + 0.5 });

  await pickMode(/Cube/i);

  // preview + place8k
  const pa = { x: 2, z: -30 }, pb = { x: 21, z: -11 };
  await cubeCorners(pa, pb);
  begin("preview");
  for (let k = 0; k < 26; k++) {
    await aimHeight(pb, Y + 11 + (k % 9)); // 12 to 20 high
    await t.wait(13);
  }
  end();
  begin("place8k");
  await aimHeight(pb, Y + 19);
  await t.wait(2);
  let since = t.tick;
  await click({ x: pb.x, y: G, z: pb.z + 6 });
  await waitBar(/eb\.bar\.placed|blocks .*placed/, since);
  await t.waitUntil(() => typeAt({ x: pb.x, y: Y + 19, z: pb.z }) === "minecraft:stone", { timeout: 1200, interval: 10, message: "the 20x20x20 cube is built" });
  end();

  // place: 40x40x30
  const a = { x: 2, z: 2 }, b = { x: 41, z: 41 };
  const TOP = Y + 29;
  await cubeCorners(a, b);
  await aimHeight(b, TOP);
  await t.wait(2);
  begin("place");
  since = t.tick;
  await click({ x: b.x, y: G, z: b.z + 6 });
  await waitBar(/eb\.bar\.placed|blocks .*placed/, since);
  await t.waitUntil(() => typeAt({ x: b.x, y: TOP, z: b.z }) === "minecraft:stone" && typeAt({ x: a.x, y: Y, z: a.z }) === "minecraft:stone",
    { timeout: 3000, interval: 10, message: "the 40x40x30 box is built" });
  end();

  // copy: sneak-clicks pick the blocks themselves as corners (the low corner, the far low corner, the far top corner)
  await pickMode(/Copy/i);
  // Corner 1 (sneaking picks the clicked block itself: the low corner of the box), then from the top of the box
  // corner 2 (only its x and z count: the face cell above the far top corner) and the height (the y of the face cell
  // beside that corner).
  const selectBox = async () => {
    t.echoActionBar = true;
    p.isSneaking = true;
    await stand(a.x, a.z - 2);
    let at = t.tick;
    await click({ x: a.x, y: Y, z: a.z }, Direction.North);
    await waitBar(/copy_corner1/, at, 60);
    p.isSneaking = false;
    await t.wait(4);
    await stand(b.x - 1, b.z - 1, TOP + 1);
    at = t.tick;
    await click({ x: b.x, y: TOP, z: b.z }, Direction.Up);
    await waitBar(/copy_corner2/, at, 60);
    t.echoActionBar = false;
    const formP = t.waitForm(p, { timeout: 100 });
    p.setRotation({ x: 30, y: 0 });
    await click({ x: b.x, y: TOP, z: b.z }, Direction.East);
    return formP;
  };
  let form = await selectBox();
  begin("copy");
  since = t.tick;
  form.answer(0);
  await waitBar(/copy_done/, since);
  end();

  // paste: beside the box, facing the same way as at the copy (so no rotation)
  await stand(60, -1);
  p.setRotation({ x: 30, y: 0 });
  await t.wait(70); // the paste preview's 3 s steady countdown does not matter: a click pastes at once
  begin("paste");
  since = t.tick;
  await click({ x: 60, y: G, z: 2 });
  await waitBar(/pasted/, since, 1200);
  await t.waitUntil(() => typeAt({ x: 99, y: TOP, z: 41 }) === "minecraft:stone", { timeout: 3000, interval: 10, message: "the paste is written" });
  end();

  // cut: clear the clipboard (sneak-click), select the first box again and cut it
  p.isSneaking = true;
  await click({ x: 60, y: G, z: -2 });
  p.isSneaking = false;
  await t.wait(6);
  form = await selectBox();
  begin("cut");
  since = t.tick;
  form.answer(1);
  await waitBar(/cut_done/, since, 1200);
  await t.waitUntil(() => typeAt({ x: b.x, y: TOP, z: b.z }) === "minecraft:air" && typeAt({ x: a.x, y: Y, z: a.z }) === "minecraft:air",
    { timeout: 3000, interval: 10, message: "the cut box is empty" });
  end();

  t.system.clearRun(sampler);
  const ticks = t.tick - phases[0].startTick;
  const seconds = Math.floor(ticks / 20);
  t.report("perf-workload", {
    schema: 1, declared: { players: 1, seconds }, spawned: 1, spawnGameSeconds: (phases[0].startTick - T0) / 20,
    kinds: { land: 1, water: 0, nether: 0, groups: 1 },
    soak: { startTick: phases[0].startTick, endTick: t.tick, ticks, seconds: ticks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: p.isValid ? 1 : 0 },
    phases,
  });
  t.check(phases.length === 6, `every job finished (${phases.map((ph) => ph.name).join(", ")})`);
}
