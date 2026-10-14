// Story Questlines puts what it spawns near water on the water's surface, not on the lake bed under it: with a height
// to start from, groundAt used to settle on a bed up to 6 blocks under water (water counted as open air), so a
// defense wave around a place by a lake came up from the bottom. Reyes's "The Long Watch" (wardens_oath) at a
// Ruined Watchtower set on a stone pillar in the middle of a pool 6 blocks deep that reaches past the wave ring.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-ground-water.js --timeout 420
export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const offers = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        if (id === "realm:npc_offer") offers.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.id, ...msg }));
  const X = 700, Z = 700;
  // Flat world: grass at y -61. A stone basin (floor top -59), water -58..-53 (6 deep), the surface's air at -52,
  // and a 3 x 3 stone pillar in the middle up to -53 that the player stands on (feet at -52).
  const R = 27;
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  t.server(`/tickingarea add circle ${X} 0 ${Z} 3 pool true`);
  await t.wait(40);
  t.server(`/fill ${X - R} -60 ${Z - R} ${X + R} -53 ${Z + R} stone`);
  t.server(`/fill ${X - R + 1} -58 ${Z - R + 1} ${X + R - 1} -53 ${Z + R - 1} water`);
  t.server(`/fill ${X - 1} -58 ${Z - 1} ${X + 1} -53 ${Z + 1} stone`);
  await t.wait(10);
  const water = t.dimension.getBlock({ x: X + 10, y: -55, z: Z });
  t.assert(water?.typeId === "minecraft:water", `the pool is water (${water?.typeId})`);
  const p = await t.player("Tester", { op: true, x: X, y: -52, z: Z, gameMode: "survival" });
  p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  p.addEffect("water_breathing", 20000, { amplifier: 0, showParticles: false });
  await t.wait(20);
  t.log(`player at y ${p.location.y.toFixed(1)}`);
  t.cmd(p, "/realm:saga_place watchtower");
  await t.wait(20);
  debug(p, { action: "jump", story: "wardens_oath", chapter: "long_watch" });
  await t.wait(5);
  const req = "g1";
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "reyes", req }));
  await t.wait(4);
  t.assert(offers.find((o) => o.m.req === req && o.m.key === "start:wardens_oath"), `Reyes offers The Long Watch (${JSON.stringify(offers.map((o) => o.m.key))})`);
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer("Accept");
    }
  })();
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:wardens_oath" }));
  await accept;
  await t.waitMessage(p, /Hold the Ruined Watchtower/, { since: t.tick - 40, timeout: 200 });

  // Where each wave mob is the first tick it's seen (before it can swim up or sink).
  /** @type {Map<string, { x: number, y: number, z: number, type: string }>} */
  const first = new Map();
  const watch = sys.runInterval(() => {
    for (const e of t.dimension.getEntities({ tags: ["saga:add"] })) {
      if (!first.has(e.id)) first.set(e.id, { x: e.location.x, y: e.location.y, z: e.location.z, type: e.typeId });
    }
  }, 1);
  await t.waitUntil(() => first.size > 0, { timeout: 300, message: "wave 1 comes" });
  await t.wait(10);
  sys.clearRun(watch);
  const spots = [...first.values()];
  t.log(`wave 1: ${spots.map((s) => `${s.type.replace("minecraft:", "")} at y ${s.y.toFixed(1)} (${Math.round(Math.hypot(s.x - X, s.z - Z))} from the middle)`).join(", ")}`);
  const overWater = spots.filter((s) => Math.max(Math.abs(s.x - X), Math.abs(s.z - Z)) > 2);
  t.check(overWater.length > 0, "the wave spawns over the pool");
  const sunk = overWater.filter((s) => s.y < -53);
  t.check(!sunk.length, `no land mob spawns under the water (${sunk.length} of ${overWater.length} at the bottom)`);
  t.check(overWater.every((s) => s.y >= -53 && s.y <= -51), "they come at the water's surface");
}
