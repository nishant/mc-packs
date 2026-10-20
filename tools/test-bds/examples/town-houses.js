// Town Projects, houses (F40): a Settlement builds no houses; finishing level 1 makes it a Village (level 2), which
// builds house_1..house_4 (residentsPerLevel[1]) by itself at automatic spots, with no deliveries. Each house has its
// door in the front wall facing the spot, a two-block bed (foot and head, still whole after a neighbor update, so its
// direction state matches its halves) and its own job-site block from houseJobs. No region overlaps another; the
// mayor's page counts the houses; Remove spot takes a house away and puts the ground back. With residents Enabled, the
// well's 2 families move into house_1 and house_2 (while no player is within 24 blocks) and 2 more come to house_3 and
// house_4, each with its house's look (farmer, librarian, fisherman, butcher) and standing in its house.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-houses.js --timeout 6000
export default async function (t) {
  const dim = t.dimension;
  const JOBS = ["composter", "lectern", "barrel", "smoker", "cartography_table", "brewing_stand", "fletching_table", "loom", "stonecutter_block", "grindstone"].map((b) => `minecraft:${b}`);
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4 });
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump", { town: id });
    const m = await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  const prog = (d, id) => d.progress.find(([x]) => x === id)?.[1];
  const houses = ["house_1", "house_2", "house_3", "house_4"];
  // Local (right, up, forward) to world, as designs.js toWorld.
  const FWD = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const at = (s, x, y, z) => {
    const [fx, fz] = FWD[s.f];
    const [rx, rz] = [-fz, fx];
    return { x: s.x + rx * x + fx * z, y: s.y + y, z: s.z + rz * x + fz * z };
  };
  const block = (v) => dim.getBlock(v);
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "res", pack: "town_bp", key: "residents", value: true }));
  const residents = () => dim.getEntities({ type: "minecraft:villager_v2", tags: ["town:r:elm"] });
  const census = async () => {
    await t.wait(1); // never take the previous census\'s answer from the same tick
    const since = t.tick;
    town("census", { town: "elm" });
    await t.waitMessage(p, /census of elm/, { since, timeout: 60 });
  };

  let since = t.tick;
  town("add", { name: "Elm" });
  await t.waitMessage(p, /Town Elm added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => {
    d = await dump("elm");
    return d.town.spots.well && d.town.spots.notice_board;
  }, { timeout: 6000, interval: 100, message: "level 1 spots picked" });
  t.check(houses.every((h) => !prog(d, h)?.done && !d.town.spots[h]), "a Settlement builds no houses");

  // Level 1 done: a Village (level 2) with 4 houses due. The well's families first.
  town("finish", { town: "elm", project: "well" });
  await t.wait(10);
  town("finish", { town: "elm", project: "notice_board" });
  await t.waitUntil(async () => (d = await dump("elm")).town.lvl === 2, { timeout: 200, interval: 20, message: "level 2" });
  t.check(houses.every((h) => prog(d, h)?.done === 1 && !Object.keys(prog(d, h)?.c ?? {}).length && !Object.keys(prog(d, h)?.got ?? {}).length), "houses 1 to 4 are due, with no deliveries");
  t.check(!prog(d, "house_5")?.done, "house_5 waits for level 3");
  since = t.tick;
  town("finish", { town: "elm", project: "house_1" });
  await t.waitMessage(p, /built by the town itself/, { since, timeout: 40 });

  await t.waitUntil(async () => {
    d = await dump("elm");
    return houses.every((h) => prog(d, h)?.built === 1);
  }, { timeout: 5000, interval: 100, message: "4 houses built" });
  t.log("house spots:", JSON.stringify(houses.map((h) => d.town.spots[h])));
  t.check(!houses.some((h) => d.town.nos?.includes(h)), "every house found a spot");

  const regions = Object.entries(d.regions);
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++) {
      const [a, b] = [regions[i][1], regions[j][1]];
      t.check(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1], `${regions[i][0]} and ${regions[j][0]} don't overlap`);
    }

  for (const [k, h] of houses.entries()) {
    const s = d.town.spots[h];
    t.check(s.a === 1, `${h} was picked automatically`);
    const [fx, fz] = FWD[s.f];
    t.check(fx * s.x + fz * s.z > 0, `${h} faces the center`);
    const foot = block(at(s, 2, 0, 5));
    const head = block(at(s, 2, 0, 6));
    t.check(foot?.typeId === "minecraft:bed" && head?.typeId === "minecraft:bed", `${h}: a two-block bed (${foot?.typeId}, ${head?.typeId})`);
    t.check(foot?.permutation.getState("head_piece_bit") === false && head?.permutation.getState("head_piece_bit") === true, `${h}: foot and head`);
    const job = block(at(s, -2, 0, 6))?.typeId;
    t.check(job === JOBS[k], `${h}: its job site is ${JOBS[k]} (${job})`);
    const low = block(at(s, 0, 0, 1));
    const up = block(at(s, 0, 1, 1));
    t.check(low?.typeId === "minecraft:wooden_door" && up?.typeId === "minecraft:wooden_door", `${h}: a door in the front wall`);
    t.check(up?.permutation.getState("upper_block_bit") === true, `${h}: the door's upper half`);
    t.check(block(at(s, 0, 0, 0))?.isAir, `${h}: the door opens onto the spot`);
    // A neighbor update: a bed whose direction doesn't match its halves breaks here.
    const above = at(s, 2, 1, 5);
    t.server(`/setblock ${above.x} ${above.y} ${above.z} oak_planks`);
    t.server(`/setblock ${above.x} ${above.y} ${above.z} air`);
  }
  await t.wait(10);
  for (const h of houses) {
    const s = d.town.spots[h];
    t.check(block(at(s, 2, 0, 5))?.typeId === "minecraft:bed" && block(at(s, 2, 0, 6))?.typeId === "minecraft:bed", `${h}: the bed is still whole after a neighbor update`);
  }
  t.check(d.town.log?.filter(([, text]) => /A new house went up/.test(text)).length >= 1, "the story tells of the new houses");

  // Residents: the well's two move into house_1 and house_2, two more come to house_3 and house_4.
  t.server("/tp Ann 90 -60 0"); // still in the town (96), more than 24 blocks from every house
  await t.wait(20);
  const LOOK = ["farmer", "librarian", "fisherman", "butcher"];
  await t.waitUntil(async () => {
    await census();
    d = await dump("elm");
    return houses.every((h, k) => d.residents.r.find((r) => r.s === k)?.h === h && d.residents.r.find((r) => r.s === k)?.d === undefined);
  }, { timeout: 2400, interval: 100, message: "every family lives in its house" });
  const rs = residents();
  t.check(rs.length === 4, `4 residents (${rs.length}), the well's 2 moved, not doubled`);
  for (const [k, h] of houses.entries()) {
    const r = d.residents.r.find((x) => x.s === k);
    const e = rs.find((x) => x.id === r.e);
    const home = at(d.town.spots[h], 0, 0, 4);
    t.check(!!e && Math.hypot(e.location.x - home.x, e.location.z - home.z) <= 16, `${h}: ${r.n} is home`);
    t.check(!!e && e.matches({ families: [LOOK[k]] }), `${h}: ${r.n} is a ${LOOK[k]} (its job site)`);
  }
  t.server("/tp Ann 0 -60 0");
  await t.wait(20);

  // The mayor's page counts them.
  const form = t.waitForm(p, { timeout: 100 });
  t.cmd(p, "/realm:town_stats");
  const page = await form;
  const body = String(page.body ?? "").replace(/§./g, "");
  page.answer("Close");
  t.check(/Houses: 4 of 4 built/.test(body), `the page counts the houses (${body.match(/Houses[^\n]*/)?.[0]})`);
  t.check(/Next, as a Town \(level 3\): new projects \(Market Stall, Dock\) and 2 new houses for families/.test(body), "the next level brings 2 more houses");

  // Remove spot: the house goes and the ground comes back.
  const s1 = d.town.spots.house_1;
  since = t.tick;
  town("remove", { town: "elm", project: "house_1" });
  await t.waitMessage(p, /House 1 was taken away/, { since, timeout: 60 });
  await t.wait(5);
  t.check(block(at(s1, 2, 0, 5))?.typeId !== "minecraft:bed" && block(at(s1, 0, 0, 1))?.typeId !== "minecraft:wooden_door", "house_1's bed and door are gone");
  let walls = 0;
  for (let x = -3; x <= 3; x++) for (let z = 1; z <= 7; z++) if (block(at(s1, x, 1, z))?.typeId === "minecraft:oak_planks") walls++;
  t.check(walls === 0, `no wall left (${walls})`);
  d = await dump("elm");
  t.check(!d.town.spots.house_1 && prog(d, "house_1").built === 0 && prog(d, "house_1").done === 1, "house_1 has no spot and waits for one (Remove spot never queues it again)");
}
