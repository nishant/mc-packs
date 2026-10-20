// Town Projects, placed natural blocks (F37): a dirt block a player places (playerPlaceBlock) and a box another pack
// reports (realm:blocks_placed) are kept as cells, and automatic spots never cover them, even after the dirt is
// broken again.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-placed-marks.js --timeout 3000
export default async function (t) {
  const G = -61;
  const p = await t.player("Ann", { op: true, x: 0, z: 0, gameMode: "creative" });
  await t.loadArea(0, 0, { radius: 4 });
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "marks", ...extra }));
  const dump = async () => {
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  let since = t.tick;
  town("add", { name: "Marks" });
  await t.waitMessage(p, /Town Marks added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "the well's spot" });
  const r0 = d.regions.well;
  const mid = { x: Math.floor((r0[0] + r0[2]) / 2), z: Math.floor((r0[1] + r0[3]) / 2) };
  t.log("first well region:", JSON.stringify(r0));
  // Ann places a dirt block in the middle of it.
  p.teleport({ x: mid.x + 2.5, y: G + 1, z: mid.z + 0.5 });
  await t.wait(5);
  p.getComponent("inventory").container.setItem(0, new t.mc.ItemStack("minecraft:dirt", 1));
  p.selectedSlotIndex = 0;
  const ground = t.dimension.getBlock({ x: mid.x, y: G, z: mid.z });
  p.useItemInSlotOnBlock(0, ground.location, t.mc.Direction.Up);
  await t.wait(10);
  t.check(t.dimension.getBlock({ x: mid.x, y: G + 1, z: mid.z })?.typeId === "minecraft:dirt", "the dirt is placed");
  t.check((await dump()).cells >= 1, "its cell is kept");
  // Forget the spot, break the dirt again, look again: the cell is still avoided.
  town("remove", { project: "well" });
  await t.wait(5);
  t.server(`/setblock ${mid.x} ${G + 1} ${mid.z} air`);
  town("scan");
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "a new spot" });
  const r1 = d.regions.well;
  const inside = ([x1, z1, x2, z2], x, z) => x >= x1 && x <= x2 && z >= z1 && z <= z2;
  t.check(!inside(r1, mid.x, mid.z), `the new region keeps off the placed block's cell (${JSON.stringify(r1)})`);
  // Another pack reports a box where the well is now: it moves again.
  t.system.sendScriptEvent("realm:blocks_placed", JSON.stringify({ dim: "overworld", box: [r1[0], G - 2, r1[1], r1[2], G + 4, r1[3]] }));
  await t.wait(5);
  town("remove", { project: "well" });
  await t.wait(5);
  town("scan");
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "a third spot" });
  const r2 = d.regions.well;
  const overlap = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  t.check(!overlap(r2, [r1[0] + 4, r1[1] + 4, r1[2] - 4, r1[3] - 4]), `the reported box is avoided (${JSON.stringify(r2)})`);
  await t.wait(220);
  t.check((await dump()).cells >= 8, "the box's cells are saved too");
}
