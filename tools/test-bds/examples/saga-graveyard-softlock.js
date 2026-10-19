// Story Questlines: the Signs in the Sky softlock (the "What Moss Saw" chapter: inspect four clues in the Old Graveyard while
// zombies rise). A clue used to open a form by itself, in the middle of the fight; the form had no way out (no death,
// respawn, dimension or leave handling, no time limit), a leave cleaned the lock but nothing else did, and an old operation's
// finally could clear a newer one's lock. Now a clue is a chat line only, and every form and lock belongs to one operation that
// ends at once when the player dies, respawns, changes dimension, leaves, or after 90 seconds (FORM_TICKS).
// Needs the hook copy of saga_bp (tools/test-bds/hooks/saga-softlock-rvtest.js appended to a test copy of objectives.js;
// stage-saga-softlock.mjs builds it from any packs folder, so the same scenario runs on a before-the-fix checkout). The
// suite runs the recipe below; on Windows or without bash, stage it directly (stage-saga-softlock.mjs <dir>) and use run.mjs
// with --packs <dir>. About 3 minutes (one case waits out the 90 second limit); needs the End for the dimension case.
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
  const FORM_TICKS = 1800; // saga_bp util.js FORM_TICKS
  t.formTimeout = FORM_TICKS + 800; // the harness shim would close an unanswered form this late: the pack must act first
  t.server("/time set midnight");
  t.server("/gamerule doDaylightCycle false");
  t.server("/gamerule doMobSpawning false");
  t.server(`/tickingarea add circle ${X} 0 ${Z} 4 sgs_yard true`);
  await t.loadArea(X, Z, { radius: 2 });
  await t.wait(40);

  const send = (id, m = {}) => sys.sendScriptEvent(id, JSON.stringify(m));
  const inbox = { state: [], done: [], raw: [], offers: [], pong: undefined };
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      try {
        const m = JSON.parse(message || "{}");
        if (id === "sgs:state_r") inbox.state.push(m);
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
  await t.wait(20);
  t.cmd(p, "/realm:saga_place graveyard");
  await t.wait(20);
  send("realm:saga_debug", { player: p.id, action: "jump", story: "act1_signs", chapter: "graves" });
  await t.wait(5);
  send("realm:npc_talk", { player: p.id, npc: "moss", req: "sg1" });
  await t.wait(4);
  t.assert(inbox.offers.some((o) => o.req === "sg1" && o.key === "start:act1_signs"), "Moss offers What Moss Saw");
  const accept = (async () => {
    for (;;) {
      const f = await t.waitForm(p, { timeout: 200 });
      if (f.buttons.some((b) => /^next$/i.test(b))) f.answer("Next");
      else return f.answer("Accept");
    }
  })();
  send("realm:npc_choose", { pack: "saga_bp", player: p.id, key: "start:act1_signs" });
  await accept;
  await t.waitMessage(p, /Search the Old Graveyard/, { since: t.tick - 40, timeout: 200 });
  const ready = await t.waitUntil(async () => {
    const s = await ask(who);
    return s.spots?.filter(Boolean).length === 4 ? s : undefined;
  }, { timeout: 200, interval: 20, message: "the four clue spots are worked out" });
  const spots = ready.spots;
  const under = (s) => ({ x: Math.floor(s.x), y: Math.floor(s.y) - 1, z: Math.floor(s.z) });
  const clueMessages = (since) => t.messages(p, { since }).filter((m) => /\[Clue \d\/4\]/.test(m.plain));
  const forms0 = t.forms(p).length;

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

  // ---- 2. the owner's path: zombies closing in, a clue found by walking up to it, then dying ----------------------------
  const zombies = [];
  const at1 = { x: spots[1].x, y: spots[1].y - 0.5, z: spots[1].z };
  p.teleport(at1);
  await t.wait(10);
  for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6]]) zombies.push(t.dimension.spawnEntity("minecraft:zombie", { x: at1.x + dx, y: at1.y, z: at1.z + dz }));
  since = t.tick;
  await poll(() => clueMessages(since).length > 0, 80);
  const discovered = clueMessages(since).length;
  p.getComponent("minecraft:health").setCurrentValue(2);
  let killer = "a zombie's hit";
  await poll(() => p.getComponent("minecraft:health").currentValue <= 0, 240);
  if (p.getComponent("minecraft:health").currentValue > 0) {
    killer = "SimulatedPlayer.kill() (no zombie hit landed)";
    p.kill();
  }
  await t.wait(15);
  for (const z of zombies) if (z.isValid) z.remove();
  s = await ask(who);
  lifecycle("zombie death", s.native.die > 0 ? "NATIVE" : "WATCHDOG", discovered > 0 && s.health <= 0 && !s.busy && t.forms(p).length === forms0, `clue found by walking up ${discovered > 0}, killed by ${killer}, health ${s.health}, busy ${s.busy}, forms opened ${t.forms(p).length - forms0}, native entityDie ${s.native.die}`);
  p.respawn();
  await t.wait(40);
  s = await ask(who);
  lifecycle("respawn", s.native.respawn > 0 ? "NATIVE" : "WATCHDOG", s.health > 0 && !s.busy, `health ${s.health}, busy ${s.busy}, native playerSpawn(respawn) ${s.native.respawn}, saved bits ${s.bits}`);
  since = t.tick;
  send("sgs:tap", { ...who, ...under(spots[2]) });
  const third = await poll(() => clueMessages(since)[0], 60);
  await t.wait(20);
  s = await ask(who);
  lifecycle("after respawn", "n/a", !!third && s.progress >= 2 && !s.busy && t.forms(p).length === forms0, `a clue still counts after respawning: progress ${s.progress}, forms ${t.forms(p).length - forms0}`);

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
  try {
    form.answer("OK"); // the harness answers late: the pack must not act on it
  } catch (e) {
    t.log(`late answer was refused by the harness: ${e}`);
  }
  await t.wait(20);
  lifecycle("late answer", "n/a", inbox.done.filter((d) => d.key === "death").length === 1, "an answer after the pack gave up changes nothing");

  // dimension change with the form open
  form = await openHold("dimension");
  t.server("/execute in the_end run tickingarea add circle 100 0 0 2 sgs_end true");
  await t.wait(40);
  t.server("/execute in the_end run fill 98 48 -2 102 48 2 obsidian");
  p.addEffect("resistance", 1200, { amplifier: 4, showParticles: false });
  p.addEffect("slow_falling", 1200, { showParticles: false });
  mark = t.tick;
  p.teleport({ x: 100.5, y: 50, z: 0.5 }, { dimension: t.world.getDimension("the_end") });
  end = await poll(() => doneOf("dimension", mark), 60);
  s = await ask(who);
  lifecycle("dimension", s.native.dimension > 0 ? "NATIVE" : "WATCHDOG", end?.result === "undefined" && end.tick - mark <= 20 && !s.busy && !form.answered, `ended ${end ? end.tick - mark : "never"} ticks after the change (result ${end?.result}), busy ${s.busy}, native playerDimensionChange ${s.native.dimension}`);
  p.teleport({ x: X + 0.5, y: spots[0].y, z: Z + 0.5 }, { dimension: t.dimension });
  await t.wait(40);

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

  // the form nobody answers: the pack gives up after FORM_TICKS, before the harness's own fallback (last: it waits 90 s)
  const t0 = t.tick;
  const idle = await openHold("timeout");
  await t.wait(FORM_TICKS - 100 - (t.tick - t0));
  s = await ask(who);
  t.check(s.busy === true && !doneOf("timeout"), "timeout: still within its lifetime 100 ticks early");
  end = await poll(() => doneOf("timeout"), 220);
  s = await ask(who);
  lifecycle("timeout", "WATCHDOG", end?.result === "undefined" && end.tick - t0 >= FORM_TICKS - 20 && end.tick - t0 < t.formTimeout && !s.busy && !idle.answered, `gave up after ${end ? end.tick - t0 : "never"} ticks (limit ${FORM_TICKS}, harness fallback ${t.formTimeout}), busy ${s.busy}, harness form unanswered ${!idle.answered}`);

  for (const l of lines) t.log(l);
  t.log(`native events seen by the hook: ${JSON.stringify(s.native)}`);
}
