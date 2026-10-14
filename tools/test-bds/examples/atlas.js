// Atlas of the Realm (atlas_bp): a region banner on crossing into another cell; a site is built once when a
// player comes near (and not near a safe zone); first-find rewards are paid once; a shrine blesses once a
// day; a tablet's worn text reads in full after an act (realm:saga_progress); built anchors reach the
// wanderers (realm:poi, as wander_bp reads it); a Choir Cairn's bell broken and its keepers beaten sends
// realm:quest_done atlas:cairn:*; a fossil dig; after a restart the built sites are still there and not rebuilt.
//   node tools/test-bds/run.mjs --quiet --flat --only atlas_bp,saga_bp,wander_bp,titles_bp --scenario tools/test-bds/examples/atlas.js --timeout 600
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:atlas_state", "realm:poi", "realm:quest_done", "realm:saga_progress", "realm:title", "realm:title_unlock", "realm:journal", "realm:skill_xp"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const dbg = (m) => sys.sendScriptEvent("realm:atlas_debug", JSON.stringify(m));
  const state = async (p, action = "state") => {
    const since = sys.currentTick;
    dbg({ player: p.id, action });
    await t.waitUntil(() => of("realm:atlas_state", (m) => m.player === p.id, since).length > 0, { timeout: 40, message: `atlas_state ${action}` });
    return of("realm:atlas_state", (m) => m.player === p.id, since).at(-1);
  };
  const crowns = (p) => {
    try {
      return t.world.scoreboard.getObjective("crowns")?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  /** Teleports next to a slot, loads it and waits until it is built. */
  const buildAt = async (p, slot) => {
    await t.loadArea(slot.x, slot.z, { radius: 3 });
    p.teleport({ x: slot.x + 30.5, y: -60, z: slot.z + 0.5 });
    for (let i = 0; i < 40; i++) {
      const st = await state(p);
      if (st.near.find((r) => r.key === slot.key && r.s === 1)) break;
      await t.wait(20);
    }
    const st = await state(p);
    const r = st.near.find((r) => r.key === slot.key && r.s === 1);
    t.assert(r, `site ${slot.key} built (${JSON.stringify(st.near.slice(0, 3))})`);
    return r;
  };

  if (t.phase === 2) {
    const p = await t.player("Back", { op: true, x: 2000, z: 2000 });
    await t.wait(40);
    const st = await state(p);
    t.check(st.built >= 3, `the built sites are still known after the restart (${st.built})`);
    const before = of("realm:atlas_state").length;
    t.log(`phase 2: ${st.built} built, ${st.skipped} skipped, ${st.cells} regions`);
    // A built site near a player isn't built again (no "built" log, same count).
    await t.seconds(6);
    const st2 = await state(p);
    t.check(st2.built === st.built, "nothing rebuilt");
    t.check(before > 0, "state answered");
    await t.waitUntil(() => of("realm:poi").length > 0, { timeout: 400, message: "built anchors are sent to the wanderers again after a restart" });
    t.pass("phase 2");
    return;
  }

  // Far from spawn (163, 170): the cell that holds (2000, 2000).
  await t.loadArea(2000, 2000, { radius: 2 });
  const p = await t.player("Tester", { op: true, x: 2000, z: 2000 });
  await t.waitUntil(() => of("realm:saga_progress", (m) => m.player === p.id).length > 0, { timeout: 300, message: "saga sends realm:saga_progress on join" });
  t.check(of("realm:saga_progress", (m) => m.player === p.id).at(-1).act === 0, "act 0 for a new player");
  await t.seconds(15); // the pack waits for zones, claims and places after load

  const info = await state(p, "slots");
  t.log(`cell ${info.cell}, slots ${JSON.stringify(info.slots)}`);
  t.assert(info.slots.length >= 2, "2-4 slots per region");
  const [a, b] = info.slots;

  dbg({ action: "prefer", key: a.key, kind: "shrine" });

  // Shrine: built once, found once, paid once, blessed once a day.
  const c0 = crowns(p);
  const shrine = await buildAt(p, a);
  t.log(`shrine at ${shrine.x} ${shrine.y} ${shrine.z}`);
  const hb = t.dimension.getBlock(shrine.h);
  t.check(hb?.typeId === "minecraft:chiseled_stone_bricks", `the shrine's heart is there (${hb?.typeId})`);
  p.teleport({ x: shrine.x + 0.5, y: shrine.y + 1, z: shrine.z + 3.5 });
  await t.waitMessage(p, /Found: Wayside Shrine/, { timeout: 120 });
  await t.wait(10);
  t.check(crowns(p) === c0 + 10, `10 Crowns for the shrine (${crowns(p) - c0})`);
  t.check(of("realm:quest_done", (m) => m.id === `atlas:shrine:${a.key}`).length === 1, "one quest_done for the shrine");
  t.check(of("realm:journal", (m) => m.entry === "atlas_shrine").length === 1, "journal entry for shrines");
  dbg({ player: p.id, action: "use", key: a.key });
  await t.waitMessage(p, /shrine blesses you/, { timeout: 40 });
  t.check(!!p.getEffect("regeneration"), "regeneration on a plains shrine");
  const since = t.tick + 1;
  await t.wait(2);
  dbg({ player: p.id, action: "use", key: a.key });
  await t.wait(10);
  t.check(!t.messages(p, { since }).some((m) => /blesses you/.test(m.plain)), "no second blessing the same day");
  t.check(crowns(p) === c0 + 10, "the shrine pays once");
  t.check(of("realm:quest_done", (m) => m.id === `atlas:shrine:${a.key}`).length === 1, "still one quest_done");
  t.check(of("realm:poi", (m) => m.kind === "shrine" && m.dim === "minecraft:overworld" && Math.floor(m.x) === shrine.x && Math.floor(m.z) === shrine.z && typeof m.name === "string").length >= 1, "realm:poi for the shrine, as wander_bp reads it");

  // Region banner: walk into the next cell to the east.
  const nx = info.min.x + info.size + 40;
  await t.loadArea(nx, b.z, { radius: 2 });
  const sinceB = t.tick;
  p.teleport({ x: nx + 0.5, y: -60, z: b.z + 0.5 });
  const title = await t.waitMessage(p, /^The /, { kind: "title", timeout: 120, since: sinceB });
  t.log(`banner: ${title.plain} / ${title.subtitle}`);
  t.check(/^The /.test(title.plain) && /Region \d+ - 0 of \d sites?/.test((title.subtitle ?? "").replace(/§./g, "")), "region banner with name and sites");
  t.check(of("realm:title", (m) => m.player === p.id && m.from === "atlas_bp", sinceB).length >= 1, "title protocol note before the banner");

  // The next cell's slots: a tablet (gated text), a cairn (quest_done atlas:cairn:*), a fossil dig.
  const info2 = await state(p, "slots");
  t.assert(info2.slots.length >= 2, "slots in the next region");
  const [ta, ca, fo] = info2.slots;
  dbg({ action: "prefer", key: ta.key, kind: "tablet" });
  dbg({ action: "prefer", key: ca.key, kind: "cairn" });
  if (fo) dbg({ action: "prefer", key: fo.key, kind: "fossil" });

  dbg({ player: p.id, action: "tablets", count: 12 }); // tier 1 read: the next is tier 2 (after Act I)
  const tab = await buildAt(p, ta);
  p.teleport({ x: tab.x + 0.5, y: tab.y + 1, z: tab.z + 3.5 });
  const sinceT = t.tick;
  let form = t.waitForm(p, { timeout: 200 });
  dbg({ player: p.id, action: "use", key: ta.key });
  let f = await form;
  t.log(`tablet: ${f.title} / ${f.body.slice(0, 80)}`);
  t.check(/Tablet 13/.test(f.title) && /older script/.test(f.body), "tablet 13 is worn before Act I");
  f.answer(0);
  await t.waitMessage(p, /added to your codex/, { timeout: 60, since: sinceT });
  const sinceP = t.tick;
  sys.sendScriptEvent("realm:saga_progress", JSON.stringify({ player: p.id, act: 1 }));
  await t.waitMessage(p, /read differently now: 1/, { timeout: 60, since: sinceP });
  form = t.waitForm(p, { timeout: 200 });
  dbg({ player: p.id, action: "use", key: ta.key });
  f = await form;
  t.check(/The Hunger Below/.test(f.body) && !/older script/.test(f.body), "the same tablet reads in full after Act I");
  f.answer(0);
  t.check(of("realm:quest_done", (m) => m.id === `atlas:tablet:${ta.key}`).length === 1, "the tablet pays once");

  const cairn = await buildAt(p, ca);
  p.teleport({ x: cairn.x + 0.5, y: cairn.y + 1, z: cairn.z + 6.5 });
  await t.wait(20);
  const cb = t.dimension.getBlock(cairn.h);
  t.check(cb?.typeId === "minecraft:bell", `the cairn's bell (${cb?.typeId})`);
  const sinceC = t.tick;
  dbg({ player: p.id, action: "break", key: ca.key });
  await t.waitMessage(p, /Beat its three keepers/, { timeout: 60, since: sinceC });
  const sf = await state(p);
  t.check(sf.fights.some((x) => x.kind === "cairn" && x.spawned === 3), `three keepers (${JSON.stringify(sf.fights)})`);
  dbg({ player: p.id, action: "kill", key: ca.key });
  await t.waitUntil(() => of("realm:quest_done", (m) => m.id === `atlas:cairn:${ca.key}` && m.guild === "wardens" && m.pack === "atlas_bp").length === 1, { timeout: 200, message: "quest_done atlas:cairn:* after the keepers fall" });

  if (fo) {
    const dig = await buildAt(p, fo);
    p.teleport({ x: dig.x + 0.5, y: dig.y + 1, z: dig.z + 6.5 });
    const sinceF = t.tick;
    for (let i = 0; i < 12; i++) dbg({ player: p.id, action: "break", key: fo.key });
    await t.waitMessage(p, /whole skeleton/, { timeout: 60, since: sinceF });
    t.check(of("realm:skill_xp", (m) => m.skill === "mining").length === 1, "mining XP for the dig");
  }
  // A safe zone over a slot in the region to the south: standing next to it builds nothing.
  const sz = info2.min.z + info2.size + 40;
  await t.loadArea(nx, sz, { radius: 2 });
  p.teleport({ x: nx + 0.5, y: -60, z: sz + 0.5 });
  await t.seconds(3);
  const info3 = await state(p, "slots");
  const zs = info3.slots[0];
  sys.sendScriptEvent("realm:zones", JSON.stringify({ src: "zones", part: 1, parts: 1, zones: [{ id: "t", name: "Test", dim: "minecraft:overworld", x: zs.x, z: zs.z + 60, r: 20 }] }));
  await t.loadArea(zs.x, zs.z, { radius: 3 });
  p.teleport({ x: zs.x + 20.5, y: -60, z: zs.z + 0.5 });
  await t.seconds(8);
  const sb = await state(p);
  t.check(!sb.near.some((r) => r.key === zs.key && r.s === 1), "no site within reach of a safe zone");

  const st = await state(p);
  t.log(`phase 1: ${st.built} built, ${st.skipped} skipped; data ${JSON.stringify(st.data)}`);
  t.check(st.data.r >= 3, "three regions found");
  t.restart("restart");
}
