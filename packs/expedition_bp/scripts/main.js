import {
  BlockPermutation,
  BlockVolume,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Dimension,
  Entity,
  GameMode,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, uiManager } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";

// An expedition is a dungeon generated from a seed, deep underground under the site an operator
// picked, inside a sealed box of deepslate: 3 x 3 cells of 16 blocks, one room per cell along a
// winding path, corridors between them. Only natural underground blocks are ever replaced, and the
// box is checked for anything else before each run. After the run, the box is filled back with
// deepslate. The layout can be rebuilt from the seed alone, so a run cut short by a restart is reset
// from its saved record.

const PROP_SITE = "expedition:site"; // world: JSON { x, z, by, at }
const PROP_RUN = "expedition:run:"; // + slot. world: JSON RunRecord while a dungeon exists in that slot
const PROP_NEXT = "expedition:next"; // world: next run id
const PROP_BEST = "expedition:best"; // world: JSON { [dungeonId]: Best[] }
const PROP_RETURN = "expedition:return"; // player: JSON { d, x, y, z, run } where to send them back

const OVERWORLD = "minecraft:overworld";
const MOB_TAG = "realm:exp_mob";
const PARTY_TAG = "realm_party:";
const CELL = 16;
const GRID = 3;
const SIZE = CELL * GRID; // 48: the box is SIZE x 9 x SIZE blocks
const LOOP_TICKS = 10;
const AWAY_TICKS = 100; // a member outside the dungeon this long has left it some other way
const GRACE_TICKS = 60; // after teleporting in, before the away check counts
const LONG = 1000000; // effect duration (ticks) that outlasts any run
const FLOOR = Math.max(-58, Math.min(-20, Math.floor(CONFIG.depth)));
const DIFFICULTY = ["", "Easy", "Normal", "Hard"];

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {typeof CONFIG.dungeons[number]} Dungeon */
/** @typedef {"entry" | "combat" | "puzzle" | "boss" | "treasure"} Kind */
/** @typedef {{ kind: Kind, cx: number, cz: number }} Room */
/** @typedef {{ rooms: Room[], solution: boolean[], clues: string[] }} Layout */
/** @typedef {{ id: number, slot: number, dungeon: string, seed: number, x: number, z: number, y: number, leader: string, phase: string }} RunRecord */
/** @typedef {{ name: string, since: number, away: number }} Member */
/**
 * @typedef {{ id: number, slot: number, dungeon: Dungeon, seed: number, o: Vector3, lay: Layout, leaderName: string,
 *   members: Map<string, Member>, phase: "gathering" | "building" | "active" | "finishing" | "resetting",
 *   started: number, deadline: number, room: number, roomActive: boolean, wave: number, waves: number, mobs: Entity[],
 *   nextWaveAt: number, bossId?: string, bossGone: number, solved: boolean, finishAt: number, clearMs: number }} Run
 */
/** @typedef {{ t: number, n: string, at: number }} Best */

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const ORES = ["coal", "iron", "copper", "gold", "redstone", "lapis", "diamond", "emerald"].flatMap((o) => [`minecraft:${o}_ore`, `minecraft:deepslate_${o}_ore`]);

/** What the deep underground is made of: the only blocks a dungeon may replace (with lush caves, geodes and the deep dark's sculk). */
const NATURAL = [
  ...ORES,
  "minecraft:lit_redstone_ore",
  "minecraft:lit_deepslate_redstone_ore",
  ...["air", "stone", "deepslate", "tuff", "granite", "diorite", "andesite", "calcite", "gravel", "dirt", "coarse_dirt", "rooted_dirt", "clay"],
  ...["water", "flowing_water", "lava", "flowing_lava", "obsidian", "magma", "smooth_basalt", "infested_stone", "infested_deepslate"],
  ...["raw_iron_block", "raw_copper_block", "amethyst_block", "budding_amethyst", "small_amethyst_bud", "medium_amethyst_bud", "large_amethyst_bud", "amethyst_cluster"],
  ...["dripstone_block", "pointed_dripstone", "moss_block", "moss_carpet", "azalea", "flowering_azalea", "azalea_leaves", "azalea_leaves_flowered"],
  ...["cave_vines", "cave_vines_body_with_berries", "cave_vines_head_with_berries", "glow_lichen", "hanging_roots", "spore_blossom", "big_dripleaf", "small_dripleaf_block"],
  ...["sculk", "sculk_vein", "sculk_sensor", "sculk_shrieker", "sculk_catalyst", "seagrass", "kelp", "bubble_column"],
].map((b) => (b.startsWith("minecraft:") ? b : `minecraft:${b}`));

/** Puzzle colors: the wool under each lever and how the clues name it (dark colors read well on a sign). */
const COLORS = [
  { name: "RED", code: "§4", wool: "minecraft:red_wool" },
  { name: "BLUE", code: "§1", wool: "minecraft:blue_wool" },
  { name: "YELLOW", code: "§6", wool: "minecraft:yellow_wool" },
  { name: "GREEN", code: "§2", wool: "minecraft:green_wool" },
];

/** Every block a dungeon places. The box holds only NATURAL blocks before a run, so any of these in it are the dungeon's own. */
const OURS = [
  ...CONFIG.dungeons.flatMap((d) => [d.wall, d.floor, d.accent, d.light, d.door]),
  ...COLORS.map((c) => c.wool),
  "minecraft:lever",
  "minecraft:standing_sign",
  "minecraft:chest",
];
const REPLACEABLE = [...new Set([...NATURAL, ...OURS])];
const FILL = { blockFilter: { includeTypes: REPLACEABLE } };
/** Mobs a reset may remove from the box: the dungeons' own kinds. Anything else (a pet) is moved to the surface. */
const DUNGEON_MOBS = new Set(CONFIG.dungeons.flatMap((d) => [...d.mobs, d.boss.mob]));
const LITTER = new Set(["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:thrown_trident", "minecraft:snowball"]);

/**
 * A block with states, or the plain block if a state isn't known to this game version.
 * @param {string} id @param {Record<string, string | number | boolean>} [states]
 */
function perm(id, states) {
  try {
    return BlockPermutation.resolve(/** @type {any} */ (id), /** @type {any} */ (states));
  } catch {
    return BlockPermutation.resolve(/** @type {any} */ (id));
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const overworld = () => world.getDimension(OVERWORLD);
/** @param {number} ticks */
const sleep = (ticks) => new Promise((r) => system.runTimeout(() => r(undefined), Math.max(1, ticks)));
/** @param {Player} player */
const isOp = (player) => player.commandPermissionLevel >= CommandPermissionLevel.GameDirectors;
/** "minecraft:wither_skeleton" -> "Wither Skeleton". @param {string} id */
const prettyId = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
/** 372000 -> "6:12". @param {number} ms */
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** @param {Dungeon} d */
const dungeonLabel = (d) => `${d.name} (${DIFFICULTY[d.difficulty] ?? "Normal"})`;
/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);

/** @param {string} key @returns {any} */
function readJson(key) {
  try {
    const raw = world.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
/** @param {string} key @param {unknown} value */
function writeJson(key, value) {
  try {
    world.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value));
  } catch (e) {
    console.warn(`[expedition] save ${key}: ${e}`);
  }
}

/** @param {Dimension} dim @param {string} command */
function tryCommand(dim, command) {
  try {
    return dim.runCommand(command).successCount > 0;
  } catch {
    return false; // e.g. removing a ticking area that is already gone
  }
}

/** Actionbar text, after asking the Coordinates HUD to step aside. @param {Player} player @param {string} text */
function actionbar(player, text) {
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 30 }));
  player.onScreenDisplay.setActionBar(text);
}

/** @param {string} id @param {object} data */
const send = (id, data) => system.sendScriptEvent(id, JSON.stringify(data));

