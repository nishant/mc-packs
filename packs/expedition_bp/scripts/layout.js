// Everything about a dungeon that follows from its seed, level and affixes alone: how hard a level is,
// the affixes, the room layout, the puzzles. No game APIs here, so tools can run it in Node to check
// thousands of layouts (rooms fit the box, paths connect, every puzzle has an answer).
//
// Levels: 0 Easy, 1 Normal, 2 Hard, then 3 to 22 are Nightmare tiers 1 to 20.
// Coordinates: a dungeon is a grid of cells CELL blocks wide. A room's interior is 15 x 15 blocks
// around its cell's center. Inside a room, positions are local: u across, v forward (from the door
// players come in by toward the far wall), y up from the floor block (players stand at y 1).
// Interior u and v run -7 to 7; the walls are at -8 and 8.

import { CONFIG } from "./config.js";

export const CELL = 20;
export const HALF = 10; // a room's center from its cell's corner
export const R = 7; // interior half width
export const BASE_LEVELS = ["Easy", "Normal", "Hard"];
export const MAX_GRID = 5;
export const MAX_ROOM_H = 30;

/** @typedef {{ x: number, z: number }} V2 */
/** @typedef {{ u: number, v: number, y: number }} P3 */
/** @typedef {"back" | "fwd" | "left" | "right" | "up" | "down"} Face */
/**
 * A block (or box of blocks, to u2/v2/y2) a room places on top of its walls, floor and air.
 * k: what it is (main.js turns it into a block); f: which way it faces; t: sign text; i: an index (which lever, lamp...).
 * @typedef {{ k: string, u: number, v: number, y: number, u2?: number, v2?: number, y2?: number, f?: Face, t?: string, i?: number }} Part
 */
/**
 * @typedef {{ type: "levers" | "simon" | "plates" | "targets" | "lamps" | "wool" | "parkour" | "rush" | "riddle",
 *   solution?: boolean[], clues?: string[], seq?: number[], n?: number, path?: number[], count?: number, start?: boolean[],
 *   answer?: number[], seconds?: number, q?: string, options?: string[], correct?: number }} Puzzle
 */
/** @typedef {{ side: Face, y: number, bars: boolean, to: number }} Door */
/**
 * @typedef {{ kind: Kind, cx: number, cz: number, h: number, back: V2, exit: V2 | null, ey: number, parent: number,
 *   parts: Part[], spawns: P3[], fly: P3[], puzzle?: Puzzle, doors: Door[], zone?: { u: number, v: number, y: number, r: number },
 *   chests: P3[], decor: number, variant: string }} Room
 * ey: the exit doorway's floor above the room's floor (0 for a normal door; a shaft's is high up).
 * parent: for a side room, the path room it opens off; -1 otherwise.
 */
/** @typedef {"entry" | "combat" | "elite" | "puzzle" | "trap" | "shrine" | "shaft" | "boss" | "treasure" | "cache"} Kind */
/** @typedef {{ grid: number, n: number, height: number, rooms: Room[], level: number }} Layout */

// ---------------------------------------------------------------------------
// Random
// ---------------------------------------------------------------------------

/** A small seeded random generator (mulberry32). @param {number} seed */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @template T @param {T[]} list @param {() => number} r @returns {T[]} */
export function shuffle(list, r) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** @template T @param {T[]} list @param {() => number} r @returns {T} */
export const pick = (list, r) => list[Math.floor(r() * list.length)];

/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/** @param {number} L */
export const tierOf = (L) => Math.max(0, L - 2);
/** "Easy", "Nightmare 5". @param {number} L */
export const levelName = (L) => (L < 3 ? BASE_LEVELS[L] ?? "Normal" : `Nightmare ${L - 2}`);
/** "Easy", "N5". @param {number} L */
export const levelShort = (L) => (L < 3 ? BASE_LEVELS[L] ?? "Normal" : `N${L - 2}`);
/** Leaderboard key: "e", "n", "h", "t5". @param {number} L */
export const levelKey = (L) => (L < 3 ? "enh"[L] ?? "n" : `t${L - 2}`);
/** @param {string} k @returns {number | undefined} */
export function parseLevelKey(k) {
  const i = "enh".indexOf(k);
  if (k.length === 1 && i >= 0) return i;
  const m = /^t(\d{1,2})$/.exec(k);
  return m ? Number(m[1]) + 2 : undefined;
}
/** Highest level a world allows. @param {number} maxTier */
export const topLevel = (maxTier) => 2 + clamp(Math.floor(maxTier), 1, 20);

/**
 * How hard a level is: everything the dungeon scales by.
 * @param {number} L
 */
export function scaleFor(L) {
  const t = tierOf(L);
  const tallFrom = clamp(Math.floor(CONFIG.tallFromTier), 1, 20);
  return {
    t,
    roomsMin: 6 + Math.round((L * 8) / 22),
    roomsMax: 8 + Math.round((L * 10) / 22),
    /** Waves per combat room. */
    waves: L < 3 ? 2 + L : Math.min(8, 4 + Math.floor((t - 1) / 5)),
    /** Mobs per wave before the party bonus (plus 0 or 1 at random). */
    mobs: 2 + Math.floor(L / 3),
    /** Effect amplifiers for wave mobs; -1 is none. */
    healthBoost: t >= 1 ? Math.floor((t - 1) / 2) : -1,
    resistance: t >= 16 ? 1 : t >= 6 ? 0 : -1,
    strength: t >= 15 ? 2 : t >= 8 ? 1 : L >= 2 ? 0 : -1,
    speed: t >= 14 ? 1 : t >= 4 ? 0 : -1,
    /** 0 none, 1 chainmail, 2 iron, 3 diamond, 4 netherite. */
    armor: t >= 17 ? 4 : t >= 12 ? 3 : t >= 7 ? 2 : t >= 3 ? 1 : 0,
    armorChance: t >= 3 ? Math.min(0.9, 0.2 + t * 0.035) : 0,
    /** Elite mobs in each wave. */
    elites: L >= 2 ? 1 + Math.floor(t / 6) : 0,
    /** Chance that a wave brings a champion. */
    champChance: t >= 1 ? Math.min(0.8, 0.1 + t * 0.035) : 0,
    bossHealth: 1 + 0.2 * L,
    /** Adds the boss calls every 20 seconds (0: none). */
    bossAdds: t >= 5 ? 1 + Math.floor(t / 5) : 0,
    crowns: 1 + 0.25 * L,
    loot: 1 + 0.1 * L,
    relic: 0.01 * t,
    affixes: t === 0 ? 0 : t <= 4 ? 1 : t <= 9 ? 2 : t <= 14 ? 3 : 4,
    puzzles: 1 + Math.floor(L / 8),
    traps: L >= 12 ? 2 : L >= 1 ? 1 : 0,
    shrines: L >= 2 ? 1 : 0,
    eliteRooms: L >= 2 ? 1 + Math.floor(t / 8) : 0,
    shafts: t >= tallFrom ? (t >= 15 ? 2 : 1) : 0,
    sides: t >= 10 ? 2 : t >= 1 ? 1 : 0,
    tall: t >= tallFrom,
    tallChance: t >= tallFrom ? Math.min(0.8, 0.35 + t * 0.02) : 0,
    tallMax: t >= tallFrom ? Math.min(MAX_ROOM_H, 14 + 2 * (t - tallFrom)) : 5,
    /** Gap between parkour ledges (blocks of air). */
    gap: t >= 8 ? 2 : 1,
    /** Shafts get a ladder below tier 10; from tier 10 it's ledges, your own blocks or an elytra. */
    ladders: t < 10,
    build: t >= Math.max(1, Math.floor(CONFIG.buildFromTier)),
  };
}

