// Minimap terrain while flying: a player teleported 3 blocks a tick over ground that changes (a sand band built
// ahead of them) sees the sand on the radar within a few ticks of arriving and few unknown cells while moving, and
// a second player standing under a roof (cave terrain) never changes what the first one sees of the same dimension.
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp,hud_rp --scenario tools/test-bds/examples/map-flight.js --timeout 600
const g = (n) => String.fromCodePoint(0xf300 + n);
const SAND = g(0xaa);
const EMPTY = g(0x38);
const CAVE = [g(0xaf), g(0xcc), g(0xcd)];
const SANDS = [SAND, g(0xb7), g(0xb8)];
const count = (s, glyph) => [...(s ?? "")].filter((c) => (glyph === SAND ? SANDS.includes(c) : c === glyph)).length;

export default async function (t) {
  const sys = t.system;
  let last = {};
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:map_state") return;
      try {
        const m = JSON.parse(message);
        last[m.player] = m;
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const radarOf = async (p) => {
    const since = t.tick;
    last[p.id] = undefined;
    const at = p.location;
    const samples = [-24, 24].flatMap((dx) => [-24, 24].map((dz) => ({ x: at.x + dx, z: at.z + dz, resolution: 4 })));
    sys.sendScriptEvent("realm:map_debug", JSON.stringify({ player: p.id, action: "state", samples }));
    await t.waitUntil(() => last[p.id] !== undefined, { timeout: 20, message: "realm:map_state" });
    return last[p.id].radar ?? "";
  };
  await t.server("/gamerule domobspawning false");
  const a = await t.player("Flier", { op: true, x: 0, z: 0, gameMode: "creative" });
  const b = await t.player("Caver", { op: true, x: 0, z: 100, gameMode: "creative" });
  await t.loadArea(0, 100, { radius: 4 }); // Keep the entire stationary radar loaded after the flier leaves.
  await t.wait(60);

  // Roof over Caver, high enough to count as roofed terrain.
  await t.server("/fill -8 -45 92 8 -45 108 stone");
  await t.wait(60);
  const rb = await radarOf(b);
  t.check(CAVE.some((c) => rb.includes(c)), "the roofed player's radar draws cave terrain");

  // Flier flies east over ground that changes: a sand band is built ahead once they are on the way.
  let unknownWorst = 0;
  for (let x = 0; x <= 30; x += 3) {
    a.teleport({ x, y: -60, z: 0 });
    await t.wait(1);
  }
  await t.server("/tickingarea add 60 -61 -20 100 -61 20 sandarea");
  await t.wait(40);
  await t.server("/fill 60 -61 -20 100 -61 20 sand");
  for (let x = 33; x <= 75; x += 3) {
    a.teleport({ x, y: -60, z: 0 });
    await t.wait(1);
    unknownWorst = Math.max(unknownWorst, count(await radarOf(a), EMPTY));
  }
  await t.wait(6);
  const ra = await radarOf(a);
  t.log(`flier radar: ${count(ra, SAND)} sand cells, ${count(ra, EMPTY)} unknown; worst unknown while flying ${unknownWorst} of 441`);
  const hist = {};
  for (const c of ra) hist[(c.codePointAt(0) - 0xf300).toString(16)] = (hist[(c.codePointAt(0) - 0xf300).toString(16)] ?? 0) + 1;
  t.log(`glyph histogram ${JSON.stringify(hist)} pos ${JSON.stringify(a.location)}`);
  t.check(count(ra, SAND) >= 20, "the sand built ahead shows on the flier's radar a few ticks after arriving");
  t.check(unknownWorst <= 150, `few unknown cells while flying fast (${unknownWorst} of 441 at worst)`);
  t.check(!CAVE.some((c) => ra.includes(c)), "the roofed player's cave terrain never reaches the flier's radar");
  const rb2 = await radarOf(b);
  t.check(!rb2.includes(SAND), "the flier's sand is not drawn for the player far away under the roof");

  // Reach the real cache cap through native flight, then stop beneath a roof: detail must not churn forever.
  let area;
  for (let i = 0; i < 2200; i++) {
    const x = 0.1 + (i + 1) * 3.2;
    if (i % 10 === 0) {
      const next = await t.loadArea(x, 300, { radius: 4 });
      if (area) await t.server(`/tickingarea remove ${area}`);
      area = next.name;
    }
    a.teleport({ x, y: 128, z: 300 }, { rotation: { x: 0, y: 270 } });
    await t.wait(1);
  }
  await radarOf(a);
  t.log(`native saturated surface ${JSON.stringify(last[a.id].terrain.surface)}`);
  t.check(last[a.id].terrain.surface.columns === 6000 && last[a.id].terrain.surface.fine >= 100, "native flight saturates6000 while retaining a useful fine working set");
  const x = Math.floor(a.location.x);
  await t.server(`/fill ${x - 8} 63 292 ${x + 8} 63 308 stone`);
  await t.server(`/fill ${x - 8} 80 292 ${x + 8} 80 308 stone`);
  a.teleport({ x: x + 0.1, y: 64, z: 300 }, { rotation: { x: 0, y: 270 } });
  await t.wait(130); // The existing surface sample refreshes within100 ticks after a command-built roof.
  await radarOf(a);
  t.check(last[a.id].terrain.store.endsWith("|layer64"), "saturated native cache keeps roof80/player64 in its cave");
  await radarOf(b);
  t.log(`stationary native misses: flier=${last[a.id].terrain.misses}, caver=${last[b.id].terrain.misses}`);
  t.check(last[a.id].terrain.misses === 0 && last[b.id].terrain.misses === 0, "stationary cost excludes legitimate unloaded-chunk retries");
  // The 2200-tick flight plus setup crosses the other viewer's intentional 2400-tick freshness boundary.
  // Observe that age refresh explicitly before measuring idle eviction churn; keep both viewers scanning.
  // How long the flight takes in ticks depends on t.loadArea (since F73 it waits for the whole area and 20 ticks
  // more, 220 times here), so a flight that ran past the boundary has seen one refresh already: wait for the
  // next cohort to come of age (at most one more 2400-tick period) instead of assuming where the flight ended.
  const aged = () => last[b.id].terrain.samples.filter((s) => s.data && sys.currentTick - s.data.tick >= 2300);
  for (let i = 0; i < 520 && !aged().length; i++) {
    await t.wait(5);
    await radarOf(b);
  }
  const expiring = aged();
  t.log(`Caver coarse sample ages before idle: ${last[b.id].terrain.samples.map((s) => s.data ? sys.currentTick - s.data.tick : "missing").join(",")}`);
  t.check(expiring.length > 0, "long flight reaches the stationary caver's existing age-refresh cohort");
  const refreshed = () => expiring.every((old) => last[b.id].terrain.samples.some((s) => s.x === old.x && s.z === old.z && s.data?.tick > old.data.tick));
  for (let i = 0; i < 48 && !refreshed(); i++) {
    await t.wait(5);
    await radarOf(b);
  }
  t.check(refreshed(), "old coarse samples actually refresh before the steady idle window");
  await t.wait(12);
  await radarOf(b);
  t.log(`Caver coarse sample ages after refresh: ${last[b.id].terrain.samples.map((s) => s.data ? sys.currentTick - s.data.tick : "missing").join(",")}`);
  sys.sendScriptEvent("realm:map_debug", JSON.stringify({ player: a.id, action: "cost" }));
  await t.wait(2);
  await t.wait(50);
  await radarOf(a);
  const cost = last[a.id].cost;
  t.log(`saturated stop: ${cost.scanReads} real reads/${cost.scanTicks} ticks, scanner ${cost.scanMs}ms (${(cost.scanMs / Math.max(1, cost.scanTicks)).toFixed(3)}ms/tick), redraw ${cost.turnMs}ms/${cost.turnTicks}ticks, periodic ${cost.ms}ms; peaks ${cost.scanPeak}/${cost.scanEachPeak}`);
  t.check(cost.scanReads <= 4, "saturated stationary native viewers do not keep rereading their fine detail");
  t.check(cost.scanPeak <= 96 && cost.scanEachPeak <= 48, "saturated native flight and cave retain unchanged96/48 operation limits");
}
