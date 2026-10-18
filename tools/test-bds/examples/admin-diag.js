// Pack diagnostics: every pack answers realm:diag_ping with its version and saved data (and its script time after
// a profiling window); /realm:diag (operators only) measures, lists the packs and, on a pack's page, forgets its
// saved data after a confirmation that names what goes and what stays. A forget without the exact confirmation is
// refused, Cancel deletes nothing, and a forgotten pack saves nothing more until /reload (here: Nicknames, which
// saves every joining player's gamertag in the world).
// Run with: node tools/test-bds/run.mjs --quiet --only admin_bp,nick_bp --scenario tools/test-bds/examples/admin-diag.js
export default async function (t) {
  const op = await t.player("Tester", { op: true });
  const member = await t.player("Member");
  await t.wait(40);

  /** @type {any[]} */
  const got = [];
  t.system.afterEvents.scriptEventReceive.subscribe(
    (/** @type {any} */ ev) => {
      if (ev.id !== "realm:diag_pong" && ev.id !== "realm:diag_forgot") return;
      t.check(ev.message.length < 2048, `${ev.id} is under 2048 characters (${ev.message.length})`);
      got.push({ ev: ev.id, ...JSON.parse(ev.message) });
    },
    { namespaces: ["realm"] }
  );
  const send = (/** @type {string} */ id, /** @type {any} */ msg) => t.system.sendScriptEvent(id, JSON.stringify(msg));
  const answers = async (/** @type {string} */ id, n = 2, timeout = 60) => {
    await t.waitUntil(() => got.filter((g) => g.id === id).length >= n, { timeout, message: `${n} answers to ${id}` });
    return got.filter((g) => g.id === id);
  };
  const plain = (/** @type {any} */ s) => String(s ?? "").replace(/§./g, "");

  // 1. Every pack answers, with its manifest version and its saved data.
  send("realm:diag_ping", { id: "p1" });
  const p1 = await answers("p1");
  const nick = p1.find((g) => g.pack === "nick_bp");
  const admin = p1.find((g) => g.pack === "admin_bp");
  t.assert(nick && admin, `admin_bp and nick_bp answered (${p1.map((g) => g.pack).join(", ")})`);
  t.log(`nick_bp: ${JSON.stringify(nick)}`);
  t.check(nick.name === "Nicknames" && /^\d+\.\d+\.\d+$/.test(nick.version), "the pong names the pack and its version");
  t.check(nick.props >= 2 && nick.bytes > 0, `Nicknames saved both gamertags (${nick.props} entries, ${nick.bytes} bytes)`);
  t.check(nick.ticks === undefined, "no profiling numbers without ticks");

  // 2. A profiling window: script time per pack.
  send("realm:diag_ping", { id: "p2", ticks: 40 });
  await t.wait(20);
  t.check(!got.some((g) => g.id === "p2"), "nobody answers before the window ends");
  const p2 = await answers("p2", 2, 80);
  const nick2 = p2.find((g) => g.pack === "nick_bp");
  t.log(`profiled nick_bp: ${JSON.stringify(nick2)}`);
  t.check(nick2.ticks >= 40 && typeof nick2.mpt === "number", `the pong has the window (${nick2.ticks} ticks) and ms/tick`);
  t.check(nick2.calls >= 3, `Nicknames' twice-a-second refresh was counted (${nick2.calls} calls)`);
  t.check(Array.isArray(nick2.top) && nick2.top.length > 0 && /runInterval\(10\)/.test(nick2.top.map((x) => x.k).join(" ")), `its top callbacks name the interval (${JSON.stringify(nick2.top)})`);

  // 2b. Two operators at once: a shorter request made while a longer one runs is answered when its own time is up,
  // and a longer one made later doesn't hold back the first.
  const t0 = t.system.currentTick;
  send("realm:diag_ping", { id: "w1", ticks: 20 });
  await t.wait(5);
  send("realm:diag_ping", { id: "w2", ticks: 100 });
  await answers("w1", 2, 60);
  const w1At = t.system.currentTick - t0;
  t.check(w1At < 40, `the first request is answered after its own 20 ticks (${w1At}), not the later one's 100`);
  t.check(!got.some((g) => g.id === "w2"), "the longer one is still measuring");
  send("realm:diag_ping", { id: "w3", ticks: 10 });
  await answers("w3", 2, 40);
  t.check(!got.some((g) => g.id === "w2"), `a short request inside the long one is answered first (${t.system.currentTick - t0})`);
  const w2 = await answers("w2", 2, 140);
  const w2At = t.system.currentTick - t0;
  t.check(w2At >= 100 && w2.every((g) => g.ticks >= 95), `the long one ends at its own time (${w2At}, ${w2[0].ticks} ticks)`);

  // 3. A forget without the exact confirmation is refused and deletes nothing.
  send("realm:diag_forget", { id: "f1", pack: "nick_bp" });
  send("realm:diag_forget", { id: "f2", pack: "nick_bp", confirm: "FORGET admin_bp" });
  const [f1] = await answers("f1", 1);
  const [f2] = await answers("f2", 1);
  t.check(f1.ok === false && f2.ok === false, "a forget without the right confirmation is refused");
  t.check(!got.some((g) => g.ev === "realm:diag_forgot" && g.pack === "admin_bp"), "only the named pack answers a forget");
  send("realm:diag_ping", { id: "p3" });
  const p3 = (await answers("p3")).find((g) => g.pack === "nick_bp");
  t.check(p3.props === nick.props, `nothing was deleted (${p3.props} entries)`);

  // 4. Members can't open it.
  t.check(!t.cmd(member, "/realm:diag").ok, "/realm:diag is refused for a member");
  await t.wait(10);
  t.check(!t.forms(member).length, "the member got no menu");
  t.check(!t.cmd(op, "/realm:diag 0").ok && !t.cmd(op, "/realm:diag 61").ok, "seconds outside 1 to 60 are refused");

  // 5. The operator's list: every pack, slowest first, with version and saved data.
  const title = (/** @type {any} */ f) => plain(f?.title);
  async function tap(/** @type {any} */ form, /** @type {any} */ answer, timeout = 100) {
    const next = t.waitForm(op, { timeout }).catch(() => undefined);
    form.answer(answer);
    return next;
  }
  let shown = t.waitForm(op, { timeout: 200 });
  t.assert(t.cmd(op, "/realm:diag 2").ok, "/realm:diag ran for the operator");
  await t.waitMessage(op, /Measuring every pack's script time for 2 s/, { pack: "admin_bp" });
  let list = await shown;
  t.assert(title(list) === "Pack diagnostics", `the list opened (got "${title(list)}")`);
  t.log(plain(list.body));
  t.log(JSON.stringify(list.buttons.map(plain)));
  t.check(/over 2\.\d s with 2 online/.test(plain(list.body)), "the body says how long it measured and who was online");
  const names = list.buttons.map(plain);
  t.check(names.some((b) => /^Nicknames v\d+\.\d+\.\d+\n\d+\.\d\d ms\/tick, [\d.]+ (B|KB) saved/.test(b)), "Nicknames is listed with its version, ms/tick and saved data");
  t.check(names.some((b) => b.startsWith("Realm Configuration v")), "Realm Configuration is listed");
  t.check(names.some((b) => b.startsWith("Measure again")), "it offers to measure again");

  // 6. Cancel on the confirmation deletes nothing.
  let page = await tap(list, "Nicknames");
  t.assert(title(page) === "Nicknames", `the pack page opened (got "${title(page)}")`);
  t.log(plain(page.body));
  t.check(/Saved in the world: \d+ entries/.test(plain(page.body)), "the page says what it saved");
  let ask = await tap(page, "Forget this pack's saved data");
  t.assert(ask?.type === "message", "a confirmation came first");
  const text = plain(ask.body);
  t.log(text);
  t.check(/Delete everything Nicknames \(nick_bp\) saved in the world: \d+ entries/.test(text), "the confirmation names the pack and how much goes");
  t.check(/Not deleted: scoreboards and tags/.test(text) && /\/reload or restart/.test(text), "it says scoreboards and tags stay, and to reload");
  list = await tap(ask, 1);
  t.check(title(list) === "Pack diagnostics", "Cancel goes back to the list");
  send("realm:diag_ping", { id: "p4" });
  const p4 = (await answers("p4")).find((g) => g.pack === "nick_bp");
  t.check(p4.props === nick.props && !p4.forgotten, "Cancel deleted nothing");

  // 7. Confirmed: the data goes, and the pack saves nothing more until /reload.
  page = await tap(list, "Nicknames");
  ask = await tap(page, "Forget this pack's saved data");
  const said = t.waitMessage(op, /Nicknames forgot \d+ saved entr/, { pack: "admin_bp", timeout: 100 });
  list = await tap(ask, 0);
  const msg = await said;
  t.log(msg.plain);
  t.check(/Run \/reload or restart the server now/.test(msg.plain), "it says to reload next");
  if (list) list.answer(null);
  await t.player("Latecomer"); // Nicknames would save this gamertag
  await t.wait(20);
  send("realm:diag_ping", { id: "p5" });
  const p5 = await answers("p5");
  const nick5 = p5.find((g) => g.pack === "nick_bp");
  t.check(nick5.props === 0 && nick5.forgotten === true, `Nicknames' saved data is gone and stays gone (${nick5.props} entries)`);
  t.check(p5.find((g) => g.pack === "admin_bp").forgotten === undefined, "the other pack is untouched");
}
