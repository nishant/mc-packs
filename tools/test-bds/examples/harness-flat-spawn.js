// Harness self-test: the flat world template's spawn is pinned to 0,0 (a flat template used to get a random spawn: 261,5 on
// one cache, 0,0 on another, and meteor-edge and expedition-nether-carts depend on 0,0). Needs no pack under test.
// The offline proof (tools/test-bds/lib/server-template.test.mjs) is deterministic; this run shows the game honors the pin:
// on an old cache whose template drew a different spawn it FAILS before the pin and passes after.
//   node tools/test-bds/run.mjs --quiet --flat --only help_bp --scenario tools/test-bds/examples/harness-flat-spawn.js --timeout 240
export default async function (t) {
  const sp = t.world.getDefaultSpawnLocation();
  t.log(`flat world default spawn: ${sp.x}, ${sp.y}, ${sp.z}`);
  t.check(sp.x === 0 && sp.z === 0, `the flat world's default spawn is 0,0 (${sp.x}, ${sp.z})`);
  const p = await t.player("Spawny");
  t.check(Math.abs(p.location.x) < 2 && Math.abs(p.location.z) < 2, `a player placed at the default spawn stands at 0,0 (${p.location.x.toFixed(1)}, ${p.location.z.toFixed(1)})`);
}
