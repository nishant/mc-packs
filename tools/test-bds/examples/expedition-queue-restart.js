// F28: the expedition line survives a real server restart. Phase 1: Ann's run takes the only dungeon (slots 1), Bob
// waits in line, and the line is saved. The server stops, which disconnects both players first: before the leave grace
// (QUEUE_GONE) the leave handler dropped Bob and saved the line empty, so nothing was left to restore. Phase 2, after
// the restart: the saved line still holds Bob, read back as a restored entry. A simulated player gets a new id every
// spawn, so a harness-only probe in a copy of the pack (tools/test-bds/hooks/expedition-queue-rejoin.mjs) moves Bob's
// entry onto his new id and runs the pack's own rejoin step: he is told he is still in line, and his run starts by
// itself once Ann's old dungeon is filled in. The probe uses no part of the fix, so the same recipe runs the code from
// before it (a source tree as the hook's second argument), which fails at "the saved line survived the restart".
//   rm -rf /tmp/exp-queue-restart && mkdir -p /tmp/exp-queue-restart
//   node tools/test-bds/hooks/expedition-queue-rejoin.mjs /tmp/exp-queue-restart/packs
//   node tools/test-bds/run.mjs --quiet --flat --packs /tmp/exp-queue-restart/packs --only expedition_bp --scenario tools/test-bds/examples/expedition-queue-restart.js --timeout 900
const K = "harness:exp_queue_restart";
const load = (t) => JSON.parse(String(t.world.getDynamicProperty(K) ?? "{}"));
const save = (t, v) => t.world.setDynamicProperty(K, JSON.stringify(v));

export default async function (t) {
  t.formTimeout = 300;
  const reports = new Map();
  t.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "harness:exp_queue_report") return;
    try {
      const r = JSON.parse(message);
      reports.set(r.id, r);
    } catch {}
  });
  let seq = 0;
  const probe = async (body) => {
    const id = `eq-${t.phase}-${++seq}`;
    await t.console(`scriptevent harness:exp_queue_probe ${JSON.stringify({ id, ...body })}`);
    return t.waitUntil(() => reports.get(id), { timeout: 60, message: "the probe in Expeditions answered" });
  };

  if (t.phase === 1) {
    const ann = await t.player("Ann", { op: true });
    const sx = Math.floor(ann.location.x) + 300;
    const sz = Math.floor(ann.location.z);
    await t.loadArea(sx, sz, { radius: 4 });
    t.assert(t.cmd(ann, `/realm:expedition_site ${sx} ${sz}`).ok, "site");
    await t.waitMessage(ann, /site set/i, { timeout: 200 });
    const bob = await t.player("Bob", { x: Math.floor(ann.location.x) + 4, z: sz });
    t.answerForm(ann, "Start an expedition", "Crypt", 0, "Start");
    t.cmd(ann, "/realm:expedition");
    await t.waitUntil(async () => ((await state(t))?.phase === "active" ? true : undefined), { timeout: 1200, interval: 20, message: "run active" });
    const queuedAt = t.tick;
    t.answerForm(bob, "Start an expedition", "Crypt", 0, "Wait for a dungeon");
    t.cmd(bob, "/realm:expedition");
    await t.waitMessage(bob, /number 1 of 1 in line/i, { timeout: 200, since: queuedAt });
    await t.wait(10);
    const report = await probe({ report: true });
    t.log("phase 1:", JSON.stringify(report));
    t.check(!report.error && report.saved.length === 1 && report.saved[0][0] === bob.id, `the line is saved with Bob (${JSON.stringify(report)})`);
    save(t, { bob: bob.id, sx, sz });
    t.assert(t.failures.length === 0, `phase 1: ${t.failures.length} failed checks`);
    t.restart("Bob waiting in line; restarting");
    return;
  }

  const kept = load(t);
  t.assert(typeof kept.bob === "string", `Bob's phase-1 id was kept (${kept.bob})`);
  // Before anyone joins: what the world load read back.
  const first = await probe({ report: true });
  t.log("after the restart:", JSON.stringify(first));
  t.check(!first.error && first.saved.some((e) => e[0] === kept.bob), `the saved line survived the restart (${JSON.stringify(first.saved)})`);
  t.check(Array.isArray(first.line) && first.line.length === 1 && first.line[0][0] === kept.bob && first.line[0][2] === 1, `Bob is back in line as a restored entry (${JSON.stringify(first.line)})`);
  await t.loadArea(kept.sx, kept.sz, { radius: 4 });
  const bob = await t.player("Bob");
  const since = t.tick;
  const after = await probe({ rejoin: "Bob", from: kept.bob });
  t.log("after the rejoin:", JSON.stringify(after));
  t.check(!after.error && after.line?.[0]?.[0] === bob.id && after.line[0][2] === 0, `Bob's place is his again (${JSON.stringify(after)})`);
  await t.waitMessage(bob, /realm restarted and you're still number 1 of 1 in line/i, { timeout: 100, since });
  const run = await t.waitUntil(async () => {
    const s = await state(t);
    return s?.phase === "active" && s.members?.includes("Bob") ? s : undefined;
  }, { timeout: 2400, interval: 20, message: "Bob's queued expedition starts once Ann's old dungeon is filled in" });
  t.check(run.members.length === 1, `the run is Bob's alone (${run.members.join(", ")})`);
  t.check(t.messages(bob, { since }).some((m) => /dungeon is free.*starting yours/i.test(m.plain)), "Bob is told his run is starting");
  const end = await probe({ report: true });
  t.check(end.saved.length === 0 && end.line?.length === 0, `the line is empty and its save removed (${JSON.stringify(end)})`);
  t.cmd(bob, "/realm:expedition_leave");
  await t.waitUntil(async () => { const s = await state(t); return s?.runs === 0 && s.pending === 0 ? s : undefined; }, { timeout: 900, interval: 20, message: "Bob's run resets" });
}
// shared helpers (pasted into each scenario: scenarios can't import)
async function state(t, slot) {
  const parts = [];
  let want = 0;
  const done = new Promise((res) => {
    const sub = t.system.afterEvents.scriptEventReceive.subscribe((ev) => {
      if (ev.id !== "realm:expedition_state") return;
      const m = JSON.parse(ev.message);
      parts[m.part] = m.data;
      want = m.parts;
      if (parts.filter((x) => x !== undefined).length === want) {
        t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
        res(JSON.parse(parts.join("")));
      }
    });
  });
  t.system.sendScriptEvent("realm:expedition_debug", JSON.stringify(slot === undefined ? {} : { slot }));
  return Promise.race([done, t.wait(40).then(() => undefined)]);
}
