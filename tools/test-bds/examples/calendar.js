// Realm Calendar (calendar_bp): the day counter handed over from Townsfolk (no jump, no reset), festivals starting
// and ending on the right days with cal:festival reaching Story Questlines (a festival chapter offered, then not),
// activity limits per festival (not per day), the regatta's checkpoints, a siege end to end (warning, circles,
// bells, held: rewards and realm:town_state; failed: Shaken), no siege at a town kept safe from world events,
// the Atlas cairn reduction, and after a restart mid-siege: no mobs left and the circles put back.
//   node tools/test-bds/run.mjs --quiet --flat --only calendar_bp,npc_bp,saga_bp,town_bp --scenario tools/test-bds/examples/calendar.js --timeout 900
export default async function (t) {
  const sys = t.system;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:calendar", "realm:calendar_state", "realm:npc_offer", "realm:siege", "realm:town_state", "realm:town_list", "realm:quest_done", "realm:gossip", "realm:sky_event"].includes(id)) return;
      try {
        ev.push({ id, m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const dbg = (m) => sys.sendScriptEvent("realm:calendar_debug", JSON.stringify(m));
  const state = async (m = {}) => {
    const since = sys.currentTick;
    dbg({ action: "state", ...m });
    await t.waitUntil(() => of("realm:calendar_state", () => true, since).length > 0, { timeout: 40, message: `calendar_state ${m.action ?? "state"}` });
    return of("realm:calendar_state", () => true, since).at(-1);
  };
  const crowns = (p) => {
    try {
      return t.world.scoreboard.getObjective("crowns")?.getScore(p) ?? 0;
    } catch {
      return 0;
    }
  };
  const ribbons = (p) => {
    const inv = p.getComponent("minecraft:inventory").container;
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (it?.typeId === "minecraft:paper" && it.nameTag?.includes("Festival Ribbon")) n += it.amount;
    }
    return n;
  };
  const dawn = async () => {
    t.server("/time set 13000");
    await t.wait(25);
    t.server("/time set 1000");
    await t.wait(25);
  };
  /** Does Story Questlines offer this story at this NPC? */
  const offers = async (p, npc, story) => {
    const req = `test:${sys.currentTick}:${Math.random()}`;
    sys.sendScriptEvent("realm:npc_talk", JSON.stringify({ req, player: p.id, npc, roles: ["questgiver"], name: npc }));
    await t.wait(10);
    return of("realm:npc_offer", (m) => m.req === req).some((m) => String(m.key).includes(story));
  };

  if (t.phase === 2) {
    const p = await t.player("Back", { op: true, x: 0, z: 0 });
    await t.wait(60);
    const st = await state({ player: p.id });
    t.log("after restart:", JSON.stringify({ siege: st.siege, mobs: st.mobs, restore: st.restore, day: st.day }));
    t.check(!st.siege, "the siege running at the restart ended");
    t.check(st.mobs === 0, `no Choir mobs after the restart (${st.mobs})`);
    // The circles are put back once their spots are loaded.
    for (let i = 0; i < 20 && (await state()).restore > 0; i++) await t.wait(40);
    const st2 = await state();
    t.check(st2.restore === 0, `every circle was put back (${st2.restore} left)`);
    const circles = JSON.parse(String(t.world.getDynamicProperty("test:circles") ?? "[]"));
    for (const c of circles) {
      const b = t.dimension.getBlock({ x: c[0], y: c[1] - 1, z: c[2] });
      t.check(b && b.typeId !== "minecraft:gray_concrete", `circle floor at ${c[0]}, ${c[2]} restored (${b?.typeId})`);
    }
    t.check(st2.day === Number(t.world.getDynamicProperty("test:day")), `the day survived the restart (${st2.day})`);
    return;
  }

  const p = await t.player("Tester", { op: true, x: 0, z: 0 });
  const sam = await t.player("Sam", { x: 4, z: 4 });
  // Simulated players load no chunks: the ring where the circles rise (48-96 blocks out) is loaded by hand.
  for (const [x, z] of [[64, 0], [-64, 0], [0, 64], [0, -64], [60, 60], [-60, -60]]) await t.loadArea(x, z, { radius: 4 });
  await t.wait(60);

  // --- Handoff: Townsfolk counted to day 3; Realm Calendar takes that day once, then counts on its own.
  let st = await state();
  t.check(st.owned && st.day === 1, `calendar owns the counter from day 1 (${st.day})`);
  dbg({ action: "forget" });
  await t.wait(5);
  await dawn();
  await dawn();
  await t.wait(260);
  st = await state();
  t.check(st.owned && st.day === 3, `took Townsfolk's day 3 (no reset, no jump): ${st.day}`);
  const fromUs = of("realm:calendar", (m) => m.from === "calendar_bp");
  t.check(fromUs.at(-1)?.day === 3, "calendar_bp broadcasts the day");
  const since0 = sys.currentTick;
  await dawn();
  st = await state();
  t.check(st.day === 4, `one dawn later: day 4 (${st.day})`);
  t.check(of("realm:calendar", (m) => m.from === "npc_bp", since0 + 5).length === 0, "Townsfolk stopped broadcasting");

  // --- Festivals: day 9 none; day 10 the Hatchling Tide; cal:festival reaches the story pack.
  dbg({ action: "setday", doy: 9 });
  await t.wait(20);
  t.check(!(await offers(p, "wren", "fest_hatchlings")), "no festival chapter on day 9");
  dbg({ action: "setday", doy: 10 });
  await t.wait(20);
  st = await state({ player: p.id });
  t.check(st.cal.festival === "hatchling_tide" && st.fk.endsWith(":hatchling_tide"), `day 10 is the Hatchling Tide (${st.cal.festival})`);
  t.check(of("realm:calendar", (m) => m.from === "calendar_bp" && m.festival === "hatchling_tide").length > 0, "realm:calendar carries the festival");
  t.check(await offers(p, "wren", "fest_hatchlings"), "Wren offers the festival chapter during the Hatchling Tide");

  // --- Activity limits are per festival: 3 counts, then nothing (also on the next day).
  const c0 = crowns(p);
  for (let i = 0; i < 2; i++) dbg({ action: "complete", player: p.id, activity: "nest_watch" });
  await dawn(); // day 11, same festival
  for (let i = 0; i < 2; i++) dbg({ action: "complete", player: p.id, activity: "nest_watch" });
  await t.wait(5);
  st = await state({ player: p.id });
  t.check(st.p.a.nest_watch === 3, `nest_watch counted 3 times (${st.p.a.nest_watch})`);
  t.check(ribbons(p) === 6 && st.p.r === 6, `6 ribbons (${ribbons(p)}, saved ${st.p.r})`);
  t.check(crowns(p) - c0 === 60, `60 Crowns (${crowns(p) - c0})`);
  t.check(of("realm:quest_done", (m) => m.pack === "calendar_bp" && m.id === "cal:nest_watch").length === 3, "quest_done sent 3 times");
  // Turtle feeding by debug (5 feeds = 1).
  for (let i = 0; i < 5; i++) dbg({ action: "feed", player: p.id });
  await t.wait(5);
  st = await state({ player: p.id });
  t.check(st.p.a.turtle_feed === 1, "5 feeds = one Turtle Feeding");

  // --- The festival ends: day 14 has none; the chapter isn't offered any more.
  dbg({ action: "setday", doy: 14 });
  await t.wait(20);
  t.check(!(await offers(p, "wren", "fest_hatchlings")), "no festival chapter after the festival");

  // --- Regatta: 8 checkpoints and back to the start.
  dbg({ action: "setday", doy: 34 });
  await t.wait(20);
  dbg({ action: "race", player: p.id });
  await t.wait(10);
  for (let i = 0; i < 9; i++) {
    dbg({ action: "cp", player: p.id });
    await t.wait(12);
  }
  st = await state({ player: p.id });
  t.check(st.p.a.regatta === 1, `regatta finished (${JSON.stringify(st.p.a)}, at ${st.race})`);
  t.check(st.p.r === 3, `the regatta pays 3 ribbons (${st.p.r}; a new festival starts at 0)`);

  // --- A town for the sieges (kept safe from world events at first).
  p.teleport({ x: 0.5, y: -60, z: 0.5 });
  sam.teleport({ x: 2.5, y: -60, z: 2.5 });
  await t.wait(10);
  sys.sendScriptEvent("realm:town_test", JSON.stringify({ action: "add", player: "Tester", name: "Riverside" }));
  await t.waitUntil(() => of("realm:town_list", (m) => m.parts > 0).length > 0, { timeout: 100, message: "realm:town_list" });
  const town = of("realm:town_list", (m) => m.parts > 0).at(-1).towns[0];
  t.check(town.safe === true, "a new town is kept safe from world events");
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "spare1", pack: "calendar_bp", key: "spareSafeTowns", value: true }));
  dbg({ action: "setday", doy: 40 });
  await t.wait(20);
  dbg({ action: "siege", player: p.id, warn: 1 });
  await t.wait(10);
  st = await state();
  t.check(!st.siege || st.siege.town !== town.id, `no siege at the safe town (${st.siege?.town})`);
  dbg({ action: "end" });
  await t.wait(10);
  sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "spare2", pack: "calendar_bp", key: "spareSafeTowns", value: false }));
  sys.sendScriptEvent("realm:town_test", JSON.stringify({ action: "protect", town: town.id, on: false }));
  await t.waitUntil(() => of("realm:town_list", (m) => m.parts > 0 && m.towns[0]?.safe === false).length > 0, { timeout: 100, message: "town no longer safe" });

  // --- Cairns: 6 silenced realm-wide = 2 fewer Choir mobs.
  for (let i = 0; i < 6; i++) dbg({ action: "cairn", key: `0,${i},1` });
  dbg({ action: "cairn", key: "0,0,1" }); // the same cairn twice counts once
  await t.wait(5);
  st = await state();
  t.check(st.cairns === 6 && st.red === 2, `6 cairns, 2 fewer mobs (${st.cairns}, ${st.red})`);

  // --- Siege, held: warning, circles, singers, bells.
  t.server("/time set 14000");
  let since = sys.currentTick;
  dbg({ action: "siege", player: p.id, town: town.id, warn: 3, pillagers: 4 });
  await t.waitMessage(p, /Gray Choir is coming to Riverside/, { since, timeout: 60 });
  t.check(of("realm:siege", (m) => m.state === "warn", since).length === 1, "realm:siege warn");
  await t.waitUntil(() => of("realm:siege", (m) => m.state === "on", since).length > 0, { timeout: 300, message: "the circles rise" });
  await t.wait(10);
  st = await state();
  t.log("siege:", JSON.stringify(st.siege), "mobs", st.mobs, st.kinds);
  t.check(st.siege?.c.length === 3, `3 circles (${st.siege?.c.length})`);
  const planned = st.siege.c.reduce((n, c) => n + c[5], 0);
  t.check(planned === 12 - 2, `12 Chanters less 2 for the cairns: ${planned}`);
  t.check(st.mobs >= 3 && st.mobs <= 24, `at most 24 Choir mobs (${st.mobs})`);
  // Pillagers despawn far from players; near a circle its Chanters (and its Singer) are there.
  const c2 = st.siege.c[2];
  p.teleport({ x: c2[0] + 8.5, y: -60, z: c2[2] + 0.5 });
  await t.wait(130);
  const at2 = t.dimension.getEntities({ tags: ["realm:siege_c2"] });
  t.check(at2.length === 1 + c2[5], `circle 3 has its Singer and ${c2[5]} Chanters (${at2.length})`);
  p.teleport({ x: 0.5, y: -60, z: 0.5 });
  for (const c of st.siege.c) {
    const d = Math.hypot(c[0] - town.x, c[2] - town.z);
    t.check(d >= 40 && d <= 110, `circle ${c[0]}, ${c[2]} is ${Math.round(d)} blocks out`);
    t.check(t.dimension.getBlock({ x: c[0], y: c[1], z: c[2] })?.typeId === "minecraft:bell", "a bell at the circle");
    t.check(t.dimension.getBlock({ x: c[0], y: c[1] - 1, z: c[2] })?.typeId === "minecraft:gray_concrete", "a gray concrete floor");
  }
  const banners = at2.filter((e) => e.isValid && e.typeId === "minecraft:pillager").filter((e) => {
    try {
      return e.runCommand("testfor @s[hasitem={item=banner,location=slot.armor.head}]").successCount > 0;
    } catch {
      return false;
    }
  });
  t.check(banners.length === 0, `no pillager wears a banner (${banners.length})`);
  // A bell with its Singer alive doesn't count.
  dbg({ action: "bell", player: p.id, circle: 0 });
  await t.wait(5);
  st = await state();
  t.check(st.siege.c[0][3] === 0, "the Singer guards the bell");
  dbg({ action: "singers" });
  await t.wait(10);
  // Calendar's own town news (kinds below) is one line per 1000 ticks (NEWS_GAP): wait, on the observed ticks of its last line, until the gap is open, so the held siege's line must come out.
  const calNews = (/** @type {number} */ before) => ev.filter((e) => e.id === "realm:gossip" && ["carve_off", "regatta", "siege", "siege_lost"].includes(e.m.kind) && e.tick < before).map((e) => e.tick).at(-1);
  await t.waitUntil(() => calNews(Infinity) === undefined || sys.currentTick - calNews(Infinity) >= 1000, { timeout: 1100, message: "the calendar news gap to open" });
  const cr = crowns(p);
  since = sys.currentTick;
  for (let i = 0; i < 3; i++)
    for (let k = 0; k < 5; k++) {
      dbg({ action: "bell", player: p.id, circle: i });
      await t.wait(2);
    }
  await t.waitUntil(() => of("realm:siege", (m) => m.state === "end", since).length > 0, { timeout: 100, message: "siege end" });
  t.check(of("realm:siege", (m) => m.state === "end", since)[0].result === "held", "the siege was held");
  t.check(crowns(p) - cr === 60, `60 Crowns for holding (${crowns(p) - cr})`);
  t.check(of("realm:quest_done", (m) => m.kind === "siege" && m.guild === "wardens" && m.player === p.id, since).length === 1, "quest_done kind siege for the Wardens");
  t.check(of("realm:town_state", (m) => m.town === town.id && m.mood === "heartened" && m.until > Date.now(), since).length === 1, "realm:town_state Heartened");
  const heldNews = of("realm:gossip", (m) => m.kind === "siege", since);
  t.assert(heldNews.length === 1, "the held siege tells one piece of town news (gap was open)");
  const heldNewsTick = ev.find((e) => e.id === "realm:gossip" && e.m.kind === "siege" && e.tick >= since)?.tick;
  t.assert(Number.isFinite(heldNewsTick), "the held siege's news has an observed event tick");
  t.check(of("realm:gossip", (m) => m.kind === "siege" && m.player === sam.id, since).length === 0, "Sam (no hit, not 3 minutes near) isn't a participant");
  await t.wait(10);
  st = await state();
  t.check(st.mobs === 0, `every Choir mob is gone (${st.mobs})`);
  const prev = JSON.parse(JSON.stringify(of("realm:calendar_state").at(-2)?.siege?.c ?? []));
  for (const c of prev) t.check(t.dimension.getBlock({ x: c[0], y: c[1] - 1, z: c[2] })?.typeId !== "minecraft:gray_concrete", `circle at ${c[0]}, ${c[2]} put back`);

  // --- Siege, failed: the song runs out. Shaken.
  since = sys.currentTick;
  dbg({ action: "siege", player: p.id, town: town.id, warn: 1 });
  await t.waitUntil(() => of("realm:siege", (m) => m.state === "on", since).length > 0, { timeout: 200, message: "second siege on" });
  await t.wait(10);
  dbg({ action: "bell", player: p.id, circle: 0 }); // takes part (a hit)
  await t.wait(5);
  dbg({ action: "expire" });
  await t.waitUntil(() => of("realm:siege", (m) => m.state === "end", since).length > 0, { timeout: 100, message: "second siege end" });
  t.check(of("realm:siege", (m) => m.state === "end", since)[0].result === "failed", "the second siege failed");
  t.check(of("realm:town_state", (m) => m.town === town.id && m.mood === "shaken", since).length === 1, "realm:town_state Shaken");
  t.check(sys.currentTick - heldNewsTick < 1000, "the second siege ends inside the calendar news gap");
  t.check(of("realm:gossip", (m) => m.kind === "siege_lost" && m.player === p.id, since).length === 0, "the news gap (the held siege's line was under 1000 ticks ago) drops the second cosmetic line without changing its result or town mood");

  // --- A third siege, left running for the restart.
  since = sys.currentTick;
  dbg({ action: "siege", player: p.id, town: town.id, warn: 1 });
  await t.waitUntil(() => of("realm:siege", (m) => m.state === "on", since).length > 0, { timeout: 200, message: "third siege on" });
  await t.wait(20);
  st = await state();
  t.check(st.mobs > 0 && st.restore === 3, `third siege: ${st.mobs} mobs, 3 circles to put back`);
  t.world.setDynamicProperty("test:circles", JSON.stringify(st.siege.c));
  t.world.setDynamicProperty("test:day", st.day);
  t.restart("restart mid-siege");
}
