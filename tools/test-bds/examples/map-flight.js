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
    sys.sendScriptEvent("realm:map_debug", JSON.stringify({ player: p.id, action: "state" }));
    await t.waitUntil(() => last[p.id] !== undefined, { timeout: 20, message: "realm:map_state" });
    return last[p.id].radar ?? "";
  };
  await t.server("/gamerule domobspawning false");
  const a = await t.player("Flier", { op: true, x: 0, z: 0, gameMode: "creative" });
  const b = await t.player("Caver", { op: true, x: 0, z: 100, gameMode: "creative" });
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
}
