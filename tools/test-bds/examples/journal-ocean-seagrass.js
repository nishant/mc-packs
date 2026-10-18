// Field Journal: a diver standing in seagrass on the sea bed finds the Ocean place too (as journal-ocean-bed.js, with
// seagrass at the feet instead of water). A glass tank of water 12 deep on the flat world stands in for the sea.
// About 30 seconds:
//   node tools/test-bds/run.mjs --quiet --flat --only journal_bp --scenario tools/test-bds/examples/journal-ocean-seagrass.js --timeout 300
export default async function (t) {
  const p = await t.player("Tester", { op: true });
  const x = Math.floor(p.location.x) + 20, z = Math.floor(p.location.z);
  const ground = t.dimension.getTopmostBlock({ x, z });
  const g = ground.y;
  t.assert(t.server(`/fill ${x - 3} ${g + 1} ${z - 3} ${x + 3} ${g + 12} ${z + 3} glass`).ok, "a glass tank");
  t.assert(t.server(`/fill ${x - 2} ${g + 1} ${z - 2} ${x + 2} ${g + 12} ${z + 2} water`).ok, "filled with water 12 deep");
  t.assert(t.server(`/fill ${x - 1} ${g + 1} ${z - 1} ${x + 1} ${g + 1} ${z + 1} seagrass`).ok, "seagrass on the bed");
  await t.wait(10);
  t.log(`at the feet: ${t.dimension.getBlock({ x, y: g + 1, z })?.typeId}`);
  const top = t.dimension.getTopmostBlock({ x, z });
  t.log(`topmost block over the tank: ${top?.typeId} at y ${top?.y} (water surface at ${g + 12})`);
  // On dry land first: no Ocean.
  const dry = t.tick;
  await t.seconds(4);
  t.check(!t.messages(p, { since: dry }).some((m) => /New entry in Places - Ocean/.test(m.plain)), "no Ocean on dry land");
  const since = t.tick;
  p.teleport({ x: x + 0.5, y: g + 1, z: z + 0.5 });
  const ocean = () => t.messages(p, { since }).some((m) => m.pack === "journal_bp" && /New entry in Places - Ocean/.test(m.plain));
  for (let i = 0; i < 10 && !ocean(); i++) await t.seconds(1);
  t.check(ocean(), "standing in seagrass on the bed of water 12 deep finds Ocean");
}
