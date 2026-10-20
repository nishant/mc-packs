// Town Projects, a build at an automatic spot interrupted by a restart (F37): two towns on the same slope, 400 blocks
// apart. Riverside's well is built straight through; Oakfield's stops after 30 block changes (realm:town_test
// build_pause, as if the server stopped), the server restarts, and the build resumes from bs: 1. Both end the same,
// block for block relative to their spots, and the well's spot loses bs.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-build-resume.js --timeout 4000
export default async function (t) {
  const dim = t.dimension;
  const G = -61;
  const slope = (ox) => {
    for (let x = -50; x <= 50; x += 3) {
      const h = Math.floor((x + 50) / 3) - 16;
      if (h > 0) t.server(`/fill ${ox + x} ${G + 1} -50 ${ox + x + 2} ${G + h} 50 dirt`);
      else if (h < 0) t.server(`/fill ${ox + x} ${G + h + 1} -50 ${ox + x + 2} ${G} 50 air`);
      t.server(`/fill ${ox + x} ${G + h} -50 ${ox + x + 2} ${G + h} 50 grass_block`);
    }
  };
  const p = await t.player("Ann", { op: true, x: 0, z: 0, gameMode: "creative" });
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    const since = t.tick;
    town("dump", { town: id });
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const shape = (s) => {
    const out = [];
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let dy = -8; dy <= 10; dy++) out.push(dim.getBlock({ x: s.x + dx, y: s.y + dy, z: s.z + dz })?.typeId);
    return out;
  };
  const built = async (id) => (await dump(id)).progress.find(([x]) => x === "well")[1].built === 1;
  if (t.phase === 1) {
    await t.loadArea(0, 0, { radius: 4 });
    await t.loadArea(400, 0, { radius: 4 });
    slope(0);
    slope(400);
    await t.wait(20);
    for (const [name, x] of [["Riverside", 0], ["Oakfield", 400]]) {
      p.teleport({ x: x + 0.5, y: G + 2, z: 0.5 });
      await t.wait(10);
      const since = t.tick;
      town("add", { name });
      await t.waitMessage(p, new RegExp(`Town ${name} added`), { since, timeout: 60 });
      const id = name.toLowerCase();
      await t.waitUntil(async () => (await dump(id)).town.spots.well, { timeout: 2400, interval: 100, message: `${name}: the well's spot` });
    }
    const a = (await dump("riverside")).town.spots.well;
    const b = (await dump("oakfield")).town.spots.well;
    t.assert(a.x + 400 === b.x && a.z === b.z && a.y === b.y && a.lv === b.lv, `the same spot on the same slope (${JSON.stringify(a)} / ${JSON.stringify(b)})`);
    // Riverside straight through.
    p.teleport({ x: 0.5, y: G + 2, z: 0.5 });
    town("finish", { project: "well", town: "riverside" });
    await t.waitUntil(() => built("riverside"), { timeout: 1200, interval: 40, message: "Riverside's well" });
    t.world.setDynamicProperty("harness:shape", JSON.stringify(shape(a)));
    // Oakfield stops half way.
    p.teleport({ x: 400.5, y: G + 2, z: 0.5 });
    town("build_pause", { after: 30, town: "oakfield" });
    town("finish", { project: "well", town: "oakfield" });
    await t.waitUntil(async () => (await dump("oakfield")).town.spots.well.bs === 1 && !(await dump("oakfield")).building, { timeout: 1200, interval: 40, message: "Oakfield paused with bs" });
    t.check(!(await built("oakfield")), "not built yet");
    t.restart("restarting mid-build");
  }
  await t.loadArea(400, 0, { radius: 4 });
  p.teleport({ x: 400.5, y: G + 2, z: 0.5 });
  await t.waitUntil(() => built("oakfield"), { timeout: 1200, interval: 40, message: "Oakfield's well resumed and finished" });
  const s = (await dump("oakfield")).town.spots.well;
  t.check(!s.bs && s.snap === 1, "bs cleared, the snapshot kept");
  const want = JSON.parse(String(t.world.getDynamicProperty("harness:shape")));
  const got = shape(s);
  const differ = want.reduce((n, v, i) => n + (v !== got[i] ? 1 : 0), 0);
  t.check(differ === 0, `the resumed build equals the uninterrupted one (${differ} blocks differ)`);
}
