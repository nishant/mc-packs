// Expansive Inventory, "Fill earlier pages" with a stack locked to its slot (lock_in_slot) on the page in view (OPEN.md F1,
// fixed in 4a9e3b85). Before that fix the locked stack was written back with the planner's merge sentinel as its amount,
// which no ItemStack can hold, so its slot was emptied: the stack was lost. Two rounds, with the page in view being a
// source (page 2: a locked stack and movable stacks; page 1 has room) and then a destination (page 1: a locked stack
// and a movable one; page 3 holds movable stacks). Each round checks the locked stack keeps its amount, lock and slot,
// the movable stacks went to earlier pages, and the census of every page together (each kind's total) is unchanged.
// Run: node tools/test-bds/run.mjs --quiet --only stash_bp --scenario tools/test-bds/examples/stash-fill-locked.js --timeout 600
export default async function (t) {
  const mc = t.mc;
  const p = await t.player("Filler", { op: true });
  t.cmd(p, "/gamemode survival");
  const inv = p.getComponent("minecraft:inventory").container;
  const STORAGE = [9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
  const PAGES = 5;
  const mk = (id, n = 1) => new mc.ItemStack(id, n);
  const locked = (id, n, name) => {
    const it = mk(id, n);
    it.nameTag = name;
    it.lockMode = mc.ItemLockMode.slot;
    return it;
  };
  const pageNow = () => Number(/Page (\d+)\//.exec(inv.getItem(16)?.nameTag ?? "")?.[1] ?? 0);
  const next = async () => {
    const want = (pageNow() % PAGES) + 1;
    inv.setItem(17, undefined);
    await t.waitUntil(() => pageNow() === want, { timeout: 100, message: `switched to page ${want}` });
    await t.wait(6);
  };
  const goTo = async (page) => {
    for (let i = 0; i < PAGES && pageNow() !== page; i++) await next();
    t.assert(pageNow() === page, `on page ${page}`);
  };
  /** Every page's stacks, slot by slot, visiting each page once and coming back to the page in view. */
  const pagesNow = async () => {
    const start = pageNow();
    /** @type {Map<number, Map<number, any>>} */
    const out = new Map();
    for (let i = 0; i < PAGES; i++) {
      const slots = new Map();
      for (const s of STORAGE) {
        const it = inv.getItem(s);
        if (it) slots.set(s, { id: it.typeId, n: it.amount, name: it.nameTag, lock: it.lockMode });
      }
      out.set(pageNow(), slots);
      await next();
    }
    t.assert(pageNow() === start, "back on the page in view");
    return out;
  };
  /** Each kind's total over every page, plus the hotbar. @param {Map<number, Map<number, any>>} all */
  const census = (all) => {
    /** @type {Record<string, number>} */
    const out = {};
    for (const slots of all.values()) for (const e of slots.values()) out[`${e.id}|${e.name ?? ""}`] = (out[`${e.id}|${e.name ?? ""}`] ?? 0) + e.n;
    for (let s = 0; s < 9; s++) { const it = inv.getItem(s); if (it) out[`hotbar ${it.typeId}`] = (out[`hotbar ${it.typeId}`] ?? 0) + it.amount; }
    return out;
  };
  const fill = async () => {
    const since = t.tick;
    t.answerForm(p, "Fill earlier pages");
    t.assert(t.cmd(p, "/realm:inv").ok, "the inventory menu opened");
    const said = await t.waitMessage(p, /Moved \d+ items|Nothing fit|can't move|not moved/i, { kind: "chat", timeout: 200, since });
    t.log(said.plain);
    t.assert(/^Moved \d+ items/.test(said.plain), `Fill earlier pages moved something (${said.plain})`);
    await t.wait(10);
  };

  await t.waitUntil(() => inv.getItem(16)?.typeId === "custom:inv_menu", { timeout: 200, message: "pages ready" });
  inv.setItem(0, mk("minecraft:bread", 4));

  // Round 1: the page in view (2) is a source. Page 1 holds a little; page 2 a locked stack and movable stacks.
  inv.setItem(9, mk("minecraft:stone", 20));
  await t.wait(10);
  await goTo(2);
  inv.setItem(18, locked("minecraft:cobblestone", 7, "Anchor"));
  inv.setItem(9, mk("minecraft:dirt", 30));
  inv.setItem(25, mk("minecraft:emerald", 5));
  inv.setItem(30, mk("minecraft:diamond_sword", 1));
  await t.wait(10);
  const before1 = await pagesNow();
  await fill();
  t.assert(pageNow() === 2, "still on page 2");
  const anchor = inv.getItem(18);
  t.assert(anchor?.typeId === "minecraft:cobblestone" && anchor.amount === 7, `the locked stack keeps its amount (${anchor?.typeId} x${anchor?.amount})`);
  t.assert(anchor?.lockMode === mc.ItemLockMode.slot && anchor.nameTag === "Anchor", "and its lock and name");
  t.assert(!inv.getItem(9) && !inv.getItem(25) && !inv.getItem(30), "the movable stacks left page 2");
  const after1 = await pagesNow();
  t.assert(JSON.stringify(census(after1)) === JSON.stringify(census(before1)), `every page together holds the same (${JSON.stringify(census(before1))} -> ${JSON.stringify(census(after1))})`);
  t.check(after1.get(1)?.size === 4, `page 1 took the three movable stacks (${after1.get(1)?.size} stacks there)`);
  t.check([...(after1.get(2)?.values() ?? [])].length === 1, "only the locked stack is left on page 2");

  // Round 2: the page in view (1) is a destination with its own locked stack; page 3 holds movable stacks.
  await goTo(3);
  inv.setItem(9, mk("minecraft:oak_log", 16));
  inv.setItem(10, mk("minecraft:stone", 64));
  await t.wait(10);
  await goTo(1);
  inv.setItem(35, locked("minecraft:iron_ingot", 3, "Keel"));
  await t.wait(10);
  const before2 = await pagesNow();
  await fill();
  t.assert(pageNow() === 1, "still on page 1");
  const keel = inv.getItem(35);
  t.assert(keel?.typeId === "minecraft:iron_ingot" && keel.amount === 3 && keel.lockMode === mc.ItemLockMode.slot && keel.nameTag === "Keel", `the locked stack on page 1 keeps its amount, lock and slot (${keel?.typeId} x${keel?.amount} ${keel?.lockMode})`);
  const after2 = await pagesNow();
  t.assert(JSON.stringify(census(after2)) === JSON.stringify(census(before2)), `every page together holds the same (${JSON.stringify(census(before2))} -> ${JSON.stringify(census(after2))})`);
  t.check(!after2.get(3)?.size, `page 3 emptied into earlier pages (${after2.get(3)?.size} stacks left)`);
  t.check(after2.get(2)?.get(18)?.name === "Anchor" && after2.get(2)?.get(18)?.n === 7, "page 2's locked stack is still in its slot");
  t.assert(inv.getItem(0)?.typeId === "minecraft:bread" && inv.getItem(0).amount === 4, "the hotbar is untouched");
}
