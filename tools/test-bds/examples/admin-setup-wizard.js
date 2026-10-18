// Set up this world (admin_bp): an operator on a world whose setup was never finished gets one chat line pointing to
// it (players who aren't operators don't, and nobody gets it twice); /realm:admin_setup is for operators; the wizard
// walks the checklist in order, each step saying what it is, why, and whether its pack says it's done, with a button
// that runs the step's own command, Skip, Mark as done (for steps no pack can check) and a summary at the end.
// Adding a town from its step marks it done, and the town's safe zone covers spawn, so the next step is done too.
// After the summary a newly joined operator gets no reminder.
//   node tools/test-bds/run.mjs --quiet --only admin_bp,town_bp,zones_bp,npc_bp --scenario tools/test-bds/examples/admin-setup-wizard.js --timeout 600
export default async function (t) {
  for (const pack of ["admin_bp", "town_bp", "zones_bp", "npc_bp"]) if (!t.packs.includes(pack)) t.fail(`this scenario needs ${pack}`);
  const guest = await t.player("Guest");
  const op = await t.player("Boss", { op: true });
  await t.wait(70); // the item (and the reminder) come 40 ticks after spawn
  const plain = (/** @type {any} */ s) => String(s ?? "").replace(/§./g, "");
  const reminder = (/** @type {any} */ p) => t.messages(p, { kind: "chat", pack: "admin_bp" }).filter((m) => /Set up this world/.test(m.plain) && /realm:admin_setup/.test(m.plain));

  // 1. The reminder: once, for operators only.
  t.check(reminder(op).length === 1, `the operator is told about Set up this world once (${reminder(op).length})`);
  t.log(reminder(op)[0]?.plain);
  t.check(reminder(guest).length === 0, `the player who isn't an operator isn't (${reminder(guest).length})`);
  const inv = op.getComponent("inventory").container;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.getLore().length) inv.setItem(i, undefined);
  t.assert(t.cmd(op, "/realm:admin_item").ok, "/realm:admin_item ran");
  await t.wait(40);
  t.check(reminder(op).length === 1, `still once after a second item (${reminder(op).length})`);

  // 2. Operators only.
  t.check(!t.cmd(guest, "/realm:admin_setup").ok, "/realm:admin_setup is refused for a player who isn't an operator");
  await t.wait(10);
  t.check(!t.forms(guest).length, "they got no form");

  const title = (/** @type {any} */ f) => plain(f?.title);
  const lines = (/** @type {any} */ f) => (f?.buttons ?? []).map((/** @type {string} */ b) => plain(b));
  const text = (/** @type {any} */ f) => plain(f?.body); // the harness passes the first 300 characters
  async function tap(/** @type {any} */ form, /** @type {any} */ answer, timeout = 200) {
    const next = t.waitForm(op, { timeout }).catch(() => undefined);
    form.answer(answer);
    return next;
  }

  // 3. The start page: every step, in order, with what each needs.
  let shown = t.waitForm(op, { timeout: 100 });
  t.assert(t.cmd(op, "/realm:admin_setup").ok, "/realm:admin_setup ran for the operator");
  let page = await shown;
  t.assert(title(page) === "Set up this world", `the wizard opened (got "${title(page)}")`);
  t.log(text(page));
  t.log(JSON.stringify(lines(page)));
  const steps = lines(page).filter((/** @type {string} */ b) => /^\[[ x-]\] /.test(b)).map((/** @type {string} */ b) => b.split("\n")[0].slice(4));
  t.check(JSON.stringify(steps) === JSON.stringify(["Place the Townsfolk", "Add a Town", "Safe Zone at Spawn", "Server Size", "Town Project Spots"]), `the steps of the installed packs, in order (${steps.join(", ")})`);
  t.check(/0 of 5 done/.test(text(page)), "nothing is done on a new world");
  t.check(lines(page).some((/** @type {string} */ b) => /^\[ \] Place the Townsfolk\nnone placed yet/.test(b)), "the townsfolk step says none are placed (Townsfolk answered)");
  t.check(lines(page).some((/** @type {string} */ b) => /^\[ \] Server Size\nnot chosen \(now Small Realm\)$/.test(b)), "the size step says it isn't chosen, and what the settings match");
  t.check(lines(page)[0].startsWith("Start\nPlace the Townsfolk"), `the first button starts at the first step (${lines(page)[0]})`);

  // 4. Step 1: what, why, its own commands, Skip.
  page = await tap(page, 0);
  t.assert(title(page) === "Set up: step 1 of 5", `step 1 opened (got "${title(page)}")`);
  t.log(text(page));
  t.check(/^Place the Townsfolk\nNot done yet: none placed yet\n\nStand inside each one's house/.test(text(page)), "it says what it is, whether it's done and what to do");
  t.check(lines(page).some((/** @type {string} */ b) => b.startsWith("Place Townsfolk\nRuns /realm:npc_add")) && lines(page).some((/** @type {string} */ b) => b.startsWith("Townsfolk to Houses\nOr /realm:npc_houses")), `it offers both Townsfolk commands (${lines(page).join(" | ")})`);
  t.check(!lines(page).some((/** @type {string} */ b) => b.startsWith("Mark as done")), "no Mark as done where the pack can tell");
  page = await tap(page, "Skip");

  // 5. Step 2: add a town through the step's own command; the step comes back done.
  t.assert(title(page) === "Set up: step 2 of 5", `Skip went to step 2 (got "${title(page)}")`);
  t.check(/Why: Town Projects, festivals, sieges/.test(text(page)), "and why it's needed");
  const ran = t.waitMessage(op, /Ran \/realm:town_add/, { pack: "admin_bp", timeout: 200 });
  const form = await tap(page, "Add Town");
  t.assert(form?.type === "modal", "the town's name is asked for");
  page = await tap(form, { "Town name": "Harbor" }, 300);
  await ran;
  t.assert(title(page) === "Set up: step 2 of 5", `the step came back after the command (got "${title(page)}")`);
  t.log(text(page));
  t.check(/Done: 1 town/.test(text(page)), "and says the town is there");
  page = await tap(page, "Next");

  // 6. Step 3: the town's zone covers world spawn, so it's done already.
  t.assert(title(page) === "Set up: step 3 of 5", `step 3 (got "${title(page)}")`);
  t.check(/Done: a town covers spawn/.test(text(page)), `a safe zone at spawn is detected (${plain(page.body)})`);
  page = await tap(page, "Next");

  // 7. Step 4: Server size has its own page (admin-size-profile.js tests applying one); skip it here.
  t.assert(title(page) === "Set up: step 4 of 5", `step 4 (got "${title(page)}")`);
  t.check(lines(page).some((/** @type {string} */ b) => b.startsWith("Choose a size")), "the size step offers the size page");
  const sizes = await tap(page, "Choose a size");
  t.check(title(sizes) === "Server size" && lines(sizes).some((/** @type {string} */ b) => b.startsWith("Small Realm (now)")) && lines(sizes).some((/** @type {string} */ b) => b.startsWith("Large server")), `the size page shows both, Small Realm now (${lines(sizes).join(" | ")})`);
  page = await tap(sizes, "Back");
  t.assert(title(page) === "Set up: step 4 of 5", `Back returns to the step (got "${title(page)}")`);
  page = await tap(page, "Skip");

  // 8. Step 5: no pack can tell, so it can be marked done; that ends with the summary.
  t.assert(title(page) === "Set up: step 5 of 5", `step 5 (got "${title(page)}")`);
  t.check(/Not checked: can't be checked from here/.test(text(page)), "it says it can't be checked");
  const finished = t.waitMessage(op, /Setup finished: 3 done, 2 skipped/, { pack: "admin_bp", timeout: 200 });
  page = await tap(page, "Mark as done");
  t.assert(title(page) === "Setup summary", `the summary came last (got "${title(page)}")`);
  t.log(text(page));
  t.check(/3 done, 2 skipped/.test(plain(page.body)), "it counts what's done and skipped");
  t.check(/\[-\] Place the Townsfolk: skipped/.test(text(page)) && /\[x\] Add a Town: done/.test(text(page)) && /\[x\] Town Project Spots: done/.test(text(page)), "and lists each step");
  await finished;

  // 9. The start page now has every mark, and no reminder button; a new operator isn't reminded.
  page = await tap(page, "All steps");
  t.check(/3 of 5 done/.test(text(page)) && lines(page)[0].startsWith("See the summary"), "the start page knows every step was seen");
  t.check(!lines(page).some((/** @type {string} */ b) => b.startsWith("Don't remind operators")), "no reminder to dismiss once finished");
  page.answer(null);
  const late = await t.player("Late", { op: true });
  await t.wait(70);
  t.check(reminder(late).length === 0, `an operator joining after the setup is finished isn't reminded (${reminder(late).length})`);

  // 10. Operator Tools shows the same marks in its checklist.
  shown = t.waitForm(op, { timeout: 100 });
  t.assert(t.cmd(op, "/realm:admin").ok, "/realm:admin ran");
  const menu = await shown;
  const tools = await tap(menu, "Operator Tools");
  t.check(lines(tools)[0].startsWith("Set up this world"), `Operator Tools starts with Set up this world (${lines(tools)[0]})`);
  t.check(lines(tools).some((/** @type {string} */ b) => b.startsWith("[x] Add a Town")) && lines(tools).some((/** @type {string} */ b) => b.startsWith("[-] Place the Townsfolk")), `the checklist has the wizard's marks (${lines(tools).filter((/** @type {string} */ b) => b.startsWith("[")).join(" | ")})`);
  tools?.answer(null);
}
