// Champions: an entity that isn't a mob but carries the champion tag (an item tagged when a world with repeating
// entity ids handed back the wrong entity) loses the tags and its name, and doesn't count toward maxAlive.
//   node tools/test-bds/run.mjs --quiet --flat --only elite_bp --scenario tools/test-bds/examples/elite-not-a-mob.js --timeout 200
export default async function (t) {
  const p = await t.player("Tester", { op: true });
  const dim = t.dimension;
  const at = { x: p.location.x + 3, y: p.location.y + 1, z: p.location.z };
  const items = [];
  for (let i = 0; i < 9; i++) {
    const it = dim.spawnItem(new t.mc.ItemStack("minecraft:stick", 1), at);
    it.addTag("realm:champion");
    it.addTag("realm:champion_trait:swift");
    it.addTag("realm:saga:bell_warden");
    it.nameTag = "Gorm the Swift";
    items.push(it);
  }
  await t.seconds(7);
  const left = dim.getEntities({ tags: ["realm:champion"] }).length;
  t.check(left === 0, `no item keeps the champion tag (${left})`);
  t.check(items.every((it) => !it.isValid || (!it.hasTag("realm:saga:bell_warden") && it.nameTag === "")), "tags and names are gone");
  // A real request still makes a champion (maxAlive isn't used up by the items).
  t.server(`/scriptevent realm:champion_spawn {"dim":"minecraft:overworld","x":${at.x},"y":${at.y},"z":${at.z},"mob":"minecraft:zombie","tag":"realm:test_champ"}`);
  await t.wait(10);
  t.check(dim.getEntities({ tags: ["realm:test_champ"] }).some((e) => e.typeId === "minecraft:zombie"), "a requested champion still spawns");
}
