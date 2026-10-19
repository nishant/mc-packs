// One native scriptEventReceive listener per pack (O54), on the server: in the Realm Bundle's one script context every
// behavior pack holds exactly one native listener (the hook counts them), each realm: protocol still reaches every pack
// (help, settings, diagnostics, the console hooks and their source check), and the router keeps the order of its
// handlers, isolates a handler that throws, drops what is unsubscribed and attributes a late registration to its pack.
// Before O54 the same run fails the count (every pack holds 2 to 8 listeners, 237 in all).
// Other runs of the same scenario: a real bundle (npm run bundle -- --all, unzipped to <bundle dir>) with the counter and
// the probe added by `node tools/test-bds/hooks/events-bundle.mjs <out dir> --inject <bundle dir>`, then run.mjs --packs
// <out dir> as below; and standalone packs (each its own add-on, no counter, so only the protocol checks run):
// run.mjs --quiet --only afk_bp,stats_bp,maps_bp,storm_bp,settings_bp,admin_bp --scenario this file --timeout 600.
// The Realm Bundle's packs (all 67 behavior packs in one context, plus a counter and a probe pack):
//   mkdir -p /tmp/evb && node tools/test-bds/hooks/events-bundle.mjs /tmp/evb all
//   node tools/test-bds/run.mjs --quiet --packs /tmp/evb --scenario tools/test-bds/examples/script-events-dispatch.js --timeout 900
export default async function (t) {
  // The probe's handler c throws on purpose, and the router rethrows it once the other handlers ran.
  t.allowError(/on purpose/);
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

  // ---- Every pack still answers its protocols, once ----
  first = mark();
  send("realm:help_ping", "");
  await t.wait(40);
  const helps = of("realm:help_pong", first).map((e) => e.raw);
  t.log(`help_pong: ${helps.length} answers`);
  t.check(new Set(helps).size === helps.length, `no pack answers /realm:help twice (${helps.length} answers, ${new Set(helps).size} packs)`);
  if (packs) t.check(helps.length === packs, `every pack (${packs}) answers /realm:help (${helps.length})`);
  else t.check(helps.length >= 1, "a pack answers /realm:help");

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
    const heavy = Object.entries(w).filter(([p, m]) => p !== "probe_bp" && m.ms >= 10).map(([p, m]) => `${p}:${m.ms}`);
    t.check(heavy.length === 0, `and nobody else's (${heavy.join(", ") || "no pack over 10 ms"})`);
    t.log("Limitation: each pack's script events show as one callback; the profiler's top list no longer names the handler.");
  }
}