// Crowns (the Crowns pack shows balances; any pack may pay into the objective)
function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns");
  }
}
/** @param {Player} p @param {number} n @param {string} why */
function payCrowns(p, n, why) {
  if (n <= 0) return;
  try {
    crownsObjective()?.addScore(p, Math.floor(n));
    p.sendMessage(`§6+${Math.floor(n)} Crowns §7(${why})`);
  } catch (e) {
    console.warn(`[expedition] crowns: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Layout (from the seed alone)
// ---------------------------------------------------------------------------

/** A small seeded random generator (mulberry32). @param {number} seed */
function rng(seed) {
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
function shuffle(list, r) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A path of `n` neighboring cells through the 3 x 3 grid, never visiting a cell twice. @param {() => number} r @param {number} n */
function walk(r, n) {
  /** @type {[number, number][]} */
  const path = [];
  const seen = new Set();
  /** @param {number} x @param {number} z @returns {boolean} */
  const step = (x, z) => {
    path.push([x, z]);
    seen.add(x * 10 + z);
    if (path.length === n) return true;
    for (const [dx, dz] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], r)) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= GRID || nz >= GRID || seen.has(nx * 10 + nz)) continue;
      if (step(nx, nz)) return true;
    }
    path.pop();
    seen.delete(x * 10 + z);
    return false;
  };
  const starts = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8], r);
  for (const s of starts) if (step(s % GRID, Math.floor(s / GRID))) return path;
  return [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1], [0, 1]]; // never reached: a 3 x 3 grid always has room
}

/**
 * Four levers, each on or off. Clues are true statements picked at random until only the solution fits,
 * starting with how many are on.
 * @param {() => number} r @returns {{ solution: boolean[], clues: string[] }}
 */
function puzzle(r) {
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
  // Always works: say each lever.
  return { solution, clues: [0, 1, 2, 3].map((i) => `${name(i)} is ${solution[i] ? "on" : "off"}`) };
}

/** @param {number} seed @returns {Layout} */
function layout(seed) {
  const r = rng(seed);
  const combat = 2 + Math.floor(r() * 3); // 2 to 4 combat rooms
  const cells = walk(r, combat + 4);
  /** @type {Kind[]} */
  const middle = shuffle([...Array(combat).fill("combat"), "puzzle"], r);
  /** @type {Kind[]} */
  const kinds = ["entry", ...middle, "boss", "treasure"];
  const { solution, clues } = puzzle(r);
  return { rooms: cells.map(([cx, cz], i) => ({ kind: kinds[i], cx, cz })), solution, clues };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** The box's north-west corner at floor height for a slot, from the site. @param {{ x: number, z: number }} site @param {number} slot @returns {Vector3} */
const originFor = (site, slot) => ({ x: site.x - SIZE / 2 + slot * Math.max(64, CONFIG.slotSpacing), y: FLOOR, z: site.z - SIZE / 2 });

/** @param {Vector3} o @param {Room} room */
const base = (o, room) => ({ x: o.x + room.cx * CELL, z: o.z + room.cz * CELL });
/** Center of a room's floor, one block up (where players stand). @param {Vector3} o @param {Room} room */
const center = (o, room) => {
  const b = base(o, room);
  return { x: b.x + 8, y: o.y + 1, z: b.z + 8 };
};
/** The direction from room i to room i + 1. @param {Layout} lay @param {number} i */
const dirTo = (lay, i) => ({ x: lay.rooms[i + 1].cx - lay.rooms[i].cx, z: lay.rooms[i + 1].cz - lay.rooms[i].cz });

/** The whole box: 1 block under the floor to 7 above, SIZE square. @param {Vector3} o */
const box = (o) => ({ from: { x: o.x, y: o.y - 1, z: o.z }, to: { x: o.x + SIZE - 1, y: o.y + 7, z: o.z + SIZE - 1 } });

/** @param {Vector3} o @param {Vector3} p @param {number} [margin] */
function inBox(o, p, margin = 0) {
  return p.x >= o.x - margin && p.x < o.x + SIZE + margin && p.z >= o.z - margin && p.z < o.z + SIZE + margin && p.y >= o.y - 1 - margin && p.y < o.y + 8 + margin;
}

/** @param {Vector3} o @param {Room} room @param {Vector3} p */
function inRoom(o, room, p) {
  const b = base(o, room);
  return p.x >= b.x + 3 && p.x < b.x + 14 && p.z >= b.z + 3 && p.z < b.z + 14 && p.y >= o.y + 1 && p.y < o.y + 6;
}

/** The bars between room i and i + 1, in room i's wall. @param {Vector3} o @param {Layout} lay @param {number} i */
function doorPlane(o, lay, i) {
  const b = base(o, lay.rooms[i]);
  const d = dirTo(lay, i);
  const y1 = o.y + 1;
  const y2 = o.y + 3;
  if (d.x !== 0) {
    const x = d.x > 0 ? b.x + 14 : b.x + 2;
    return { from: { x, y: y1, z: b.z + 7 }, to: { x, y: y2, z: b.z + 9 } };
  }
  const z = d.z > 0 ? b.z + 14 : b.z + 2;
  return { from: { x: b.x + 7, y: y1, z }, to: { x: b.x + 9, y: y2, z } };
}

/** Puzzle room: where the clue signs and the levers go, across the room, facing the way players come in. @param {Vector3} o @param {Layout} lay @param {number} i */
function puzzleSpots(o, lay, i) {
  const c = center(o, lay.rooms[i]);
  const back = { x: lay.rooms[i - 1].cx - lay.rooms[i].cx, z: lay.rooms[i - 1].cz - lay.rooms[i].cz }; // toward the entrance
  const across = { x: back.z, z: back.x };
  const offsets = [-3, -1, 1, 3];
  const signs = offsets.map((k) => ({ x: c.x + back.x * 3 + across.x * k, y: c.y, z: c.z + back.z * 3 + across.z * k }));
  const levers = offsets.map((k) => ({ x: c.x - back.x * 2 + across.x * k, y: c.y, z: c.z - back.z * 2 + across.z * k }));
  return { signs, levers, facing: signFacing(back) };
}

/** ground_sign_direction for a standing sign whose text faces direction d. @param {{ x: number, z: number }} d */
const signFacing = (d) => (d.z > 0 ? 0 : d.x < 0 ? 4 : d.z < 0 ? 8 : 12);

// ---------------------------------------------------------------------------
// Building and resetting
// ---------------------------------------------------------------------------

/** @param {Dimension} dim @param {Vector3} from @param {Vector3} to @param {string | BlockPermutation} block */
function fill(dim, from, to, block) {
  dim.fillBlocks(new BlockVolume(from, to), block, FILL);
}

/** @param {Dimension} dim @param {Vector3} at @param {BlockPermutation} p */
function place(dim, at, p) {
  const block = dim.getBlock(at);
  if (block && REPLACEABLE.includes(block.typeId)) block.setPermutation(p);
  return block;
}

/** @param {Dimension} dim @param {Vector3} at @param {number} facing @param {string} text */
function sign(dim, at, facing, text) {
  const block = place(dim, at, perm("minecraft:standing_sign", { ground_sign_direction: facing }));
  const s = block?.getComponent("minecraft:sign");
  if (!s) return;
  s.setText(text);
  s.setWaxed(true);
}

/**
 * Runs the steps as a job, a few per tick, so a big fill never stalls the server. Resolves with how many failed.
 * @param {(() => void)[]} steps @returns {Promise<number>}
 */
function runSteps(steps) {
  return new Promise((resolve) => {
    system.runJob(
      (function* () {
        let failed = 0;
        for (const s of steps) {
          try {
            s();
          } catch (e) {
            failed++;
            console.warn(`[expedition] build step: ${e}`);
          }
          yield;
        }
        resolve(failed);
      })(),
    );
  });
}

/** Fills the box in 16 x 16 columns. @param {Dimension} dim @param {Vector3} o @param {string} block @returns {(() => void)[]} */
function fillBoxSteps(dim, o, block) {
  /** @type {(() => void)[]} */
  const steps = [];
  for (let x = 0; x < SIZE; x += CELL)
    for (let z = 0; z < SIZE; z += CELL) steps.push(() => fill(dim, { x: o.x + x, y: o.y - 1, z: o.z + z }, { x: o.x + x + CELL - 1, y: o.y + 7, z: o.z + z + CELL - 1 }, block));
  return steps;
}

/** @param {Run} run */
function buildSteps(run) {
  const dim = overworld();
  const { o, lay, dungeon: d } = run;
  const F = o.y;
  /** @type {(() => void)[]} */
  const steps = fillBoxSteps(dim, o, "minecraft:deepslate"); // seal: caves and water inside the box become solid
  const n = lay.rooms.length;
  for (const room of lay.rooms) {
    const b = base(o, room);
    steps.push(() => fill(dim, { x: b.x + 2, y: F, z: b.z + 2 }, { x: b.x + 14, y: F + 6, z: b.z + 14 }, d.wall));
    steps.push(() => {
      fill(dim, { x: b.x + 3, y: F, z: b.z + 3 }, { x: b.x + 13, y: F, z: b.z + 13 }, d.floor);
      fill(dim, { x: b.x + 3, y: F + 1, z: b.z + 3 }, { x: b.x + 13, y: F + 5, z: b.z + 13 }, "minecraft:air");
      for (const [px, pz] of [[3, 3], [13, 3], [3, 13], [13, 13]]) fill(dim, { x: b.x + px, y: F + 1, z: b.z + pz }, { x: b.x + px, y: F + 5, z: b.z + pz }, d.accent);
      const lantern = perm(d.light, { hanging: true });
      for (const [lx, lz] of [[5, 5], [11, 5], [5, 11], [11, 11]]) place(dim, { x: b.x + lx, y: F + 5, z: b.z + lz }, lantern);
    });
  }
  for (let i = 0; i < n - 1; i++) {
    const a = base(o, lay.rooms[i]);
    const nb = base(o, lay.rooms[i + 1]);
    const dir = dirTo(lay, i);
    steps.push(() => {
      if (dir.x !== 0) {
        const x1 = Math.min(a.x, nb.x) + 14;
        const z = a.z;
        fill(dim, { x: x1 + 1, y: F, z: z + 6 }, { x: x1 + 3, y: F + 4, z: z + 10 }, d.wall);
        fill(dim, { x: x1 + 1, y: F, z: z + 7 }, { x: x1 + 3, y: F, z: z + 9 }, d.floor);
        fill(dim, { x: x1, y: F + 1, z: z + 7 }, { x: x1 + 4, y: F + 3, z: z + 9 }, "minecraft:air");
      } else {
        const z1 = Math.min(a.z, nb.z) + 14;
        const x = a.x;
        fill(dim, { x: x + 6, y: F, z: z1 + 1 }, { x: x + 10, y: F + 4, z: z1 + 3 }, d.wall);
        fill(dim, { x: x + 7, y: F, z: z1 + 1 }, { x: x + 9, y: F, z: z1 + 3 }, d.floor);
        fill(dim, { x: x + 7, y: F + 1, z: z1 }, { x: x + 9, y: F + 3, z: z1 + 4 }, "minecraft:air");
      }
      if (i > 0) {
        const door = doorPlane(o, lay, i);
        fill(dim, door.from, door.to, d.door); // every room but the entry starts closed
      }
    });
  }
  steps.push(() => {
    const entry = center(o, lay.rooms[0]);
    const out = dirTo(lay, 0);
    sign(dim, { x: entry.x + out.x * 3, y: entry.y, z: entry.z + out.z * 3 }, signFacing({ x: -out.x, z: -out.z }), `§l${d.name}§r\nClear each room\nto open the bars`);
    const pi = lay.rooms.findIndex((r) => r.kind === "puzzle");
    const spots = puzzleSpots(o, lay, pi);
    spots.signs.forEach((at, k) => sign(dim, at, spots.facing, `§lClue ${k + 1} of ${lay.clues.length}§r\n${lay.clues[k] ?? ""}`));
    if (lay.clues.length < 4) for (const at of spots.signs.slice(lay.clues.length)) place(dim, at, perm("minecraft:air"));
    spots.levers.forEach((at, k) => {
      place(dim, { x: at.x, y: at.y - 1, z: at.z }, perm(COLORS[k].wool));
      place(dim, at, perm("minecraft:lever", { lever_direction: "up_north_south", open_bit: false }));
    });
    place(dim, center(o, lay.rooms[n - 1]), perm("minecraft:chest"));
  });
  return steps;
}

/** Waits until every chunk of the box can be read. @param {Vector3} o @param {number} seconds */
async function waitLoaded(o, seconds) {
  const dim = overworld();
  const xs = [o.x, o.x + 16, o.x + 32, o.x + SIZE - 1];
  const zs = [o.z, o.z + 16, o.z + 32, o.z + SIZE - 1];
  for (let t = 0; t < seconds; t++) {
    let all = true;
    for (const x of xs)
      for (const z of zs) {
        try {
          if (!dim.getBlock({ x, y: o.y, z })) all = false;
        } catch {
          all = false;
        }
      }
    if (all) return true;
    await sleep(20);
  }
  return false;
}

/** Keeps the box loaded while a run builds, plays and resets. @param {number} slot @param {Vector3} o */
function addArea(slot, o) {
  const { from, to } = box(o);
  return tryCommand(overworld(), `tickingarea add ${from.x} ${from.y} ${from.z} ${to.x} ${to.y} ${to.z} realm_exp_${slot} true`);
}
/** @param {number} slot */
const removeArea = (slot) => tryCommand(overworld(), `tickingarea remove realm_exp_${slot}`);

/**
 * Finds one block in the box that isn't natural underground, by halving the box with containsBlock
 * (a few dozen native checks instead of reading 20,000 blocks). Undefined: the box is clean.
 * Throws when part of the box isn't loaded.
 * @param {Vector3} o @returns {{ at: Vector3, type: string } | undefined}
 */
function findForeign(o) {
  const dim = overworld();
  const filter = { excludeTypes: NATURAL };
  /** @param {Vector3} a @param {Vector3} b @returns {Vector3 | undefined} */
  const search = (a, b) => {
    if (!dim.containsBlock(new BlockVolume(a, b), filter, false)) return undefined;
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const sz = b.z - a.z;
    if (sx === 0 && sy === 0 && sz === 0) return a;
    if (sx >= sy && sx >= sz) {
      const m = Math.floor((a.x + b.x) / 2);
      return search(a, { ...b, x: m }) ?? search({ ...a, x: m + 1 }, b);
    }
    if (sz >= sy) {
      const m = Math.floor((a.z + b.z) / 2);
      return search(a, { ...b, z: m }) ?? search({ ...a, z: m + 1 }, b);
    }
    const m = Math.floor((a.y + b.y) / 2);
    return search(a, { ...b, y: m }) ?? search({ ...a, y: m + 1 }, b);
  };
  const { from, to } = box(o);
  const at = search(from, to);
  if (!at) return undefined;
  let type = "unknown";
  try {
    type = dim.getBlock(at)?.typeId ?? "unknown";
  } catch {
    // keep "unknown"
  }
  return { at, type };
}

/** The surface above the site: where strays found in the box at reset are put. @param {Vector3} o */
function surface(o) {
  const x = o.x + SIZE / 2;
  const z = o.z + SIZE / 2;
  try {
    const top = overworld().getTopmostBlock({ x, z });
    if (top && top.y > o.y + 8) return { x: x + 0.5, y: top.y + 1, z: z + 0.5 };
  } catch {
    // unloaded
  }
  return world.getDefaultSpawnLocation();
}

/**
 * Puts the box back to solid deepslate: clears the treasure chest, removes the dungeon's mobs and
 * litter, moves anyone else out, then fills everything the dungeon placed (and any cave air) with deepslate.
 * @param {RunRecord} rec @returns {Promise<boolean>} done
 */
async function resetBox(rec) {
  const o = { x: rec.x, y: rec.y, z: rec.z };
  addArea(rec.slot, o); // already there unless the world restarted without it
  if (!(await waitLoaded(o, 60))) {
    console.warn(`[expedition] slot ${rec.slot}: the dungeon area didn't load; it will be reset after the next restart or /realm:expedition_reset`);
    return false;
  }
  const dim = overworld();
  try {
    const lay = layout(rec.seed);
    const chest = dim.getBlock(center(o, lay.rooms[lay.rooms.length - 1]));
    if (chest?.typeId === "minecraft:chest") chest.getComponent("minecraft:inventory")?.container?.clearAll();
  } catch (e) {
    console.warn(`[expedition] chest: ${e}`);
  }
  try {
    const { from } = box(o);
    const out = surface(o);
    for (const e of dim.getEntities({ location: from, volume: { x: SIZE - 1, y: 8, z: SIZE - 1 } })) {
      if (!e.isValid) continue;
      if (e instanceof Player) {
        e.teleport(out, { dimension: dim });
        e.sendMessage("§eThe expedition dungeon was closed, so you were moved to the surface.");
      } else if (e.hasTag(MOB_TAG) || LITTER.has(e.typeId) || DUNGEON_MOBS.has(e.typeId)) e.remove();
      else e.teleport(out, { dimension: dim });
    }
  } catch (e) {
    console.warn(`[expedition] reset entities: ${e}`);
  }
  const failed = await runSteps(fillBoxSteps(dim, o, "minecraft:deepslate"));
  if (failed) return false;
  removeArea(rec.slot);
  return true;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/** @type {Map<number, Run>} slot -> run */
const runs = new Map();
/** Slots whose box still needs a reset (from a run cut short by a restart). @type {Map<number, RunRecord>} */
const pending = new Map();
/** Items players dropped dying in a dungeon, given back when they respawn. @type {Map<string, ItemStack[]>} */
const dropped = new Map();

/** @returns {{ x: number, z: number, by: string, at: number } | undefined} */
function site() {
  const s = readJson(PROP_SITE);
  return s && typeof s.x === "number" && typeof s.z === "number" ? s : undefined;
}

/** @param {Run} run @returns {RunRecord} */
const recordOf = (run) => ({ id: run.id, slot: run.slot, dungeon: run.dungeon.id, seed: run.seed, x: run.o.x, y: run.o.y, z: run.o.z, leader: run.leaderName, phase: run.phase });
/** @param {Run} run */
const saveRun = (run) => writeJson(PROP_RUN + run.slot, recordOf(run));

/** @param {string} playerId */
function runOf(playerId) {
  for (const run of runs.values()) if (run.members.has(playerId)) return run;
  return undefined;
}

/** "Ann's party, Crypt, 6:12" @param {Run} run */
function statusLine(run) {
  const t = run.phase === "active" || run.phase === "finishing" ? `, ${clock((run.phase === "finishing" ? run.clearMs : Date.now() - run.started))}` : "";
  const what = run.phase === "gathering" || run.phase === "building" ? ", getting ready" : run.phase === "resetting" ? ", closing up" : "";
  return `${run.leaderName}'s party, ${run.dungeon.name}${t}${what}`;
}

/** @param {Run} run @param {string} text */
function tell(run, text) {
  for (const id of run.members.keys()) online(id)?.sendMessage(text);
}

/** @param {Run} run @param {string} sound */
function sound(run, sound) {
  for (const id of run.members.keys()) online(id)?.playSound(sound, { volume: 0.8 });
}

/** Party members near the leader who could come along. @param {Player} leader */
function partyNear(leader) {
  const tag = leader.getTags().find((t) => t.startsWith(PARTY_TAG));
  if (!tag) return [];
  const loc = leader.location;
  const r = CONFIG.partyRadius;
  return world
    .getAllPlayers()
    .filter((p) => p.id !== leader.id && p.hasTag(tag) && p.dimension.id === leader.dimension.id && !runOf(p.id))
    .map((p) => ({ p, d: Math.hypot(p.location.x - loc.x, p.location.y - loc.y, p.location.z - loc.z) }))
    .filter((e) => e.d <= r)
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(0, get("maxParty") - 1))
    .map((e) => e.p);
}

/** @returns {number | undefined} */
function freeSlot() {
  const slots = Math.max(1, Math.min(3, get("slots")));
  for (let s = 0; s < slots; s++) if (!runs.has(s) && !pending.has(s)) return s;
  return undefined;
}

/**
 * Shows a form, retrying while the player has chat or another screen open, until `deadline` (a tick).
 * @template {ActionFormData | MessageFormData} F
 * @param {Player} player @param {F} form @param {number} [deadline]
 * @returns {Promise<Awaited<ReturnType<F["show"]>> | undefined>}
 */
async function show(player, form, deadline = Infinity) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid || system.currentTick > deadline) return undefined;
    const res = /** @type {any} */ (await form.show(player));
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await sleep(20);
  }
  return undefined;
}

