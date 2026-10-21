// Crowns, O30 (W5): the daily pay limit and the operators' audit ledger, natively, including the UTC day boundary.
// - dailyPayLimit 5,000: Payer pays 1,000 and 4,000; the next 1 is refused before either balance changes.
// - A new UTC day starts the count again: Payer's saved day total (player property crowns:paid, [UTC day, Crowns]) is
//   set to yesterday's full 5,000 through a harness-only probe in a copy of the pack (tools/test-bds/hooks/owed-probe.mjs,
//   used only to read and write crowns_bp's own properties), and a 1,000 payment goes; the saved total is today's 1,000.
//   A midnight can't be waited for, so the boundary is crossed by the saved day, which is all the pack compares.
// - /realm:crowns_audit shows the give and the pays, newest first, with UTC times; a player who isn't an operator
//   gets no audit.
//   mkdir -p /tmp/crowns-limit
//   node tools/test-bds/hooks/owed-probe.mjs /tmp/crowns-limit/packs crowns_bp
//   node tools/test-bds/run.mjs --quiet --packs /tmp/crowns-limit/packs --only crowns_bp --scenario tools/test-bds/examples/crowns-limit.js --timeout 600
const DAY_MS = 86400000;
export default async function (t) {
  const reports = new Map();
  t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "harness:owed_report") return;
      try {
        const r = JSON.parse(message);
        reports.set(r.id, r);
      } catch {}
    },
    { namespaces: ["harness"] },
  );
  let seq = 0;
  /** Payer's saved day total, written (seed) or read, in crowns_bp's own store. */
  const paid = async (body = {}) => {
    const id = `c-${++seq}`;
    await t.console(`scriptevent harness:owed_probe ${JSON.stringify({ id, folder: "crowns_bp", base: "crowns:paid", player: "Payer", dump: true, ...body })}`);
    const r = await t.waitUntil(() => reports.get(id), { timeout: 100, message: "the probe in crowns_bp answered" });
    t.assert(!r.error, `probe: ${r.error ?? "ok"}`);
    return r.legacy;
  };
  const cfg = (key, value) => t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `c_${key}_${t.tick}`, pack: "crowns_bp", key, value }));
  const mod = await t.player("Mod", { op: true });
  const joined = t.tick;
  const payer = await t.player("Payer");
  const payee = await t.player("Payee");
  const score = (p) => {
    try {
      return t.world.scoreboard.getObjective("crowns")?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  cfg("dailyPayLimit", 5000);
  // The daily login bonus lands JOIN_DELAY (200 ticks) after each player's first spawn: wait for both, so the balances
  // below move only by the payments.
  for (const p of [payer, payee]) await t.waitMessage(p, /\(Daily login bonus/, { since: joined, timeout: 300 });
  await t.wait(2);
  let since = t.tick;
  t.cmd(mod, "/realm:crowns_give Payer 10000");
  await t.waitMessage(payer, /from an operator/, { since, timeout: 60 });
  const start = { payer: score(payer), payee: score(payee) };
  t.log(`balances: Payer ${start.payer}, Payee ${start.payee}`);

  const pay = async (n) => {
    const at = t.tick;
    t.cmd(payer, `/realm:crowns_pay Payee ${n}`);
    const m = await t.waitMessage(payer, /You paid|You can send|failed|You have only/, { since: at, timeout: 60 });
    await t.wait(2);
    return m.plain;
  };
  t.check(/You paid 1,000 Crowns to Payee/.test(await pay(1000)), "1,000 goes");
  t.check(/You paid 4,000 Crowns to Payee/.test(await pay(4000)), "4,000 more goes: 5,000 today");
  const before = { payer: score(payer), payee: score(payee) };
  const refused = await pay(1);
  t.check(/You can send 0 Crowns more today \(the limit is 5,000 Crowns a day; it resets at midnight UTC\)/.test(refused), `the next 1 is refused and says why (${refused})`);
  t.check(score(payer) === before.payer && score(payee) === before.payee, `the refused payment moved nothing (Payer ${score(payer)}, Payee ${score(payee)})`);
  t.check(before.payer === start.payer - 5000 && before.payee === start.payee + 5000, "the 5,000 that went moved exactly once");
  const today = Math.floor(Date.now() / DAY_MS);
  const saved = await paid();
  t.check(Array.isArray(saved) && saved[0] === today && saved[1] === 5000, `today's total is saved (${JSON.stringify(saved)}, day ${today})`);

  // The UTC day boundary: yesterday's full limit does not count today.
  await paid({ seed: [today - 1, 5000] });
  t.check(/You paid 1,000 Crowns to Payee/.test(await pay(1000)), "on a new UTC day the count starts again");
  const after = await paid();
  t.check(Array.isArray(after) && after[0] === today && after[1] === 1000, `the saved total is today's 1,000 (${JSON.stringify(after)})`);

  // The audit ledger.
  since = t.tick;
  t.cmd(mod, "/realm:crowns_audit");
  const audit = await t.waitUntil(() => t.forms(mod).find((f) => f.tick >= since && /Crowns audit/.test(f.title)), { timeout: 60, message: "the audit form" });
  const lines = audit.body.split("\n");
  t.log(audit.body);
  t.check(/Times are UTC\. The newest 4 of the last 4 pays and gives\./.test(audit.body), "the audit says UTC and counts the entries");
  const stamp = new Date().toISOString().slice(0, 10);
  const entries = lines.filter((l) => /^\d{4}-\d\d-\d\d \d\d:\d\d /.test(l));
  t.check(entries.length === 4 && entries.every((l) => l.startsWith(stamp)), `four entries with today's UTC date (${entries.join(" / ")})`);
  t.check(/Payer paid 1,000 to Payee/.test(entries[0] ?? ""), `newest first: the last payment (${entries[0]})`);
  t.check(/Payer paid 4,000 to Payee/.test(entries[1] ?? "") && /Payer paid 1,000 to Payee/.test(entries[2] ?? ""), "then the two before it");
  t.check(/Mod gave 10,000 to Payer/.test(entries[3] ?? ""), `and the operator's give (${entries[3]})`);
  t.check(!audit.body.includes("paid 1 to"), "the refused payment is not in the ledger");
  audit.answer(null);
  // A simulated player's command skips the game's permission check, so this checks the pack's own operator check.
  since = t.tick;
  t.cmd(payer, "/realm:crowns_audit");
  await t.wait(30);
  t.check(!t.forms(payer).some((f) => f.tick >= since && /Crowns audit/.test(f.title)), "a player who isn't an operator gets no audit");
}
