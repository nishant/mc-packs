// Harness self-test: the shim fails a run when a pack sends a realm: script event of 2048 characters or more (BDS
// 1.26 delivers any length, so only the shim notices), and lets 2047 through.
//   mkdir -p /tmp/hl && cp -r tools/test-bds/hooks/limit_bp /tmp/hl/
//   node tools/test-bds/run.mjs --quiet --packs /tmp/hl --scenario tools/test-bds/examples/harness-event-limit.js --timeout 120
export default async function (t) {
  const sys = t.mc.system;
  const limits = [];
  const sent = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "harness:limit") limits.push(JSON.parse(message));
    else if (id === "rvtest:long_sent") sent.push(Number(message));
  }, { namespaces: ["harness", "rvtest"] });
  // The shim reports the long one as a script error; this scenario expects exactly that one.
  t.allowError(/sent script event realm:test_long with 2048 characters/);
  for (const n of [100, 2047, 2048]) {
    sys.sendScriptEvent("rvtest:long", String(n));
    await t.waitUntil(() => sent.includes(n), { timeout: 40, message: `test pack sent ${n}` });
  }
  await t.wait(5);
  t.log(`limit reports: ${JSON.stringify(limits)}`);
  t.check(limits.length === 1 && limits[0].length === 2048 && limits[0].id === "realm:test_long" && limits[0].pack === "limit_bp", "only the 2048-character message is reported");
}
