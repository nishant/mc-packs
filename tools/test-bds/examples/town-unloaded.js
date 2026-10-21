// Town Projects, a scan over ground that isn't loaded (F37): the only player stands at the town's edge, 90 blocks from
// its center (beyond simulation distance), so the columns near the center read as unknown: the scan waits (the well
// stays in t.scan, no "no good spot"). When the player walks to the center, the next scan picks the spot.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-unloaded.js --timeout 3000
export default async function (t) {
  t.server("/gamerule domobspawning false"); // a flat world spawns slimes by day; one killed a survival player mid-run (O80)
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "far", ...extra }));
  const dump = async () => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const cfg = (value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `a${t.tick}`, pack: "town_bp", key: "autoSpots", value }));
  cfg(false); // nothing is scanned before Ann is at the edge
  await t.wait(3);
  let since = t.tick;
  town("add", { name: "Far" });
  await t.waitMessage(p, /Town Far added/, { since, timeout: 60 });
  // Off to the edge before the first scan reads anything (the build check runs every 5 s).
  p.teleport({ x: 90.5, y: -60, z: 0.5 });
  await t.loadArea(90, 0, { radius: 2 });
  // Unload the center: drop the harness's ticking area there if any, and wait for the chunks to go.
  await t.console("tickingarea remove_all");
  await t.loadArea(90, 0, { radius: 2 });
  await t.wait(200);
  cfg(true);
  await t.wait(3);
  since = t.tick;
  town("scan");
  await t.wait(600);
  let d = await dump();
  t.log("at the edge:", JSON.stringify({ scan: d.town.scan, nos: d.town.nos, well: d.town.spots.well }));
  t.check(!d.town.spots.well || d.town.spots.well.x > 40, "no spot picked near the center while it isn't loaded");
  t.check(!d.town.nos?.includes("well"), "unknown ground never means no good spot");
  // To the center: the scan finishes.
  p.teleport({ x: 0.5, y: -60, z: 0.5 });
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 6000, interval: 100, message: "the well's spot once the center is loaded" });
  const s = d.town.spots.well;
  t.check(Math.hypot(s.x, s.z) <= 16, `near the center (${s.x}, ${s.z})`);
}
