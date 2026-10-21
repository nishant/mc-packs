// Town Projects + Townsfolk performance (F39-F41): two towns at Capital (level 5), every project, all 10 houses and the
// garden pen built, 20 residents (10 a town, the world cap) and each town's mayor placed, with 10 simulated players
// (5 in each town) walking about. The soak measures the steady cost with no scan or build running: Town Projects at
// most 0.15 ms/tick, Townsfolk no more than 0.05 above its baseline (the same soak without towns). The spots are set
// by hand (autoSpots Disabled during setup), so nothing is scanned or leveled before the soak starts.
// Meant for run.mjs --profile, without --no-relay: the setup reads the towns' dumps from chat (the soak window sends
// next to none). The soak window is reported as perf-workload (as perf-soak.js does).
//   node tools/test-bds/run.mjs --quiet --flat --profile --profile-json /tmp/town-capital.json --only town_bp,npc_bp --scenario tools/test-bds/examples/town-capital-perf.js --arg players=10 --arg seconds=120 --timeout 9000
//   the Townsfolk baseline: the same with --arg baseline=1 (no towns), --only town_bp,npc_bp as above
//   the transients, measured on their own: --arg transient=scan (a third town is added at the soak's start, so its
//   scan runs in the window; autoSpots Enabled) or --arg transient=build (its well and notice board are finished at the
//   soak's start, so the outline, the check, the leveling, the builds and their paths run in the window)
// Arguments: players (default 10), seconds (default 120), baseline (0), transient (none | scan | build).
export default async function (t) {
  const N = Math.max(2, Number(t.args.players ?? 10));
  const SECONDS = Math.max(10, Number(t.args.seconds ?? 120));
  const BASELINE = String(t.args.baseline ?? "0") === "1";
  const TRANSIENT = String(t.args.transient ?? "none");
  const sys = t.system;
  const dim = t.dimension;
  const cfg = (key, value) => sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `perf_${key}`, pack: "town_bp", key, value }));
  t.server("/gamerule domobspawning false");
  const op = await t.player("Ann", { op: true, x: 0, z: 0 });
  const town = (action, extra = {}) => sys.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", ...extra }));
  const dump = async (id) => {
    await t.wait(1); // a dump just before answered in this tick: never take its message for this one
    const since = t.tick;
    town("dump", { town: id });
    const m = await t.waitMessage(op, (x) => x.startsWith('{"town"'), { since, timeout: 60 });
    return JSON.parse(m.plain);
  };
  const CENTERS = [
    { id: "ash", name: "Ash", x: 0, z: 0 },
    { id: "birch", name: "Birch", x: 300, z: 0 },
  ];
  const PROJECTS = ["well", "notice_board", "lamps", "garden", "stall", "dock", "bell_tower"];
  const WORKS = [...Array.from({ length: 10 }, (_, i) => `house_${i + 1}`), "pen"];

  if (!BASELINE) {
    cfg("autoSpots", false);
    cfg("residents", true);
    cfg("residentCapWorld", 20);
    await t.wait(5);
    for (const c of CENTERS) {
      const { top } = await t.loadArea(c.x, c.z, { radius: 4 });
      op.teleport({ x: c.x + 0.5, y: top.y + 1, z: c.z + 0.5 });
      await t.wait(20);
      const since = t.tick;
      town("add", { name: c.name });
      await t.waitMessage(op, new RegExp(`Town ${c.name} added`), { since, timeout: 60 });
      // 18 builds on a grid of 6 by 3, 16 apart, all facing south, away from the center where the mayor stands.
      const spotOf = (i) => ({ x: c.x - 40 + (i % 6) * 16, y: top.y + 1, z: c.z - 36 + Math.floor(i / 6) * 24, f: 0 });
      PROJECTS.forEach((id, i) => town("spot", { town: c.id, project: id, spot: spotOf(i) }));
      await t.wait(5);
      for (const id of PROJECTS) {
        town("finish", { town: c.id, project: id });
        await t.wait(4);
      }
      let d;
      await t.waitUntil(async () => (d = await dump(c.id)).town.lvl === 5, { timeout: 400, interval: 20, message: `${c.name} is a Capital` });
      WORKS.forEach((id, i) => town("spot", { town: c.id, project: id, spot: spotOf(PROJECTS.length + i) }));
      await t.waitUntil(async () => {
        d = await dump(c.id);
        return [...PROJECTS, ...WORKS].every((id) => d.progress.find(([x]) => x === id)?.[1]?.built === 1);
      }, { timeout: 600, interval: 20, message: `every build of ${c.name} is up` });
      // Residents: a census moves in 2 families at a time.
      for (let k = 0; k < 8 && d.residents.r.filter((r) => r.d === undefined).length < 10; k++) {
        town("census", { town: c.id });
        await t.wait(40);
        d = await dump(c.id);
      }
      t.log(`${c.name}: level ${d.town.lvl}, ${Object.keys(d.town.spots).length} spots, ${d.residents.r.filter((r) => r.d === undefined).length} residents, mayor ${d.town.m} placed: ${d.placed?.includes(d.town.m)}`);
    }
  }

  // The players: Ann and N - 1 more, half in each town (in the baseline, the same places without towns).
  const players = [{ p: op, home: { x: 0, z: 0 } }];
  for (let i = 1; i < N; i++) {
    const c = CENTERS[i % 2];
    const a = (i / N) * Math.PI * 2;
    const home = { x: c.x + Math.round(Math.cos(a) * 20), z: c.z + Math.round(Math.sin(a) * 20) };
    players.push({ p: await t.player(`Walker${String(i).padStart(2, "0")}`, { x: home.x, z: home.z, settle: 2 }), home });
  }
  op.teleport({ x: 0.5, y: op.location.y, z: 0.5 });
  await t.wait(40);

  let transientTown;
  if (!BASELINE && TRANSIENT !== "none") {
    // A third town, Cedar, with the last player in it: its scan (and with "build", its first builds) run in the window.
    cfg("autoSpots", true);
    // Each simulated player took one of the world's 10 ticking areas (they load no chunks themselves): they all stand
    // inside Ash's and Birch's, so those two are added again and Cedar gets the third.
    t.server("/tickingarea remove_all");
    for (const c of CENTERS) await t.loadArea(c.x, c.z, { radius: 4 });
    const { top } = await t.loadArea(600, 0, { radius: 4 });
    const last = players.at(-1);
    last.home = { x: 600, z: 0 };
    last.p.teleport({ x: 600.5, y: top.y + 1, z: 0.5 });
    op.teleport({ x: 600.5, y: top.y + 1, z: 2.5 });
    await t.wait(20);
    const since = t.tick;
    town("add", { name: "Cedar" });
    await t.waitMessage(op, /Town Cedar added/, { since, timeout: 60 });
    transientTown = "cedar";
    if (TRANSIENT === "build") {
      let d;
      await t.waitUntil(async () => (d = await dump("cedar")).town.spots.well && d.town.spots.notice_board && !d.scanning, { timeout: 6000, interval: 100, message: "Cedar's spots picked" });
    }
    op.teleport({ x: 0.5, y: op.location.y, z: 0.5 });
    await t.wait(10);
  }
  if (!BASELINE && TRANSIENT === "none") {
    // Pen animals despawn while nobody is near (Ann was in the other town): standing by each pen brings them back.
    for (const c of [...CENTERS].reverse()) {
      const pen = (await dump(c.id)).town.spots.pen;
      op.teleport({ x: pen.x + 0.5, y: pen.y, z: pen.z - 4.5 });
      await t.waitUntil(() => dim.getEntities({ tags: [`town:a:${c.id}`] }).length >= 4, { timeout: 1600, interval: 20, message: `${c.name}'s pen animals back` });
    }
    op.teleport({ x: 0.5, y: op.location.y, z: 0.5 });
    await t.wait(10);
    const d = await dump("ash");
    t.check(!d.scanning && !d.building && !d.living, `no scan, build or path running before the soak (${JSON.stringify([d.scanning, d.building, d.living])})`);
    const residents = dim.getEntities({ type: "minecraft:villager_v2", tags: ["realm:resident"] }).length;
    const animals = CENTERS.map((c) => dim.getEntities({ tags: [`town:a:${c.id}`] }).length);
    t.log(`${residents} residents, pen animals ${animals.join(" + ")}, ${dim.getEntities({ type: "minecraft:npc" }).length} NPCs`);
    t.check(residents === 20, `20 residents, the world cap (${residents})`);
    t.check(animals.every((n) => n === 4), `each pen has its 4 animals (${animals})`);
  }

  const declared = { players: N, seconds: SECONDS, baseline: BASELINE, transient: TRANSIENT, towns: BASELINE ? 0 : CENTERS.length };
  t.report("perf-workload", { schema: 1, declared, spawned: players.length });
  t.assert(players.length === N, `all ${N} declared players spawned (${players.length})`);
  const start = t.tick;
  if (TRANSIENT === "build" && transientTown) {
    town("finish", { town: transientTown, project: "well" });
    town("finish", { town: transientTown, project: "notice_board" });
  }
  const rnd = (n) => Math.floor(Math.random() * n);
  const valid = (p) => {
    try {
      return p.isValid;
    } catch {
      return false;
    }
  };
  let samples = 0;
  let minValid = Infinity;
  let moves = 0;
  while (t.tick - start < SECONDS * 20) {
    await t.wait(20);
    let n = 0;
    for (const s of players) {
      if (!valid(s.p)) continue;
      n++;
      if (Math.random() < 0.35) {
        try {
          s.p.moveToLocation({ x: s.home.x + rnd(21) - 10 + 0.5, y: s.p.location.y, z: s.home.z + rnd(21) - 10 + 0.5 });
          moves++;
        } catch {
          // an odd spot: ignore
        }
      }
    }
    samples++;
    minValid = Math.min(minValid, n);
  }
  const soakTicks = t.tick - start;
  const alive = players.filter((x) => valid(x.p)).length;
  t.report("perf-workload", {
    schema: 1, declared, spawned: players.length,
    soak: { startTick: start, endTick: t.tick, ticks: soakTicks, seconds: soakTicks / 20 },
    retention: { samples, minValid: samples ? minValid : 0, endValid: alive },
    walks: moves,
  });
  t.check(samples > 0 && minValid === N && alive === N, `all ${N} players stayed for the whole soak (fewest ${samples ? minValid : 0}, at the end ${alive})`);
  t.check(soakTicks >= SECONDS * 20, `the steady window ran its full ${SECONDS} s (${(soakTicks / 20).toFixed(1)} s)`);
  if (transientTown) {
    const d = await dump(transientTown);
    t.log(`Cedar after the window: spots ${Object.keys(d.town.spots).join(", ")}, scanning ${d.scanning}, building ${JSON.stringify(d.building)}, built ${d.progress.filter(([, x]) => x.built).map(([id]) => id).join(", ")}`);
  }
}
