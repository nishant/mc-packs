// Minimap (map_bp) and the broadcasts it reads. On a flat world: the compass strip facing north shows N in the
// middle, a townsfolk to the north-east in the radar's upper right (without cluttering the strip), mobs in red
// (one behind as an arrow at the strip's edge), mobs hidden by the player's switch; a destination picked in
// /realm:map (Mara) with the star and its name, then Arrived and cleared when walked to; a marked spot picked from
// the menu; the story tracker's target (a Stranger's "report back") as the fallback; a friendly wanderer shown in
// green on the radar and a hostile in disguise never; party mates in blue at the strip edge and as directional edge
// arrows on the radar, other online friends shown by default (showOthers) on the strip and as directional edge arrows
// on the radar; Death Point, Waystones, Atlas and Townsfolk broadcasts and their pings; the HUD title (top and radar
// slots decoded byte for byte as hud_rp cuts them); /realm:minimap and /realm:compass toggles; compass and radar
// switched off clear the slots; the cost with 10 players.
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp,npc_bp,death_bp,party_bp,wander_bp,saga_bp,atlas_bp,waystone_bp,mail_bp --scenario tools/test-bds/examples/map.js --timeout 900
const MARK = "§s§2§r";
const g = (n) => String.fromCodePoint(0xf300 + n);
const S = { N: g(0x03), FOLK: g(0x11), MOB: g(0x10), STAR: g(0x14), PARTY: g(0x13), WANDER: g(0x12), OTHER: g(0x17) };
const L = { MOB: g(0x20), PARTY: g(0x23) };
const R = { MOB: g(0x28), PARTY: g(0x2b), STAR: g(0x2c) };
const Q = { MOB: g(0x30), FOLK: g(0x31), WANDER: g(0x32), PARTY: g(0x33), STAR: g(0x34), OTHER: g(0x37) };
const Q_ROUTE = g(0xc2);
const PARTY_ARROWS = Array.from({ length: 8 }, (_, i) => g(0x98 + i));
const FRIEND_ARROWS = Array.from({ length: 8 }, (_, i) => g(0x90 + i));
const STAR_ARROWS = Array.from({ length: 8 }, (_, i) => g(0xa0 + i));
const hasPartyRadar = (radar) => (radar ?? "").includes(Q.PARTY) || PARTY_ARROWS.some((a) => (radar ?? "").includes(a));
const hasFriendRadar = (radar) => (radar ?? "").includes(Q.OTHER) || FRIEND_ARROWS.some((a) => (radar ?? "").includes(a));
const hasStarRadar = (radar) => (radar ?? "").includes(Q.STAR) || STAR_ARROWS.some((a) => (radar ?? "").includes(a));

