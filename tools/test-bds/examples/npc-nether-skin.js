// Townsfolk in the Nether: a townsfolk placed there with a saved skin comes back from it in the Nether when it goes
// missing. world.structureManager.place() put a structure's entities into the Overworld at the same coordinates
// while a player who spawned in the Nether stood near and that Overworld chunk was loaded; the structure command
// places it where it is told.
// node tools/test-bds/run.mjs --quiet --flat --only npc_bp --scenario tools/test-bds/examples/npc-nether-skin.js --timeout 600
export default async function (t) {
  const nether = t.world.getDimension("nether");
  const ow = t.world.getDimension("overworld");
  const x = 0, z = 0;
  try { nether.runCommand(`tickingarea add circle ${x} 0 ${z} 2 npc_nether true`); } catch (e) { t.log(`ticking area: ${e}`); }
  await t.waitUntil(() => nether.getBlock({ x, y: 64, z }), { timeout: 600, message: "nether chunk loaded" });
  nether.runCommand(`fill ${x - 6} 64 ${z - 6} ${x + 6} 69 ${z + 6} air`);
  nether.runCommand(`fill ${x - 6} 63 ${z - 6} ${x + 6} 63 ${z + 6} netherrack`);
  await t.loadArea(x, z, { radius: 2 }); // the Overworld at the same spot is loaded too
  const p = await t.player("NetherOp", { op: true, gameMode: "creative", x, y: 64, z, dimension: "nether" });
  await t.wait(20);
  const tags = ["realm:npc_id:mara"];
  const inNether = () => nether.getEntities({ type: "minecraft:npc", tags });
  const inOverworld = () => ow.getEntities({ type: "minecraft:npc", tags });
  t.assert(t.cmd(p, "/realm:npc_add mara").ok, "npc_add mara");
  const [e] = await t.waitUntil(() => (inNether().length ? inNether() : undefined), { timeout: 100, interval: 5, message: "mara placed in the Nether" });
  e.addTag("test:skin");
  p.teleport({ x: x + 4.5, y: 64, z: z + 0.5 }, { dimension: nether }); // out of the skin's 2 blocks
  await t.wait(5);
  const l = e.location;
  const from = { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) };
  const sm = t.world.structureManager;
  if (sm.get("realm_npc:mara")) sm.delete("realm_npc:mara");
  sm.createFromWorld("realm_npc:mara", nether, from, { ...from, y: from.y + 1 }, { includeBlocks: false, includeEntities: true, saveMode: t.mc.StructureSaveMode.World });
  e.remove();
  const back = await t.waitUntil(() => (inNether().length || inOverworld().length ? true : undefined), { timeout: 600, interval: 10, message: "mara back" }).catch(() => false);
  await t.wait(20);
  t.check(!!back, "mara comes back");
  t.check(inNether().length === 1 && inNether()[0].hasTag("test:skin"), `mara is back in the Nether from her skin (${inNether().length} there)`);
  t.check(inOverworld().length === 0, `no copy in the Overworld (${inOverworld().length})`);
  for (const n of inOverworld()) n.remove();
}
