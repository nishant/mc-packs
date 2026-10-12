// Treasure Maps: a whole hunt the way a player would do it. Run with
//   node tools/test-bds/run.mjs --quiet --only maps_bp --scenario tools/test-bds/examples/maps-hunt.js --timeout 900
// The harness keeps action bar text but not subtitles, so test a copy whose map line shows above the hotbar:
//   mkdir -p /tmp/mp && cp -r packs/maps_bp /tmp/mp/ && sed -i 's/showAt: "right3"/showAt: "hotbar"/' /tmp/mp/maps_bp/scripts/config.js
//   node tools/test-bds/run.mjs --quiet --packs /tmp/mp --scenario tools/test-bds/examples/maps-hunt.js --timeout 900
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
  return { kind: "bearing", x: from.x + v.x, z: from.z + v.z, rough: d * 0.25 + 30 };
}

export default async function (t) {
  const dim = t.dimension;
  const p = await t.player("Hunter", { op: true });
  let areas = [];
  let areaN = 0;
  const clearAreas = () => { for (const a of areas) t.server(`/tickingarea remove ${a}`); areas = []; };
  /** Loads land (water too, unlike t.loadArea) and returns its top block. */
  async function load(x, z) {
    const name = `maps_${++areaN}`;
    t.server(`/tickingarea add circle ${Math.floor(x)} 0 ${Math.floor(z)} 4 ${name} true`);
    areas.push(name);
    return t.waitUntil(() => {
      const top = dim.getTopmostBlock({ x: Math.floor(x), z: Math.floor(z) });
      return top && top.typeId && top.location.y < 319 ? top : undefined;
    }, { timeout: 1200, message: `land at ${Math.round(x)}, ${Math.round(z)} did not load` });
  }
  async function goTo(x, z) {
    clearAreas();
    const top = await load(x, z);
    p.teleport({ x: Math.floor(x) + 0.5, y: top.location.y + 1, z: Math.floor(z) + 0.5 });
    await t.wait(20);
  }
  /** Top blocks around (cx, cz), loading the land first. */
  async function scan(cx, cz, r, fn) {
    clearAreas();
    for (const ox of [-96, 0, 96]) for (const oz of [-96, 0, 96]) {
      try { await load(cx + ox, cz + oz); } catch (e) { t.log(`  part of the scan did not load: ${e.message ?? e}`); }
    }
    let n = 0;
    for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
      let top;
      try { top = dim.getTopmostBlock({ x, z }); if (top) void top.typeId; } catch { continue; }
      if (top) { let hit; try { hit = fn(top); } catch { hit = undefined; } if (hit) return hit; }
      if (++n % 3000 === 0) await t.wait(1);
    }
    return undefined;
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
    await goTo(est.x, est.z);
    const settledRe = /ink darkens|grows warm|ink shifts|washed up/i;
    const settledYet = async (ticks) => {
      for (let i = 0; i < ticks; i += 10) {
        const m = t.messages(p, { since }).find((q) => settledRe.test(q.plain));
        if (m) return m;
        await t.wait(10);
      }
      return undefined;
    };
    let near = await settledYet(est.rough ? 140 : 300);
    // A heading is rough: look around like a player would.
    for (let ring = 1; !near && ring <= 4; ring++) {
      for (let k = 0; k < 8 && !near; k++) {
        const a = (k / 8) * Math.PI * 2;
        try {
          await goTo(est.x + Math.cos(a) * ring * 70, est.z + Math.sin(a) * ring * 70);
        } catch (e) {
          t.log(`  skipped a spot: ${e.message ?? e}`);
          continue;
        }
        near = await settledYet(140);
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
      from = { x: Math.round(p.location.x), z: Math.round(p.location.z) };
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
      for (let i = 0; i < 40 && !t.messages(p, { since: since3 }).some((m) => /You found/.test(m.plain)); i++) {
        const a = i * 2.4;
        await goTo(est.x + Math.cos(a) * i * 4, est.z + Math.sin(a) * i * 4);
      }
      msg = await t.waitMessage(p, /You found/i, { since: since3, timeout: 60 });
      from = { x: Math.round(p.location.x), z: Math.round(p.location.z) };
    } else {
      const me = { x: Math.floor(p.location.x), z: Math.floor(p.location.z) };
      mark = await scan(me.x, me.z, 140, (top) => {
        const id = top.typeId, b1 = typeBelow(top);
        const key = `${top.location.x},${top.location.z}`;
        if (seen.has(key)) return undefined;
        const hit = (id === "minecraft:lantern" && b1 === "minecraft:mossy_cobblestone" && "cairn") ||
          (id === "minecraft:chiseled_stone_bricks" && b1 === "minecraft:mossy_stone_bricks" && "stone") ||
          (id === "minecraft:oak_fence" && b1 === "minecraft:oak_fence" && typeBelow(top, 2) === "minecraft:oak_fence" && typeBelow(top, 3) === "minecraft:oak_fence" && "flag");
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
