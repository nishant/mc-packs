// Deck of Many Things across a restart: The Spore's field (test length, 20 s), Anvil Drop's anvil,
// a running Arena and Chicken Rain's chickens are all cleaned up after the server restarts in the
// middle of them. About 5 minutes:
//   node tools/test-bds/run.mjs --quiet --timeout 900 --only domt_bp --scenario tools/test-bds/examples/domt-restart.js
const KEY = "harness:domt_restart";

export default async function (t) {
  const sp = t.world.getDefaultSpawnLocation();
  if (t.phase === 1) {
    t.server("/time set noon");
    const op = await t.player("Tester", { op: true });
    const buddy = await t.player("Buddy", { x: sp.x + 40, z: sp.z + 40 });
    const carl = await t.player("Carl", { x: sp.x - 12, z: sp.z });
    t.server("/effect @a resistance 600 4 true");
    // Wild cards on, for Chicken Rain.
    const f = t.waitForm(op);
    t.cmd(op, "/realm:domt_effects");
    (await f).answer("Enable every wild card");
    (await t.waitForm(op)).answer(null);
    const drawFor = async (target, card) => {
      const f1 = t.waitForm(op);
      t.cmd(op, "/realm:domt");
      (await f1).answer("Draw for a player");
      (await t.waitForm(op)).answer({ Player: target.name, Card: card });
      await t.waitMessage(target, new RegExp(`You drew ${card}`), { timeout: 300 });
    };
    // The Arena on Tester.
    const ground = op.location.y;
    await drawFor(op, "The Arena");
    await t.waitUntil(() => op.location.y > ground + 8, { timeout: 300, message: "Tester is in the arena" });
    const floor = { x: Math.floor(op.location.x), y: Math.floor(op.location.y) - 1, z: Math.floor(op.location.z) };
    await t.seconds(4);
    const arenaMobs = t.dimension.getEntities({ tags: ["domt:arena"] }).length;
    t.check(arenaMobs > 0, `arena mobs (${arenaMobs})`);
    // Chicken Rain on Buddy.
    await drawFor(buddy, "Chicken Rain");
    await t.seconds(2);
    const chickens = t.dimension.getEntities({ tags: ["domt:temp"] }).length;
    t.check(chickens > 0, `chickens rained (${chickens})`);
    // The Spore through the test path (its field goes back after 20 s).
    let tested;
    t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
      if (id === "realm:domt_tested") tested = JSON.parse(message);
    });
    await t.console(`scriptevent realm:domt_test {"effect":"the_spore","player":"Buddy"}`);
    await t.waitUntil(() => tested, { timeout: 600, message: "spore tested" });
    t.check(tested.ok, `spore made its field: ${tested.why}`);
    const bx = Math.floor(buddy.location.x), bz = Math.floor(buddy.location.z);
    const mycelium = () => {
      let n = 0;
      for (let x = bx - 12; x <= bx + 12; x++) for (let z = bz - 12; z <= bz + 12; z++) if (t.dimension.getTopmostBlock({ x, z })?.typeId === "minecraft:mycelium") n++;
      return n;
    };
    t.log(`mycelium before the restart: ${mycelium()}`);
    // Anvil Drop on Carl.
    const cx = Math.floor(carl.location.x), cy = Math.floor(carl.location.y), cz = Math.floor(carl.location.z);
    await drawFor(carl, "Anvil Drop");
    const anvil = await t.waitUntil(() => {
      for (let y = cy - 2; y <= cy + 1; y++) if (/anvil/.test(t.dimension.getBlock({ x: cx, y, z: cz })?.typeId ?? "")) return { x: cx, y, z: cz };
    }, { timeout: 200, message: "the anvil landed" });
    t.log(`anvil at ${anvil.x} ${anvil.y} ${anvil.z}`);
    t.world.setDynamicProperty(KEY, JSON.stringify({ anvil, floor, chickensAt: Date.now(), bx, bz }));
    t.restart("mid-card, restarting");
  }
  const saved = JSON.parse(String(t.world.getDynamicProperty(KEY)));
  await t.player("Tester", { op: true, x: sp.x + 40, z: sp.z + 40 });
  await t.player("Carl", { x: sp.x - 12, z: sp.z });
  await t.loadArea(saved.floor.x, saved.floor.z);
  // The arena's leftover mobs go within 10 seconds.
  await t.waitUntil(() => t.dimension.getEntities({ tags: ["domt:arena"] }).length === 0, { timeout: 300, message: "arena mobs gone after the restart" });
  t.log(`arena floor after the restart: ${t.dimension.getBlock(saved.floor)?.typeId} (removed within 10 minutes of the draw)`);
  // The anvil goes (it was due 8 s after the drop).
  await t.waitUntil(() => !/anvil/.test(t.dimension.getBlock(saved.anvil)?.typeId ?? ""), { timeout: 400, message: "the anvil is gone after the restart" });
  // The spore field goes back.
  await t.waitUntil(() => {
    for (let x = saved.bx - 12; x <= saved.bx + 12; x++) for (let z = saved.bz - 12; z <= saved.bz + 12; z++) if (t.dimension.getTopmostBlock({ x, z })?.typeId === "minecraft:mycelium") return false;
    return true;
  }, { timeout: 400, message: "the spore field is gone after the restart" });
  // Chicken Rain's chickens leave 3 minutes after they came.
  const due = saved.chickensAt + 185000 - Date.now();
  t.log(`waiting ${Math.round(due / 1000)} s for the chickens`);
  if (due > 0) await t.wait(Math.ceil(due / 50));
  await t.waitUntil(() => t.dimension.getEntities({ tags: ["domt:temp"] }).length === 0, { timeout: 500, message: "chickens gone after 3 minutes" });
}
