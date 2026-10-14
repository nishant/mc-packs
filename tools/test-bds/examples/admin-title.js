// Realm Configuration's title (admin_bp): /realm:admin_title sends realm:title (the title protocol) for every target
// before it shows the title, so the Minimap's compass strip (always on, redrawn every few ticks) steps aside until
// it has faded, then comes back; with a player selector only that player gets it; the "Show a Title" quick action
// does the same from the menu.
//   node tools/test-bds/run.mjs --quiet --only admin_bp,map_bp --scenario tools/test-bds/examples/admin-title.js --timeout 300
const MARK = "§s§2§r";

export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, player: string, from: string, ticks: number }[]} */
  const holds = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:title") return;
    try {
      const m = JSON.parse(message);
      holds.push({ tick: sys.currentTick, player: m.player, from: m.from, ticks: m.ticks });
    } catch {}
  });
  const p = await t.player("Tester", { op: true });
  const sam = await t.player("Sam", { x: 200, z: 200 });
  const boxes = (who, since) => t.messages(who, { kind: "title", pack: "map_bp", since }).filter((m) => m.text === MARK);
  await t.waitUntil(() => boxes(p, 0).length > 0 && boxes(sam, 0).length > 0, { timeout: 200, message: "the compass strip draws for both" });

  // Everyone online, 3 seconds.
  let since = t.tick;
  t.assert(t.cmd(p, '/realm:admin_title "Welcome to the Realm" "Have fun" 3').ok, "admin_title ran");
  await t.waitUntil(() => t.messages(sam, { kind: "title", pack: "admin_bp", since }).length && t.messages(p, { kind: "title", pack: "admin_bp", since }).length, { timeout: 40, message: "the title shows for both" });
  for (const who of [p, sam]) {
    const real = t.messages(who, { kind: "title", pack: "admin_bp", since })[0];
    const hold = holds.find((h) => h.player === who.id && h.from === "admin_bp" && h.tick >= since);
    t.check(real.plain === "Welcome to the Realm" && /Have fun/.test(real.subtitle ?? ""), `${who.name}: title and subtitle (${real.plain} / ${real.subtitle})`);
    t.check(!!hold && hold.tick <= real.tick, `${who.name}: realm:title came first (hold ${hold?.tick}, title ${real.tick})`);
    t.check(hold?.ticks === 10 + 60 + 20, `${who.name}: it holds fade in + 3 s + fade out (${hold?.ticks})`);
  }
  const shown = t.messages(p, { kind: "title", pack: "admin_bp", since })[0].tick;
  await t.wait(80);
  t.check(boxes(p, shown + 1).length === 0, "the compass doesn't draw over the title while it shows");
  await t.waitUntil(() => boxes(p, shown + 85).length > 0, { timeout: 60, message: "the compass comes back after it fades" });

  // One player by selector.
  since = t.tick;
  t.assert(t.cmd(p, "/realm:admin_title Hi \"\" 2 Sam").ok, "admin_title for Sam ran");
  await t.waitUntil(() => t.messages(sam, { kind: "title", pack: "admin_bp", since }).length, { timeout: 40, message: "Sam gets it" });
  await t.wait(5);
  t.check(t.messages(p, { kind: "title", pack: "admin_bp", since }).length === 0, "Tester doesn't");
  t.check(holds.some((h) => h.player === sam.id && h.tick >= since) && !holds.some((h) => h.player === p.id && h.tick >= since && h.from === "admin_bp"), "realm:title only for Sam");
  t.check(!t.cmd(p, "/realm:admin_title Hi Sub 99").ok, "seconds past 25 are refused");

  // The quick action.
  await t.wait(60);
  since = t.tick;
  const main = t.waitForm(p, { timeout: 100 });
  t.cmd(p, "/realm:admin");
  const next = async (form, answer) => {
    const f = t.waitForm(p, { timeout: 100 });
    form.answer(answer);
    return f;
  };
  let f = await next(await main, "Quick Actions");
  f = await next(f, "Show a Title");
  t.log("form:", JSON.stringify(f.elements ?? f.body));
  const ask = await next(f, { Title: "Market Day", Subtitle: "In the square", Seconds: 4 });
  t.check(/everyone online/.test(ask.body ?? ""), "for everyone it asks first");
  ask.answer("Yes");
  await t.waitUntil(() => t.messages(sam, { kind: "title", pack: "admin_bp", since }).some((m) => m.plain === "Market Day"), { timeout: 60, message: "the quick action shows the title" });
  t.check(holds.some((h) => h.player === sam.id && h.from === "admin_bp" && h.tick >= since && h.ticks === 10 + 80 + 20), "with realm:title first");
}
