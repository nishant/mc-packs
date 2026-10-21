// Town Projects, automatic spots (F37): a new town picks a spot for each level 1 project by itself, while a player is
// in it. A planks cabin and a grass_path line in the town are never inside a spot's region (its footprint plus a
// 2-block margin), every build faces the center, and the finished well shows its outline, goes up and leaves the
// cabin and the path as they were.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-auto-spots.js --timeout 3000
export default async function (t) {
  const dim = t.dimension;
  const G = -61; // flat world: grass at -61
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4, whole: true });
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump", { town: id });
    const m = await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  // A planks cabin east of the center and a path line south of it.
  t.assert(t.server(`/fill 8 ${G + 1} -3 14 ${G + 4} 3 oak_planks hollow`).ok, "the cabin");
  t.assert(t.server(`/fill -30 ${G} 10 30 ${G} 10 grass_path`).ok, "the path");
  const cabin = [];
  for (let x = 8; x <= 14; x++) for (let z = -3; z <= 3; z++) cabin.push([x, z]);
  const path = [];
  for (let x = -30; x <= 30; x++) path.push([x, 10]);
  const count = (id, x1, y1, z1, x2, y2, z2) => {
    let n = 0;
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) if (dim.getBlock({ x, y, z })?.typeId === id) n++;
    return n;
  };
  const planks = count("minecraft:oak_planks", 8, G + 1, -3, 14, G + 4, 3);
  const paths = count("minecraft:grass_path", -30, G, 10, 30, G, 10);

  let since = t.tick;
  town("add", { name: "Oak" });
  await t.waitMessage(p, /Town Oak added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => {
    d = await dump("oak");
    return d.town.spots.well && d.town.spots.notice_board;
  }, { timeout: 6000, interval: 100, message: "both level 1 spots picked" });
  t.log("spots:", JSON.stringify(d.town.spots), "regions:", JSON.stringify(d.regions));
  t.check(!d.town.scan && !d.town.nos, "nothing left to pick, nothing without a spot");
  for (const [id, [x1, z1, x2, z2]] of Object.entries(d.regions)) {
    const inside = ([x, z]) => x >= x1 && x <= x2 && z >= z1 && z <= z2;
    t.check(!cabin.some(inside), `${id}: its region keeps off the cabin`);
    t.check(!path.some(inside), `${id}: its region keeps off the path`);
    const s = d.town.spots[id];
    t.check(s.a === 1, `${id} was picked automatically`);
    const fwd = [[0, 1], [-1, 0], [0, -1], [1, 0]][s.f];
    t.check(fwd[0] * s.x + fwd[1] * s.z > 0, `${id} faces the center (f ${s.f} at ${s.x}, ${s.z})`);
  }
  const [a, b] = [d.regions.well, d.regions.notice_board];
  t.check(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1], "the two regions don't overlap");

  // The well: outline, then built.
  since = t.tick;
  town("finish", { project: "well", town: "oak" });
  try {
    await t.waitUntil(async () => (await dump("oak")).progress.find(([id]) => id === "well")[1].built === 1, { timeout: 1200, interval: 40, message: "the well is built" });
  } catch (e) {
    // The build waits while a player stands in its region: say where Ann stood (she was spawned at 0, 0).
    const v = p.location;
    t.log("Ann at", v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2), "well region:", JSON.stringify(d.regions.well));
    throw e;
  }
  const told = t.messages(p, { since }).map((m) => m.plain);
  t.check(told.some((m) => /goes up here in \d+ seconds?/.test(m)), "players nearby were told it goes up");
  const s = (await dump("oak")).town.spots.well;
  t.check(!s.bs, "bs is cleared once built");
  t.check(count("minecraft:oak_planks", 8, G + 1, -3, 14, G + 4, 3) === planks, "the cabin is untouched");
  t.check(count("minecraft:grass_path", -30, G, 10, 30, G, 10) === paths, "the path is untouched");
  const water = count("minecraft:water", s.x - 6, s.y - 2, s.z - 6, s.x + 6, s.y, s.z + 6);
  t.check(water >= 9, `the well has its water (${water})`);
}