/** Asks a party member to come along; no answer in time is a no. @param {Player} p @param {string} leader @param {Dungeon} d */
async function ask(p, leader, d) {
  const ticks = Math.max(5, CONFIG.confirmSeconds) * 20;
  const deadline = system.currentTick + ticks;
  const form = new MessageFormData()
    .title("§lExpedition")
    .body(`${leader} is starting an expedition: §e${dungeonLabel(d)}§r.\n\nYou'll be taken to a dungeon deep underground and brought back when it ends. Join?`)
    .button1("Join")
    .button2("Not this time");
  const answer = show(p, form, deadline).then((res) => !!res && !res.canceled && res.selection === 0);
  const timeout = sleep(ticks).then(() => {
    try {
      if (p.isValid) uiManager.closeAllForms(p);
    } catch {
      // gone
    }
    return false;
  });
  return Promise.race([answer, timeout]);
}

/** /realm:expedition -> pick a dungeon. @param {Player} leader @param {Dungeon} d */
async function start(leader, d) {
  if (get("enabled") !== true) return leader.sendMessage("§cNew expeditions are disabled on this realm right now.");
  const s = site();
  if (!s) return leader.sendMessage("§cThe operators haven't picked an expedition site yet (/realm:expedition_site).");
  if (runOf(leader.id)) return leader.sendMessage("§cYou're already on an expedition.");
  if (freeSlot() === undefined) return leader.sendMessage(`§eAn expedition is in progress (${[...runs.values()].map(statusLine).join("; ")}). Try again when it's over.`);
  const others = partyNear(leader);
  const confirm = await show(
    leader,
    new MessageFormData()
      .title(`§l${d.name}`)
      .body(
        [
          `Start an expedition to the §e${dungeonLabel(d)}§r?`,
          others.length ? `Your party members nearby will be asked to join: ${others.map((p) => p.name).join(", ")}.` : "You'll go alone (party members within 32 blocks are asked along).",
          `The clock starts when you arrive. Clear the rooms, solve the lever puzzle and defeat the boss within ${get("timeLimitMinutes")} minutes.`,
          "Leave any time with /realm:expedition_leave. If you die, you return to where you started.",
        ].join("\n\n"),
      )
      .button1("Start")
      .button2("Cancel"),
  );
  if (!confirm || confirm.canceled || confirm.selection !== 0 || !leader.isValid) return;
  // Check again: someone else may have started one while the form was open.
  const slot = freeSlot();
  if (slot === undefined) return leader.sendMessage(`§eAn expedition is in progress (${[...runs.values()].map(statusLine).join("; ")}).`);
  if (runOf(leader.id)) return;
  const now = site();
  if (!now) return;
  const idRaw = world.getDynamicProperty(PROP_NEXT);
  const id = typeof idRaw === "number" ? idRaw : 1;
  world.setDynamicProperty(PROP_NEXT, id + 1);
  const seed = Math.floor(Math.random() * 2147483647);
  /** @type {Run} */
  const run = {
    id,
    slot,
    dungeon: d,
    seed,
    o: originFor(now, slot),
    lay: layout(seed),
    leaderName: leader.name,
    members: new Map([[leader.id, { name: leader.name, since: 0, away: 0 }]]),
    phase: "gathering",
    started: 0,
    deadline: 0,
    room: 1,
    roomActive: false,
    wave: 0,
    waves: 1 + d.difficulty,
    mobs: [],
    nextWaveAt: 0,
    bossGone: 0,
    solved: false,
    finishAt: 0,
    clearMs: 0,
  };
  runs.set(slot, run);
  try {
    const invite = others.filter((p) => p.isValid && !runOf(p.id));
    if (invite.length) leader.sendMessage(`§7Asking ${invite.map((p) => p.name).join(", ")}...`);
    const answers = await Promise.all(invite.map((p) => ask(p, leader.name, d)));
    invite.forEach((p, i) => {
      if (answers[i] && p.isValid && !runOf(p.id) && run.members.size < get("maxParty")) run.members.set(p.id, { name: p.name, since: 0, away: 0 });
      else if (p.isValid) leader.sendMessage(`§7${p.name} isn't coming.`);
    });
    if (!leader.isValid) run.members.delete(leader.id);
    if (!run.members.size) {
      runs.delete(slot);
      return;
    }
    await prepare(run);
  } catch (e) {
    console.warn(`[expedition] start: ${e}`);
    tell(run, "§cSomething went wrong preparing the expedition. Try again in a moment.");
    if (run.phase === "gathering") runs.delete(slot);
    else await endRun(run, "");
  }
}

