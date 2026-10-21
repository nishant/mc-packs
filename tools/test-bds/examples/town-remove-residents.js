// Town Projects, a removed town's residents (O77): Remove town makes them move away. A loaded resident drops what it
// carries where it stands and is removed; one out in ground that isn't loaded is removed as soon as that ground loads
// (town:gone, entityLoad). No villager, tag or record of the town is left, so adding and removing towns never piles up
// villagers. A villager that is only tagged by hand for an unknown town keeps living (it just loses the tags on a tap).
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-remove-residents.js --timeout 4000
export default async function (t) {
  const dim = t.dimension;
  t.server("/gamerule domobspawning false");
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4, whole: true });
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `${key}${t.tick}`, pack: "town_bp", key, value }));
  cfg("residents", true);
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async () => {
    await t.wait(1);
    const since = t.tick;
    town("dump", { town: "elm" });
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const census = async () => {
    await t.wait(1);
    const since = t.tick;
    town("census", { town: "elm" });
    await t.waitMessage(p, /census of elm/, { since, timeout: 60 });
  };
  const residents = () => dim.getEntities({ type: "minecraft:villager_v2", tags: ["town:r:elm"] });
  let since = t.tick;
  town("add", { name: "Elm" });
  await t.waitMessage(p, /Town Elm added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "the well's spot is picked" });
  town("finish", { town: "elm", project: "well" });
  await t.waitUntil(async () => (d = await dump()).progress.find(([x]) => x === "well")?.[1].built === 1, { timeout: 2400, interval: 100, message: "the well is built" });
  await t.waitUntil(async () => {
    await census();
    return residents().length >= 2;
  }, { timeout: 1200, interval: 100, message: "2 residents moved in" });
  // No more censuses (they would bring a stray home); residents already living stay.
  cfg("residents", false);
  await t.wait(5);
  const [near, far] = residents();
  const nearName = near.nameTag;
  const farName = far.nameTag;
  // The one that stays loaded carries bread: it drops where it stands.
  near.getComponent("minecraft:inventory")?.container?.setItem(0, new t.mc.ItemStack("minecraft:bread", 3));
  // The other is far out, in ground that is then unloaded (no player near, its ticking area gone).
  const FX = 700;
  t.assert(t.server(`/tickingarea add circle ${FX} 0 0 2 far_res`).ok, "a ticking area far out");
  await t.waitUntil(() => {
    try {
      return !!dim.getBlock({ x: FX, y: -61, z: 0 });
    } catch {
      return false;
    }
  }, { timeout: 600, interval: 10, message: "the far ground loads" });
  far.teleport({ x: FX + 0.5, y: -60, z: 0.5 });
  await t.wait(20);
  const farId = far.id;
  t.check(dim.getEntities({ type: "minecraft:villager_v2", location: { x: FX, y: -60, z: 0 }, maxDistance: 8 }).some((e) => e.id === farId), `${farName} stands far out`);
  t.assert(t.server("/tickingarea remove far_res").ok, "the far area removed");
  await t.waitUntil(() => {
    try {
      return !dim.getBlock({ x: FX, y: -61, z: 0 });
    } catch {
      return true;
    }
  }, { timeout: 1200, interval: 10, message: "the far ground unloads" });
  const at = { ...near.location };
  since = t.tick;
  town("remove_town", { town: "elm" });
  await t.waitMessage(p, /town elm removed/, { since, timeout: 60 });
  await t.wait(5);
  t.check(!dim.getEntities({ type: "minecraft:villager_v2" }).some((e) => e.nameTag === nearName), `${nearName} (loaded) moved away`);
  const bread = dim.getEntities({ type: "minecraft:item", location: at, maxDistance: 4 }).filter((e) => e.getComponent("minecraft:item")?.itemStack?.typeId === "minecraft:bread");
  t.check(bread.reduce((n, e) => n + (e.getComponent("minecraft:item")?.itemStack?.amount ?? 0), 0) === 3, `what ${nearName} carried dropped where it stood (${bread.length} item entities)`);
  const gone = await new Promise((resolve) => {
    // The town's own saved data (town_bp's store, not this scenario's): a dump of a removed town answers "no town".
    const since = t.tick;
    town("dump", { town: "elm" });
    t.waitMessage(p, /no town/, { since, timeout: 60 }).then(() => resolve(true), () => resolve(false));
  });
  t.check(gone, "the town is gone (a dump says no town)");
  // The far one's ground loads again: it moves away then.
  t.assert(t.server(`/tickingarea add circle ${FX} 0 0 2 far_res2`).ok, "the far area again");
  await t.waitUntil(() => {
    try {
      return !!dim.getBlock({ x: FX, y: -61, z: 0 });
    } catch {
      return false;
    }
  }, { timeout: 600, interval: 10, message: "the far ground loads again" });
  await t.wait(40);
  const still = dim.getEntities({ type: "minecraft:villager_v2" }).filter((e) => e.nameTag === farName || e.id === farId);
  t.log(`villagers out there: ${dim.getEntities({ type: "minecraft:villager_v2", location: { x: FX, y: -60, z: 0 }, maxDistance: 32 }).map((e) => `${e.nameTag}:${e.getTags().join("|")}`).join("; ") || "none"}`);
  t.check(still.length === 0, `${farName} (unloaded at the removal) moved away once its ground loaded (${still.length} left)`);
  t.check(dim.getEntities({ type: "minecraft:villager_v2" }).every((e) => !e.getTags().some((x) => x === "realm:resident" || x.startsWith("town:"))), "no villager carries the town's tags");
  t.server("/tickingarea remove far_res2");
}
