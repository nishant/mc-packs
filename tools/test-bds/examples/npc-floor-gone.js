// Townsfolk: a post whose floor is gone doesn't make a loop (F42). An operator places Mara, then the two blocks under
// her post are dug out. She drops into the hole. Before, she was teleported back up to her post every check and fell
// again, about every half second, for as long as anyone was near. Now her post moves down to where she landed: for 20
// seconds, read every tick, she is put back up at most once, and she stands on the floor of the hole. Pushed off her
// (new) post on even ground, she still goes back to it.
//   node tools/test-bds/run.mjs --quiet --flat --only npc_bp --scenario tools/test-bds/examples/npc-floor-gone.js --timeout 600
export default async function (t) {
  const p = await t.player("Op", { op: true, gameMode: "creative" });
  const dim = t.dimension;
  const mara = () => dim.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:mara"] })[0];
  await t.wait(40);
  const c = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const g = c.y - 1; // the grass she stands on
  t.server("/time set 1000");
  p.teleport({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 }, { rotation: { x: 0, y: 90 } });
  await t.wait(5);
  t.assert(t.cmd(p, "/realm:npc_add mara").ok, "npc_add mara");
  await t.waitMessage(p, /Mara the Cartographer now lives at/, { timeout: 40 });
  await t.wait(10);
  t.assert(mara(), "mara placed");
  p.teleport({ x: c.x + 3.5, y: c.y, z: c.z + 0.5 }); // near, so her checks run

  // Dig out the two blocks under her post.
  t.server(`/fill ${c.x} ${g - 1} ${c.z} ${c.x} ${g} ${c.z} air`);
  let ups = 0;
  let last;
  for (let i = 0; i < 400; i++) {
    await t.wait(1);
    const m = mara();
    if (!m) continue;
    const l = m.location;
    if (last && l.y - last.y > 1.2) {
      ups++;
      t.log(`tick ${i}: Mara was put back up from y ${last.y.toFixed(2)} to ${l.y.toFixed(2)}`);
    }
    last = { x: l.x, y: l.y, z: l.z };
  }
  t.log(`20 s after the floor went: ${ups} put-backs, Mara at y ${last?.y.toFixed(2)} (post was ${c.y})`);
  t.check(ups <= 1, `no fall-and-put-back loop (${ups} put-backs in 20 s)`);
  t.check(!!last && Math.abs(last.y - (g - 1)) < 0.1, `she stands on the floor of the hole (y ${last?.y.toFixed(2)}, floor top ${g - 1})`);

  // Her post moved down: pushed off it on that floor, she goes back to it.
  const m = mara();
  t.assert(m, "mara is still there");
  const post = { ...m.location };
  t.server(`/fill ${c.x + 1} ${g - 1} ${c.z} ${c.x + 3} ${g} ${c.z} air`);
  await t.wait(5);
  m.teleport({ x: post.x + 2, y: post.y, z: post.z });
  await t.waitUntil(() => {
    const l = mara()?.location;
    return !!l && Math.hypot(l.x - post.x, l.y - post.y, l.z - post.z) <= 0.5;
  }, { timeout: 100, message: "pushed off her new post, she goes back to it" });
  t.pass("a post with no floor moves down instead of looping");
}