/**
 * Minutes for a run with `rooms` rooms at level L.
 * @param {number} base minutes for 7 rooms @param {number} rooms @param {number} L
 */
export function timeLimit(base, rooms, L) {
  const t = tierOf(L);
  return Math.max(5, Math.round(((base * rooms) / 7) * (1 - 0.01 * t)));
}

// ---------------------------------------------------------------------------
// Affixes
// ---------------------------------------------------------------------------

/**
 * Nightmare affixes: code (for sigils), name, color, what it does, the first tier it can roll at and how often.
 * @type {{ id: string, code: string, name: string, color: string, desc: string, min: number, weight: number, good?: boolean }[]}
 */
export const AFFIXES = [
  { id: "frenzied", code: "fr", name: "Frenzied", color: "§c", desc: "Monsters move faster.", min: 1, weight: 10 },
  { id: "bulwark", code: "bu", name: "Bulwark", color: "§7", desc: "Monsters take less damage.", min: 1, weight: 10 },
  { id: "swarming", code: "sw", name: "Swarming", color: "§6", desc: "Half again as many monsters in every wave.", min: 1, weight: 8 },
  { id: "shrouded", code: "sh", name: "Shrouded", color: "§8", desc: "Darkness pulses through the dungeon.", min: 1, weight: 8 },
  { id: "frozen", code: "fz", name: "Frozen", color: "§b", desc: "Frost patches slow you. Watch for snowflakes.", min: 1, weight: 8 },
  { id: "hunger", code: "hu", name: "Hunger", color: "§e", desc: "You grow hungry while you fight.", min: 1, weight: 6 },
  { id: "volcanic", code: "vo", name: "Volcanic", color: "§c", desc: "Fire bursts from the floor near you. Watch for flames.", min: 3, weight: 8 },
  { id: "explosive", code: "ex", name: "Explosive Death", color: "§6", desc: "Monsters burst a moment after they die.", min: 3, weight: 7 },
  { id: "backup", code: "ba", name: "Backup", color: "§6", desc: "Hurt monsters call for help, once each.", min: 3, weight: 6 },
  { id: "vampiric", code: "va", name: "Vampiric", color: "§4", desc: "Monsters heal when they hit you.", min: 5, weight: 7 },
  { id: "thorned", code: "th", name: "Thorned", color: "§2", desc: "Hitting monsters up close hurts you a little.", min: 5, weight: 6 },
  { id: "champions", code: "ch", name: "Champion Packs", color: "§5", desc: "Every wave brings a champion.", min: 5, weight: 6 },
  { id: "venomous", code: "ve", name: "Venomous", color: "§2", desc: "Monster hits poison you (wither from tier 15).", min: 5, weight: 6 },
  { id: "beams", code: "ab", name: "Arcane Beams", color: "§d", desc: "Beams sweep the room. Step out of the sparks.", min: 7, weight: 6 },
  { id: "lightning", code: "li", name: "Lightning Storm", color: "§e", desc: "Lightning strikes where the air crackles.", min: 7, weight: 6 },
  { id: "blinding", code: "bl", name: "Blinding", color: "§8", desc: "Bursts of blindness.", min: 10, weight: 5 },
  { id: "juggernaut", code: "ju", name: "Juggernaut", color: "§7", desc: "Monsters have far more health.", min: 10, weight: 5 },
  { id: "blessed", code: "bs", name: "Blessing", color: "§a", desc: "Half again as much treasure and a quarter more Crowns.", min: 1, weight: 0, good: true },
];
/** Chance that a Nightmare run also rolls the Blessing. */
export const BLESSING_CHANCE = 0.15;

/** @param {string} id */
export const affixOf = (id) => AFFIXES.find((a) => a.id === id);
/** "§cFrenzied§r, §7Bulwark§r" @param {string[]} ids */
export const affixNames = (ids) => ids.map((id) => affixOf(id)).filter((a) => !!a).map((a) => `${a?.color}${a?.name}§r`).join(", ");

/**
 * The affixes for a run at level L: as many as the level says, weighted, never twice, plus maybe the Blessing.
 * @param {number} L @param {() => number} r @param {string[]} [avoid] ids not to roll
 */
export function rollAffixes(L, r, avoid = []) {
  const s = scaleFor(L);
  /** @type {string[]} */
  const out = [];
  let pool = AFFIXES.filter((a) => !a.good && a.min <= s.t && !avoid.includes(a.id));
  for (let k = 0; k < s.affixes && pool.length; k++) {
    const total = pool.reduce((n, a) => n + a.weight, 0);
    let x = r() * total;
    let chosen = pool[pool.length - 1];
    for (const a of pool) {
      x -= a.weight;
      if (x < 0) {
        chosen = a;
        break;
      }
    }
    out.push(chosen.id);
    pool = pool.filter((a) => a !== chosen);
  }
  if (s.t >= 1 && r() < BLESSING_CHANCE) out.push("blessed");
  return out;
}

