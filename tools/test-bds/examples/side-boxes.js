// The side boxes and the title protocol, with every box producer at once. Run with
//   node tools/test-bds/run.mjs --quiet --only hud_bp,mobhp_bp,elytra_bp,maps_bp,saga_bp,moon_bp --scenario tools/test-bds/examples/side-boxes.js --timeout 400
// Checks: each pack's player choice offers the nine boxes (the Coordinates HUD eight); a readout lands in the
// chosen box for each of the nine (decoded byte for byte, as hud_rp cuts it); four packs at once share one
// title; two players get their own boxes; a real title (Blood Moon) hides the boxes and they come back;
// overlapping holds from two packs, and a hold ended early with ticks 0; the elytra box goes away on landing;
// the Coordinates HUD moves between a box and the hotbar.
const MARK = "§s§2§r";
const SLOTS = ["right1", "right2", "right3", "right4", "left1", "left2", "left3", "left4", "middle"];

/** UTF-8 bytes of a string (the script engine has no Buffer). */
function utf8(s) {
  /** @type {number[]} */
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
/** @param {number[]} b */
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

/** The text in each slot, the way hud_rp's expressions cut it (UTF-8 bytes). */
function decode(sub) {
  const b = utf8(sub ?? "");
  /** @type {Record<string, string>} */
  const out = {};
  SLOTS.forEach((s, k) => {
    const seg = fromUtf8(b.slice(9 + 160 * k + 1, 9 + 160 * k + 160));
    out[s] = seg.replace(/~/g, "").replace(/(§r)+$/, "");
  });
  return { out, bytes: b.length };
}

export default async function (t) {
  const sys = t.mc.system;
  /** @type {{ tick: number, m: any }[]} */
  const sides = [];
  /** @type {{ tick: number, m: any }[]} */
  const holds = [];
  /** @type {Map<string, any[]>} */
  const schemas = new Map();
  /** @type {any[]} */
  const acks = [];
  sys.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
    try {
      const m = JSON.parse(message);
      if (id === "realm:side") sides.push({ tick: sys.currentTick, m });
      else if (id === "realm:title") holds.push({ tick: sys.currentTick, m });
      else if (id === "realm:cfg_schema") schemas.set(m.pack, [...(schemas.get(m.pack) ?? []), ...m.options]);
      else if (id === "realm:cfg_ack") acks.push(m);
    } catch {}
  }, { namespaces: ["realm"] });

  const a = await t.player("Alice", { op: true });
  const b = await t.player("Bob", { x: 175, z: 170 });
  let reqN = 0;
  async function set(pack, key, value, player) {
    const id = `rv${++reqN}`;
    sys.sendScriptEvent("realm:cfg_set", JSON.stringify({ id, pack, key, value, player: player?.id }));
    const ack = await t.waitUntil(() => acks.find((x) => x.id === id), { timeout: 40, message: `ack ${pack}.${key}` });
    t.check(ack.ok, `${pack}.${key}=${value}: ${ack.error ?? "ok"}`);
  }

  // 1. The choices each pack offers players.
  sys.sendScriptEvent("realm:cfg_ping", JSON.stringify({ id: "ping1", player: a.id }));
  await t.wait(10);
  for (const [pack, key, n] of [["mobhp_bp", "where", 9], ["elytra_bp", "where", 9], ["maps_bp", "where", 9], ["saga_bp", "trackerAt", 9], ["hud_bp", "where", 8]]) {
    const o = (schemas.get(pack) ?? []).find((x) => x.key === key && x.scope === "player");
    const choices = o?.choices ?? [];
    t.check(SLOTS.slice(0, n).every((s) => choices.includes(s)), `${pack} ${key} offers ${n} boxes (${choices.join(",")})`);
  }

  const boxes = (p, since = 0) => t.messages(p, { kind: "title", since }).filter((m) => m.text === MARK);
  const lastBox = (p, since = 0) => boxes(p, since).at(-1);

  // Helpers that make each pack show something.
  const pigs = [];
  async function hit(p) {
    const pig = p.dimension.spawnEntity("minecraft:cow", { x: p.location.x + 2, y: p.location.y, z: p.location.z });
    pigs.push(pig);
    await t.wait(2);
    pig.applyDamage(1, { cause: "entityAttack", damagingEntity: p });
  }
  // A map in hand: a hunt from maps_give.
  t.assert(t.cmd(a, "/realm:maps_give Alice").ok, "maps_give");
  await t.waitMessage(a, /first clue/i, { timeout: 60 });
  const inv = a.getComponent("inventory").container;
  let mapSlot = -1;
  for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.typeId === "minecraft:paper") mapSlot = i;
  t.assert(mapSlot >= 0, "got a map");
  if (mapSlot > 8) {
    inv.swapItems(mapSlot, 0, inv);
    mapSlot = 0;
  }
  a.selectedSlotIndex = mapSlot;

  // 2. Every box, per pack.
  await set("hud_bp", "on", false, a);
  for (const slot of SLOTS) {
    // Mob Health
    await set("mobhp_bp", "where", slot, a);
    let since = t.tick;
    await hit(a);
    let m = await t.waitUntil(() => boxes(a, since).find((x) => x.pack === "mobhp_bp"), { timeout: 20, message: `mobhp draws in ${slot}` });
    let d = decode(m.subtitle);
    t.check(d.bytes === 1449, `subtitle is 1449 bytes (${d.bytes})`);
    t.check(/Cow\s+§f\d+\/10/.test(d.out[slot]), `mobhp in ${slot}: "${d.out[slot]}"`);
    // Warmer / Colder
    await set("maps_bp", "where", slot, a);
    since = t.tick;
    m = await t.waitUntil(() => boxes(a, since).find((x) => x.pack === "maps_bp"), { timeout: 60, message: `maps draws in ${slot}` });
    d = decode(m.subtitle);
    t.check(/map is|clue/i.test(d.out[slot]), `maps in ${slot}: "${d.out[slot]}"`);
    t.check(SLOTS.filter((s) => s !== slot && d.out[s]).every((s) => !/clue \d/.test(d.out[s])), `maps holds one slot only`);
  }
  await set("maps_bp", "where", "hotbar", a);

  // Elytra: glide.
  const eq = a.getComponent("equippable");
  eq.setEquipment(t.mc.EquipmentSlot.Chest, new t.mc.ItemStack("minecraft:elytra", 1));
  const ground = { ...a.location };
  async function glide() {
    a.teleport({ x: ground.x, y: ground.y + 60, z: ground.z });
    await t.wait(3);
    let ok = false;
    try { ok = a.glide(); } catch (e) { t.log(`glide: ${e}`); }
    await t.wait(2);
    return ok && a.isGliding;
  }
  const canGlide = await glide();
  t.log(`simulated player gliding: ${canGlide}`);
  if (canGlide) {
    for (const slot of SLOTS) {
      await set("elytra_bp", "where", slot, a);
      if (!a.isGliding) await glide();
      const since = t.tick;
      const m = await t.waitUntil(() => boxes(a, since).find((x) => x.pack === "elytra_bp"), { timeout: 20, message: `elytra draws in ${slot}` });
      const d = decode(m.subtitle);
      t.check(/blocks\/s\s+§fY \d+\n§fElytra/.test(d.out[slot]), `elytra in ${slot}: ${JSON.stringify(d.out[slot])}`);
    }
    // Landing takes the box off at once.
    await set("elytra_bp", "where", "right2", a);
    if (!a.isGliding) await glide();
    await t.wait(10);
    a.teleport({ x: ground.x, y: ground.y, z: ground.z });
    const landed = t.tick;
    await t.wait(5);
    if (a.isGliding) {
      t.log(`still gliding after teleport; methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(a)).filter((n) => /glid|fly|stop/i.test(n)).join(",")}`);
      try { a.stopGliding?.(); } catch (e) { t.log(String(e)); }
      try { a.stopFlying?.(); } catch (e) { t.log(String(e)); }
      a.jump();
    }
    await t.waitUntil(() => !a.isGliding, { timeout: 60, message: "landed" });
    const clr = await t.waitUntil(() => sides.find((s) => s.tick >= landed && s.m.from === "elytra" && s.m.text === ""), { timeout: 20, message: "elytra clears its box on landing" });
    t.log(`elytra cleared ${clr.tick - landed} ticks after landing`);
    const after = boxes(a, clr.tick).at(-1) ?? t.messages(a, { kind: "title", since: clr.tick }).at(-1);
    t.check(!after || after.text !== MARK || !decode(after.subtitle).out.right2, "right2 empty after landing");
  }

  // 3. Four producers at once (HUD left1, Mob Health right1, Elytra right2, Warmer / Colder right3).
  await set("hud_bp", "on", true, a);
  await set("hud_bp", "where", "left1", a);
  await set("mobhp_bp", "where", "right1", a);
  await set("elytra_bp", "where", "right2", a);
  await set("maps_bp", "where", "right3", a);
  if (canGlide) await glide();
  await hit(a);
  const four = await t.waitUntil(() => {
    const m = lastBox(a, t.tick - 3);
    if (!m) return undefined;
    const d = decode(m.subtitle).out;
    return d.left1 && d.right1 && d.right3 && (!canGlide || d.right2) ? m : undefined;
  }, { timeout: 80, message: "four readouts in one title" });
  const d4 = decode(four.subtitle).out;
  t.log(`four at once (${four.pack}): ${SLOTS.filter((s) => d4[s]).map((s) => `${s}=${JSON.stringify(d4[s].slice(0, 24))}`).join(" ")}`);

  // 4. Two players, different boxes.
  await set("mobhp_bp", "where", "middle", b);
  const s2 = t.tick;
  await hit(b);
  const mb = await t.waitUntil(() => boxes(b, s2).find((x) => x.pack === "mobhp_bp"), { timeout: 20, message: "Bob's box" });
  const db = decode(mb.subtitle).out;
  t.check(/Cow/.test(db.middle) && !db.right1 && !db.left1, `Bob sees only his middle box: ${JSON.stringify(db)}`);
  t.check(!boxes(a, s2).some((m) => decode(m.subtitle).out.middle), "Alice never gets Bob's box");

  // 5. A real title while boxes show: Blood Moon.
  t.server("/time set midnight");
  let since = t.tick;
  t.cmd(a, "/realm:moon_set blood");
  const real = await t.waitUntil(() => t.messages(a, { kind: "title", pack: "moon_bp", since })[0], { timeout: 60, message: "the Blood Moon title" });
  const hold = holds.find((h) => h.m.from === "moon_bp" && h.m.player === a.id);
  t.check(hold && hold.tick <= real.tick, "realm:title before the real title");
  await hit(a); // during the hold
  const end = real.tick + real.ticks;
  await t.waitUntil(() => t.tick > end + 12, { timeout: 300 });
  const during = boxes(a, real.tick + 1).filter((m) => m.tick < end);
  t.check(!during.length, `no box during the real title (${during.map((m) => `${m.pack}@${m.tick}`).join(",")})`);
  const back = boxes(a, end)[0];
  t.check(back && back.tick - end <= 8, `boxes back ${back ? back.tick - end : "never"} ticks after the title`);

  // 6. Back-to-back holds from two packs, and one ended early.
  since = t.tick;
  sys.sendScriptEvent("realm:title", JSON.stringify({ player: a.id, ticks: 40, from: "fake_a" }));
  a.onScreenDisplay.setTitle("First", { subtitle: "", fadeInDuration: 0, stayDuration: 30, fadeOutDuration: 10 });
  await t.wait(20);
  sys.sendScriptEvent("realm:title", JSON.stringify({ player: a.id, ticks: 60, from: "fake_b" }));
  a.onScreenDisplay.setTitle("Second", { subtitle: "", fadeInDuration: 0, stayDuration: 50, fadeOutDuration: 10 });
  const bEnd = t.tick + 60;
  await t.waitUntil(() => t.tick > bEnd + 10, { timeout: 200 });
  const mid = boxes(a, since + 1).filter((m) => m.tick < bEnd);
  t.check(!mid.length, `no box while either hold lasts (${mid.map((m) => `${m.pack}@${m.tick}`).join(",")})`);
  const back2 = boxes(a, bEnd)[0];
  t.check(back2 && back2.tick - bEnd <= 8, `back ${back2 ? back2.tick - bEnd : "never"} ticks after the second hold`);
  since = t.tick;
  sys.sendScriptEvent("realm:title", JSON.stringify({ player: a.id, ticks: 400, from: "fake_a" }));
  await t.wait(20);
  sys.sendScriptEvent("realm:title", JSON.stringify({ player: a.id, ticks: 0, from: "fake_a" }));
  const early = t.tick;
  const back3 = await t.waitUntil(() => boxes(a, early)[0], { timeout: 20, message: "boxes back after ticks 0" });
  t.check(!boxes(a, since + 1).some((m) => m.tick < early), "none during the long hold");
  t.log(`ticks 0: back after ${back3.tick - early} ticks`);

  // 7. Coordinates HUD: box, then hotbar.
  since = t.tick;
  await set("hud_bp", "where", "hotbar", a);
  await t.waitUntil(() => sides.find((s) => s.tick >= since && s.m.from === "hud" && s.m.text === ""), { timeout: 20, message: "the HUD leaves its box" });
  await t.waitUntil(() => t.messages(a, { kind: "actionbar", pack: "hud_bp", since }).find((m) => /XYZ/.test(m.plain)), { timeout: 60, message: "the HUD on the hotbar" });
  await set("hud_bp", "where", "left4", a);
  since = t.tick;
  const h = await t.waitUntil(() => boxes(a, since).find((m) => m.pack === "hud_bp"), { timeout: 40, message: "the HUD back in a box" });
  t.check(/XYZ/.test(decode(h.subtitle).out.left4), "HUD in left4");
  t.check(sides.every((s) => JSON.stringify(s.m).length < 2048), "every realm:side under 2048");
  for (const pig of pigs) try { pig.remove(); } catch {}
}
