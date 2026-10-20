// Story Questlines: what guards on patrol cost (F47's every-tick walk). `mates` players (1 by default; 2+ in a party)
// wait sneaking just outside the Gray Ring's stealth area for `seconds` (60) while its watchers walk their rounds.
//   node tools/test-bds/run.mjs --quiet --flat --no-relay --profile --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-stealth-perf.js --arg mates=2 --timeout 400
// Read saga_bp's ms/tick in the profile. Checks only that the watchers are there for the whole window.
export default async function (t) {
  const sys = t.system;
  const mates = Math.max(1, Number(t.args.mates ?? 1));
  const seconds = Math.max(10, Number(t.args.seconds ?? 60));
  const debug = (p, msg) => sys.sendScriptEvent("realm:saga_debug", JSON.stringify({ player: p.name, ...msg }));
  t.server("/time set noon");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  const s = t.world.getDefaultSpawnLocation();
  const R = { x: s.x + 120, z: s.z };
  await t.loadArea(R.x, R.z, { radius: 4 });
  const ps = [];
  for (let k = 0; k < mates; k++) ps.push(await t.player(`P${k}`, { op: k === 0, x: s.x + k, z: s.z }));
  const y = ps[0].location.y;
  ps[0].teleport({ x: R.x + 0.5, y, z: R.z + 0.5 });
  await t.wait(5);
  t.assert(t.cmd(ps[0], "/realm:saga_place choir_ring").ok, "set the Gray Ring");
  await t.wait(5);
  ps[0].teleport({ x: s.x + 0.5, y, z: s.z + 0.5 });
  for (const p of ps) {
    for (const story of ["drowned_bell", "last_map"]) debug(p, { action: "finish", story });
    debug(p, { action: "jump", story: "act1_signs", chapter: "song" });
    await t.wait(5);
    const accept = (async () => {
      for (;;) {
        const f = await t.waitForm(p, { timeout: 200 });
        if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
        else return f.answer(Math.max(0, f.buttons.findIndex((b) => /Accept/.test(b))));
      }
    })();
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ player: p.id, npc: "wren", req: `r${p.name}` }));
    await t.wait(4);
    sys.sendScriptEvent("realm:npc_choose", JSON.stringify({ pack: "saga_bp", player: p.id, key: "start:act1_signs" }));
    await accept;
    await t.wait(10);
    debug(p, { action: "bump", story: "act1_signs", i: 0, n: 1 });
    await t.wait(5);
  }
  for (let k = 1; k < mates; k++) {
    t.cmd(ps[0], `/realm:party_invite ${ps[k].name}`);
    await t.wait(5);
    t.cmd(ps[k], "/realm:party_accept");
    await t.wait(5);
  }
  for (const [k, p] of ps.entries()) {
    p.isSneaking = true;
    p.teleport({ x: R.x - 52 + 0.5, y, z: R.z + k * 2 + 0.5 });
  }
  const guards = () => t.dimension.getEntities({ type: "minecraft:vindicator", tags: ["saga:actor"] }).filter((e) => e.isValid);
  await t.waitUntil(() => guards().length >= 4, { timeout: 100, message: "the watchers are posted" });
  let fewest = Infinity;
  for (let k = 0; k < seconds; k++) {
    await t.wait(20);
    fewest = Math.min(fewest, guards().length);
  }
  t.log(`watchers: ${guards().length} (fewest ${fewest}) for ${mates} mate(s)`);
  t.check(fewest >= 4, "the watchers stayed for the whole window");
}
