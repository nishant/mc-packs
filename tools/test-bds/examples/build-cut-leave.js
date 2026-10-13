// Easy Building (build_bp): a player who leaves while a cut is still taking blocks away. The cut is abandoned: the
// blocks taken so far go back where they were, no copy is kept (no stale Last copy, no orphan structure).
// Second part: the same with the cut's ticking area removed once it runs and the player far away when they leave,
// so the cut's chunks are unloaded: the blocks taken are kept in a structure, survive a restart and go back once the spot loads.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-cut-leave.js --timeout 600
export default async function (t) {
  const { ItemStack } = t.mc;
  const dim = t.dimension;
  const sm = t.world.structureManager;
  const Y = -60;
  const count = (id, x0, y0, z0, x1, y1, z1) => {
    let n = 0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (dim.getBlock({ x, y, z })?.typeId === id) n++;
    return n;
  };

  const FAR = 1000; // the second slab, x 968 to 1031: no ticking area there
  const fmin = { x: FAR - 32, y: Y, z: -32 }, fmax = { x: FAR + 31, y: Y + 3, z: 31 };
  if (t.phase === 2) {
    // After the restart: the spot loads again, and the blocks taken from the unloaded chunks go back.
    // (A ticking area, not t.player(): its harness_<n> names start over after a restart and are already taken.)
    t.server(`/tickingarea add ${fmin.x} ${fmin.y} ${fmin.z} ${fmax.x} ${fmax.y} ${fmax.z} farback`);
    let k = -1;
    for (let i = 0; i < 40 && k !== 16384; i++) {
      await t.wait(10);
      try {
        k = count("minecraft:stone", fmin.x, fmin.y, fmin.z, fmax.x, fmax.y, fmax.z);
      } catch {
        k = -1; // not loaded yet
      }
    }
    t.log("stone in the far slab after the restart:", k, "kept:", t.world.getDynamicProperty("build:cutback"));
    t.check(k === 16384, `the blocks taken from unloaded chunks are put back after the restart (${k} of 16384)`);
    await t.wait(20);
    const ids = sm.getWorldStructureIds().filter((id) => /^build:/.test(id));
    t.check(ids.length === 0, `nothing is left over once they are back (${ids.join(" ") || "none"})`);
    t.check(t.world.getDynamicProperty("build:cutback") === undefined, "the list of cuts to put back is empty");
    return;
  }

  await t.loadArea(0, 0, { radius: 4 });
  const cre = await t.player("Cre", { x: 0, z: 0, gameMode: "creative", op: true });
  // 100 blocks a tick: a 16384-block cut takes about 8 seconds, plenty of time to leave in the middle of it.
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "t1", pack: "build_bp", key: "blocksPerTick", value: 100 }));
  await t.wait(5);

  // A 64 x 4 x 64 slab of stone around the spawn (the ticking areas keep it loaded after the player leaves).
  const min = { x: -32, y: Y, z: -32 }, max = { x: 31, y: Y + 3, z: 31 };
  t.server(`/fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} stone`);
  await t.waitUntil(() => count("minecraft:stone", min.x, min.y, min.z, max.x, max.y, max.z) === 16384, { timeout: 100, message: "the slab is filled" });

  // Select its two corners.
  t.cmd(cre, "/realm:build_copy"); // nothing selected yet: starts selecting
  await t.waitMessage(cre, /Selecting a region/);
  const hand = cre.getComponent("inventory").container;
  hand.setItem(cre.selectedSlotIndex, new ItemStack("minecraft:stick", 1));
  const since = t.tick;
  for (const corner of [min, max]) {
    cre.teleport({ x: corner.x + 0.5, y: Y + 4, z: corner.z + 0.5 });
    await t.wait(2);
    cre.lookAtBlock(corner);
    await t.wait(2);
    const ok = cre.useItemInSlotOnBlock(cre.selectedSlotIndex, corner, t.mc.Direction.Up);
    t.check(ok, `corner ${JSON.stringify(corner)} used`);
    await t.wait(3);
    cre.stopInteracting();
    await t.wait(8);
  }
  await t.waitMessage(cre, /Selected 64 x 4 x 64/, { kind: "actionbar", since });

  // Cut, and leave while it is still taking blocks away.
  t.assert(t.cmd(cre, "/realm:build_cut").ok, "cut ran");
  await t.wait(50);
  const gone = 16384 - count("minecraft:stone", min.x, min.y, min.z, max.x, max.y, max.z);
  t.log("stone taken away when the player leaves:", gone);
  t.assert(gone > 500 && gone < 16000, `the cut is in the middle of taking blocks away (${gone} gone)`);
  cre.disconnect();
  await t.wait(200); // long enough for the cut to have finished, had it kept going

  const left = count("minecraft:stone", min.x, min.y, min.z, max.x, max.y, max.z);
  t.log("stone in the slab after the player left:", left);
  t.check(left === 16384, `the cut was abandoned and every block put back (${left} of 16384)`);
  const ids = sm.getWorldStructureIds().filter((id) => /^build:p/.test(id));
  t.log("copy structures left in the world:", ids.join(" ") || "none");
  t.check(ids.length === 0, "no copy is kept from the abandoned cut");

  // Second part: a slab far from every ticking area. The player cuts it, walks off (its chunks unload) and leaves.
  const far = await t.player("Far", { x: 0, z: 3, gameMode: "creative", op: true });
  // A ticking area only while the slab is filled and selected (removed once the cut runs, so its chunks unload).
  t.server(`/tickingarea add ${fmin.x} ${fmin.y} ${fmin.z} ${fmax.x} ${fmax.y} ${fmax.z} farcut`);
  const chunks = [];
  for (let x = fmin.x; x <= fmax.x; x += 16) for (let z = fmin.z; z <= fmax.z; z += 16) chunks.push({ x, y: Y, z });
  await t.waitUntil(() => chunks.every((c) => dim.getBlock(c)), { timeout: 300, message: "the far slab is loaded" });
  t.server(`/fill ${fmin.x} ${fmin.y} ${fmin.z} ${fmax.x} ${fmax.y} ${fmax.z} stone`);
  await t.waitUntil(() => count("minecraft:stone", fmin.x, fmin.y, fmin.z, fmax.x, fmax.y, fmax.z) === 16384, { timeout: 100, message: "the far slab is filled" });
  t.cmd(far, "/realm:build_copy");
  await t.waitMessage(far, /Selecting a region/);
  far.getComponent("inventory").container.setItem(far.selectedSlotIndex, new ItemStack("minecraft:stick", 1));
  const since2 = t.tick;
  for (const corner of [fmin, fmax]) {
    far.teleport({ x: corner.x + 0.5, y: Y + 4, z: corner.z + 0.5 });
    await t.wait(2);
    far.lookAtBlock(corner);
    await t.wait(2);
    t.check(far.useItemInSlotOnBlock(far.selectedSlotIndex, corner, t.mc.Direction.Up), `corner ${JSON.stringify(corner)} used`);
    await t.wait(3);
    far.stopInteracting();
    await t.wait(8);
  }
  await t.waitMessage(far, /Selected 64 x 4 x 64/, { kind: "actionbar", since: since2 });
  // 30 blocks a tick: the cut is still going long after the slab's chunks unload.
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "t2", pack: "build_bp", key: "blocksPerTick", value: 30 }));
  await t.wait(5);
  t.assert(t.cmd(far, "/realm:build_cut").ok, "far cut ran");
  await t.wait(40);
  const taken = 16384 - count("minecraft:stone", fmin.x, fmin.y, fmin.z, fmax.x, fmax.y, fmax.z);
  t.log("stone taken from the far slab before walking off:", taken);
  t.assert(taken > 500 && taken < 12000, `the far cut is in the middle of taking blocks away (${taken} gone)`);
  far.teleport({ x: 0.5, y: Y + 6, z: 3.5 });
  t.server("/tickingarea remove farcut");
  const unloaded = await t.waitUntil(() => {
    try {
      return !dim.getBlock(fmin);
    } catch {
      return true;
    }
  }, { timeout: 120, message: "the far slab unloads" });
  t.log("far slab unloaded, ticks after the cut started:", t.tick - since2, unloaded);
  far.disconnect();
  await t.wait(40);
  const kept = sm.getWorldStructureIds().filter((id) => /^build:/.test(id));
  t.log("structures after the far player left:", kept.join(" ") || "none");
  t.check(kept.some((id) => /^build:r/.test(id)), "the blocks taken from unloaded chunks are kept in a structure");
  t.check(!kept.some((id) => /^build:p/.test(id)), "no copy is kept from the abandoned far cut");
  t.restart("far cut abandoned in unloaded chunks, restarting");
}
