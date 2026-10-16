// Townsfolk spread out: six townsfolk placed on one spot are spread with /realm:npc_spread 60 16 around the operator:
// every one gets its own spot within 60 blocks, at least 12 (16, or 3/4 of it when land is tight) from the others,
// on the ground (never on the roof of the hut nearby), facing the operator; the NPCs themselves are moved (a tag
// stands in for the skin, which scripts can't read), Tobin goes by the pond, homes are cleared. Then Mara's NPC is
// removed: the one that comes back is placed from her saved skin (it still carries the tag), not a new default NPC.
// node tools/test-bds/run.mjs --quiet --flat --only npc_bp --scenario tools/test-bds/examples/npc-spread.js --timeout 600
export default async function (t) {
  const p = await t.player("Op", { op: true, gameMode: "creative" });
  const dim = t.dimension;
  const npcs = (id) => dim.getEntities({ type: "minecraft:npc", tags: [`realm:npc_id:${id}`] });
  await t.wait(40);
  const c = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
  const g = c.y - 1; // the grass layer
  t.server("/tickingarea add circle " + c.x + " " + c.y + " " + c.z + " 4 spreadtest");
  await t.wait(60);
  // A pond 25 blocks east and a closed cobblestone hut (flat roof) 15 blocks north.
  t.server(`/fill ${c.x + 22} ${g - 1} ${c.z - 3} ${c.x + 28} ${g} ${c.z + 3} water`);
  t.server(`/fill ${c.x - 3} ${g + 1} ${c.z - 18} ${c.x + 3} ${g + 5} ${c.z - 12} cobblestone hollow`);
  const ids = ["mara", "tobin", "elsie", "bram", "quill", "bea"];
  for (const id of ids) t.assert(t.cmd(p, `/realm:npc_add ${id}`).ok, `npc_add ${id}`);
  t.assert(t.cmd(p, `/realm:npc_home elsie`).ok, "elsie home"); // at the post: clears (none set); set one 5 blocks off
  p.teleport({ x: c.x + 5.5, y: c.y, z: c.z + 0.5 });
  await t.wait(5);
  t.cmd(p, `/realm:npc_home elsie`);
  p.teleport({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 });
  await t.wait(20);
  for (const id of ids) {
    const [e] = npcs(id);
    t.assert(e, `${id} is there`);
    e.addTag("test:skin");
  }
  t.server("/tickingarea remove spreadtest"); // from now on only the pack's own ticking areas load the far spots
  t.answerForm(p, "Move them");
  t.cmd(p, "/realm:npc_spread 60 16");
  await t.waitMessage(p, /Moved \d+ townsfolk/, { timeout: 2400 });
  const preview = t.forms(p).find((f) => /Spread out/.test(f.title));
  t.log(preview?.body);
  t.server("/tickingarea add circle " + c.x + " " + c.y + " " + c.z + " 4 spreadtest");
  await t.wait(60);
  const spots = [];
  for (const id of ids) {
    const all = npcs(id);
    const e = all[0];
    t.check(all.length === 1, `${id}: one NPC (${all.length})`);
    if (!e) continue;
    const l = e.location;
    spots.push({ id, l });
    const d = Math.hypot(l.x - c.x - 0.5, l.z - c.z - 0.5);
    t.check(d <= 61, `${id} within 60 blocks (${d.toFixed(1)})`);
    t.check(e.hasTag("test:skin"), `${id} is the same NPC (skin kept)`);
    const below = dim.getBlock({ x: Math.floor(l.x), y: Math.floor(l.y) - 1, z: Math.floor(l.z) });
    t.check(below?.typeId !== "minecraft:cobblestone", `${id} not on the hut roof (${below?.typeId} at y ${l.y})`);
    t.check(Math.abs(l.y - c.y) < 0.6, `${id} on the ground (y ${l.y}, ground ${c.y})`);
    t.log(`${id} at ${l.x.toFixed(1)} ${l.y} ${l.z.toFixed(1)}`);
  }
  let min = Infinity;
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) min = Math.min(min, Math.hypot(spots[i].l.x - spots[j].l.x, spots[i].l.z - spots[j].l.z));
  t.check(min >= 12, `the closest two are ${min.toFixed(1)} blocks apart`);
  const tobin = spots.find((s) => s.id === "tobin");
  if (tobin) {
    let water = false;
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) if (dim.getBlock({ x: Math.floor(tobin.l.x) + dx, y: g, z: Math.floor(tobin.l.z) + dz })?.typeId === "minecraft:water") water = true;
    t.check(water, "Tobin stands by the pond");
  }
  // Elsie's home was cleared: she stays at her spot at night.
  t.server("/time set 18000");
  await t.wait(60);
  const [el] = npcs("elsie");
  const es = spots.find((s) => s.id === "elsie");
  t.check(el && es && Math.hypot(el.location.x - es.l.x, el.location.z - es.l.z) < 1, "Elsie stays at her spot at night (home cleared)");
  t.server("/time set 1000");
  // Mara's NPC is removed; the one that comes back is placed from her saved skin.
  const mara = spots.find((s) => s.id === "mara");
  const [m0] = npcs("mara");
  const oldId = m0.id;
  m0.remove();
  p.teleport({ x: mara.l.x + 3, y: mara.l.y, z: mara.l.z });
  const back = await t.waitUntil(() => npcs("mara").find((e) => e.id !== oldId), { timeout: 400, interval: 10, message: "Mara back" });
  t.check(back.hasTag("test:skin"), "Mara came back from her saved skin (same data, tag kept)");
  t.check(Math.hypot(back.location.x - mara.l.x, back.location.z - mara.l.z) < 1, "at her spot");
}
