// Townsfolk: /realm:npc_remove asks first (the skin an operator picked can't be put back). Cancel keeps the NPC,
// Remove takes it away and forgets its spot.
//   node tools/test-bds/run.mjs --quiet --flat --only npc_bp --scenario tools/test-bds/examples/npc-remove-confirm.js --timeout 300
export default async function (t) {
  const p = await t.player("Op", { op: true, gameMode: "creative" });
  await t.wait(40);
  t.assert(t.cmd(p, "/realm:npc_add mara").ok, "npc_add ran");
  const maras = () => t.dimension.getEntities({ type: "minecraft:npc", tags: ["realm:npc_id:mara"] });
  await t.waitUntil(() => maras().length === 1, { timeout: 100, message: "Mara is placed" });
  p.teleport({ x: p.location.x + 2, y: p.location.y, z: p.location.z });
  await t.wait(5);

  let form = t.waitForm(p, { timeout: 60 });
  t.assert(t.cmd(p, "/realm:npc_remove").ok, "npc_remove ran");
  let f = await form;
  t.log("asks:", f.title, String(f.body));
  t.check(/Mara/.test(String(f.body)), "the confirmation names Mara");
  f.answer("Cancel");
  await t.wait(20);
  t.check(maras().length === 1, "Cancel keeps her");

  form = t.waitForm(p, { timeout: 60 });
  const since = t.tick;
  t.cmd(p, "/realm:npc_remove");
  f = await form;
  f.answer("Remove");
  await t.waitMessage(p, /Removed Mara/, { since, timeout: 60 });
  await t.wait(20);
  t.check(maras().length === 0, "Remove takes her away");
}
