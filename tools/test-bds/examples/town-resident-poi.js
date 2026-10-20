// Town Projects, residents never take a player's bed (gate D2, F39): the well's 2 residents and a player's bed 5 blocks
// from it, through a night (from time 13000, 1,600 ticks: the villagers' bed time): no resident ever sleeps (on that
// bed or any) and one that strays more than 32 blocks from home is brought back by the next census. Then the control: an ordinary villager spawned beside the same bed
// claims it and sleeps in it that night, so the check can tell a claim. Passing this is what lets `residents` default
// to Enabled (decision D2/D42); a failure means residents stay Disabled.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-resident-poi.js --timeout 6000
export default async function (t) {
  const dim = t.dimension;
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4 });
  t.server("/gamerule dodaylightcycle true");
  t.server("/gamerule domobspawning false"); // no zombies at night: they would scatter or kill the villagers being watched
  t.server("/time set 1000");
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "res", pack: "town_bp", key: "residents", value: true }));
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async () => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
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
  let head = { x: foot.x - FWD[0], y: foot.y, z: foot.z - FWD[1] };
  for (const v of [foot, head, { ...foot, y: foot.y + 1 }, { ...head, y: head.y + 1 }]) dim.getBlock(v)?.setType("minecraft:air");
  const dir = (s.f + 2) % 4; // its head away from the well (designs.js: direction 0 south .. 3 east, as FORWARD)
  // Placed with /setblock (as a player's bed is): it places both halves. A villager asleep never sets occupied_bit,
  // so a claim shows as a villager asleep (isSleeping) on the bed.
  t.server(`/setblock ${foot.x} ${foot.y} ${foot.z} bed ["direction"=${dir}]`);
  await t.wait(5);
  // Where /setblock put the head half (the 4 neighbors of the foot).
  head = [[0, 1], [-1, 0], [0, -1], [1, 0]].map(([dx, dz]) => ({ x: foot.x + dx, y: foot.y, z: foot.z + dz })).find((v) => dim.getBlock(v)?.typeId === "minecraft:bed") ?? head;
  t.log(`bed: foot ${JSON.stringify(foot)}, head ${JSON.stringify(head)}, direction ${dir}`);
  t.check(dim.getBlock(foot)?.typeId === "minecraft:bed" && dim.getBlock(head)?.typeId === "minecraft:bed", "the player's bed is whole");
  const onBed = (e) => [foot, head].some((v) => Math.hypot(e.location.x - (v.x + 0.5), e.location.z - (v.z + 0.5)) <= 1.5);
  const occupied = () => dim.getEntities({ type: "minecraft:villager_v2" }).some((e) => e.isSleeping && onBed(e));
  let residentSlept = false;

  // Night: the residents' bed time.
  t.server("/time set 13000");
  let claimed = false;
  // How far each resident is from its home (beside the well), and for how long in a row past the census's leash
  // (residents.js HOME_LEASH, 32, plus 4 for where beside the well it stands): a census (every 600 ticks) brings a
  // stray back, so none stays past it for more than 40 readings (800 ticks).
  const LEASH = 32 + 4;
  const past = new Map();
  let longest = 0;
  let farthest = 0;
  for (let k = 0; k < 80; k++) {
    await t.wait(20);
    if (occupied()) claimed = true;
    if (residents().some((e) => e.isSleeping)) residentSlept = true;
    for (const e of residents()) {
      const dist = Math.hypot(e.location.x - (s.x + 0.5), e.location.z - (s.z + 0.5));
      farthest = Math.max(farthest, dist);
      const n = dist > LEASH ? (past.get(e.id) ?? 0) + 1 : 0;
      past.set(e.id, n);
      longest = Math.max(longest, n);
    }
  }
  t.check(!claimed, "no resident slept in the player's bed through the night");
  t.check(!residentSlept, "no resident slept anywhere (they claim no bed)");
  t.check(longest <= 40, `a stray is brought home: none stayed past ${LEASH} blocks from the well for more than 40 readings (longest ${longest}, farthest ${farthest.toFixed(1)})`);
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
