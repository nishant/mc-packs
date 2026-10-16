// Lighthouse built by an operator standing on a pillar high over flat ground: the footing fills down to the
// ground, the balcony has an open walkway (ring 3) and the rail (ring 4); Remove puts the ground back.
export default async function (t) {
  const X = 400, Z = 400;
  t.server("/gamerule doMobSpawning false");
  await t.loadArea(X, Z, { radius: 4 });
  const p = await t.player("Op", { op: true, x: X, z: Z });
  await t.wait(20);
  const g = Math.floor(p.location.y) - 1; // grass
  t.log(`ground ${g}`);
  const top = g + 12;
  t.server(`/fill ${X} ${g + 1} ${Z} ${X} ${top} ${Z} stone`);
  p.teleport({ x: X + 0.5, y: top + 1, z: Z + 0.5 });
  await t.wait(20);
  const id = (x, y, z) => t.dimension.getBlock({ x, y, z })?.typeId;
  const f1 = t.waitForm(p, { timeout: 200 });
  t.cmd(p, "/realm:saga_places");
  (await f1).answer((await f1).buttons.find((b) => b.includes("Lighthouse")));
  const f2 = await t.waitForm(p, { timeout: 200 });
  f2.answer(f2.buttons.find((b) => b.startsWith("Build here")));
  const f3 = await t.waitForm(p, { timeout: 200 });
  const since = t.tick;
  f3.answer("Build here");
  const msg = await t.waitMessage(p, /Built .*Lighthouse|Couldn't build/, { since, timeout: 600 });
  t.log(msg);
  await t.wait(20);
  const o = top + 1; // origin y: the player's feet
  for (const [dx, dz] of [[3, 3], [-3, 2], [4, 4], [-4, 0], [0, 4]]) {
    const col = [];
    for (let y = g + 1; y <= o - 3; y++) col.push(id(X + dx, y, Z + dz));
    t.log(`column ${dx},${dz}: ${[...new Set(col)].join(",")}`);
    t.check(col.every((c) => c === "minecraft:cobblestone" || c === "minecraft:dirt"), `footing filled down at ${dx},${dz}`);
  }
  t.check(id(X + 3, o + 16, Z + 3) === "minecraft:air" && id(X + 3, o + 17, Z + 3) === "minecraft:air", `walkway open: ${id(X + 3, o + 16, Z + 3)}`);
  t.check(id(X + 3, o + 15, Z + 3) === "minecraft:stone_bricks", `walkway floor: ${id(X + 3, o + 15, Z + 3)}`);
  t.check(id(X + 4, o + 16, Z + 4) === "minecraft:iron_bars", `rail: ${id(X + 4, o + 16, Z + 4)}`);
  t.check(id(X + 4, o + 15, Z + 4) === "minecraft:stone_brick_slab", `rail slab: ${id(X + 4, o + 15, Z + 4)}`);
  // Remove: the ground under it is back (air over the grass beside the pillar).
  const r1 = t.waitForm(p, { timeout: 200 });
  t.cmd(p, "/realm:saga_places");
  (await r1).answer((await r1).buttons.find((b) => b.includes("Lighthouse")));
  const r2 = await t.waitForm(p, { timeout: 200 });
  r2.answer(r2.buttons.find((b) => b.startsWith("Remove")));
  const r3 = await t.waitForm(p, { timeout: 200 });
  const s2 = t.tick;
  r3.answer("Yes");
  await t.waitMessage(p, /Removed/, { since: s2, timeout: 200 });
  await t.wait(60);
  t.check(id(X + 3, g + 2, Z + 3) === "minecraft:air", `footing gone after Remove: ${id(X + 3, g + 2, Z + 3)}`);
  t.check(id(X + 3, o, Z + 3) === "minecraft:air", `build gone after Remove: ${id(X + 3, o, Z + 3)}`);
}
