// One native scriptEventReceive listener per pack (O54), on the server: in the Realm Bundle's one script context every
// behavior pack holds exactly one native listener (the hook counts them), each realm: protocol still reaches every pack
// (help, settings, diagnostics, the console hooks and their source check), and the router keeps the order of its
// handlers, isolates a handler that throws, drops what is unsubscribed and attributes a late registration to its pack.
// Before O54 the same run fails the count (225 listeners for the 68 packs).
// Other runs of the same scenario: a real bundle (npm run bundle -- --all, unzipped to <bundle dir>) with the counter and
// the probe added by `node tools/test-bds/hooks/events-bundle.mjs <out dir> --inject <bundle dir>`, then run.mjs --packs
// <out dir> as below; and standalone packs (each its own add-on, no counter, so only the protocol checks run):
// run.mjs --quiet --only afk_bp,stats_bp,maps_bp,storm_bp,settings_bp,admin_bp --scenario this file --timeout 600.
// The Realm Bundle's packs (all 67 behavior packs in one context, plus a counter and a probe pack):
//   mkdir -p /tmp/evb && node tools/test-bds/hooks/events-bundle.mjs /tmp/evb all
//   node tools/test-bds/run.mjs --quiet --packs /tmp/evb --scenario tools/test-bds/examples/script-events-dispatch.js --timeout 900
export default async function (t) {
  // The probe's handler c throws on purpose, and the router rethrows it once the other handlers ran.
  t.allowError(/probe handler c failed on purpose/);
  const op = await t.player("Tester", { op: true });
  await t.wait(60);

  /** @type {{ id: string, m: any, raw: string }[]} */
  const events = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    (/** @type {any} */ ev) => {
      try {
        events.push({ id: ev.id, m: JSON.parse(ev.message || "null"), raw: ev.message });
      } catch {
        events.push({ id: ev.id, m: undefined, raw: ev.message });
      }
    },
    { namespaces: ["realm", "harness"] },
  );
  const send = (/** @type {string} */ id, /** @type {any} */ msg) => t.system.sendScriptEvent(id, typeof msg === "string" ? msg : JSON.stringify(msg));
  const of = (/** @type {string} */ id, since = 0) => events.slice(since).filter((e) => e.id === id);
  const mark = () => events.length;

  // ---- The count (the bundle only: the counter answers there) ----
  let first = mark();
  send("harness:events_report", "");
  await t.wait(10);
  const report = of("harness:events_reply", first)[0]?.m;
  let packs = 0;
  if (report) {
    packs = report.packs;
    t.log(`native listeners: ${JSON.stringify(report)}`);
    t.check(report.packs >= 60, `the counter saw ${report.packs} packs subscribe`);
    t.check(report.notOne.length === 0, `every pack holds exactly one native listener (not one: ${JSON.stringify(report.notOne)})`);
    t.check(report.total === report.packs, `${report.total} native listeners for ${report.packs} packs`);
    t.check(report.direct.length === 0, `every subscription comes from a pack's script-events.js (others: ${JSON.stringify(report.direct)})`);
    t.check(JSON.stringify(report.ns) === '["realm"]', `and asks for the realm namespace only (${JSON.stringify(report.ns)})`);
  } else {
    t.log("no counter in this run (standalone packs): only the protocol checks follow");
  }

  // ---- Every pack still answers its protocols, once per request ----
  // Other packs send realm:help_ping too (bounty_bp and atlas_bp at startup, more on their own schedules), and a pong names
  // only its pack. So the round counts the requests it hears (the scenario's own is always one, whether or not this
  // listener hears it back) and checks that every pack answered each of them once.
  const HELP_OWN = { round: "scenario" };
  const helpRound = (/** @type {number} */ since) => {
    const payloads = of("realm:help_ping", since).map((e) => e.raw).filter((raw) => raw !== JSON.stringify(HELP_OWN));
    /** @type {Record<string, number>} */
    const perPack = {};
    const answers = of("realm:help_pong", since).map((e) => e.raw);
    for (const pack of answers) perPack[pack] = (perPack[pack] ?? 0) + 1;
    return { requests: payloads.length + 1, payloads, answers: answers.length, perPack };
  };
  first = mark();
  send("realm:help_ping", HELP_OWN);
  // Bounded: stops once every pack has answered every request heard so far and nothing changed for 5 ticks.
  let last = "";
  let quiet = 0;
  for (let i = 0; i < 80 && quiet < 5; i++) {
    await t.wait(1);
    const now = helpRound(first);
    const key = `${now.requests}:${now.answers}`;
    quiet = now.answers >= now.requests * Math.max(packs, 1) && key === last ? quiet + 1 : 0;
    last = key;
  }
  const round = helpRound(first);
  const answered = Object.keys(round.perPack);
  t.log(`/realm:help round: ${round.requests} requests (the scenario's and ${JSON.stringify(round.payloads)} from packs); ${round.answers} answers from ${answered.length} packs`);
  const notOnce = answered.filter((p) => round.perPack[p] !== round.requests);
  t.check(notOnce.length === 0, `every pack answers each /realm:help request once (${round.requests} requests${notOnce.length ? `; not once: ${notOnce.map((p) => `${p} ${round.perPack[p]}`).join(", ")}` : ""})`);
  if (packs) t.check(answered.length === packs, `every pack (${packs}) answers /realm:help (${answered.length} packs answered)`);
  else t.check(answered.length >= 1, "a pack answers /realm:help");
  t.log("Limitation: a pong names only its pack, so this shows each pack answered each request once, not which request each answer belongs to.");

  first = mark();
  send("realm:cfg_ping", { id: "d1" });
  await t.wait(60);
  const schemas = new Set(of("realm:cfg_schema", first).filter((e) => e.m?.id === "d1").map((e) => e.m.pack));
  t.log(`cfg_schema from ${schemas.size} packs`);
  if (packs) t.check(schemas.size >= packs - 2, `every pack but the settings menu and the probe answers realm:cfg_ping (${schemas.size} of ${packs})`);
  else t.check(schemas.size >= 1, "a pack answers realm:cfg_ping");

  first = mark();
  send("realm:diag_ping", { id: "d2" });
  await t.wait(60);
  const pongs = of("realm:diag_pong", first).filter((e) => e.m?.id === "d2").map((e) => e.m.pack);
  t.check(new Set(pongs).size === pongs.length, "no pack answers the diagnostics ping twice");
  if (packs) t.check(pongs.length === packs, `every pack answers the diagnostics ping (${pongs.length} of ${packs})`);
  else t.check(pongs.length >= 1, "a pack answers the diagnostics ping");

  // ---- Source filtering: a console-only hook ignores a player who types it ----
  if (t.packs.some((p) => /maps_bp/.test(p)) || packs) {
    t.assert(t.cmd(op, `/realm:maps_give ${op.name}`).ok, "maps_give");
    await t.waitMessage(op, /treasure map|first clue/i, { timeout: 100 });
    let since = t.tick;
    t.cmd(op, `/scriptevent realm:maps_test ${JSON.stringify({ action: "found", player: op.name })}`);
    await t.wait(40);
    t.check(t.messages(op, { kind: "chat", since }).every((m) => !/You found the treasure/.test(m.plain)), "a player's /scriptevent doesn't reach a console-only hook");
    since = t.tick;
    await t.console(`scriptevent realm:maps_test ${JSON.stringify({ action: "found", player: op.name })}`);
    await t.waitMessage(op, /You found the treasure/, { since, timeout: 80 });
    t.log("the console reaches it");
  }

  // ---- The probe pack's router (the bundle only) ----
  if (report) {
    const probeState = async (/** @type {string} */ ask) => {
      const at = mark();
      send("realm:probe_ask", ask);
      await t.waitUntil(() => of("realm:probe_state", at).length > 0, { timeout: 40, message: "probe_state" });
      return of("realm:probe_state", at)[0].m;
    };
    await probeState("clear");
    send("realm:probe_order", "{}");
    await t.wait(10);
    let s = await probeState("");
    t.log(`probe order: ${JSON.stringify(s)}`);
    t.check(JSON.stringify(s.order) === JSON.stringify(["a", "b:realm:probe_order", "c", "d"]), `handlers run in registration order and the one after the throwing handler still runs (${JSON.stringify(s.order)})`);
    t.check(s.routed === true, "the probe went through the router (before O54 it subscribes directly)");
    send("realm:probe_other", "{}");
    send("other:probe_order", "{}");
    await t.wait(10);
    s = await probeState("");
    t.check(JSON.stringify(s.order.slice(4)) === JSON.stringify(["b:realm:probe_other"]), `an id reaches only the handlers registered for it, and another namespace none (${JSON.stringify(s.order.slice(4))})`);

    await probeState("clear");
    send("realm:probe_drop", "{}");
    await t.wait(6);
    s = await probeState("drop");
    t.check(s.order.filter((/** @type {string} */ x) => x === "dropped").length === 1, "a handler hears its event");
    send("realm:probe_drop", "{}");
    await t.wait(6);
    s = await probeState("");
    t.check(s.order.filter((/** @type {string} */ x) => x === "dropped").length === 1, "and after offScriptEvent no more");

    // A registration from an await continuation after startup is the probe's, in the diagnostics too.
    t.check(s.late === 0 && s.lateAt > 0, `the late handler registered at tick ${s.lateAt}`);
    first = mark();
    send("realm:diag_ping", { id: "w1", ticks: 40 });
    await t.wait(2);
    for (let i = 0; i < 8; i++) {
      send("realm:probe_late", "{}");
      await t.wait(4);
    }
    await t.waitUntil(() => of("realm:diag_pong", first).filter((e) => e.m?.id === "w1").length >= packs, { timeout: 120, message: "windowed diagnostics answers" });
    const w = Object.fromEntries(of("realm:diag_pong", first).filter((e) => e.m?.id === "w1").map((e) => [e.m.pack, e.m]));
    const top = (/** @type {string} */ p) => (w[p]?.top ?? []).map((/** @type {any} */ x) => x.k).join(" | ");
    t.log(`probe: ${w.probe_bp?.ms} ms in ${w.probe_bp?.calls} calls; ${top("probe_bp")}`);
    t.check(w.probe_bp && w.probe_bp.ms >= 15, `the late handler's time is the probe's (${w.probe_bp?.ms} ms)`);
    t.check(/scriptEventReceive/.test(top("probe_bp")), "as its pack's script event callback");
    // Attribution, not load: the probe's handler is charged to probe_bp, so no other pack's rows may name it. Other packs'
    // own work is logged apart as unrelated; it is no evidence either way.
    const named = Object.keys(w).filter((p) => p !== "probe_bp" && (w[p]?.top ?? []).some((/** @type {any} */ x) => /probe_bp/.test(x.k)));
    t.check(named.length === 0, `no other pack's rows name the probe's handler (${named.join(", ") || "none"})`);
    const unrelated = Object.keys(w).filter((p) => p !== "probe_bp" && (w[p]?.ms ?? 0) >= 10).map((p) => `${p} ${w[p].ms} ms (${top(p) || "no rows"})`);
    t.log(`unrelated work over 10 ms in the window (not attribution evidence): ${unrelated.join("; ") || "none"}`);
    t.log("Limitation: each pack's script events show as one callback; the profiler's top list no longer names the handler.");
  }
}
