// Minimap (map_bp): the nearest town (a house), your respawn point (a bed) and an unfound rainbow's pot of gold (a
// rainbow, with arrows at the strip's edges when it's out of view), from the real Town Projects and Rainbows packs.
// A town far away shows at its bearing; standing in it hides it; the nearer of two towns wins; a bed set by
// setSpawnPoint shows behind you only when you turn round; `/realm:rainbow_now` puts the rainbow on the strip (an
// edge arrow when it's behind) and on the radar's edge; the player's switches hide the town and the bed.
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp,town_bp,rainbow_bp --scenario tools/test-bds/examples/map-places.js --timeout 600
const g = (n) => String.fromCodePoint(0xf300 + n);
const S = { TOWN: g(0x60), HOME: g(0x61), RAINBOW: g(0x62) };
const L = { RAINBOW: g(0x70) };
const R = { RAINBOW: g(0x71) };
const Q = { TOWN: g(0x80), HOME: g(0x81), RAINBOW: g(0x82) };

export default async function (t) {
  const sys = t.system;
  const Y = -60;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:map_state", "realm:town_list", "realm:rainbow_pot"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const send = (id, m) => sys.sendScriptEvent(id, JSON.stringify(m));
  const cfg = (key, value, player) => send("realm:cfg_set", { id: `t_${key}_${t.tick}`, pack: "map_bp", key, value, ...(player ? { player: player.id } : {}) });
  const state = async (p) => {
    const since = t.tick;
    send("realm:map_debug", { player: p.id, action: "state" });
    await t.waitUntil(() => of("realm:map_state", (m) => m.player === p.id, since).length > 0, { timeout: 20, message: "realm:map_state" });
    return of("realm:map_state", (m) => m.player === p.id, since).at(-1);
  };
  const until = async (p, fn, message, timeout = 100) => {
    const end = t.tick + timeout;
    let last;
    while (t.tick <= end) {
      last = await state(p);
      try {
        if (fn(last)) return last;
      } catch {}
      await t.wait(10);
    }
    t.log(`state at failure: ${JSON.stringify({ strip: [...(last?.strip ?? "")].map((c) => (c.codePointAt(0) - 0xf300).toString(16)).join(" "), known: last?.known })}`);
    t.fail(message);
  };
  const cells = (s) => [...(s.strip ?? "")];
  const hasIn = (s, ch) => (s.radar ?? "").includes(ch);
  // yaw 180 faces north (-z), 0 south, -90 east
  const stand = (p, x, z, yaw = 180) => p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: yaw } });

  await t.server("/gamerule domobspawning false");
  await t.server("/time set noon");
  const p = await t.player("Mapper", { op: true, x: 0, z: 0, gameMode: "creative" });
  stand(p, 0, 0);
  await t.wait(40);
  cfg("radar", true, p);

  // --- Towns: Riverside 150 north, Hilltop 300 north-east. Facing north: Riverside in the middle.
  stand(p, 0, -150);
  await t.wait(10);
  t.assert(t.cmd(p, '/realm:town_add Riverside').ok, "town_add Riverside");
  stand(p, 300, -300);
  await t.wait(10);
  t.assert(t.cmd(p, '/realm:town_add Hilltop').ok, "town_add Hilltop");
  await t.waitUntil(() => of("realm:town_list", (m) => (m.towns ?? []).length >= 2).length > 0, { timeout: 60, message: "town_bp sends both towns" });
  stand(p, 0, 0);
  let st = await until(p, (s) => cells(s)[12] === S.TOWN, "Riverside (nearest) in the strip's middle, facing north");
  t.check(cells(st).filter((c) => c === S.TOWN).length === 1, "one house: only the nearest town");
  t.check(st.known.towns === 2, `both towns known (${st.known.towns})`);
  // Facing east, Riverside is 90 degrees to the left: off the strip, and no arrow for it.
  stand(p, 0, 0, -90);
  st = await until(p, (s) => !cells(s).includes(S.TOWN), "no house when the nearest town is out of view");
  // In Riverside: the next town doesn't take its place, the house just goes.
  stand(p, 2, -148);
  st = await until(p, (s) => !cells(s).includes(S.TOWN) && !hasIn(s, Q.TOWN), "no house while standing in the nearest town");
  stand(p, 0, 0);
  await until(p, (s) => cells(s)[12] === S.TOWN, "back: the house again");
  cfg("showTown", false, p);
  await until(p, (s) => !cells(s).includes(S.TOWN), "the player's switch hides the town");
  cfg("showTown", true, p);

  // --- Respawn point 10 blocks south: behind when facing north, in the middle facing south; on the radar too.
  p.setSpawnPoint({ dimension: t.dimension, x: 0, y: Y, z: 10 });
  stand(p, 0, 0);
  st = await until(p, (s) => !cells(s).includes(S.HOME) && hasIn(s, Q.HOME), "the bed is behind (not on the strip) but on the radar");
  stand(p, 0, 0, 0);
  st = await until(p, (s) => cells(s)[12] === S.HOME, "facing south: the bed in the middle");
  stand(p, 0, 9, 0);
  await until(p, (s) => !cells(s).includes(S.HOME), "at the bed: no bed icon");
  stand(p, 0, 0, 0);
  cfg("showHome", false, p);
  await until(p, (s) => !cells(s).includes(S.HOME) && !hasIn(s, Q.HOME), "the player's switch hides the bed");
  cfg("showHome", true, p);

  // --- The rainbow: /realm:rainbow_now puts its pot 150-300 blocks away; the strip shows where.
  const since = t.tick;
  t.assert(t.cmd(p, "/realm:rainbow_now").ok, "rainbow_now");
  await t.waitUntil(() => of("realm:rainbow_pot", (m) => typeof m.x === "number", since).length > 0, { timeout: 60, message: "rainbow_bp sends realm:rainbow_pot" });
  const pot = of("realm:rainbow_pot", (m) => typeof m.x === "number", since).at(-1);
  const dx = pot.x + 0.5 - 0.5, dz = pot.z + 0.5 - 0.5;
  t.log(`pot at ${pot.x} ${pot.z}, ${Math.round(Math.hypot(dx, dz))} blocks`);
  // Face it: rainbow in the middle. yaw: 0 = south (+z); the yaw that faces (dx, dz) is atan2(-dx, dz).
  const yaw = (Math.atan2(-dx, dz) * 180) / Math.PI;
  stand(p, 0, 0, yaw);
  st = await until(p, (s) => cells(s)[12] === S.RAINBOW, "facing the pot: the rainbow in the middle");
  t.check(st.known.pot && st.known.pot.x === pot.x, "the map knows the pot");
  t.check(hasIn(st, Q.RAINBOW), "and on the radar's edge (it's beyond the radar)");
  // Turned away to the right (+100 degrees): the pot is on the left, past the strip: a left arrow.
  stand(p, 0, 0, yaw + 100);
  await until(p, (s) => cells(s)[0] === L.RAINBOW, "turned right: a rainbow arrow at the left edge");
  stand(p, 0, 0, yaw - 100);
  await until(p, (s) => cells(s)[24] === R.RAINBOW, "turned left: a rainbow arrow at the right edge");
  // Found: walk to it (the pot is cleared and so is the icon).
  await t.loadArea(pot.x, pot.z);
  stand(p, pot.x, pot.z, yaw);
  await t.waitUntil(() => of("realm:rainbow_pot", (m) => typeof m.x !== "number", since).length > 0, { timeout: 400, message: "rainbow_bp clears realm:rainbow_pot when the pot is found" });
  st = await until(p, (s) => !cells(s).includes(S.RAINBOW) && !cells(s).includes(L.RAINBOW) && !cells(s).includes(R.RAINBOW), "found: no more rainbow on the strip");
  t.check(!st.known.pot, "the map forgot the pot");
}
