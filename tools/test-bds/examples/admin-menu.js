// Realm Configuration menu (admin_bp): checks the main menu's order and counts (Realm Help included) and
// that commands show by name, then walks the menu to a few commands (a slider, a player picker,
// a confirmation, Everyone online, the setup checklist, a quick action, search, Recent, a command with its own menu) and checks that the
// page a command was picked from comes back afterwards, that Cancel goes back too, and the tap
// counts (button presses and form submits, the opening counted as one).
// Run with: node tools/test-bds/run.mjs --quiet --only admin_bp,settings_bp,help_bp,weather_bp,crowns_bp,guard_bp,npc_bp,silly_bp --scenario tools/test-bds/examples/admin-menu.js --timeout 600
export default async function (t) {
  for (const pack of ["admin_bp", "weather_bp", "crowns_bp", "guard_bp", "npc_bp", "silly_bp"]) if (!t.packs.includes(pack)) t.fail(`this scenario needs ${pack}`);
  const p = await t.player("Tester", { op: true });
  await t.wait(60); // the item is handed out 40 ticks after spawn

  let taps = 0;
  /** Opens the menu (one tap, like using the item) and returns the main menu. */
  async function open() {
    const next = t.waitForm(p, { timeout: 100 });
    taps = 1;
    t.assert(t.cmd(p, "/realm:admin").ok, "/realm:admin ran");
    return next;
  }
  /** One tap on `form`; the next form shown, or undefined if none comes within `timeout` ticks. */
  async function tap(form, answer, timeout = 100) {
    const next = t.waitForm(p, { timeout }).catch(() => undefined);
    taps++;
    form.answer(answer);
    return next;
  }
  /** @param {any} form */
  const title = (form) => String(form?.title ?? "").replace(/§./g, "");
  /** Walks main > category > command (by its button name). */
  async function pick(main, category, name) {
    const cat = await tap(main, category);
    t.assert(title(cat) === category, `"${category}" page opened (got "${title(cat)}")`);
    const form = await tap(cat, name);
    t.assert(form && title(form) === name, `${name} options opened (got "${title(form)}")`);
    return form;
  }
  /** The first line of each button, without color codes. @param {any} form */
  const firstLines = (form) => form.buttons.map((/** @type {string} */ b) => b.replace(/§./g, "").split("\n")[0]);

  // 1. Slider + dropdown, a world-wide command: it asks first, then the category comes back.
  let main = await open();
  t.assert(title(main) === "Realm Configuration", `main menu opened (got "${title(main)}")`);

  // 0. The main menu's order, and its counts: every command of the loaded packs but /realm:admin, Realm Help's too.
  const order = firstLines(main);
  t.log("main menu:", order.join(" | "));
  t.check(order[0].startsWith("Recent (") && order[1] === "Search Commands" && order[2] === "Quick Actions", `Recent, Search Commands, Quick Actions come first (${JSON.stringify(order.slice(0, 3))})`);
  t.check(order.at(-2) === "Server Setup Checklist" && order.at(-1) === "Realm Settings", `the checklist and Realm Settings come last (${JSON.stringify(order.slice(-2))})`);
  const cats = ["World & Weather", "Story & Townsfolk", "Towns & Places", "Economy", "Players", "Dungeons & Loot", "Fun", "Utilities", "Events & News"];
  const shown = order.filter((b) => cats.includes(b));
  t.check(JSON.stringify(shown) === JSON.stringify(cats.filter((c) => shown.includes(c))), `categories in order (${JSON.stringify(shown)})`);
  const sum = main.buttons.reduce((/** @type {number} */ n, /** @type {string} */ b) => n + Number(b.replace(/§./g, "").match(/\n(\d+) commands?$/)?.[1] ?? 0), 0);
  const packCount = t.packs.length; // every pack this scenario loads registers commands
  t.check(String(main.body).startsWith(`${sum} commands from ${packCount} packs`), `the menu counts ${sum} commands (the categories' sum) from ${packCount} packs (body: ${main.body})`);
  const util = await tap(main, "Utilities");
  t.check(firstLines(util).includes("Realm Help"), `Utilities lists Realm Help (${JSON.stringify(firstLines(util))})`);
  t.check(!util.buttons.some((/** @type {string} */ b) => /realm:/.test(b)), "buttons show names, not commands");
  main = await tap(util, "Back");
  taps = 1;

  let form = await pick(main, "World & Weather", "Set Weather");
  t.check(form.elements.some((/** @type {any} */ e) => /realm:weather_set/.test(String(e.label ?? e.text ?? ""))), "the options form names the command");
  t.log("weather_set inputs:", form.elements.filter((e) => "default" in e).map((e) => `${e.kind} "${e.label}"`).join(", "));
  let ask = await tap(form, { Weather: "Rain", "real minutes": 5 });
  t.assert(ask && title(ask) === "Are you sure?", `weather_set asks first (got "${title(ask)}")`);
  let ran = t.waitMessage(p, /Ran \/realm:weather_set rain 5/, { pack: "admin_bp" });
  let page = await tap(ask, "Yes");
  await ran;
  t.assert(page && title(page) === "World & Weather", `the category comes back after the command (got "${title(page)}")`);
  t.check(taps === 5, `set the weather: 5 taps (got ${taps})`);
  t.log(`set the weather, confirmed: ${taps} taps, then back on "${title(page)}"`);

  // 2. Cancel on Are you sure? goes back to the list, not out of the menu.
  form = await tap(page, "Remove Creeper Zone");
  t.assert(form && title(form) === "Remove Creeper Zone", "guard_remove options opened");
  ask = await tap(form, { "Zone name": "nowhere" });
  t.assert(ask && title(ask) === "Are you sure?", "guard_remove asks first");
  page = await tap(ask, "Cancel");
  t.assert(page && title(page) === "World & Weather", `Cancel goes back to the list (got "${title(page)}")`);

  // 3. Closing the options form goes back to the list too.
  form = await tap(page, "Add Creeper Zone");
  page = await tap(form, null);
  t.assert(page && title(page) === "World & Weather", `closing the options goes back to the list (got "${title(page)}")`);

  // 4. Player picker (the operator first) and a text amount; crowns_give asks first.
  main = await tap(page, "Back");
  t.assert(title(main) === "Realm Configuration", "Back returns to the main menu");
  taps = 1;
  form = await pick(main, "Economy", "Give Crowns");
  const picker = form.elements.find((e) => e.kind === "dropdown");
  t.assert(picker && picker.options[0] === "Tester" && picker.options.at(-1) === "Everyone online (@a)", `player picker lists the operator first and Everyone online last (${JSON.stringify(picker?.options)})`);
  ask = await tap(form, { "Give Crowns to": "Tester", Crowns: "50" });
  t.assert(ask && title(ask) === "Are you sure?", "crowns_give asks first");
  ran = t.waitMessage(p, /Ran \/realm:crowns_give Tester 50/, { pack: "admin_bp" });
  page = await tap(ask, "Yes");
  await ran;
  t.assert(page && title(page) === "Economy", `Economy comes back (got "${title(page)}")`);
  t.check(taps === 5, `give Crowns: 5 taps (got ${taps})`);

  // 5. Everyone online (@a) asks first even for a command that otherwise doesn't.
  main = await tap(page, "Back");
  taps = 1;
  form = await pick(main, "Fun", "Give Silly Books");
  ask = await tap(form, { "Give Silly Books to": "Everyone online (@a)" });
  t.assert(ask && title(ask) === "Are you sure?" && /everyone online/i.test(ask.body), `@a asks first and says so (got "${title(ask)}": ${ask?.body})`);
  ran = t.waitMessage(p, /Ran \/realm:silly_give @a random 1/, { pack: "admin_bp" });
  page = await tap(ask, "Yes");
  await ran;
  t.assert(page && title(page) === "Fun", "Fun comes back");

  // 5b. Running the @a line again from Recent asks again too, then Recent comes back.
  main = await tap(page, "Back");
  page = await tap(main, "Recent");
  t.assert(page && title(page) === "Recent", `Recent opened (got "${title(page)}")`);
  ask = await tap(page, "realm:silly_give @a");
  t.assert(ask && title(ask) === "Are you sure?" && /everyone online/i.test(ask.body), `rerunning @a from Recent asks first (got "${title(ask)}": ${ask?.body})`);
  ran = t.waitMessage(p, /Ran \/realm:silly_give @a random 1/, { pack: "admin_bp", since: t.tick });
  page = await tap(ask, "Yes");
  await ran;
  t.assert(page && title(page) === "Recent", `Recent comes back (got "${title(page)}")`);

  // 6. Setup checklist: townsfolk by name; each further one is two taps.
  main = await tap(page, "Back");
  taps = 1;
  page = await tap(main, "Server Setup Checklist");
  t.assert(page && title(page) === "Server Setup Checklist", "checklist opened");
  if (t.packs.includes("relics_bp")) t.check(page.buttons.some((b) => /Relicsmith/.test(b)), "the relicsmith is on the checklist");
  else t.check(!page.buttons.some((b) => /Relicsmith/.test(b)), "no relicsmith entry without relics_bp");
  form = await tap(page, "Place the Townsfolk");
  t.assert(form && title(form) === "Place Townsfolk", `npc_add options opened (got "${title(form)}")`);
  const who = form.elements.find((e) => e.kind === "dropdown");
  t.assert(who && who.options.includes("Mara the Cartographer"), `townsfolk by name (${JSON.stringify(who?.options?.slice(0, 3))})`);
  page = await tap(form, { Townsfolk: "Mara the Cartographer" }, 120);
  t.assert(page && title(page) === "Server Setup Checklist", `the checklist comes back (got "${title(page)}")`);
  t.check(taps === 4, `first townsfolk: 4 taps (got ${taps})`);
  const before = taps;
  form = await tap(page, "Place the Townsfolk");
  page = await tap(form, { Townsfolk: "Old Tobin" }, 120);
  t.assert(page && title(page) === "Server Setup Checklist", "the checklist comes back again");
  t.check(taps - before === 2, `each further townsfolk: 2 taps (got ${taps - before})`);
  const npcRuns = t.messages(p, { pack: "admin_bp" }).filter((m) => /realm:npc_add/.test(m.plain)).map((m) => m.plain);
  t.log("npc_add:", npcRuns.join(" | "));

  // 7. A quick action for everyone asks first; the Quick actions page comes right back.
  main = await tap(page, "Back");
  taps = 1;
  page = await tap(main, "Quick Actions");
  form = await tap(page, "Set Time");
  ask = await tap(form, { Time: "Noon" });
  t.assert(ask && title(ask) === "Are you sure?", "set the time asks first");
  ran = t.waitMessage(p, /Time set to Noon/, { pack: "admin_bp" });
  page = await tap(ask, "Yes");
  await ran;
  t.assert(page && title(page) === "Quick Actions", `Quick Actions comes back (got "${title(page)}")`);
  t.check(taps === 5, `set the time: 5 taps (got ${taps})`);

  // 8. Search: results carry Search again; Back returns to the main menu.
  main = await tap(page, "Back");
  form = await tap(main, "Search Commands");
  page = await tap(form, { "Search for": "crowns" });
  t.assert(page && page.buttons.some((b) => /Give Crowns/.test(b)) && page.buttons.some((b) => /Search again/.test(b)), `results list crowns_give and Search again (${JSON.stringify(page?.buttons)})`);
  form = await tap(page, "Search again");
  page = await tap(form, { "Search for": "zzzz" });
  t.assert(page && /Nothing matches/.test(page.body), "no matches page");
  main = await tap(page, "Back");
  t.assert(title(main) === "Realm Configuration", "Back from search returns to the main menu");
  await tap(main, null, 20);

  // 8b. A command with its own menu (Realm Settings, which pings the packs twice first): that menu
  // stays. The admin list may try to come back once; a real client answers UserBusy and it gives up.
  t.formTimeout = 300; // keep Realm Settings open while we watch
  main = await open();
  form = await tap(await tap(main, "Utilities"), "Realm Settings", 150);
  t.assert(form && form.pack === "settings_bp", `realm:config opened its own menu (got "${title(form)}" from ${form?.pack})`);
  let retry = await t.waitForm(p, { timeout: 60 }).catch(() => undefined);
  if (retry) {
    t.assert(retry.pack === "admin_bp", `only the admin list may try to come back (got "${title(retry)}" from ${retry.pack})`);
    retry.answer("busy");
    retry = await t.waitForm(p, { timeout: 60 }).catch(() => undefined);
    t.assert(!retry, `the admin list doesn't retry over Realm Settings (got "${title(retry)}" from ${retry?.pack})`);
  }
  t.assert(!form.answered, "Realm Settings is still open after 60 ticks");
  form.answer(null);
  const gone = await t.waitForm(p, { timeout: 60 }).catch(() => undefined);
  t.assert(!gone || gone.pack !== "admin_bp", `closing Realm Settings doesn't bring the admin list back (got "${title(gone)}")`);
  gone?.answer(null);
  t.formTimeout = 100;
  main = await open();
  t.assert(title(main) === "Realm Configuration", "the menu opens again after a command's own menu");
  await tap(main, null, 20);

  // 9. The menu opens again after it was closed, and leaving with it open leaves no mess.
  main = await open();
  t.assert(title(main) === "Realm Configuration", "the menu opens again after closing");
  p.disconnect();
  await t.wait(60);
  const again = await t.player("Tester", { op: true });
  await t.wait(60);
  const reopened = t.waitForm(again, { timeout: 100 });
  t.assert(t.cmd(again, "/realm:admin").ok, "/realm:admin ran after rejoining");
  const m2 = await reopened;
  t.assert(title(m2) === "Realm Configuration", "the menu opens after leaving with it open");
  m2.answer(null);
}
