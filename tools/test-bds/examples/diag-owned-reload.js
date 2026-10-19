// O45 acceptance in one add-on: untouched saved keys keep an owner after a reload when their namespace is declared;
// unknown and ambiguous namespaces stay unowned; and a forget answered after the operator's wait (200 ticks) still
// reaches the operator as one line, never "nothing was deleted", while other packs' saved data is untouched.
// Disclosed adaptation: slow_bp is a console-only owner probe (hook --late) that answers 260 ticks after its forget; the
// operator side (admin_bp diagnostics) and every real pack's diag.js are production. A restart stands in for /reload.
// The 12,000-tick expiry and the 16 pending limit stay with tools/operator-admin.test.mjs (too long / too many for BDS).
//   mkdir -p /tmp/diago && node tools/test-bds/hooks/diag-bundle.mjs /tmp/diago admin_bp,help_bp,nick_bp --declare decl,help --late
//   node tools/test-bds/run.mjs --quiet --flat --packs /tmp/diago --scenario tools/test-bds/examples/diag-owned-reload.js --timeout 900
export default async function (t) {
  const op = await t.player("Tester", { op: true });
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
  const ping = async (/** @type {string} */ id) => {
    send("realm:diag_ping", { id });
    await t.waitUntil(() => ["admin_bp", "help_bp", "nick_bp", "probe_bp"].every((p) => got.some((g) => g.id === id && g.pack === p)), { timeout: 80, message: `answers to ${id}` });
    return Object.fromEntries(got.filter((g) => g.id === id && g.ev === "realm:diag_pong").map((g) => [g.pack, g]));
  };
  const plain = (/** @type {any} */ s) => String(s ?? "").replace(/§./g, "");

  if (t.phase === 1) {
    for (const k of ["decl:a", "help:orphan", "mystery:z"]) send("realm:probe_set", k);
    await t.wait(10);
    const b = await ping("p1");
    t.check(b.probe_bp.props === 2, `phase 1: the probe wrote decl:a and has its probe:big (${b.probe_bp.props})`);
    t.restart("seeded three keys; restarting so no pack has touched them");
  }

  // Phase 2: nothing has read decl:a, help:orphan or mystery:z since the reload.
  const b1 = await ping("o1");
  t.log(JSON.stringify({ probe: b1.probe_bp.props, help: b1.help_bp.props, unowned: b1.nick_bp.unownedProps }));
  t.check(b1.probe_bp.props === 2, `declared decl:a belongs to its declaring pack before anyone read it (${b1.probe_bp.props} = decl:a + probe:big)`);
  t.check(b1.nick_bp.unownedProps === 2, `help:orphan (declared by two packs) and mystery:z (declared by none) stay unowned (${b1.nick_bp.unownedProps})`);
  const nickBefore = b1.nick_bp.props;
  const helpBefore = b1.help_bp.props;

  async function tap(/** @type {any} */ form, /** @type {any} */ answer, timeout = 100) {
    const next = t.waitForm(op, { timeout }).catch(() => undefined);
    form.answer(answer);
    return next;
  }
  const shown = t.waitForm(op, { timeout: 200 });
  t.assert(t.cmd(op, "/realm:diag 2").ok, "/realm:diag ran");
  const list = await shown;
  const page = await tap(list, "Slow");
  t.assert(page, "Slow's page opened");
  const ask = await tap(page, "Forget this pack's saved data");
  const wait = t.waitMessage(op, /Slow hasn't answered yet/, { timeout: 260 });
  const back = await tap(ask, 0, 260);
  await wait;
  t.log("the operator was told it hasn't answered yet");
  const late = await t.waitMessage(op, /Slow forgot 1 saved entry \(10 B\)[\s\S]*taking longer than expected/, { timeout: 200 });
  t.check(!!late, "the answer that came after 200 ticks reached the operator");
  if (back) back.answer(null);
  await t.wait(40);
  const texts = t.messages(op).map((m) => plain(m.plain ?? m.text));
  t.check(!texts.some((s) => /Nothing was deleted|didn't forget/.test(s)), "no false 'nothing was deleted' or failure line");
  t.check(texts.filter((s) => /Slow forgot 1 saved entry/.test(s)).length === 1, "the duplicate answer is not reported twice");

  const b2 = await ping("o2");
  t.check(b2.nick_bp.props === nickBefore && b2.help_bp.props === helpBefore, `other packs kept their entries (nick ${nickBefore}->${b2.nick_bp.props}, help ${helpBefore}->${b2.help_bp.props})`);
  t.check(b2.probe_bp.props === 2 && !b2.probe_bp.forgotten && b2.nick_bp.unownedProps === 2, `foreign keys were not deleted (probe ${b2.probe_bp.props}, unowned ${b2.nick_bp.unownedProps})`);
}
