// Town Projects, the garden pen's top-up (O78): every pen animal loaded counts, however far it wandered, so a sheep 45
// blocks from the pen is never spawned again; and one that came back after its stand-in was spawned (it had wandered
// into ground that wasn't loaded) is one too many: the farthest loses the pen's tag (an ordinary sheep, never killed),
// so the pen keeps 2 sheep and 2 chickens. Spots set by hand (autoSpots Disabled), so nothing waits for a scan.
//   node tools/test-bds/run.mjs --quiet --flat --only town_bp --scenario tools/test-bds/examples/town-pen-wander.js --timeout 3000
export default async function (t) {
  const sys = t.system;
  const dim = t.dimension;
  t.server("/gamerule domobspawning false");
  const p = await t.player("Ann", { op: true, x: 0, z: 0 });
  await t.loadArea(0, 0, { radius: 4, whole: true });
  for (const [key, value] of [["autoSpots", false], ["residents", false]]) sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: key, pack: "town_bp", key, value }));
  await t.wait(5);
  const town = (action, extra = {}) => sys.sendScriptEvent("realm:town_test", JSON.stringify({ action, player: "Ann", town: "pen", ...extra }));
  const dump = async () => {
    await t.wait(1);
    const since = t.tick;
    town("dump");
    return JSON.parse((await t.waitMessage(p, (x) => x.startsWith('{"town"'), { since, timeout: 60 })).plain);
  };
  const prog = (d, id) => d.progress.find(([x]) => x === id)?.[1];
  const Y = -60;
  p.teleport({ x: 0.5, y: Y, z: 0.5 });
  await t.wait(10);
  const since = t.tick;
  town("add", { name: "Pen" });
  await t.waitMessage(p, /Town Pen added/, { since, timeout: 60 });
  town("spot", { project: "garden", spot: { x: -12, y: Y, z: -12, f: 0 } });
  await t.wait(5);
  town("finish", { project: "garden" });
  let d;
  await t.waitUntil(async () => prog((d = await dump()), "garden")?.built === 1 && prog(d, "pen")?.done === 1, { timeout: 400, interval: 20, message: "the garden is built and its pen due" });
  town("spot", { project: "pen", spot: { x: 10, y: Y, z: 10, f: 0 } });
  await t.waitUntil(async () => prog((d = await dump()), "pen")?.an === 1, { timeout: 400, interval: 20, message: "the pen is built with its animals" });
  const TAG = "town:a:pen";
  const count = (type, tagged) => dim.getEntities({ type }).filter((e) => !tagged || e.hasTag(TAG)).length;
  t.check(count("minecraft:sheep", true) === 2 && count("minecraft:chicken", true) === 2, "2 sheep and 2 chickens in the pen");
  // The player stays within 24 blocks of the pen (its checks run) and within 32 of the sheep (script-spawned animals
  // despawn at random past 32 blocks from players: then they would really be gone).
  p.teleport({ x: 10.5, y: Y, z: 30.5 });
  const sheep = dim.getEntities({ type: "minecraft:sheep", tags: [TAG] });
  sheep[0].teleport({ x: 10.5, y: Y, z: 55.5 });
  t.log(`a sheep wandered 45 blocks from the pen (id ${sheep[0].id})`);
  // Two pen checks (each at most every 600 ticks once a player has been near for 600).
  await t.wait(1400);
  const far = sheep[0].isValid ? Math.round(Math.hypot(sheep[0].location.x - 10, sheep[0].location.z - 13)) : -1;
  t.log(`the far sheep: ${sheep[0].isValid ? `${far} blocks from the pen` : "gone"}`);
  t.check(sheep[0].isValid, "the far sheep is still there (loaded)");
  t.check(count("minecraft:sheep", false) === 2, `no sheep spawned for the one that wandered (${count("minecraft:sheep", false)} sheep)`);
  t.check(count("minecraft:sheep", true) === 2, `2 pen sheep (${count("minecraft:sheep", true)})`);
  // One that came back after its stand-in was spawned: a third sheep with the pen's tag, far out.
  t.assert(t.server(`/summon sheep 12 ${Y} 56`).ok, "a third sheep");
  await t.wait(2);
  const back = dim.getEntities({ type: "minecraft:sheep", location: { x: 12.5, y: Y, z: 56.5 }, maxDistance: 2 }).find((e) => e.id !== sheep[0].id);
  t.assert(back, "the third sheep is there");
  back.addTag(TAG);
  t.log(`a third pen sheep 43 blocks out (id ${back.id})`);
  await t.waitUntil(() => count("minecraft:sheep", true) === 2, { timeout: 1400, interval: 20, message: `the pen keeps 2 sheep (${count("minecraft:sheep", true)} tagged)` });
  const untagged = dim.getEntities({ type: "minecraft:sheep" }).filter((e) => !e.hasTag(TAG));
  t.log(`untagged: ${untagged.map((e) => `${e.id} at ${Math.round(e.location.x)},${Math.round(e.location.z)}`).join("; ")}`);
  t.check(untagged.length === 1, "one sheep left the pen's count, not killed");
  t.check(count("minecraft:sheep", false) === 3 && count("minecraft:chicken", true) === 2, `nothing killed or spawned (${count("minecraft:sheep", false)} sheep, ${count("minecraft:chicken", true)} chickens)`);
}
