// Smoke test: one operator player runs a few commands from different packs. Passes when the
// commands run and the help menu opens (run.mjs separately fails the run on any script error).
export default async function (t) {
  const p = await t.player("Tester", { op: true });
  t.log(`Tester at ${JSON.stringify(p.location)}, permission ${p.commandPermissionLevel}`);

  // /realm:help opens a menu (an action form). Wait for it, then press its first button.
  if (!t.packs.includes("help_bp")) t.fail("this scenario needs help_bp");
  const formP = t.waitForm(p, { timeout: 200 });
  t.assert(t.cmd(p, "/realm:help").ok, "/realm:help ran");
  const menu = await formP;
  t.log(`help menu "${menu.title}" with ${menu.buttons.length} buttons`);
  t.assert(menu.buttons.length > 0, "help menu has buttons");
  menu.answer(0);
  const page = await t.waitForm(p, { timeout: 100 }).catch(() => undefined);
  t.check(page !== undefined, "pressing the first help button opened a page");
  if (page) { t.log(`help page "${page.title}"`); page.answer(null); }

  // A few more commands from other packs. Forms they open are closed after formTimeout ticks.
  // Only commands whose pack is installed (t.packs lists the pack folders of this run).
  const more = { stats_bp: "/realm:stats", afk_bp: "/realm:afk", hud_bp: "/realm:hud", death_bp: "/realm:death", weather_bp: "/realm:weather", quests_bp: "/realm:quests" };
  for (const [pack, cmd] of Object.entries(more)) {
    if (!t.packs.includes(pack)) continue;
    const r = t.cmd(p, cmd);
    t.check(r.ok, `${cmd} ran`);
    await t.wait(10);
  }
  await t.wait(60);
  const msgs = t.messages(p);
  t.log(`Tester received ${msgs.length} messages; forms shown: ${t.forms(p).length}`);
  for (const m of msgs.slice(0, 10)) t.log(`  ${m.pack}/${m.kind}: ${m.plain.slice(0, 120)}`);
}