/** One more affix for a shrine's curse: one the run doesn't have yet, from the whole list. @param {string[]} have @param {() => number} r */
export function curseAffix(have, r) {
  const pool = AFFIXES.filter((a) => !a.good && !have.includes(a.id) && a.min <= 10);
  return pool.length ? pick(pool, r).id : undefined;
}

// ---------------------------------------------------------------------------
// Local frames
// ---------------------------------------------------------------------------

/** @param {V2} back the way players came in */
export function frame(back) {
  const fwd = { x: -back.x, z: -back.z };
  return { back, fwd, across: { x: -fwd.z, z: fwd.x } };
}
/** @typedef {ReturnType<typeof frame>} Frame */

/** World x, z of local (u, v) around a room center. @param {Frame} fr @param {V2} c @param {number} u @param {number} v */
export const toWorld = (fr, c, u, v) => ({ x: c.x + fr.across.x * u + fr.fwd.x * v, z: c.z + fr.across.z * u + fr.fwd.z * v });

/** Local unit (du, dv) of a face. @type {Record<string, [number, number]>} */
export const FACE_UV = { back: [0, -1], fwd: [0, 1], left: [-1, 0], right: [1, 0] };

/** Which face of the room points along world direction d. @param {Frame} fr @param {V2} d @returns {Face} */
export function faceOf(fr, d) {
  if (d.x === fr.back.x && d.z === fr.back.z) return "back";
  if (d.x === fr.fwd.x && d.z === fr.fwd.z) return "fwd";
  if (d.x === fr.across.x && d.z === fr.across.z) return "right";
  return "left";
}

/** World direction of a local face. @param {Frame} fr @param {Face} f @returns {V2} */
export function faceDir(fr, f) {
  const uv = FACE_UV[f];
  if (!uv) return { x: 0, z: 0 };
  return { x: fr.across.x * uv[0] + fr.fwd.x * uv[1], z: fr.across.z * uv[0] + fr.fwd.z * uv[1] };
}

/** Local (u, v) on wall face `side`, `a` across it, `d` deep from the center (7 is the row by the wall). @param {Face} side @param {number} a @param {number} d */
export function onSide(side, a, d) {
  switch (side) {
    case "back":
      return { u: a, v: -d };
    case "fwd":
      return { u: a, v: d };
    case "left":
      return { u: -d, v: a };
    default:
      return { u: d, v: a };
  }
}

/** The face opposite another. @param {Face} f @returns {Face} */
export const opposite = (f) => OPPOSITE[f];
/** @type {Record<Face, Face>} */
const OPPOSITE = { back: "fwd", fwd: "back", left: "right", right: "left", up: "down", down: "up" };

/**
 * The ring of interior blocks along the walls, clockwise, without the four corners (where the pillars stand).
 * @returns {{ u: number, v: number, side: Face, a: number }[]}
 */
export function ring() {
  /** @type {{ u: number, v: number, side: Face, a: number }[]} */
  const out = [];
  for (let a = -R + 1; a <= R - 1; a++) out.push({ ...onSide("fwd", a, R), side: "fwd", a });
  for (let a = R - 1; a >= -R + 1; a--) out.push({ ...onSide("right", a, R), side: "right", a });
  for (let a = R - 1; a >= -R + 1; a--) out.push({ ...onSide("back", a, R), side: "back", a });
  for (let a = -R + 1; a <= R - 1; a++) out.push({ ...onSide("left", a, R), side: "left", a });
  return out;
}
const RING = ring();

