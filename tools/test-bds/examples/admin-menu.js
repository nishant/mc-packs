import { ItemLockMode, ItemStack } from "@minecraft/server";

// Realm Configuration menu (admin_bp) for everyone: every player gets the item once; a player who isn't an
// operator sees the same menu minus the operator entries (no Realm Settings, no Operator Tools, no operator
// commands on the group pages or in search); an operator sees everything; an operator command picked
// by someone who stopped being an operator doesn't run. Also walks the operator's main flows (a group page
// with a confirmation, Operator Tools with a quick action and the setup checklist) and counts the taps.
// Run with: node tools/test-bds/run.mjs --quiet --only admin_bp,settings_bp,help_bp,weather_bp,npc_bp,crowns_bp --scenario tools/test-bds/examples/admin-menu.js --timeout 600
export default async function (t) {
  for (const pack of ["admin_bp", "settings_bp", "weather_bp", "npc_bp", "crowns_bp"]) if (!t.packs.includes(pack)) t.fail(`this scenario needs ${pack}`);
  const guest = await t.player("Guest", { op: false });
  const op = await t.player("Tester", { op: true });
  await t.wait(60); // the item is handed out 40 ticks after spawn

  const title = (/** @type {any} */ form) => String(form?.title ?? "").replace(/§./g, "");
  const firstLines = (/** @type {any} */ form) => form.buttons.map((/** @type {string} */ b) => b.replace(/§./g, "").split("\n")[0]);
  const items = (/** @type {any} */ p) => {
    const inv = p.getComponent("inventory").container;
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it && it.typeId === "minecraft:nether_star" && String(it.nameTag ?? "").replace(/§./g, "") === "Realm Configuration") n += it.amount;
    }
    return n;
  };
  let taps = 0;
  async function open(/** @type {any} */ p) {
    const next = t.waitForm(p, { timeout: 100 });
    taps = 1;
    t.assert(t.cmd(p, "/realm:admin").ok, `/realm:admin ran for ${p.name}`);
    return next;
  }
  async function tap(/** @type {any} */ p, /** @type {any} */ form, /** @type {any} */ answer, timeout = 100) {
    const next = t.waitForm(p, { timeout }).catch(() => undefined);
    taps++;
    form.answer(answer);
    return next;
  }

  // 1. Everyone gets the item, once, and any extra real copies are removed while ordinary/anvil-renamed items stay untouched.
  t.check(items(guest) === 1, `the player who isn't an operator got one item (has ${items(guest)})`);
  t.check(items(op) === 1, `the operator got one item (has ${items(op)})`);
  t.assert(t.cmd(guest, "/realm:admin_item").ok, "/realm:admin_item works for a player who isn't an operator");
  await t.waitMessage(guest, /already carry/, { pack: "admin_bp" });
  t.check(items(guest) === 1, `still one item after /realm:admin_item (has ${items(guest)})`);
  t.check(!t.cmd(guest, "/realm:admin_item Tester").ok, "giving the item to someone else needs an operator");

  // Seed 2 extra real copies (legacy lore + stack amount 2) plus an anvil-renamed ordinary Nether Star on the guest.
  const guestInv = guest.getComponent("inventory").container;
  const legacyGold = new ItemStack("minecraft:nether_star", 2);
  legacyGold.nameTag = "§r§bRealm Configuration";
  legacyGold.setLore(["§r§7Hold it in your hand and use it", "§r§8Gold entries: operators only"]);
  legacyGold.keepOnDeath = true;
  legacyGold.lockMode = ItemLockMode.inventory;
  const legacyOp = new ItemStack("minecraft:nether_star", 1);
  legacyOp.nameTag = "§r§6Realm Configuration";
  legacyOp.setLore(["§r§8Operators only"]);
  legacyOp.keepOnDeath = true;
  legacyOp.lockMode = ItemLockMode.inventory;
  const anvilStar = new ItemStack("minecraft:nether_star", 3);
  anvilStar.nameTag = "Realm Configuration";
  guestInv.setItem(15, legacyGold);
  guestInv.setItem(16, legacyOp);
  guestInv.setItem(18, anvilStar);
  await t.wait(5);
  t.assert(t.cmd(guest, "/realm:admin_item").ok, "/realm:admin_item deduplicates extra copies");
  await t.wait(5);
  const realCount = Array.from({ length: guestInv.size }, (_, i) => guestInv.getItem(i))
    .filter((it) => it && it.typeId === "minecraft:nether_star" && it.getLore().length > 0)
    .reduce((sum, it) => sum + it.amount, 0);
  t.check(realCount === 1, `three real copies (amount 4 total) collapsed to 1 (got ${realCount})`);
  t.check(guestInv.getItem(18)?.amount === 3 && guestInv.getItem(18)?.getLore().length === 0, "anvil-renamed ordinary Nether Star in slot 18 untouched");
  guestInv.setItem(18, undefined);
  await t.wait(2);

  // 2. The guest's menu: no operator entries anywhere.
  let main = await open(guest);
  t.assert(title(main) === "Realm Configuration", `the guest's menu opened (got "${title(main)}")`);
  let order = firstLines(main);
  t.log("guest main:", order.join(" | "));
  t.check(order[0] === "My Preferences" && order[1].startsWith("Recent (") && order[2] === "Search", `My Preferences, Recent, Search first (${JSON.stringify(order.slice(0, 3))})`);
  t.check(!order.includes("Realm Settings") && !order.includes("Operator Tools"), "no Realm Settings or Operator Tools for the guest");
  t.check(!/Red = operators only|Gold = operators only/.test(String(main.body).replace(/§./g, "")), `no color legend for the guest (body: ${main.body})`);
  let page = await tap(guest, main, "World & Events");
  t.assert(title(page) === "World & Events", `World & Events opened (got "${title(page)}")`);
  t.check(firstLines(page).includes("Weather Forecast") && !firstLines(page).includes("Set Weather"), `the guest sees Weather Forecast but not Set Weather (${JSON.stringify(firstLines(page))})`);
  let ran = t.waitMessage(guest, /Ran \/realm:weather_forecast/, { pack: "admin_bp" });
  await tap(guest, page, "Weather Forecast", 20);
  await ran;
  // the forecast may open nothing; close whatever comes back
  for (let f = await t.waitForm(guest, { timeout: 80 }).catch(() => undefined); f; f = await t.waitForm(guest, { timeout: 40 }).catch(() => undefined)) f.answer(null);
  main = await open(guest);
  const form = await tap(guest, main, "Search");
  page = await tap(guest, form, { "Search for": "weather" });
  t.check(page && !firstLines(page).includes("Set Weather") && firstLines(page).includes("Weather Forecast"), `the guest's search leaves Set Weather out (${JSON.stringify(page && firstLines(page))})`);
  await tap(guest, page, null, 20);

  // 3. The operator's menu: everything, with the legend.
  main = await open(op);
  order = firstLines(main);
  t.log("operator main:", order.join(" | "));
  t.check(order.includes("Realm Settings") && order.at(-1) === "Operator Tools", `Realm Settings and Operator Tools for the operator (${JSON.stringify(order)})`);
  t.check(/Red = operators only/.test(String(main.body).replace(/§./g, "")), `the legend is at the top (body: ${main.body})`);
  page = await tap(op, main, "World & Events");
  t.check(firstLines(page).includes("Set Weather"), "the operator sees Set Weather");
  let f = await tap(op, page, "Set Weather");
  t.assert(f && title(f) === "Set Weather", `Set Weather options opened (got "${title(f)}")`);
  let ask = await tap(op, f, { Weather: "Rain", "real minutes": 5 });
  t.assert(ask && title(ask) === "Are you sure?", "weather_set asks first");
  ran = t.waitMessage(op, /Ran \/realm:weather_set rain 5/, { pack: "admin_bp" });
  page = await tap(op, ask, "Yes");
  await ran;
  t.assert(page && title(page) === "World & Events", `the group page comes back (got "${title(page)}")`);
  t.check(taps === 5, `set the weather: 5 taps (got ${taps})`);

  // 4. Operator Tools: quick actions and the checklist on one page.
  main = await tap(op, page, "Back");
  taps = 1;
  page = await tap(op, main, "Operator Tools", 120);
  t.assert(page && title(page) === "Operator Tools", `Operator Tools opened (got "${title(page)}")`);
  const tools = firstLines(page);
  t.log("operator tools:", tools.join(" | "));
  t.check(tools.includes("Set Time") && tools.some((b) => /Place the Townsfolk/.test(b)) && tools.includes("Show a Title"), "quick actions, the checklist and the admin commands are there");
  f = await tap(op, page, "Set Time");
  ask = await tap(op, f, { Time: "Noon" });
  ran = t.waitMessage(op, /Time set to Noon/, { pack: "admin_bp" });
  page = await tap(op, ask, "Yes", 120);
  await ran;
  t.assert(page && title(page) === "Operator Tools", `Operator Tools comes back (got "${title(page)}")`);
  t.check(taps === 5, `set the time: 5 taps (got ${taps})`);
  await tap(op, page, null, 20);

  // 5. Picked while an operator, run after losing it: refused, server side.
  main = await open(op);
  page = await tap(op, main, "Friends, Crowns & Fun");
  f = await tap(op, page, "Give Crowns");
  t.deop(op);
  ask = await tap(op, f, { "Give Crowns to": "Tester", Crowns: "50" });
  t.assert(ask && title(ask) === "Are you sure?", "crowns_give asks first");
  const refused = t.waitMessage(op, /realm:crowns_give didn't run: it's for operators/, { pack: "admin_bp" });
  const back = await tap(op, ask, "Yes", 60);
  await refused;
  t.check(!t.messages(op, { pack: "admin_bp" }).some((m) => /Ran \/realm:crowns_give/.test(m.plain)), "crowns_give didn't run");
  back?.answer(null);
  t.op(op);
}
