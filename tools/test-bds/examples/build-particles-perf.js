// Easy Building's preview particles while a builder holds still (W8: BSE-03, BSE-05, BSE-29, BSE-30): one creative
// builder, every click a real one (useItemInSlotOnBlock), in named phases for the profiler. Meant for run.mjs --profile
// (validate.yml's scenario pairs run it on the base and the head tree); it reports perf-workload so each phase's
// ms/tick and slowest tick are listed, and the profile JSON counts build_bp's spawnParticle and setActionBar calls.
//   node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp --scenario tools/test-bds/examples/build-particles-perf.js --timeout 1500
// Phases (15 s each, the aim changing height every 5 s, otherwise still):
//   outline: a 20x20x20 Cube outline held in the air (place);
//   destroy: the same Cube with a pickaxe over a 20x20x20 stone cube (a destroy outline, with spare pickaxes in the
//     inventory, whose uses left are on the action bar);
//   mirror: a Mirror on (its default X plane) with stone in hand and no anchor, the player stepping up and down.
// Checks only that each phase ran; the figures are the point.
export default async function (t) {
  const { ItemStack, Direction } = t.mc;
  const T0 = t.tick;
  await t.loadArea(60, 30, { radius: 4 });
  const p = await t.player("Sparks", { x: 0, z: 0, gameMode: "creative", op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const G = Math.floor(p.location.y) - 1; // the ground's top block
  const Y = G + 1;
  inv.clearAll();
  inv.setItem(0, new ItemStack("minecraft:stone", 64));
  inv.setItem(1, new ItemStack("minecraft:diamond_pickaxe", 1));
  inv.setItem(2, new ItemStack("minecraft:iron_pickaxe", 1));
  inv.setItem(3, new ItemStack("minecraft:stone_pickaxe", 1));
  // A full inventory, as a builder's is: the spare tool scan reads every slot.
  const junk = ["minecraft:dirt", "minecraft:cobblestone", "minecraft:oak_planks", "minecraft:torch", "minecraft:bread"];
  for (let s = 9; s < 36; s++) inv.setItem(s, new ItemStack(junk[s % junk.length], 16));
  p.selectedSlotIndex = 0;
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "bpp1", pack: "build_bp", key: "floatingUI", value: false, player: p.id }));
  // The stone cube the destroy phase aims at.
  const ca = { x: 2, z: 2 }, cb = { x: 21, z: 21 };
  t.server(`/fill ${ca.x} ${Y} ${ca.z} ${cb.x} ${Y + 19} ${cb.z} stone`);
  await t.wait(10);

  let samples = 0, minValid = 1;
  const sampler = t.system.runInterval(() => { samples++; if (!p.isValid) minValid = 0; }, 20);
  const phases = [];
  let current = null;
  let lastTickAt = Date.now();
  const tickWatch = t.system.runInterval(() => {
    const now = Date.now();
    if (current) current.slowestTickMs = Math.max(current.slowestTickMs ?? 0, now - lastTickAt);
    lastTickAt = now;
  }, 1);
  const begin = (name) => { current = { name, startTick: t.tick }; t.log(`phase ${name} starts`); };
  const end = () => { current.endTick = t.tick; phases.push(current); t.log(`phase ${current.name}: ${((current.endTick - current.startTick) / 20).toFixed(1)} s, slowest tick ${current.slowestTickMs ?? 0} ms`); current = null; };

  const stand = async (x, z, y = Y) => { p.teleport({ x: x + 0.5, y, z: z + 0.5 }); await t.wait(3); };
  const click = async (slot, pos, face = Direction.Up) => {
    const used = p.useItemInSlotOnBlock(slot, pos, face);
    if (!used) t.log(`click on ${pos.x},${pos.y},${pos.z} ${face}: not used`);
    p.stopUsingItem();
    p.stopInteracting();
    await t.wait(6);
  };
  const lookAt = async (loc) => { p.lookAtLocation(loc); await t.wait(2); };
  const waitBar = (re, since, timeout = 400) => t.waitMessage(p, re, { since, kind: "actionbar", pack: "build_bp", timeout });
  const hold = async (b, tops) => {
    for (const top of tops) {
      await lookAt({ x: b.x + 0.5, y: top + 0.5, z: b.z + 0.5 });
      await t.wait(98);
    }
  };

  const formP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
  const menu = await formP;
  const cube = menu.buttons.findIndex((b) => /Cube/i.test(b));
  t.assert(cube >= 0, `Cube is in the menu (${menu.buttons.join(" | ")})`);
  menu.answer(cube);
  await t.wait(10);
  for (const f of t.forms(p)) if (!f.answered && f.buttons?.length) f.answer(f.buttons.length - 1);
  await t.wait(4);

  // outline: a Cube on the open ground east of the stone cube (anchor, footprint, then the height from the aim)
  const oa = { x: 30, z: 2 }, ob = { x: 49, z: 21 };
  p.selectedSlotIndex = 0;
  await stand(oa.x, oa.z - 3);
  await lookAt({ x: oa.x + 0.5, y: G + 1, z: oa.z + 0.5 });
  let since = t.tick;
  await click(0, { x: oa.x, y: G, z: oa.z });
  await waitBar(/anchor_set/, since);
  await stand(ob.x + 3, ob.z + 2);
  await lookAt({ x: ob.x + 0.5, y: G + 0.95, z: ob.z + 0.5 });
  since = t.tick;
  await click(0, { x: ob.x, y: G, z: ob.z });
  await waitBar(/xz_set/, since);
  await stand(ob.x, ob.z + 6);
  await t.wait(20);
  begin("outline");
  await hold(ob, [Y + 19, Y + 17, Y + 19]);
  end();

  // destroy: the pickaxe drops the stone anchor; its corners are the stone cube's
  p.selectedSlotIndex = 1;
  await t.wait(4);
  await stand(ca.x, ca.z - 3);
  await lookAt({ x: ca.x + 0.5, y: Y + 0.5, z: ca.z });
  since = t.tick;
  await click(1, { x: ca.x, y: Y, z: ca.z }, Direction.North);
  await waitBar(/destroy_anchor_set|anchor_set/, since);
  await stand(cb.x + 2, cb.z + 2);
  await lookAt({ x: cb.x + 1, y: Y + 0.5, z: cb.z + 0.5 });
  since = t.tick;
  await click(1, { x: cb.x, y: Y, z: cb.z }, Direction.East);
  await waitBar(/xz_set/, since);
  await stand(cb.x, cb.z + 6);
  await t.wait(20);
  begin("destroy");
  await hold(cb, [Y + 19, Y + 17, Y + 19]);
  end();

  // mirror: stone in hand (the destroy anchor stays, undrawn), the Mirror turned on where the player stands
  p.selectedSlotIndex = 0;
  await stand(60, 10);
  // Each form opens as the last is answered: the answers are queued before the command.
  const pick = (re, what) => (form) => {
    const i = form.buttons.findIndex((b) => re.test(b));
    if (i < 0) t.log(`${what} is not in the menu (${form.buttons.join(" | ")})`);
    return i >= 0 ? i : null;
  };
  t.answerForm(p, pick(/Mirror/i, "Mirror"), pick(/mirror\.btn\.enable|Enable Mirror/i, "Enable"),
    pick(/mirror\.btn\.set_pos|My Position/i, "Set center"), (form) => form.buttons.length - 1);
  t.assert(t.cmd(p, "/realm:build_modifiers").ok, "/realm:build_modifiers ran");
  await t.wait(40);
  t.check(t.forms(p).filter((f) => /modifiers/i.test(String(f.title))).length >= 3, "the modifier menus opened");
  begin("mirror");
  for (let k = 0; k < 15; k++) {
    await stand(60, 10, Y + (k % 3)); // up and down: the planes follow the player's height
    await t.wait(17);
  }
  end();

  t.system.clearRun(sampler);
  t.system.clearRun(tickWatch);
  const ticks = t.tick - phases[0].startTick;
  const seconds = Math.floor(ticks / 20);
  t.report("perf-workload", {
    schema: 1, declared: { players: 1, seconds }, spawned: 1, spawnGameSeconds: (phases[0].startTick - T0) / 20,
    kinds: { land: 1, water: 0, nether: 0, groups: 1 },
    soak: { startTick: phases[0].startTick, endTick: t.tick, ticks, seconds: ticks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: p.isValid ? 1 : 0 },
    phases,
  });
  t.check(phases.length === 3, `every phase ran (${phases.map((ph) => ph.name).join(", ")})`);
}
