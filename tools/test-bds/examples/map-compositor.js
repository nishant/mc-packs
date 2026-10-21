// The side boxes' compositor claim (W1/O1): the Minimap draws the Side HUD title of the players it shows a strip or
// radar to, with every other pack's box in it, and never sends its own parts as realm:side (each such message woke
// every pack's listener and was parsed by the six other side box packs, about 2 messages a tick per drawing player).
// With the Coordinates HUD in Right 1 and the Minimap on: the Minimap claims the player (realm:side_comp), its titles
// carry the HUD's box byte for byte as hud_rp cuts it, the HUD draws no title of its own while the claim lasts, and
// the Minimap sends no realm:side; turning the player (many redraws) adds no realm:side traffic. With the Minimap off
// for the player, the claim ends with a last Minimap title that keeps the HUD's box, and the HUD draws its own box
// again on its next change.
//   node tools/test-bds/run.mjs --quiet --flat --only map_bp,hud_bp --scenario tools/test-bds/examples/map-compositor.js --timeout 900
const MARK = "§s§2§r";

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
/** Slot k's text as hud_rp cuts it, without the filler. */
function cut(sub, k) {
  const skip = 9 + (k <= 10 ? 160 * k : 160 * 10 + 1352) + 1;
  const len = k === 10 ? 1351 : k === 11 ? 511 : 159;
  return fromUtf8(utf8(sub ?? "").slice(skip, skip + len)).replace(/~/g, "").replace(/§r/g, "");
}

export default async function (t) {
  for (const pack of ["map_bp", "hud_bp"]) if (!t.packs.includes(pack)) t.fail(`this scenario needs ${pack}`);
  const sys = t.system;
  /** @type {{ tick: number, id: string, m: any }[]} */
  const events = [];
  sys.afterEvents.scriptEventReceive.subscribe(
    ({ id, message }) => {
      if (id !== "realm:side" && id !== "realm:side_comp") return;
      try {
        events.push({ tick: sys.currentTick, id, m: JSON.parse(message), len: message.length });
      } catch {}
    },
    { namespaces: ["realm"] },
  );
  const cfg = (pack, key, value, player) => sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: `comp_${pack}_${key}_${t.tick}`, pack, key, value, ...(player ? { player: player.id } : {}) }));

  await t.server("/gamerule domobspawning false");
  await t.server("/time set noon");
  const p = await t.player("Composer", { op: true, x: 0, z: 0, gameMode: "creative" });
  p.teleport({ x: 0.5, y: -60, z: 0.5 }, { rotation: { x: 0, y: 180 } });
  await t.wait(40);

  const titles = (pack, since) => t.messages(p, { kind: "title", pack, since }).filter((m) => m.text === MARK);
  const hudBox = (sub) => cut(sub, 0).replace(/§./g, "");

  // --- The Coordinates HUD in Right 1, the Minimap on.
  cfg("hud_bp", "on", true, p);
  cfg("hud_bp", "where", "right1", p);
  cfg("map_bp", "compass", true, p);
  cfg("map_bp", "radar", true, p);
  const start = t.tick;
  const both = await t.waitUntil(() => titles("map_bp", start).find((m) => /X .*Z /.test(hudBox(m.subtitle)) && cut(m.subtitle, 10).length > 300), {
    timeout: 300,
    message: "a Minimap title carries the HUD's box and the radar",
  });
  t.check(utf8(both.subtitle).length === 3473, `the subtitle is 3473 bytes (${utf8(both.subtitle).length})`);
  t.check(events.some((e) => e.id === "realm:side_comp" && e.m.from === "map" && e.m.players.includes(p.id) && e.m.ticks > 0), "the Minimap claims the player (realm:side_comp)");

  // --- Steady: turn the player for 10 seconds (many redraws). Nothing from the Minimap on realm:side, and the HUD
  // draws no title of its own (it still sends its box when it changes).
  await t.wait(20);
  const steady = t.tick;
  for (let i = 0; i < 100; i++) {
    p.teleport(p.location, { rotation: { x: 0, y: 180 + i * 3 } });
    if (i % 25 === 0) p.teleport({ x: 0.5 + i / 10, y: -60, z: 0.5 }, { rotation: { x: 0, y: 180 + i * 3 } });
    await t.wait(2);
  }
  const window = t.tick - steady;
  const mapTitles = titles("map_bp", steady);
  const mapSides = events.filter((e) => e.tick >= steady && e.id === "realm:side" && String(e.m.from).startsWith("map"));
  const allSides = events.filter((e) => e.tick >= steady && e.id === "realm:side");
  const comps = events.filter((e) => e.tick >= steady && e.id === "realm:side_comp");
  t.log(`steady ${window} ticks: ${mapTitles.length} Minimap titles, ${allSides.length} realm:side (${mapSides.length} from map), ${comps.length} realm:side_comp; ${((allSides.length + comps.length) / window).toFixed(3)} side events a tick`);
  t.check(mapTitles.length >= 20, `the Minimap redrew while turning (${mapTitles.length})`);
  t.check(mapSides.length === 0, `no realm:side from the Minimap (${mapSides.length})`);
  t.check((allSides.length + comps.length) / window < 0.5, `side traffic under 0.5 events a tick (${((allSides.length + comps.length) / window).toFixed(3)})`);
  t.check(comps.every((e) => e.len < 2048), "every realm:side_comp under 2048");
  t.check(titles("hud_bp", steady).length === 0, `the HUD draws no title while the Minimap composes (${titles("hud_bp", steady).length})`);
  t.check(mapTitles.every((m) => /X .*Z /.test(hudBox(m.subtitle))), "every Minimap title keeps the HUD's box");
  const moved = mapTitles.at(-1);
  const x = Math.floor(p.location.x);
  t.check(hudBox(moved.subtitle).includes(`X ${x} `), `the HUD's latest coordinates (X ${x}) are in the Minimap's title ("${hudBox(moved.subtitle)}")`);

  // --- The Minimap off for the player: its last title keeps the HUD's box, the claim ends, the HUD draws again.
  const off = t.tick;
  cfg("map_bp", "compass", false, p);
  cfg("map_bp", "radar", false, p);
  const last = await t.waitUntil(() => titles("map_bp", off).find((m) => cut(m.subtitle, 10) === "" && cut(m.subtitle, 9) === ""), { timeout: 200, message: "the Minimap's last title, without its parts" });
  t.check(/X .*Z /.test(hudBox(last.subtitle)), "the last Minimap title keeps the HUD's box");
  await t.waitUntil(() => events.some((e) => e.tick >= off && e.id === "realm:side_comp" && e.m.ticks === 0 && e.m.players.includes(p.id)), { timeout: 100, message: "the claim ends" });
  const after = t.tick;
  p.teleport({ x: 20.5, y: -60, z: 5.5 });
  const own = await t.waitUntil(() => titles("hud_bp", after).find((m) => /X 20 /.test(hudBox(m.subtitle))), { timeout: 200, message: "the HUD draws its own box again" });
  t.check(cut(own.subtitle, 10) === "", "without a radar");
  t.check(titles("map_bp", after + 5).length === 0, "the Minimap draws nothing more");
}