/** Is local (u, v) right in front of one of these doors (where walking in and out must stay clear)? @param {Door[]} doors @param {number} u @param {number} v @param {number} [y] */
export function blocksDoor(doors, u, v, y = 1) {
  for (const d of doors) {
    if (d.side === "up" || d.side === "down") continue;
    if (y < d.y + 1 || y > d.y + 3) continue;
    for (let a = -1; a <= 1; a++) {
      const p = onSide(d.side, a, R);
      if (p.u === u && p.v === v) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Puzzles (data)
// ---------------------------------------------------------------------------

/** Puzzle colors: the wool under each lever and how the clues name it (dark colors read well on a sign). */
export const COLORS = [
  { name: "RED", code: "§4", wool: "minecraft:red_wool", pitch: 0.7 },
  { name: "BLUE", code: "§1", wool: "minecraft:blue_wool", pitch: 0.9 },
  { name: "YELLOW", code: "§6", wool: "minecraft:yellow_wool", pitch: 1.1 },
  { name: "GREEN", code: "§2", wool: "minecraft:green_wool", pitch: 1.35 },
  { name: "WHITE", code: "§8", wool: "minecraft:white_wool", pitch: 1.6 },
  { name: "BLACK", code: "§0", wool: "minecraft:black_wool", pitch: 0.5 },
];

/** How a wool riddle sign describes each color. */
export const COLOR_RIDDLES = [
  ["fresh redstone", "a ripe apple", "a poppy"],
  ["lapis lazuli", "the deep sea", "a cornflower"],
  ["the sun", "a gold ingot", "a dandelion"],
  ["an emerald", "a creeper", "a slime"],
  ["fresh snow", "a bone", "a lily"],
  ["coal", "an ink sac", "an obsidian night"],
];

/** Riddles: the question and the right answer first, then the wrong ones. Every answer fits a sign line. */
export const RIDDLES = [
  ["The more of me you take, the more you leave behind. What am I?", "Footsteps", "Coins", "Arrows", "Memories"],
  ["I have cities but no houses, forests but no trees, and water but no fish.", "A map", "A book", "A painting", "A banner"],
  ["Green and quiet, I creep close. I hiss before I sleep.", "A creeper", "A slime", "A zombie", "A spider"],
  ["I am full of holes, yet I drink a whole lake.", "A sponge", "A bucket", "A cauldron", "Kelp"],
  ["I go up and never come down.", "Your age", "Rain", "A rocket", "An elytra"],
  ["Tall and dark, I steal blocks and hate your gaze.", "An enderman", "A wither", "A witch", "A phantom"],
  ["Feed me and I live. Give me water and I die.", "Fire", "A plant", "A blaze", "Coal"],
  ["Ring me and the village gathers. Drown me and the town forgets.", "A bell", "A horn", "A drum", "A note block"],
  ["I fall from the sky once in forty years, and the seals drink my light.", "The Lantern", "Rain", "Snow", "A phantom"],
  ["Leather and paper make me. I keep your stories forever.", "A book", "A chest", "A lectern", "A map"],
  ["I point the way to the world's spawn, but never to the north.", "A compass", "A clock", "A map", "A lodestone"],
  ["I have a face and two hands, but no arms or legs.", "A clock", "A compass", "A painting", "A totem"],
  ["Sound frozen in crystal. The Starwrights wrote with me.", "An echo shard", "Amethyst", "A diamond", "Glass"],
  ["Break me and I keep working; say my name and I am gone.", "Silence", "A promise", "Glass", "A bone"],
];

/**
 * Four levers, each on or off. Clues are true statements picked at random until only the solution fits,
 * starting with how many are on.
 * @param {() => number} r @returns {{ solution: boolean[], clues: string[] }}
 */
export function leverPuzzle(r) {
  const combos = [];
  for (let m = 1; m < 16; m++) combos.push([0, 1, 2, 3].map((i) => !!(m & (1 << i))));
  const solution = combos[Math.floor(r() * combos.length)];
  const name = (/** @type {number} */ i) => `${COLORS[i].code}${COLORS[i].name}§0`;
  const on = solution.filter(Boolean).length;
  /** @type {{ text: string, fits: (c: boolean[]) => boolean }[]} */
  const pool = [];
  for (let i = 0; i < 4; i++) {
    pool.push(solution[i] ? { text: `${name(i)} is on`, fits: (c) => c[i] } : { text: `${name(i)} is off`, fits: (c) => !c[i] });
    for (let j = i + 1; j < 4; j++) {
      pool.push(
        solution[i] === solution[j]
          ? { text: `${name(i)} and ${name(j)}\nmatch`, fits: (c) => c[i] === c[j] }
          : { text: `${name(i)} and ${name(j)}\ndiffer`, fits: (c) => c[i] !== c[j] },
      );
    }
  }
  const count = { text: on === 4 ? "All 4 levers\nare on" : `${on} lever${on === 1 ? " is" : "s are"}\non`, fits: (/** @type {boolean[]} */ c) => c.filter(Boolean).length === on };
  for (let attempt = 0; attempt < 30; attempt++) {
    const picked = [count];
    let left = combos.filter(count.fits);
    for (const clue of shuffle(pool, r)) {
      if (left.length <= 1) break;
      const next = left.filter(clue.fits);
      if (next.length < left.length) {
        picked.push(clue);
        left = next;
      }
    }
    if (left.length === 1 && picked.length <= 4) return { solution, clues: picked.map((c) => c.text) };
  }
  return { solution, clues: [0, 1, 2, 3].map((i) => `${name(i)} is ${solution[i] ? "on" : "off"}`) };
}

/** Lights out on a 3 x 3 panel: pressing a lamp flips it and the ones next to it (not diagonally). @param {boolean[]} s @param {number} k */
export function lampPress(s, k) {
  const out = [...s];
  const row = Math.floor(k / 3);
  const col = k % 3;
  for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const rr = row + dr;
    const cc = col + dc;
    if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) out[rr * 3 + cc] = !out[rr * 3 + cc];
  }
  return out;
}

/** Word-wraps text into lines of at most `w` characters. @param {string} text @param {number} [w] */
export function wrap(text, w = 15) {
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    if (line && line.length + 1 + word.length > w) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** Puzzle kinds and the first level each may appear at. */
export const PUZZLE_KINDS = /** @type {const} */ ([
  ["levers", 0],
  ["simon", 0],
  ["wool", 0],
  ["riddle", 0],
  ["lamps", 0],
  ["plates", 1],
  ["targets", 1],
  ["rush", 1],
  ["parkour", 1],
]);

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * A path of `n` neighboring cells through a g x g grid, never visiting a cell twice. Falls back to a snake.
 * @param {() => number} r @param {number} n @param {number} g @returns {[number, number][]}
 */
export function walk(r, n, g) {
  /** @type {[number, number][]} */
  const path = [];
  const seen = new Set();
  let budget = 40000;
  /** @param {number} x @param {number} z @returns {boolean} */
  const step = (x, z) => {
    if (--budget < 0) return false;
    path.push([x, z]);
    seen.add(x * 10 + z);
    if (path.length === n) return true;
    for (const [dx, dz] of shuffle(DIRS, r)) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= g || nz >= g || seen.has(nx * 10 + nz)) continue;
      if (step(nx, nz)) return true;
    }
    path.pop();
    seen.delete(x * 10 + z);
    return false;
  };
  for (const s of shuffle([...Array(g * g).keys()], r)) {
    if (step(s % g, Math.floor(s / g))) return path;
    if (budget < 0) break;
  }
  /** @type {[number, number][]} */
  const snake = [];
  for (let z = 0; z < g; z++) for (let x = 0; x < g; x++) snake.push([z % 2 ? g - 1 - x : x, z]);
  return snake.slice(0, n);
}

/**
 * Ledges along the walls, every `step` ring places, from (ring index `from`, height `top`) down to height 1,
 * going `dir` around the ring. Undefined when a ledge would land where it mustn't.
 * @param {number} from @param {number} dir @param {number} step @param {number} top
 * @param {(p: { u: number, v: number }, y: number) => boolean} bad
 */
function chain(from, dir, step, top, bad) {
  /** @type {P3[]} */
  const out = [];
  const n = RING.length;
  let idx = from;
  for (let y = top; y >= 1; y--) {
    idx = (((idx + dir * step) % n) + n) % n;
    const p = RING[idx];
    if (bad(p, y)) return undefined;
    // Head room: nothing within 3 above or below in the same column.
    if (out.some((q) => q.u === p.u && q.v === p.v && Math.abs(q.y - y) < 4)) return undefined;
    out.push({ u: p.u, v: p.v, y });
  }
  return out;
}

/**
 * The whole dungeon for a seed and level.
 * @param {number} seed @param {number} L
 * @returns {Layout}
 */
