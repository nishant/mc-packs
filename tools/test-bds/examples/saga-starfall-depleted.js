// A real built Starfall Crater stays depleted while late players finish Fallen Light with other sources.
// Only missing guidance is expected RED on the original source; inventory credit/reward guards already work.
// The hook copies real saga:p bytes through native world properties across BDS restarts because simulated
// player IDs change. It also adapts simple amethyst inventory and reward totals explicitly, not opaque items.
//   node tools/test-bds/hooks/saga-starfall-stage.mjs tools/test-bds/.cache/starfall-depleted
//   node tools/test-bds/run.mjs --quiet --flat --packs tools/test-bds/.cache/starfall-depleted --only saga_bp,party_bp --scenario tools/test-bds/examples/saga-starfall-depleted.js --timeout 900
export default async function (t) {
  const sys = t.system;
  const send = (id, message) => sys.sendScriptEvent(id, JSON.stringify(message));
  const replies = new Map();
  let nextRequest = 0;
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "harness:starfall_reply") return;
    const reply = JSON.parse(message);
    replies.set(reply.req, reply);
  }, { namespaces: ["harness"] });
  async function request(player, action, extra = {}) {
    const req = `sf${t.phase}-${++nextRequest}`;
    send("harness:starfall_request", { req, player: player.id, action, ...extra });
    const reply = await t.waitUntil(() => replies.get(req), { timeout: 500, message: `${action} acknowledged by the source-owned fixture` });
    t.assert(reply.ok, `${action}: ${reply.error ?? "ok"}`);
    return reply;
  }
  const debug = (player, message) => send("realm:saga_debug", { player: player.id, ...message });
  async function choose(player, key) {
    let next = t.waitForm(player, { timeout: 300 });
    send("realm:npc_choose", { pack: "saga_bp", player: player.id, npc: "sol", key });
    const bodies = [];
    for (let i = 0; i < 20; i++) {
      const form = await next;
      bodies.push(String(form.body));
      const more = form.buttons.includes("Next");
      if (more) next = t.waitForm(player, { timeout: 300 });
      form.answer(more ? "Next" : Math.max(0, form.buttons.findIndex((button) => /Accept|Finish/.test(button))));
      if (!more) return bodies.join("\n");
    }
    t.fail("the bounded story dialogue did not finish");
  }
  async function startFallen(player) {
    debug(player, { action: "finish", story: "drowned_bell" });
    debug(player, { action: "finish", story: "last_map" });
    debug(player, { action: "jump", story: "act1_signs", chapter: "fallen" });
    await t.wait(5);
    return choose(player, "start:act1_signs");
  }
  async function crystals() {
    const out = [];
    for (let x = 490; x <= 510; x++) {
      for (let z = 490; z <= 510; z++) {
        for (let y = 58; y <= 69; y++) {
          const block = t.dimension.getBlock({ x, y, z });
          if (block && /minecraft:(?:amethyst_block|budding_amethyst|amethyst_cluster|(?:small|medium|large)_amethyst_bud)$/.test(block.typeId)) out.push({ x, y, z });
        }
      }
      await t.wait(1);
    }
    return out;
  }
  function finishOtherSteps(player) {
    debug(player, { action: "bump", story: "act1_signs", i: 0, n: 1 });
    debug(player, { action: "bump", story: "act1_signs", i: 2, n: 1 });
  }
  const collected = (state) => state.progress?.o?.[1] === 8;
  async function waitCount(player, count) {
    for (let i = 0; i < 12; i++) {
      const state = await request(player, "state");
      if (state.progress?.o?.[1] === count) return state;
      await t.wait(10);
    }
    t.fail(`native collect progress did not reach ${count}`);
  }
  t.server("/gamerule doMobSpawning false");
  t.server("/gamerule keepInventory true");
  await t.loadArea(500, 500, { radius: 4 });
  const late = await t.player("LateSearcher", { op: true, x: 515, y: 65, z: 500 });
  if (t.phase === 1) {
    t.server("/fill 488 57 488 512 63 512 stone");
    const first = await t.player("FirstSearcher", { op: true, x: 515, y: 65, z: 500 });
    const built = await request(first, "build", { origin: { x: 500, y: 64, z: 500 } });
    t.assert(built.place?.built === 1, "the shipped Starfall prefab was actually built");
    t.cmd(first, "/give @s amethyst_shard 8");
    await startFallen(first);
    t.assert(collected(await waitCount(first, 8)), "existing inventory already counts on original source");
    finishOtherSteps(first);
    await t.wait(10);
    await choose(first, "end:act1_signs");
    const sources = await crystals();
    t.assert(sources.length > 0, "the real built crater had crystal sources before depletion");
    // Fixture removal represents earlier mining, not physical mouse reach or a mining-input certification.
    for (const at of sources) t.dimension.getBlock(at).setType("minecraft:air");
    t.dimension.getBlock({ x: 510, y: 65, z: 510 }).setType("minecraft:glass");
    t.assert((await crystals()).length === 0, "the shared crater is exhausted after the first player");
    await startFallen(late);
    const state = await request(late, "state");
    t.check(/geodes?/i.test(state.hint) && /party mate|friend/i.test(state.hint), "the real Fallen Light hint explains outside and handed-over shards");
    t.assert((await crystals()).length === 0, "accepting never refills player-modified terrain");
    await t.wait(80);
    t.assert((await request(late, "state")).shards === 0, "a late solo player receives no repeatable free supply");
    t.cmd(late, "/give @s amethyst_shard 3");
    await waitCount(late, 3);
    const saved = await request(late, "checkpoint", { slot: "partial" });
    t.log(`Native partial checkpoint: player ${saved.playerId}, 3 of 8 shards; restarting BDS`);
    return t.restart("native partial Fallen Light progress with a mined-out built crater");
  }
  const slot = t.phase === 2 ? "partial" : "reported";
  const restored = await request(late, "restore", { slot });
  t.log(`Explicit simulated identity adapter: ${restored.originalPlayerId} -> ${restored.playerId}`);
  t.assert(restored.originalPlayerId !== restored.playerId, "the changed simulated identity is recorded, not mistaken for production rejoin persistence");
  t.assert(restored.place?.built === 1 && (await crystals()).length === 0, "built/depleted crater state survived the native restart");
  t.assert(t.dimension.getBlock({ x: 510, y: 65, z: 510 }).typeId === "minecraft:glass", "the prior player's terrain edit was preserved");
  if (t.phase === 2) {
    t.assert(restored.progress.o[1] === 3, "partial progress survived the production saga:p flush and native restart adapter");
    t.cmd(late, "/give @s amethyst_shard 3");
    const helper = await t.player("ShardHelper", { op: true, x: 517, y: 65, z: 500 });
    await startFallen(helper);
    t.cmd(late, "/realm:party_invite ShardHelper");
    await t.waitMessage(helper, /invited you/, { since: t.tick - 5, timeout: 100 });
    t.assert(t.cmd(helper, "/realm:party_accept").ok, "the shard helper joins the actual party");
    t.cmd(helper, "/give @s amethyst_shard 5");
    await t.wait(20);
    const donor = helper.getComponent("minecraft:inventory").container;
    const target = late.getComponent("minecraft:inventory").container;
    let moved = false;
    for (let i = 0; i < donor.size; i++) {
      const stack = donor.getItem(i);
      if (stack?.typeId !== "minecraft:amethyst_shard") continue;
      t.assert(target.addItem(stack) === undefined, "the receiving inventory accepts the helper's whole stack");
      donor.setItem(i, undefined);
      moved = true;
      break;
    }
    t.assert(moved, "five outside-source shards were handed over from a real party member's inventory");
    await waitCount(late, 8);
    t.assert((await request(late, "state")).shards === 8, "collection keeps all eight shards");
    finishOtherSteps(late);
    finishOtherSteps(helper);
    await t.wait(30);
    const before = await request(late, "state");
    await choose(late, "end:act1_signs");
    await t.wait(20);
    const after = await request(late, "state");
    t.assert(after.progress.dn.filter((id) => id === "fallen").length === 1, "Fallen Light completed exactly once");
    t.assert(after.level === before.level + 5 && after.crowns === before.crowns + 70, "the unchanged chapter reward was given exactly once");
    send("realm:npc_choose", { pack: "saga_bp", player: late.id, npc: "sol", key: "end:act1_signs" });
    await t.wait(40);
    const repeated = await request(late, "state");
    t.assert(repeated.level === after.level && repeated.crowns === after.crowns, "repeating the report does not duplicate rewards");
    await request(late, "checkpoint", { slot: "reported" });
    return t.restart("a completed Fallen Light report cannot pay twice after restart");
  }
  t.assert(restored.progress.dn.filter((id) => id === "fallen").length === 1, "native saved completion is retained after the second restart");
  send("realm:npc_choose", { pack: "saga_bp", player: late.id, npc: "sol", key: "end:act1_signs" });
  await t.wait(40);
  const repeated = await request(late, "state");
  t.assert(repeated.level === restored.level && repeated.crowns === restored.crowns, "the completed report cannot pay again after restart");
}
