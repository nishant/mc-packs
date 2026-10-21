// Town Projects, nothing is walled in by a build (O80): mobs standing where a build goes up (here 6 pigs held still on
// the well's ring, where its cobblestone goes) are moved just outside its region before the blocks go in, so none
// suffocates. town-houses lost a resident this way once: a house went up where it stood.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-build-mobs.js --timeout 3000
export default async function (t) {
  const dim = t.dimension;
  const hurt = [];
  t.world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
    try {
      if (hurtEntity.typeId === "minecraft:pig") hurt.push(String(damageSource.cause));
    } catch {}
  });
  t.server("/gamerule domobspawning false");
  const p = await t.player("Ann", { op: true, x: 0, z: 0, gameMode: "creative" });
  await t.loadArea(0, 0, { radius: 4, whole: true });
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "o", pack: "town_bp", key: "outlineSeconds", value: 0 }));
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "mob", ...extra }));
  const dump = async () => {
    await t.wait(1);
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  let since = t.tick;
  town("add", { name: "Mob" });
  await t.waitMessage(p, /Town Mob added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "the well's spot" });
  const s = d.town.spots.well;
  const FWD = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const at = (x, y, z) => {
    const [fx, fz] = FWD[s.f];
    return { x: s.x - fz * x + fx * z, y: s.y + y, z: s.z + fx * x + fz * z };
  };
  // On the ring: the cobblestone at y 0 goes into their feet.
  const cells = [[-2, 1], [0, 1], [2, 1], [-2, 3], [2, 3], [0, 5]].map(([x, z]) => at(x, 0, z));
  for (const c of cells) t.assert(t.server(`/summon pig ${c.x} ${c.y} ${c.z}`).ok, `a pig at ${c.x}, ${c.y}, ${c.z}`);
  t.server("/effect @e[type=pig] slowness 120 255 true");
  await t.wait(2);
  const pigs = dim.getEntities({ type: "minecraft:pig" });
  t.assert(pigs.length === 6, `6 pigs (${pigs.length})`);
  town("finish", { project: "well" });
  await t.waitUntil(async () => (await dump()).progress.find(([id]) => id === "well")[1].built === 1, { timeout: 1200, interval: 20, message: "the well is built" });
  await t.wait(60);
  const alive = pigs.filter((e) => e.isValid);
  const inside = alive.filter((e) => {
    const b = dim.getBlock({ x: Math.floor(e.location.x), y: Math.floor(e.location.y), z: Math.floor(e.location.z) });
    return b && !b.isAir && !b.isLiquid && b.typeId !== "minecraft:oak_fence";
  });
  t.log(`pigs: ${alive.map((e) => `${e.location.x.toFixed(1)},${e.location.y.toFixed(1)},${e.location.z.toFixed(1)}`).join(" ")}; hurt: ${hurt.join(",") || "none"}`);
  t.check(alive.length === 6, `every pig lives (${alive.length} of 6)`);
  t.check(inside.length === 0, `none is inside a block (${inside.length})`);
  t.check(!hurt.includes("suffocation"), `none suffocated (${hurt.filter((c) => c === "suffocation").length} hits)`);
}
