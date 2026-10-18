// Pack diagnostics inside a bundle: the packs share one script context and one saved data storage, as in the Realm
// Bundle. Each pack still answers for itself (its own keys, its own callbacks, even one handed over from an `await`),
// a 25 KB entry is flagged, and forgetting one pack deletes only its keys and blocks only its writes.
// The suite builds the test bundle first (admin_bp, nick_bp and a probe pack from the hook):
//   mkdir -p /tmp/diagb && node tools/test-bds/hooks/diag-bundle.mjs /tmp/diagb admin_bp,nick_bp
//   node tools/test-bds/run.mjs --quiet --packs /tmp/diagb --scenario tools/test-bds/examples/admin-diag-bundle.js
export default async function (t) {
  const op = await t.player("Tester", { op: true });
  await t.player("Member");
  await t.wait(40);

  /** @type {any[]} */
  const got = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    (/** @type {any} */ ev) => {
      if (ev.id === "realm:diag_pong" || ev.id === "realm:diag_forgot") got.push({ ev: ev.id, ...JSON.parse(ev.message) });
    },
    { namespaces: ["realm"] }
  );
  const send = (/** @type {string} */ id, /** @type {any} */ msg) => t.system.sendScriptEvent(id, typeof msg === "string" ? msg : JSON.stringify(msg));
  const answers = async (/** @type {string} */ id, n = 3, timeout = 80) => {
    await t.waitUntil(() => got.filter((g) => g.id === id).length >= n, { timeout, message: `${n} answers to ${id}` });
    const list = got.filter((g) => g.id === id);
    return Object.fromEntries(list.map((g) => [g.pack, g]));
  };
  const plain = (/** @type {any} */ s) => String(s ?? "").replace(/§./g, "");

  send("realm:diag_ping", { id: "b1" });
  const b1 = await answers("b1");
  t.log(JSON.stringify(b1));
  t.assert(b1.admin_bp && b1.nick_bp && b1.probe_bp, `all three packs answered (${Object.keys(b1).join(", ")})`);
  t.check(b1.nick_bp.shared === 3 && b1.probe_bp.shared === 3, "each knows it shares the add-on with 2 more");
  t.check(b1.nick_bp.props === 2 && /^nick:/.test(b1.nick_bp.bigKey), `Nicknames owns its 2 gamertag entries (${b1.nick_bp.props})`);
  t.check(b1.probe_bp.props === 1 && b1.probe_bp.bigKey === "probe:big" && b1.probe_bp.big >= 25000, "the probe owns its 25 KB entry");
  t.check(b1.nick_bp.total >= b1.nick_bp.bytes + b1.probe_bp.bytes, `the total (${b1.nick_bp.total}) covers every pack's bytes`);
  t.check(b1.nick_bp.unownedProps === 0, `no entry is left without an owner (${b1.nick_bp.unownedProps})`);

  send("realm:diag_ping", { id: "b2", ticks: 60 });
  const b2 = await answers("b2", 3, 140);
  const keys = (/** @type {string} */ p) => (b2[p].top ?? []).map((/** @type {any} */ x) => x.k).join(" | ");
  t.log(`admin: ${keys("admin_bp")}`);
  t.log(`nick: ${keys("nick_bp")}`);
  t.log(`probe: ${keys("probe_bp")}`);
  t.check(/runInterval\(10\) refreshAll/.test(keys("nick_bp")), "Nicknames' interval is counted as Nicknames'");
  t.check(!/refreshAll/.test(keys("admin_bp")) && !/refreshAll/.test(keys("probe_bp")), "and not as anyone else's");
  t.check(/runInterval\(2\)/.test(keys("probe_bp")) && b2.probe_bp.calls >= 25, `an interval started after an await is the probe's (${b2.probe_bp.calls} calls)`);

  // The list flags the big entry and explains the shared storage.
  async function tap(/** @type {any} */ form, /** @type {any} */ answer, timeout = 100) {
    const next = t.waitForm(op, { timeout }).catch(() => undefined);
    form.answer(answer);
    return next;
  }
  const shown = t.waitForm(op, { timeout: 200 });
  t.assert(t.cmd(op, "/realm:diag 2").ok, "/realm:diag ran");
  const list = await shown;
  t.log(plain(list.body));
  t.log(JSON.stringify(list.buttons));
  t.check(/3 packs share one add-on \(a bundle\)/.test(plain(list.body)), "the body explains the shared storage");
  t.check(list.buttons.some((/** @type {string} */ b) => /^(§c)?Probe v[\s\S]*big entry/.test(b)), "the probe is red for its big entry");
  const page = await tap(list, "Probe");
  t.check(/Biggest entry: probe:big \(24\.\d KB, close to the 32 KB limit\)/.test(plain(page.body)), "its page names the big entry");
  const ask = await tap(page, "Forget this pack's saved data");
  t.check(/Only its own entries go: the other packs in this add-on keep theirs/.test(plain(ask.body)), "the confirmation says the others keep theirs");
  const said = t.waitMessage(op, /Probe forgot 1 saved entry/, { timeout: 100 });
  const back = await tap(ask, 0);
  await said;
  if (back) back.answer(null);

  send("realm:probe_write", "after");
  await t.player("Latecomer"); // Nicknames saves this gamertag: it was not forgotten
  await t.wait(20);
  send("realm:diag_ping", { id: "b3" });
  const b3 = await answers("b3");
  t.check(b3.probe_bp.props === 0 && b3.probe_bp.forgotten === true, `the probe's data is gone and stays gone (${b3.probe_bp.props})`);
  t.check(b3.nick_bp.props === 3 && !b3.nick_bp.forgotten, `Nicknames kept its entries and still saves (${b3.nick_bp.props})`);
}
