// Story Questlines (W7 O38/O40 story content): the families and signposts the content fix added work in the real game.
//   A. Poplar fence: "A Fence and a Wait" (hatchlings/fence), "12 fences by the lighthouse", counts a poplar fence.
//   B. Poplar planks: "The Mouth" (edges_of_map/mouth), "24 planks" at the west station, counts poplar planks.
//   C. Bamboo and poplar saplings: "Forty Winters" (act5_lantern/forty), "Plant a sapling in the Old Graveyard".
//   D. A mined-out finite interact site: "The Keeper Who Doesn't Sleep" (act1_signs/keeper), "Light 4 candles in the
//      Old Chapel". Every chapel candle is mined out first; the chapter hint (read through /realm:saga_log, as a
//      player does) says to place new candles within 10 blocks and that one is enough; one replacement candle then
//      finishes the step with four taps, and look-alike taps (the wrong block, outside the radius) do not count.
// Each case starts the way a player does: debug `jump` to the chapter (every chapter before it counts as finished), the
// public realm:npc_talk offer, realm:npc_choose and the Accept button. No state, flag, progress or reward is credited.
//
// NATIVE and REPLAY, printed as log lines:
//   NATIVE  the simulated player really uses the item on the ground, mines with breakBlock, or sets its game mode. The
//           server fires playerPlaceBlock / playerBreakBlock, which saga_bp's own subscriptions see. A native
//           playerPlaceBlock listener of this scenario also records the block type the server actually placed, so a
//           placed block of another type than the shipped list (a bamboo stalk instead of bamboo_sapling) shows up.
//   REPLAY  taps. A simulated player's empty-hand tap fires no interact event, and a tap with an item arrives with
//           isFirstEvent false, which saga_bp ignores. The sgs:tap relay of the test copy (hooks/saga-softlock-rvtest.js,
//           the same hook as saga-graveyard-softlock.js) calls the REAL touchedAt handler with the block type and spot
//           read from the world at that moment, so what is accepted is still the real objective: its block list, its
//           radius and its count. The step's "done" chat line is the acceptance assertion; no progress is written.
// Disclosed limits: the six chapel candles are set with setType (the shipped Old Chapel prefab is not built) and then
// mined by native breakBlock events. Poplar and bamboo saplings are not grown, only placed. Nothing but the sgs hook
// copy differs from the shipped saga_bp, and it is the only pack installed (no claim or protection pack is involved or
// bypassed); skipCreative and every other setting keep their defaults (the creative control in case A proves a
// creative player's placements still do not count).
// Needs the hook copy of saga_bp. The suite runs the recipe below; on Windows or without bash stage it directly and use
// run.mjs with --packs <dir>. About 4 minutes.
//   mkdir -p '/tmp/scr' && node tools/test-bds/hooks/stage-saga-softlock.mjs '/tmp/scr'
//   node tools/test-bds/run.mjs --quiet --flat --packs '/tmp/scr' --scenario tools/test-bds/examples/saga-content-replacements.js --timeout 900
// AFTER (the fixed story data, e.g. this branch): the command above; every check passes.
// BEFORE (596d187f, the story data before the fix; check it out as a separate worktree, e.g. `git worktree add --detach
// <dir> 596d187f`, and stage from its packs folder). Expected: exit 1 with exactly five failed checks (the scenario is
// not stopped): the poplar fence step, the poplar planks step, the bamboo sapling step, the poplar sapling step and the
// keeper hint's signpost. The mined-out candle steps (replacement, taps, controls) pass on both, because the engine
// already accepted any candle placed there; the fix is the hint, which this reads from the real Story Log. If the
// bamboo item places a block other than bamboo_sapling, the "server placed bamboo_sapling" check fails too: that is a
// finding about the shipped step list, not a fixture slip.
//   node tools/test-bds/hooks/stage-saga-softlock.mjs <stage> --from <dir>/packs
//   node tools/test-bds/run.mjs --quiet --flat --packs <stage> --scenario tools/test-bds/examples/saga-content-replacements.js --timeout 900
export default async function (t) {
  const sys = t.system;
  const { ItemStack, Direction, GameMode } = t.mc;
  const send = (id, m = {}) => sys.sendScriptEvent(id, JSON.stringify(m));
  const debug = (p, m) => send("realm:saga_debug", { player: p.id, ...m });
  const plain = (s) => String(s).replace(/§./g, "");
  const spawn = t.world.getDefaultSpawnLocation();

  t.server("/gamerule doMobSpawning false");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule keepinventory true");
  t.server("/time set day");

  /** @type {any[]} */
  const offers = [];
  /** @type {{ tick: number, m: any }[]} */
  const tracks = [];
  let pong;
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        const m = JSON.parse(message || "{}");
        if (id === "realm:npc_offer") offers.push(m);
        else if (id === "realm:track") tracks.push({ tick: sys.currentTick, m });
        else if (id === "sgs:pong") pong = m;
      } catch {}
    },
    { namespaces: ["realm", "sgs"] },
  );
  // What the server itself fired (NATIVE), apart from anything the packs did with it.
  const nativePlaced = [];
  t.world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
    nativePlaced.push({ tick: t.tick, name: player.name, type: block.typeId, x: block.location.x, y: block.location.y, z: block.location.z });
  });
  const nativeUse = [];
  t.world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, isFirstEvent }) => {
    nativeUse.push({ name: player.name, type: block.typeId, first: isFirstEvent });
  });

  send("sgs:ping");
  await t.waitUntil(() => pong, { timeout: 100, message: "the saga_bp hook copy answers sgs:ping (stage it with tools/test-bds/hooks/stage-saga-softlock.mjs, see the header)" });

  // ---- helpers ----------------------------------------------------------------------------------------------------
  /** The ground block under a spawned player. */
  const groundOf = (p) => ({ x: Math.floor(p.location.x), y: Math.floor(p.location.y) - 1, z: Math.floor(p.location.z) });
  /** n ground blocks in a row, dz blocks from the center. */
  const rowOf = (base, n, dz) => Array.from({ length: n }, (_, i) => ({ x: base.x - Math.floor(n / 2) + i, y: base.y, z: base.z + dz }));
  const typeAt = (at) => {
    try {
      return t.dimension.getBlock(at)?.typeId;
    } catch {
      return undefined;
    }
  };
  const nativeCount = (p, type, since) => nativePlaced.filter((n) => n.name === p.name && n.type === type && n.tick >= since).length;

  /** Sets a story place where the player stands (operators use this command for every place). */
  async function placeHere(p, name) {
    const since = t.tick;
    t.assert(t.cmd(p, `/realm:saga_place ${name}`).ok, `${p.name} sets the story place ${name} where it stands`);
    await t.waitMessage(p, new RegExp(`Place "${name}"`), { since, timeout: 100 });
  }

  /** True when the public offer `key` shows up at `npc`: asked again every 5 ticks, so the pack scan has time to finish. */
  async function offered(p, npc, key, ticks = 300) {
    for (let waited = 0; waited < ticks; waited += 5) {
      const req = `scr${p.name}${waited}${t.tick}`;
      send("realm:npc_talk", { player: p.id, npc, req });
      await t.wait(5);
      if (offers.some((o) => o.req === req && o.pack === "saga_bp" && o.key === key)) return true;
    }
    return false;
  }

  /** Accepts the story's current chapter the way a player does: the offer, every page, the Accept button. */
  async function accept(p, npc, story) {
    t.assert(await offered(p, npc, `start:${story}`), `${npc} offers start:${story} to ${p.name}`);
    const pages = (async () => {
      for (;;) {
        const f = await t.waitForm(p, { timeout: 300 });
        if (f.buttons.some((b) => /^next$/i.test(b))) {
          f.answer("Next");
          continue;
        }
        const i = f.buttons.findIndex((b) => /accept/i.test(b));
        return f.answer(i >= 0 ? i : Math.max(0, f.buttons.findIndex((b) => !/not now/i.test(b))));
      }
    })();
    send("realm:npc_choose", { pack: "saga_bp", player: p.id, key: `start:${story}` });
    await pages;
    t.assert(await offered(p, npc, `info:${story}`), `${story} is accepted: ${npc} now offers info:${story}`);
  }

  /** The step's "done" chat line, polled so a chapter that never counts reports a failed check, not a timeout. */
  const saidDone = (p, re, since) => t.messages(p, { since, kind: "chat" }).some((m) => re.test(m.plain));
  async function waitDone(p, re, since, ticks = 60) {
    for (let k = 0; k < ticks; k += 2) {
      if (saidDone(p, re, since)) return true;
      await t.wait(2);
    }
    return saidDone(p, re, since);
  }

  /**
   * NATIVE: puts `item` on the ground block `ground` (the player stands by it; a simulated player places one block every
   * few ticks, so it tries again until the block is there). Returns the type of block the server placed above it.
   */
  async function putOne(p, item, ground) {
    const above = { x: ground.x, y: ground.y + 1, z: ground.z };
    const inv = p.getComponent("minecraft:inventory").container;
    for (let k = 0; k < 5 && typeAt(above) === "minecraft:air"; k++) {
      inv.setItem(p.selectedSlotIndex, new ItemStack(item, 1));
      p.teleport({ x: ground.x + 0.5, y: ground.y + 1, z: ground.z - 1.5 }, { dimension: t.dimension });
      await t.wait(3);
      p.useItemInSlotOnBlock(p.selectedSlotIndex, ground, Direction.Up);
      await t.wait(5);
      p.stopInteracting();
    }
    return typeAt(above);
  }

  /** NATIVE: places `item` along `ground`, every block checked against the type the server placed; returns how many stood. */
  async function putRow(p, item, expected, ground) {
    let stood = 0;
    for (const g of ground) if ((await putOne(p, item, g)) === expected) stood++;
    return stood;
  }

  /** REPLAY: a tap on the block at `at`, with the type the world holds there now (the real touchedAt handler). */
  async function tap(p, at, type = typeAt(at)) {
    send("sgs:tap", { name: p.name, type, x: at.x, y: at.y, z: at.z });
    await t.wait(3);
  }

  const done = {};

  // ---- A. poplar fence ----------------------------------------------------------------------------------------------
  {
    const p = await t.player("Fencer", { op: true, gameMode: "survival", x: 100, z: 0 });
    const base = groundOf(p);
    debug(p, { action: "jump", story: "hatchlings", chapter: "fence" });
    await t.wait(5);
    await placeHere(p, "lighthouse");
    await accept(p, "tobin", "hatchlings");
    const re = /12 fences by the lighthouse: done/;
    t.log("CASE A NATIVE: a creative player places 12 poplar fences in the area (skipCreative must keep them from counting)");
    p.setGameMode(GameMode.Creative);
    await t.wait(5);
    const c0 = t.tick;
    const inCreative = await putRow(p, "minecraft:poplar_fence", "minecraft:poplar_fence", rowOf(base, 12, 3));
    p.setGameMode(GameMode.Survival);
    await t.wait(5);
    t.assert(inCreative === 12, `the creative control placed 12 poplar fences (${inCreative}); the server fired ${nativeCount(p, "minecraft:poplar_fence", c0)} playerPlaceBlock events`);
    t.check(!(await waitDone(p, re, c0, 20)), "A: 12 poplar fences placed in creative mode do not finish the step (skipCreative is unchanged)");
    t.log("CASE A NATIVE: the survival player places poplar fences, 11 and then the 12th");
    const s0 = t.tick;
    const eleven = await putRow(p, "minecraft:poplar_fence", "minecraft:poplar_fence", rowOf(base, 11, 6));
    t.assert(eleven === 11, `11 poplar fences stand (${eleven})`);
    t.check(!(await waitDone(p, re, s0, 20)), "A: 11 poplar fences are not 12");
    const twelfth = await putOne(p, "minecraft:poplar_fence", { x: base.x + 6, y: base.y, z: base.z + 6 });
    t.assert(twelfth === "minecraft:poplar_fence", `the 12th poplar fence stands (${twelfth})`);
    t.check(nativeCount(p, "minecraft:poplar_fence", s0) === 12, `the server fired 12 playerPlaceBlock events for poplar_fence (${nativeCount(p, "minecraft:poplar_fence", s0)})`);
    done.fence = await waitDone(p, re, s0);
    t.check(done.fence, `A: the 12th poplar fence finishes "Fence in the nest: 12 fences by the lighthouse" (${t.messages(p, { since: s0, kind: "chat" }).map((m) => m.plain).filter(Boolean).slice(-4).join(" | ")})`);
  }

  // ---- B. poplar planks ---------------------------------------------------------------------------------------------
  {
    const p = await t.player("Planker", { op: true, gameMode: "survival", x: 200, z: 0 });
    debug(p, { action: "jump", story: "edges_of_map", chapter: "mouth" });
    await t.wait(5);
    const since = t.tick;
    await accept(p, "mara", "edges_of_map");
    // The west station is spawn plus the offset (-1400, -120), brought in by farScale 0.5 past 300 blocks: ask the tracker.
    const target = await t.waitUntil(() => tracks.filter((e) => e.tick >= since && e.m.player === p.id && Number.isFinite(e.m.x)).at(-1)?.m, { timeout: 200, message: "saga sends realm:track with the west station" });
    const d = Math.hypot(-1400, -120);
    const k = (300 + (d - 300) * 0.5) / d;
    const want = { x: Math.floor(spawn.x) + Math.round(-1400 * k), z: Math.floor(spawn.z) + Math.round(-120 * k) };
    t.check(Math.abs(target.x - want.x) <= 1 && Math.abs(target.z - want.z) <= 1, `the tracker points at the west station (${target.x}, ${target.z}; the scaled offset is ${want.x}, ${want.z})`);
    const { top } = await t.loadArea(target.x, target.z, { radius: 3 });
    p.teleport({ x: target.x + 0.5, y: top.location.y + 1, z: target.z + 0.5 }, { dimension: t.dimension });
    await t.wait(10);
    const base = { x: target.x, y: top.location.y, z: target.z };
    const re = /Build a bridge at the west station \(24 planks\): done/;
    t.log("CASE B NATIVE: the player places poplar planks at the west station, 23 and then the 24th");
    const s0 = t.tick;
    const row = rowOf(base, 24, 3);
    const first = await putRow(p, "minecraft:poplar_planks", "minecraft:poplar_planks", row.slice(0, 23));
    t.assert(first === 23, `23 poplar planks stand (${first})`);
    t.check(!(await waitDone(p, re, s0, 20)), "B: 23 poplar planks are not 24");
    const last = await putOne(p, "minecraft:poplar_planks", row[23]);
    t.assert(last === "minecraft:poplar_planks", `the 24th poplar plank stands (${last})`);
    t.check(nativeCount(p, "minecraft:poplar_planks", s0) === 24, `the server fired 24 playerPlaceBlock events for poplar_planks (${nativeCount(p, "minecraft:poplar_planks", s0)})`);
    done.planks = await waitDone(p, re, s0);
    t.check(done.planks, `B: the 24th poplar plank finishes "Build a bridge at the west station (24 planks)" (${t.messages(p, { since: s0, kind: "chat" }).map((m) => m.plain).filter(Boolean).slice(-4).join(" | ")})`);
  }

  // ---- C. bamboo sapling and poplar sapling -----------------------------------------------------------------------
  for (const [name, x, item, expected] of [
    ["Bamboo", 300, "minecraft:bamboo", "minecraft:bamboo_sapling"],
    ["Poplar", 400, "minecraft:poplar_sapling", "minecraft:poplar_sapling"],
  ]) {
    const p = await t.player(`Planter${name}`, { op: true, gameMode: "survival", x, z: 0 });
    const base = groundOf(p);
    debug(p, { action: "jump", story: "act5_lantern", chapter: "forty" });
    await t.wait(5);
    await placeHere(p, "graveyard");
    await accept(p, "moss", "act5_lantern");
    const re = /Plant a sapling in the Old Graveyard for the lost: done/;
    t.log(`CASE C NATIVE: ${p.name} plants a ${expected} (the ${item} item) in the Old Graveyard`);
    const s0 = t.tick;
    const placed = await putOne(p, item, { x: base.x + 2, y: base.y, z: base.z });
    t.check(placed === expected, `the server placed ${expected} for the ${item} item (${placed})`);
    done[name] = await waitDone(p, re, s0);
    t.check(done[name], `C: a ${expected} finishes "Plant a sapling in the Old Graveyard for the lost" (${t.messages(p, { since: s0, kind: "chat" }).map((m) => m.plain).filter(Boolean).slice(-4).join(" | ")})`);
  }

  // ---- D. the mined-out Old Chapel ----------------------------------------------------------------------------------
  {
    const p = await t.player("Chandler", { op: true, gameMode: "survival", x: 500, z: 0 });
    const base = groundOf(p);
    debug(p, { action: "jump", story: "act1_signs", chapter: "keeper" });
    await t.wait(5);
    await placeHere(p, "old_chapel");
    const RADIUS = 10; // "Light 4 candles in the Old Chapel": radius 10 from the place
    const candles = () => {
      const found = [];
      for (let dx = -RADIUS; dx <= RADIUS; dx++)
        for (let dz = -RADIUS; dz <= RADIUS; dz++)
          for (let dy = 0; dy <= 3; dy++) {
            const at = { x: base.x + dx, y: base.y + dy, z: base.z + dz };
            if (/candle/.test(String(typeAt(at)))) found.push(at);
          }
      return found;
    };
    // The chapel's candles (the prefab holds six), then mined out by the player, before the chapter is accepted.
    const chapel = [[3, 0], [-3, 0], [0, 3], [0, -3], [4, 2], [-4, -2]].map(([dx, dz]) => ({ x: base.x + dx, y: base.y + 1, z: base.z + dz }));
    for (const at of chapel) t.dimension.getBlock(at).setType("minecraft:white_candle");
    t.assert(candles().length === 6, `the chapel holds six candles (${candles().length})`);
    t.log("CASE D NATIVE: the player mines out every chapel candle (breakBlock)");
    for (const at of chapel) {
      for (let k = 0; k < 5 && /candle/.test(String(typeAt(at))); k++) {
        p.teleport({ x: at.x + 0.5, y: base.y + 1, z: at.z - 1.5 }, { dimension: t.dimension });
        await t.wait(3);
        p.breakBlock(at);
        await t.waitUntil(() => !/candle/.test(String(typeAt(at))), { timeout: 40 }).catch(() => undefined);
        p.stopBreakingBlock?.();
      }
    }
    t.assert(candles().length === 0, `no candle is left within ${RADIUS} blocks of the Old Chapel (${candles().length})`);
    await accept(p, "hollis", "act1_signs");
    const re = /Light 4 candles in the Old Chapel: done/;

    // The hint a player reads: /realm:saga_log, the story, "Ask for a hint".
    let next = t.waitForm(p, { timeout: 200 });
    t.assert(t.cmd(p, "/realm:saga_log").ok, "/realm:saga_log runs");
    const list = await next;
    next = t.waitForm(p, { timeout: 200 });
    list.answer("Signs in the Sky");
    const page = await next;
    next = t.waitForm(p, { timeout: 200 });
    page.answer("hint");
    let form = await next;
    if (/Ask for a hint\?/.test(form.title)) {
      next = t.waitForm(p, { timeout: 200 });
      form.answer("Ask for the hint");
      form = await next;
    }
    t.assert(form.title === "Hint", `the Story Log shows the hint (${form.title})`);
    const hint = plain(form.body);
    next = t.waitForm(p, { timeout: 100 });
    form.answer(0);
    (await next.catch(() => undefined))?.answer(null);
    t.log(`CASE D hint a player reads: ${hint.split("\n")[0]}`);
    t.check(
      new RegExp(`place new candles of your own within ${RADIUS} blocks of the chapel`, "i").test(hint) && /one placed candle is enough/i.test(hint),
      "D: the keeper hint says to place new candles within 10 blocks of the chapel and that one placed candle is enough",
    );

    // Look-alike taps do not count: the wrong block inside the radius, a candle outside it.
    t.log("CASE D REPLAY: taps that must not count (sgs:tap -> the real touchedAt)");
    const s0 = t.tick;
    const grass = { x: base.x + 2, y: base.y, z: base.z };
    for (let i = 0; i < 4; i++) await tap(p, grass);
    for (let i = 0; i < 4; i++) await tap(p, { x: base.x + RADIUS + 20, y: base.y + 1, z: base.z }, "minecraft:white_candle");
    t.check(!(await waitDone(p, re, s0, 20)), "D: four taps on a grass block, and four on a candle 30 blocks away, do not light candles");

    // One replacement candle, a different color than the shipped ones, placed natively inside the radius.
    t.log("CASE D NATIVE: the player places one new candle of their own inside the chapel");
    const spot = { x: base.x + 2, y: base.y + 1, z: base.z + 2 };
    const r0 = t.tick;
    const placed = await putOne(p, "minecraft:red_candle", { x: spot.x, y: base.y, z: spot.z });
    t.assert(placed === "minecraft:red_candle", `the replacement candle stands (${placed})`);
    t.assert(candles().length === 1, `the chapel holds exactly the one new candle (${candles().length})`);
    t.check(nativeCount(p, "minecraft:red_candle", r0) === 1, `the server fired one playerPlaceBlock event for the red candle (${nativeCount(p, "minecraft:red_candle", r0)})`);
    t.log("CASE D REPLAY: four taps on that one candle (every tap counts toward the 4, as the hint says)");
    for (let i = 0; i < 3; i++) await tap(p, spot);
    t.check(!(await waitDone(p, re, r0, 20)), "D: three taps on the new candle are not four");
    await tap(p, spot);
    done.candle = await waitDone(p, re, r0);
    t.check(done.candle, `D: the fourth tap on the one placed candle finishes "Light 4 candles in the Old Chapel" (${t.messages(p, { since: r0, kind: "chat" }).map((m) => m.plain).filter(Boolean).slice(-4).join(" | ")})`);

    // Informational, after the step is done so it cannot change a count: what a native item use on the candle fires.
    const u0 = nativeUse.length;
    p.getComponent("minecraft:inventory").container.setItem(p.selectedSlotIndex, new ItemStack("minecraft:flint_and_steel", 1));
    p.teleport({ x: spot.x + 0.5, y: base.y + 1, z: spot.z - 1.5 }, { dimension: t.dimension });
    await t.wait(3);
    p.useItemInSlotOnBlock(p.selectedSlotIndex, spot, Direction.Up);
    await t.wait(5);
    p.stopInteracting();
    const onCandle = nativeUse.slice(u0).filter((e) => e.name === p.name && /candle/.test(e.type));
    t.log(`NATIVE playerInteractWithBlock on the candle: ${onCandle.length} event(s), isFirstEvent ${JSON.stringify(onCandle.map((e) => e.first))}; saga_bp counts only isFirstEvent true, so the taps above are REPLAYS of the real handler, not native taps`);
  }

  t.log(`summary: fence ${done.fence}, planks ${done.planks}, bamboo sapling ${done.Bamboo}, poplar sapling ${done.Poplar}, replacement candle ${done.candle}`);
}
