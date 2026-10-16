// Townsfolk to their houses: a village of three cobblestone houses (a door each, south side), six townsfolk placed
// on one spot, then /realm:npc_houses. Each one's post is right outside a door (open sky) and its home inside a
// house (under the roof); by day each stands within its stroll radius of the post and strolls (it moves, and is
// never inside a wall); at night each is inside. The NPCs are the same ones (a tag stands in for the skin).
// /realm:npc_undo puts them back on the old spot.
// node tools/test-bds/run.mjs --quiet --flat --only npc_bp --scenario tools/test-bds/examples/npc-houses.js --timeout 600
export default async function (t) {
  const p = await t.player("Op", { op: true, gameMode: "creative" });
  const dim = t.dimension;
  const npcs = (id) => dim.getEntities({ type: "minecraft:npc", tags: [`realm:npc_id:${id}`] });
  await t.wait(40);
  const c = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const g = c.y - 1;
  t.server(`/tickingarea add circle ${c.x} ${c.y} ${c.z} 4 housestest`);
  await t.wait(60);
  const houses = [
    { x: c.x + 10, z: c.z - 20 },
    { x: c.x - 20, z: c.z - 15 },
    { x: c.x - 5, z: c.z + 15 },
  ];
  for (const h of houses) {
    t.server(`/fill ${h.x} ${g} ${h.z} ${h.x + 6} ${g + 5} ${h.z + 6} cobblestone hollow`);
    t.server(`/setblock ${h.x + 3} ${g + 1} ${h.z + 6} wooden_door ["upper_block_bit"=false,"direction"=3]`);
    t.server(`/setblock ${h.x + 3} ${g + 2} ${h.z + 6} wooden_door ["upper_block_bit"=true,"direction"=3]`);
  }
  await t.wait(5);
  t.log("door blocks:", houses.map((h) => `${dim.getBlock({ x: h.x + 3, y: g + 1, z: h.z + 6 })?.typeId}/${dim.getBlock({ x: h.x + 3, y: g + 2, z: h.z + 6 })?.typeId}`).join(" "));
  const inHouse = (l) => houses.some((h) => l.x > h.x + 1 && l.x < h.x + 6 && l.z > h.z + 1 && l.z < h.z + 6);
  const inWall = (l) => houses.some((h) => l.x >= h.x && l.x < h.x + 7 && l.z >= h.z && l.z < h.z + 7 && !inHouse(l));
  const ids = ["mara", "tobin", "elsie", "bram", "quill", "bea"];
  for (const id of ids) t.assert(t.cmd(p, `/realm:npc_add ${id}`).ok, `npc_add ${id}`);
  await t.wait(20);
  const start = {};
  for (const id of ids) {
    const [e] = npcs(id);
    t.assert(e, `${id} placed`);
    e.addTag("test:skin");
    start[id] = { ...e.location };
  }
  t.server("/time set 1000");
  t.answerForm(p, "Move them");
  t.cmd(p, "/realm:npc_houses");
  await t.waitMessage(p, /Moved \d+ townsfolk to their houses/, { timeout: 1200 });
  t.log(t.forms(p).find((f) => /houses/.test(f.title))?.body);
  await t.wait(40);
  const posts = {};
  for (const id of ids) {
    const all = npcs(id);
    t.check(all.length === 1 && all[0].hasTag("test:skin"), `${id}: the same single NPC`);
    const e = all[0];
    if (!e) continue;
    posts[id] = { ...e.location };
    t.check(!inHouse(e.location) && !inWall(e.location), `${id} outside by day (${e.location.x.toFixed(1)}, ${e.location.z.toFixed(1)})`);
    const near = houses.some((h) => Math.hypot(e.location.x - (h.x + 3.5), e.location.z - (h.z + 6.5)) < 6);
    t.check(near, `${id} by a door`);
  }
  // Strolling: with the operator around (but not right next to anyone), they move, never into a wall, never far.
  p.teleport({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 });
  const moved = new Set();
  let wall = 0;
  let far = 0;
  for (let i = 0; i < 60; i++) {
    await t.wait(10);
    for (const id of ids) {
      const [e] = npcs(id);
      if (!e) continue;
      const l = e.location;
      if (Math.hypot(l.x - posts[id].x, l.z - posts[id].z) > 0.3) moved.add(id);
      if (inWall(l)) wall++;
      if (Math.hypot(l.x - posts[id].x, l.z - posts[id].z) > 4.6) far++;
    }
  }
  t.log(`strolled: ${[...moved].join(", ")}`);
  t.check(moved.size >= 3, `townsfolk stroll (${moved.size} of 6 moved in 30 s)`);
  t.check(wall === 0, `never inside a wall (${wall} samples)`);
  t.check(far === 0, `never more than 4 blocks from their spot (${far} samples)`);
  // Night: inside.
  t.server("/time set 18000");
  await t.wait(80);
  for (const id of ids) {
    const [e] = npcs(id);
    t.check(!!e && inHouse(e.location), `${id} inside a house at night (${e?.location.x.toFixed(1)}, ${e?.location.z.toFixed(1)})`);
  }
  t.server("/time set 1000");
  await t.wait(40);
  // Undo: back on the old spot.
  t.answerForm(p, "Put them back");
  t.cmd(p, "/realm:npc_undo");
  await t.waitMessage(p, /Put \d+ townsfolk back/, { timeout: 600 });
  await t.wait(40);
  for (const id of ids) {
    const [e] = npcs(id);
    t.check(!!e && Math.hypot(e.location.x - start[id].x, e.location.z - start[id].z) < 4.6, `${id} back near the old spot after undo`);
  }
}
