// Story Questlines: building a story place somewhere else (/realm:saga_places, "Build here (preview)") keeps the new
// spot's terrain snapshot. The old spot's terrain is put back, and Remove later puts the new spot's back too. Building
// again on the same spot keeps the snapshot from before the first build (not one with the building in it).
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-place-move.js --timeout 500
export default async function (t) {
  const X = 500, Z = 500, X2 = 560;
  const snaps = () => t.world.structureManager.getWorldStructureIds().filter((id) => id.startsWith("saga:place_watchtower"));
  /** Blocks above the flat ground around a spot (the building). @param {number} x @param {number} gy */
  const built = (x, gy) => {
    let n = 0;
    for (let dx = -6; dx <= 6; dx++)
      for (let dz = -6; dz <= 6; dz++)
        for (let y = gy; y < gy + 6; y++) {
          const b = t.dimension.getBlock({ x: x + dx, y, z: Z + dz });
          if (b && !b.isAir) n++;
        }
    return n;
  };
  /** The places menu: open the Ruined Watchtower's page and press `action`, then `then` on the next form. */
  const menu = async (p, action, then) => {
    const f1 = t.waitForm(p, { timeout: 200 });
    t.cmd(p, "/realm:saga_places");
    (await f1).answer((await f1).buttons.find((b) => b.includes("Ruined Watchtower")));
    const f2 = await t.waitForm(p, { timeout: 200 });
    f2.answer(f2.buttons.find((b) => b.startsWith(action)));
    const f3 = await t.waitForm(p, { timeout: 200 });
    f3.answer(then);
  };

  t.server("/gamerule doMobSpawning false");
  await t.loadArea(X, Z, { radius: 4 });
  await t.loadArea(X2, Z, { radius: 4 });
  const p = await t.player("Op", { op: true, x: X, z: Z });
  await t.wait(20);
  const gy = Math.floor(p.location.y);
  t.log(`ground y ${gy}; blocks before: ${built(X, gy)} / ${built(X2, gy)}`);

  let since = t.tick;
  await menu(p, "Build here", "Build here");
  await t.waitMessage(p, /Built the Ruined Watchtower|Built .*Watchtower/, { since, timeout: 400 });
  await t.wait(10);
  t.log(`first build: ${built(X, gy)} blocks, snapshots ${JSON.stringify(snaps())}`);
  t.check(built(X, gy) > 0, "built at the first spot");

  // Built again on the same spot: the snapshot of the terrain before the first build stays.
  const first = snaps();
  since = t.tick;
  await menu(p, "Build here", "Build here");
  await t.waitMessage(p, /Built .*Watchtower/, { since, timeout: 400 });
  await t.wait(60);
  t.log(`same spot again: snapshots ${JSON.stringify(snaps())}`);
  t.check(JSON.stringify(snaps()) === JSON.stringify(first), "building on the same spot keeps the first snapshot");

  // Somewhere else: the first spot is put back, the second snapshotted.
  p.teleport({ x: X2 + 0.5, y: gy, z: Z + 0.5 });
  await t.wait(10);
  since = t.tick;
  await menu(p, "Build here", "Build here");
  await t.waitMessage(p, /Built .*Watchtower/, { since, timeout: 400 });
  await t.wait(80);
  const after = snaps();
  t.log(`moved: ${built(X, gy)} / ${built(X2, gy)} blocks, snapshots ${JSON.stringify(after)}`);
  t.check(built(X, gy) === 0, "the first spot's terrain is back");
  t.check(after.length > 0, "the new spot's terrain snapshot is kept");

  // Remove: the second spot's terrain is back too.
  since = t.tick;
  await menu(p, "Remove", "Yes");
  await t.waitMessage(p, /Removed/, { since, timeout: 200 });
  await t.wait(60);
  t.log(`removed: ${built(X2, gy)} blocks, snapshots ${JSON.stringify(snaps())}`);
  t.check(built(X2, gy) === 0, "Remove puts the second spot's terrain back");
  t.check(snaps().length === 0, "no snapshot left behind");
}
