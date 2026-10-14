// Bounty Board: a champion target whose spot is a lake comes as a drowned in the water, not as its land mob on
// the lake bed. getTopmostBlock skips water (it answers the bed), so before the fix the board never saw the
// water and asked Champions for a creeper, zombie... standing on the bottom. Needs a normal world (the flat
// world is too thin: the build scan reads below bedrock). About 1 minute:
//   node tools/test-bds/run.mjs --quiet --only bounty_bp,elite_bp --scenario tools/test-bds/examples/bounty-water.js --timeout 420
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:bounty_targets") return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  const X = 900, Z = 900;
  await t.loadArea(X, Z, { radius: 3 });
  // A platform high over the land for the board, whatever the terrain is.
  const y = 150;
  t.assert(t.server(`/fill ${X - 3} ${y - 1} ${Z - 3} ${X + 3} ${y - 1} ${Z + 3} stone`).ok, "a platform");
  t.dimension.getBlock({ x: X + 2, y, z: Z })?.setType("minecraft:lectern");
  const p = await t.player("Tester", { op: true, x: X, y, z: Z });
  p.teleport({ x: X + 0.5, y, z: Z + 0.5 });
  await t.wait(10);
  p.lookAtBlock({ x: X + 2, y, z: Z });
  await t.wait(5);
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:bounty_board").ok, "bounty_board ran");
  await t.waitUntil(() => ev.some((e) => e.tick >= since && e.m.targets?.length >= 1), { timeout: 200, message: "today's champion targets are posted" });
  const A = ev.filter((e) => e.tick >= since && e.m.targets?.length >= 1).at(-1).m.targets[0];
  t.log(`target ${A.name} at ${A.x}, ${A.z}`);

  // A walled pool 15 x 15 and 8 deep at the spot, open sky above, far from any build.
  await t.loadArea(A.x, A.z, { radius: 2 });
  await t.wait(20);
  const x = Math.floor(A.x), z = Math.floor(A.z);
  t.assert(t.server(`/fill ${x - 8} 50 ${z - 8} ${x + 8} 62 ${z + 8} stone`).ok, "a stone basin");
  t.server(`/fill ${x - 8} 63 ${z - 8} ${x + 8} 100 ${z + 8} air`); // open sky over it (fails harmlessly when it's all air already)
  t.assert(t.server(`/fill ${x - 7} 55 ${z - 7} ${x + 7} 62 ${z + 7} water`).ok, "filled with water (bed at y 54, surface at y 62)");
  await t.wait(10);
  t.log(`topmost block at the spot: ${t.dimension.getTopmostBlock({ x, z })?.typeId} at y ${t.dimension.getTopmostBlock({ x, z })?.y}`);

  // A player comes near: the board asks Champions for the target.
  p.teleport({ x: x + 20.5, y: 70, z: z + 0.5 });
  p.addEffect("slow_falling", 600, { showParticles: false });
  const tag = `realm:bounty:${A.id}`;
  const target = await t.waitUntil(() => t.dimension.getEntities({ tags: [tag] })[0], { timeout: 600, message: "the target appears" });
  const at = target.location;
  t.log(`target: ${target.typeId} at y ${at.y.toFixed(1)} (${target.nameTag})`);
  t.check(target.typeId === "minecraft:drowned", `a drowned over the lake (got ${target.typeId})`);
  t.check(at.y >= 58, `spawned in the water, not on the bed (y ${at.y.toFixed(1)})`);
}
