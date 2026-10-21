// Town Projects, a build at an automatic spot interrupted by a restart (F37): two towns on the same slope, 400 blocks
// apart. Riverside's well is built straight through; Oakfield's stops after 30 block changes (realm:town_test
// build_pause, as if the server stopped), the server restarts, and the build resumes from bs: 1. Both end the same,
// block for block relative to their spots, and the well's spot loses bs.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-build-resume.js --timeout 4000
export default async function (t) {
  const dim = t.dimension;
  const G = -61;
  const failed = [];
  const fill = (cmd) => t.server(cmd).ok || failed.push(cmd);
  const slope = (ox) => {
    for (let x = -45; x <= 45; x += 3) {
      const h = Math.max(-2, Math.floor((x + 45) / 3) - 15); // flat 2 below the plain on the west side (bedrock is at -64)
      if (h > 0) fill(`/fill ${ox + x} ${G} -32 ${ox + x + 2} ${G + h} 31 dirt`); // from G: grass left under the hill would turn to dirt meanwhile
      else if (h < 0) fill(`/fill ${ox + x} ${G + h + 1} -32 ${ox + x + 2} ${G} 31 air`);
      if (h !== 0) fill(`/fill ${ox + x} ${G + h} -32 ${ox + x + 2} ${G + h} 31 grass_block`); // h 0: the plain's own grass (a /fill that changes nothing fails)
    }
  };
  t.server("/gamerule domobspawning false"); // a flat world spawns slimes by day; one killed a survival player mid-run (O80)
  const p = await t.player("Ann", { op: true, x: 0, z: 0, gameMode: "creative" });
  // Paths and lanterns (townLife) come a few seconds after a build: kept out so both wells are compared alone.
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "nolife", pack: "town_bp", key: "townLife", value: false }));
  const town = (action, extra = {}) => t.system.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump", { town: id });
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const shape = (s) => {
    const out = [];
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let dy = -8; dy <= 10; dy++) out.push(s.y + dy < -64 ? "below" : dim.getBlock({ x: s.x + dx, y: s.y + dy, z: s.z + dz })?.typeId);
    return out;
  };
  const built = async (id) => (await dump(id)).progress.find(([x]) => x === "well")[1].built === 1;
  if (t.phase === 1) {
    await t.loadArea(0, 0, { radius: 4, whole: true });
    await t.loadArea(400, 0, { radius: 4, whole: true });
    await t.wait(40); // the areas' edges load after their centers
    slope(0);
    slope(400);
    t.assert(!failed.length, `the slopes are built (${failed.length} fills failed: ${failed[0]})`);
    await t.wait(20);
    for (const [name, x] of [["Riverside", 0], ["Oakfield", 400]]) {
      p.teleport({ x: x + 0.5, y: G + 2, z: 0.5 });
      await t.wait(10);
      const since = t.tick;
      town("add", { name });
      await t.waitMessage(p, new RegExp(`Town ${name} added`), { since, timeout: 60 });
      const id = name.toLowerCase();
      await t.waitUntil(async () => (await dump(id)).town.spots.well, { timeout: 6000, interval: 100, message: `${name}: the well's spot` });
    }
    const a = (await dump("riverside")).town.spots.well;
    const b = (await dump("oakfield")).town.spots.well;
    t.assert(a.x + 400 === b.x && a.z === b.z && a.y === b.y && a.lv === b.lv, `the same spot on the same slope (${JSON.stringify(a)} / ${JSON.stringify(b)})`);
    // Riverside straight through.
    p.teleport({ x: 0.5, y: G + 2, z: 0.5 });
    town("finish", { project: "well", town: "riverside" });
    await t.waitUntil(() => built("riverside"), { timeout: 1200, interval: 40, message: "Riverside's well" });
    // Saved across the restart as a palette and one character per block (the list itself is over the 32 KB a property holds).
    const ids = shape(a);
    const palette = [...new Set(ids.map(String))];
    t.world.setDynamicProperty("harness:shape", JSON.stringify({ p: palette, s: ids.map((v) => String.fromCharCode(48 + palette.indexOf(String(v)))).join("") }));
    // Oakfield stops half way.
    p.teleport({ x: 400.5, y: G + 2, z: 0.5 });
    town("build_pause", { after: 30, town: "oakfield" });
    town("finish", { project: "well", town: "oakfield" });
    await t.waitUntil(async () => (await dump("oakfield")).town.spots.well.bs === 1 && !(await dump("oakfield")).building, { timeout: 1200, interval: 40, message: "Oakfield paused with bs" });
    t.check(!(await built("oakfield")), "not built yet");
    t.restart("restarting mid-build");
  }
  await t.loadArea(400, 0, { radius: 4, whole: true });
  p.teleport({ x: 400.5, y: G + 2, z: 0.5 });
  await t.waitUntil(() => built("oakfield"), { timeout: 1200, interval: 40, message: "Oakfield's well resumed and finished" });
  const s = (await dump("oakfield")).town.spots.well;
  t.check(!s.bs && s.snap === 1, "bs cleared, the snapshot kept");
  const saved = JSON.parse(String(t.world.getDynamicProperty("harness:shape")));
  const want = [...saved.s].map((c) => saved.p[c.charCodeAt(0) - 48]);
  const got = shape(s).map(String);
  const differ = want.reduce((n, v, i) => n + (v !== got[i] ? 1 : 0), 0);
  t.check(differ === 0, `the resumed build equals the uninterrupted one (${differ} blocks differ)`);
}
