// Minimap: the compass strip turns with the player every tick, not twice a second. A player turning 3 degrees a
// tick gets a new strip (a map_bp title) on most ticks, and the strip on screen one tick after the last turn
// already has north where they now face. A player standing still gets no new titles between passes. Then the
// cost: 10 players turning every tick (at most 8 strips are sent a tick, the longest-waiting players first), the per-tick redraw timed by the pack (realm:map_debug "cost"), and the
// work each other pack's side.js copy does for one realm:side message (JSON.parse and the cleaning), timed here.
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp,hud_bp,mobhp_bp,elytra_bp --scenario tools/test-bds/examples/map-turn.js --timeout 600
const MARK = "§s§2§r";
const g = (n) => String.fromCodePoint(0xf300 + n);
const LETTER = { 0: g(0x03), 90: g(0x04), 180: g(0x05), 270: g(0x06) };

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
/** The strip (first line of slot 9, top) of a subtitle, as hud_rp cuts it. */
function strip(sub) {
  const b = utf8(sub ?? "");
  return [...fromUtf8(b.slice(9 + 160 * 9 + 1, 9 + 160 * 9 + 160)).split("\n")[0]];
}

export default async function (t) {
  const sys = t.system;
  const Y = -60;
  const ev = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:map_state") return;
      try {
        ev.push({ m: JSON.parse(message), tick: sys.currentTick });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const send = (id, m) => sys.sendScriptEvent(id, JSON.stringify(m));
  const titles = (p, since) => t.messages(p, { kind: "title", since }).filter((m) => m.pack === "map_bp" && m.text === MARK);

  await t.server("/gamerule domobspawning false");
  const p = await t.player("Turner", { op: true, x: 0, z: 0, gameMode: "creative" });
  const face = (pl, yaw) => pl.teleport(pl.location, { rotation: { x: 0, y: yaw } });
  face(p, 180); // north
  await t.wait(60);

  // --- Standing still: only the pass's refresh (every REFRESH = 30 ticks at most).
  let since = t.tick;
  await t.wait(60);
  const still = titles(p, since).length;
  t.log(`standing still for 60 ticks: ${still} titles`);
  t.check(still <= 3, `no redraw while standing still (${still} titles in 60 ticks)`);

  // --- Turning 3 degrees a tick for 60 ticks (180 degrees).
  since = t.tick;
  let yaw = 180;
  for (let i = 0; i < 60; i++) {
    yaw += 3;
    face(p, yaw);
    await t.wait(1);
  }
  await t.wait(1);
  const turned = titles(p, since);
  const ticks = new Set(turned.map((m) => m.tick)).size;
  t.log(`turning for 60 ticks: ${turned.length} titles on ${ticks} ticks`);
  t.check(ticks >= 30, `the strip is redrawn while turning, most ticks (${ticks} of 60; twice a second would be 6)`);
  // Facing yaw 360 = south now (heading 180): S in the middle of the last strip.
  const last = strip(turned.at(-1)?.subtitle);
  t.log("last strip middle:", (last[12]?.codePointAt(0) ?? 0).toString(16), "S is", LETTER[180].codePointAt(0).toString(16), "at tick", turned.at(-1)?.tick, "turn ended", t.tick - 2);
  t.check(last[12] === LETTER[180], "the strip on screen faces where the player faces, a tick after the turn");

  // --- Cost: 10 players turning every tick.
  const crowd = [p];
  for (let i = 0; i < 9; i++) crowd.push(await t.player(`Turner${i}`, { x: i * 20, z: 40, settle: 2 }));
  await t.wait(40);
  send("realm:map_debug", { player: p.id, action: "cost" });
  const n = 200;
  for (let i = 0; i < n; i++) {
    for (const [k, q] of crowd.entries()) face(q, 180 + i * (2 + k * 0.5));
    await t.wait(1);
  }
  since = t.tick;
  send("realm:map_debug", { player: p.id, action: "cost" });
  await t.waitUntil(() => ev.some((e) => e.tick >= since), { timeout: 20, message: "realm:map_state" });
  const c = ev.filter((e) => e.tick >= since).at(-1).m.cost;
  t.log(`passes: ${c.ms} ms over ${c.passes} passes (${(c.ms / Math.max(1, c.passes)).toFixed(2)} ms a pass)`);
  t.log(`per tick: ${c.turnMs} ms over ${c.turnTicks} ticks = ${(c.turnMs / Math.max(1, c.turnTicks)).toFixed(3)} ms a tick; ${c.turnDraws} strips built, ${c.turnSends} sent (${(c.turnSends / Math.max(1, c.turnTicks)).toFixed(1)} a tick)`);
  // At most TURN_BUDGET (8) titles a tick: 10 players all turning nonstop share them, the longest-waiting first.
  t.check(c.turnSends <= c.turnTicks * 8, `at most 8 strips sent a tick (${c.turnSends} in ${c.turnTicks} ticks)`);
  t.check(c.turnSends >= c.turnTicks * 6, `the budget is used while everyone turns (${c.turnSends} in ${c.turnTicks} ticks)`);
  // Measured 2.2 to 2.6 ms per sent strip (17 to 21 ms a tick at 8 sends) on the shared dev machine (October 2026);
  // a send is a title command, which dominates the cost, so the bound is per send and the per-tick total follows the budget.
  const perSend = c.turnMs / Math.max(1, c.turnSends);
  t.log(`per send: ${perSend.toFixed(2)} ms`);
  t.check(perSend < 4, `each strip sent costs under 4 ms with 10 players turning nonstop (${perSend.toFixed(2)} ms)`);

  // The same 10 players standing still (after the last of them got their final strip): the per-tick check only
  // reads their rotation and place.
  await t.wait(10);
  send("realm:map_debug", { player: p.id, action: "cost" });
  await t.wait(100);
  since = t.tick;
  send("realm:map_debug", { player: p.id, action: "cost" });
  await t.waitUntil(() => ev.some((e) => e.tick >= since), { timeout: 20, message: "realm:map_state" });
  const idle = ev.filter((e) => e.tick >= since).at(-1).m.cost;
  t.log(`standing still: ${idle.turnMs} ms over ${idle.turnTicks} ticks = ${(idle.turnMs / Math.max(1, idle.turnTicks)).toFixed(3)} ms a tick, ${idle.turnSends} sent`);
  t.check(idle.turnSends === 0, `nothing sent by the per-tick redraw while nobody turns (${idle.turnSends})`);

  // What one realm:side message costs each other pack (side.js: JSON.parse and clean on ~250 bytes), timed here.
  const msg = JSON.stringify({ player: p.id, from: "map", slot: "top", text: `${g(1).repeat(25)}\n§f* Mara 120m  §7Hollow Vale`, ticks: 40, tick: t.tick });
  const clean = (text) => {
    let s = String(text).split("§s§2§r").join("").replace(/[~\r]/g, "");
    let out = "";
    let b = 0;
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      const k = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (b + k > 159) break;
      out += ch;
      b += k;
    }
    return out;
  };
  const N = 20000;
  const t0 = Date.now();
  let sink = 0;
  for (let i = 0; i < N; i++) sink += clean(JSON.parse(msg).text).length;
  const each = (Date.now() - t0) / N;
  t.log(`one realm:side message in one other pack: ${(each * 1000).toFixed(1)} us (x6 other side packs = ${(each * 6 * 1000).toFixed(0)} us a send) [${sink > 0}]`);
}