export function layout(seed, L) {
  const r = rng(seed);
  const s = scaleFor(L);
  const n = s.roomsMin + Math.floor(r() * (s.roomsMax - s.roomsMin + 1));
  let g = 3;
  while (g < MAX_GRID && g * g < n + s.sides) g++;
  const cells = walk(r, n, g);
  const kinds = roomKinds(r, s, n, L);
  /** @type {Room[]} */
  const rooms = cells.map(([cx, cz], i) => {
    const exit = i < n - 1 ? { x: cells[i + 1][0] - cx, z: cells[i + 1][1] - cz } : null;
    const back = i > 0 ? { x: cells[i - 1][0] - cx, z: cells[i - 1][1] - cz } : exit ? { x: -exit.x, z: -exit.z } : { x: 0, z: -1 };
    return { kind: kinds[i], cx, cz, h: 5, back, exit, ey: 0, parent: -1, parts: [], spawns: [], fly: [], doors: [], chests: [], decor: 0, variant: "plain" };
  });
  // Side rooms: a free cell next to a path room (not the entry, a shaft, the boss or the treasure).
  const used = new Set(cells.map(([x, z]) => x * 10 + z));
  const hosts = shuffle(
    rooms.map((rm, i) => ({ rm, i })).filter(({ rm, i }) => i > 0 && i < n - 2 && rm.kind !== "shaft"),
    r,
  );
  for (let k = 0; k < s.sides; k++) {
    let placed = false;
    for (const { rm, i } of hosts) {
      if (rooms.some((o) => o.parent === i)) continue;
      for (const [dx, dz] of shuffle(DIRS, r)) {
        const x = rm.cx + dx;
        const z = rm.cz + dz;
        if (x < 0 || z < 0 || x >= g || z >= g || used.has(x * 10 + z)) continue;
        used.add(x * 10 + z);
        rooms.push({ kind: "cache", cx: x, cz: z, h: 5, back: { x: -dx, z: -dz }, exit: null, ey: 0, parent: i, parts: [], spawns: [], fly: [], doors: [], chests: [], decor: 0, variant: "plain" });
        placed = true;
        break;
      }
      if (placed) break;
    }
  }
  // Heights and exits.
  for (const rm of rooms) {
    if (rm.kind === "shaft") {
      rm.h = clamp(16 + Math.floor(s.t * 0.6) + Math.floor(r() * 4), 16, MAX_ROOM_H);
      rm.ey = rm.h - 4;
    } else if (rm.kind === "boss") rm.h = s.tall ? clamp(14 + Math.floor(r() * (s.tallMax - 13)), 14, s.tallMax) : L >= 2 ? 8 : 5;
    else if (rm.kind === "combat" || rm.kind === "elite") {
      if (s.tall && r() < s.tallChance) rm.h = clamp(14 + Math.floor(r() * (s.tallMax - 13)), 14, s.tallMax);
      else if (L >= 2 && r() < 0.35) rm.h = 8;
    }
  }
  // Doors (now that every room's exit height is known).
  rooms.forEach((rm, i) => {
    const fr = frame(rm.back);
    if (i > 0 && rm.parent < 0) rm.doors.push({ side: "back", y: 0, bars: false, to: i - 1 });
    if (rm.exit) rm.doors.push({ side: faceOf(fr, rm.exit), y: rm.ey, bars: rm.kind !== "shaft", to: i + 1 });
    if (rm.parent >= 0) {
      rm.doors.push({ side: "back", y: 0, bars: false, to: rm.parent });
      const host = rooms[rm.parent];
      host.doors.push({ side: faceOf(frame(host.back), { x: -rm.back.x, z: -rm.back.z }), y: 0, bars: false, to: i });
    }
  });
  // Puzzle kinds: different ones where possible.
  const puzzleRooms = rooms.filter((rm) => rm.kind === "puzzle" || rm.kind === "cache");
  const allowed = PUZZLE_KINDS.filter(([, from]) => from <= L).map(([k]) => k);
  let bag = shuffle(allowed, r);
  for (const rm of puzzleRooms) {
    if (!bag.length) bag = shuffle(allowed, r);
    let idx = bag.findIndex((k) => !(rm.kind === "cache" && (k === "parkour" || k === "rush")));
    if (idx < 0) idx = 0;
    let kind = bag.splice(idx, 1)[0];
    if (rm.kind === "cache" && (kind === "parkour" || kind === "rush")) kind = "levers";
    if (kind === "parkour") rm.h = clamp(8 + s.t, 8, 24);
    if (kind === "targets") rm.h = 5 + Math.min(5, Math.floor(s.t / 2));
    rm.puzzle = { type: kind };
  }
  rooms.forEach((rm, i) => fillRoom(rm, i, r, s, L, n));
  const height = Math.max(7, ...rooms.map((rm) => rm.h + 2));
  return { grid: g, n, height, rooms, level: L };
}

/**
 * What each path room is: entry, a shuffled middle, boss, treasure.
 * @param {() => number} r @param {ReturnType<typeof scaleFor>} s @param {number} n @param {number} L @returns {Kind[]}
 */
function roomKinds(r, s, n, L) {
  const middle = n - 3;
  const room = middle - 2; // at least two combat rooms
  /** @type {Kind[]} */
  const wanted = ["puzzle"];
  for (let k = 0; k < s.shafts; k++) wanted.push("shaft");
  for (let k = 0; k < s.eliteRooms; k++) wanted.push("elite");
  for (let k = 0; k < s.traps; k++) wanted.push("trap");
  if (s.shrines && r() < 0.75) wanted.push("shrine");
  for (let k = 1; k < s.puzzles; k++) wanted.push("puzzle");
  const special = wanted.slice(0, Math.max(1, room));
  /** @type {Kind[]} */
  const combat = Array(Math.max(0, middle - special.length)).fill("combat");
  let mid = shuffle([...special, ...combat], r);
  // A shaft drops you into the next room by a pool: keep it off the room before the boss, so the boss room never starts under a drop.
  if (L >= 0 && mid.length > 1 && mid[mid.length - 1] === "shaft") {
    const j = mid.findIndex((k) => k !== "shaft");
    if (j >= 0) [mid[j], mid[mid.length - 1]] = [mid[mid.length - 1], mid[j]];
  }
  return ["entry", ...mid, "boss", "treasure"];
}

/** Floor spots for wave mobs: a ring halfway out, clear of the doors. @returns {P3[]} */
function floorSpawns() {
  /** @type {P3[]} */
  const out = [];
  for (let a = -4; a <= 4; a += 2) {
    out.push({ u: a, v: 5, y: 1 }, { u: a, v: -5, y: 1 }, { u: 5, v: a, y: 1 }, { u: -5, v: a, y: 1 });
  }
  return out;
}

/**
 * Fills in one room's parts, spawn spots and puzzle.
 * @param {Room} rm @param {number} i @param {() => number} r @param {ReturnType<typeof scaleFor>} s @param {number} L @param {number} n
 */
