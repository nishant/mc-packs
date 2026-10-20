// Town Projects, residents never take a player's bed (gate D2, F39): the well's 2 residents and a player's bed 5 blocks
// from it, through a night (from time 13000, 1,600 ticks: the villagers' bed time): the bed is never occupied and the
// residents stay within 24 blocks of their home. Then the control: an ordinary villager spawned beside the same bed
// claims it and sleeps in it that night, so the check can tell a claim. Passing this is what lets `residents` default
// to Enabled (decision D2/D42); a failure means residents stay Disabled.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-resident-poi.js --timeout 6000
export default async function (t) {
  const dim = t.dimension;
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4 });
  t.server("/gamerule dodaylightcycle true");
  t.server("/time set 1000");
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "res", pack: "town_bp", key: "residents", value: true }));
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async () => {
    const since = t.tick;
    town("dump", { town: "elm" });
    const m = await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  const residents = () => dim.getEntities({ type: "minecraft:villager_v2", tags: ["town:r:elm"] });

  let since = t.tick;
  town("add", { name: "Elm" });
  await t.waitMessage(p, /Town Elm added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "the well's spot" });
  town("finish", { town: "elm", project: "well" });
  await t.waitUntil(async () => (d = await dump()).progress.find(([x]) => x === "well")?.[1].built === 1, { timeout: 2400, interval: 100, message: "the well is built" });
  await t.waitUntil(async () => {
    since = t.tick;
    town("census", { town: "elm" });
    await t.waitMessage(p, /census of elm/, { since, timeout: 60 });
    return residents().length === 2;
  }, { timeout: 1200, interval: 100, message: "2 residents" });
  const s = d.town.spots.well;
  // The player's bed: 5 blocks in front of the well (the way it faces, away from it), on the ground at the spot's height.
  const FWD = [[0, 1], [-1, 0], [0, -1], [1, 0]][s.f];
  const foot = { x: s.x - FWD[0] * 5, y: s.y, z: s.z - FWD[1] * 5 };
  const head = { x: foot.x - FWD[0], y: foot.y, z: foot.z - FWD[1] };
  for (const v of [foot, head, { ...foot, y: foot.y + 1 }, { ...head, y: head.y + 1 }]) dim.getBlock(v)?.setType("minecraft:air");
  const dir = (s.f + 2) % 4; // its head away from the well (designs.js: direction 0 south .. 3 east, as FORWARD)
  dim.getBlock(foot).setPermutation(t.mc.BlockPermutation.resolve("minecraft:bed", { direction: dir, head_piece_bit: false, occupied_bit: false }));
  dim.getBlock(head).setPermutation(t.mc.BlockPermutation.resolve("minecraft:bed", { direction: dir, head_piece_bit: true, occupied_bit: false }));
  await t.wait(5);
  t.check(dim.getBlock(foot)?.typeId === "minecraft:bed" && dim.getBlock(head)?.typeId === "minecraft:bed", "the player's bed is whole");
  const occupied = () => [foot, head].some((v) => dim.getBlock(v)?.permutation.getState("occupied_bit") === true);
  const homes = residents().map((e) => ({ id: e.id, x: e.location.x, z: e.location.z }));

  // Night: the residents' bed time.
  t.server("/time set 13000");
  let claimed = false;
  let far = 0;
  for (let k = 0; k < 80; k++) {
    await t.wait(20);
    if (occupied()) claimed = true;
    for (const e of residents()) {
      const h = homes.find((x) => x.id === e.id);
      if (h && Math.hypot(e.location.x - h.x, e.location.z - h.z) > 24) far++;
    }
  }
  t.check(!claimed, "no resident slept in the player's bed through the night");
  t.check(far === 0, `the residents stayed within 24 blocks of home (${far} readings past it)`);
  t.check(residents().length === 2, "both still there");

  // The control: an ordinary villager claims the same bed, so the check above can tell a claim.
  const plain = dim.spawnEntity("minecraft:villager_v2", { x: foot.x + 0.5 - FWD[0] * 2, y: foot.y, z: foot.z + 0.5 - FWD[1] * 2 }, { spawnEvent: "minecraft:spawn_from_village" });
  t.check(plain.getProperty("realm:resident") === false, "an ordinary villager has the property unset (its group isn't on)");
  let control = false;
  for (let k = 0; k < 120 && !control; k++) {
    await t.wait(20);
    control = occupied();
  }
  t.check(control, "the control: an ordinary villager sleeps in the bed (without this the gate proves nothing)");
}
