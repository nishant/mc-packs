// Easy Building's line above the hotbar follows the action bar protocol, without flooding it. Run with
//   node tools/test-bds/run.mjs --quiet --flat --only build_bp,build_rp --scenario tools/test-bds/examples/build-bar.js --timeout 300
// Checks: holding the Building Book shows its controls and asks other packs to wait (realm:actionbar, steady) a few
// times a second, not every tick; with a mode on and a block in hand, the preview's redrawn line ("Wall ... step 1")
// is announced the same way (before the fix it was drawn with no realm:actionbar at all, so other packs' steady lines
// wrote over it), and the hand is still noticed right after a hotbar slot change.
export default async function (t) {
  const sys = t.mc.system;
  const { ItemStack } = t.mc;
  /** @type {{ tick: number, player: string, steady?: number }[]} */
  const asks = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    if (id !== "realm:actionbar") return;
    try {
      const m = JSON.parse(message);
      if (m.from === "build_bp") asks.push({ tick: sys.currentTick, player: m.player, steady: m.steady });
    } catch {}
  }, { namespaces: ["realm"] });

  await t.loadArea(0, 0, { radius: 3 });
  const p = await t.player("Builder", { x: 0, z: 0, gameMode: "creative", op: true });
  const inv = p.getComponent("minecraft:inventory").container;
  const slotOf = (id) => { for (let i = 0; i < 9; i++) if (inv.getItem(i)?.typeId === id) return i; return -1; };

  t.assert(t.cmd(p, "/realm:build_book").ok, "/realm:build_book ran");
  await t.waitUntil(() => slotOf("eb:building_book") >= 0, { timeout: 60, message: "book in the hotbar" });
  p.selectedSlotIndex = slotOf("eb:building_book");
  await t.wait(10);

  // Holding the book: its controls, announced a few times a second.
  let since = t.tick;
  let from = sys.currentTick;
  await t.wait(40);
  const bookAsks = asks.filter((a) => a.tick >= from && a.player === p.id && a.steady !== undefined).length;
  const bookBars = t.messages(p, { kind: "actionbar", pack: "build_bp", since }).length;
  t.log(`holding the book for 40 ticks: ${bookBars} bar writes, ${bookAsks} steady requests`);
  t.check(bookBars > 0, "the book's controls show above the hotbar");
  t.check(bookAsks >= 2 && bookAsks <= 8, `steady requests a few times a second, not every tick (${bookAsks} in 40 ticks)`);

  // Wall mode with a block in hand: the preview's line is announced too.
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "bb1", pack: "build_bp", key: "floatingUI", value: false, player: p.id }));
  await t.wait(2);
  const formP = t.waitForm(p, { timeout: 100 });
  t.assert(t.cmd(p, "/realm:build").ok, "/realm:build ran");
  const form = await formP;
  const wallIdx = form.buttons.findIndex((b) => /Wall/i.test(b));
  t.assert(wallIdx >= 0, "Wall mode button is in /realm:build menu");
  form.answer(wallIdx);
  await t.wait(10);
  const blockSlot = (p.selectedSlotIndex + 1) % 9;
  inv.setItem(blockSlot, new ItemStack("minecraft:stone", 64));
  p.selectedSlotIndex = blockSlot;
  p.lookAtBlock({ x: Math.floor(p.location.x) + 2, y: Math.floor(p.location.y) - 1, z: Math.floor(p.location.z) });
  await t.wait(5);
  since = t.tick;
  from = sys.currentTick;
  await t.wait(40);
  const modeBars = t.messages(p, { kind: "actionbar", pack: "build_bp", since });
  const modeAsks = asks.filter((a) => a.tick >= from && a.player === p.id && a.steady !== undefined).length;
  t.log(`wall mode, stone in hand, 40 ticks: ${modeBars.length} bar writes (last: ${modeBars.at(-1)?.plain ?? "-"}), ${modeAsks} steady requests`);
  t.check(modeBars.length > 0, "the mode's line shows above the hotbar");
  t.check(modeAsks >= 2, `the mode's redrawn line is announced with realm:actionbar (${modeAsks} in 40 ticks)`);

  // Back to the book: noticed at once (a slot change reads the hand again).
  since = t.tick;
  p.selectedSlotIndex = slotOf("eb:building_book");
  await t.wait(3);
  const back = t.messages(p, { kind: "actionbar", pack: "build_bp", since }).some((m) => /book_controls/.test(m.plain));
  t.check(back, "switching back to the book shows its controls within 3 ticks");
}
