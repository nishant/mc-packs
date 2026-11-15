// Town Projects, a scan that can only wait (ENT-05): the only player stands at the town's edge, 90 blocks from its
// center, so the ground near the center is never loaded and the well's scan can only wait. Before, a new scan started
// from nothing at every 5-second check (12 a minute, each reading every loaded column again); now the next one is held
// until a player in the town has moved 32 blocks (or a minute per scan that waited has gone by). A walk of 40 blocks
// along the edge lets it go at once; the well still never ends under "no good spot" in this time.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-scan-hold.js --timeout 3000
export default async function (t) {
  t.server("/gamerule domobspawning false"); // a flat world spawns slimes by day (O80)
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "far", ...extra }));
  const dump = async () => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const cfg = (value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `a${t.tick}`, pack: "town_bp", key: "autoSpots", value }));
  cfg(false);
  await t.wait(3);
  const since = t.tick;
  town("add", { name: "Far" });
  await t.waitMessage(p, /Town Far added/, { since, timeout: 60 });
  p.teleport({ x: 90.5, y: -60, z: 0.5 });
  await t.loadArea(90, 0, { radius: 2 });
  await t.console("tickingarea remove_all");
  await t.loadArea(90, 0, { radius: 2 });
  await t.wait(200);
  cfg(true);
  await t.wait(3);
  town("scan");
  await t.wait(100);
  let d = await dump();
  const first = d.scans;
  t.assert(typeof first === "number", `the dump counts scans (${first})`);
  // A minute at the edge: twelve 5-second checks.
  await t.wait(1200);
  d = await dump();
  const during = d.scans - first;
  t.log(`at the edge for 60 s: ${during} more scans, held ${d.held}, waits ${d.waits}, scan list ${JSON.stringify(d.town.scan)}`);
  t.check(during <= 1, `no scan from nothing every 5 s (${during} in a minute; before, about 12)`);
  t.check(d.town.scan?.includes("well") && !d.town.nos?.includes("well"), "the well still waits, never no good spot");
  // 40 blocks along the edge: new ground may be loaded, so the next check scans again.
  const before = d.scans;
  p.teleport({ x: 80.5, y: -60, z: 40.5 });
  await t.loadArea(80, 40, { radius: 2 });
  await t.waitUntil(async () => (d = await dump()).scans > before, { timeout: 400, interval: 20, message: "a scan once Ann moved 40 blocks" });
  t.log(`moved: scan ${d.scans} after ${before}`);
}
