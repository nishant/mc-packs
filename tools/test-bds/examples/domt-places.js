// Deck of Many Things: every card (wild ones too) through the test path in an odd place, to catch
// errors and cards that misbehave there. Cards that can't happen in a place should fizzle, never
// throw. Edit PLACE below (one run each, they can run in parallel; about 6 minutes):
//   nether (a closed room in the Nether), end (the End island), water (under water in a pool),
//   cave (a closed room 25 blocks underground), height (a platform at y 315), creative (Creative mode),
//   zone (inside a safe zone: block-changing cards and Lit Fuse must fizzle).
//   node tools/test-bds/run.mjs --quiet --timeout 1800 --only domt_bp --scenario tools/test-bds/examples/domt-places.js
const PLACE = "nether";

/** Cards that must fizzle inside a safe zone. */
const ZONE_FIZZLE = ["anvil_drop", "the_arena", "the_spore", "hiss", "hot_headed", "creeper_party", "the_ghast", "lit_fuse"];

export default async function (t) {
  const sp = t.world.getDefaultSpawnLocation();
  const ow = t.dimension;
  const run = (dim, cmd) => {
    try {
      dim.runCommand(cmd);
    } catch (e) {
      t.log(`command failed: ${cmd}: ${e}`);
    }
  };
  let p;
  if (PLACE === "nether") {
    const nether = t.world.getDimension("nether");
    await t.loadArea(8, 8, { dimension: nether });
    run(nether, "fill 0 57 0 16 68 16 netherrack");
    run(nether, "fill 2 59 2 14 66 14 air");
    p = await t.player("Tester", { op: true, dimension: "nether", x: 8, y: 59, z: 8 });
  } else if (PLACE === "end") {
    const end = t.world.getDimension("the_end");
    p = await t.player("Tester", { op: true, dimension: "the_end", x: 30, z: 30 });
    run(end, "kill @e[type=ender_dragon]");
  } else if (PLACE === "water") {
    const { top } = await t.loadArea(sp.x + 30, sp.z);
    const g = top.location.y;
    const x = sp.x + 30;
    const z = sp.z;
    run(ow, `fill ${x - 4} ${g - 4} ${z - 4} ${x + 4} ${g - 4} ${z + 4} stone`);
    run(ow, `fill ${x - 4} ${g - 3} ${z - 4} ${x + 4} ${g} ${z + 4} water`);
    p = await t.player("Tester", { op: true, x, y: g - 2, z });
  } else if (PLACE === "cave") {
    const { top } = await t.loadArea(sp.x - 30, sp.z);
    const g = top.location.y;
    const x = sp.x - 30;
    const z = sp.z;
    run(ow, `fill ${x - 6} ${g - 27} ${z - 6} ${x + 6} ${g - 19} ${z + 6} stone`);
    run(ow, `fill ${x - 5} ${g - 26} ${z - 5} ${x + 5} ${g - 21} ${z + 5} air`);
    p = await t.player("Tester", { op: true, x, y: g - 26, z });
  } else if (PLACE === "height") {
    await t.loadArea(sp.x, sp.z + 30);
    run(ow, `fill ${sp.x - 3} 315 ${sp.z + 27} ${sp.x + 3} 315 ${sp.z + 33} stone`);
    p = await t.player("Tester", { op: true, x: sp.x, y: 316, z: sp.z + 30 });
  } else if (PLACE === "creative") {
    p = await t.player("Tester", { op: true, gameMode: "creative" });
  } else if (PLACE === "zone") {
    p = await t.player("Tester", { op: true });
    const zone = { id: "z", name: "Test zone", dim: "minecraft:overworld", x: Math.floor(p.location.x), z: Math.floor(p.location.z), r: 12 };
    await t.console(`scriptevent realm:zones ${JSON.stringify({ src: "test", part: 1, parts: 1, zones: [zone] })}`);
  } else t.fail(`unknown PLACE ${PLACE}`);
  await t.player("Buddy", { x: sp.x + 60, z: sp.z + 60 });
  t.log(`${PLACE}: Tester at ${p.dimension.id} ${p.location.x.toFixed(1)} ${p.location.y.toFixed(1)} ${p.location.z.toFixed(1)}`);
  const results = [];
  let last = t.tick;
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:domt_tested") return;
    results.push(JSON.parse(message));
    last = t.tick;
  });
  await t.console(`scriptevent realm:domt_test {"effect":"all","player":"Tester"}`);
  await t.waitUntil(() => results.length >= 147 || (results.length > 0 && t.tick - last > 600), { timeout: 20 * 60 * 25, interval: 20, message: "the deck finished testing" });
  const errors = results.filter((r) => /^error|^prep/.test(r.why));
  const fizzled = results.filter((r) => /fizzled/.test(r.why)).map((r) => r.id);
  const failed = results.filter((r) => !r.ok && !/fizzled/.test(r.why));
  t.log(`${PLACE}: tested ${results.length}; fizzled ${fizzled.length}: ${fizzled.join(", ")}`);
  t.log(`${PLACE}: failed without fizzling ${failed.length}: ${failed.map((r) => `${r.id} (${r.why})`).join("; ")}`);
  t.check(!errors.length, `no card threw: ${errors.map((r) => `${r.id} ${r.why}`).join("; ")}`);
  t.check(results.length === 147, "every card ran");
  if (PLACE === "zone") for (const id of ZONE_FIZZLE) t.check(fizzled.includes(id), `${id} fizzles in a safe zone`);
}
