// Treasure Maps: a whole hunt the way a player would do it. Run with
//   node tools/test-bds/run.mjs --quiet --only maps_bp --scenario tools/test-bds/examples/maps-hunt.js --timeout 900
// The harness keeps action bar text but not subtitles, so the scenario first moves the map line above the hotbar
// (realm:cfg_set showAt=hotbar), which needs no test copy of the pack.
// A simulated player gets a map, works out each clue from its words (headings, compass steps, coordinate
// puzzles), goes there, finds the marker the pack builds (cairn, flag or standing stone) and reaches it for
// the next clue; on the last leg it finds the buried chest and stands on it. Checks the map only says
// cold / cool / faintly warm while far away.

const NAMES = [
  ["N", ["north star", "pole star", "cold north wind", "frozen north"]],
  ["E", ["rising sun", "dawn", "morning sun", "where the sun comes up"]],
  ["S", ["warm south wind", "warm south", "noonday wind"]],
  ["W", ["setting sun", "dusk", "evening sun", "where the sun goes down"]],
];
const AXIS = [
  ["S", ["with the north star at your back", "with the cold wind behind you", "toward the warm south wind", "south"]],
  ["E", ["the way your shadow points at sunset", "toward the rising sun", "toward the dawn", "east"]],
  ["W", ["the way your shadow points at sunrise", "toward the setting sun", "toward the dusk", "west"]],
  ["N", ["toward the north star", "toward the cold north wind", "toward the pole star", "north"]],
];
const ANGLE = { N: 0, E: 90, S: 180, W: 270 };
const SMALL = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "twelve hundred and fifty" -> 1250, "1,250" -> 1250. */
function number(s) {
  s = s.trim();
  const d = /^-?\d[\d,]*/.exec(s);
  if (d) return Number(d[0].replace(/,/g, ""));
  let total = 0, cur = 0;
  for (const w of s.replace(/-/g, " ").split(/\s+/)) {
    if (w === "and" || !w) continue;
    if (w in SMALL) cur += SMALL[w];
    else if (w === "hundred") cur *= 100;
    else if (w === "thousand") { total += cur * 1000; cur = 0; }
    else break;
  }
  return total + cur;
}
const NUM = "(-?\\d[\\d,]*|(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)[ -]?)+)";

/** Cardinals named in a text, in order. */
function cardinals(text) {
  const found = [];
  for (const [c, names] of NAMES) for (const n of names) {
    let i = text.indexOf(n);
    while (i >= 0) { found.push([i, c]); i = text.indexOf(n, i + 1); }
  }
  found.sort((a, b) => a[0] - b[0]);
  return found.filter((f, i) => !found.some((g, j) => j < i && g[0] <= f[0] && f[0] < g[0] + 4 && g[1] === f[1])).map((f) => f[1]);
}
const vec = (deg, d) => ({ x: Math.sin((deg * Math.PI) / 180) * d, z: -Math.cos((deg * Math.PI) / 180) * d });
function axisOf(text) {
  for (const [c, phrases] of AXIS) for (const ph of phrases) if (text.includes(ph)) return c;
  return undefined;
}