function fillRoom(rm, i, r, s, L, n) {
  const P = rm.parts;
  if (rm.kind === "combat" || rm.kind === "elite" || rm.kind === "boss") {
    rm.spawns = floorSpawns();
    if (rm.h >= 8) balconies(rm, r);
    if (rm.h >= 10) rm.fly = [{ u: 0, v: 0, y: Math.min(rm.h - 2, 9) }, { u: 3, v: -3, y: Math.min(rm.h - 3, 7) }, { u: -3, v: 3, y: Math.min(rm.h - 3, 7) }];
    // Variety: cover pillars or a low ring wall in some rooms.
    const roll = r();
    if (rm.kind !== "boss" && roll < 0.3) {
      rm.variant = "pillars";
      for (const [u, v] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) P.push({ k: "accent", u, v, y: 1, y2: Math.min(rm.h, 4) });
    } else if (rm.kind !== "boss" && roll < 0.5) {
      rm.variant = "ring";
      for (let a = -3; a <= 3; a++) {
        if (Math.abs(a) <= 1) continue;
        P.push({ k: "trim", u: a, v: 3, y: 1 }, { k: "trim", u: a, v: -3, y: 1 }, { k: "trim", u: 3, v: a, y: 1 }, { k: "trim", u: -3, v: a, y: 1 });
      }
    }
    if (rm.kind !== "boss") rm.decor = 1;
  } else if (rm.kind === "entry") {
    P.push({ k: "sign", u: 0, v: 3, y: 1, f: "back", t: "name" }, { k: "sign", u: -2, v: 3, y: 1, f: "back", t: "lore" }, { k: "sign", u: 2, v: 3, y: 1, f: "back", t: "affixes" });
  } else if (rm.kind === "treasure") {
    rm.chests.push({ u: 0, v: 0, y: 1 });
    if (L >= 8) rm.chests.push({ u: 2, v: 0, y: 1 });
  } else if (rm.kind === "trap") {
    const exitSide = rm.doors.find((d) => d.to === i + 1)?.side ?? "fwd";
    const z = onSide(exitSide, 0, R - 1);
    rm.zone = { u: z.u, v: z.v, y: 1, r: 2.5 };
    P.push({ k: "sign", u: 2, v: -5, y: 1, f: "back", t: "§lTrap hall§r\nWatch the floor\nand the walls.\nRun for the exit!" });
  } else if (rm.kind === "shrine") {
    P.push({ k: "gold", u: -3, v: 2, y: 1 }, { k: "button", u: -3, v: 2, y: 2, f: "up", i: 0 });
    P.push({ k: "pass", u: 0, v: 2, y: 1 }, { k: "button", u: 0, v: 2, y: 2, f: "up", i: 1 });
    P.push({ k: "curse", u: 3, v: 2, y: 1 }, { k: "button", u: 3, v: 2, y: 2, f: "up", i: 2 });
    P.push({ k: "sign", u: -3, v: 0, y: 1, f: "back", t: "blessing" }, { k: "sign", u: 0, v: 0, y: 1, f: "back", t: "§lPass by§r\nTake nothing\nand go on" }, { k: "sign", u: 3, v: 0, y: 1, f: "back", t: "curse" });
  } else if (rm.kind === "shaft") shaft(rm, r, s);
  else if (rm.kind === "cache") rm.chests.push({ u: 5, v: 5, y: 1 });
  if (rm.puzzle) puzzleParts(rm, r, s, L);
}

/** Balconies on alternating walls, each with a ladder up from the floor. @param {Room} rm @param {() => number} r */
function balconies(rm, r) {
  /** @type {Face[]} */
  const sides = shuffle(/** @type {Face[]} */ (["fwd", "right", "back", "left"]), r);
  let k = 0;
  for (let y = 4; y <= rm.h - 4; y += 6) {
    const side = sides[k++ % 4];
    const flip = r() < 0.5 ? 1 : -1;
    // Platform 3 deep along the wall, from a = -5 to 6 (or mirrored), with a ladder at a = -6 by the wall.
    const a1 = flip > 0 ? -5 : -6;
    const a2 = flip > 0 ? 6 : 5;
    const p1 = onSide(side, a1, R - 2);
    const p2 = onSide(side, a2, R);
    rm.parts.push({ k: "trim", u: p1.u, v: p1.v, y, u2: p2.u, v2: p2.v, y2: y });
    const lad = onSide(side, -6 * flip, R);
    rm.parts.push({ k: "ladder", u: lad.u, v: lad.v, y: 1, y2: y + 1, f: opposite(side) });
    const lamp = onSide(side, 4 * flip, R);
    rm.parts.push({ k: "lantern", u: lamp.u, v: lamp.v, y: y + 1 });
    const mid = onSide(side, 0, R - 1);
    rm.spawns.push({ u: mid.u, v: mid.v, y: y + 1 });
  }
}

/**
 * A vertical shaft: the exit is high in the wall, over a landing; ledges climb the walls to it (and a
 * ladder below tier 10). Reaching the landing clears the room.
 * @param {Room} rm @param {() => number} r @param {ReturnType<typeof scaleFor>} s
 */
