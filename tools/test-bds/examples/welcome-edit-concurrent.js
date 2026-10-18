// Welcome Message: two operators at once. Saving the editor keeps what someone else changed meanwhile in the fields
// this operator didn't touch: a switch flipped in /realm:config, or the body saved by another operator's editor.
//   node tools/test-bds/run.mjs --quiet --only welcome_bp --scenario tools/test-bds/examples/welcome-edit-concurrent.js --timeout 300
export default async function (t) {
  const sys = t.system;
  const ann = await t.player("Ann", { op: true });
  const bob = await t.player("Bob", { op: true });
  await t.wait(60);
  for (const p of [ann, bob]) for (const f of t.forms(p)) if (!f.answered) f.answer(null);
  await t.wait(5);

  /** @type {any[]} */
  const got = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id === "realm:cfg_ack" || id === "realm:cfg_schema") got.push(JSON.parse(message));
  }, { namespaces: ["realm"] });
  let n = 0;
  const value = async (key) => {
    const id = `wc${++n}`;
    sys.sendScriptEvent("realm:cfg_ping", JSON.stringify({ id }));
    const ans = await t.waitUntil(() => got.find((m) => m.id === id && m.pack === "welcome_bp"), { timeout: 40, message: "welcome_bp answers" });
    return ans.options.find((o) => o.key === key)?.value;
  };
  const shown = async (p) => {
    const next = t.waitForm(p, { timeout: 100 });
    t.cmd(p, "/realm:welcome_show");
    const f = await next;
    f.answer(0);
    return f;
  };

  // 1. Ann opens the editor; meanwhile chat copies are switched on in /realm:config. Ann changes only the button.
  let next = t.waitForm(ann, { timeout: 100, title: "Edit welcome message" });
  t.assert(t.cmd(ann, "/realm:welcome_edit").ok, "Ann opened the editor");
  const annForm = await next;
  const id = `wc${++n}`;
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack: "welcome_bp", key: "chat", value: true }));
  await t.waitUntil(() => got.find((m) => m.id === id)?.ok, { timeout: 40, message: "chat switch saved" });
  t.assert((await value("chat")) === true, "chat copies are on");
  annForm.answer({ "Button text": "Off we go" });
  await t.waitMessage(ann, /Welcome message saved/, { pack: "welcome_bp" });
  t.check((await value("chat")) === true, "Ann's save kept the chat switch someone else turned on");
  t.check((await shown(ann)).buttons.some((b) => /Off we go/.test(b)), "Ann's button text was saved");

  // 2. Both open the editor; Bob saves a new body first, then Ann saves a new title only: Bob's body stays.
  next = t.waitForm(ann, { timeout: 100, title: "Edit welcome message" });
  t.cmd(ann, "/realm:welcome_edit");
  const a2 = await next;
  next = t.waitForm(bob, { timeout: 100, title: "Edit welcome message" });
  t.cmd(bob, "/realm:welcome_edit");
  const b2 = await next;
  const boxes = (b2.elements ?? []).filter((e) => /Body, part/.test(e.label ?? "")).map((e) => e.label);
  /** @type {Record<string, unknown>} */
  const body = Object.fromEntries(boxes.map((l, i) => [l, i === 0 ? "Hello from Bob" : ""]));
  b2.answer(body);
  await t.waitMessage(bob, /Welcome message saved/, { pack: "welcome_bp" });
  a2.answer({ Title: "Hi there" });
  await t.waitMessage(ann, /Welcome message saved/, { pack: "welcome_bp" });
  const f = await shown(ann);
  t.check(String(f.title).includes("Hi there"), `Ann's title was saved (${f.title})`);
  t.check(String(f.body) === "Hello from Bob", `Bob's body was kept (${String(f.body).slice(0, 60)})`);
}
