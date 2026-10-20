// Town Projects, Remove spot at a leveled automatic spot (F37): the saved region (footprint, apron and depth) puts
// every block back, the cut and the filled ground included.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-terrain-restore.js --timeout 3000
export default async function (t) {
  const dim = t.dimension;
  const G = -61;
  const p = await t.player("Ann", { op: true, x: 0, z: 0, gameMode: "creative" });
  await t.loadArea(0, 0, { radius: 4 });
  // A gentle slope: one block every 3 blocks to the east, so every spot needs some leveling.
  for (let x = -60; x <= 60; x += 3) {
    const h = Math.floor((x + 60) / 3) - 20;
    if (h > 0) t.server(`/fill ${x} ${G + 1} -60 ${x + 2} ${G + h} 60 dirt`);
    else if (h < 0) t.server(`/fill ${x} ${G + h + 1} -60 ${x + 2} ${G} 60 air`);
    t.server(`/fill ${x} ${G + h} -60 ${x + 2} ${G + h} 60 grass_block`);
  }
  await t.wait(20);
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "slope", ...extra }));
  const dump = async () => {
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  p.teleport({ x: 0.5, y: G + 2, z: 0.5 });
  let since = t.tick;
  town("add", { name: "Slope" });
  await t.waitMessage(p, /Town Slope added/, { since, timeout: 60 });
  let d;
  await t.waitUntil(async () => (d = await dump()).town.spots.well, { timeout: 2400, interval: 100, message: "the well's spot" });
  const s = d.town.spots.well;
  t.log("well:", JSON.stringify(s));
  t.check(typeof s.lv === "string" && /[0-6]/.test(s.lv), "a leveled spot");
  const [x1, z1, x2, z2] = d.regions.well;
  const y1 = s.y - 12;
  const y2 = s.y + 12;
  const snap = () => {
    const out = [];
    for (let x = x1 - 1; x <= x2 + 1; x++) for (let z = z1 - 1; z <= z2 + 1; z++) for (let y = y1; y <= y2; y++) out.push(dim.getBlock({ x, y, z })?.typeId);
    return out;
  };
  const before = snap();
  town("finish", { project: "well" });
  await t.waitUntil(async () => (await dump()).progress.find(([id]) => id === "well")[1].built === 1, { timeout: 1200, interval: 40, message: "built" });
  const after = snap();
  const differ = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);
  t.check(differ(before, after) > 20, `the build and the leveling changed blocks (${differ(before, after)})`);
  since = t.tick;
  town("remove", { project: "well" });
  await t.waitMessage(p, /taken away/, { since, timeout: 60 });
  const back = snap();
  const left = differ(before, back);
  if (left) {
    const where = [];
    let i = 0;
    for (let x = x1 - 1; x <= x2 + 1; x++) for (let z = z1 - 1; z <= z2 + 1; z++) for (let y = y1; y <= y2; y++, i++) if (before[i] !== back[i] && where.length < 8) where.push(`${x},${y},${z}: ${before[i]} -> ${back[i]}`);
    t.log("not restored:", where.join(" | "));
  }
  t.check(left === 0, `every block of the region is back (${left} differ)`);
  const after2 = await dump();
  t.check(!after2.town.spots.well && after2.progress.find(([id]) => id === "well")[1].done === 1, "no spot, still finished");
}