function shaft(rm, r, s) {
  const exit = rm.doors.find((d) => d.y > 0);
  const side = exit?.side ?? "fwd";
  const y = rm.ey;
  const ladderSide = r() < 0.5 ? 1 : -1; // the ladder goes on this side of the landing, the ledges start on the other
  const l1 = onSide(side, -1, R - 1);
  const l2 = onSide(side, 1, R);
  rm.parts.push({ k: "trim", u: l1.u, v: l1.v, y, u2: l2.u, v2: l2.v, y2: y });
  const z = onSide(side, 0, R - 1);
  rm.zone = { u: z.u, v: z.v, y: y + 1, r: 2 };
  const ladderA = 2 * ladderSide;
  const lad = onSide(side, ladderA, R);
  if (s.ladders) rm.parts.push({ k: "ladder", u: lad.u, v: lad.v, y: 1, y2: y + 1, f: opposite(side) });
  // The ring index of the landing's edge on the ledge side, then down from there.
  const edgeA = -ladderSide;
  const from = RING.findIndex((p) => p.side === side && p.a === edgeA);
  const dir = (() => {
    // Which way round the ring moves away from the landing on the ledge side.
    const next = RING[(from + 1) % RING.length];
    return next.side === side && next.a === edgeA - ladderSide ? 1 : next.side === side && next.a === edgeA + ladderSide ? -1 : 1;
  })();
  /** @param {{ u: number, v: number }} p @param {number} yy */
  const bad = (p, yy) => {
    if (blocksDoor(rm.doors, p.u, p.v, yy) || blocksDoor(rm.doors, p.u, p.v, yy + 1) || blocksDoor(rm.doors, p.u, p.v, yy + 2)) return true;
    if (s.ladders && p.u === lad.u && p.v === lad.v) return true;
    // Not in or right under the landing.
    for (let a = -1; a <= 1; a++) {
      const q = onSide(side, a, R);
      if (q.u === p.u && q.v === p.v && Math.abs(y - yy) < 4) return true;
    }
    return false;
  };
  let ledges;
  for (const step of [s.gap + 1, s.gap + 1, 2]) {
    for (const d of [dir, -dir]) {
      if (ledges) break;
      ledges = chain(from + (d === dir ? 0 : 0), d, step, y - 1, bad);
    }
    if (ledges) break;
  }
  if (ledges) for (const p of ledges) rm.parts.push({ k: "trim", u: p.u, v: p.v, y: p.y });
  else if (!s.ladders) rm.parts.push({ k: "ladder", u: lad.u, v: lad.v, y: 1, y2: y + 1, f: opposite(side) }); // never stuck
  rm.fly = [{ u: 0, v: 0, y: Math.floor(rm.h / 2) }, { u: 3, v: 3, y: Math.floor(rm.h / 3) }, { u: -3, v: -3, y: Math.floor((rm.h * 2) / 3) }];
  rm.parts.push({ k: "sign", u: 0, v: -5, y: 1, f: "back", t: "§lThe shaft§r\nThe way on is\nhigh up. Climb,\nbuild or fly!" });
  for (let yy = 6; yy < rm.h - 1; yy += 6) rm.parts.push({ k: "glow", u: 0, v: 0, y: yy, i: 1 });
}

/**
 * A puzzle's parts and data.
 * @param {Room} rm @param {() => number} r @param {ReturnType<typeof scaleFor>} s @param {number} L
 */
