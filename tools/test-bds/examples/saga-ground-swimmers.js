// Story Questlines: sea creatures a story spawns near water come in the water, on the bed, while land mobs in the same
// group come at the water's surface (groundAt's `bed`, chosen by objectives.js SWIMMERS in spawnGroup). Checked with
// the Herald's riddles at the Old Chapel (act3_deep "herald"): a wrong answer to the first raises 3 drowned, to the
// second 2 drowned and 2 zombies, to the third 3 drowned and 2 vindicators, around the player on a stone pillar in the middle of a pool 6 blocks deep.
//   node tools/test-bds/run.mjs --quiet --flat --only saga_bp --scenario tools/test-bds/examples/saga-ground-swimmers.js --timeout 420
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
  const X = 900, Z = 900;
  // Flat world: a stone basin (floor top -59), water -58..-53 (6 deep), the surface's air at -52, and a 3 x 3 stone
  // pillar in the middle up to -53 that the player stands on (feet at -52).
  const R = 20;
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  t.server(`/tickingarea add circle ${X} 0 ${Z} 3 pool true`);
  await t.wait(40);
  t.server(`/fill ${X - R} -60 ${Z - R} ${X + R} -53 ${Z + R} stone`);
  t.server(`/fill ${X - R + 1} -58 ${Z - R + 1} ${X + R - 1} -53 ${Z + R - 1} water`);
  t.server(`/fill ${X - 1} -58 ${Z - 1} ${X + 1} -53 ${Z + 1} stone`);
  await t.wait(10);
  const water = t.dimension.getBlock({ x: X + 6, y: -55, z: Z });
  t.assert(water?.typeId === "minecraft:water", `the pool is water (${water?.typeId})`);
  const p = await t.player("Tester", { op: true, x: X, y: -52, z: Z, gameMode: "survival" });
  p.addEffect("resistance", 20000, { amplifier: 4, showParticles: false });
  p.addEffect("water_breathing", 20000, { amplifier: 0, showParticles: false });
  await t.wait(20);
  t.log(`player at y ${p.location.y.toFixed(1)}`);

  // Act III's Herald: Act II finished, every chapter before "herald" done; Reyes offers it.
  debug(p, { action: "finish", story: "act2_choir" });
  await t.wait(5);
  debug(p, { action: "jump", story: "act3_deep", chapter: "herald" });
  await t.wait(5);
  sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "reyes", req: "h1" }));
  await t.wait(4);
  t.assert(offers.find((o) => o.m.req === "h1" && o.m.key === "start:act3_deep"), `Reyes offers the Herald (${JSON.stringify(offers.map((o) => o.m.key))})`);
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer("Accept");
    }
  })();
  sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:act3_deep" }));
  await accept;
  await t.waitMessage(p, /first riddle/i, { since: t.tick - 40, timeout: 200 });

  /** Where each story mob is the first tick it's seen (before it can swim or sink), and the block at its feet. */
  async function wrongAnswer(text, n) {
    /** @type {Map<string, { x: number, y: number, z: number, type: string, feet: string }>} */
    const first = new Map();
    const watch = sys.runInterval(() => {
      for (const e of t.dimension.getEntities({ tags: ["saga:add"] })) {
        if (first.has(e.id)) continue;
        const l = e.location;
        const feet = t.dimension.getBlock({ x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) })?.typeId ?? "?";
        first.set(e.id, { x: l.x, y: l.y, z: l.z, type: e.typeId, feet });
      }
    }, 1);
    debug(p, { action: "answer", text });
    await t.waitUntil(() => first.size >= n, { timeout: 100, message: `${n} story mobs come` });
    await t.wait(5);
    sys.clearRun(watch);
    const spots = [...first.values()];
    t.log(spots.map((s) => `${s.type.replace("minecraft:", "")} at y ${s.y.toFixed(1)} in ${s.feet.replace("minecraft:", "")} (${Math.round(Math.hypot(s.x - X, s.z - Z))} from the middle)`).join(", "));
    for (const e of t.dimension.getEntities({ tags: ["saga:add"] })) e.remove();
    return spots;
  }

  // First riddle wrong: 3 drowned, in the water on the pool's bed (not on the surface or the pillar).
  let spots = await wrongAnswer("a wrong answer", 3);
  let drowned = spots.filter((s) => s.type === "minecraft:drowned");
  t.check(drowned.length === 3, `3 drowned (${drowned.length})`);
  t.check(drowned.every((s) => s.feet === "minecraft:water"), `every drowned is in water (${drowned.map((s) => s.feet).join(", ")})`);
  t.check(drowned.every((s) => s.y < -52), `every drowned is under the surface (${drowned.map((s) => s.y.toFixed(1)).join(", ")})`);
  t.check(drowned.every((s) => Math.max(Math.abs(s.x - X), Math.abs(s.z - Z)) > 2), "none on the pillar");

  // First riddle right, second wrong: 2 drowned on the bed and 2 zombies at the water's surface.
  debug(p, { action: "answer", text: "echo" });
  await t.waitMessage(p, /that's it/, { since: t.tick - 5, timeout: 60 });
  spots = await wrongAnswer("still wrong", 4);
  drowned = spots.filter((s) => s.type === "minecraft:drowned");
  const zombies = spots.filter((s) => s.type === "minecraft:zombie");
  t.check(drowned.length === 2 && zombies.length === 2, `2 drowned and 2 zombies (${spots.map((s) => s.type).join(", ")})`);
  t.check(drowned.every((s) => s.feet === "minecraft:water" && s.y < -52), `the drowned are in the water (${drowned.map((s) => `${s.feet} y ${s.y.toFixed(1)}`).join(", ")})`);
  t.check(drowned.every((s) => Math.max(Math.abs(s.x - X), Math.abs(s.z - Z)) > 2), "no drowned on the pillar");
  t.check(zombies.every((s) => s.y >= -53 && s.y <= -51), `the zombies come at the water's surface (${zombies.map((s) => s.y.toFixed(1)).join(", ")})`);

  // Second riddle right, third wrong: 3 drowned on the bed and 2 vindicators at the surface.
  debug(p, { action: "answer", text: "silence" });
  await t.waitMessage(p, /that's it/, { since: t.tick - 5, timeout: 60 });
  spots = await wrongAnswer("wrong again", 5);
  drowned = spots.filter((s) => s.type === "minecraft:drowned");
  const others = spots.filter((s) => s.type !== "minecraft:drowned");
  t.check(drowned.length === 3, `3 drowned (${spots.map((s) => s.type).join(", ")})`);
  t.check(drowned.every((s) => s.feet === "minecraft:water" && s.y < -52 && Math.max(Math.abs(s.x - X), Math.abs(s.z - Z)) > 2), `the drowned are in the water, not on the pillar (${drowned.map((s) => `${s.feet} y ${s.y.toFixed(1)}`).join(", ")})`);
  t.check(others.every((s) => s.y >= -53 && s.y <= -51), `the vindicators come at the water's surface (${others.map((s) => s.y.toFixed(1)).join(", ")})`);
}
