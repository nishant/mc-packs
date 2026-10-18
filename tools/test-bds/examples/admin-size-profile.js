// Server size (admin_bp, Operator Tools > Server size): Large server lists every setting it changes, old -> new,
// before anything changes; Cancel changes nothing; Yes sets each pack's option through Realm Settings (realm:cfg_set),
// including the Minimap's budget level (its budgets drop to 0.6 of normal); Small Realm puts every one back to the
// pack's default. Also: "Don't remind operators" stops the chat line for every operator, and a player who isn't an
// operator can't open any of it.
//   node tools/test-bds/run.mjs --quiet --only admin_bp,map_bp,elite_bp,cleanup_bp,find_bp,afk_bp,mail_bp --scenario tools/test-bds/examples/admin-size-profile.js --timeout 600
export default async function (t) {
  const PACKS = ["admin_bp", "map_bp", "elite_bp", "cleanup_bp", "find_bp", "afk_bp", "mail_bp"];
  for (const pack of PACKS) if (!t.packs.includes(pack)) t.fail(`this scenario needs ${pack}`);
  const op = await t.player("Boss", { op: true });
  const member = await t.player("Member");
  await t.wait(70);
  const plain = (/** @type {any} */ s) => String(s ?? "").replace(/§./g, "");
  const title = (/** @type {any} */ f) => plain(f?.title);
  const lines = (/** @type {any} */ f) => (f?.buttons ?? []).map((/** @type {string} */ b) => plain(b));
  async function tap(/** @type {any} */ form, /** @type {any} */ answer, timeout = 200) {
    const next = t.waitForm(op, { timeout }).catch(() => undefined);
    form.answer(answer);
    return next;
  }

  /** @type {Map<string, any>} */
  const schema = new Map();
  /** @type {any[]} */
  const mapStates = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    (/** @type {any} */ ev) => {
      if (ev.id === "realm:cfg_set") t.check(ev.message.length < 2048, `cfg_set is under 2048 characters (${ev.message.length})`);
      if (ev.id === "realm:cfg_schema") {
        const m = JSON.parse(ev.message);
        if (m.id === "test") for (const o of m.options) schema.set(`${m.pack}:${o.key}`, o.value);
      } else if (ev.id === "realm:map_state") mapStates.push(JSON.parse(ev.message));
    },
    { namespaces: ["realm"] }
  );
  async function values() {
    schema.clear();
    t.system.sendScriptEvent("realm:cfg_ping", JSON.stringify({ id: "test" }));
    await t.wait(10);
    return schema;
  }
  async function mapState() {
    mapStates.length = 0;
    t.system.sendScriptEvent("realm:map_debug", JSON.stringify({ player: op.id, action: "state" }));
    await t.waitUntil(() => mapStates.length, { timeout: 40, message: "the Minimap's state" });
    return mapStates[0];
  }
  const LARGE = { "map_bp:budgetLevel": "low", "map_bp:mobRadiusMax": 24, "elite_bp:maxAlive": 16, "cleanup_bp:threshold": 1500, "find_bp:liveScanRadius": 8, "admin_bp:checkSeconds": 60, "mail_bp:sendCooldownSeconds": 30, "afk_bp:sleep.percent": 50 };
  const SMALL = { "map_bp:budgetLevel": "normal", "map_bp:mobRadiusMax": 32, "elite_bp:maxAlive": 8, "cleanup_bp:threshold": 500, "find_bp:liveScanRadius": 16, "admin_bp:checkSeconds": 30, "mail_bp:sendCooldownSeconds": 10, "afk_bp:sleep.percent": 100 };
  const matches = (/** @type {Map<string, any>} */ v, /** @type {Record<string, any>} */ want) => Object.entries(want).filter(([k, x]) => v.get(k) !== x).map(([k, x]) => `${k} is ${v.get(k)}, not ${x}`);

  // 1. Members can't open it.
  t.check(!t.cmd(member, "/realm:admin_setup").ok, "/realm:admin_setup is refused for a member");

  // 2. Don't remind operators: no chat line for the next operator.
  const told = (/** @type {any} */ p) => t.messages(p, { kind: "chat", pack: "admin_bp" }).filter((m) => /Set up this world/.test(m.plain) && /realm:admin_setup/.test(m.plain));
  t.check(told(op).length === 1, `the first operator was reminded (${told(op).length})`);
  let shown = t.waitForm(op, { timeout: 100 });
  t.assert(t.cmd(op, "/realm:admin_setup").ok, "/realm:admin_setup ran");
  let page = await shown;
  const said = t.waitMessage(op, /Operators won't be reminded/, { pack: "admin_bp", timeout: 100 });
  page = await tap(page, "Don't remind operators");
  await said;
  t.check(title(page) === "Set up this world" && !lines(page).some((/** @type {string} */ b) => b.startsWith("Don't remind operators")), "the start page comes back without the button");
  page?.answer(null);
  const second = await t.player("Second", { op: true });
  await t.wait(70);
  t.check(told(second).length === 0, `a second operator isn't reminded after that (${told(second).length})`);

  // 3. A fresh world: today's defaults, the Minimap at normal.
  let v = await values();
  t.check(!matches(v, SMALL).length, `every option starts at its default (${matches(v, SMALL).join("; ")})`);
  let ms = await mapState();
  t.check(ms.budgetLevel === "normal" && Math.abs(ms.perTick - 2.9) < 0.01, `the Minimap's budgets are normal (${ms.budgetLevel}, ${ms.perTick} ms a tick)`);

  // 4. Operator Tools > Server size > Large server: the list first, Cancel changes nothing.
  shown = t.waitForm(op, { timeout: 100 });
  t.assert(t.cmd(op, "/realm:admin").ok, "/realm:admin ran");
  const menu = await shown;
  const tools = await tap(menu, "Operator Tools");
  t.assert(title(tools) === "Operator Tools", `Operator Tools opened (got "${title(tools)}")`);
  page = await tap(tools, "Server size");
  t.assert(title(page) === "Server size", `the size page opened (got "${title(page)}")`);
  t.log(plain(page.body));
  t.check(/Now: Small Realm\. 8 settings in 7 packs/.test(plain(page.body)), "it says the world is on Small Realm, and how many settings it covers");
  let ask = await tap(page, "Large server");
  t.assert(ask?.type === "message" && title(ask) === "Apply Large server?", `a confirmation with the list came first (got "${title(ask)}")`);
  t.log(plain(ask.body));
  t.check(/^These 8 settings change, for the whole world:\nMinimap: Minimap script time a tick: Normal \(about 2\.9 ms a tick\) -> Low \(about 1\.7 ms a tick\)\nMinimap: Largest mob range players may pick \(blocks\): 32 -> 24\n/.test(plain(ask.body)), "it lists each change, old -> new, in menu words");
  page = await tap(ask, 1);
  t.check(title(page) === "Operator Tools", `Cancel goes back (got "${title(page)}")`);
  v = await values();
  t.check(!matches(v, SMALL).length, `Cancel changed nothing (${matches(v, SMALL).join("; ")})`);

  // 5. Yes: every option changes, the Minimap's budgets drop.
  page = await tap(page, "Server size");
  ask = await tap(page, "Large server");
  const done = t.waitMessage(op, /Server size: Large server\. Changed 8 settings\./, { pack: "admin_bp", timeout: 100 });
  page = await tap(ask, 0);
  t.log((await done).plain);
  v = await values();
  t.check(!matches(v, LARGE).length, `every option has its Large server value (${matches(v, LARGE).join("; ")})`);
  ms = await mapState();
  t.check(ms.budgetLevel === "low" && Math.abs(ms.perTick - 1.74) < 0.01, `the Minimap's budgets are low (${ms.budgetLevel}, ${ms.perTick} ms a tick)`);
  t.check(title(page) === "Operator Tools" && lines(page).some((/** @type {string} */ b) => b.startsWith("[x] Server Size")), `Operator Tools comes back with the size checked off (${lines(page).filter((/** @type {string} */ b) => b.includes("Server Size")).join("")})`);

  // 6. The size page now says Large; Small Realm puts every option back.
  page = await tap(page, "Server size");
  t.check(/Now: Large server/.test(plain(page.body)) && lines(page).some((/** @type {string} */ b) => b.startsWith("Large server (now)")), "the size page says Large server now");
  ask = await tap(page, "Small Realm");
  t.check(/^These 8 settings change, for the whole world:\nMinimap: Minimap script time a tick: Low \(about 1\.7 ms a tick\) -> Normal/.test(plain(ask.body)), "Small Realm lists the way back");
  const back = t.waitMessage(op, /Server size: Small Realm\. Changed 8 settings\./, { pack: "admin_bp", timeout: 100 });
  page = await tap(ask, 0);
  await back;
  v = await values();
  t.check(!matches(v, SMALL).length, `every option is back at its default (${matches(v, SMALL).join("; ")})`);
  ms = await mapState();
  t.check(ms.budgetLevel === "normal" && Math.abs(ms.perTick - 2.9) < 0.01, `the Minimap's budgets are normal again (${ms.perTick} ms a tick)`);

  // 7. Applied again: nothing left to change.
  page = await tap(page, "Server size");
  ask = await tap(page, "Small Realm");
  t.check(/Every setting already matches Small Realm \(8 settings\)\. Nothing to change\./.test(plain(ask?.body)), `nothing to change the second time (${plain(ask?.body)})`);
  ask?.answer(1);
}
