// Town Projects, residents never work (F39): a resident farmer's look comes with the vanilla farmer's work, which
// harvests every ripe crop near it, a player's farm too. realm:become_resident takes the work schedules, work goals
// and love groups off (town_bp's villager_v2 file), so three residents beside a player's ripe wheat leave it alone
// for a whole working day, while the control, an ordinary farmer with its composter, harvests its own plot.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-resident-farm.js --timeout 900
export default async function (t) {
  const dim = t.dimension;
  await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 3 });
  t.server("/gamerule domobspawning false");
  t.server("/gamerule dodaylightcycle true");
  t.server("/time set 0"); // the farmers' working hours
  const plot = (ox) => {
    t.assert(t.server(`/fill ${ox} -61 8 ${ox + 6} -61 14 farmland ["moisturized_amount"=7]`).ok, "farmland");
    t.server(`/setblock ${ox + 3} -61 11 water`);
    t.assert(t.server(`/fill ${ox} -60 8 ${ox + 6} -60 14 wheat ["growth"=7]`).ok, "ripe wheat");
    t.server(`/setblock ${ox + 3} -60 11 air`);
  };
  plot(-30);
  plot(30);
  // As main.js spawnResident does: spawn_from_village, the look's event, then realm:become_resident.
  const residents = [];
  for (let i = 0; i < 3; i++) {
    const e = dim.spawnEntity("minecraft:villager_v2", { x: -26.5 + i, y: -60, z: 5.5 }, { spawnEvent: "minecraft:spawn_from_village" });
    e.triggerEvent("minecraft:become_farmer");
    e.triggerEvent("realm:become_resident");
    residents.push(e);
  }
  t.server("/setblock 33 -60 4 composter");
  const control = dim.spawnEntity("minecraft:villager_v2", { x: 33.5, y: -60, z: 5.5 }, { spawnEvent: "minecraft:spawn_from_village" });
  control.triggerEvent("minecraft:become_farmer");
  await t.wait(10);
  t.check(residents.every((e) => e.getProperty("realm:resident") === true && e.matches({ families: ["farmer"] })), "the residents are farmers to look at");
  const ripe = (ox) => {
    let n = 0;
    for (let x = ox; x <= ox + 6; x++) for (let z = 8; z <= 14; z++) if (dim.getBlock({ x, y: -60, z })?.permutation.getState("growth") === 7) n++;
    return n;
  };
  const start = ripe(-30);
  t.check(start === 48 && ripe(30) === 48, `both plots ripe (${start}, ${ripe(30)})`);
  let least = start;
  for (let k = 0; k < 6; k++) {
    await t.wait(400);
    least = Math.min(least, ripe(-30));
    t.log(`time ${t.world.getTimeOfDay()}: the residents' plot ${ripe(-30)} ripe, the control's ${ripe(30)}`);
  }
  t.check(least === 48, `the residents harvested nothing (${48 - least} of 48 taken)`);
  t.check(ripe(30) < 24, `the control: an ordinary farmer harvests (${48 - ripe(30)} of 48 taken; without this the check proves nothing)`);
  t.check(dim.getEntities({ type: "minecraft:villager_v2" }).length === 4, "no villager was born");
}