/** Ticking area, checks, building, then everyone in. @param {Run} run */
async function prepare(run) {
  run.phase = "building";
  saveRun(run);
  tell(run, `§7Preparing the ${run.dungeon.name}...`);
  if (!addArea(run.slot, run.o)) {
    // Already there after a reset cut short, or the world has its 10 ticking areas: the load check decides.
    console.warn(`[expedition] tickingarea add for slot ${run.slot} failed`);
  }
  if (!(await waitLoaded(run.o, 30))) {
    tell(run, "§cThe dungeon area couldn't be loaded (the world may already have 10 ticking areas). Ask an operator to check /tickingarea list.");
    removeArea(run.slot);
    writeJson(PROP_RUN + run.slot, undefined);
    runs.delete(run.slot);
    return;
  }
  let foreign;
  try {
    foreign = findForeign(run.o);
  } catch (e) {
    foreign = { at: run.o, type: `unloaded (${e})` };
  }
  if (foreign) {
    const where = `${foreign.at.x}, ${foreign.at.y}, ${foreign.at.z}`;
    tell(run, "§cThe expedition site isn't safe to build in right now, so the run was called off. The operators have been told.");
    for (const p of world.getAllPlayers()) if (isOp(p)) p.sendMessage(`§c[Expeditions] Slot ${run.slot + 1}: found ${prettyId(foreign.type)} at ${where} in the dungeon area. Dungeons only replace natural underground blocks: pick another site with /realm:expedition_site.`);
    console.warn(`[expedition] slot ${run.slot}: ${foreign.type} at ${where}`);
    removeArea(run.slot);
    writeJson(PROP_RUN + run.slot, undefined);
    runs.delete(run.slot);
    return;
  }
  const failed = await runSteps(buildSteps(run));
  if (failed) {
    tell(run, "§cThe dungeon couldn't be built. Try again in a moment.");
    await endRun(run, "");
    return;
  }
  // Everyone still here goes in.
  const entry = center(run.o, run.lay.rooms[0]);
  const out = dirTo(run.lay, 0);
  const spots = [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  let k = 0;
  for (const [pid, m] of [...run.members]) {
    const p = online(pid);
    if (!p || runOf(pid) !== run) {
      run.members.delete(pid);
      continue;
    }
    const [dx, dz] = spots[k++ % spots.length];
    const loc = p.location;
    p.setDynamicProperty(PROP_RETURN, JSON.stringify({ d: p.dimension.id, x: loc.x, y: loc.y, z: loc.z, run: run.id }));
    m.since = system.currentTick + 20;
    fade(p);
    const to = { x: entry.x + 0.5 + dx, y: entry.y, z: entry.z + 0.5 + dz };
    system.runTimeout(() => {
      try {
        if (p.isValid) p.teleport(to, { dimension: overworld(), facingLocation: { x: to.x + out.x * 6, y: to.y + 1, z: to.z + out.z * 6 } });
      } catch (e) {
        console.warn(`[expedition] teleport in: ${e}`);
      }
    }, 10);
  }
  if (!run.members.size) {
    await endRun(run, "");
    return;
  }
  run.phase = "active";
  run.started = Date.now() + 500;
  run.deadline = run.started + get("timeLimitMinutes") * 60000;
  saveRun(run);
  system.runTimeout(() => {
    for (const id of run.members.keys()) {
      const p = online(id);
      if (!p) continue;
      p.onScreenDisplay.setTitle(`§l${run.dungeon.name}`, { subtitle: `§7${DIFFICULTY[run.dungeon.difficulty] ?? ""} - the clock is running`, fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 20 });
    }
    tell(run, `§eThe ${run.dungeon.name}: clear each room to open the bars ahead. ${run.lay.rooms.length} rooms. Leave with /realm:expedition_leave.`);
  }, 25);
}

/** @param {Player} p */
function fade(p) {
  try {
    p.camera.fade({ fadeTime: { fadeInTime: 0.5, holdTime: 0.5, fadeOutTime: 0.8 }, fadeColor: { red: 0, green: 0, blue: 0 } });
  } catch {
    // no camera control: just teleport
  }
}

/** Gives back what the player dropped dying in a dungeon. @param {Player} p */
function giveBack(p) {
  const items = dropped.get(p.id);
  if (!items?.length) return;
  dropped.delete(p.id);
  const inv = p.getComponent("minecraft:inventory")?.container;
  let spilled = false;
  for (const it of items) {
    try {
      const rest = inv ? inv.addItem(it) : it;
      if (rest) {
        p.dimension.spawnItem(rest, p.location);
        spilled = true;
      }
    } catch (e) {
      console.warn(`[expedition] give back: ${e}`);
    }
  }
  p.sendMessage(`§aThe items you dropped in the dungeon are back with you.${spilled ? " Some are at your feet: your inventory is full." : ""}`);
}

/**
 * Sends a player back to where they started the expedition (or the world spawn), and forgets the spot.
 * @param {Player} p @param {boolean} [withFade]
 */
function sendBack(p, withFade = true) {
  let ret;
  try {
    const raw = p.getDynamicProperty(PROP_RETURN);
    ret = typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    ret = undefined;
  }
  p.setDynamicProperty(PROP_RETURN, undefined);
  if (withFade) fade(p);
  system.runTimeout(
    () => {
      try {
        if (!p.isValid) return;
        let dim;
        try {
          dim = ret && typeof ret.d === "string" ? world.getDimension(ret.d) : undefined;
        } catch {
          dim = undefined;
        }
        if (dim && typeof ret.x === "number") p.teleport({ x: ret.x, y: ret.y, z: ret.z }, { dimension: dim });
        else p.teleport(world.getDefaultSpawnLocation(), { dimension: overworld() });
        giveBack(p);
      } catch (e) {
        console.warn(`[expedition] send back: ${e}`);
      }
    },
    withFade ? 10 : 1,
  );
}

/** A member is out: left, died or was sent back. Ends the run when nobody is left. @param {Run} run @param {string} id */
function dropMember(run, id) {
  if (!run.members.delete(id)) return;
  if (!run.members.size && (run.phase === "active" || run.phase === "finishing")) {
    endRun(run, run.phase === "finishing" ? "" : "§cThe expedition failed: nobody is left in the dungeon.").catch((e) => console.warn(`[expedition] ${e}`));
  }
}

/** Ends a run: everyone out, then the box is reset and the slot freed. @param {Run} run @param {string} why */
async function endRun(run, why) {
  if (run.phase === "resetting") return;
  const wasBuilt = run.phase !== "gathering";
  run.phase = "resetting";
  if (why) tell(run, why);
  for (const id of [...run.members.keys()]) {
    const p = online(id);
    if (p) sendBack(p);
  }
  run.members.clear();
  for (const m of run.mobs) if (m.isValid) m.remove();
  if (run.bossId) world.getEntity(run.bossId)?.remove();
  if (!wasBuilt) {
    runs.delete(run.slot);
    return;
  }
  saveRun(run);
  await sleep(40); // let the teleports land first
  const rec = recordOf(run);
  let ok = false;
  try {
    ok = await resetBox(rec);
  } catch (e) {
    console.warn(`[expedition] reset: ${e}`);
  }
  runs.delete(run.slot);
  if (ok) writeJson(PROP_RUN + run.slot, undefined);
  else pending.set(run.slot, rec); // tried again by /realm:expedition_reset or after a restart
}

/** @param {Run} run @param {number} i */
function openDoor(run, i) {
  try {
    const door = doorPlane(run.o, run.lay, i);
    overworld().fillBlocks(new BlockVolume(door.from, door.to), "minecraft:air", { blockFilter: { includeTypes: [run.dungeon.door] } });
    const c = center(run.o, run.lay.rooms[i]);
    overworld().playSound("random.door_open", c, { volume: 1, pitch: 0.6 });
  } catch (e) {
    console.warn(`[expedition] door: ${e}`);
  }
}

/** A free spot inside room i for a mob, away from the middle. @param {Run} run @param {number} i */
function spawnSpot(run, i) {
  const b = base(run.o, run.lay.rooms[i]);
  const side = Math.random() < 0.5 ? -1 : 1;
  const along = Math.random() < 0.5;
  const a = 4 + Math.floor(Math.random() * 9); // 4..12
  const edge = side < 0 ? 5 : 11;
  return { x: b.x + (along ? a : edge) + 0.5, y: run.o.y + 1, z: b.z + (along ? edge : a) + 0.5 };
}

/** @param {Run} run */
function spawnWave(run) {
  const dim = overworld();
  const d = run.dungeon;
  const count = 2 + Math.floor(Math.random() * 2) + Math.floor((run.members.size - 1) / 2);
  run.mobs = [];
  for (let k = 0; k < count; k++) {
    try {
      const mob = dim.spawnEntity(/** @type {any} */ (d.mobs[Math.floor(Math.random() * d.mobs.length)]), spawnSpot(run, run.room));
      mob.addTag(MOB_TAG);
      mob.addTag(`realm:exp_run:${run.id}`);
      if (d.difficulty >= 3) mob.addEffect("strength", LONG, { amplifier: 0, showParticles: false });
      run.mobs.push(mob);
    } catch (e) {
      console.warn(`[expedition] spawn: ${e}`);
    }
  }
  sound(run, "mob.zombie.say");
  tell(run, `§cWave ${run.wave + 1} of ${run.waves}!`);
}

/** @param {Run} run */
function spawnBoss(run) {
  const d = run.dungeon;
  const c = center(run.o, run.lay.rooms[run.room]);
  try {
    const boss = overworld().spawnEntity(/** @type {any} */ (d.boss.mob), { x: c.x + 0.5, y: c.y, z: c.z + 0.5 });
    boss.nameTag = `§c${d.boss.name}`;
    boss.addTag(MOB_TAG);
    boss.addTag(`realm:exp_run:${run.id}`);
    boss.addTag(`realm:bounty:exp_${run.id}`);
    const extra = d.boss.health * (1 + 0.5 * (run.members.size - 1));
    boss.addEffect("health_boost", LONG, { amplifier: Math.max(0, Math.min(60, Math.ceil(extra / 4) - 1)), showParticles: false });
    if (d.difficulty >= 2) boss.addEffect("strength", LONG, { amplifier: d.difficulty - 2, showParticles: false });
    if (d.difficulty >= 3) boss.addEffect("resistance", LONG, { amplifier: 0, showParticles: false });
    boss.addEffect("fire_resistance", LONG, { amplifier: 0, showParticles: false });
    system.runTimeout(() => {
      try {
        if (boss.isValid) boss.getComponent("minecraft:health")?.resetToMaxValue();
      } catch {
        // gone
      }
    }, 2);
    run.bossId = boss.id;
  } catch (e) {
    console.warn(`[expedition] boss: ${e}`);
    finish(run); // no boss to fight: don't strand the party
    return;
  }
  for (const id of run.members.keys()) online(id)?.onScreenDisplay.setTitle(`§c${d.boss.name}`, { subtitle: "§7guards the treasure", fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 15 });
  sound(run, "mob.wither.spawn");
}

/** The boss fell: clock, leaderboard, rewards, treasure. @param {Run} run */
function finish(run) {
  if (run.phase !== "active") return;
  run.phase = "finishing";
  run.clearMs = Date.now() - run.started;
  run.finishAt = system.currentTick + get("exitSeconds") * 20;
  for (const m of run.mobs) if (m.isValid) m.remove();
  run.mobs = [];
  const n = run.lay.rooms.length;
  openDoor(run, n - 2);
  fillChest(run);
  const d = run.dungeon;
  const names = [...run.members.values()].map((m) => m.name);
  // Leaderboard
  /** @type {Record<string, Best[]>} */
  const best = readJson(PROP_BEST) ?? {};
  const list = Array.isArray(best[d.id]) ? best[d.id] : [];
  const entry = { t: run.clearMs, n: names.join(", ") || run.leaderName, at: Date.now() };
  list.push(entry);
  list.sort((a, b) => a.t - b.t);
  best[d.id] = list.slice(0, Math.max(1, CONFIG.leaderboardSize));
  writeJson(PROP_BEST, best);
  const rank = best[d.id].indexOf(entry);
  const record = rank === 0 ? " §6A new record!" : rank > 0 ? ` §7#${rank + 1} on the leaderboard.` : "";
  for (const [id] of run.members) {
    const p = online(id);
    if (!p) continue;
    p.onScreenDisplay.setTitle("§6Expedition complete", { subtitle: `§f${d.name} cleared in ${clock(run.clearMs)}`, fadeInDuration: 10, stayDuration: 80, fadeOutDuration: 20 });
    p.playSound("random.totem", { volume: 0.6 });
    payCrowns(p, d.crowns, `Expedition: ${d.name}`);
    send("realm:quest_done", { player: p.id, pack: "expedition_bp", id: `expedition_${d.id}`, label: `Expedition: ${d.name} cleared`, kind: "expedition" });
    if (CONFIG.rep > 0) send("realm:rep_add", { player: p.id, guild: "wardens", amount: CONFIG.rep, reason: `Expedition: ${d.name}` });
    send("realm:journal", { player: p.id, page: "places", entry: `expedition_${d.id}`, label: `Expedition: ${d.name}` });
    if (CONFIG.relics.length && Math.random() < get("relicChance")) send("realm:relic_give", { player: p.id, relic: CONFIG.relics[Math.floor(Math.random() * CONFIG.relics.length)] });
  }
  tell(run, `§a${d.name} cleared in ${clock(run.clearMs)}!${record} §eThe treasure room is open: you have ${get("exitSeconds")} seconds before you're taken back.`);
  world.sendMessage(`§6${names.join(", ")} cleared the ${dungeonLabel(d)} in ${clock(run.clearMs)}.`);
  saveRun(run);
}

/** @param {Run} run */
function fillChest(run) {
  try {
    const chest = overworld().getBlock(center(run.o, run.lay.rooms[run.lay.rooms.length - 1]));
    const inv = chest?.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    const extra = 1 + 0.25 * (run.members.size - 1); // a little more for a bigger party
    for (const l of run.dungeon.loot) {
      if (Math.random() >= l.chance) continue;
      let left = Math.round((l.min + Math.floor(Math.random() * (Math.max(l.min, l.max) - l.min + 1))) * extra);
      try {
        const max = new ItemStack(l.item, 1).maxAmount;
        while (left > 0) {
          const stack = new ItemStack(l.item, Math.min(max, left));
          left -= stack.amount;
          if (inv.addItem(stack)) break; // full
        }
      } catch (e) {
        console.warn(`[expedition] loot ${l.item}: ${e}`);
      }
    }
  } catch (e) {
    console.warn(`[expedition] chest: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// The loop: rooms, waves, members, clock
// ---------------------------------------------------------------------------

/** @param {Entity} e */
function alive(e) {
  try {
    if (!e.isValid) return false;
    const hp = e.getComponent("minecraft:health");
    return !hp || hp.currentValue > 0;
  } catch {
    return false;
  }
}

/** @param {Run} run */
function objective(run) {
  if (run.phase === "finishing") return `§6Treasure! §fLeaving in ${Math.max(0, Math.ceil((run.finishAt - system.currentTick) / 20))}s`;
  const room = run.lay.rooms[run.room];
  const step = `Room ${run.room + 1}/${run.lay.rooms.length}`;
  if (!run.roomActive) return `${step}: go on to the next room`;
  if (room.kind === "combat") return `${step}: defeat the wave (${run.mobs.filter(alive).length} left)`;
  if (room.kind === "puzzle") return `${step}: set the levers as the clues say`;
  if (room.kind === "boss") return `${step}: defeat ${run.dungeon.boss.name}`;
  return step;
}

/** @param {Run} run @param {Map<string, Player>} players */
function tickRun(run, players) {
  const now = system.currentTick;
  // Members: still inside? (Leaving another way, like a teleport, counts as leaving.)
  for (const [id, m] of [...run.members]) {
    const p = players.get(id);
    if (!p) continue; // just died or left: handled by their events
    if (now < m.since + GRACE_TICKS) continue;
    const inside = p.dimension.id === OVERWORLD && inBox(run.o, p.location, 2);
    m.away = inside ? 0 : m.away + LOOP_TICKS;
    if (m.away >= AWAY_TICKS) {
      p.setDynamicProperty(PROP_RETURN, undefined);
      p.sendMessage("§eYou left the dungeon, so you're out of the expedition.");
      tell(run, `§7${m.name} left the expedition.`);
      dropMember(run, id);
      if (run.phase === "resetting") return;
    }
  }
  if (run.phase === "finishing") {
    if (now >= run.finishAt) endRun(run, "§aThe expedition is over. Welcome back!").catch((e) => console.warn(`[expedition] ${e}`));
    else if ((now / LOOP_TICKS) % 2 === 0) for (const id of run.members.keys()) { const p = players.get(id); if (p) actionbar(p, `§e${run.dungeon.name} §f${clock(run.clearMs)} §7| ${objective(run)}`); }
    return;
  }
  if (Date.now() > run.deadline) {
    endRun(run, `§cTime's up! The ${run.dungeon.name} wasn't cleared within ${get("timeLimitMinutes")} minutes.`).catch((e) => console.warn(`[expedition] ${e}`));
    return;
  }
  const room = run.lay.rooms[run.room];
  const here = [...run.members.keys()].map((id) => players.get(id)).filter((p) => !!p && p.dimension.id === OVERWORLD && inRoom(run.o, room, p.location));
  if (!run.roomActive && here.length) {
    run.roomActive = true;
    if (room.kind === "combat") {
      run.wave = 0;
      run.nextWaveAt = now + 30;
      tell(run, "§7Something stirs in the dark...");
    } else if (room.kind === "puzzle") {
      tell(run, `§eA lever puzzle! Set the four levers (on colored wool) as the signs say: ${run.lay.clues.map((c) => c.replace(/§./g, "").replace(/\n/g, " ")).join("; ")}.`);
    } else if (room.kind === "boss") {
      run.nextWaveAt = now + 40;
      tell(run, `§cYou feel watched...`);
    }
  }
  if (run.roomActive) {
    if (room.kind === "combat") {
      if (run.nextWaveAt && now >= run.nextWaveAt) {
        run.nextWaveAt = 0;
        spawnWave(run);
      } else if (!run.nextWaveAt) {
        // Mobs that wandered out of the dungeon (or got stuck in a wall outside it) don't hold the door shut.
        for (const m of run.mobs) if (alive(m) && !inBox(run.o, m.location, 1)) m.remove();
        if (!run.mobs.some(alive)) {
          run.wave++;
          if (run.wave < run.waves) run.nextWaveAt = now + 40;
          else clearRoom(run);
        }
      }
    } else if (room.kind === "puzzle") {
      if (run.solved) clearRoom(run);
    } else if (room.kind === "boss") {
      if (run.nextWaveAt && now >= run.nextWaveAt) {
        run.nextWaveAt = 0;
        spawnBoss(run);
      } else if (!run.nextWaveAt && run.bossId) {
        const boss = world.getEntity(run.bossId);
        run.bossGone = boss && alive(boss) ? 0 : run.bossGone + LOOP_TICKS;
        if (run.bossGone >= 60) finish(run); // gone without a death event (removed by a command): still a win
      }
    }
  }
  if ((now / LOOP_TICKS) % 2 === 0) {
    const t = clock(Date.now() - run.started);
    for (const id of run.members.keys()) {
      const p = players.get(id);
      if (p) actionbar(p, `§e${run.dungeon.name} §f${t} §7| ${objective(run)}`);
    }
  }
}

/** @param {Run} run */
function clearRoom(run) {
  openDoor(run, run.room);
  run.room++;
  run.roomActive = false;
  run.mobs = [];
  run.nextWaveAt = 0;
  sound(run, "random.levelup");
  tell(run, "§aThe bars rise. Onward!");
}

system.runInterval(() => {
  if (!runs.size) return;
  /** @type {Map<string, Player>} */
  const players = new Map(world.getAllPlayers().map((p) => [p.id, p]));
  for (const run of [...runs.values()]) {
    if (run.phase !== "active" && run.phase !== "finishing") continue;
    try {
      tickRun(run, players);
    } catch (e) {
      console.warn(`[expedition] loop: ${e}`);
    }
  }
}, LOOP_TICKS);

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

world.afterEvents.leverAction.subscribe(({ block, player }) => {
  try {
    for (const run of runs.values()) {
      if (run.phase !== "active" || run.solved) continue;
      const pi = run.lay.rooms.findIndex((r) => r.kind === "puzzle");
      const spots = puzzleSpots(run.o, run.lay, pi);
      const k = spots.levers.findIndex((l) => l.x === block.x && l.y === block.y && l.z === block.z);
      if (k < 0 || block.dimension.id !== OVERWORLD) continue;
      const states = spots.levers.map((at) => {
        const b = overworld().getBlock(at);
        return b?.typeId === "minecraft:lever" && b.permutation.getState("open_bit") === true;
      });
      const shown = COLORS.map((c, i) => `${c.code}${c.name} §f${states[i] ? "on" : "off"}`).join("  ");
      if (player?.isValid) actionbar(player, shown);
      if (run.room === pi && states.every((s, i) => s === run.lay.solution[i])) {
        run.solved = true;
        tell(run, "§aClick. Something heavy moves behind the wall: the puzzle is solved!");
        sound(run, "random.orb");
      }
    }
  } catch (e) {
    console.warn(`[expedition] lever: ${e}`);
  }
});

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  try {
    const id = deadEntity.id;
    for (const run of runs.values()) {
      if (run.bossId === id && run.phase === "active") {
        finish(run);
        return;
      }
      if (!(deadEntity instanceof Player) || !run.members.has(id)) continue;
      const m = run.members.get(id);
      const where = deadEntity.location;
      tell(run, `§c${m?.name ?? "A member"} fell and is out of the expedition.`);
      if (get("returnItemsOnDeath") === true) {
        // The drops appear this tick: collect them before anyone else can, and give them back on respawn.
        system.runTimeout(() => {
          try {
            /** @type {ItemStack[]} */
            const items = dropped.get(id) ?? [];
            for (const e of overworld().getEntities({ type: "minecraft:item", location: where, maxDistance: 6 })) {
              const stack = e.getComponent("minecraft:item")?.itemStack;
              if (!stack) continue;
              items.push(stack);
              e.remove();
            }
            if (items.length) dropped.set(id, items);
          } catch (e) {
            console.warn(`[expedition] collect drops: ${e}`);
          }
        }, 1);
      }
      dropMember(run, id); // their return spot stays: playerSpawn sends them back
      return;
    }
  } catch (e) {
    console.warn(`[expedition] death: ${e}`);
  }
});

world.afterEvents.playerSpawn.subscribe(({ player }) => {
  try {
    const raw = player.getDynamicProperty(PROP_RETURN);
    if (typeof raw !== "string") return;
    if (runOf(player.id)) return; // still in a run (teleporting in)
    // Respawned after dying in a dungeon, or rejoined after leaving the game mid-run or after a restart.
    system.runTimeout(() => {
      if (player.isValid && !runOf(player.id)) sendBack(player, false);
    }, 5);
  } catch (e) {
    console.warn(`[expedition] spawn: ${e}`);
  }
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  const run = runOf(playerId);
  if (!run) return;
  const m = run.members.get(playerId);
  tell(run, `§7${m?.name ?? "A member"} left the game and is out of the expedition.`);
  dropMember(run, playerId);
});

/** Is this spot in a dungeon that exists right now? @param {Vector3} p */
const inDungeon = (p) => [...runs.values()].some((r) => r.phase !== "gathering" && inBox(r.o, p));
/** @param {Player} p */
const builder = (p) => isOp(p) && p.getGameMode() === GameMode.Creative;

// The dungeon's walls hold the rooms together and its blocks must all be its own for the reset: no breaking...
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if (!runs.size || ev.dimension.id !== OVERWORLD || !inDungeon(ev.block.location) || builder(ev.player)) return;
  ev.cancel = true;
  const p = ev.player;
  system.run(() => {
    if (p.isValid) actionbar(p, "§7The dungeon's blocks can't be broken.");
  });
});

// ...and blocks placed in it pop back out as items (with their contents, for a shulker box).
world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  try {
    if (!runs.size || block.dimension.id !== OVERWORLD || !inDungeon(block.location) || builder(player)) return;
    block.dimension.runCommand(`setblock ${block.x} ${block.y} ${block.z} air destroy`);
    actionbar(player, "§7Blocks placed in the dungeon pop back out.");
  } catch (e) {
    console.warn(`[expedition] place: ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  // Runs live in memory: one cut short by a restart can't go on, so its dungeon is reset. Its players
  // are sent back by playerSpawn when they join.
  system.runTimeout(async () => {
    for (let slot = 0; slot < 3; slot++) {
      const rec = readJson(PROP_RUN + slot);
      if (!rec || typeof rec.seed !== "number" || typeof rec.x !== "number") {
        removeArea(slot); // a leftover ticking area, if any
        continue;
      }
      pending.set(slot, rec);
    }
    try {
      for (const e of overworld().getEntities({ tags: [MOB_TAG] })) e.remove();
    } catch {
      // nothing loaded
    }
    for (const [slot, rec] of [...pending]) {
      try {
        if (await resetBox(rec)) {
          writeJson(PROP_RUN + slot, undefined);
          pending.delete(slot);
        }
      } catch (e) {
        console.warn(`[expedition] reset after restart: ${e}`);
      }
    }
  }, 100);
});

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/** @param {Player} player @param {Run} run */
async function runMenu(player, run) {
  const names = [...run.members.values()].map((m) => m.name).join(", ");
  const body = [
    `§e${dungeonLabel(run.dungeon)}§r`,
    run.phase === "active" ? `Time: ${clock(Date.now() - run.started)} of ${get("timeLimitMinutes")}:00\n${objective(run)}` : run.phase === "finishing" ? `Cleared in ${clock(run.clearMs)}! ${objective(run)}` : "Getting ready...",
    `Party: ${names}`,
  ].join("\n\n");
  const res = await show(player, new ActionFormData().title("§lExpedition").body(body).button("Leave the expedition").button("Close"));
  if (!res || res.canceled || res.selection !== 0) return;
  leave(player);
}

/** @param {Player} player */
function leave(player) {
  const run = runOf(player.id);
  if (run) {
    const m = run.members.get(player.id);
    if (run.phase === "gathering" || run.phase === "building") {
      run.members.delete(player.id);
      player.sendMessage("§7You won't go on the expedition.");
      return;
    }
    tell(run, `§7${m?.name ?? player.name} left the expedition.`);
    dropMember(run, player.id);
    sendBack(player);
    return;
  }
  if (typeof player.getDynamicProperty(PROP_RETURN) === "string") {
    sendBack(player);
    return;
  }
  player.sendMessage("§7You're not on an expedition.");
}

/** @param {Player} player */
async function leaderboards(player) {
  /** @type {Record<string, Best[]>} */
  const best = readJson(PROP_BEST) ?? {};
  const lines = CONFIG.dungeons.map((d) => {
    const list = Array.isArray(best[d.id]) ? best[d.id] : [];
    const rows = list.length ? list.map((b, i) => `${i + 1}. ${clock(b.t)}  ${b.n}`).join("\n") : "§7No clears yet.";
    return `§l${dungeonLabel(d)}§r\n${rows}`;
  });
  await show(player, new ActionFormData().title("§lFastest clears").body(lines.join("\n\n")).button("Close"));
}

/** /realm:expedition @param {Player} player */
async function mainMenu(player) {
  const mine = runOf(player.id);
  if (mine) return runMenu(player, mine);
  const s = site();
  const active = [...runs.values()];
  const canStart = get("enabled") === true && !!s && freeSlot() !== undefined;
  /** @type {string[]} */
  const body = [];
  if (active.length) body.push(...active.map((r) => `§eAn expedition is in progress (${statusLine(r)})§r`));
  if (get("enabled") !== true) body.push("New expeditions are disabled right now.");
  else if (!s) body.push(`The operators haven't picked an expedition site yet.${isOp(player) ? " Stand far from spawn and run /realm:expedition_site." : ""}`);
  else if (canStart) body.push("Pick a dungeon. Your party members within 32 blocks are asked to join. Clear the rooms, solve the lever puzzle and defeat the boss for treasure, Crowns and a place on the leaderboard.");
  /** @type {Record<string, Best[]>} */
  const best = readJson(PROP_BEST) ?? {};
  const form = new ActionFormData().title("§lExpeditions").body(body.join("\n\n"));
  /** @type {(() => Promise<void> | void)[]} */
  const actions = [];
  if (canStart) {
    for (const d of CONFIG.dungeons) {
      const top = Array.isArray(best[d.id]) && best[d.id][0] ? ` - best ${clock(best[d.id][0].t)}` : "";
      form.button(`${dungeonLabel(d)}\n§8${d.mobs.map(prettyId).join(", ")}${top}`);
      actions.push(() => start(player, d));
    }
  }
  form.button("Fastest clears");
  actions.push(() => leaderboards(player));
  if (typeof player.getDynamicProperty(PROP_RETURN) === "string") {
    form.button("Go back to where I started");
    actions.push(() => sendBack(player));
  }
  form.button("Close");
  actions.push(() => undefined);
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  await actions[res.selection]?.();
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

/** @param {Player} player @param {number | undefined} x @param {number | undefined} z */
function setSite(player, x, z) {
  if (runs.size || pending.size) return player.sendMessage("§cWait until the expedition in progress is over (or end it with /realm:expedition_reset).");
  if (x === undefined && player.dimension.id !== OVERWORLD) return player.sendMessage("§cExpedition sites are in the overworld. Go there, or give x and z.");
  const sx = Math.floor(x ?? player.location.x);
  const sz = Math.floor(z ?? player.location.z);
  const spawn = world.getDefaultSpawnLocation();
  const fromSpawn = Math.hypot(sx - spawn.x, sz - spawn.z);
  const avoid = CONFIG.avoidSpawn;
  if (fromSpawn < avoid + SIZE / 2) {
    player.sendMessage(`§cThat's only ${Math.round(fromSpawn)} blocks from world spawn. The site must be at least ${avoid + SIZE / 2} blocks away (avoidSpawn plus half the dungeon), so it's never under the spawn town.`);
    return;
  }
  /** @type {string[]} */
  const notes = [];
  const slots = Math.max(1, Math.min(3, get("slots")));
  for (let slot = 0; slot < slots; slot++) {
    const o = originFor({ x: sx, z: sz }, slot);
    const { from, to } = box(o);
    const label = slots > 1 ? `Dungeon ${slot + 1} (${from.x}, ${from.z} to ${to.x}, ${to.z})` : `The dungeon area (${from.x}, ${from.y}, ${from.z} to ${to.x}, ${to.y}, ${to.z})`;
    let found;
    try {
      found = findForeign(o);
    } catch {
      notes.push(`§e${label} isn't loaded from here, so it will be checked before its first run.`);
      continue;
    }
    if (found) {
      player.sendMessage(
        `§c${label} has ${prettyId(found.type)} at ${found.at.x}, ${found.at.y}, ${found.at.z}. Dungeons only replace natural underground blocks (stone, deepslate, tuff, ores, dirt, gravel, water, lava, caves), so this site would damage a build, a mineshaft or an ancient city. Pick another spot.`,
      );
      return;
    }
    notes.push(`§a${label}: only natural blocks.`);
  }
  writeJson(PROP_SITE, { x: sx, z: sz, by: player.name, at: Date.now() });
  player.sendMessage(`§aExpedition site set at ${sx}, ${sz}: dungeons are built at y ${FLOOR - 1} to ${FLOOR + 7}, sealed in deepslate, and filled back in after each run.`);
  for (const n of notes) player.sendMessage(n);
  player.sendMessage("§7Keep builds and mines away from this spot underground: a run is called off if anything that isn't natural turns up in the dungeon area.");
}

/** @param {Player} player */
async function opReset(player) {
  const list = [...runs.values()];
  if (!list.length && !pending.size) return player.sendMessage("§7No expedition is running, and every dungeon area is already reset.");
  for (const run of list) await endRun(run, `§cAn operator (${player.name}) ended the expedition.`);
  for (const [slot, rec] of [...pending]) {
    if (await resetBox(rec)) {
      writeJson(PROP_RUN + slot, undefined);
      pending.delete(slot);
    }
  }
  player.sendMessage(pending.size ? "§eEnded. Some dungeon areas couldn't be loaded to reset; they'll be tried again after a restart." : "§aExpeditions ended and the dungeon areas reset.");
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** @param {import("@minecraft/server").CustomCommandOrigin} origin */
const originPlayer = (origin) => {
  const p = origin.initiator ?? origin.sourceEntity;
  return p instanceof Player ? p : undefined;
};
const notPlayer = { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
const ok = { status: CustomCommandStatus.Success };

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:expedition",
      description: "Expeditions: start a dungeon run with your party, see how it's going, or see the fastest clears",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      system.run(() => mainMenu(player).catch((e) => console.warn(`[expedition] ${e}`)));
      return ok;
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:expedition_leave",
      description: "Leave the expedition you're on and go back to where you started",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      system.run(() => {
        try {
          leave(player);
        } catch (e) {
          console.warn(`[expedition] ${e}`);
        }
      });
      return ok;
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:expedition_site",
      description: "Set where expedition dungeons are built, deep underground: here, or at x z",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
      optionalParameters: [
        { name: "x", type: CustomCommandParamType.Integer },
        { name: "z", type: CustomCommandParamType.Integer },
      ],
    },
    (origin, /** @type {number | undefined} */ x, /** @type {number | undefined} */ z) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      if ((x === undefined) !== (z === undefined)) return { status: CustomCommandStatus.Failure, message: "Give both x and z, or neither to use where you stand." };
      system.run(() => {
        try {
          setSite(player, x, z);
        } catch (e) {
          console.warn(`[expedition] ${e}`);
        }
      });
      return ok;
    },
  );

  customCommandRegistry.registerCommand(
    {
      name: "realm:expedition_reset",
      description: "End every expedition in progress, send its players back and reset the dungeon",
      permissionLevel: CommandPermissionLevel.GameDirectors,
      cheatsRequired: false,
    },
    (origin) => {
      const player = originPlayer(origin);
      if (!player) return notPlayer;
      system.run(() => opReset(player).catch((e) => console.warn(`[expedition] ${e}`)));
      return ok;
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "expedition_bp");
  },
  { namespaces: ["realm"] },
);
