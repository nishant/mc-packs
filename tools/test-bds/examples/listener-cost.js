// What one script event listener wake-up costs, engine side included (PIPE-03 (2), XC-01). The Realm Bundle runs idle
// (no players, noon, clear weather, cycles off) while the harness test pack sends `rate` script events a tick with the
// id `<ns>:perf_noop` for `seconds`. Every bundle member's script-events.js listens to the `realm` namespace, so a
// `realm:` event wakes each member's listener once (it finds no handler for the id and returns); a `noop:` event wakes
// no listener at all (the harness's own listeners take only `harness:`). Run unprofiled with --meter, three times:
// rate=0 (idle), ns=noop and ns=realm. Then (realm - noop) bedrock_server CPU ms/tick / (rate x members) is one wake-up
// and (noop - idle) / rate is the cost of sending one event. validate.yml's `listener` job runs the three on the base's
// and the head's bundle, twice in alternating order, and the report prints both figures (validate-report.mjs).
//   node tools/test-bds/run.mjs --quiet --no-relay --flat --meter --bundle dist/realm_bundle.mcpack --scenario tools/test-bds/examples/listener-cost.js --arg rate=5 --arg ns=realm --arg seconds=60 --timeout 400
// Arguments (--arg key=value): rate (events a tick, default 5; 0 = idle), ns (realm or noop, default realm), seconds
// (the measured window, default 60), settle (seconds before it, default 15: the packs' startup work is not measured).
export default async function (t) {
  const a = t.args;
  const RATE = Math.max(0, Math.floor(Number(a.rate ?? 5)));
  const NS = String(a.ns ?? "realm");
  if (!/^[a-z_]+$/.test(NS)) t.fail(`ns must be a namespace (letters and _), not ${NS}`);
  const SECONDS = Math.max(5, Number(a.seconds ?? 60));
  const SETTLE = Math.max(0, Number(a.settle ?? 15));
  const members = (t.bundle ?? []).reduce((n, b) => n + (b.members?.length ?? 0), 0) || t.packs.length;
  t.server("/gamerule dodaylightcycle false");
  t.server("/gamerule doweathercycle false");
  t.server("/time set 6000");
  t.server("/weather clear");
  t.log(`listener-cost: ${members} pack(s), ${RATE} ${NS}:perf_noop event(s) a tick for ${SECONDS} s after ${SETTLE} s`);
  await t.seconds(SETTLE);
  const id = `${NS}:perf_noop`;
  const startTick = t.tick;
  t.measure();
  let sent = 0;
  const run = RATE > 0 ? t.system.runInterval(() => { for (let i = 0; i < RATE; i++) t.system.sendScriptEvent(id, ""); sent += RATE; }, 1) : null;
  await t.seconds(SECONDS);
  if (run !== null) t.system.clearRun(run);
  const ticks = t.tick - startTick;
  t.report("listener-cost", { rate: RATE, ns: NS, members, seconds: SECONDS, startTick, ticks, sent });
  t.check(RATE === 0 || sent >= RATE * ticks * 0.9, `sent ${sent} events over ${ticks} ticks (${RATE} a tick wanted)`);
  t.pass(`${sent} ${id} events over ${ticks} ticks, ${members} pack(s) in the context`);
}
