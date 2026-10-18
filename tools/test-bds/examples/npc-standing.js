// Townsfolk standing on the floor, and their names: an NPC placed on a slab stays on top of it; one placed by an
// operator hovering over a slab lands on the slab's top (not half a block above it, falling and bobbing); one whose
// spot gets a block laid in it (a path raised under it, or a spot saved a block low in an older world) is lifted
// on top within one audit (10 s) and its saved spot with it (still on top after a restart); one with a slab laid
// at its feet stands on the slab, not sunk in it. Names: every townsfolk has its name from spawn and after a
// restart, and when a player comes near the name is sent again (it switches to the look-alike form ending in §r),
// since a game can show a minecraft:npc as "NPC" until its name changes while it watches.
//   node tools/test-bds/run.mjs --quiet --only npc_bp --scenario tools/test-bds/examples/npc-standing.js --timeout 600
export default async function (t) {
  const dim = t.dimension;
  const npc = (id) => dim.getEntities({ type: "minecraft:npc", tags: [`realm:npc_id:${id}`] })[0];
  const label = (id) => dim.getEntities({ type: "realm:npc_label", tags: [`realm:npc_label_id:${id}`] })[0];
  const yOf = (id) => {
    const e = npc(id);
    return e ? Math.round(e.location.y * 1000) / 1000 : NaN;
  };
  const NAMES = { bea: "§eBea §7the Cook", mara: "§eMara §7the Cartographer", tobin: "§eOld Tobin §7the Fisherman", quill: "§eQuill §7the Trader" };
  // The native name is "§r" or, while a resend shows the look-alike forms, "§r§r" (the helper then ends in §r too).
  const named = (id) => {
    const e = npc(id);
    const h = label(id);
    const want = NAMES[id];
    return !!e && (e.nameTag === "§r" || e.nameTag === "§r§r") && !!h && (want ? h.nameTag === want || h.nameTag === `${want}§r` : !!h.nameTag && h.nameTag !== "NPC");
  };

  if (t.phase === 1) {
    const p = await t.player("Op", { op: true, gameMode: "creative" });
    await t.wait(40);
    const sx = Math.floor(p.location.x) + 2;
    const sz = Math.floor(p.location.z) + 2;
    /** Builds a 3x3 floor of `block` on the ground at column i and clears 3 blocks above; returns its base y. */
    const floorAt = (i, block) => {
      const x = sx + i * 4;
      const top = dim.getTopmostBlock({ x, z: sz });
      const y = top.location.y + 1;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          dim.setBlockType({ x: x + dx, y: y - 1, z: sz + dz }, "minecraft:stone");
          dim.setBlockType({ x: x + dx, y, z: sz + dz }, block);
          for (let dy = 1; dy <= 3; dy++) dim.setBlockType({ x: x + dx, y: y + dy, z: sz + dz }, "minecraft:air");
        }
      return { x: x + 0.5, y, z: sz + 0.5 };
    };
    const place = async (id, at, fly) => {
      p.teleport(at);
      if (fly) p.fly();
      else p.stopFlying();
      await t.wait(15);
      t.log(`${id}: placing at y ${p.location.y.toFixed(3)}, on ground ${p.isOnGround}`);
      t.assert(t.cmd(p, `/realm:npc_add ${id}`).ok, `npc_add ${id}`);
      await t.wait(10);
    };

    // bea: standing on a bottom slab.
    const a = floorAt(0, "minecraft:stone_brick_slab");
    await place("bea", { ...a, y: a.y + 0.5 }, false);
    // mara: hovering 0.7 above a bottom slab (flying in creative).
    const b = floorAt(1, "minecraft:stone_brick_slab");
    await place("mara", { ...b, y: b.y + 1.2 }, true);
    // tobin: on stone; a full block is then laid where its feet are.
    const c = floorAt(2, "minecraft:air");
    await place("tobin", c, false);
    // quill: on stone; a bottom slab is then laid where its feet are.
    const d = floorAt(3, "minecraft:air");
    await place("quill", d, false);
    // ida: in a room 2 blocks high; a block is then laid at her feet (no room on top: never onto the roof).
    const e = floorAt(4, "minecraft:air");
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) dim.setBlockType({ x: e.x - 0.5 + dx, y: e.y + 2, z: e.z - 0.5 + dz }, "minecraft:stone");
    await place("ida", e, false);
    // sol: on stone; a top slab is then hung at head height (only the feet block lifts anyone).
    const f = floorAt(5, "minecraft:air");
    await place("sol", f, false);
    p.stopFlying();
    p.teleport({ x: sx + 6, y: c.y + 4, z: sz - 4 });

    for (const id of ["bea", "mara", "tobin", "quill"]) t.check(named(id), `${id} has its helper name right after spawning (${JSON.stringify(label(id)?.nameTag)})`);

    const ys = { bea: [], mara: [] };
    for (let i = 0; i < 12; i++) {
      ys.bea.push(yOf("bea"));
      ys.mara.push(yOf("mara"));
      await t.wait(5);
    }
    t.log("bea y:", ys.bea.join(" "), "| mara y:", ys.mara.join(" "));
    t.check(ys.bea.every((y) => y === a.y + 0.5), `bea stands on the slab at ${a.y + 0.5}`);
    t.check(ys.mara.every((y) => y === b.y + 0.5), `mara (placed hovering) stands on the slab at ${b.y + 0.5}, still`);

    // A path laid later: a full block at tobin's feet, a slab at quill's.
    t.server(`/setblock ${Math.floor(c.x)} ${c.y} ${Math.floor(c.z)} stone_bricks`);
    t.server(`/setblock ${Math.floor(d.x)} ${d.y} ${Math.floor(d.z)} stone_brick_slab`);
    t.server(`/setblock ${Math.floor(e.x)} ${e.y} ${Math.floor(e.z)} stone_bricks`);
    dim.setBlockPermutation({ x: Math.floor(f.x), y: f.y + 1, z: Math.floor(f.z) }, t.mc.BlockPermutation.resolve("minecraft:stone_brick_slab", { "minecraft:vertical_half": "top" }));
    await t.wait(5);
    t.log(`after laying blocks: tobin y ${yOf("tobin")}, quill y ${yOf("quill")}`);
    await t.waitUntil(() => yOf("tobin") === c.y + 1 && yOf("quill") === d.y + 0.5, {
      timeout: 260,
      interval: 10,
      message: `tobin lifted onto the block (${c.y + 1}) and quill onto the slab (${d.y + 0.5}); now ${yOf("tobin")} and ${yOf("quill")}`,
    });
    t.log(`lifted: tobin y ${yOf("tobin")}, quill y ${yOf("quill")}`);
    await t.wait(40);
    t.check(yOf("tobin") === c.y + 1 && yOf("quill") === d.y + 0.5, "they stay on top");
    t.log(`ida y ${yOf("ida")} (floor ${e.y}, roof at ${e.y + 2}), sol y ${yOf("sol")} (floor ${f.y})`);
    t.check(yOf("ida") < e.y + 2, "ida, with no room above the block, is not put on the roof");
    t.check(yOf("sol") === f.y, "sol is not lifted by a top slab at head height");
    t.restart("restarting");
    return;
  }

  // Phase 2: after the restart.
  const p2 = await t.player("Second", { op: true, gameMode: "creative" });
  const e = await t.waitUntil(() => npc("tobin"), { timeout: 300, message: "tobin loaded after the restart" });
  const tobinY = yOf("tobin");
  await t.wait(60);
  t.log(`after restart: tobin y ${tobinY} -> ${yOf("tobin")}, quill y ${yOf("quill")}`);
  t.check(yOf("tobin") === tobinY, "tobin's lifted spot was saved: not moved back down after the restart");
  for (const id of ["bea", "mara", "tobin", "quill"]) t.check(named(id), `${id} has its helper name after the restart (${JSON.stringify(label(id)?.nameTag)})`);

  // A player who comes near gets the helper name sent again (the tag switches between its two look-alike forms).
  const far = { x: e.location.x + 200, y: 120, z: e.location.z };
  p2.teleport(far);
  await t.wait(40);
  p2.teleport({ x: e.location.x + 3, y: e.location.y + 1, z: e.location.z });
  await t.waitUntil(() => !!label("tobin"), { timeout: 40, interval: 2, message: "tobin helper spawned when player came near" });
  const before = label("tobin")?.nameTag;
  const flipped = await t.waitUntil(() => label("tobin")?.nameTag !== before && named("tobin") && label("tobin")?.nameTag, {
    timeout: 120,
    interval: 2,
    message: `tobin's helper name sent again when a player came near (still ${JSON.stringify(label("tobin")?.nameTag)})`,
  });
  t.log(`name resent: ${JSON.stringify(before)} -> ${JSON.stringify(flipped)}`);
}
