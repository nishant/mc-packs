// The Minimap's empty panels (map_bp with Side HUD's title protocol). A realm or personal Minimap off must leave the
// radar's slot EMPTY in the subtitle, byte for byte what hud_rp's `realm_radar_panel` compares with ("~" and 450 "§r":
// 1351 bytes), so the whole radar panel and its black background are hidden, not drawn empty (O69, the black square at
// the top right). The compass strip's slot is checked the same way (53 "§r": 159 bytes), and no pack of this run writes
// a quest box, so the quest slot never starts with a quest code. Another readout (a probe in Right 1, as another
// pack's box would be) keeps the Side HUD title on screen while the Minimap parts go, which is when the black square
// showed. Toggled in turn: the player's radar off and on, the compass off and on, the realm option off and on with
// the player's choices kept, both off, and no stale rewrites after that.
// This checks the producer (what the server sends); hud_rp's side is pinned by tools/hud-layout.test.mjs, and what a
// client draws still needs a real-client look (radar, compass and quest box at Right 1-3 and Middle).
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp --scenario tools/test-bds/examples/map-empty-panels.js --timeout 600
const MARK = "§s§2§r";
/** hud_rp's `$radar_empty` and `$slot_empty`: the empty radar and the empty compass strip, as the HUD cuts them. */
const EMPTY_RADAR = `~${"§r".repeat(450)}`;
const EMPTY_SLOT = "§r".repeat(53);

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
/** Slot k's text as hud_rp cuts it: after the title mark, the segments before it (nine of 160 bytes, then the strip's 160, the radar's 1352) and its separator. */
function cut(sub, k) {
  const skip = 9 + (k <= 10 ? 160 * k : 160 * 10 + 1352) + 1;
  const len = k === 10 ? 1351 : k === 11 ? 511 : 159;
  return fromUtf8(utf8(sub ?? "").slice(skip, skip + len));
}

export default async function (t) {
  const sys = t.system;
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:side") return;
      try {
        sides.push({ tick: sys.currentTick, m: JSON.parse(message) });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const cfg = (key, value, player) => sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `empty_${key}_${t.tick}`, pack: "map_bp", key, value, ...(player ? { player: player.id } : {}) }));
  const probe = (p) => sys.sendScriptEvent("realm:side", JSON.stringify({ player: p.id, from: "probe", slot: "right1", text: "§fProbe readout", ticks: 1200, tick: sys.currentTick }));

  await t.server("/gamerule domobspawning false");
  await t.server("/time set noon");
  const p = await t.player("Mapper", { op: true, x: 0, z: 0, gameMode: "creative" });
  p.teleport({ x: 0.5, y: -60, z: 0.5 }, { rotation: { x: 0, y: 180 } });
  await t.wait(40);

  /** The newest Side HUD title map_bp drew for the player. */
  const lastTitle = () => t.messages(p, { kind: "title", pack: "map_bp" }).filter((m) => m.text === MARK).at(-1);
  /** Waits for a newer title whose slots match; fails with what the last one held. */
  const until = async (ok, message, timeout = 200) => {
    const from = t.tick;
    let last;
    await t.waitUntil(
      () => {
        last = t.messages(p, { kind: "title", pack: "map_bp", since: from }).filter((m) => m.text === MARK).at(-1);
        return last && ok(last.subtitle) ? last : false;
      },
      { timeout, message },
    );
    return last;
  };
  const radarOf = (sub) => cut(sub, 10);
  const stripOf = (sub) => cut(sub, 9);
  const probeShows = (sub) => cut(sub, 0).includes("Probe readout");
  const radarOn = (sub) => radarOf(sub) !== EMPTY_RADAR && radarOf(sub).replace(/[~]/g, "").replace(/§r/g, "").length > 100;
  const radarOff = (sub) => radarOf(sub) === EMPTY_RADAR;
  const stripOn = (sub) => stripOf(sub) !== EMPTY_SLOT && stripOf(sub).replace(/[~]/g, "").replace(/§r/g, "").length > 0;
  const stripOff = (sub) => stripOf(sub) === EMPTY_SLOT;

  t.check(utf8(EMPTY_RADAR).length === 1351, "the radar's empty cut is 1351 bytes");
  t.check(utf8(EMPTY_SLOT).length === 159, "the compass strip's empty cut is 159 bytes");

  // --- Both on, and a probe readout in Right 1 so the title stays on screen when the Minimap parts go.
  cfg("compass", true, p);
  cfg("radar", true, p);
  await until((s) => radarOn(s) && stripOn(s), "the radar and the compass strip show");
  probe(p);
  let title = await until((s) => radarOn(s) && stripOn(s) && probeShows(s), "the probe readout shares the title with the radar and the strip");
  t.check(utf8(title.subtitle).length === 3473, `the subtitle is 3473 bytes (${utf8(title.subtitle).length})`);
  t.check(!cut(title.subtitle, 11).startsWith("§s§q§"), "no quest box is in this subtitle");

  // --- The player's radar off: the radar slot is exactly the empty cut, the strip and the probe stay.
  cfg("radar", false, p);
  title = await until((s) => radarOff(s) && stripOn(s) && probeShows(s), "radar off (personal): its slot is hud_rp's empty cut, the strip and the probe stay");
  t.check(cut(title.subtitle, 11).startsWith("§s§q§") === false, "still no quest box");

  // --- Back on, then the compass off (the other part, the same rule).
  cfg("radar", true, p);
  await until((s) => radarOn(s) && stripOn(s) && probeShows(s), "radar back on");
  cfg("compass", false, p);
  title = await until((s) => stripOff(s) && radarOn(s) && probeShows(s), "compass off (personal): its slot is hud_rp's empty cut, the radar and the probe stay");

  // --- Both off: both slots empty with the probe still showing; nothing is rewritten afterwards (no stale text).
  cfg("radar", false, p);
  title = await until((s) => stripOff(s) && radarOff(s) && probeShows(s), "both off: both slots are the empty cuts, the probe stays");
  await t.wait(60);
  const quiet = t.tick;
  await t.wait(120);
  t.check(!sides.some((s) => s.tick >= quiet && s.m.player === p.id && String(s.m.from).startsWith("map") && s.m.text), "a Minimap that is off writes nothing again");

  // --- The realm option off, with the player's choices kept (radar on, compass off): same empty slots; back on and the choices return.
  cfg("radar", true, p);
  await until((s) => radarOn(s) && stripOff(s) && probeShows(s), "radar on, compass off");
  cfg("enabled", false);
  title = await until((s) => radarOff(s) && stripOff(s) && probeShows(s), "realm Minimap off: the radar slot is the empty cut again, no stale radar text");
  await t.wait(120);
  const last = lastTitle();
  t.check(!!last && radarOff(last.subtitle) && stripOff(last.subtitle), "it stays off, nothing rewrites the radar");
  cfg("enabled", true);
  title = await until((s) => radarOn(s) && stripOff(s) && probeShows(s), "realm Minimap back on: the player's radar returns and the compass stays off as chosen");

  // --- Leave things as they were.
  cfg("compass", true, p);
  await until((s) => radarOn(s) && stripOn(s), "everything back on");
}