function puzzleParts(rm, r, s, L) {
  const pz = /** @type {Puzzle} */ (rm.puzzle);
  const P = rm.parts;
  const signRow = -3;
  switch (pz.type) {
    case "levers": {
      const { solution, clues } = leverPuzzle(r);
      pz.solution = solution;
      pz.clues = clues;
      [-3, -1, 1, 3].forEach((u, k) => {
        P.push({ k: "wool", u, v: 2, y: 0, i: k }, { k: "lever", u, v: 2, y: 1, i: k });
        if (k < clues.length) P.push({ k: "sign", u, v: signRow, y: 1, f: "back", t: `§lClue ${k + 1} of ${clues.length}§r\n${clues[k]}` });
      });
      break;
    }
    case "simon": {
      const len = clamp(3 + Math.floor(L / 4), 3, 8);
      pz.seq = Array.from({ length: len }, () => Math.floor(r() * 4));
      [-3, -1, 1, 3].forEach((u, k) => P.push({ k: "wool", u, v: 2, y: 1, i: k }, { k: "button", u, v: 2, y: 2, f: "up", i: k }));
      P.push({ k: "gold", u: 0, v: -1, y: 1 }, { k: "button", u: 0, v: -1, y: 2, f: "up", i: 9 });
      P.push({ k: "sign", u: -2, v: signRow, y: 1, f: "back", t: `§lMemory§r\nWatch the ${len}\nflashes, then\npress in order` }, { k: "sign", u: 2, v: signRow, y: 1, f: "back", t: "§lGold button§r\nshows the\nsequence again" });
      break;
    }
    case "plates": {
      const size = L >= 8 ? 5 : 4;
      pz.n = size;
      // Rows go away from the entrance. Start in row 0, end in the last row, stepping forward or sideways.
      let col = Math.floor(r() * size);
      let row = 0;
      const path = [row * size + col];
      let lastSide = 0;
      while (row < size - 1 && path.length < size * size) {
        const opts = [];
        opts.push([1, 0], [1, 0]);
        if (col > 0 && lastSide !== 1 && !path.includes(row * size + col - 1)) opts.push([0, -1]);
        if (col < size - 1 && lastSide !== -1 && !path.includes(row * size + col + 1)) opts.push([0, 1]);
        const [dr, dc] = pick(opts, r);
        row += dr;
        col += dc;
        lastSide = dc;
        path.push(row * size + col);
      }
      pz.path = path;
      const coords = size === 5 ? [-4, -2, 0, 2, 4] : [-3, -1, 1, 3];
      for (let rr = 0; rr < size; rr++) for (let cc = 0; cc < size; cc++) P.push({ k: "plate", u: coords[cc], v: coords[rr], y: 1, i: rr * size + cc });
      P.push({ k: "gold", u: -5, v: -6, y: 1 }, { k: "button", u: -5, v: -6, y: 2, f: "up", i: 9 });
      P.push({ k: "sign", u: 5, v: -6, y: 1, f: "back", t: "§lSafe path§r\nStep only on the\nplates that\nflash, in order" });
      break;
    }
    case "targets": {
      const count = clamp(3 + Math.floor(L / 5), 3, 7);
      pz.count = count;
      const spots = [];
      for (const side of /** @type {Face[]} */ (["fwd", "left", "right", "back"])) {
        for (let a = -6; a <= 6; a++) {
          if (Math.abs(a) < 3) continue;
          for (let y = 2; y <= rm.h - 1; y++) spots.push({ ...onSide(side, a, R + 1), y });
        }
      }
      shuffle(spots, r)
        .slice(0, count)
        .forEach((p, k) => P.push({ k: "target", u: p.u, v: p.v, y: p.y, i: k }));
      P.push({ k: "sign", u: 0, v: signRow, y: 1, f: "back", t: `§lTarget hall§r\nHit all ${count}\ntargets with\narrows or snow` });
      break;
    }
    case "lamps": {
      let st = Array(9).fill(true);
      while (st.every(Boolean)) for (let k = 0; k < 4 + Math.floor(r() * 4); k++) st = lampPress(st, Math.floor(r() * 9));
      pz.start = st;
      for (let k = 0; k < 9; k++) {
        const u = (k % 3) - 1;
        const y = 3 - Math.floor(k / 3);
        P.push({ k: "lamp", u, v: 3, y, i: k }, { k: "button", u, v: 2, y, f: "back", i: k });
      }
      P.push({ k: "sign", u: -3, v: signRow, y: 1, f: "back", t: "§lLights out§r\nLight all nine\nlamps." }, { k: "sign", u: 3, v: signRow, y: 1, f: "back", t: "Each button\nflips its lamp\nand the ones\nnext to it" });
      break;
    }
    case "wool": {
      pz.answer = Array.from({ length: 4 }, () => Math.floor(r() * COLORS.length));
      [-3, -1, 1, 3].forEach((u, k) => {
        const c = /** @type {number[]} */ (pz.answer)[k];
        P.push({ k: "wool", u, v: 2, y: 1, i: 10 + ((c + 1 + Math.floor(r() * (COLORS.length - 1))) % COLORS.length) }, { k: "button", u, v: 2, y: 2, f: "up", i: k });
        P.push({ k: "sign", u, v: signRow, y: 1, f: "back", t: `§lPillar ${k + 1}§r\nis the color of\n${pick(COLOR_RIDDLES[c], r)}` });
      });
      break;
    }
    case "parkour": {
      const top = rm.h - 3;
      /** @type {Face[]} */
      const sides = shuffle(/** @type {Face[]} */ (["fwd", "left", "right"]), r);
      let done = false;
      for (const side of sides) {
        if (done) break;
        for (const a of shuffle([-4, -3, 3, 4], r)) {
          const from = RING.findIndex((p) => p.side === side && p.a === a);
          if (from < 0) continue;
          for (const d of [1, -1]) {
            const plat = RING[from];
            const stand = RING[(from + d + RING.length) % RING.length];
            /** @param {{ u: number, v: number }} p @param {number} yy */
            const bad = (p, yy) =>
              blocksDoor(rm.doors, p.u, p.v, yy) || blocksDoor(rm.doors, p.u, p.v, yy + 1) || ((p.u === plat.u && p.v === plat.v) || (p.u === stand.u && p.v === stand.v) ? Math.abs(yy - top) < 4 : false);
            const fromIdx = (from + d + RING.length) % RING.length;
            const ledges = chain(fromIdx, d, s.gap + 1, top - 1, bad);
            if (!ledges) continue;
            P.push({ k: "trim", u: plat.u, v: plat.v, y: top }, { k: "trim", u: stand.u, v: stand.v, y: top }, { k: "button", u: plat.u, v: plat.v, y: top + 1, f: "up", i: 0 });
            for (const p of ledges) P.push({ k: "trim", u: p.u, v: p.v, y: p.y });
            done = true;
            break;
          }
          if (done) break;
        }
      }
      if (!done) {
        // Never stuck: a ladder up to a platform in the middle.
        P.push({ k: "trim", u: 0, v: 3, y: top }, { k: "button", u: 0, v: 3, y: top + 1, f: "up", i: 0 }, { k: "trim", u: 0, v: 2, y: 1, y2: top }, { k: "ladder", u: 0, v: 1, y: 1, y2: top + 1, f: "back" });
      }
      for (let yy = 6; yy < rm.h - 1; yy += 6) P.push({ k: "glow", u: 0, v: 0, y: yy, i: 1 });
      P.push({ k: "sign", u: 0, v: signRow, y: 1, f: "back", t: "§lClimb§r\nJump up the\nledges and press\nthe button" });
      break;
    }
    case "rush": {
      const count = clamp(4 + Math.floor(L / 5), 4, 8);
      pz.count = count;
      pz.seconds = Math.max(count * 2 + 4, Math.round(count * 3 + 6 - s.t * 0.25));
      const spots = [];
      for (const side of /** @type {Face[]} */ (["fwd", "left", "right", "back"])) for (let a = -6; a <= 6; a++) if (Math.abs(a) >= 3) spots.push({ side, a });
      shuffle(spots, r)
        .slice(0, count)
        .forEach((p, k) => {
          const at = onSide(p.side, p.a, R);
          P.push({ k: "button", u: at.u, v: at.v, y: 2, f: opposite(p.side), i: k });
        });
      P.push({ k: "sign", u: 0, v: signRow, y: 1, f: "back", t: `§lButton rush§r\nPress all ${count}\nbuttons within\n${pz.seconds} seconds` });
      break;
    }
    case "riddle": {
      const [q, right, ...wrong] = pick(RIDDLES, r);
      const options = shuffle([right, ...shuffle(wrong, r).slice(0, L >= 6 ? 3 : 2)], r);
      pz.q = q;
      pz.options = options;
      pz.correct = options.indexOf(right);
      const us = options.length === 4 ? [-3, -1, 1, 3] : [-2, 0, 2];
      options.forEach((o, k) => {
        P.push({ k: "accent", u: us[k], v: 2, y: 1 }, { k: "button", u: us[k], v: 2, y: 2, f: "up", i: k }, { k: "sign", u: us[k], v: 1, y: 1, f: "back", t: `§l${o}` });
      });
      const lines = wrap(q, 15);
      P.push({ k: "sign", u: -1, v: -4, y: 1, f: "back", t: lines.slice(0, 4).join("\n") });
      if (lines.length > 4) P.push({ k: "sign", u: 1, v: -4, y: 1, f: "back", t: lines.slice(4, 8).join("\n") });
      break;
    }
  }
}

/**
 * Every block of a room in local coordinates that stands in the way of walking at floor level (for checks).
 * @param {Room} rm @returns {Set<string>} "u,v"
 */
export function floorBlockers(rm) {
  const out = new Set();
  const solid = new Set(["wall", "trim", "accent", "gold", "pass", "curse", "lamp", "wool", "target", "glow"]);
  for (const p of rm.parts) {
    if (!solid.has(p.k)) continue;
    const y1 = Math.min(p.y, p.y2 ?? p.y);
    const y2 = Math.max(p.y, p.y2 ?? p.y);
    if (y2 < 1 || y1 > 2) continue;
    for (let u = Math.min(p.u, p.u2 ?? p.u); u <= Math.max(p.u, p.u2 ?? p.u); u++) for (let v = Math.min(p.v, p.v2 ?? p.v); v <= Math.max(p.v, p.v2 ?? p.v); v++) out.add(`${u},${v}`);
  }
  for (const c of rm.chests) out.add(`${c.u},${c.v}`);
  for (const [u, v] of [[-R, -R], [R, -R], [-R, R], [R, R]]) out.add(`${u},${v}`);
  return out;
}
