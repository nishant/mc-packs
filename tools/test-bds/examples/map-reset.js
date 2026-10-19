// Minimap: /realm:map_reset clears an online player's destination and marked spots, needs "confirm", is refused for
// non-operators, and leaves unrelated player properties alone. About 30 s:
//   node tools/test-bds/run.mjs --quiet --timeout 600 --only map_bp --scenario tools/test-bds/examples/map-reset.js
export default async function (t) {
  const op = await t.player("Op", { op: true });
  const pal = await t.player("Pal");
  pal.setDynamicProperty("map:wp", JSON.stringify({ n: "Home", dim: "minecraft:overworld", x: 10, z: 10, k: "spot" }));
  pal.setDynamicProperty("map:marks", JSON.stringify([{ n: "Cave", dim: "minecraft:overworld", x: 1, z: 2 }]));
  pal.setDynamicProperty("scenario:keep", "yes");
  await t.wait(5);

  t.cmd(pal, "/realm:map_reset confirm");
  await t.wait(10);
  t.check(pal.getDynamicProperty("map:wp") !== undefined, "a non-operator can't reset the map");

  t.cmd(op, "/realm:map_reset");
  await t.wait(10);
  t.check(pal.getDynamicProperty("map:marks") !== undefined, "without confirm nothing is cleared");

  t.cmd(op, "/realm:map_reset confirm");
  await t.wait(20);
  t.check(pal.getDynamicProperty("map:wp") === undefined, "the destination is cleared");
  t.check(pal.getDynamicProperty("map:marks") === undefined, "the marked spots are cleared");
  t.check(pal.getDynamicProperty("scenario:keep") === "yes", "unrelated properties are kept");
  t.check(t.world.getDynamicProperty("map:reset") === 1, "the generation is saved");
}
