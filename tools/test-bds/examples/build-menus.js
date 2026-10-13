// Easy Building (build_bp) menus stay open: switching build mode, saving a shape, Cancel in a shape's settings,
// Back from the sub-menus and toggles there all bring the menu back, and only the X closes it. Also: holding the
// Building Book's use (sneaking) switches build mode once, not on and off again.
// Run with: node tools/test-bds/run.mjs --quiet --flat --only build_bp --scenario tools/test-bds/examples/build-menus.js
export default async function (t) {
  const { ItemStack } = t.mc;
  const p = await t.player("Menus", { x: 0, z: 0, gameMode: "creative" });
  t.formTimeout = 60;

  /** Waits for the next form, checks its title and answers it; returns the form. */
  const step = async (title, answer, label) => {
    const f = await t.waitForm(p, { timeout: 100 });
    t.assert(f.title === title, `${label}: the ${title} menu shows (got ${f.title})`);
    f.answer(answer);
    return f;
  };
  /** No form comes within `ticks`. */
  const noForm = async (ticks, label) => {
    const before = t.forms(p).length;
    await t.wait(ticks);
    t.check(t.forms(p).length === before, `${label}: no menu comes back (${t.forms(p).length - before} did)`);
  };

  // Build mode on: the menu comes back, says so, and the button shows On.
  const first = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
  (await first).answer("Build mode");
  let f = await step("Easy Building", "Choose a shape", "after Build mode");
  t.check(f.buttons[0].includes("On"), `the button says build mode is on (${f.buttons[0]})`);
  t.check(/Build mode on/.test(f.body), `the menu says build mode is on (${f.body.split("\n")[0]})`);

  // A shape's settings: Cancel goes back to the list of shapes, Back to the menu.
  await step("Choose a shape", "Wall", "shape list");
  await step("Wall", null, "wall settings");
  await step("Choose a shape", "Back", "back at the list after Cancel");
  // Saving a shape comes back to the menu with what it did at the top.
  f = await step("Easy Building", "Choose a shape", "after Back");
  await step("Choose a shape", "Floor", "shape list again");
  await step("Floor or platform", true, "floor settings");
  f = await step("Easy Building", "Modifiers", "after Use this shape");
  t.check(/Floor .*build mode is on/.test(f.body), `the menu says the floor is picked (${f.body.split("\n")[0]})`);
  t.check(f.body.includes("Shape: Floor"), "and shows it as the shape");
  // A saved modal form comes back too.
  await step("Modifiers", { "Mirror X": true }, "modifiers");
  f = await step("Easy Building", "Copy, cut and paste", "after saving modifiers");
  t.check(/Modifiers:.*mirror/i.test(f.body.split("\n")[0]), `the menu says what the modifiers are (${f.body.split("\n")[0]})`);

  // Sub-menus: toggles stay, Back comes back to the menu.
  await step("Copy, cut and paste", "Back", "copy menu");
  await step("Easy Building", "Destroy mode", "after Back from copy");
  f = await step("Destroy mode", "Destroy mode: Off", "destroy menu");
  f = await step("Destroy mode", "Back", "destroy menu after the toggle");
  t.check(f.buttons[0].includes("On"), `the destroy menu came back with the switch on (${f.buttons[0]})`);
  f = await step("Easy Building", "Get a Building Book", "after Back from destroy");
  f = await step("Easy Building", null, "after getting the book");
  t.check(/Building Book/.test(f.body), `the menu says the book was given (${f.body.split("\n")[0]})`);
  // The X closes it for good.
  await noForm(40, "after the X");

  // X in a sub-menu closes everything.
  const again = t.waitForm(p, { timeout: 100 });
  t.cmd(p, "/realm:build");
  (await again).answer("Copy, cut and paste");
  await step("Copy, cut and paste", null, "copy menu, closed");
  await noForm(40, "after the X in a sub-menu");

  // Holding the Building Book's use while sneaking switches build mode once (it was on: now off), however long.
  // (A held use repeats every 12 ticks or so; before the fix that switched it off, on and off again.)
  const c = p.getComponent("inventory").container;
  c.clearAll();
  c.setItem(0, new ItemStack("realm:building_book", 1));
  p.selectedSlotIndex = 0;
  t.clearMessages();
  p.isSneaking = true;
  for (let i = 0; i < 8; i++) {
    p.useItemInSlot(0);
    await t.wait(4);
  }
  p.isSneaking = false;
  await t.wait(10);
  const toggles = t.messages(p).filter((m) => m.pack === "build_bp" && /Build mode (on|off)/.test(m.plain));
  t.check(toggles.length === 1 && /Build mode off/.test(toggles[0].plain), `one long sneak-use switched build mode once (${toggles.map((m) => m.plain).join(" | ") || "nothing"})`);
  // A new press after a pause switches it again.
  await t.wait(10);
  p.isSneaking = true;
  p.useItemInSlot(0);
  const m = await t.waitMessage(p, /Build mode on/, { kind: "actionbar", timeout: 40 });
  t.check(!!m, "a new press switches it back on");
  p.isSneaking = false;
}
