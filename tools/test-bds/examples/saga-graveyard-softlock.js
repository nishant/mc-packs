// Story Questlines: the Signs in the Sky softlock (the "What Moss Saw" chapter: inspect four clues in the Old Graveyard while
// zombies rise). A clue used to open a form by itself, in the middle of the fight; the form had no way out (no death,
// respawn, dimension or leave handling, no time limit), a leave cleaned the lock but nothing else did, and an old operation's
// finally could clear a newer one's lock. Now a clue is a chat line only, and every form and lock belongs to one operation that
// ends at once when the player dies, respawns, changes dimension, leaves, or after 45 seconds (FORM_TICKS = 900 ticks).
// The harness shim has its own 1200-tick fallback that answers an unanswered simulated form with UserClosed: the pack's limit
// is under it so the timeout case can tell the pack's recovery (the hold ends with "undefined") from the shim's ("canceled").
// Needs the hook copy of saga_bp (tools/test-bds/hooks/saga-softlock-rvtest.js appended to a test copy of objectives.js;
// stage-saga-softlock.mjs builds it from any packs folder, so the same scenario runs on a before-the-fix checkout). The
// suite runs the recipe below; on Windows or without bash, stage it directly (stage-saga-softlock.mjs <dir>) and use run.mjs
// with --packs <dir>. About 3 minutes (one case waits out the 45 second limit); needs the End for the dimension cases.
//   mkdir -p '/tmp/sgs' && node tools/test-bds/hooks/stage-saga-softlock.mjs '/tmp/sgs'
//   node tools/test-bds/run.mjs --quiet --flat --packs '/tmp/sgs' --scenario tools/test-bds/examples/saga-graveyard-softlock.js --timeout 600
// Evidence kinds, printed as LIFECYCLE lines: NATIVE = the server fired the event (entityDie, playerSpawn,
// playerDimensionChange, playerLeave: counted by the hook's own subscriptions), WATCHDOG = the pack noticed by itself (a simulated
// player's death fires no entityDie), SYNTHETIC = the hook called the pack's cancel function (sgs:cancel). Taps are the real
// touchedAt handler called directly: empty-hand taps of simulated players fire no interact event. No pixels: the frozen
// camera and the respawn screen are the owner's client, never headless proof.
export default async function (t) {
  const sys = t.system;
  const X = 900;
  const Z = 900;
  const FORM_TICKS = 900; // saga_bp util.js FORM_TICKS
  const SHIM_TICKS = 1200; // tools/test-bds/lib/shim.js: an unanswered simulated form is closed with UserClosed after this
  t.formTimeout = SHIM_TICKS + 200; // the harness's own close must not come first either
  t.server("/time set midnight");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  t.server("/gamerule keepinventory true"); // a death must not change levels or the lantern: the stale-report guard reads them
  t.server(`/tickingarea add circle ${X} 0 ${Z} 4 sgs_yard true`);
  await t.loadArea(X, Z, { radius: 2 });
  // The End is ready (loaded, with a platform) before any form is open: the dimension cases must not wait on a cold dimension.
  const endDim = t.world.getDimension("the_end");
  t.server("/execute in the_end run tickingarea add circle 100 0 0 2 sgs_end true");
  await t.waitUntil(() => endDim.getBlock({ x: 100, y: 48, z: 0 }), { timeout: 400, interval: 10, message: "the End chunk at 100, 0 is loaded" });
  t.server("/execute in the_end run fill 98 48 -2 102 48 2 obsidian");
  await t.wait(40);

  const send = (id, m = {}) => sys.sendScriptEvent(id, JSON.stringify(m));
  const inbox = { state: [], digest: [], done: [], raw: [], offers: [], pong: undefined };
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        const m = JSON.parse(message || "{}");
        if (id === "sgs:state_r") inbox.state.push(m);
        else if (id === "sgs:digest_r") inbox.digest.push(m);
        else if (id === "sgs:hold_done") inbox.done.push({ tick: sys.currentTick, ...m });
        else if (id === "sgs:holdraw_done") inbox.raw.push({ tick: sys.currentTick, ...m });
        else if (id === "sgs:pong") inbox.pong = m;
        else if (id === "realm:npc_offer") inbox.offers.push(m);
      } catch {}
    },
    { namespaces: ["sgs", "realm"] },
  );
  let seq = 0;
  const ask = async (ref) => {
    const n = ++seq;
    send("sgs:state", { ...ref, seq: n });
    return t.waitUntil(() => inbox.state.find((r) => r.seq === n), { timeout: 60, message: "the hook answers sgs:state" });
  };
  /** Polls without failing the scenario: the answer or undefined (so every case reports, on the old source too). */
  const poll = async (fn, ticks) => {
    for (let k = 0; k < ticks; k += 2) {
      const v = fn();
      if (v) return v;
      await t.wait(2);
    }
    return fn();
  };
  const doneOf = (key, since = 0) => inbox.done.find((d) => d.key === key && d.tick >= since);
  const lines = [];
  const lifecycle = (name, kind, ok, detail) => {
    lines.push(`LIFECYCLE ${name.padEnd(14)} ${kind.padEnd(9)} ${ok ? "ok" : "FAIL"} ${detail}`);
    t.check(ok, `${name}: ${detail}`);
  };

  send("sgs:ping");
  await t.waitUntil(() => inbox.pong, { timeout: 60, message: "the saga_bp hook copy answers sgs:ping (build it with stage-saga-softlock.mjs)" });
  t.log(`hook copy: ${inbox.pong.cancel ? "fixed source (cancelInteractions present)" : "source before the fix (no cancelInteractions)"}`);

  // ---- the chapter: What Moss Saw, at a graveyard place where the player stands ------------------------------------
  let p = await t.player("Searcher", { op: true, x: X, z: Z, gameMode: "survival" });
  let who = { name: p.name, id: p.id };
  const home = { x: p.location.x, y: p.location.y, z: p.location.z };
  await t.wait(20);
  t.cmd(p, "/realm:saga_place graveyard");
  await t.wait(20);
  send("realm:saga_debug", { player: p.id, action: "jump", story: "act1_signs", chapter: "graves" });
  await t.wait(5);

  const digest = async () => {
    const n = ++seq;
    send("sgs:digest", { ...who, seq: n });
    return t.waitUntil(() => inbox.digest.find((d) => d.seq === n), { timeout: 60, message: "the hook answers sgs:digest" });
  };
  let offers = 0;
  /** Opens a production dialogue from Moss (an offer key) and pages on to its last page, left unanswered; returns that form. */
  const openDialog = async (key) => {
    const req = `sg${++offers}`;
    send("realm:npc_talk", { player: p.id, npc: "moss", req });
    await t.wait(4);
    const offered = inbox.offers.filter((o) => o.req === req).map((o) => o.key);
    t.assert(offered.includes(key), `Moss offers ${key} (offers for ${req}: ${JSON.stringify(offered)})`);
    let next = t.waitForm(p, { timeout: 200 });
    send("realm:npc_choose", { pack: "saga_bp", player: p.id, key });
    let f = await next;
    while (f.buttons.some((b) => /^next$/i.test(b))) {
      next = t.waitForm(p, { timeout: 200 });
      f.answer("Next");
      f = await next;
    }
    return f;
  };
  /** SYNTHETIC fixture reset, never production recovery: a debug jump back to the chapter, run only AFTER a probe has been recorded, so a stale accept that WAS applied on the old source can't hide the later probes. */
  const resetChapter = async () => {
    t.log("SYNTHETIC fixture reset: debug jump to What Moss Saw");
    send("realm:saga_debug", { player: p.id, action: "jump", story: "act1_signs", chapter: "graves" });
    await t.wait(5);
  };
  const openIntro = async () => {
    await resetChapter();
    return openDialog("start:act1_signs");
  };
  /** What a stale write would change, compared before and after the late answer. */
  const same = (a, b) => a.hash === b.hash && a.crowns === b.crowns && a.level === b.level && a.lanterns === b.lanterns;
  const moved = (a, b) => `state ${a.hash === b.hash ? "unchanged" : `CHANGED ${a.st} -> ${b.st}`}, Crowns ${a.crowns} -> ${b.crowns}, levels ${a.level} -> ${b.level}, lanterns ${a.lanterns} -> ${b.lanterns}`;
  /**
   * The production accept path (startChapter -> accept: chapter state, flags, choices, Crowns) with its dialogue cut and
   * the Accept answered late by the harness: no state, flag, choice, progress or Crowns may change, and the chapter is
   * not accepted.
   */
  const staleAccept = async (name, kindOf, cut, restore) => {
    const f = await openIntro();
    const before = await digest();
    const from = t.tick;
    await cut();
    await t.wait(40);
    const mid = await ask(who);
    try {
      f.answer("Accept");
    } catch (e) {
      t.log(`${name}: the harness refused the late answer: ${e}`);
    }
    await t.wait(40);
    const after = await digest();
    const said = t.messages(p, { since: from }).some((m) => /Signs in the Sky: What Moss Saw/.test(m.plain));
    lifecycle(name, kindOf(mid.native), !mid.busy && same(before, after) && !after.accepted && !said, `busy after the cut ${mid.busy}, ${moved(before, after)}, accepted ${after.accepted}, accept line in chat ${said}`);
    await restore();
  };
  /**
   * The production REPORT path (endChapter: outro, choice, rewards, chapter done) with its dialogue cut and Finish
   * answered late. The chapter is accepted through the real intro and both objectives are completed with the debug bump
   * action (SYNTHETIC setup, disclosed); the old source pays the Crowns, levels, lantern and codex and completes the
   * chapter, the fixed source changes nothing.
   */
  const staleReport = async (name, kindOf, cut, restore) => {
    (await openIntro()).answer("Accept");
    await t.wait(30);
    t.log(`${name}: SYNTHETIC setup, objectives completed with the debug bump action`);
    send("realm:saga_debug", { player: p.id, action: "bump", story: "act1_signs", i: 0, n: 4 });
    send("realm:saga_debug", { player: p.id, action: "bump", story: "act1_signs", i: 1, n: 6 });
    await t.wait(10);
    const f = await openDialog("end:act1_signs");
    t.check(f.buttons.some((b) => /finish/i.test(b)), `${name}: the report dialogue ends on a Finish button (${JSON.stringify(f.buttons)})`);
    const before = await digest();
    await cut();
    await t.wait(40);
    const mid = await ask(who);
    try {
      f.answer("Finish");
    } catch (e) {
      t.log(`${name}: the harness refused the late answer: ${e}`);
    }
    await t.wait(40);
    const after = await digest();
    lifecycle(name, kindOf(mid.native), !mid.busy && same(before, after) && !after.done, `busy after the cut ${mid.busy}, ${moved(before, after)}, chapter done ${after.done}`);
    await restore();
  };
  const toEnd = () => {
    p.addEffect("resistance", 1200, { amplifier: 4, showParticles: false });
    p.addEffect("slow_falling", 1200, { showParticles: false });
    p.teleport({ x: 100.5, y: 50, z: 0.5 }, { dimension: endDim });
  };
  const backHome = async () => {
    p.teleport(home, { dimension: t.dimension });
    await t.wait(40);
  };
  await staleAccept("stale accept/die", (n) => (n.die > 0 ? "NATIVE" : "WATCHDOG"), async () => p.kill(), async () => {
    p.respawn();
    await t.wait(40);
    await backHome();
  });
  await staleAccept("stale accept/dim", (n) => (n.dimension > 0 ? "NATIVE" : "WATCHDOG"), async () => toEnd(), backHome);
  const die = async () => p.kill();
  const afterDeath = async () => {
    p.respawn();
    await t.wait(40);
    await backHome();
  };
  await staleReport("stale report/die", (n) => (n.die > 0 ? "NATIVE" : "WATCHDOG"), die, afterDeath);
  await staleReport("stale report/dim", (n) => (n.dimension > 0 ? "NATIVE" : "WATCHDOG"), async () => toEnd(), backHome);

  // The real accept, once nothing stale is left.
  const sinceAccept = t.tick;
  const intro = await openIntro();
  intro.answer("Accept");
  await t.waitMessage(p, /Search the Old Graveyard/, { since: sinceAccept, timeout: 200 });
  const ready = await t.waitUntil(async () => {
    const s = await ask(who);
    return s.spots?.filter(Boolean).length === 4 ? s : undefined;
  }, { timeout: 200, interval: 20, message: "the four clue spots are worked out" });
  const spots = ready.spots;
  const under = (s) => ({ x: Math.floor(s.x), y: Math.floor(s.y) - 1, z: Math.floor(s.z) });
  const clueMessages = (since) => t.messages(p, { since }).filter((m) => /\[Clue \d\/4\]/.test(m.plain));
  const forms0 = t.forms(p).length;
  /** Every damage event the player took: who dealt it and how, so the zombie case can tell a real hit from injected damage. */
  const hurts = [];
  t.world.afterEvents.entityHurt.subscribe(({ hurtEntity, damage, damageSource }) => {
    try {
      if (hurtEntity.typeId === "minecraft:player") hurts.push({ tick: sys.currentTick, damage, cause: damageSource.cause, by: damageSource.damagingEntity?.typeId });
    } catch {}
  });
  /**
   * SYNTHETIC reset, OLD SOURCE ONLY and never production recovery: after a probe's failure has been recorded, closes the
   * forms the old source leaked and clears its stuck lock so the next independent probe can run. The fixed source gets no
   * such cleanup: a leak there must fail the next probe.
   */
  const syntheticReset = async (why) => {
    if (inbox.pong.cancel) return;
    const open = t.forms(p).filter((f) => !f.answered);
    const st = await ask(who);
    if (!open.length && !st.busy) return;
    t.log(`SYNTHETIC reset (old source only, not production recovery) after ${why}: ${open.length} unanswered form(s) closed, busy ${st.busy} cleared with sgs:cancel`);
    for (const f of open) {
      try {
        f.answer(null);
      } catch (e) {
        t.log(`${why}: the harness refused to close a leaked form: ${e}`);
      }
    }
    await t.wait(5);
    send("sgs:cancel", who);
    await t.wait(5);
  };

  // ---- 1. unrelated ground does nothing; a tap next to a real clue finds it; chat keeps the whole text; no form ---------
  let since = t.tick;
  send("sgs:tap", { ...who, x: X + 25, y: Math.floor(spots[0].y) - 1, z: Z + 25 });
  await t.wait(30);
  let s = await ask(who);
  lifecycle("unrelated tap", "n/a", s.bits === 0 && clueMessages(since).length === 0 && !s.busy && t.forms(p).length === forms0, `bits ${s.bits}, clue lines ${clueMessages(since).length}, busy ${s.busy}, forms ${t.forms(p).length - forms0}`);
  since = t.tick;
  send("sgs:tap", { ...who, ...under(spots[0]) });
  const first = await poll(() => clueMessages(since)[0], 60);
  await t.wait(40);
  s = await ask(who);
  lifecycle("clue tap", "n/a", !!first && /carried something heavy/.test(first.plain) && s.bits === 1 && s.progress === 1 && !s.busy && t.forms(p).length === forms0, `chat ${first ? "has the whole clue" : "missing"}, bits ${s.bits}, progress ${s.progress}, busy ${s.busy}, forms ${t.forms(p).length - forms0}`);
  send("sgs:tap", { ...who, ...under(spots[0]) });
  await t.wait(20);
  lifecycle("clue again", "n/a", clueMessages(since).length === 1 && (await ask(who)).progress === 1, "the same clue is not counted twice");
  await syntheticReset("the clue tap");

  // ---- 2. the owner's path: zombies closing in, a clue found by walking up to it, a real zombie hit, dying ---------------
  // Fixture-owned state first: the End probes left resistance and slow falling on the player, and nothing may keep a zombie from hurting them.
  p.removeEffect("resistance");
  p.removeEffect("slow_falling");
  try {
    p.setGameMode(t.mc.GameMode.Survival);
  } catch (e) {
    t.log(`could not restore Survival: ${e}`);
  }
  t.server("/difficulty normal");
  const zombies = [];
  const at1 = { x: spots[1].x, y: spots[1].y - 0.5, z: spots[1].z };
  const fz = t.forms(p).length;
  since = t.tick; // before the teleport: the walk-up can find the clue at once
  p.teleport(at1);
  for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3]]) zombies.push(t.dimension.spawnEntity("minecraft:zombie", { x: at1.x + dx, y: at1.y, z: at1.z + dz }));
  await poll(() => clueMessages(since).length > 0, 80);
  const discovered = clueMessages(since).length;
  const dieBefore = (await ask(who)).native.die;
  p.getComponent("minecraft:health").setCurrentValue(2);
  const hurtFrom = hurts.length;
  const zombieHit = () => hurts.slice(hurtFrom).find((h) => h.by === "minecraft:zombie");
  let killer = "NATURAL zombie melee";
  await poll(() => zombieHit(), 400);
  if (!zombieHit()) {
    // The simulated player did not get hit by the zombie AI in time: labelled, real zombie as the damaging entity, no natural melee claimed.
    killer = "INJECTED applyDamage(entityAttack, damagingEntity: a real zombie)";
    p.applyDamage(2, { cause: t.mc.EntityDamageCause.entityAttack, damagingEntity: zombies.find((z) => z.isValid) });
  }
  await poll(() => p.getComponent("minecraft:health").currentValue <= 0, 60);
  if (p.getComponent("minecraft:health").currentValue > 0) {
    killer += " + SimulatedPlayer.kill() (the damage did not kill)";
    p.kill();
  }
  await t.wait(15);
  for (const z of zombies) if (z.isValid) z.remove();
  s = await ask(who);
  const hit = zombieHit();
  lifecycle("zombie death", s.native.die > dieBefore ? "NATIVE" : "WATCHDOG", discovered > 0 && !!hit && s.health <= 0 && !s.busy && t.forms(p).length === fz, `clue found by walking up ${discovered > 0}, ${killer}, damage event ${hit ? `${hit.cause} ${hit.damage} by ${hit.by}` : "NONE"}, health ${s.health}, busy ${s.busy}, forms opened ${t.forms(p).length - fz}, native entityDie +${s.native.die - dieBefore}`);
  p.respawn();
  await t.wait(40);
  s = await ask(who);
  lifecycle("respawn", s.native.respawn > 0 ? "NATIVE" : "WATCHDOG", s.health > 0 && !s.busy, `health ${s.health}, busy ${s.busy}, native playerSpawn(respawn) ${s.native.respawn}, saved bits ${s.bits}`);
  const fr = t.forms(p).length;
  since = t.tick;
  send("sgs:tap", { ...who, ...under(spots[2]) });
  const third = await poll(() => clueMessages(since)[0], 60);
  await t.wait(20);
  s = await ask(who);
  lifecycle("after respawn", "n/a", !!third && s.progress >= 2 && !s.busy && t.forms(p).length === fr, `a clue still counts after respawning: progress ${s.progress}, forms ${t.forms(p).length - fr}`);
  await syntheticReset("the zombie death and respawn");

  // ---- 3. an open form of ours when the player dies, changes dimension or leaves ------------------------------------
  /** Opens the production probe form (exclusive + show) and returns the harness's form, left unanswered. */
  const openHold = async (key) => {
    const w = t.waitForm(p, { timeout: 80 });
    send("sgs:hold", { ...who, key });
    const form = await w;
    const held = await ask(who);
    t.check(held.busy === true, `${key}: the open form holds the busy lock`);
    return form;
  };

  // death with the form open (the respawn screen is hidden behind a form in the owner's report)
  let form = await openHold("death");
  p.kill();
  let mark = t.tick;
  let end = await poll(() => doneOf("death"), 60);
  s = await ask(who);
  lifecycle("death+form", s.native.die > 0 ? "NATIVE" : "WATCHDOG", end?.result === "undefined" && end.tick - mark <= 20 && !s.busy && !form.answered, `pack ended it ${end ? end.tick - mark : "never"} ticks after the death (result ${end?.result}), busy ${s.busy}, harness form still unanswered ${!form.answered}, native entityDie ${s.native.die}`);
  p.respawn();
  await t.wait(40);
  await backHome();
  await syntheticReset("the death with an open form");

  // dimension change with the form open (the End is already loaded and has its platform)
  form = await openHold("dimension");
  mark = t.tick;
  toEnd();
  end = await poll(() => doneOf("dimension", mark), 60);
  s = await ask(who);
  lifecycle("dimension", s.native.dimension > 0 ? "NATIVE" : "WATCHDOG", end?.result === "undefined" && end.tick - mark <= 20 && !s.busy && !form.answered, `ended ${end ? end.tick - mark : "never"} ticks after the change (result ${end?.result}), busy ${s.busy}, native playerDimensionChange ${s.native.dimension}`);
  await backHome();
  await syntheticReset("the dimension change with an open form");

  // UserBusy retries after a moment, UserClosed does not open it again
  const busyForm = await openHold("busy-closed");
  const again = t.waitForm(p, { timeout: 60 });
  busyForm.answer("busy");
  const second = await again;
  const formsAfterBusy = t.forms(p).length;
  second.answer(null);
  end = await poll(() => doneOf("busy-closed"), 40);
  await t.wait(40);
  s = await ask(who);
  lifecycle("busy/closed", "n/a", end?.result === "canceled:UserClosed" && t.forms(p).length === formsAfterBusy && !s.busy, `UserBusy opened a second form, UserClosed ended it (${end?.result}) and no third opened (${t.forms(p).length - formsAfterBusy}), busy ${s.busy}`);

  // an old operation's finally cannot release a newer lock; a stale cancel leaves no lock behind
  send("sgs:holdraw", { ...who, key: "A" });
  await t.wait(5);
  const heldA = await ask(who);
  send("sgs:cancel", who);
  await t.wait(3);
  const clearedA = await ask(who);
  const formB = await openHold("B");
  send("sgs:release", { key: "A" });
  await poll(() => inbox.raw.find((r) => r.key === "A"), 20);
  await t.wait(5);
  s = await ask(who);
  lifecycle("old vs new", "SYNTHETIC", heldA.busy === true && clearedA.busy === false && s.busy === true, `A held ${heldA.busy}, cancel cleared ${!clearedA.busy}, B's lock survives A's finally ${s.busy}`);
  formB.answer("OK");
  end = await poll(() => doneOf("B"), 40);
  s = await ask(who);
  lifecycle("second use", "n/a", end?.result === "selection:0" && !s.busy, `the newer interaction still works: ${end?.result}, busy after ${s.busy}`);

  // leave with the form open, then rejoin: the old id is clean before the new one appears
  const leaveForm = await openHold("leave");
  const oldId = p.id;
  p.disconnect();
  end = await poll(() => doneOf("leave"), 60);
  const gone = await ask({ id: oldId });
  lifecycle("leave", gone.native.leave > 0 ? "NATIVE" : "WATCHDOG", end?.result === "undefined" && gone.busy === false && !leaveForm.answered, `old id ${oldId.slice(0, 8)} busy ${gone.busy} before anyone rejoins (hold result ${end?.result}), native playerLeave ${gone.native.leave}`);
  p = await t.player("Searcher", { op: true, x: X, z: Z, gameMode: "survival" });
  who = { name: p.name, id: p.id };
  await t.wait(20);
  const before = await ask({ id: oldId });
  const fresh = await openHold("rejoin");
  fresh.answer("OK");
  end = await poll(() => doneOf("rejoin"), 40);
  s = await ask(who);
  lifecycle("rejoin", "n/a", p.id !== oldId && before.busy === false && end?.result === "selection:0" && !s.busy, `new id ${p.id.slice(0, 8)} differs from ${oldId.slice(0, 8)} ${p.id !== oldId}, old id busy ${before.busy}, the new player's dialogue works (${end?.result})`);

  // the form nobody answers: the pack gives up after FORM_TICKS, before the shim's own 1200-tick fallback (last: it waits 45 s)
  const t0 = t.tick;
  const idle = await openHold("timeout");
  await t.wait(FORM_TICKS - 100 - (t.tick - t0));
  s = await ask(who);
  t.check(s.busy === true && !doneOf("timeout"), "timeout: still within its lifetime 100 ticks early");
  end = await poll(() => doneOf("timeout"), 220);
  s = await ask(who);
  // The hold ends with "undefined" when the PACK gave up and with "canceled:UserClosed" when the shim's fallback came first.
  lifecycle("timeout", "WATCHDOG", end?.result === "undefined" && end.tick - t0 >= FORM_TICKS - 20 && end.tick - t0 < SHIM_TICKS && !s.busy && !idle.answered, `gave up after ${end ? end.tick - t0 : "never"} ticks with result ${end?.result} (pack limit ${FORM_TICKS}, shim fallback ${SHIM_TICKS}), busy ${s.busy}`);

  for (const l of lines) t.log(l);
  t.log(`native events seen by the hook: ${JSON.stringify(s.native)}`);
}