/** Where a clue points, from where its leg starts. */
function solve(clue, from) {
  const c = clue.toLowerCase();
  let m;
  if (/until your [xz] reads/.test(c)) {
    return { kind: "mixed", x: number(/x reads (-?[\d,]+)/.exec(c)[1]), z: number(/z reads (-?[\d,]+)/.exec(c)[1]) };
  }
  if ((m = /spot's x (.*?), and its z (.*?)\. /.exec(c))) {
    const axis = (s) => {
      let q;
      if ((q = new RegExp(`halfway between ${NUM} and ${NUM}`).exec(s))) return (number(q[1]) + number(q[2])) / 2;
      if ((q = new RegExp(`ends in (\\d\\d) and lies between ${NUM} and ${NUM}`).exec(s))) {
        const lo = number(q[2]), hi = number(q[3]), tail = Number(q[1]);
        return hi <= 0 ? hi - tail : lo + tail;
      }
      if ((q = new RegExp(`is ${NUM} times ${NUM}, plus ${NUM}`).exec(s))) return number(q[1]) * number(q[2]) + number(q[3]);
      if ((q = new RegExp(`is ${NUM} (minus|plus) ${NUM}`).exec(s))) return number(q[1]) + (q[2] === "minus" ? -1 : 1) * number(q[3]);
      throw new Error(`coords: ${s}`);
    };
    return { kind: "coords", x: axis(m[1]), z: axis(m[2]) };
  }
  if (/, then /.test(c) || new RegExp(`, walk ${NUM} paces [^,.]*\\. `).test(c)) {
    const body = c.slice(c.indexOf(",") + 1, c.lastIndexOf(". ") >= 0 ? c.indexOf(". ") : undefined);
    let x = from.x, z = from.z;
    for (const seg of body.split(", then ")) {
      const q = new RegExp(`${NUM} (?:paces |more )?(.*)$`).exec(seg.replace(/^ ?(walk|turn and go) /, "").trim());
      const n = number(q[1]);
      const dir = axisOf(q[2]);
      const v = vec(ANGLE[dir], n);
      x += v.x; z += v.z;
    }
    return { kind: "steps", x, z, rough: 15 };
  }
  // A heading: distance in words or digits, and a direction.
  const q = new RegExp(`(?:about|some|roughly|near enough) ${NUM} (?:paces|strides|steps)`).exec(c);
  const d = number(q[1]);
  const cs = cardinals(c.replace(/with the north star at your back/g, ""));
  let deg;
  if (/bearing a little|a touch toward|leaning toward/.test(c)) {
    const a = ANGLE[cs[0]], b = ANGLE[cs[1]];
    let diff = ((b - a + 540) % 360) - 180;
    deg = a + Math.sign(diff) * 22.5;
  } else if (/between|meets/.test(c)) {
    const va = vec(ANGLE[cs[0]], 1), vb = vec(ANGLE[cs[1]], 1);
    deg = (Math.atan2(va.x + vb.x, -(va.z + vb.z)) * 180) / Math.PI;
  } else deg = ANGLE[cs[0]];
  const v = vec(deg, d);
  return { kind: "bearing", x: from.x + v.x, z: from.z + v.z, rough: d * 0.25 + 30, from, d, deg };
}

/**
 * Where a heading can lead: the pack names one of 16 compass points (+-11.25 degrees) and rounds the distance to 50
 * (+-25), so the spot lies on an arc up to 2 x d x tan(11.25) wide (275 blocks at 700 paces). The pack settles a leg
 * only once the land 32 blocks around the planned spot is loaded and ticking, which with this scenario's ticking areas
 * (4 chunks) means standing within about 50 blocks of it: walk the arc in steps of 45 blocks, middle first.
 */
function arcSpots(est) {
  const out = [];
  for (const dd of [est.d, est.d - 40, est.d + 40]) {
    if (dd <= 0) continue;
    const half = 11.25 + 3;
    const step = Math.max(2, (45 / dd) * (180 / Math.PI));
    const offs = [0];
    for (let o = step; o <= half; o += step) offs.push(o, -o);
    for (const o of offs) {
      const v = vec(est.deg + o, dd);
      out.push({ x: est.from.x + v.x, z: est.from.z + v.z });
    }
  }
  return out.slice(1); // the first is the estimate itself
}

export default async function (t) {
  const dim = t.dimension;
  const p = await t.player("Hunter", { op: true });
  {
    const acks = [];
    t.mc.system.afterEvents.scriptEventReceive.subscribe(({ id, message }) => {
      if (id === "realm:cfg_ack") acks.push(JSON.parse(message));
    }, { namespaces: ["realm"] });
    t.mc.system.sendScriptEvent("realm:cfg_set", JSON.stringify({ id: "mh-showat", pack: "maps_bp", key: "showAt", value: "hotbar" }));
    const ack = await t.waitUntil(() => acks.find((x) => x.id === "mh-showat"), { timeout: 40, message: "ack showAt" });
    t.assert(ack.ok, "map line moved above the hotbar (showAt=hotbar)");
  }
  let areas = [];
  let areaN = 0;
  const clearAreas = () => { for (const a of areas) t.server(`/tickingarea remove ${a}`); areas = []; };
  /**
   * Loads land (water too, unlike t.loadArea) and returns its top block, once the whole area (9 x 9 chunks) is loaded
   * when that happens in time: an area removed while some of its chunks are still loading leaves them unloadable for
   * the rest of the run, and so does every area added over them later (F75: this used to remove a slow area and add it
   * again, which could only fail, and its "did not load" legs leaked their areas until the world's 10 were used up and
   * the run timed out). New land far out can take minutes to generate on a busy server, so a middle that loaded is
   * enough to go on with when the rest is still generating (as before).
   */
  async function load(x, z) {
    const name = `maps_${++areaN}`;
    const add = t.server(`/tickingarea add circle ${Math.floor(x)} 0 ${Math.floor(z)} 4 ${name} true`);
    if (!add.ok) throw new Error(`the game refused the ticking area ${name} at ${Math.round(x)}, ${Math.round(z)}`);
    areas.push(name);
    const cx = Math.floor(Math.floor(x) / 16), cz = Math.floor(Math.floor(z) / 16);
    const middle = () => {
      const top = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
      return top && top.typeId && top.location.y < 319 ? top : undefined;
    };
    const loading = (y) => {
      let n = 0;
      for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (!dim.getBlock({ x: (cx + dx) * 16 + 8, y, z: (cz + dz) * 16 + 8 })) n++;
      return n;
    };
    const t0 = t.tick;
    const top = await t.waitUntil(middle, { timeout: 1200, message: `land at ${Math.round(x)}, ${Math.round(z)} did not load` });
    const y = top.location.y;
    const all = await t.waitUntil(() => loading(y) === 0, { timeout: Math.max(1, 1200 - (t.tick - t0)) }).then(() => true, () => false);
    // A chunk that can be read is not quite done: the harness's t.loadArea waits 20 ticks more too.
    if (all) await t.wait(20);
    else t.log(`  ${name}: ${loading(y)} of its 81 chunks still loading after 60 s; going on with the middle loaded`);
    return top;
  }
  /**
   * Like a player traveling: the land where the player stands stays loaded until they have arrived somewhere else
   * (unloading it first would cut short a search the pack is running there, which no player can do).
   */
  async function goTo(x, z) {
    const old = areas;
    areas = [];
    if (old.length > 2) for (const a of old) t.server(`/tickingarea remove ${a}`); // after a scan: at most 10 areas
    let top;
    try {
      top = await load(x, z);
    } catch (e) {
      // The player stays where they were: keep that land, and this spot's area, listed so the next move removes them.
      areas = old.length > 2 ? areas : [...old, ...areas];
      throw e;
    }
    p.teleport({ x: Math.floor(x) + 0.5, y: top.location.y + 1, z: Math.floor(z) + 0.5 });
    if (old.length <= 2) for (const a of old) t.server(`/tickingarea remove ${a}`);
    await t.wait(20);
  }
  /** Where the player stood at each tick (the pack counts a clue from where the player was when it changed). */
  const trail = new Map();
  t.mc.system.runInterval(() => {
    try {
      trail.set(t.tick, { x: Math.round(p.location.x), z: Math.round(p.location.z) });
      trail.delete(t.tick - 2000);
    } catch {
      // the player left
    }
  }, 1);
  const posAt = (tick) => trail.get(tick) ?? trail.get(tick - 1) ?? { x: Math.round(p.location.x), z: Math.round(p.location.z) };
  /** Top blocks around (cx, cz), loading the land first: the hit nearest (cx, cz). */
  async function scan(cx, cz, r, fn) {
    clearAreas();
    for (const ox of [-96, 0, 96]) for (const oz of [-96, 0, 96]) {
      try { await load(cx + ox, cz + oz); } catch (e) { t.log(`  part of the scan did not load: ${e.message ?? e}`); }
    }
    let n = 0;
    let best, bestD = Infinity;
    for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d >= bestD) continue;
      let top;
      try { top = dim.getTopmostBlock({ x, z }); if (top) void top.typeId; } catch { continue; }
      if (top) { let hit; try { hit = fn(top); } catch { hit = undefined; } if (hit) [best, bestD] = [hit, d]; }
      if (++n % 3000 === 0) await t.wait(1);
    }
    return best;
  }
  const typeBelow = (b, k = 1) => { try { return dim.getBlock({ x: b.location.x, y: b.location.y - k, z: b.location.z })?.typeId; } catch { return undefined; } };

  const start = { x: Math.round(p.location.x), z: Math.round(p.location.z) };
  const since0 = t.tick;
  t.assert(t.cmd(p, "/realm:maps_give Hunter").ok, "maps_give ran");
  let msg = await t.waitMessage(p, /first clue/i, { since: since0, timeout: 100 });
  let clue = /"(.*)"/.exec(msg.plain)[1];
  let from = start;
  const seen = new Set();
  await t.seconds(5);
  // Run with showAt "hotbar" (see the top): the harness keeps action bar text, not subtitles.
  const titles = t.messages(p, { kind: "actionbar" }).map((m) => m.plain);
  t.log(`far-away map line: ${titles.at(-1)}`);
  t.check(titles.some((s) => /map is (cold|cool|faintly warm)/i.test(s)), "far away the map only says cold / cool / faintly warm");
  t.check(!titles.some((s) => /Warmer|Colder/.test(s)), "no Warmer / Colder far away");

  for (let leg = 1, rounds = 0; leg <= 4 && rounds < 12; leg++, rounds++) {
    const est = solve(clue, from);
    t.log(`leg ${leg}: [${est.kind}] "${clue}" -> ${Math.round(est.x)}, ${Math.round(est.z)} (from ${from.x}, ${from.z})`);
    const since = t.tick;
    const settledRe = /ink darkens|grows warm|ink shifts|washed up/i;
    const settledYet = async (ticks) => {
      for (let i = 0; i < ticks; i += 10) {
        const m = t.messages(p, { since }).find((q) => settledRe.test(q.plain));
        if (m) return m;
        await t.wait(10);
      }
      return undefined;
    };
    /**
     * Stands at (x, z) for `ticks` like a player holding the map: within 64 blocks of the planned spot the map line
     * turns from "cold / cool / faintly warm" to Warmer / Colder / quiet / Very warm, so a player stays and looks around
     * (the leg settles once the land 32 blocks around the planned spot is loaded, about 50 blocks away here, and a
     * search that is cut short by leaving waits until the player comes back).
     */
    const visit = async (x, z, ticks) => {
      try {
        await goTo(x, z);
      } catch (e) {
        t.log(`  skipped a spot: ${e.message ?? e}`);
        return undefined;
      }
      const arrived = t.tick;
      const m = await settledYet(60);
      if (m) return m;
      const line = t.messages(p, { kind: "actionbar", pack: "maps_bp", since: arrived }).at(-1)?.plain ?? "";
      if (/Very warm|Hot/.test(line)) return settledYet(600);
      if (!/Warmer|Colder|quiet/.test(line)) return settledYet(Math.max(0, ticks - 60));
      t.log(`  the map stirs at ${Math.round(x)}, ${Math.round(z)}: ${line}`);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const q = await visitNear(x + Math.cos(a) * 35, z + Math.sin(a) * 35);
        if (q) return q;
      }
      return settledYet(300);
    };
    const visitNear = async (x, z) => {
      try {
        await goTo(x, z);
      } catch {
        return undefined;
      }
      const arrived = t.tick;
      const m = await settledYet(60);
      if (m) return m;
      const line = t.messages(p, { kind: "actionbar", pack: "maps_bp", since: arrived }).at(-1)?.plain ?? "";
      return /Very warm|Hot/.test(line) ? settledYet(600) : undefined;
    };
    let near = await visit(est.x, est.z, est.rough ? 140 : 300);
    // A heading is rough: walk along the arc it allows, like a player sweeping the area.
    for (const s of est.kind === "bearing" && !near ? arcSpots(est) : []) {
      near = await visit(s.x, s.z, 140);
      if (near) break;
    }
    // Still nothing (or compass steps, which round to 10): look around like a player would.
    for (let ring = 1; !near && ring <= 4; ring++) {
      for (let k = 0; k < 8 && !near; k++) {
        const a = (k / 8) * Math.PI * 2;
        near = await visit(est.x + Math.cos(a) * ring * 70, est.z + Math.sin(a) * ring * 70, 140);
      }
    }
    if (!near) near = await t.waitMessage(p, settledRe, { since, timeout: 400 });
    t.log(`  ${near.plain}`);
    if (/washed up/i.test(near.plain)) {
      t.log("  no spot for the chest after 4 tries: the treasure was handed over");
      t.check(leg >= 2, "the hunt had at least 2 legs");
      clearAreas();
      return;
    }
    if (/ink shifts/i.test(near.plain)) {
      // Water or a build where the treasure was: it moved, with a heading from where the player stood.
      clue = /"(.*)"/.exec(near.plain)[1];
      from = posAt(near.tick);
      leg--;
      continue;
    }
    if (/grows warm/i.test(near.plain)) {
      // The last leg: the chest is buried at the landmark.
      const me = { x: Math.floor(p.location.x), z: Math.floor(p.location.z) };
      const chest = await scan(me.x, me.z, 140, (top) => {
        for (let k = 1; k <= 5; k++) {
          if (typeBelow(top, k) !== "minecraft:chest") continue;
          // Chests in villages and ruins stay empty until opened: the treasure chest is already filled.
          const c = dim.getBlock({ x: top.location.x, y: top.location.y - k, z: top.location.z }).getComponent("minecraft:inventory").container;
          if (c.emptySlotsCount < c.size) return { x: top.location.x, y: top.location.y - k, z: top.location.z };
        }
        return undefined;
      });
      t.assert(chest, "found the buried chest");
      t.log(`  chest at ${chest.x}, ${chest.y}, ${chest.z}`);
      const block = dim.getBlock(chest);
      const items = block.getComponent("minecraft:inventory").container;
      let count = 0;
      for (let i = 0; i < items.size; i++) if (items.getItem(i)) count++;
      t.check(count > 0, "the chest holds loot");
      const since2 = t.tick;
      p.teleport({ x: chest.x + 0.5, y: dim.getTopmostBlock({ x: chest.x, z: chest.z }).location.y + 1, z: chest.z + 0.5 });
      await t.wait(10);
      const hot = t.messages(p, { kind: "actionbar", since: since2 }).map((m) => m.plain);
      await t.waitMessage(p, /You found the treasure/i, { since: since2, timeout: 100 });
      await t.seconds(3);
      t.log(`  near the chest the map said: ${hot.slice(-2).join(" | ")}; ${count} stacks of loot`);
      t.check(leg >= 2, "the hunt had at least 2 legs");
      clearAreas();
      return;
    }
    let mark;
    if (/bottle/i.test(near.plain)) {
      t.log("  no marker here (a bottle): walking close");
      const since3 = since;
      // The bottle lies within 30 blocks of the planned spot, and the leg settled within about 50 of it: spiral out
      // from here (points about 18 blocks apart, out to 70).
      const c = { x: p.location.x, z: p.location.z };
      for (let i = 0; i < 50 && !t.messages(p, { since: since3 }).some((m) => /You found/.test(m.plain)); i++) {
        const a = i * 2.4;
        try {
          await goTo(c.x + Math.cos(a) * 10 * Math.sqrt(i), c.z + Math.sin(a) * 10 * Math.sqrt(i));
        } catch (e) {
          t.log(`  skipped a spot: ${e.message ?? e}`);
        }
      }
      msg = await t.waitMessage(p, /You found/i, { since: since3, timeout: 60 });
      from = posAt(msg.tick);
    } else {
      const me = { x: Math.floor(p.location.x), z: Math.floor(p.location.z) };
      mark = await scan(me.x, me.z, 140, (top) => {
        const id = top.typeId, b1 = typeBelow(top);
        const key = `${top.location.x},${top.location.z}`;
        if (seen.has(key)) return undefined;
        const hit = (id === "minecraft:lantern" && b1 === "minecraft:mossy_cobblestone" && "cairn") ||
          (id === "minecraft:chiseled_stone_bricks" && b1 === "minecraft:mossy_stone_bricks" && "stone") ||
          (id === "minecraft:oak_fence" && b1 === "minecraft:oak_fence" && typeBelow(top, 2) === "minecraft:oak_fence" && typeBelow(top, 3) === "minecraft:oak_fence" &&
            /_wool$/.test(dim.getBlock({ x: top.location.x + 1, y: top.location.y, z: top.location.z })?.typeId ?? "") && "flag"); // villages have fence posts too
        return hit ? { x: top.location.x, z: top.location.z, y: top.location.y - 4, kind: hit } : undefined;
      });
      t.assert(mark, "found the marker the pack built");
      seen.add(`${mark.x},${mark.z}`);
      t.log(`  marker: ${mark.kind} at ${mark.x}, ${mark.y}, ${mark.z}`);
      const since3 = t.tick;
      await goTo(mark.x, mark.z); // on top of the marker
      msg = await t.waitMessage(p, /You found the (cairn|flag|standing stone)/i, { since: since3, timeout: 100 });
      from = { x: mark.x, z: mark.z };
    }
    clue = /"(.*)"/.exec(msg.plain)[1];
    t.log(`  ${msg.plain.slice(0, 90)}`);
  }
  t.fail("the hunt never ended");
}