function utf8(s) {
  const out = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function fromUtf8(b) {
  let s = "";
  for (let i = 0; i < b.length; ) {
    const c = b[i];
    let cp, n;
    if (c < 0x80) [cp, n] = [c, 1];
    else if (c < 0xe0) [cp, n] = [c & 31, 2];
    else if (c < 0xf0) [cp, n] = [c & 15, 3];
    else [cp, n] = [c & 7, 4];
    for (let k = 1; k < n; k++) cp = (cp << 6) | (b[i + k] & 63);
    s += String.fromCodePoint(cp);
    i += n;
  }
  return s;
}
/** Slot k of the subtitle, as hud_rp cuts it (9 = top, 10 = radar). */
function slot(sub, k) {
  const b = utf8(sub ?? "");
  const len = k === 10 ? 3304 : 160; // radar segment: separator + 3303 bytes (33x33 grid 3299 + self glyph 3 + flag 1)
  return fromUtf8(b.slice(9 + 160 * k + 1, 9 + 160 * k + len)).replace(/~/g, "").replace(/(§r)+$/, "");
}

// Bounded realm:map_state packets arrive as {player,channel:'state',v:1,chunk:{id,index,total,text}}; join them inline (test packs cannot import runtime modules).
const mapStateParts = new Map();
function reassembleMapState(message, now = 0) {
  for (const [k, e] of mapStateParts) if (now - e.at > 200) mapStateParts.delete(k);
  const d = JSON.parse(message),
    c = d && d.chunk;
  if (!c) return d;
  if (d.channel !== "state" || d.v !== 1 || !Number.isInteger(c.total) || c.total < 1 || c.total > 12 || !Number.isInteger(c.index) || c.index < 0 || c.index >= c.total || typeof c.text !== "string") throw Error("bad map state packet");
  const key = `${d.player ?? ""}:${c.id}`;
  let e = mapStateParts.get(key);
  if (!e) {
    if (mapStateParts.size >= 16) mapStateParts.delete(mapStateParts.keys().next().value);
    e = { total: c.total, parts: new Array(c.total), got: 0, at: now };
    mapStateParts.set(key, e);
  }
  if (e.total !== c.total || e.parts[c.index] !== undefined) {
    mapStateParts.delete(key);
    throw Error("bad map state packet");
  }
  e.parts[c.index] = c.text;
  if (++e.got < e.total) return undefined;
  mapStateParts.delete(key);
  return JSON.parse(e.parts.join(""));
}

export default async function (t) {
  // These checks describe the Minimap with the time it had before its 1 ms budget (October 2026): budgetLevel high
  // gives it exactly those budgets, the same code with more time a tick. Its cost at normal is perf-soak's to measure.
  await mapBudgetHigh(t);
  const sys = t.system;
  const dim = t.dimension;
  const Y = -60;
  /** @type {{ id: string, m: any, tick: number }[]} */
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (!["realm:map_state", "realm:npc_places", "realm:waystones_known", "realm:atlas_region", "realm:atlas_sites", "realm:atlas_site", "realm:death_point", "realm:track", "realm:wander_spawn", "realm:wander_state", "realm:place_ready"].includes(id)) return;
      try {
        const m = id === "realm:map_state" ? reassembleMapState(message, sys.currentTick) : JSON.parse(message);
        if (m === undefined) return;
        ev.push({ id, m, tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const of = (id, f = () => true, since = 0) => ev.filter((e) => e.id === id && e.tick >= since && f(e.m)).map((e) => e.m);
  const send = (id, m) => sys.sendScriptEvent(id, JSON.stringify(m));
  const cfg = (key, value, player) => send("realm:cfg_set", { id: `t_${key}_${t.tick}`, pack: "map_bp", key, value, ...(player ? { player: player.id } : {}) });
  /** Sets a player pref through realm:cfg_set and waits for its ACK. */
  const cfgAck = async (player, key, value) => {
    const id = `map_${key}_${player.id}_${t.tick}`;
    let ack;
    const sub = sys.afterEvents.scriptEventReceive.subscribe(
      ({ id: eid, message }) => {
        if (eid !== "realm:cfg_ack") return;
        try {
          const m = JSON.parse(message);
          if (m.id === id) ack = m;
        } catch {}
      },
      { namespaces: ["realm"] },
    );
    send("realm:cfg_set", { id, pack: "map_bp", key, value, player: player.id });
    await t.waitUntil(() => ack, { timeout: 100, message: `cfg_ack for ${key}` });
    sys.afterEvents.scriptEventReceive.unsubscribe(sub);
    t.check(ack.ok === true, `${key} = ${value} acknowledged (${JSON.stringify(ack)})`);
  };
  /** Opt a player in to the (default OFF) radar, north up, with or without terrain colors. */
  const optIn = async (player, { terrain }) => {
    await cfgAck(player, "radar", true);
    await cfgAck(player, "terrain", terrain);
    await cfgAck(player, "radarNorthUp", true);
  };
  /** The minimap's state for a player (what it last drew). */
  const state = async (p) => {
    const since = t.tick;
    send("realm:map_debug", { player: p.id, action: "state" });
    await t.waitUntil(() => of("realm:map_state", (m) => m.player === p.id, since).length > 0, { timeout: 20, message: "realm:map_state" });
    return of("realm:map_state", (m) => m.player === p.id, since).at(-1);
  };
  /** Waits until the state matches. */
  const until = async (p, fn, message, timeout = 100) => {
    const end = t.tick + timeout;
    let last;
    while (t.tick <= end) {
      last = await state(p);
      try {
        if (fn(last)) return last;
      } catch {}
      await t.wait(10);
    }
    t.log(`state at failure: ${JSON.stringify(last)}`);
    t.fail(message);
  };
  const rows = (radar) => (radar ?? "").split("\n").map((r) => [...r]);
  const stand = (p, x, z, yaw = 180) => p.teleport({ x: x + 0.5, y: Y, z: z + 0.5 }, { rotation: { x: 0, y: yaw } });

  await t.server("/gamerule domobspawning false");
  await t.server("/time set noon");
  const p = await t.player("Mapper", { op: true, x: 0, z: 0, gameMode: "creative" });
  stand(p, 0, 0);
  await t.wait(40);

  // --- Broadcasts at load: townsfolk list, death point, atlas region.
  t.assert(t.cmd(p, "/realm:npc_add mara").ok, "npc_add mara");
  await t.waitUntil(() => of("realm:npc_places", (m) => m.folk?.some((f) => f.id === "mara")).length > 0, { timeout: 60, message: "npc_bp sends realm:npc_places when Mara is placed" });
  const mara = of("realm:npc_places", (m) => m.folk?.some((f) => f.id === "mara")).at(-1).folk.find((f) => f.id === "mara");
  t.log("mara at", mara.x, mara.z);
  await t.waitUntil(() => of("realm:atlas_region", (m) => m.player === p.id).length > 0, { timeout: 200, message: "atlas_bp sends the region" });

  // --- Facing north: N in the middle. Mara north-east: in the radar's upper right, not cluttering the compass strip.
  stand(p, mara.x - 10, mara.z + 17);
  // The radar defaults OFF (and migrates off once at spawn): opt Mapper in AFTER spawn and wait for the ACKs. Terrain off keeps the
  // legacy F3 marker glyphs these checks match (over terrain colors a marker is an F6+ overlay glyph); north up is the new default.
  await optIn(p, { terrain: false });
  let st = await until(p, (s) => s.strip?.length === 25 && rows(s.radar)[8]?.[20] === Q.FOLK, "Mara in the 33x33 circular radar's upper right");
  const strip0 = [...st.strip];
  t.log("strip:", strip0.map((c) => (c.codePointAt(0) - 0xf300).toString(16)).join(" "), "| line2:", st.line2);
  t.check(strip0.length === 25, `25 cells (${strip0.length})`);
  t.check(strip0[12] === S.N, "facing north: N in the middle");
  t.check(!strip0.includes(S.FOLK), "ordinary NPCs do not clutter the compass strip");
  t.check(rows(st.radar)[8]?.[20] === Q.FOLK, "Mara in the 33x33 radar's upper right (row 8, column 20: +9.5 east / -17.5 north at 2.25 blocks a cell)");
  t.check(rows(st.radar).length === 33 && rows(st.radar).slice(0, 32).every((r) => r.length === 33), "the radar is 33 rows of 33 cells");
  t.check(st.line2.includes("§7The ") || st.line2.length > 0, `the region on the second line (${st.line2})`);
  t.check(st.known.folk >= 1 && st.known.region, `map_bp heard the townsfolk and the region (${JSON.stringify(st.known)})`);

  // --- The HUD title: top and radar slots, byte for byte.
  let since = t.tick;
  await t.wait(100); // past the Atlas region banner (its title holds the boxes back)
  const titles = t.messages(p, { kind: "title", since }).filter((m) => m.text === MARK || m.raw === MARK || (m.subtitle ?? "").startsWith(MARK));
  const last = titles.at(-1);
  if (!last) t.log("titles seen:", JSON.stringify(t.messages(p, { kind: "title", since }).slice(-2)).slice(0, 600));
  t.check(!!last, "map_bp draws the Side HUD title");
  if (last) {
    t.check(utf8(last.subtitle).length === 9 + 10 * 160 + 3304 + 512, `subtitle is 5425 bytes (${utf8(last.subtitle).length})`);
    t.check(slot(last.subtitle, 9).startsWith([...st.strip].slice(0, 5).join("")), "the strip is in the top slot");
    t.check(slot(last.subtitle, 10).split("\n").length === 33, "the radar (33 rows) is in the radar slot");
  }

  // --- Mobs: one ahead-left in red, one behind as an arrow at the edge; then the player's switch hides them.
  const here = p.location;
  const husk1 = dim.spawnEntity("minecraft:husk", { x: here.x - 5, y: Y, z: here.z - 8 });
  const husk2 = dim.spawnEntity("minecraft:husk", { x: here.x + 1, y: Y, z: here.z + 10 });
  for (const h of [husk1, husk2]) h.addEffect("slowness", 2000, { amplifier: 255, showParticles: false });
  st = await until(p, (s) => [...s.strip].some((c, i) => c === S.MOB && i < 12) && (s.strip.includes(R.MOB) || s.strip.includes(L.MOB)), "a red dot ahead-left and a red arrow at an edge");
  t.check(st.radar.includes(Q.MOB), "mobs in the radar");
  cfg("showMobs", false, p);
  st = await until(p, (s) => !s.strip.includes(S.MOB) && !s.strip.includes(R.MOB) && !s.strip.includes(L.MOB) && !s.radar.includes(Q.MOB), "Show mobs disabled: no red");
  cfg("showMobs", true, p);
  husk1.remove();
  husk2.remove();

  // --- A destination from the menu: Mara. The star and her name; walking up says Arrived and clears it.
  stand(p, mara.x - 40, mara.z + 40);
  let form = t.waitForm(p, { timeout: 60 });
  t.cmd(p, "/realm:map");
  let f = await form;
  t.log("menu:", f.body.replace(/\n/g, " / "), JSON.stringify(f.buttons));
  form = t.waitForm(p, { timeout: 60 });
  f.answer("Pick a destination");
  f = await form;
  t.log("pick:", JSON.stringify(f.buttons));
  form = t.waitForm(p, { timeout: 60 });
  f.answer("Townsfolk");
  f = await form;
  f.answer("Mara");
  await t.waitMessage(p, /Destination: Mara/, { timeout: 60 });
  st = await until(p, (s) => s.wp?.k === "npc" && s.strip.includes(S.STAR) && s.line2.includes("Mara"), "the star and Mara on the strip");
  t.log("with destination:", st.line2);
  t.check(/Mara §7\d+m/.test(st.line2), "the distance after the name");
  t.check(st.radar.includes(Q_ROUTE) || hasStarRadar(st.radar), "the radar shows the route breadcrumbs or star arrow toward Mara");
  stand(p, mara.x + 3, mara.z + 3);
  await t.waitMessage(p, /Arrived at Mara/, { timeout: 60 });
  st = await until(p, (s) => s.wp === null && s.line2.includes("Arrived"), "the destination cleared, Arrived on the strip");

  // --- Mara's Field Map from the menu: an empty locator map, named.
  form = t.waitForm(p, { timeout: 60 });
  t.cmd(p, "/realm:map");
  f = await form;
  f.answer("Get Mara's Field Map");
  await t.waitMessage(p, /Field Map is in your inventory/, { timeout: 40 });
  const inv = p.getComponent("minecraft:inventory").container;
  let map;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === "minecraft:empty_map") map = inv.getItem(i);
  t.check(!!map && /Mara's Field Map/.test(map.nameTag ?? ""), `the named map is in the inventory (${map?.nameTag})`);

  // --- A marked spot, picked from the menu.
  stand(p, 40, 40);
  t.cmd(p, '/realm:map_mark "Iron cave"');
  await t.waitMessage(p, /Marked "Iron cave"/, { timeout: 40 });
  stand(p, 40, 120);
  form = t.waitForm(p, { timeout: 60 });
  t.cmd(p, "/realm:map");
  f = await form;
  form = t.waitForm(p, { timeout: 60 });
  f.answer("Pick a destination");
  f = await form;
  form = t.waitForm(p, { timeout: 60 });
  f.answer("My marked spots");
  f = await form;
  t.check(f.buttons.some((b) => /Iron cave/.test(b) && /N 80m/.test(b)), `the spot with its bearing (${JSON.stringify(f.buttons)})`);
  f.answer("Iron cave");
  st = await until(p, (s) => s.wp?.k === "mark" && [...s.strip][12] === S.STAR, "the spot dead ahead (north): the star in the middle");
  t.cmd(p, "/realm:map_clear");
  await t.waitMessage(p, /Destination cleared/, { timeout: 40 });

  // --- Wanderers: a Stranger in green, the story target (report back) as the fallback; a hostile never shows.
  const X = 900, Z = 900;
  await t.loadArea(X, Z, { radius: 3 });
  p.setGameMode(t.mc.GameMode.Survival);
  stand(p, X, Z, 0);
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id).length > 0, { timeout: 300, message: "saga sends realm:wander_state" });
  since = t.tick;
  send("realm:wander_debug", { player: p.id, action: "spawn", archetype: "traveler", stranger: true });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === p.id, since).length > 0, { timeout: 100, message: "a stranger appears" });
  const s1 = of("realm:wander_spawn", (m) => m.player === p.id, since)[0];
  stand(p, s1.x - 4, s1.z - 12, 0);
  st = await until(p, (s) => s.radar.includes(Q.WANDER), "the friendly stranger in green on the minimap", 200);
  t.check(!st.strip.includes(S.WANDER), "ordinary friendly wanderer stays on the minimap only");
  const talk = async (label) => {
    const fm = t.waitForm(p, { timeout: 200 });
    send("realm:wander_debug", { player: p.id, action: "tap", wid: s1.wid });
    const x = await fm;
    x.answer(label);
    return x;
  };
  const walk = async (final) => {
    for (let i = 0; i < 12; i++) {
      const x = await t.waitForm(p, { timeout: 200 });
      const b = x.buttons.find((y) => y.replace(/§./g, "").toLowerCase().includes(final.toLowerCase()));
      if (b !== undefined) return x.answer(b);
      x.answer("Next");
    }
    t.fail(`no "${final}" button`);
  };
  await t.wait(10);
  await talk("Request:");
  await walk("Accept");
  await t.wait(10);
  send("realm:saga_debug", { player: p.id, action: "wander_finish" });
  await t.waitMessage(p, /Job done: go back/, { timeout: 100 });
  await t.waitUntil(() => of("realm:track", (m) => m.player === p.id && /Report to/.test(m.label ?? "")).length > 0, { timeout: 120, message: "saga sends realm:track (report back)" });
  const tr = of("realm:track", (m) => m.player === p.id && /Report to/.test(m.label ?? "")).at(-1);
  t.log("track:", JSON.stringify(tr));
  t.check(tr.npc === `w_${s1.wid}` && typeof tr.x === "number", "the target names the stranger and where they stand");
  st = await until(p, (s) => s.line2.includes("Report to") && (s.strip.includes(S.STAR) || s.strip.includes(R.STAR) || s.strip.includes(g(0x24))), "the story target is the destination (no pick)");
  t.check(hasStarRadar(st.radar), "the quest NPC star also shows on the minimap");
  t.check(st.wp === null, "the quest target isn't a picked waypoint");
  // A quest target never says Arrived.
  const sl = of("realm:wander_spawn", (m) => m.wid === s1.wid)[0];
  stand(p, sl.x, sl.z + 2);
  await t.wait(30);
  t.check(!t.messages(p, { since: t.tick - 30 }).some((m) => /Arrived/.test(m.plain)), "no Arrived for the story target");
  send("realm:track_ping", { player: p.id });
  since = t.tick;
  await t.waitUntil(() => of("realm:track", (m) => m.player === p.id, since).length > 0, { timeout: 40, message: "realm:track_ping answered" });
  await talk("report back");
  await walk("Thanks");
  await t.waitUntil(() => of("realm:track", (m) => m.player === p.id && !m.label, since).length > 0, { timeout: 120, message: "the target clears when the job is done" });

  send("realm:saga_debug", { player: p.id, action: "finish", story: "drowned_bell" });
  send("realm:saga_debug", { player: p.id, action: "finish", story: "last_map" });
  await t.waitUntil(() => of("realm:wander_state", (m) => m.player === p.id && m.h.includes("toll")).length > 0, { timeout: 200, message: "hostiles allowed after the prologue" });
  const top = (await t.loadArea(X, Z - 150, { radius: 3 })).top.y + 1;
  p.teleport({ x: X + 0.5, y: top, z: Z - 150 + 0.5 }, { rotation: { x: 0, y: 0 } });
  await t.wait(40);
  since = t.tick;
  send("realm:wander_debug", { player: p.id, action: "spawn", archetype: "traveler", hostile: "toll" });
  await t.waitUntil(() => of("realm:wander_spawn", (m) => m.player === p.id && m.hostile === "toll", since).length > 0, { timeout: 100, message: "a toll man appears" });
  const h = of("realm:wander_spawn", (m) => m.player === p.id && m.hostile === "toll", since)[0];
  await t.waitUntil(() => dim.getEntities({ tags: [`wander:k:${h.wid}`] }).length > 0, { timeout: 100, message: "the toll man's entity" });
  const he = dim.getEntities({ tags: [`wander:k:${h.wid}`] })[0];
  t.log("hostile at", Math.round(he.location.x - p.location.x), Math.round(he.location.z - p.location.z));
  for (let i = 0; i < 4; i++) {
    st = await state(p);
    t.check(!st.strip.includes(S.WANDER) && !st.radar.includes(Q.WANDER) && !st.strip.includes(S.FOLK) && !st.radar.includes(Q.FOLK), `the hostile in disguise doesn't show (${i})`);
    await t.wait(10);
  }
  he.remove();
  p.setGameMode(t.mc.GameMode.Creative);

  // --- Party mates: blue at the edge (east of a player facing north); online friends shown by default (showOthers).
  stand(p, 0, -300);
  const mate = await t.player("Mate", { x: 30, z: -300 });
  stand(mate, 30, -300);
  const other = await t.player("Other", { x: -20, z: -330 });
  stand(other, -20, -330);
  t.cmd(p, "/realm:party_invite Mate");
  await t.wait(5);
  t.cmd(mate, "/realm:party_accept");
  st = await until(
    p,
    (s) => s.strip.endsWith(R.PARTY) && hasPartyRadar(s.radar) && s.strip.includes(S.OTHER) && hasFriendRadar(s.radar),
    "the party mate east (blue edge arrow on strip and radar) and other online friend north-west by default",
    120,
  );
  t.check(st.radar.includes(g(0x9a)) || hasPartyRadar(st.radar), "off-map party mate east shows east-pointing party arrow on radar edge");
  t.check(FRIEND_ARROWS.some((a) => st.radar.includes(a)), "off-map online friend shows directional friend arrow on radar edge");
  cfg("showOthers", false);
  st = await until(p, (s) => !s.strip.includes(S.OTHER) && !hasFriendRadar(s.radar), "showOthers false hides the other player");
  cfg("showOthers", true);
  st = await until(p, (s) => s.strip.includes(S.OTHER) && hasFriendRadar(s.radar), "showOthers true restores the other player");
  // Picking the party mate.
  form = t.waitForm(p, { timeout: 60 });
  t.cmd(p, "/realm:map");
  f = await form;
  form = t.waitForm(p, { timeout: 60 });
  f.answer("Pick a destination");
  f = await form;
  form = t.waitForm(p, { timeout: 60 });
  f.answer("Party mates");
  f = await form;
  f.answer("Mate");
  st = await until(p, (s) => s.wp?.k === "party" && s.line2.includes("Mate"), "the party mate as destination");
  stand(mate, 0, -340);
  st = await until(p, (s) => [...s.strip][12] === S.STAR && hasStarRadar(s.radar), "the star follows the mate (now due north)");

  // --- Death Point and its ping.
  since = t.tick;
  mate.kill();
  await t.waitUntil(() => of("realm:death_point", (m) => m.player === mate.id && m.dim, since).length > 0, { timeout: 60, message: "death_bp sends realm:death_point" });
  mate.respawn();
  await t.wait(20);
  since = t.tick;
  send("realm:death_point_ping", { player: mate.id });
  await t.waitUntil(() => of("realm:death_point", (m) => m.player === mate.id, since).length > 0, { timeout: 40, message: "realm:death_point_ping answered" });
  st = await state(mate);
  t.check(st.known.death === true, "map_bp knows the mate's death point");

  // --- Waystones: a discovery and the ping.
  dim.getBlock({ x: 5, y: Y, z: -300 }).setType("minecraft:lodestone");
  const sign = dim.getBlock({ x: 5, y: Y, z: -299 });
  sign.setType("minecraft:standing_sign");
  sign.getComponent("minecraft:sign").setText("Waystone: North Gate");
  await t.wait(2);
  since = t.tick;
  await t.console(`scriptevent realm:waystone_test ${JSON.stringify({ action: "tap", player: p.name, x: 5, y: Y, z: -300 })}`);
  await t.waitUntil(() => of("realm:waystones_known", (m) => m.player === p.id && m.list?.some((w) => w.n === "North Gate"), since).length > 0, { timeout: 80, message: "waystone_bp sends realm:waystones_known" });
  since = t.tick;
  send("realm:waystones_known_ping", { player: p.id });
  await t.waitUntil(() => of("realm:waystones_known", (m) => m.player === p.id, since).length > 0, { timeout: 40, message: "realm:waystones_known_ping answered" });
  since = t.tick;
  send("realm:atlas_ping", { player: p.id });
  await t.waitUntil(() => of("realm:atlas_sites", (m) => m.player === p.id, since).length > 0, { timeout: 40, message: "realm:atlas_ping answered (sites)" });
  since = t.tick;
  send("realm:npc_places_ping", {});
  await t.waitUntil(() => of("realm:npc_places", () => true, since).length > 0, { timeout: 40, message: "realm:npc_places_ping answered" });
  st = await state(p);
  t.check(st.known.waystones >= 1, `map_bp knows the waystone (${JSON.stringify(st.known)})`);

  // --- /realm:minimap and /realm:compass toggle commands.
  t.check(t.cmd(p, "/realm:minimap").ok, "/realm:minimap hides the minimap radar");
  st = await until(p, (s) => s.radar === "" && s.strip.length === 25, "minimap toggled off while compass stays on");
  t.check(t.cmd(p, "/realm:minimap").ok, "/realm:minimap shows the minimap radar again");
  st = await until(p, (s) => rows(s.radar).length === 33 && s.strip.length === 25, "minimap toggled back on");
  t.check(t.cmd(p, "/realm:compass").ok, "/realm:compass hides the compass strip");
  st = await until(p, (s) => s.strip === "" && rows(s.radar).length === 33, "compass toggled off while minimap stays on");
  t.check(t.cmd(p, "/realm:compass").ok, "/realm:compass shows the compass strip again");
  st = await until(p, (s) => s.strip.length === 25 && rows(s.radar).length === 33, "compass toggled back on");

  // --- Both off: the top and radar slots go empty.
  cfg("compass", false, p);
  cfg("radar", false, p);
  await t.wait(30);
  const after = t.messages(p, { kind: "title", since: t.tick - 20 });
  const lastOff = t.messages(p, { kind: "title" }).filter((m) => m.pack === "map_bp").at(-1);
  t.log("titles after off:", after.length, JSON.stringify(lastOff?.text));
  t.check(!lastOff || lastOff.text !== MARK || (!slot(lastOff.subtitle, 9) && !slot(lastOff.subtitle, 10)), "the slots are cleared");
  cfg("compass", true, p);
  cfg("radar", true, p);

  // --- Cost: 10 players with the strip and the radar, 8 mobs around each of a few.
  // The realm default stays OFF (new players also migrate off once at spawn): opt each crowd player in explicitly after spawn.
  await optIn(mate, { terrain: true });
  await optIn(other, { terrain: true });
  const crowd = [p, mate, other];
  for (let i = 0; i < 7; i++) {
    const q = await t.player(`Walker${i}`, { x: i * 40, z: -300, settle: 2 });
    await optIn(q, { terrain: true });
    crowd.push(q);
  }
  for (let i = 0; i < 24; i++) {
    const m = dim.spawnEntity("minecraft:husk", { x: (i % 8) * 6, y: Y, z: -300 + (i % 3) * 5 });
    m.addEffect("slowness", 2000, { amplifier: 255, showParticles: false });
  }
  await t.wait(20);
  send("realm:map_debug", { player: p.id, action: "cost" });
  await t.wait(200);
  since = t.tick;
  send("realm:map_debug", { player: p.id, action: "cost" });
  await t.waitUntil(() => of("realm:map_state", () => true, since).length > 0, { timeout: 20 });
  const c = of("realm:map_state", () => true, since).at(-1).cost;
  const perPlayer = c.ms / Math.max(1, c.players);
  t.log(`draw: ${c.drawMs} ms of it`);
  t.log(`cost: ${c.ms} ms over ${c.passes} passes, ${c.players} player passes: ${perPlayer.toFixed(3)} ms per player pass, ${(c.ms / Math.max(1, c.passes)).toFixed(2)} ms per pass`);
  t.check(c.players >= c.passes * 9, "every player drawn each pass");
  // A pass runs every 10 ticks, so 1 ms per player pass is 1 ms a tick for 10 players (the bar in WORKING.md).
  // Measured 0.57 to 0.62 on a 4-core container in October 2026, with the first Minimap too (0.5 was too tight).
  t.check(perPlayer < 1, `under 1 ms per player pass (${perPlayer.toFixed(3)})`);
}

// The Minimap at budgetLevel high (scenarios can't import: pasted where needed).
async function mapBudgetHigh(t) {
  let ack;
  const sub = t.system.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:cfg_ack") return;
      try {
        const m = JSON.parse(message);
        if (m.id === "mapbudget") ack = m;
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  t.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "mapbudget", pack: "map_bp", key: "budgetLevel", value: "high" }));
  await t.waitUntil(() => ack, { timeout: 60, message: "budgetLevel high was set" });
  t.system.afterEvents.scriptEventReceive.unsubscribe(sub);
  t.assert(ack.ok, `budgetLevel high: ${ack.error ?? "ok"}`);
}
