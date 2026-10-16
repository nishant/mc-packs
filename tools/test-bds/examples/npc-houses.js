// Townsfolk to their houses: a village of three cobblestone houses (a door each, south side), four townsfolk placed
// on one spot, then /realm:npc_houses. Each house gets one townsfolk of its own (never shared): its post is inside
// (under the roof), facing the door, and it stays there by day and at night. The fourth has no house: the preview
// says so and it stays where it was. The NPCs are the same ones (a tag stands in for the skin). /realm:npc_undo
// puts them back on the old spot.
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
  const houseOf = (l) => houses.findIndex((h) => l.x > h.x + 1 && l.x < h.x + 6 && l.z > h.z + 1 && l.z < h.z + 6);
  const ids = ["mara", "tobin", "elsie", "bram"];
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
  const preview = t.forms(p).find((f) => /houses/.test(f.title))?.body ?? "";
  t.log(preview);
  t.check(/lives inside their own house/.test(preview), "the preview says each lives inside their own house");
  t.check(/No house yet for: [^\n]+\. They stay where they are/.test(preview), "the preview names who has no house yet");
  // Out of turning range of everyone (faceRange 8), so each faces the way it was placed.
  p.teleport({ x: c.x + 40.5, y: c.y, z: c.z + 0.5 });
  await t.wait(60);
  const where = {};
  const check = (when) => {
    const used = new Set();
    let homeless = 0;
    for (const id of ids) {
      const all = npcs(id);
      t.check(all.length === 1 && all[0].hasTag("test:skin"), `${id}: the same single NPC (${when})`);
      const e = all[0];
      if (!e) continue;
      const hi = houseOf(e.location);
      if (hi < 0) {
        homeless++;
        t.check(Math.hypot(e.location.x - start[id].x, e.location.z - start[id].z) < 2, `${id} has no house and stays where it was (${when})`);
        continue;
      }
      t.check(!used.has(hi), `${id} has house ${hi + 1} to itself (${when})`);
      used.add(hi);
      if (where[id]) t.check(Math.hypot(e.location.x - where[id].x, e.location.z - where[id].z) < 0.5, `${id} hasn't moved (${when})`);
      else where[id] = { ...e.location };
    }
    t.check(used.size === 3 && homeless === 1, `three townsfolk in three houses, one without (${when})`);
  };
  check("day");
  for (const id of ids) {
    const [e] = npcs(id);
    if (!e || houseOf(e.location) < 0) continue;
    const y = e.getRotation().y;
    t.check(Math.abs(((y + 540) % 360) - 180) < 10, `${id} faces the door, south (yaw ${y.toFixed(0)})`);
  }
  t.server("/time set 18000");
  await t.wait(240);
  check("night");
  t.server("/time set 1000");
  await t.wait(40);
  // Undo: back on the old spot.
  t.answerForm(p, "Put them back");
  t.cmd(p, "/realm:npc_undo");
  await t.waitMessage(p, /Put \d+ townsfolk back/, { timeout: 600 });
  await t.wait(40);
  for (const id of ids) {
    const [e] = npcs(id);
    t.check(!!e && Math.hypot(e.location.x - start[id].x, e.location.z - start[id].z) < 2, `${id} back on the old spot after undo`);
  }
}
