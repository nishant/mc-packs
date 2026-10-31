// Town Projects, residents and breeding (O76): a Village with 4 houses (spots set by hand, so nothing waits for a scan)
// and its 4 residents, each given 12 bread (what a vanilla villager needs to be willing), and 10 players in the town,
// for `minutes` (default 20: one in-game day). Residents claim no bed (D2), so no villager should be born: every
// villager born is logged and fails the run, and the town's villagers must still be its 4 residents at the end.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-breed-soak.js --arg minutes=3 --timeout 30000
//   the O76 soak (October 21: 0 born in 20 minutes, the residents' bread untouched): the same with --arg minutes=20
// Arguments: minutes (default 20; the suite's command above runs 3).
export default async function (t) {
  const MINUTES = Math.max(1, Number(t.args.minutes ?? 20));
  const sys = t.system;
  const dim = t.dimension;
  const born = [];
  t.world.afterEvents.entitySpawn.subscribe(({ entity, cause }) => {
    try {
      if (entity.typeId === "minecraft:villager_v2" && String(cause) === "Born") born.push({ tick: t.tick, at: `${Math.round(entity.location.x)} ${Math.round(entity.location.z)}` });
    } catch {}
  });
  t.server("/gamerule domobspawning false");
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4, whole: true });
  for (const [key, value] of [["autoSpots", false], ["residents", true]]) sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: key, pack: "town_bp", key, value }));
  await t.wait(5);
  const town = (action, extra = {}) => sys.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "elm", ...extra }));
  const dump = async () => {
    await t.wait(1);
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const census = async () => {
    await t.wait(1);
    const since = t.tick;
    town("census");
    await t.waitMessage(p, /census of elm/, { since, timeout: 60 });
  };
  const prog = (d, id) => d.progress.find(([x]) => x === id)?.[1];
  const Y = -60;
  p.teleport({ x: 0.5, y: Y, z: 0.5 });
  await t.wait(10);
  const since = t.tick;
  town("add", { name: "Elm" });
  await t.waitMessage(p, /Town Elm added/, { since, timeout: 60 });
  town("spot", { project: "well", spot: { x: -20, y: Y, z: -25, f: 0 } });
  town("spot", { project: "notice_board", spot: { x: 20, y: Y, z: -25, f: 0 } });
  await t.wait(5);
  town("finish", { project: "well" });
  await t.wait(5);
  town("finish", { project: "notice_board" });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.lvl === 2, { timeout: 400, interval: 20, message: "a Village" });
  const houses = ["house_1", "house_2", "house_3", "house_4"];
  houses.forEach((h, i) => town("spot", { project: h, spot: { x: -36 + i * 24, y: Y, z: 15, f: 0 } }));
  await t.waitUntil(async () => {
    d = await dump();
    return houses.every((h) => prog(d, h)?.built === 1);
  }, { timeout: 400, interval: 20, message: "4 houses built" });
  // Families move only while no player is within 24 blocks of their old or new home.
  p.teleport({ x: 85.5, y: Y, z: 0.5 });
  await t.wait(20);
  const residents = () => dim.getEntities({ type: "minecraft:villager_v2", tags: ["town:r:elm"] });
  await t.waitUntil(async () => {
    await census();
    d = await dump();
    return houses.every((h, k) => d.residents.r.find((r) => r.s === k)?.h === h && d.residents.r.find((r) => r.s === k)?.d === undefined) && residents().length === 4;
  }, { timeout: 3000, interval: 100, message: "4 families in their houses" });
  const start = residents().map((e) => e.id);
  for (const e of residents()) e.getComponent("minecraft:inventory")?.container?.setItem(0, new t.mc.ItemStack("minecraft:bread", 12));
  t.log(`4 residents with 12 bread each: ${residents().map((e) => e.nameTag).join(", ")}`);
  // 10 players in the town, by the houses and the well.
  p.teleport({ x: 0.5, y: Y, z: 5.5 });
  for (let i = 1; i < 10; i++) await t.player(`Walker${i}`, { x: -40 + i * 9, z: i % 2 ? 5 : 30, settle: 2 });
  t.server("/time set day");
  const ticks = MINUTES * 1200;
  const until = t.tick + ticks;
  while (t.tick < until) {
    await t.wait(1200);
    const all = dim.getEntities({ type: "minecraft:villager_v2" });
    t.log(`minute ${Math.round((ticks - (until - t.tick)) / 1200)}: ${all.length} villagers, ${born.length} born, bread left ${residents().map((e) => e.getComponent("minecraft:inventory")?.container?.getItem(0)?.amount ?? 0).join("/")}`);
  }
  const all = dim.getEntities({ type: "minecraft:villager_v2" });
  if (born.length) t.log("born:", JSON.stringify(born));
  t.check(born.length === 0, `no villager was born in ${MINUTES} minutes (${born.length})`);
  t.check(all.length === 4 && all.every((e) => start.includes(e.id)), `the town's villagers are its 4 residents (${all.length})`);
}
