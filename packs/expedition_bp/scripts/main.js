import {
  BlockPermutation,
  BlockTypes,
  BlockVolume,
  CommandPermissionLevel,
  CustomCommandParamType,
  CustomCommandStatus,
  Dimension,
  Entity,
  EntityDamageCause,
  GameMode,
  ItemStack,
  Player,
  system,
  world,
} from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData, uiManager } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get } from "./settings.js";
import {
  AFFIXES,
  CELL,
  COLORS,
  HALF,
  MAX_GRID,
  MAX_ROOM_H,
  R,
  affixNames,
  affixOf,
  blocksDoor,
  clamp,
  curseAffix,
  faceDir,
  floorBlockers,
  frame,
  lampPress,
  layout,
  levelKey,
  levelName,
  levelShort,
  parseLevelKey,
  rng,
  rollAffixes,
  scaleFor,
  shuffle,
  tierOf,
  timeLimit,
  toWorld,
  topLevel,
  wrap,
} from "./layout.js";

// An expedition is a dungeon generated from a seed and a level (Easy, Normal, Hard or Nightmare tiers
// 1 to 20), deep underground under the site an operator picked, inside a sealed box of deepslate: a
// grid of 20-block cells (3 x 3 up to 5 x 5), one room per cell along a winding path, corridors
// between them, maybe side rooms off the path. Only natural underground blocks are ever replaced, and
// the box is checked for anything else before each run. After the run, the box is filled back with
// deepslate. The box's size is saved with the run, so a run cut short by a restart is reset from its
// saved record.

const PROP_SITE = "expedition:site"; // world: JSON { x, z, by, at }
const PROP_RUN = "expedition:run:"; // + slot. world: JSON RunRecord while a dungeon exists in that slot
const PROP_NEXT = "expedition:next"; // world: next run id
const PROP_BEST = "expedition:best"; // world (before tiers): JSON { [dungeonId]: Best[] }, read once into PROP_BEST_D
const PROP_BEST_D = "expedition:best:"; // + dungeon id. world: JSON { [levelKey]: Best[] }
const PROP_MIGRATED = "expedition:best_v2"; // world: 1 once PROP_BEST was copied into PROP_BEST_D
const PROP_TIERS = "expedition:tiers"; // world: JSON TierEntry[], the highest level each player cleared
const PROP_HISTORY = "expedition:history"; // world: JSON HistoryEntry[], newest first
const PROP_RETURN = "expedition:return"; // player: JSON { d, x, y, z, run } where to send them back
const PROP_PROG = "expedition:prog"; // player: JSON Progress
const PROP_ROLLS = "expedition:rolls"; // player: JSON { [levelKey]: string[] } the affixes shown for each level

const OVERWORLD = "minecraft:overworld";
const MOB_TAG = "realm:exp_mob";
const CHAMP_TAG = "realm:exp_champ";
const CALLED_TAG = "realm:exp_called";
const ELITE_CHAMP = "realm:champion";
const PARTY_TAG = "realm_party:";
const LEGACY_CELL = 16;
const LEGACY_GRID = 3;
const LEGACY_TOP = 7;
const LOOP_TICKS = 10;
const AWAY_TICKS = 100; // a member outside the dungeon this long has left it some other way
const GRACE_TICKS = 60; // after teleporting in, before the away check counts
const LONG = 1000000; // effect duration (ticks) that outlasts any run
const FLOOR = Math.max(-58, Math.min(-20, Math.floor(CONFIG.depth)));
const SPACING = Math.max(MAX_GRID * CELL + 12, CONFIG.slotSpacing);
/** Mobs the Champions pack (elite_bp) can make into champions. */
const ELITE_MOBS = new Set(["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager_v2", "minecraft:skeleton", "minecraft:stray", "minecraft:spider", "minecraft:witch"]);
/** Mobs that can wear armor. */
const ARMORED = new Set(["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:skeleton", "minecraft:stray", "minecraft:wither_skeleton", "minecraft:zombie_villager_v2", "minecraft:bogged"]);
const ARMOR = ["", "chainmail", "iron", "diamond", "netherite"];
/** Blocks players may never place in a dungeon (they'd be lost or blow up): pop back out like before. */
const NO_PLACE = new Set(["minecraft:tnt", "minecraft:respawn_anchor", "minecraft:bed", "minecraft:end_crystal", "minecraft:lava"]);
/** Shrine blessings: id, name, what it does. */
const BLESSINGS = [
  { id: "vigor", name: "Vigor", desc: "Extra hearts for the rest of the run", effect: "health_boost", amp: 1 },
  { id: "swiftness", name: "Swiftness", desc: "Speed for the rest of the run", effect: "speed", amp: 0 },
  { id: "ward", name: "Ward", desc: "Resistance for the rest of the run", effect: "resistance", amp: 0 },
  { id: "haste", name: "Haste", desc: "Haste and Strength for the rest of the run", effect: "strength", amp: 0 },
  { id: "fortune", name: "Fortune", desc: "A quarter more treasure", effect: "", amp: 0 },
];

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {typeof CONFIG.dungeons[number]} Dungeon */
/** @typedef {import("./layout.js").Room} Room */
/** @typedef {import("./layout.js").Layout} Layout */
/** @typedef {import("./layout.js").Part} Part */
/** @typedef {ReturnType<typeof scaleFor>} Scale */
/**
 * @typedef {{ id: number, slot: number, dungeon: string, seed: number, x: number, z: number, y: number, leader: string, phase: string,
 *   l?: number, g?: number, c?: number, h?: number, pt?: string[] }} RunRecord
 * l: level; g, c, h: the box's grid, cell size and height above the floor (missing in records from before tiers); pt: block types players placed
 */
/** @typedef {{ name: string, since: number, away: number }} Member */
/** @typedef {{ room: number, k: string, i: number, at: Vector3 }} Elem */
/**
 * @typedef {{ active: boolean, solved: boolean, progress: number, busyUntil: number, startedAt: number, hit: Set<number>,
 *   state: boolean[], colors: number[], lockUntil: number, gave: boolean }} PuzState
 */
/** @typedef {{ kind: string, x: number, y: number, z: number, r: number, at: number, until: number, ax?: "x" | "z" }} Hazard */
/**
 * @typedef {{ id: number, slot: number, dungeon: Dungeon, level: number, s: Scale, seed: number, affixes: string[], o: Vector3, lay: Layout,
 *   size: number, top: number, leaderName: string, leaderId: string, members: Map<string, Member>,
 *   phase: "gathering" | "building" | "active" | "finishing" | "resetting", started: number, deadline: number, limitMin: number,
 *   room: number, roomActive: boolean, wave: number, waves: number, mobs: Entity[], extra: Entity[], nextWaveAt: number, awaitUntil: number,
 *   bossId?: string, bossGone: number, bossHalf: boolean, nextAddsAt: number, finishAt: number, clearMs: number, checked: boolean,
 *   puz: Map<number, PuzState>, elems: Map<string, Elem>, placed: Set<string>, placedTypes: Set<string>, breakable: Set<string>,
 *   shrine: { bless: typeof BLESSINGS[number], curse: string | undefined }, cursed: boolean, fortune: boolean, sigil: boolean,
 *   hazards: Hazard[], fires: { x: number, y: number, z: number, until: number }[], timers: Record<string, number>, trapNext: number }} Run
 * checked: the box was found to hold only natural blocks, so the dungeon may be built and later filled in
 */
/** @typedef {{ t: number, n: string, at: number, a?: string[] }} Best */
/** @typedef {{ id: string, n: string, l: number, d: string, at: number }} TierEntry */
/** @typedef {{ d: string, l: number, ok: boolean, t: number, n: string, at: number, a?: string[] }} HistoryEntry */
/** @typedef {{ u: number, b: number, c: number, r: HistoryEntry[] }} Progress */

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const ORES = ["coal", "iron", "copper", "gold", "redstone", "lapis", "diamond", "emerald"].flatMap((o) => [`minecraft:${o}_ore`, `minecraft:deepslate_${o}_ore`]);

/** What the deep underground is made of: the only blocks a dungeon may replace (with lush caves, geodes and the deep dark's sculk). */
const NATURAL_IDS = [
  ...ORES,
  "minecraft:lit_redstone_ore",
  "minecraft:lit_deepslate_redstone_ore",
  ...["air", "stone", "deepslate", "tuff", "granite", "diorite", "andesite", "calcite", "gravel", "dirt", "coarse_dirt", "dirt_with_roots", "clay"],
  ...["water", "flowing_water", "lava", "flowing_lava", "obsidian", "magma", "smooth_basalt", "infested_stone", "infested_deepslate"],
  ...["raw_iron_block", "raw_copper_block", "amethyst_block", "budding_amethyst", "small_amethyst_bud", "medium_amethyst_bud", "large_amethyst_bud", "amethyst_cluster"],
  ...["dripstone_block", "pointed_dripstone", "moss_block", "moss_carpet", "azalea", "flowering_azalea", "azalea_leaves", "azalea_leaves_flowered"],
  ...["cave_vines", "cave_vines_body_with_berries", "cave_vines_head_with_berries", "glow_lichen", "hanging_roots", "spore_blossom", "big_dripleaf", "small_dripleaf_block"],
  ...["sculk", "sculk_vein", "sculk_sensor", "sculk_shrieker", "sculk_catalyst", "seagrass", "kelp", "bubble_column"],
].map((b) => (b.startsWith("minecraft:") ? b : `minecraft:${b}`));

const B = {
  button: "minecraft:stone_button",
  plate: "minecraft:stone_pressure_plate",
  target: "minecraft:target",
  hit: "minecraft:gold_block",
  lampOn: "minecraft:sea_lantern",
  lampOff: "minecraft:black_concrete",
  gold: "minecraft:gold_block",
  pass: "minecraft:polished_andesite",
  curse: "minecraft:crying_obsidian",
  glow: "minecraft:glowstone",
  ladder: "minecraft:ladder",
  chest: "minecraft:chest",
  fire: "minecraft:fire",
  water: "minecraft:water",
};

/** Every block a dungeon places. The box holds only NATURAL_IDS blocks before a run, so any of these in it are the dungeon's own. */
const OURS_IDS = [
  ...CONFIG.dungeons.flatMap((d) => [d.wall, d.floor, d.accent, d.trim ?? d.accent, d.light, d.door, ...(d.decor ? [d.decor.block] : [])]),
  ...COLORS.map((c) => c.wool),
  ...Object.values(B),
  "minecraft:lever",
  "minecraft:standing_sign",
  "minecraft:web",
  ...["infested_stone_bricks", "infested_mossy_stone_bricks", "infested_cracked_stone_bricks", "infested_chiseled_stone_bricks", "infested_cobblestone"].map((b) => `minecraft:${b}`),
];

/** @type {{ natural: string[], replaceable: string[] } | undefined} */
let lists;
/**
 * The block lists, without ids this game version doesn't know (a block filter would reject the whole
 * call). Built on first use, after the world has loaded, when block types can be looked up.
 */
function blockLists() {
  if (lists) return lists;
  const natural = NATURAL_IDS.filter(known);
  return (lists = { natural, replaceable: [...new Set([...natural, ...OURS_IDS.filter(known)])] });
}
/** @param {string} id */
function known(id) {
  try {
    return !!BlockTypes.get(id);
  } catch {
    return true;
  }
}
/** Mobs a reset may remove from the box: the dungeons' own kinds. Anything else (a pet) is moved to the surface. */
const DUNGEON_MOBS = new Set([
  ...CONFIG.dungeons.flatMap((d) => [...d.mobs.map((m) => (typeof m === "string" ? m : m.id)), ...(d.flyers ?? []), d.boss.mob, ...(d.boss.adds ?? [])]),
  "minecraft:vex",
  "minecraft:magma_cube",
]);
const LITTER = new Set([
  "minecraft:item",
  "minecraft:xp_orb",
  "minecraft:arrow",
  "minecraft:thrown_trident",
  "minecraft:snowball",
  "minecraft:egg",
  "minecraft:fireball",
  "minecraft:small_fireball",
  "minecraft:shulker_bullet",
  "minecraft:evocation_fang",
  "minecraft:splash_potion",
  "minecraft:wind_charge_projectile",
  "minecraft:breeze_wind_charge_projectile",
]);

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
    .replace(/_v2$/, "")
    .replace(/^evocation_illager$/, "evoker")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
/** 372000 -> "6:12". @param {number} ms */
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** "Crypt (Nightmare 5)" @param {Dungeon} d @param {number} L */
const dungeonLabel = (d, L) => `${d.name} (${levelName(L)})`;
/** @param {string} id */
const online = (id) => world.getAllPlayers().find((p) => p.id === id);
/** @param {string} id */
const dungeonById = (id) => CONFIG.dungeons.find((d) => d.id === id);
const maxTier = () => clamp(Math.floor(Number(get("maxTier")) || 20), 1, 20);
const topLvl = () => topLevel(maxTier());
/** @param {Vector3} a */
const key3 = (a) => `${Math.floor(a.x)},${Math.floor(a.y)},${Math.floor(a.z)}`;

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
/** @param {Player} p @param {string} key @returns {any} */
function readPlayer(p, key) {
  try {
    const raw = p.getDynamicProperty(key);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
/** @param {Player} p @param {string} key @param {unknown} value */
function writePlayer(p, key, value) {
  try {
    p.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value));
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

/** player id -> tick until which a note holds the bar (another pack's `realm:actionbar`, or one of ours). */
const barHeld = new Map();

// Other packs' notes (durability, skill XP, mob health...) hold the bar for a moment: the run line waits.
// Steady background lines (`background: true`, like the Party HUD) don't stop it.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:actionbar") return;
    try {
      const m = JSON.parse(message);
      if (!m || typeof m.player !== "string" || m.from === "expedition_bp" || m.background === true) return;
      barHeld.set(m.player, system.currentTick + Math.min(200, Math.max(0, Number(m.ticks) || 0)));
    } catch {
      // not ours
    }
  },
  { namespaces: ["realm"] },
);

/**
 * Actionbar text, after asking the Coordinates HUD (and other bar writers) to step aside. The run line
 * (`steady`) is skipped while a note holds the bar; a note of ours holds the run line off too.
 * @param {Player} player @param {string} text @param {boolean} [steady]
 */
function actionbar(player, text, steady = false) {
  const now = system.currentTick;
  if (steady && (barHeld.get(player.id) ?? 0) > now) return;
  if (!steady) barHeld.set(player.id, now + 30);
  system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 30, from: "expedition_bp" }));
  player.onScreenDisplay.setActionBar(text);
}

/** @param {string} id @param {object} data */
const send = (id, data) => system.sendScriptEvent(id, JSON.stringify(data));

/** @param {string} name @param {Vector3} at */
function particle(name, at) {
  try {
    overworld().spawnParticle(name, at);
  } catch {
    // unknown particle or unloaded
  }
}

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
/** @param {Player} p */
function crownsOf(p) {
  try {
    return crownsObjective()?.getScore(p) ?? 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** The box's north-west corner at floor height for a slot and box size, from the site. @param {{ x: number, z: number }} site @param {number} slot @param {number} size @returns {Vector3} */
const originFor = (site, slot, size) => ({ x: site.x - Math.floor(size / 2) + slot * SPACING, y: FLOOR, z: site.z - Math.floor(size / 2) });

/** The whole box: 1 block under the floor to `top` above it. @param {Vector3} o @param {number} size @param {number} top */
const box = (o, size, top) => ({ from: { x: o.x, y: o.y - 1, z: o.z }, to: { x: o.x + size - 1, y: o.y + top, z: o.z + size - 1 } });

/** @param {Vector3} o @param {number} size @param {number} top @param {Vector3} p @param {number} [margin] */
function inBox(o, size, top, p, margin = 0) {
  return p.x >= o.x - margin && p.x < o.x + size + margin && p.z >= o.z - margin && p.z < o.z + size + margin && p.y >= o.y - 1 - margin && p.y < o.y + top + 1 + margin;
}

/** A run record's box (records from before tiers have no size: those were 3 x 3 cells of 16, 7 high). @param {RunRecord} rec */
function extent(rec) {
  const g = typeof rec.g === "number" ? rec.g : LEGACY_GRID;
  const c = typeof rec.c === "number" ? rec.c : LEGACY_CELL;
  const top = typeof rec.h === "number" ? rec.h : LEGACY_TOP;
  return { o: { x: rec.x, y: rec.y, z: rec.z }, size: g * c, top };
}

/** Center of a room (x, z of its middle block). @param {Run} run @param {Room} rm */
const roomCenter = (run, rm) => ({ x: run.o.x + rm.cx * CELL + HALF, z: run.o.z + rm.cz * CELL + HALF });

/** A room's local (u, v, y) in the world. @param {Run} run @param {Room} rm @param {number} u @param {number} v @param {number} y */
function wpos(run, rm, u, v, y) {
  const w = toWorld(frame(rm.back), roomCenter(run, rm), u, v);
  return { x: w.x, y: run.o.y + y, z: w.z };
}
/** Same, at the middle of the block (for spawning). @param {Run} run @param {Room} rm @param {{ u: number, v: number, y: number }} p */
function wmid(run, rm, p) {
  const w = wpos(run, rm, p.u, p.v, p.y);
  return { x: w.x + 0.5, y: w.y, z: w.z + 0.5 };
}

/** Is p inside room rm's interior? @param {Run} run @param {Room} rm @param {Vector3} p */
function inRoom(run, rm, p) {
  const c = roomCenter(run, rm);
  return p.x >= c.x - R && p.x < c.x + R + 1 && p.z >= c.z - R && p.z < c.z + R + 1 && p.y >= run.o.y + 1 && p.y < run.o.y + rm.h + 1;
}

/** facing_direction (buttons, ladders) for a local face. @param {Room} rm @param {import("./layout.js").Face} f */
function facingInt(rm, f) {
  if (f === "up") return 1;
  if (f === "down") return 0;
  const d = faceDir(frame(rm.back), f);
  return d.z < 0 ? 2 : d.z > 0 ? 3 : d.x < 0 ? 4 : 5;
}
/** ground_sign_direction for a standing sign whose text faces local face f. @param {Room} rm @param {import("./layout.js").Face} f */
function signDir(rm, f) {
  const d = faceDir(frame(rm.back), f);
  return d.z > 0 ? 0 : d.x < 0 ? 4 : d.z < 0 ? 8 : 12;
}

/** The bars (or high doorway) on a room's side toward room `to`, in world blocks. @param {Run} run @param {number} i @param {import("./layout.js").Door} door */
function doorPlane(run, i, door) {
  const rm = run.lay.rooms[i];
  const a = wpos(run, rm, ...sidePoint(door.side, -1), door.y + 1);
  const b = wpos(run, rm, ...sidePoint(door.side, 1), door.y + 3);
  return { from: { x: Math.min(a.x, b.x), y: a.y, z: Math.min(a.z, b.z) }, to: { x: Math.max(a.x, b.x), y: b.y, z: Math.max(a.z, b.z) } };
}
/** Local (u, v) of a spot in a side's wall. @param {import("./layout.js").Face} side @param {number} a @returns {[number, number]} */
function sidePoint(side, a) {
  const d = R + 1;
  if (side === "back") return [a, -d];
  if (side === "fwd") return [a, d];
  if (side === "left") return [-d, a];
  return [d, a];
}

// ---------------------------------------------------------------------------
// Building and resetting
// ---------------------------------------------------------------------------

/** @param {Dimension} dim @param {Vector3} from @param {Vector3} to @param {string | BlockPermutation} block */
function fill(dim, from, to, block) {
  const a = { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), z: Math.min(from.z, to.z) };
  const b = { x: Math.max(from.x, to.x), y: Math.max(from.y, to.y), z: Math.max(from.z, to.z) };
  const vol = new BlockVolume(a, b);
  const replaceable = blockLists().replaceable;
  // A block filter never matches air (BDS 1.26), so a filtered fill leaves caves open. When nothing but
  // natural blocks, air and the dungeon's own is in the volume, fill it whole; otherwise only what's ours to replace.
  if (!dim.containsBlock(vol, { excludeTypes: replaceable }, false)) dim.fillBlocks(vol, block);
  else dim.fillBlocks(vol, block, { blockFilter: { includeTypes: replaceable } });
}

/** @param {Dimension} dim @param {Vector3} at @param {BlockPermutation} p */
function place(dim, at, p) {
  const block = dim.getBlock(at);
  if (block && blockLists().replaceable.includes(block.typeId)) block.setPermutation(p);
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
 * Stops early once `live` says no.
 * @param {(() => void)[]} steps @param {() => boolean} [live] @returns {Promise<number>}
 */
function runSteps(steps, live = () => true) {
  return new Promise((resolve) => {
    system.runJob(
      (function* () {
        let failed = 0;
        for (const s of steps) {
          if (!live()) break; // the run was ended meanwhile: its reset takes over
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

/** Fills the box in columns of 16 x 16 (or one cell). @param {Dimension} dim @param {Vector3} o @param {number} size @param {number} top @param {string} block @returns {(() => void)[]} */
function fillBoxSteps(dim, o, size, top, block) {
  /** @type {(() => void)[]} */
  const steps = [];
  const step = 16;
  for (let x = 0; x < size; x += step)
    for (let z = 0; z < size; z += step) {
      const x2 = Math.min(size - 1, x + step - 1);
      const z2 = Math.min(size - 1, z + step - 1);
      // Tall boxes in two layers, so no single fill is over 32768 blocks.
      for (let y = -1; y <= top; y += 20) {
        const y2 = Math.min(top, y + 19);
        steps.push(() => fill(dim, { x: o.x + x, y: o.y + y, z: o.z + z }, { x: o.x + x2, y: o.y + y2, z: o.z + z2 }, block));
      }
    }
  return steps;
}

/** Text for a sign part ("name", "lore"... or the text itself). @param {Run} run @param {string} t */
function signText(run, t) {
  const d = run.dungeon;
  if (t === "name") return `§l${d.name}§r\n${levelName(run.level)}\nClear each room\nto open the bars`;
  if (t === "lore") return wrap(d.lore ?? "Clear every room. Beat the boss.", 15).slice(0, 4).join("\n");
  if (t === "affixes") {
    const list = run.affixes.map((a) => affixOf(a)?.name ?? a);
    return list.length ? `§lAffixes§r\n${list.slice(0, 3).join("\n")}` : "§lNo affixes§r\nGood luck";
  }
  if (t === "blessing") return `§lBlessing§r\n${run.shrine.bless.name}\n${wrap(run.shrine.bless.desc, 15).slice(0, 2).join("\n")}`;
  if (t === "curse") return run.shrine.curse ? `§lCurse§r\n${affixOf(run.shrine.curse)?.name ?? ""}\nfor the rest of\nthe run: +loot` : "§lCurse§r\nNothing left\nto curse";
  return t;
}

/** Corridors between two neighboring rooms (with the chute and pool below a shaft's high exit). @param {Run} run @param {Dimension} dim @param {number} i @param {number} j @param {number} ey */
function corridor(run, dim, i, j, ey) {
  const d = run.dungeon;
  const F = run.o.y;
  const A = run.lay.rooms[i];
  const Bm = run.lay.rooms[j];
  const ax = run.o.x + A.cx * CELL;
  const az = run.o.z + A.cz * CELL;
  const bx = run.o.x + Bm.cx * CELL;
  const bz = run.o.z + Bm.cz * CELL;
  const alongX = A.cx !== Bm.cx;
  const lo = alongX ? Math.min(ax, bx) : Math.min(az, bz); // the lower cell's corner along the corridor
  const c = alongX ? az + HALF : ax + HALF; // the middle across it
  /** @param {number} a1 @param {number} a2 @param {number} c1 @param {number} c2 @param {number} y1 @param {number} y2 @param {string} block */
  const put = (a1, a2, c1, c2, y1, y2, block) =>
    alongX ? fill(dim, { x: lo + a1, y: F + y1, z: c + c1 }, { x: lo + a2, y: F + y2, z: c + c2 }, block) : fill(dim, { x: c + c1, y: F + y1, z: lo + a1 }, { x: c + c2, y: F + y2, z: lo + a2 }, block);
  const aLow = alongX ? ax < bx : az < bz; // A is the lower cell
  const top = ey > 0 ? ey + 4 : 4;
  put(19, 21, -2, 2, 0, top, d.wall);
  put(19, 21, -1, 1, 0, 0, d.floor);
  if (ey > 0) {
    put(19, 21, -1, 1, 1, ey + 3, "minecraft:air");
    put(19, 21, -1, 1, 0, 0, B.water);
    const aWall = aLow ? 18 : 22;
    const bWall = aLow ? 22 : 18;
    put(aWall, aWall, -1, 1, ey + 1, ey + 3, "minecraft:air");
    put(bWall, bWall, -1, 1, 1, 3, "minecraft:air");
  } else put(18, 22, -1, 1, 1, 3, "minecraft:air");
}

/** @param {Run} run */
function buildSteps(run) {
  const dim = overworld();
  const { o, lay, dungeon: d } = run;
  const F = o.y;
  /** @type {(() => void)[]} */
  const steps = fillBoxSteps(dim, o, run.size, run.top, "minecraft:deepslate"); // seal: caves and water inside the box become solid
  const n = lay.n;
  lay.rooms.forEach((rm) => {
    const bx = o.x + rm.cx * CELL;
    const bz = o.z + rm.cz * CELL;
    steps.push(() => fill(dim, { x: bx + 2, y: F, z: bz + 2 }, { x: bx + 18, y: F + rm.h + 1, z: bz + 18 }, d.wall));
    steps.push(() => {
      fill(dim, { x: bx + 3, y: F, z: bz + 3 }, { x: bx + 17, y: F, z: bz + 17 }, d.floor);
      fill(dim, { x: bx + 3, y: F + 1, z: bz + 3 }, { x: bx + 17, y: F + rm.h, z: bz + 17 }, "minecraft:air");
      for (const [px, pz] of [[3, 3], [17, 3], [3, 17], [17, 17]]) fill(dim, { x: bx + px, y: F + 1, z: bz + pz }, { x: bx + px, y: F + rm.h, z: bz + pz }, d.accent);
      const lantern = perm(d.light, { hanging: true });
      for (const [lx, lz] of [[6, 6], [14, 6], [6, 14], [14, 14]]) place(dim, { x: bx + lx, y: F + rm.h, z: bz + lz }, lantern);
    });
  });
  // Corridors: along the path, then to side rooms.
  for (let i = 0; i < n - 1; i++) {
    const rm = lay.rooms[i];
    steps.push(() => {
      corridor(run, dim, i, i + 1, rm.ey);
      const door = rm.doors.find((dd) => dd.to === i + 1);
      if (i > 0 && door?.bars) {
        const p = doorPlane(run, i, door);
        fill(dim, p.from, p.to, d.door); // every room but the entry starts closed
      }
    });
  }
  lay.rooms.forEach((rm, j) => {
    if (rm.parent >= 0) steps.push(() => corridor(run, dim, rm.parent, j, 0));
  });
  lay.rooms.forEach((rm, i) => steps.push(() => buildParts(run, dim, rm, i)));
  steps.push(() => {
    const vault = lay.rooms[n - 1];
    for (const c of vault.chests) place(dim, wpos(run, vault, c.u, c.v, c.y), perm(B.chest));
  });
  return steps;
}

/**
 * Places one room's parts: puzzle pieces, balconies, ladders, ledges, signs, decor. Registers the pieces players press.
 * @param {Run} run @param {Dimension} dim @param {Room} rm @param {number} i
 */
function buildParts(run, dim, rm, i) {
  const d = run.dungeon;
  const trim = d.trim ?? d.accent;
  for (const p of rm.parts) {
    const at = wpos(run, rm, p.u, p.v, p.y);
    const to = wpos(run, rm, p.u2 ?? p.u, p.v2 ?? p.v, p.y2 ?? p.y);
    /** @param {string} k */
    const elem = (k) => run.elems.set(key3(at), { room: i, k, i: p.i ?? 0, at });
    switch (p.k) {
      case "trim":
        fill(dim, at, to, trim);
        break;
      case "accent":
        fill(dim, at, to, d.accent);
        break;
      case "glow":
        place(dim, at, perm(B.glow));
        break;
      case "lantern":
        place(dim, at, perm(d.light, { hanging: false }));
        break;
      case "ladder":
        for (let y = Math.min(at.y, to.y); y <= Math.max(at.y, to.y); y++) place(dim, { x: at.x, y, z: at.z }, perm(B.ladder, { facing_direction: facingInt(rm, p.f ?? "back") }));
        break;
      case "sign":
        sign(dim, at, signDir(rm, p.f ?? "back"), signText(run, p.t ?? ""));
        break;
      case "lever":
        place(dim, at, perm("minecraft:lever", { lever_direction: "up_north_south", open_bit: false }));
        elem("lever");
        break;
      case "wool": {
        const c = (p.i ?? 0) >= 10 ? (p.i ?? 0) - 10 : p.i ?? 0;
        place(dim, at, perm(COLORS[c].wool));
        if ((p.i ?? 0) >= 10) run.elems.set(key3(at), { room: i, k: "wool", i: c, at });
        break;
      }
      case "button":
        place(dim, at, perm(B.button, { facing_direction: facingInt(rm, p.f ?? "up") }));
        elem("button");
        break;
      case "plate":
        place(dim, at, perm(B.plate));
        elem("plate");
        break;
      case "target":
        place(dim, at, perm(B.target));
        elem("target");
        break;
      case "lamp":
        place(dim, at, perm(rm.puzzle?.start?.[p.i ?? 0] ? B.lampOn : B.lampOff));
        elem("lamp");
        break;
      case "gold":
        place(dim, at, perm(B.gold));
        break;
      case "pass":
        place(dim, at, perm(B.pass));
        break;
      case "curse":
        place(dim, at, perm(B.curse));
        break;
    }
  }
  // Wool puzzle: remember where each pillar is (the wool under button k).
  if (rm.puzzle?.type === "wool") {
    const st = puzState(run, i);
    st.colors = rm.parts.filter((p) => p.k === "wool").map((p) => (p.i ?? 10) - 10);
  }
  if (rm.puzzle?.type === "lamps") puzState(run, i).state = [...(rm.puzzle.start ?? [])];
  // Decor in combat rooms.
  if (rm.decor && d.decor && d.decor.count > 0) {
    const r = rng(run.seed + i * 7919);
    const blocked = floorBlockers(rm);
    const spawnSet = new Set(rm.spawns.map((s) => `${s.u},${s.v}`));
    const spots = [];
    for (let u = -6; u <= 6; u++)
      for (let v = -6; v <= 6; v++) {
        if (Math.abs(u) <= 1 || Math.abs(v) <= 1 || blocked.has(`${u},${v}`) || spawnSet.has(`${u},${v}`)) continue;
        spots.push({ u, v });
      }
    const block = perm(d.decor.block);
    for (const s of shuffle(spots, r).slice(0, d.decor.count)) place(dim, wpos(run, rm, s.u, s.v, d.decor.floor ? 0 : 1), block);
  }
}

/** Waits until every chunk of the box can be read. @param {Vector3} o @param {number} size @param {number} seconds */
async function waitLoaded(o, size, seconds) {
  const dim = overworld();
  /** @type {number[]} */
  const xs = [];
  for (let x = 0; x < size; x += 16) xs.push(o.x + x);
  xs.push(o.x + size - 1);
  const zs = xs.map((x) => x - o.x + o.z);
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

/** Keeps the box loaded while a run builds, plays and resets. @param {number} slot @param {Vector3} o @param {number} size @param {number} top */
function addArea(slot, o, size, top) {
  const { from, to } = box(o, size, top);
  return tryCommand(overworld(), `tickingarea add ${from.x} ${from.y} ${from.z} ${to.x} ${to.y} ${to.z} realm_exp_${slot} true`);
}
/** @param {number} slot */
const removeArea = (slot) => tryCommand(overworld(), `tickingarea remove realm_exp_${slot}`);

/**
 * Finds blocks in a volume matching a filter, by halving it with containsBlock (a few dozen native
 * checks instead of reading every block). Stops after `max`. Throws when part of it isn't loaded.
 * @param {Vector3} a @param {Vector3} b @param {import("@minecraft/server").BlockFilter} filter @param {number} max @returns {Vector3[]}
 */
function findBlocks(a, b, filter, max) {
  const dim = overworld();
  /** @type {Vector3[]} */
  const out = [];
  /** @param {Vector3} p @param {Vector3} q */
  const search = (p, q) => {
    if (out.length >= max || !dim.containsBlock(new BlockVolume(p, q), filter, false)) return;
    const sx = q.x - p.x;
    const sy = q.y - p.y;
    const sz = q.z - p.z;
    if (sx === 0 && sy === 0 && sz === 0) {
      out.push(p);
      return;
    }
    if (sx >= sy && sx >= sz) {
      const m = Math.floor((p.x + q.x) / 2);
      search(p, { ...q, x: m });
      search({ ...p, x: m + 1 }, q);
    } else if (sz >= sy) {
      const m = Math.floor((p.z + q.z) / 2);
      search(p, { ...q, z: m });
      search({ ...p, z: m + 1 }, q);
    } else {
      const m = Math.floor((p.y + q.y) / 2);
      search(p, { ...q, y: m });
      search({ ...p, y: m + 1 }, q);
    }
  };
  search(a, b);
  return out;
}

/**
 * Finds one block in the box that isn't natural underground, a column at a time. Undefined: the box is clean.
 * Throws when part of the box isn't loaded.
 * @param {Vector3} o @param {number} size @param {number} top @returns {{ at: Vector3, type: string } | undefined}
 */
function findForeign(o, size, top) {
  const filter = { excludeTypes: blockLists().natural };
  const { from, to } = box(o, size, top);
  for (let x = from.x; x <= to.x; x += 32)
    for (let z = from.z; z <= to.z; z += 32) {
      const found = findBlocks({ x, y: from.y, z }, { x: Math.min(to.x, x + 31), y: to.y, z: Math.min(to.z, z + 31) }, filter, 1);
      if (!found.length) continue;
      const at = found[0];
      let type = "unknown";
      try {
        type = overworld().getBlock(at)?.typeId ?? "unknown";
      } catch {
        // keep "unknown"
      }
      return { at, type };
    }
  return undefined;
}

/** The surface above the site: where strays found in the box at reset are put. @param {Vector3} o @param {number} size @param {number} top */
function surface(o, size, top) {
  const x = o.x + Math.floor(size / 2);
  const z = o.z + Math.floor(size / 2);
  try {
    const t = overworld().getTopmostBlock({ x, z });
    if (t && t.y > o.y + top + 1) return { x: x + 0.5, y: t.y + 1, z: z + 0.5 };
  } catch {
    // unloaded
  }
  return world.getDefaultSpawnLocation();
}

/**
 * Puts the box back to solid deepslate: empties the chests, removes the dungeon's mobs and litter,
 * moves anyone else out, then fills everything the dungeon (or its players) placed, and any cave air,
 * with deepslate.
 * @param {RunRecord} rec @returns {Promise<boolean>} done
 */
async function resetBox(rec) {
  const { o, size, top } = extent(rec);
  addArea(rec.slot, o, size, top); // already there unless the world restarted without it
  if (!(await waitLoaded(o, size, 60))) {
    console.warn(`[expedition] slot ${rec.slot}: the dungeon area didn't load; it will be reset after the next restart or /realm:expedition_reset`);
    return false;
  }
  const dim = overworld();
  const { from, to } = box(o, size, top);
  try {
    for (const at of findBlocks(from, to, { includeTypes: [B.chest] }, 64)) dim.getBlock(at)?.getComponent("minecraft:inventory")?.container?.clearAll();
  } catch (e) {
    console.warn(`[expedition] chests: ${e}`);
  }
  try {
    const out = surface(o, size, top);
    for (const e of dim.getEntities({ location: from, volume: { x: size - 1, y: top + 1, z: size - 1 } })) {
      if (!e.isValid) continue;
      if (e instanceof Player) {
        const ret = returnSpot(e);
        if (ret) {
          teleportBack(e, ret);
          e.sendMessage("§eThe expedition dungeon was closed, so you were sent back to where you started.");
        } else {
          e.teleport(out, { dimension: dim });
          e.sendMessage("§eThe expedition dungeon was closed, so you were moved to the surface.");
        }
      } else if (e.hasTag(MOB_TAG) || LITTER.has(e.typeId) || DUNGEON_MOBS.has(e.typeId)) e.remove();
      else e.teleport(out, { dimension: dim });
    }
  } catch (e) {
    console.warn(`[expedition] reset entities: ${e}`);
  }
  // Blocks players placed (Nightmare runs) are filled in too: the box held only natural blocks before the run.
  const extra = (Array.isArray(rec.pt) ? rec.pt : []).filter((t) => typeof t === "string" && known(t));
  const saved = lists;
  if (extra.length && saved) lists = { natural: saved.natural, replaceable: [...new Set([...saved.replaceable, ...extra])] };
  let failed = 0;
  try {
    failed = await runSteps(fillBoxSteps(dim, o, size, top, "minecraft:deepslate"));
  } finally {
    lists = saved;
  }
  if (failed) return false;
  removeArea(rec.slot);
  return true;
}

// ---------------------------------------------------------------------------
// Saved progress, leaderboards, history
// ---------------------------------------------------------------------------

/** @param {Player} p @returns {Progress} */
function progressOf(p) {
  const raw = readPlayer(p, PROP_PROG);
  return {
    u: typeof raw?.u === "number" ? raw.u : 0,
    b: typeof raw?.b === "number" ? raw.b : -1,
    c: typeof raw?.c === "number" ? raw.c : 0,
    r: Array.isArray(raw?.r) ? raw.r : [],
  };
}
/** Highest level a player may start. @param {Player} p */
const unlockedLevel = (p) => Math.min(topLvl(), 2 + progressOf(p).u);

/** @param {Dungeon} d @returns {Record<string, Best[]>} */
function bestFor(d) {
  const b = readJson(PROP_BEST_D + d.id);
  return b && typeof b === "object" && !Array.isArray(b) ? b : {};
}
/** @param {Dungeon} d @param {Record<string, Best[]>} b */
function saveBest(d, b) {
  // Keep it under the 32 KB a dynamic property holds: trim the longest lists first.
  while (JSON.stringify(b).length > 30000) {
    const longest = Object.keys(b).sort((x, y) => b[y].length - b[x].length)[0];
    if (!longest || b[longest].length <= 1) break;
    b[longest] = b[longest].slice(0, -1);
  }
  writeJson(PROP_BEST_D + d.id, b);
}

/** Copies the fastest clears from before tiers to their dungeon's old difficulty, once. */
function migrateBest() {
  if (world.getDynamicProperty(PROP_MIGRATED) === 1) return;
  const old = readJson(PROP_BEST);
  if (old && typeof old === "object") {
    for (const d of CONFIG.dungeons) {
      const list = Array.isArray(old[d.id]) ? old[d.id] : [];
      if (!list.length) continue;
      const b = bestFor(d);
      const k = levelKey(clamp(d.difficulty - 1, 0, 2));
      b[k] = [...(b[k] ?? []), ...list].sort((x, y) => x.t - y.t).slice(0, Math.max(1, CONFIG.leaderboardSize));
      saveBest(d, b);
    }
  }
  world.setDynamicProperty(PROP_MIGRATED, 1);
}

/** @param {HistoryEntry} h */
function addHistory(h) {
  /** @type {HistoryEntry[]} */
  const list = readJson(PROP_HISTORY) ?? [];
  list.unshift(h);
  writeJson(PROP_HISTORY, list.slice(0, Math.max(1, CONFIG.historySize)));
}

// ---------------------------------------------------------------------------
// Sigils
// ---------------------------------------------------------------------------

const SIGIL_LINE = /^§8#([\w.-]{1,40})\/(\d{1,2})\/([a-z.]{0,40})$/;

/** @param {Dungeon} d @param {number} tier @param {string[]} affixes */
function makeSigil(d, tier, affixes) {
  const it = new ItemStack(CONFIG.sigilItem, 1);
  it.nameTag = "§r§5Nightmare Sigil";
  const names = affixes.map((a) => affixOf(a)).filter((a) => !!a);
  /** @type {string[]} */
  const lore = [`§r§7${d.name}, Nightmare ${tier}`];
  for (let k = 0; k < names.length; k += 2) lore.push(`§r${names.slice(k, k + 2).map((a) => `${a?.color}${a?.name}`).join("§7, ")}`);
  if (!names.length) lore.push("§r§7No affixes");
  lore.push("§r§8Use it to open the run");
  lore.push(`§8#${d.id}/${tier}/${names.map((a) => a?.code).join(".")}`);
  it.setLore(lore);
  return it;
}

/** The run a sigil opens, or undefined if this item isn't one. @param {ItemStack | undefined} it */
function readSigil(it) {
  if (!it || it.typeId !== CONFIG.sigilItem) return undefined;
  let lore;
  try {
    lore = it.getLore();
  } catch {
    return undefined;
  }
  for (const line of lore) {
    const m = SIGIL_LINE.exec(line);
    if (!m) continue;
    const d = dungeonById(m[1]);
    const tier = Number(m[2]);
    if (!d || tier < 1 || tier > 20) return undefined;
    const affixes = m[3]
      .split(".")
      .filter((c) => c)
      .map((c) => AFFIXES.find((a) => a.code === c)?.id)
      .filter((a) => typeof a === "string");
    return { d, tier, level: tier + 2, affixes: /** @type {string[]} */ (affixes), line };
  }
  return undefined;
}

/** Sigils in a player's inventory. @param {Player} p */
function sigilsOf(p) {
  /** @type {{ slot: number, sig: NonNullable<ReturnType<typeof readSigil>>, amount: number }[]} */
  const out = [];
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return out;
  for (let slot = 0; slot < inv.size; slot++) {
    const it = inv.getItem(slot);
    const sig = readSigil(it);
    if (sig && it) out.push({ slot, sig, amount: it.amount });
  }
  return out;
}

/** Takes one sigil with this data line from the player. @param {Player} p @param {string} line */
function useSigil(p, line) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return false;
  for (let slot = 0; slot < inv.size; slot++) {
    const it = inv.getItem(slot);
    if (readSigil(it)?.line !== line || !it) continue;
    if (it.amount > 1) {
      it.amount -= 1;
      inv.setItem(slot, it);
    } else inv.setItem(slot, undefined);
    return true;
  }
  return false;
}

/** A random sigil a bit above (or at) a run's level. @param {Run} run @param {Vector3} at @param {string} why */
function dropSigil(run, at, why) {
  const t = clamp(tierOf(run.level) + (Math.random() < 0.5 ? 1 : 0) - (Math.random() < 0.15 ? 1 : 0), 1, maxTier());
  const d = CONFIG.dungeons[Math.floor(Math.random() * CONFIG.dungeons.length)];
  const affixes = rollAffixes(t + 2, Math.random);
  try {
    overworld().spawnItem(makeSigil(d, t, affixes), at);
    tell(run, `§5${why} dropped a Nightmare Sigil: ${d.name}, Nightmare ${t}!`);
    sound(run, "random.levelup");
  } catch (e) {
    console.warn(`[expedition] sigil: ${e}`);
  }
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
/** Shrine effects given to players, taken away when they leave the run. @type {Map<string, string[]>} */
const buffs = new Map();

/** @returns {{ x: number, z: number, by: string, at: number } | undefined} */
function site() {
  const s = readJson(PROP_SITE);
  return s && typeof s.x === "number" && typeof s.z === "number" ? s : undefined;
}

/** @param {Run} run @returns {RunRecord} */
const recordOf = (run) => ({
  id: run.id,
  slot: run.slot,
  dungeon: run.dungeon.id,
  seed: run.seed,
  x: run.o.x,
  y: run.o.y,
  z: run.o.z,
  leader: run.leaderName,
  phase: run.phase,
  l: run.level,
  g: run.lay.grid,
  c: CELL,
  h: run.top,
  pt: [...run.placedTypes],
});
/** @param {Run} run */
const saveRun = (run) => writeJson(PROP_RUN + run.slot, recordOf(run));

/** @param {string} playerId */
function runOf(playerId) {
  for (const run of runs.values()) if (run.members.has(playerId)) return run;
  return undefined;
}

/** "Ann's party, Crypt N5, 6:12" @param {Run} run */
function statusLine(run) {
  const t = run.phase === "active" || run.phase === "finishing" ? `, ${clock(run.phase === "finishing" ? run.clearMs : Date.now() - run.started)}` : "";
  const what = run.phase === "gathering" || run.phase === "building" ? ", getting ready" : run.phase === "resetting" ? ", closing up" : "";
  return `${run.leaderName}'s party, ${run.dungeon.name} ${levelShort(run.level)}${t}${what}`;
}

/** @param {Run} run @param {string} text */
function tell(run, text) {
  for (const id of run.members.keys()) online(id)?.sendMessage(text);
}

/** @param {Run} run @param {string} name @param {number} [pitch] */
function sound(run, name, pitch = 1) {
  for (const id of run.members.keys()) online(id)?.playSound(name, { volume: 0.8, pitch });
}

/** Members online and in the dungeon right now. @param {Run} run */
function present(run) {
  /** @type {Player[]} */
  const out = [];
  for (const id of run.members.keys()) {
    const p = online(id);
    if (p && p.dimension.id === OVERWORLD && inBox(run.o, run.size, run.top, p.location, 1)) out.push(p);
  }
  return out;
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
 * @template {ActionFormData | MessageFormData | ModalFormData} F
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

/** Asks a party member to come along; no answer in time is a no. @param {Player} p @param {string} leader @param {Dungeon} d @param {number} L @param {string[]} affixes */
async function ask(p, leader, d, L, affixes) {
  const ticks = Math.max(5, CONFIG.confirmSeconds) * 20;
  const deadline = system.currentTick + ticks;
  const form = new MessageFormData()
    .title("§lExpedition")
    .body(`${leader} is starting an expedition: §e${dungeonLabel(d, L)}§r.${affixes.length ? `\nAffixes: ${affixNames(affixes)}` : ""}\n\nYou'll be taken to a dungeon deep underground and brought back when it ends. Join?`)
    .button1("Join")
    .button2("Not this time");
  let answered = false;
  const answer = show(p, form, deadline).then((res) => {
    answered = true;
    return !!res && !res.canceled && res.selection === 0;
  });
  const timeout = sleep(ticks).then(() => {
    try {
      if (!answered && p.isValid) uiManager.closeAllForms(p); // only our question, still open
    } catch {
      // gone
    }
    return false;
  });
  return Promise.race([answer, timeout]);
}

/** Why a new run can't start right now, or "". @param {Player} leader */
function cantStart(leader) {
  if (get("enabled") !== true) return "§cNew expeditions are disabled on this realm right now.";
  if (!site()) return "§cThe operators haven't picked an expedition site yet (/realm:expedition_site).";
  if (runOf(leader.id)) return "§cYou're already on an expedition.";
  if (freeSlot() === undefined) return `§eAn expedition is in progress (${[...runs.values()].map(statusLine).join("; ")}). Try again when it's over.`;
  return "";
}

/**
 * Starts a run the leader confirmed: asks the party, then builds the dungeon.
 * @param {Player} leader @param {Dungeon} d @param {number} L @param {string[]} affixes @param {string} [sigilLine] the sigil to use up
 */
async function start(leader, d, L, affixes, sigilLine) {
  const why = cantStart(leader);
  if (why) return leader.sendMessage(why);
  if (sigilLine && !useSigil(leader, sigilLine)) return leader.sendMessage("§cThat sigil isn't in your inventory any more.");
  if (!sigilLine && L > unlockedLevel(leader)) return leader.sendMessage(`§c${levelName(L)} isn't unlocked for you yet.`);
  const slot = freeSlot();
  const now = site();
  if (slot === undefined || !now) return;
  const idRaw = world.getDynamicProperty(PROP_NEXT);
  const id = typeof idRaw === "number" ? idRaw : 1;
  world.setDynamicProperty(PROP_NEXT, id + 1);
  const seed = Math.floor(Math.random() * 2147483647);
  const lay = layout(seed, L);
  const s = scaleFor(L);
  const size = lay.grid * CELL;
  const r = rng(seed ^ 0x5bd1e995);
  const others = partyNear(leader);
  /** @type {Run} */
  const run = {
    id,
    slot,
    dungeon: d,
    level: L,
    s,
    seed,
    affixes: [...affixes],
    o: originFor(now, slot, size),
    lay,
    size,
    top: lay.height,
    leaderName: leader.name,
    leaderId: leader.id,
    members: new Map([[leader.id, { name: leader.name, since: 0, away: 0 }]]),
    phase: "gathering",
    started: 0,
    deadline: 0,
    limitMin: timeLimit(get("timeLimitMinutes"), lay.n, L),
    room: 1,
    roomActive: false,
    wave: 0,
    waves: s.waves,
    mobs: [],
    extra: [],
    nextWaveAt: 0,
    awaitUntil: 0,
    bossGone: 0,
    bossHalf: false,
    nextAddsAt: 0,
    finishAt: 0,
    clearMs: 0,
    checked: false,
    puz: new Map(),
    elems: new Map(),
    placed: new Set(),
    placedTypes: new Set(),
    breakable: new Set(d.decor?.breakable ? [d.decor.block] : []),
    shrine: { bless: BLESSINGS[Math.floor(r() * BLESSINGS.length)], curse: curseAffix(affixes, r) },
    cursed: false,
    fortune: false,
    sigil: !!sigilLine,
    hazards: [],
    fires: [],
    timers: {},
    trapNext: 0,
  };
  runs.set(slot, run);
  if (!sigilLine) {
    // The affixes shown for this level are used up: next time there's a new roll.
    const rolls = readPlayer(leader, PROP_ROLLS) ?? {};
    delete rolls[levelKey(L)];
    writePlayer(leader, PROP_ROLLS, rolls);
  }
  try {
    const invite = others.filter((p) => p.isValid && !runOf(p.id));
    if (invite.length) leader.sendMessage(`§7Asking ${invite.map((p) => p.name).join(", ")}...`);
    const answers = await Promise.all(invite.map((p) => ask(p, leader.name, d, L, affixes)));
    if (runs.get(slot) !== run || run.phase !== "gathering") return; // ended meanwhile (an operator's reset)
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

/**
 * Before the box is sealed: players (someone mining in a cave there), dropped items and pets in it are moved to
 * the surface, so nobody and nothing of theirs is shut in the rock. @param {Run} run
 */
function clearBox(run) {
  try {
    const dim = overworld();
    const { from } = box(run.o, run.size, run.top);
    const out = surface(run.o, run.size, run.top);
    for (const e of dim.getEntities({ location: from, volume: { x: run.size - 1, y: run.top + 1, z: run.size - 1 } })) {
      if (!e.isValid) continue;
      const keep = e instanceof Player || LITTER.has(e.typeId) || !!e.nameTag || !!e.getComponent("minecraft:is_tamed");
      if (!keep) continue; // wild cave mobs are left to the rock, as any cave-in would
      e.teleport(out, { dimension: dim });
      if (e instanceof Player) e.sendMessage("§eAn expedition dungeon is being built where you were, so you were moved to the surface.");
    }
  } catch (e) {
    console.warn(`[expedition] clear box: ${e}`);
  }
}

/** Ticking area, checks, building, then everyone in. @param {Run} run */
async function prepare(run) {
  run.phase = "building";
  // The record is saved only once the box is checked (below): a restart before then has nothing to fill in.
  tell(run, `§7Preparing the ${dungeonLabel(run.dungeon, run.level)}: ${run.lay.n} rooms...`);
  if (!addArea(run.slot, run.o, run.size, run.top)) {
    // Already there after a reset cut short, or the world has its 10 ticking areas: the load check decides.
    console.warn(`[expedition] tickingarea add for slot ${run.slot} failed`);
  }
  const loaded = await waitLoaded(run.o, run.size, 30);
  if (run.phase !== "building") return; // ended meanwhile: endRun cleaned up
  if (!loaded) {
    tell(run, "§cThe dungeon area couldn't be loaded (the world may already have 10 ticking areas). Ask an operator to check /tickingarea list.");
    removeArea(run.slot);
    runs.delete(run.slot);
    return;
  }
  let foreign;
  try {
    foreign = findForeign(run.o, run.size, run.top);
  } catch (e) {
    foreign = { at: run.o, type: `unloaded (${e})` };
  }
  if (foreign) {
    const where = `${foreign.at.x}, ${foreign.at.y}, ${foreign.at.z}`;
    tell(run, "§cThe expedition site isn't safe to build in right now, so the run was called off. The operators have been told.");
    for (const p of world.getAllPlayers()) if (isOp(p)) p.sendMessage(`§c[Expeditions] Slot ${run.slot + 1}: found ${prettyId(foreign.type)} at ${where} in the dungeon area. Dungeons only replace natural underground blocks: pick another site with /realm:expedition_site.`);
    console.warn(`[expedition] slot ${run.slot}: ${foreign.type} at ${where}`);
    removeArea(run.slot);
    runs.delete(run.slot);
    return;
  }
  run.checked = true;
  saveRun(run);
  clearBox(run);
  const t0 = Date.now();
  const failed = await runSteps(buildSteps(run), () => run.phase === "building");
  if (run.phase !== "building") return; // ended while building: its reset fills the box in
  console.info(`[expedition] built ${run.dungeon.id} ${levelKey(run.level)} (${run.lay.n} rooms, ${run.lay.grid}x${run.lay.grid}, ${run.top} high) in ${Date.now() - t0} ms`);
  if (failed) {
    tell(run, "§cThe dungeon couldn't be built. Try again in a moment.");
    await endRun(run, "");
    return;
  }
  // Everyone still here goes in.
  const entry = run.lay.rooms[0];
  const spots = [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  let k = 0;
  for (const [pid, m] of [...run.members]) {
    const p = online(pid);
    if (!p || runOf(pid) !== run) {
      run.members.delete(pid);
      continue;
    }
    const [du, dv] = spots[k++ % spots.length];
    const loc = p.location;
    p.setDynamicProperty(PROP_RETURN, JSON.stringify({ d: p.dimension.id, x: loc.x, y: loc.y, z: loc.z, run: run.id }));
    m.since = system.currentTick + 20;
    fade(p);
    const to = wmid(run, entry, { u: du, v: dv, y: 1 });
    const look = wmid(run, entry, { u: 0, v: 6, y: 2 });
    system.runTimeout(() => {
      try {
        if (p.isValid) p.teleport(to, { dimension: overworld(), facingLocation: look });
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
  run.deadline = run.started + run.limitMin * 60000;
  saveRun(run);
  system.runTimeout(() => {
    for (const id of run.members.keys()) {
      const p = online(id);
      if (!p) continue;
      p.onScreenDisplay.setTitle(`§l${run.dungeon.name}`, { subtitle: `§7${levelName(run.level)} - the clock is running`, fadeInDuration: 10, stayDuration: 50, fadeOutDuration: 20 });
    }
    tell(run, `§eThe ${dungeonLabel(run.dungeon, run.level)}: clear each room to open the bars ahead. ${run.lay.n} rooms, ${run.limitMin} minutes. Leave with /realm:expedition_leave.`);
    if (run.affixes.length) tell(run, `§7Affixes: ${affixNames(run.affixes)}`);
    if (run.s.build && get("allowBuilding") === true) tell(run, "§7You may place blocks in this dungeon (they're removed when it closes).");
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

/** Where the player started their expedition, or undefined. @param {Player} p @returns {any} */
function returnSpot(p) {
  try {
    const raw = p.getDynamicProperty(PROP_RETURN);
    return typeof raw === "string" ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** Takes away the shrine's effects. @param {Player} p */
function dropBuffs(p) {
  const list = buffs.get(p.id);
  if (!list) return;
  buffs.delete(p.id);
  for (const e of list) {
    try {
      p.removeEffect(e);
    } catch {
      // gone
    }
  }
}

/**
 * Teleports a player back to where they started (or the world spawn) right now. The spot is forgotten only once
 * the teleport worked, so a failed one (a dead player, say) is tried again when they next spawn.
 * @param {Player} p @param {any} ret
 */
function teleportBack(p, ret) {
  let dim;
  try {
    dim = ret && typeof ret.d === "string" ? world.getDimension(ret.d) : undefined;
  } catch {
    dim = undefined;
  }
  if (dim && typeof ret.x === "number" && typeof ret.y === "number" && typeof ret.z === "number") p.teleport({ x: ret.x, y: ret.y, z: ret.z }, { dimension: dim });
  else p.teleport(world.getDefaultSpawnLocation(), { dimension: overworld() });
  p.setDynamicProperty(PROP_RETURN, undefined);
  dropBuffs(p);
  giveBack(p);
}

/**
 * Sends a player back to where they started the expedition (or the world spawn), and forgets the spot.
 * @param {Player} p @param {boolean} [withFade]
 */
function sendBack(p, withFade = true) {
  const ret = returnSpot(p);
  if (withFade) fade(p);
  system.runTimeout(
    () => {
      try {
        if (p.isValid) teleportBack(p, ret);
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

/** Remembers a run that ended without a clear. @param {Run} run @param {string[]} names */
function recordFail(run, names) {
  const h = { d: run.dungeon.id, l: run.level, ok: false, t: Date.now() - run.started, n: names.join(", ") || run.leaderName, at: Date.now(), a: run.affixes };
  addHistory(h);
  for (const id of run.members.keys()) {
    const p = online(id);
    if (!p) continue;
    const prog = progressOf(p);
    prog.r = [h, ...prog.r].slice(0, Math.max(1, CONFIG.historySize));
    writePlayer(p, PROP_PROG, prog);
  }
}

/** Ends a run: everyone out, then the box is reset and the slot freed. @param {Run} run @param {string} why */
async function endRun(run, why) {
  if (run.phase === "resetting") return;
  const wasBuilding = run.phase === "building";
  const wasActive = run.phase === "active";
  const wasBuilt = run.checked; // only a box found clean was ever touched, so only that one is filled in
  if (wasActive) recordFail(run, [...run.members.values()].map((m) => m.name));
  run.phase = "resetting";
  if (why) tell(run, why);
  for (const id of [...run.members.keys()]) {
    const p = online(id);
    if (p && returnSpot(p)) sendBack(p); // members still getting ready were never taken anywhere
  }
  run.members.clear();
  for (const m of [...run.mobs, ...run.extra]) if (m.isValid) m.remove();
  if (run.bossId) world.getEntity(run.bossId)?.remove();
  if (!wasBuilt) {
    if (wasBuilding) removeArea(run.slot);
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

/** Opens a room's bars (or does nothing for a door without bars). @param {Run} run @param {number} i */
function openDoor(run, i) {
  try {
    const rm = run.lay.rooms[i];
    const door = rm.doors.find((dd) => dd.to === i + 1);
    if (!door) return;
    const p = doorPlane(run, i, door);
    overworld().fillBlocks(new BlockVolume(p.from, p.to), "minecraft:air", { blockFilter: { includeTypes: [run.dungeon.door] } });
    overworld().playSound("random.door_open", p.from, { volume: 1, pitch: 0.6 });
  } catch (e) {
    console.warn(`[expedition] door: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Mobs
// ---------------------------------------------------------------------------

/** A mob for this level from the dungeon's pool. @param {Dungeon} d @param {number} L */
function pickMob(d, L) {
  const pool = d.mobs.map((m) => (typeof m === "string" ? { id: m, from: 0, weight: 1 } : { id: m.id, from: m.from ?? 0, weight: m.weight ?? 1 })).filter((m) => m.from <= L && m.weight > 0);
  if (!pool.length) return typeof d.mobs[0] === "string" ? d.mobs[0] : d.mobs[0]?.id ?? "minecraft:zombie";
  const total = pool.reduce((n, m) => n + m.weight, 0);
  let x = Math.random() * total;
  for (const m of pool) {
    x -= m.weight;
    if (x < 0) return m.id;
  }
  return pool[pool.length - 1].id;
}

/** Live dungeon mobs of a run (waves, adds, flyers, the boss). @param {Run} run */
function aliveCount(run) {
  let n = 0;
  for (const m of [...run.mobs, ...run.extra]) if (alive(m)) n++;
  return n;
}

/**
 * Gives a mob its level's strength: effects, armor, maybe an elite name.
 * @param {Run} run @param {Entity} mob @param {{ elite?: boolean, champion?: boolean }} [opts]
 */
function buff(run, mob, opts = {}) {
  const s = run.s;
  const has = (/** @type {string} */ a) => run.affixes.includes(a);
  let hb = s.healthBoost + (opts.elite ? 2 : 0) + (opts.champion ? 5 : 0) + (has("juggernaut") ? 3 : 0);
  let res = s.resistance + (has("bulwark") ? 1 : 0) + (opts.champion ? 1 : 0);
  if (has("bulwark") && res < 0) res = 0;
  const str = s.strength + (opts.elite || opts.champion ? 1 : 0);
  let spd = s.speed + (has("frenzied") ? 1 : 0);
  if (has("frenzied") && spd < 0) spd = 0;
  /** @param {string} e @param {number} amp */
  const eff = (e, amp) => {
    if (amp < 0) return;
    try {
      mob.addEffect(e, LONG, { amplifier: Math.min(amp, e === "resistance" ? 2 : 60), showParticles: false });
    } catch {
      // some mobs can't take some effects
    }
  };
  eff("health_boost", hb);
  eff("resistance", res);
  eff("strength", str);
  eff("speed", spd);
  eff("fire_resistance", 0);
  if (hb >= 0)
    system.runTimeout(() => {
      try {
        if (mob.isValid) mob.getComponent("minecraft:health")?.resetToMaxValue();
      } catch {
        // gone
      }
    }, 2);
  if (s.armor > 0 && ARMORED.has(mob.typeId) && (opts.elite || opts.champion || Math.random() < s.armorChance)) {
    const tier = ARMOR[Math.min(4, s.armor + (opts.champion ? 1 : 0))];
    for (const [slot, piece] of [["head", "helmet"], ["chest", "chestplate"], ["legs", "leggings"], ["feet", "boots"]]) {
      if (!opts.elite && !opts.champion && Math.random() < 0.4) continue;
      try {
        mob.runCommand(`replaceitem entity @s slot.armor.${slot} 0 ${tier}_${piece}`);
      } catch {
        // can't wear it
      }
    }
  }
  if (opts.elite && !opts.champion) mob.nameTag = `§eElite ${prettyId(mob.typeId)}`;
}

/**
 * Spawns a dungeon mob for a run.
 * @param {Run} run @param {string} typeId @param {Vector3} at @param {{ elite?: boolean, champion?: boolean, list?: "mobs" | "extra" }} [opts]
 */
function spawnMob(run, typeId, at, opts = {}) {
  try {
    const mob = overworld().spawnEntity(/** @type {any} */ (typeId), at);
    mob.addTag(MOB_TAG);
    mob.addTag(`realm:exp_run:${run.id}`);
    if (opts.champion) {
      mob.addTag(CHAMP_TAG);
      mob.nameTag = `§5Champion ${prettyId(typeId)}`;
    }
    buff(run, mob, opts);
    (opts.list === "extra" ? run.extra : run.mobs).push(mob);
    return mob;
  } catch (e) {
    console.warn(`[expedition] spawn ${typeId}: ${e}`);
    return undefined;
  }
}

/**
 * A champion: from the Champions pack when it's installed and knows the mob (it answers within a few ticks), otherwise our own.
 * @param {Run} run @param {Vector3} at @param {"mobs" | "extra"} list
 */
function spawnChampion(run, at, list) {
  const d = run.dungeon;
  const want = pickMob(d, run.level);
  const tag = `realm:exp_ch_${run.id}`;
  if (get("useChampionsPack") === true && ELITE_MOBS.has(want)) {
    send("realm:champion_spawn", { dim: OVERWORLD, x: at.x, y: at.y, z: at.z, mob: want, tag });
    run.awaitUntil = system.currentTick + 6;
    system.runTimeout(() => {
      try {
        if (run.phase !== "active") return;
        const found = overworld().getEntities({ tags: [tag], location: at, maxDistance: 8 }).filter((e) => !e.hasTag(MOB_TAG));
        if (!found.length) {
          spawnMob(run, want, at, { champion: true, list });
          return;
        }
        for (const e of found) {
          e.addTag(MOB_TAG);
          e.addTag(`realm:exp_run:${run.id}`);
          buff(run, e, { elite: true });
          (list === "extra" ? run.extra : run.mobs).push(e);
        }
      } catch (e) {
        console.warn(`[expedition] champion: ${e}`);
      }
    }, 3);
    return;
  }
  spawnMob(run, want, at, { champion: true, list });
}

/** A free spawn spot in room i: floor or balcony. @param {Run} run @param {number} i */
function spawnSpot(run, i) {
  const rm = run.lay.rooms[i];
  const list = rm.spawns.length ? rm.spawns : [{ u: 4, v: 4, y: 1 }];
  return wmid(run, rm, list[Math.floor(Math.random() * list.length)]);
}

/** @param {Run} run */
function spawnWave(run) {
  const d = run.dungeon;
  const s = run.s;
  const rm = run.lay.rooms[run.room];
  const eliteRoom = rm.kind === "elite";
  let count = s.mobs + Math.floor(Math.random() * 2) + Math.floor((run.members.size - 1) / 2);
  if (run.affixes.includes("swarming")) count = Math.ceil(count * 1.5);
  if (eliteRoom) count = Math.max(2, count - 2);
  const room = Math.max(0, get("mobCap") - aliveCount(run));
  count = Math.min(count, room);
  run.mobs = [];
  const elites = Math.min(count, s.elites + (eliteRoom ? 1 : 0));
  const flyers = rm.fly.length && d.flyers?.length ? Math.floor(count / 4) : 0;
  for (let k = 0; k < count; k++) {
    if (k < flyers) {
      const at = wmid(run, rm, rm.fly[k % rm.fly.length]);
      spawnMob(run, /** @type {string[]} */ (d.flyers)[Math.floor(Math.random() * (d.flyers?.length ?? 1))], at);
    } else spawnMob(run, pickMob(d, run.level), spawnSpot(run, run.room), { elite: k >= count - elites });
  }
  const champ = run.affixes.includes("champions") || eliteRoom || Math.random() < s.champChance;
  if (champ && aliveCount(run) < get("mobCap") + 1) spawnChampion(run, spawnSpot(run, run.room), "mobs");
  sound(run, "mob.zombie.say");
  tell(run, `§cWave ${run.wave + 1} of ${run.waves}!${champ ? " §5A champion leads it." : ""}`);
}

/** @param {Run} run */
function spawnBoss(run) {
  const d = run.dungeon;
  const rm = run.lay.rooms[run.room];
  const c = wmid(run, rm, { u: 0, v: 2, y: 1 });
  try {
    const boss = overworld().spawnEntity(/** @type {any} */ (d.boss.mob), c);
    boss.nameTag = `§c${d.boss.name}`;
    boss.addTag(MOB_TAG);
    boss.addTag(`realm:exp_run:${run.id}`);
    boss.addTag(`realm:bounty:exp_${run.id}`);
    const L = run.level;
    const t = run.s.t;
    const extra = d.boss.health * run.s.bossHealth * (1 + 0.5 * (run.members.size - 1)) * (run.affixes.includes("juggernaut") ? 1.3 : 1);
    boss.addEffect("health_boost", LONG, { amplifier: Math.max(0, Math.min(120, Math.ceil(extra / 4) - 1)), showParticles: false });
    const str = t >= 15 ? 3 : t >= 8 ? 2 : L >= 2 ? L - 1 : L >= 1 ? 0 : -1;
    if (str >= 0) boss.addEffect("strength", LONG, { amplifier: str, showParticles: false });
    const res = Math.min(2, (t >= 15 ? 1 : L >= 2 ? 0 : -1) + (run.affixes.includes("bulwark") ? 1 : 0));
    if (res >= 0) boss.addEffect("resistance", LONG, { amplifier: res, showParticles: false });
    if (t >= 10 || run.affixes.includes("frenzied")) boss.addEffect("speed", LONG, { amplifier: 0, showParticles: false });
    boss.addEffect("fire_resistance", LONG, { amplifier: 0, showParticles: false });
    system.runTimeout(() => {
      try {
        if (boss.isValid) boss.getComponent("minecraft:health")?.resetToMaxValue();
      } catch {
        // gone
      }
    }, 2);
    run.bossId = boss.id;
    run.bossHalf = false;
    run.nextAddsAt = system.currentTick + 400;
  } catch (e) {
    console.warn(`[expedition] boss: ${e}`);
    finish(run); // no boss to fight: don't strand the party
    return;
  }
  for (const id of run.members.keys()) online(id)?.onScreenDisplay.setTitle(`§c${d.boss.name}`, { subtitle: `§7${rm.h >= 14 ? "rules the heights" : "guards the treasure"}`, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 15 });
  sound(run, "mob.wither.spawn");
}

/** The boss calls adds (onto balconies when there are any). @param {Run} run @param {number} count */
function bossAdds(run, count) {
  const d = run.dungeon;
  const adds = d.boss.adds?.length ? d.boss.adds : [pickMob(d, run.level)];
  const room = Math.max(0, get("mobCap") - aliveCount(run));
  for (let k = 0; k < Math.min(count, room); k++) spawnMob(run, adds[Math.floor(Math.random() * adds.length)], spawnSpot(run, run.room), { list: "extra" });
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

/** The boss fell: clock, leaderboard, progress, rewards, treasure. @param {Run} run */
function finish(run) {
  if (run.phase !== "active") return;
  run.phase = "finishing";
  run.clearMs = Date.now() - run.started;
  run.finishAt = system.currentTick + get("exitSeconds") * 20;
  for (const m of [...run.mobs, ...run.extra]) if (m.isValid) m.remove();
  run.mobs = [];
  run.extra = [];
  run.hazards = [];
  const n = run.lay.n;
  openDoor(run, n - 2);
  fillTreasure(run);
  const d = run.dungeon;
  const L = run.level;
  const s = run.s;
  const names = [...run.members.values()].map((m) => m.name);
  // Leaderboard for this dungeon and level
  const best = bestFor(d);
  const k = levelKey(L);
  const list = Array.isArray(best[k]) ? best[k] : [];
  /** @type {Best} */
  const entry = { t: run.clearMs, n: names.join(", ") || run.leaderName, at: Date.now() };
  if (run.affixes.length) entry.a = run.affixes;
  list.push(entry);
  list.sort((a, b) => a.t - b.t);
  best[k] = list.slice(0, Math.max(1, CONFIG.leaderboardSize));
  saveBest(d, best);
  const rank = best[k].indexOf(entry);
  const record = rank === 0 ? " §6A new record!" : rank > 0 ? ` §7#${rank + 1} on the leaderboard.` : "";
  /** @type {HistoryEntry} */
  const h = { d: d.id, l: L, ok: true, t: run.clearMs, n: entry.n, at: Date.now(), a: run.affixes };
  addHistory(h);
  /** @type {TierEntry[]} */
  let tiers = readJson(PROP_TIERS) ?? [];
  const blessed = run.affixes.includes("blessed");
  const crowns = Math.round(d.crowns * s.crowns * (blessed ? 1.25 : 1) * (run.cursed ? 1.25 : 1));
  for (const [id] of run.members) {
    const p = online(id);
    if (!p) continue;
    p.onScreenDisplay.setTitle("§6Expedition complete", { subtitle: `§f${d.name} ${levelName(L)} cleared in ${clock(run.clearMs)}`, fadeInDuration: 10, stayDuration: 80, fadeOutDuration: 20 });
    p.playSound("random.totem", { volume: 0.6 });
    payCrowns(p, crowns, `Expedition: ${d.name} ${levelShort(L)}`);
    send("realm:quest_done", { player: p.id, pack: "expedition_bp", id: `expedition_${d.id}`, label: `Expedition: ${d.name} cleared`, kind: "expedition", guild: "wardens" });
    if (CONFIG.rep > 0) send("realm:rep_add", { player: p.id, guild: "wardens", amount: Math.round(CONFIG.rep * (1 + 0.1 * s.t)), reason: `Expedition: ${d.name}` });
    send("realm:journal", { player: p.id, page: "places", entry: `expedition_${d.id}`, label: `Expedition: ${d.name}` });
    if (CONFIG.relics.length && Math.random() < Math.min(0.5, get("relicChance") + s.relic)) send("realm:relic_give", { player: p.id, relic: CONFIG.relics[Math.floor(Math.random() * CONFIG.relics.length)] });
    // Progress: clearing Hard unlocks Nightmare 1, clearing tier N unlocks N + 1.
    const prog = progressOf(p);
    prog.c++;
    prog.b = Math.max(prog.b, L);
    prog.r = [h, ...prog.r].slice(0, Math.max(1, CONFIG.historySize));
    if (L >= 2) {
      const next = Math.min(maxTier(), s.t + 1);
      if (next > prog.u) {
        prog.u = next;
        p.sendMessage(`§d${levelName(next + 2)} is unlocked! Pick it in /realm:expedition.`);
      }
    }
    writePlayer(p, PROP_PROG, prog);
    const mine = tiers.find((e) => e.id === p.id);
    if (!mine) tiers.push({ id: p.id, n: p.name, l: L, d: d.id, at: Date.now() });
    else if (L > mine.l) Object.assign(mine, { n: p.name, l: L, d: d.id, at: Date.now() });
  }
  tiers = tiers.sort((a, b) => b.l - a.l || a.at - b.at).slice(0, Math.max(1, CONFIG.tierBoardSize));
  writeJson(PROP_TIERS, tiers);
  tell(run, `§a${d.name} cleared in ${clock(run.clearMs)}!${record} §eThe treasure room is open: you have ${get("exitSeconds")} seconds before you're taken back.`);
  world.sendMessage(`§6${names.join(", ")} cleared the ${dungeonLabel(d, L)} in ${clock(run.clearMs)}.`);
  saveRun(run);
}

/** How much more treasure this run gives. @param {Run} run */
function lootScale(run) {
  return (1 + 0.25 * (run.members.size - 1)) * run.s.loot * (run.affixes.includes("blessed") ? 1.5 : 1) * (run.cursed ? 1.4 : 1) * (run.fortune ? 1.25 : 1);
}

/**
 * Puts loot into chests (spilling into the next when one is full).
 * @param {Run} run @param {Vector3[]} chests @param {{ item: string, min: number, max: number, chance: number }[]} loot @param {number} scale
 */
function stock(run, chests, loot, scale) {
  const invs = chests.map((at) => overworld().getBlock(at)?.getComponent("minecraft:inventory")?.container).filter((c) => !!c);
  if (!invs.length) return;
  let ci = 0;
  for (const l of loot) {
    if (Math.random() >= Math.min(1, l.chance * (scale > 1 ? 1 + (scale - 1) * 0.3 : 1))) continue;
    let left = Math.max(1, Math.round((l.min + Math.floor(Math.random() * (Math.max(l.min, l.max) - l.min + 1))) * scale));
    try {
      const max = new ItemStack(l.item, 1).maxAmount;
      while (left > 0 && ci < invs.length) {
        const stack = new ItemStack(l.item, Math.min(max, left));
        left -= stack.amount;
        const rest = invs[ci]?.addItem(stack);
        if (rest) {
          ci++;
          left += rest.amount;
        }
      }
    } catch (e) {
      console.warn(`[expedition] loot ${l.item}: ${e}`);
    }
  }
}

/** @param {Run} run */
function fillTreasure(run) {
  try {
    const vault = run.lay.rooms[run.lay.n - 1];
    const chests = vault.chests.map((c) => wpos(run, vault, c.u, c.v, c.y));
    const extra = CONFIG.tierLoot.filter((l) => l.from <= run.s.t);
    stock(run, chests, [...run.dungeon.loot, ...extra], lootScale(run));
  } catch (e) {
    console.warn(`[expedition] chest: ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Puzzles
// ---------------------------------------------------------------------------

/** @param {Run} run @param {number} i @returns {PuzState} */
function puzState(run, i) {
  let st = run.puz.get(i);
  if (!st) {
    st = { active: false, solved: false, progress: 0, busyUntil: 0, startedAt: 0, hit: new Set(), state: [], colors: [], lockUntil: 0, gave: false };
    run.puz.set(i, st);
  }
  return st;
}

/** Elements of a room of one kind, in index order. @param {Run} run @param {number} i @param {string} k */
const elemsOf = (run, i, k) => [...run.elems.values()].filter((e) => e.room === i && e.k === k).sort((a, b) => a.i - b.i);

/** The world spot above an element, for particles. @param {Elem} e @param {number} [dy] */
const above = (e, dy = 1.2) => ({ x: e.at.x + 0.5, y: e.at.y + dy, z: e.at.z + 0.5 });

/** What a puzzle room asks for, in chat. @param {Run} run @param {number} i */
function puzzleIntro(run, i) {
  const pz = run.lay.rooms[i].puzzle;
  if (!pz) return;
  const strip = (/** @type {string} */ s) => s.replace(/§./g, "").replace(/\n/g, " ");
  switch (pz.type) {
    case "levers":
      return tell(run, `§eA lever puzzle! Set the four levers (on colored wool) as the signs say: ${(pz.clues ?? []).map(strip).join("; ")}.`);
    case "simon":
      tell(run, `§eA memory puzzle! Watch the ${pz.seq?.length} flashes over the colored wool, then press the buttons in the same order. The gold button shows them again.`);
      return playSimon(run, i, 30);
    case "plates":
      tell(run, "§eA safe-path puzzle! Watch which pressure plates flash, then step on them in that order, from the near row to the far row. A wrong plate starts you over. The gold button shows the path again.");
      return showPath(run, i, 30);
    case "targets": {
      tell(run, `§eTarget practice! Hit all ${pz.count} target blocks in the walls with arrows, snowballs or a trident.`);
      giveSnowballs(run, i);
      return;
    }
    case "lamps":
      return tell(run, "§eLights out! Light all nine lamps. Each button flips its own lamp and the ones right next to it.");
    case "wool":
      return tell(run, "§eA color riddle! Each button changes the color of the wool under it. Make each pillar match its sign.");
    case "parkour":
      return tell(run, "§eA climbing puzzle! Jump up the ledges along the walls and press the button at the top.");
    case "rush":
      return tell(run, `§eA button rush! Press all ${pz.count} buttons on the walls within ${pz.seconds} seconds of the first.`);
    case "riddle":
      return tell(run, `§eA riddle! ${pz.q} Press the button by the right answer: ${(pz.options ?? []).join(", ")}. A wrong answer has a price.`);
  }
}

/** @param {Run} run @param {number} i */
function giveSnowballs(run, i) {
  const st = puzState(run, i);
  if (st.gave) return;
  st.gave = true;
  for (const p of present(run)) {
    try {
      p.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack("minecraft:snowball", 16));
    } catch {
      // full
    }
  }
  tell(run, "§7You were each given 16 snowballs.");
}

/** Flashes the memory sequence. @param {Run} run @param {number} i @param {number} delay */
function playSimon(run, i, delay) {
  const pz = run.lay.rooms[i].puzzle;
  const st = puzState(run, i);
  const seq = pz?.seq ?? [];
  const wool = run.lay.rooms[i].parts.filter((p) => p.k === "wool");
  const rm = run.lay.rooms[i];
  st.busyUntil = system.currentTick + delay + seq.length * 14 + 5;
  st.progress = 0;
  seq.forEach((c, k) => {
    system.runTimeout(() => {
      if (run.phase !== "active") return;
      const p = wool[c];
      if (!p) return;
      const at = wpos(run, rm, p.u, p.v, p.y);
      for (let n = 0; n < 6; n++) particle("minecraft:villager_happy", { x: at.x + 0.5, y: at.y + 1.3 + n * 0.15, z: at.z + 0.5 });
      particle("minecraft:note_particle", { x: at.x + 0.5, y: at.y + 2, z: at.z + 0.5 });
      sound(run, "note.harp", COLORS[c].pitch);
    }, delay + k * 14);
  });
}

/** Flashes the safe path, plate by plate. @param {Run} run @param {number} i @param {number} delay */
function showPath(run, i, delay) {
  const pz = run.lay.rooms[i].puzzle;
  const st = puzState(run, i);
  const plates = elemsOf(run, i, "plate");
  const path = pz?.path ?? [];
  st.busyUntil = system.currentTick + delay + path.length * 8;
  path.forEach((idx, k) => {
    system.runTimeout(() => {
      const e = plates.find((pl) => pl.i === idx);
      if (!e || run.phase !== "active") return;
      for (let n = 0; n < 4; n++) particle("minecraft:villager_happy", above(e, 0.3 + n * 0.2));
      sound(run, "note.pling", 0.8 + k * 0.08);
    }, delay + k * 8);
  });
}

/** A puzzle is done. @param {Run} run @param {number} i */
function solved(run, i) {
  const st = puzState(run, i);
  if (st.solved) return;
  st.solved = true;
  const rm = run.lay.rooms[i];
  sound(run, "random.orb");
  if (rm.kind === "cache") {
    tell(run, "§aClick. A hidden cache opens in the side room!");
    try {
      const chests = rm.chests.map((c) => wpos(run, rm, c.u, c.v, c.y));
      for (const at of chests) place(overworld(), at, perm(B.chest));
      const half = run.dungeon.loot.map((l) => ({ ...l, min: Math.max(1, Math.floor(l.min / 2)), max: Math.max(1, Math.ceil(l.max / 2)), chance: l.chance * 0.6 }));
      const extra = CONFIG.tierLoot.filter((l) => l.from <= run.s.t);
      stock(run, chests, [...half, ...extra.map((l) => ({ ...l, chance: l.chance * 0.5 }))], lootScale(run));
      for (const at of chests) particle("minecraft:totem_particle", { x: at.x + 0.5, y: at.y + 1, z: at.z + 0.5 });
    } catch (e) {
      console.warn(`[expedition] cache: ${e}`);
    }
    return;
  }
  tell(run, "§aClick. Something heavy moves behind the wall: the puzzle is solved!");
}

/** Do the four levers match the solution? @param {Run} run @param {number} i */
function leversSolved(run, i) {
  const sol = run.lay.rooms[i].puzzle?.solution ?? [];
  return elemsOf(run, i, "lever").every((e) => {
    const b = overworld().getBlock(e.at);
    return b?.typeId === "minecraft:lever" && (b.permutation.getState("open_bit") === true) === sol[e.i];
  });
}

/** Is room i reached (the current room, one before it, or a side room off one)? @param {Run} run @param {number} i */
function reached(run, i) {
  const rm = run.lay.rooms[i];
  if (rm.parent >= 0) return rm.parent <= run.room;
  return i <= run.room;
}

/**
 * Someone pressed a button in the dungeon.
 * @param {Run} run @param {Elem} e @param {Player | undefined} who
 */
function onButton(run, e, who) {
  const i = e.room;
  const rm = run.lay.rooms[i];
  if (!reached(run, i) || run.phase !== "active") return;
  if (rm.kind === "shrine") return shrineChoice(run, i, e.i, who);
  const pz = rm.puzzle;
  const st = puzState(run, i);
  if (!pz || st.solved) return;
  if (!st.active) {
    // Pressed before the room woke up (a side room entered from its doorway): wake it first, so the press doesn't count half a solution.
    st.active = true;
    if (rm.kind === "cache") tell(run, "§dA side room with a puzzle: solve it to open a hidden cache.");
    puzzleIntro(run, i);
    return;
  }
  const now = system.currentTick;
  switch (pz.type) {
    case "simon": {
      if (e.i === 9) {
        if (now < st.busyUntil) return;
        return playSimon(run, i, 5);
      }
      if (now < st.busyUntil) {
        if (who) actionbar(who, "§7Wait until the sequence is over.");
        return;
      }
      const seq = pz.seq ?? [];
      sound(run, "note.harp", COLORS[e.i].pitch);
      if (seq[st.progress] === e.i) {
        st.progress++;
        if (who) actionbar(who, `§a${st.progress} of ${seq.length}`);
        if (st.progress >= seq.length) solved(run, i);
      } else {
        tell(run, "§cWrong order! Watch again.");
        sound(run, "note.bass", 0.5);
        playSimon(run, i, 30);
      }
      return;
    }
    case "plates":
      if (e.i === 9 && now >= st.busyUntil) showPath(run, i, 5);
      return;
    case "lamps": {
      st.state = lampPress(st.state.length ? st.state : [...(pz.start ?? [])], e.i);
      for (const l of elemsOf(run, i, "lamp")) place(overworld(), l.at, perm(st.state[l.i] ? B.lampOn : B.lampOff));
      sound(run, "random.click", 1.2);
      if (who) actionbar(who, `§e${st.state.filter(Boolean).length} of 9 lamps lit`);
      if (st.state.every(Boolean)) solved(run, i);
      return;
    }
    case "wool": {
      const ans = pz.answer ?? [];
      st.colors[e.i] = ((st.colors[e.i] ?? 0) + 1) % COLORS.length;
      const w = elemsOf(run, i, "wool").find((x) => x.at.x === e.at.x && x.at.z === e.at.z);
      if (w) place(overworld(), w.at, perm(COLORS[st.colors[e.i]].wool));
      sound(run, "note.harp", COLORS[st.colors[e.i]].pitch);
      if (who) actionbar(who, `§7Pillar ${e.i + 1}: ${COLORS[st.colors[e.i]].name.toLowerCase()}`);
      if (ans.every((c, k) => st.colors[k] === c)) solved(run, i);
      return;
    }
    case "parkour":
      return solved(run, i);
    case "rush": {
      if (!st.startedAt) {
        st.startedAt = now;
        st.hit.clear();
        tell(run, `§eGo! ${pz.seconds} seconds to press all ${pz.count} buttons.`);
      }
      if (st.hit.has(e.i)) return;
      st.hit.add(e.i);
      particle("minecraft:villager_happy", above(e, 0.5));
      sound(run, "note.pling", 0.8 + st.hit.size * 0.1);
      if (who) actionbar(who, `§a${st.hit.size} of ${pz.count}`);
      if (st.hit.size >= (pz.count ?? 0)) solved(run, i);
      return;
    }
    case "riddle": {
      if (now < st.lockUntil) {
        if (who) actionbar(who, "§7The answers are locked for a moment...");
        return;
      }
      if (e.i === pz.correct) return solved(run, i);
      st.lockUntil = now + 120;
      tell(run, "§cWrong answer! The dungeon answers back...");
      sound(run, "mob.evocation_illager.cast_spell", 0.8);
      for (let k = 0; k < 1 + Math.min(3, Math.floor(run.s.t / 6)) + 1; k++) spawnMob(run, pickMob(run.dungeon, run.level), wmid(run, rm, { u: k % 2 ? 4 : -4, v: -5, y: 1 }), { list: "extra" });
      return;
    }
  }
}

/** @param {Run} run @param {Elem} e @param {Player} who */
function onPlate(run, e, who) {
  const i = e.room;
  const pz = run.lay.rooms[i].puzzle;
  const st = puzState(run, i);
  if (!pz || pz.type !== "plates" || st.solved || !reached(run, i) || run.phase !== "active") return;
  const path = pz.path ?? [];
  if (path[st.progress] === e.i) {
    st.progress++;
    particle("minecraft:villager_happy", above(e, 0.3));
    who.playSound("note.pling", { pitch: 0.8 + st.progress * 0.08 });
    if (st.progress >= path.length) solved(run, i);
    return;
  }
  if (st.progress > 0 && path[st.progress - 1] === e.i) return; // still on the last good one
  st.progress = 0;
  who.playSound("note.bass", { pitch: 0.5 });
  actionbar(who, "§cWrong plate! Start again from the near row.");
  particle("minecraft:villager_angry", above(e, 0.5));
  if (run.s.t >= 1) {
    try {
      who.applyDamage(2, { cause: EntityDamageCause.magic });
    } catch {
      // can't
    }
  }
}

/** @param {Run} run @param {Elem} e */
function onTarget(run, e) {
  const i = e.room;
  const pz = run.lay.rooms[i].puzzle;
  const st = puzState(run, i);
  if (!pz || pz.type !== "targets" || st.solved || st.hit.has(e.i) || !reached(run, i)) return;
  st.hit.add(e.i);
  place(overworld(), e.at, perm(B.hit));
  for (let n = 0; n < 5; n++) particle("minecraft:villager_happy", { x: e.at.x + 0.5, y: e.at.y + 0.5 + n * 0.1, z: e.at.z + 0.5 });
  sound(run, "random.orb", 0.7 + st.hit.size * 0.1);
  tell(run, `§aTarget ${st.hit.size} of ${pz.count}!`);
  if (st.hit.size >= (pz.count ?? 0)) solved(run, i);
}

/** Shrine: 0 blessing, 1 pass, 2 curse. @param {Run} run @param {number} i @param {number} choice @param {Player | undefined} who */
function shrineChoice(run, i, choice, who) {
  if (run.room !== i || !run.roomActive) return;
  const name = who?.name ?? "Someone";
  if (choice === 0) {
    const b = run.shrine.bless;
    tell(run, `§a${name} took the Blessing of ${b.name}: ${b.desc.toLowerCase()}.`);
    if (b.id === "fortune") run.fortune = true;
    else {
      const ticks = Math.max(200, Math.floor((run.deadline - Date.now()) / 50));
      for (const p of present(run)) {
        try {
          p.addEffect(b.effect, ticks, { amplifier: b.amp, showParticles: false });
          if (b.id === "haste") p.addEffect("haste", ticks, { amplifier: 0, showParticles: false });
          const list = buffs.get(p.id) ?? [];
          list.push(b.effect);
          if (b.id === "haste") list.push("haste");
          buffs.set(p.id, list);
        } catch {
          // can't
        }
      }
    }
    sound(run, "random.levelup");
  } else if (choice === 2 && run.shrine.curse) {
    const a = affixOf(run.shrine.curse);
    run.affixes.push(run.shrine.curse);
    run.cursed = true;
    tell(run, `§4${name} accepted the curse: ${a?.color}${a?.name}§4 for the rest of the run. §6The treasure grows.`);
    sound(run, "mob.wither.ambient", 0.8);
    // Mobs already in the dungeon don't change; the next waves do.
  } else tell(run, `§7${name} passed the shrine by.`);
  clearRoom(run);
}

// ---------------------------------------------------------------------------
// Affixes and traps (run every loop)
// ---------------------------------------------------------------------------

/** @param {Run} run @param {string} name @param {number} every ticks */
function due(run, name, every) {
  const now = system.currentTick;
  if (!run.timers[name]) run.timers[name] = now + Math.floor(every / 2) + Math.floor(Math.random() * every);
  if (now < run.timers[name]) return false;
  run.timers[name] = now + every + Math.floor(Math.random() * (every / 3));
  return true;
}

/** Is the current room a fighting room that's awake? @param {Run} run */
function fighting(run) {
  const rm = run.lay.rooms[run.room];
  return run.roomActive && !!rm && ["combat", "elite", "boss", "trap", "shaft"].includes(rm.kind);
}

/** @param {Run} run @param {Player[]} here */
function tickAffixes(run, here) {
  if (!here.length) return;
  const has = (/** @type {string} */ a) => run.affixes.includes(a);
  const t = run.s.t;
  const now = system.currentTick;
  const fight = fighting(run);
  if (has("shrouded") && due(run, "shrouded", 400)) for (const p of here) p.addEffect("darkness", 120, { amplifier: 0, showParticles: false });
  if (has("blinding") && fight && due(run, "blinding", 500)) {
    for (const p of here) {
      actionbar(p, "§8Your eyes sting!");
      p.addEffect("blindness", 60, { amplifier: 0, showParticles: false });
    }
  }
  if (has("hunger") && fight && due(run, "hunger", 100)) for (const p of here) p.addEffect("hunger", 120, { amplifier: t >= 12 ? 1 : 0, showParticles: false });
  if (fight) {
    const target = here[Math.floor(Math.random() * here.length)];
    const at = { x: Math.floor(target.location.x) + 0.5, y: Math.floor(target.location.y), z: Math.floor(target.location.z) + 0.5 };
    if (has("volcanic") && due(run, "volcanic", 140)) run.hazards.push({ kind: "fire", ...at, r: 1.5, at: now + 40, until: now + 40 });
    if (has("frozen") && due(run, "frozen", 120)) run.hazards.push({ kind: "frost", ...at, r: 2.5, at: now + 30, until: now + 150 });
    if (has("lightning") && due(run, "lightning", 240)) run.hazards.push({ kind: "bolt", ...at, r: 1.6, at: now + 40, until: now + 40 });
    if (has("beams") && due(run, "beams", 200)) run.hazards.push({ kind: "beam", ...at, r: 0.9, at: now + 40, until: now + 40, ax: Math.random() < 0.5 ? "x" : "z" });
  }
  // Warnings and hits.
  const rm = run.lay.rooms[run.room];
  const c = roomCenter(run, rm);
  for (const hz of [...run.hazards]) {
    const warn = now < hz.at;
    if (hz.kind === "fire") {
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) particle(warn ? "minecraft:basic_flame_particle" : "minecraft:lava_particle", { x: hz.x + dx, y: hz.y + 0.1, z: hz.z + dz });
      if (!warn) {
        eruptFire(run, hz);
        for (const p of here) if (Math.abs(p.location.x - hz.x) < hz.r && Math.abs(p.location.z - hz.z) < hz.r && Math.abs(p.location.y - hz.y) < 2) p.setOnFire(3, true);
      }
    } else if (hz.kind === "frost") {
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * hz.r;
        particle("minecraft:snowflake_particle", { x: hz.x + Math.cos(a) * d, y: hz.y + 0.3, z: hz.z + Math.sin(a) * d });
      }
      if (!warn) for (const p of here) if (Math.hypot(p.location.x - hz.x, p.location.z - hz.z) < hz.r && Math.abs(p.location.y - hz.y) < 2) p.addEffect("slowness", 30, { amplifier: 1, showParticles: true });
    } else if (hz.kind === "bolt") {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        particle("minecraft:electric_spark_particle", { x: hz.x + Math.cos(a) * hz.r, y: hz.y + 0.2, z: hz.z + Math.sin(a) * hz.r });
      }
      if (!warn) {
        for (let y = 0; y < 6; y++) particle("minecraft:electric_spark_particle", { x: hz.x, y: hz.y + y, z: hz.z });
        overworld().playSound("ambient.weather.lightning.impact", { x: hz.x, y: hz.y, z: hz.z }, { volume: 1 });
        for (const p of here) if (Math.hypot(p.location.x - hz.x, p.location.z - hz.z) < hz.r && Math.abs(p.location.y - hz.y) < 3) p.applyDamage(5 + Math.floor(t / 3), { cause: EntityDamageCause.lightning });
      }
    } else if (hz.kind === "beam") {
      for (let k = -R; k <= R; k++) {
        const x = hz.ax === "x" ? c.x + k + 0.5 : hz.x;
        const z = hz.ax === "x" ? hz.z : c.z + k + 0.5;
        particle(warn ? "minecraft:blue_flame_particle" : "minecraft:dragon_breath_trail", { x, y: hz.y + 0.6, z });
      }
      if (!warn) {
        overworld().playSound("mob.guardian.attack_loop", { x: hz.x, y: hz.y, z: hz.z }, { volume: 0.6 });
        for (const p of here) {
          const off = hz.ax === "x" ? Math.abs(p.location.z - hz.z) : Math.abs(p.location.x - hz.x);
          if (off < hz.r && Math.abs(p.location.y - hz.y) < 2 && inRoom(run, rm, p.location)) p.applyDamage(4 + Math.floor(t / 3), { cause: EntityDamageCause.magic });
        }
      }
    }
    if (now >= hz.until) run.hazards.splice(run.hazards.indexOf(hz), 1);
  }
  // Fire burns out.
  for (const f of [...run.fires]) {
    if (now < f.until) continue;
    run.fires.splice(run.fires.indexOf(f), 1);
    try {
      const b = overworld().getBlock(f);
      if (b?.typeId === B.fire) b.setPermutation(perm("minecraft:air"));
    } catch {
      // unloaded
    }
  }
}

/** Fire on the floor of a 3 x 3 patch, only on stone-like blocks and only in air; it's put out again after 4 seconds. @param {Run} run @param {Hazard} hz */
function eruptFire(run, hz) {
  const dim = overworld();
  const now = system.currentTick;
  overworld().playSound("mob.ghast.fireball", { x: hz.x, y: hz.y, z: hz.z }, { volume: 0.5 });
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const at = { x: Math.floor(hz.x) + dx, y: Math.floor(hz.y), z: Math.floor(hz.z) + dz };
    try {
      if (!inBox(run.o, run.size, run.top, at)) continue;
      const here = dim.getBlock(at);
      const below = dim.getBlock({ ...at, y: at.y - 1 });
      if (!here?.isAir || !below || below.isAir || /planks|wool|log|leaves|hay|web|carpet/.test(below.typeId)) continue;
      here.setPermutation(perm(B.fire));
      run.fires.push({ ...at, until: now + 80 });
    } catch {
      // unloaded
    }
  }
}

/** The trap hall: flame patches you see coming and arrow volleys from the side walls. @param {Run} run @param {Player[]} here */
function tickTraps(run, here) {
  const rm = run.lay.rooms[run.room];
  const now = system.currentTick;
  const t = run.s.t;
  if (now >= run.trapNext) {
    run.trapNext = now + Math.max(20, 40 - t);
    const patches = 2 + Math.floor(t / 7);
    for (let k = 0; k < patches; k++) {
      const p = wmid(run, rm, { u: Math.floor(Math.random() * 13) - 6, v: Math.floor(Math.random() * 11) - 5, y: 1 });
      run.hazards.push({ kind: "trap", ...p, r: 1.6, at: now + 30, until: now + 30 });
    }
    if (Math.random() < 0.6) {
      const side = Math.random() < 0.5 ? "left" : "right";
      const v = Math.floor(Math.random() * 9) - 4;
      const from = wmid(run, rm, { u: side === "left" ? -R : R, v, y: 2 });
      run.hazards.push({ kind: side === "left" ? "volleyL" : "volleyR", ...from, r: 0, at: now + 15, until: now + 15 });
    }
  }
  for (const hz of [...run.hazards]) {
    if (hz.kind === "trap") {
      const warn = now < hz.at;
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) particle(warn ? "minecraft:basic_flame_particle" : "minecraft:large_explosion", { x: hz.x + dx, y: hz.y + 0.1, z: hz.z + dz });
      if (!warn) {
        overworld().playSound("mob.blaze.shoot", { x: hz.x, y: hz.y, z: hz.z }, { volume: 0.6 });
        for (const p of here) {
          if (Math.abs(p.location.x - hz.x) < hz.r && Math.abs(p.location.z - hz.z) < hz.r && Math.abs(p.location.y - hz.y) < 1.5) {
            p.applyDamage(3 + Math.floor(t / 4), { cause: EntityDamageCause.fire });
            p.setOnFire(2, true);
          }
        }
        run.hazards.splice(run.hazards.indexOf(hz), 1);
      }
    } else if (hz.kind === "volleyL" || hz.kind === "volleyR") {
      if (now < hz.at) {
        particle("minecraft:critical_hit_emitter", hz);
        continue;
      }
      const dir = faceDir(frame(rm.back), hz.kind === "volleyL" ? "right" : "left");
      for (let k = -1; k <= 1; k++) {
        try {
          const fdir = faceDir(frame(rm.back), "fwd");
          const a = overworld().spawnEntity("minecraft:arrow", { x: hz.x + dir.x * 0.6 + fdir.x * k * 1.5, y: hz.y + 0.2, z: hz.z + dir.z * 0.6 + fdir.z * k * 1.5 });
          a.applyImpulse({ x: dir.x * 1.6, y: 0.05, z: dir.z * 1.6 });
        } catch {
          // can't
        }
      }
      overworld().playSound("random.bow", hz, { volume: 0.8 });
      run.hazards.splice(run.hazards.indexOf(hz), 1);
    }
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
  const rm = run.lay.rooms[run.room];
  const step = `Room ${run.room + 1}/${run.lay.n}`;
  if (!run.roomActive) return `${step}: go on to the next room`;
  switch (rm.kind) {
    case "combat":
    case "elite":
      return `${step}: defeat the wave (${run.mobs.filter(alive).length} left)`;
    case "puzzle": {
      const st = puzState(run, run.room);
      const pz = rm.puzzle;
      if (pz?.type === "rush" && st.startedAt) return `${step}: buttons ${st.hit.size}/${pz.count}, ${Math.max(0, Math.ceil((st.startedAt + (pz.seconds ?? 0) * 20 - system.currentTick) / 20))}s`;
      if (pz?.type === "targets") return `${step}: targets ${st.hit.size}/${pz.count}`;
      if (pz?.type === "simon" || pz?.type === "plates") return `${step}: ${pz.type === "simon" ? "repeat the sequence" : "walk the safe path"} (${st.progress}/${pz.type === "simon" ? pz.seq?.length : pz.path?.length})`;
      return `${step}: solve the ${pz?.type ?? ""} puzzle`;
    }
    case "trap":
      return `${step}: reach the far door`;
    case "shaft":
      return `${step}: climb to the exit high up`;
    case "shrine":
      return `${step}: choose at the shrine`;
    case "boss":
      return `${step}: defeat ${run.dungeon.boss.name}`;
  }
  return step;
}

/** Is a player in a room's goal zone? @param {Run} run @param {Room} rm @param {Player} p */
function inZone(run, rm, p) {
  if (!rm.zone) return false;
  const z = wmid(run, rm, rm.zone);
  return Math.hypot(p.location.x - z.x, p.location.z - z.z) <= rm.zone.r && p.location.y >= z.y - 0.6 && p.location.y < z.y + 3;
}

/** @param {Run} run @param {Map<string, Player>} players */
function tickRun(run, players) {
  const now = system.currentTick;
  // Members: still inside? (Leaving another way, like a teleport, counts as leaving.)
  for (const [id, m] of [...run.members]) {
    const p = players.get(id);
    if (!p) continue; // just died or left: handled by their events
    if (now < m.since + GRACE_TICKS) continue;
    const inside = p.dimension.id === OVERWORLD && inBox(run.o, run.size, run.top, p.location, 2);
    m.away = inside ? 0 : m.away + LOOP_TICKS;
    if (m.away >= AWAY_TICKS) {
      p.setDynamicProperty(PROP_RETURN, undefined);
      dropBuffs(p);
      p.sendMessage("§eYou left the dungeon, so you're out of the expedition.");
      tell(run, `§7${m.name} left the expedition.`);
      dropMember(run, id);
      if (run.phase === "resetting") return;
    }
  }
  const affixLine = run.affixes.length ? `\n${run.affixes.map((a) => `${affixOf(a)?.color ?? ""}${affixOf(a)?.name ?? a}`).join("§7 | ")}` : "";
  if (run.phase === "finishing") {
    if (now >= run.finishAt) endRun(run, "§aThe expedition is over. Welcome back!").catch((e) => console.warn(`[expedition] ${e}`));
    else if (beat % 2 === 0) {
      for (const id of run.members.keys()) {
        const p = players.get(id);
        if (p) actionbar(p, `§e${run.dungeon.name} ${levelShort(run.level)} §f${clock(run.clearMs)} §7| ${objective(run)}`, true);
      }
    }
    return;
  }
  if (Date.now() > run.deadline) {
    endRun(run, `§cTime's up! The ${run.dungeon.name} wasn't cleared within ${run.limitMin} minutes.`).catch((e) => console.warn(`[expedition] ${e}`));
    return;
  }
  const rm = run.lay.rooms[run.room];
  const all = [...run.members.keys()].map((id) => players.get(id)).filter((p) => !!p && p.dimension.id === OVERWORLD);
  const here = all.filter((p) => inRoom(run, rm, /** @type {Player} */ (p).location));
  if (!run.roomActive && here.length) {
    run.roomActive = true;
    run.hazards = [];
    if (rm.kind === "combat" || rm.kind === "elite") {
      run.wave = 0;
      run.waves = rm.kind === "elite" ? Math.max(2, run.s.waves - 1) : run.s.waves;
      run.nextWaveAt = now + 30;
      tell(run, rm.kind === "elite" ? "§5Elite guards wake in this hall..." : rm.h >= 14 ? "§7Something stirs above you..." : "§7Something stirs in the dark...");
    } else if (rm.kind === "puzzle") {
      puzState(run, run.room).active = true;
      puzzleIntro(run, run.room);
    } else if (rm.kind === "boss") {
      run.nextWaveAt = now + 40;
      tell(run, "§cYou feel watched...");
    } else if (rm.kind === "trap") {
      openDoor(run, run.room);
      run.trapNext = now + 20;
      tell(run, "§eA trap hall! The way out is open: run for the far door. Flames flicker on the floor before they burst, and arrows fly from the walls.");
    } else if (rm.kind === "shaft") {
      run.nextWaveAt = now + 60;
      tell(run, `§eA vertical shaft! The way on is ${rm.ey} blocks up. ${run.s.ladders ? "Climb the ladder or the ledges" : "Jump up the ledges"}, build your way up with your own blocks${run.s.build && get("allowBuilding") === true ? "" : " (not allowed here)"}, or fly with an elytra.`);
    } else if (rm.kind === "shrine") {
      const b = run.shrine.bless;
      const cu = run.shrine.curse ? affixOf(run.shrine.curse) : undefined;
      tell(run, `§eA shrine. Press one button: the Blessing of ${b.name} (${b.desc.toLowerCase()}), a curse (${cu ? `${cu.name}: ${cu.desc.toLowerCase()}` : "none left"}, but more treasure and Crowns), or pass by.`);
    }
  }
  if (run.roomActive) {
    if (rm.kind === "combat" || rm.kind === "elite") {
      if (run.nextWaveAt && now >= run.nextWaveAt) {
        run.nextWaveAt = 0;
        spawnWave(run);
      } else if (!run.nextWaveAt && now >= run.awaitUntil) {
        // Mobs that wandered out of the dungeon (or got stuck in a wall outside it) don't hold the door shut.
        for (const m of run.mobs) if (alive(m) && !inBox(run.o, run.size, run.top, m.location, 1)) m.remove();
        if (!run.mobs.some(alive)) {
          run.wave++;
          if (run.wave < run.waves) run.nextWaveAt = now + 40;
          else clearRoom(run);
        }
      }
    } else if (rm.kind === "puzzle") {
      const st = puzState(run, run.room);
      if (rm.puzzle?.type === "levers" && !st.solved && beat % 2 === 0 && leversSolved(run, run.room)) solved(run, run.room);
      if (st.solved) clearRoom(run);
    } else if (rm.kind === "trap") {
      tickTraps(run, here.map((p) => /** @type {Player} */ (p)));
      if (here.some((p) => inZone(run, rm, /** @type {Player} */ (p)))) {
        tell(run, "§aYou made it through the trap hall!");
        for (const e of overworld().getEntities({ type: "minecraft:arrow", location: wmid(run, rm, { u: 0, v: 0, y: 1 }), maxDistance: 12 })) e.remove();
        clearRoom(run);
      }
    } else if (rm.kind === "shaft") {
      if (run.nextWaveAt && now >= run.nextWaveAt) {
        run.nextWaveAt = now + Math.max(120, 300 - run.s.t * 8);
        const flyers = run.extra.filter(alive).length;
        const d = run.dungeon;
        if (d.flyers?.length && flyers < 2 + Math.floor(run.s.t / 5) && aliveCount(run) < get("mobCap")) spawnMob(run, d.flyers[Math.floor(Math.random() * d.flyers.length)], wmid(run, rm, rm.fly[Math.floor(Math.random() * rm.fly.length)]), { list: "extra" });
      }
      if (all.some((p) => inZone(run, rm, /** @type {Player} */ (p)))) {
        tell(run, "§aYou reached the top of the shaft! Drop down the chute into the pool.");
        for (const m of run.extra) if (m.isValid) m.remove();
        run.extra = [];
        clearRoom(run);
      }
    } else if (rm.kind === "boss") {
      if (run.nextWaveAt && now >= run.nextWaveAt) {
        run.nextWaveAt = 0;
        spawnBoss(run);
      } else if (!run.nextWaveAt && run.bossId) {
        const boss = world.getEntity(run.bossId);
        run.bossGone = boss && alive(boss) ? 0 : run.bossGone + LOOP_TICKS;
        if (run.bossGone >= 60) finish(run); // gone without a death event (removed by a command): still a win
        else if (boss && alive(boss)) {
          if (!inBox(run.o, run.size, run.top, boss.location, 1)) boss.teleport(wmid(run, rm, { u: 0, v: 2, y: 1 }));
          const hp = boss.getComponent("minecraft:health");
          if (hp && !run.bossHalf && run.level >= 1 && hp.currentValue < hp.effectiveMax / 2) {
            run.bossHalf = true;
            tell(run, `§c${run.dungeon.boss.name} calls its guards!`);
            sound(run, "mob.evocation_illager.prepare_summon", 0.8);
            bossAdds(run, 2 + run.s.bossAdds);
          }
          if (run.s.bossAdds && now >= run.nextAddsAt) {
            run.nextAddsAt = now + 400;
            bossAdds(run, run.s.bossAdds);
          }
        }
      }
    }
  }
  // Side rooms: their puzzles wake when someone walks in, any time after their door is reached.
  run.lay.rooms.forEach((side, j) => {
    if (side.parent < 0 || !reached(run, j)) return;
    const st = puzState(run, j);
    if (st.solved) return;
    if (!st.active && all.some((p) => inRoom(run, side, /** @type {Player} */ (p).location))) {
      st.active = true;
      tell(run, "§dA side room with a puzzle: solve it to open a hidden cache.");
      puzzleIntro(run, j);
    }
    if (st.active && side.puzzle?.type === "levers" && beat % 2 === 0 && leversSolved(run, j)) solved(run, j);
  });
  // Button rush timers (path or side room).
  for (const [j, st] of run.puz) {
    const pz = run.lay.rooms[j].puzzle;
    if (pz?.type !== "rush" || !st.startedAt || st.solved) continue;
    if (now > st.startedAt + (pz.seconds ?? 10) * 20) {
      st.startedAt = 0;
      st.hit.clear();
      tell(run, "§cToo slow! The buttons reset. Press one to start again.");
      sound(run, "note.bass", 0.5);
    }
  }
  tickAffixes(run, all.map((p) => /** @type {Player} */ (p)));
  if (beat % 2 === 0) {
    const t = clock(Date.now() - run.started);
    for (const id of run.members.keys()) {
      const p = players.get(id);
      if (p) actionbar(p, `§e${run.dungeon.name} ${levelShort(run.level)} §f${t}/${run.limitMin}:00 §7| ${objective(run)}${affixLine}`, true);
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
  run.hazards = [];
  sound(run, "random.levelup");
  tell(run, "§aThe bars rise. Onward!");
}

let beat = 0; // loop runs: the actionbar is refreshed every other one (once a second)
system.runInterval(() => {
  beat++;
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

/** The run and element at a block, if it's one of ours. @param {import("@minecraft/server").Block} block */
function elemAt(block) {
  if (block.dimension.id !== OVERWORLD) return undefined;
  const k = key3(block.location);
  for (const run of runs.values()) {
    const e = run.elems.get(k);
    if (e) return { run, e };
  }
  return undefined;
}

world.afterEvents.buttonPush.subscribe(({ block, source }) => {
  try {
    const hit = elemAt(block);
    if (!hit || hit.e.k !== "button") return;
    onButton(hit.run, hit.e, source instanceof Player ? source : undefined);
    // Puzzle buttons pop back up at once, so the same one can be pressed again right away (a sequence may repeat a color).
    const at = hit.e.at;
    system.runTimeout(() => {
      try {
        const b = overworld().getBlock(at);
        if (b?.typeId === B.button && b.permutation.getState("button_pressed_bit") === true) b.setPermutation(b.permutation.withState("button_pressed_bit", false));
      } catch {
        // gone
      }
    }, 2);
  } catch (e) {
    console.warn(`[expedition] button: ${e}`);
  }
});

world.afterEvents.pressurePlatePush.subscribe(({ block, source }) => {
  try {
    if (!(source instanceof Player)) return;
    const hit = elemAt(block);
    if (!hit || hit.e.k !== "plate" || !hit.run.members.has(source.id)) return;
    onPlate(hit.run, hit.e, source);
  } catch (e) {
    console.warn(`[expedition] plate: ${e}`);
  }
});

world.afterEvents.targetBlockHit.subscribe(({ block }) => {
  try {
    const hit = elemAt(block);
    if (hit && hit.e.k === "target") onTarget(hit.run, hit.e);
  } catch (e) {
    console.warn(`[expedition] target: ${e}`);
  }
});

world.afterEvents.projectileHitBlock.subscribe((ev) => {
  try {
    if (!runs.size) return;
    const block = ev.getBlockHit().block;
    const hit = elemAt(block);
    if (hit && hit.e.k === "target") onTarget(hit.run, hit.e);
  } catch {
    // the block is gone
  }
});

world.afterEvents.leverAction.subscribe(({ block, player, isPowered }) => {
  try {
    const hit = elemAt(block);
    if (!hit || hit.e.k !== "lever") return;
    const { run, e } = hit;
    const i = e.room;
    const st = puzState(run, i);
    if (run.phase !== "active" || st.solved) return;
    const levers = elemsOf(run, i, "lever");
    const states = levers.map((l) => {
      if (l.i === e.i) return isPowered; // the one just pulled: straight from the event
      const b = overworld().getBlock(l.at);
      return b?.typeId === "minecraft:lever" && b.permutation.getState("open_bit") === true;
    });
    const shown = COLORS.slice(0, 4)
      .map((c, k) => `${c.code}${c.name} §f${states[k] ? "on" : "off"}`)
      .join("  ");
    if (player?.isValid) actionbar(player, shown);
    const sol = run.lay.rooms[i].puzzle?.solution ?? [];
    if (reached(run, i) && states.every((s, k) => s === sol[k])) solved(run, i);
  } catch (err) {
    console.warn(`[expedition] lever: ${err}`);
  }
});

/** The run a dungeon mob belongs to. @param {Entity} e */
function runOfMob(e) {
  try {
    const tag = e.getTags().find((t) => t.startsWith("realm:exp_run:"));
    if (!tag) return undefined;
    const id = Number(tag.slice("realm:exp_run:".length));
    for (const run of runs.values()) if (run.id === id) return run;
  } catch {
    // gone
  }
  return undefined;
}

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  try {
    const id = deadEntity.id;
    for (const run of runs.values()) {
      if (run.bossId === id && run.phase === "active") {
        const at = deadEntity.location;
        if (run.level >= 2 && Math.random() < get("sigilChanceBoss") + 0.01 * run.s.t) dropSigil(run, at, run.dungeon.boss.name);
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
      dropBuffs(deadEntity);
      dropMember(run, id); // their return spot stays: playerSpawn sends them back
      return;
    }
    // Dungeon mobs: champions may drop a sigil, Explosive Death bursts.
    if (deadEntity instanceof Player) return;
    let tags;
    try {
      tags = deadEntity.getTags();
    } catch {
      return;
    }
    if (!tags.includes(MOB_TAG)) return;
    const run = runOfMob(deadEntity);
    if (!run || run.phase !== "active") return;
    const at = deadEntity.location;
    if ((tags.includes(CHAMP_TAG) || tags.includes(ELITE_CHAMP)) && run.s.t >= 1 && Math.random() < get("sigilChanceChampion")) dropSigil(run, at, "The champion");
    if (run.affixes.includes("explosive")) {
      particle("minecraft:basic_flame_particle", at);
      overworld().playSound("random.fuse", at, { volume: 0.8 });
      system.runTimeout(() => {
        try {
          if (run.phase !== "active") return;
          particle("minecraft:huge_explosion_emitter", at);
          overworld().playSound("random.explode", at, { volume: 0.7 });
          for (const p of present(run)) if (Math.hypot(p.location.x - at.x, p.location.y - at.y, p.location.z - at.z) < 3) p.applyDamage(3 + Math.floor(run.s.t / 4), { cause: EntityDamageCause.entityExplosion });
        } catch (e) {
          console.warn(`[expedition] burst: ${e}`);
        }
      }, 25);
    }
  } catch (e) {
    console.warn(`[expedition] death: ${e}`);
  }
});

// Affixes that work through hits: Vampiric, Venomous, Thorned, Backup.
world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource, damage }) => {
  if (!runs.size) return;
  try {
    const src = damageSource.damagingEntity;
    if (hurtEntity instanceof Player && src && !(src instanceof Player) && src.hasTag(MOB_TAG)) {
      const run = runOfMob(src);
      if (!run || !run.members.has(hurtEntity.id)) return;
      if (run.affixes.includes("vampiric")) {
        const hp = src.getComponent("minecraft:health");
        if (hp) hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + damage * 0.5));
        particle("minecraft:heart_particle", { x: src.location.x, y: src.location.y + 2, z: src.location.z });
      }
      if (run.affixes.includes("venomous")) hurtEntity.addEffect(run.s.t >= 15 ? "wither" : "poison", 60, { amplifier: 0 });
      return;
    }
    if (!(hurtEntity instanceof Player) && hurtEntity.hasTag(MOB_TAG)) {
      const run = runOfMob(hurtEntity);
      if (!run) return;
      if (src instanceof Player && run.members.has(src.id) && run.affixes.includes("thorned") && damageSource.cause === EntityDamageCause.entityAttack) {
        src.applyDamage(1 + (run.s.t >= 10 ? 1 : 0), { cause: EntityDamageCause.thorns });
      }
      if (run.affixes.includes("backup") && hurtEntity.id !== run.bossId && !hurtEntity.hasTag(CALLED_TAG)) {
        const hp = hurtEntity.getComponent("minecraft:health");
        if (hp && hp.currentValue > 0 && hp.currentValue < hp.effectiveMax / 2 && aliveCount(run) < get("mobCap")) {
          hurtEntity.addTag(CALLED_TAG);
          const rm = run.lay.rooms[run.room];
          if (run.roomActive && (rm.kind === "combat" || rm.kind === "elite" || rm.kind === "boss")) {
            const help = spawnMob(run, pickMob(run.dungeon, run.level), spawnSpot(run, run.room), { list: rm.kind === "boss" ? "extra" : "mobs" });
            help?.addTag(CALLED_TAG);
            for (const p of present(run)) actionbar(p, "§6A monster calls for help!");
          }
        }
      }
    }
  } catch {
    // an entity went away mid-way
  }
});

world.afterEvents.playerSpawn.subscribe(({ player }) => {
  try {
    const raw = player.getDynamicProperty(PROP_RETURN);
    if (typeof raw !== "string") return;
    if (runOf(player.id)) return; // still in a run (teleporting in)
    // Respawned after dying in a dungeon, or rejoined after leaving the game mid-run or after a restart.
    system.run(() => {
      if (player.isValid && !runOf(player.id)) sendBack(player, false);
    });
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

/** The run whose box holds this spot (or a box still waiting to be filled in). @param {Vector3} p */
function dungeonAt(p) {
  for (const r of runs.values()) if (r.checked && inBox(r.o, r.size, r.top, p)) return { run: r };
  for (const r of pending.values()) {
    const ex = extent(r);
    if (inBox(ex.o, ex.size, ex.top, p)) return { run: undefined };
  }
  return undefined;
}
/** @param {Player} p */
const builder = (p) => isOp(p) && p.getGameMode() === GameMode.Creative;
/** May players build in this run? @param {Run | undefined} run */
const canBuild = (run) => !!run && run.phase === "active" && run.s.build && get("allowBuilding") === true;

// The dungeon's walls hold the rooms together and its blocks must all be its own for the reset: no breaking,
// except blocks players placed themselves and decor that's meant to be cut (cobwebs).
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  if ((!runs.size && !pending.size) || ev.dimension.id !== OVERWORLD) return;
  const at = dungeonAt(ev.block.location);
  if (!at || builder(ev.player)) return;
  const run = at.run;
  if (run && run.phase === "active") {
    const k = key3(ev.block.location);
    if (run.placed.has(k)) {
      run.placed.delete(k);
      return;
    }
    if (run.breakable.has(ev.block.typeId)) return;
  }
  ev.cancel = true;
  const p = ev.player;
  system.run(() => {
    if (p.isValid) actionbar(p, "§7The dungeon's blocks can't be broken.");
  });
});

// Blocks placed in it pop back out as items (with their contents, for a shulker box), unless the run allows
// building: then they stay until the dungeon is filled in (but never containers, TNT or beds).
world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  try {
    if ((!runs.size && !pending.size) || block.dimension.id !== OVERWORLD) return;
    const at = dungeonAt(block.location);
    if (!at || builder(player)) return;
    const run = at.run;
    const type = block.typeId;
    const container = !!block.getComponent("minecraft:inventory");
    if (run && canBuild(run) && run.members.has(player.id) && !container && !NO_PLACE.has(type) && !type.endsWith("_bed")) {
      run.placed.add(key3(block.location));
      if (!run.placedTypes.has(type) && !blockLists().replaceable.includes(type)) {
        run.placedTypes.add(type);
        saveRun(run);
      }
      return;
    }
    block.dimension.runCommand(`setblock ${block.x} ${block.y} ${block.z} air destroy`);
    actionbar(player, run && canBuild(run) ? "§7That block can't be placed in the dungeon." : "§7Blocks placed in the dungeon pop back out.");
  } catch (e) {
    console.warn(`[expedition] place: ${e}`);
  }
});

// Explosions never break the dungeon (a creeper that wandered in, a blaze's fireball).
world.beforeEvents.explosion.subscribe((ev) => {
  if ((!runs.size && !pending.size) || ev.dimension.id !== OVERWORLD) return;
  try {
    const blocks = ev.getImpactedBlocks();
    const keep = blocks.filter((b) => !dungeonAt(b.location));
    if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
  } catch {
    // nothing to change
  }
});

// A sigil opens its run when used.
world.afterEvents.itemUse.subscribe(({ itemStack, source }) => {
  try {
    if (!(source instanceof Player)) return;
    const sig = readSigil(itemStack);
    if (!sig) return;
    system.run(() => preview(source, sig.d, sig.level, sig.affixes, sig.line).catch((e) => console.warn(`[expedition] ${e}`)));
  } catch (e) {
    console.warn(`[expedition] sigil use: ${e}`);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  // Runs live in memory: one cut short by a restart can't go on, so its dungeon is reset. Its players
  // are sent back by playerSpawn when they join. The records are read at once, so no new run can take
  // their slot before the reset below.
  for (let slot = 0; slot < 3; slot++) {
    const rec = readJson(PROP_RUN + slot);
    if (!rec || typeof rec.seed !== "number" || typeof rec.x !== "number" || typeof rec.y !== "number" || typeof rec.z !== "number") {
      removeArea(slot); // a leftover ticking area, if any
      continue;
    }
    pending.set(slot, { ...rec, slot });
  }
  try {
    migrateBest();
  } catch (e) {
    console.warn(`[expedition] leaderboards: ${e}`);
  }
  // After a script reload players are still online: anyone left in a dungeon goes back to where they started.
  for (const p of world.getAllPlayers()) {
    try {
      if (!runOf(p.id) && typeof p.getDynamicProperty(PROP_RETURN) === "string") sendBack(p, false);
    } catch (e) {
      console.warn(`[expedition] reload: ${e}`);
    }
  }
  system.runTimeout(async () => {
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
    `§e${dungeonLabel(run.dungeon, run.level)}§r`,
    run.phase === "active" ? `Time: ${clock(Date.now() - run.started)} of ${run.limitMin}:00\n${objective(run)}` : run.phase === "finishing" ? `Cleared in ${clock(run.clearMs)}! ${objective(run)}` : "Getting ready...",
    run.affixes.length ? `Affixes:\n${run.affixes.map((a) => `${affixOf(a)?.color}${affixOf(a)?.name}§r: ${affixOf(a)?.desc}`).join("\n")}` : "No affixes.",
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

/** The affixes shown for a level (rolled once, kept until used or rerolled). @param {Player} p @param {number} L */
function rolled(p, L) {
  if (L < 3) return [];
  const rolls = readPlayer(p, PROP_ROLLS) ?? {};
  const k = levelKey(L);
  const have = Array.isArray(rolls[k]) ? rolls[k].filter((/** @type {unknown} */ a) => typeof a === "string" && !!affixOf(String(a))) : undefined;
  if (have) return /** @type {string[]} */ (have);
  const fresh = rollAffixes(L, Math.random);
  rolls[k] = fresh;
  writePlayer(p, PROP_ROLLS, rolls);
  return fresh;
}

/** What a run at a level is like, for the preview. @param {Dungeon} d @param {number} L @param {string[]} affixes */
function describe(d, L, affixes) {
  const s = scaleFor(L);
  const lo = timeLimit(get("timeLimitMinutes"), s.roomsMin, L);
  const hi = timeLimit(get("timeLimitMinutes"), s.roomsMax, L);
  const blessed = affixes.includes("blessed");
  const lines = [
    `§e${dungeonLabel(d, L)}§r`,
    d.lore ? `§o§7${d.lore}§r` : "",
    `${s.roomsMin} to ${s.roomsMax} rooms, ${lo === hi ? lo : `${lo} to ${hi}`} minutes. ${s.waves} waves a fight, about ${s.mobs + Math.floor(s.t / 6)} to ${s.mobs + 1 + Math.floor(s.t / 6)} monsters each${s.elites ? `, ${s.elites} elite` : ""}${s.champChance ? `, ${Math.round(s.champChance * 100)}% chance of a champion` : ""}.`,
    s.t >= 1
      ? `Monsters: ${[s.healthBoost >= 0 ? `+${(s.healthBoost + 1) * 4} health` : "", s.resistance >= 0 ? `Resistance ${s.resistance + 1}` : "", s.strength >= 0 ? `Strength ${s.strength + 1}` : "", s.speed >= 0 ? `Speed ${s.speed + 1}` : "", s.armor ? `${ARMOR[s.armor]} armor` : ""].filter((x) => x).join(", ")}.`
      : "",
    s.tall ? `Tall rooms and vertical shafts: bring blocks${s.build && get("allowBuilding") === true ? " (you may build here)" : ""} or an elytra.` : s.build && get("allowBuilding") === true ? "You may place blocks in this dungeon." : "",
    affixes.length ? `§lAffixes§r\n${affixes.map((a) => `${affixOf(a)?.color}${affixOf(a)?.name}§r: ${affixOf(a)?.desc}`).join("\n")}` : s.t >= 1 ? "No affixes." : "",
    `§lRewards§r\n${Math.round(d.crowns * s.crowns * (blessed ? 1.25 : 1))} Crowns each, ${Math.round(Math.min(0.5, get("relicChance") + s.relic) * 100)}% relic chance, treasure x${(s.loot * (blessed ? 1.5 : 1)).toFixed(1)}${L >= 2 ? `, the boss may drop a Nightmare Sigil (${Math.round((get("sigilChanceBoss") + 0.01 * s.t) * 100)}%)` : ""}.${L >= 2 ? ` Clearing it unlocks ${levelName(Math.min(topLvl(), L + 1))}.` : ""}`,
  ];
  return lines.filter((x) => x).join("\n\n");
}

/**
 * The last step before a run: what it's like, Start, Reroll (Nightmare, without a sigil), Back.
 * @param {Player} player @param {Dungeon} d @param {number} L @param {string[]} [fixed] a sigil's affixes @param {string} [sigilLine]
 */
async function preview(player, d, L, fixed, sigilLine) {
  for (;;) {
    const why = cantStart(player);
    const affixes = fixed ?? rolled(player, L);
    const cost = Math.max(0, Math.floor(Number(get("rerollCost")) || 0));
    const form = new ActionFormData().title(sigilLine ? "§lNightmare Sigil" : `§l${d.name}`).body(`${describe(d, L, affixes)}${why ? `\n\n${why}` : ""}`);
    /** @type {(() => Promise<boolean | void> | boolean | void)[]} */
    const actions = [];
    if (!why) {
      form.button(sigilLine ? "Start (uses the sigil)" : "Start");
      actions.push(async () => {
        await start(player, d, L, affixes, sigilLine);
        return true;
      });
    }
    if (!sigilLine && L >= 3) {
      form.button(`Reroll affixes\n§8${cost ? `${cost} Crowns (you have ${crownsOf(player)})` : "free"}`);
      actions.push(() => {
        if (cost && crownsOf(player) < cost) {
          player.sendMessage(`§cRerolling costs ${cost} Crowns.`);
          return false;
        }
        if (cost) crownsObjective()?.addScore(player, -cost);
        const rolls = readPlayer(player, PROP_ROLLS) ?? {};
        rolls[levelKey(L)] = rollAffixes(L, Math.random);
        writePlayer(player, PROP_ROLLS, rolls);
        return false;
      });
    }
    form.button("Back");
    actions.push(() => true);
    const res = await show(player, form);
    if (!res || res.canceled || res.selection === undefined) return;
    if (await actions[res.selection]?.()) return;
  }
}

/** Pick a dungeon, then a level. @param {Player} player */
async function chooseDungeon(player) {
  const why = cantStart(player);
  if (why) return player.sendMessage(why);
  const form = new ActionFormData().title("§lPick a dungeon").body("Each dungeon has its own monsters, boss, look and treasure. Any of them can be played at any difficulty you've unlocked.");
  for (const d of CONFIG.dungeons) form.button(`${d.name}\n§8${d.mobs.slice(0, 3).map((m) => prettyId(typeof m === "string" ? m : m.id)).join(", ")}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= CONFIG.dungeons.length) return;
  await chooseLevel(player, CONFIG.dungeons[res.selection]);
}

/** @param {Player} player @param {Dungeon} d */
async function chooseLevel(player, d) {
  const top = unlockedLevel(player);
  const best = bestFor(d);
  const next = top < topLvl() ? `\n\nClear ${levelName(top)} to unlock ${levelName(top + 1)}.` : "";
  const form = new ActionFormData().title(`§l${d.name}`).body(`Pick a difficulty. Nightmare tiers add affixes, more rooms and waves, stronger monsters and better rewards.${next}`);
  /** @type {number[]} */
  const levels = [];
  for (let L = 0; L <= top; L++) {
    const s = scaleFor(L);
    const b = best[levelKey(L)]?.[0];
    form.button(`${L >= 3 ? "§5" : ""}${levelName(L)}§r\n§8${s.roomsMin}-${s.roomsMax} rooms${s.affixes ? `, ${s.affixes} affix${s.affixes > 1 ? "es" : ""}` : ""}${b ? `, best ${clock(b.t)}` : ""}`);
    levels.push(L);
  }
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= levels.length) return;
  await preview(player, d, levels[res.selection]);
}

/** @param {Player} player */
async function sigilMenu(player) {
  const list = sigilsOf(player);
  if (!list.length) return player.sendMessage("§7You have no Nightmare Sigils. Bosses and champions in Hard and Nightmare runs drop them.");
  const form = new ActionFormData().title("§lNightmare Sigils").body("A sigil opens one exact run: its dungeon, tier and affixes. It's used up when the run starts, and it works even before you've unlocked its tier.");
  for (const { sig, amount } of list) form.button(`${sig.d.name}, Nightmare ${sig.tier}${amount > 1 ? ` (x${amount})` : ""}\n§8${sig.affixes.map((a) => affixOf(a)?.name).join(", ") || "no affixes"}`);
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || res.selection >= list.length) return;
  const { sig } = list[res.selection];
  await preview(player, sig.d, sig.level, sig.affixes, sig.line);
}

/** @param {Player} player */
async function leaderboards(player) {
  const form = new ActionFormData().title("§lLeaderboards").body("Fastest clears for each dungeon and difficulty, the highest tier each player has cleared, and the latest runs.");
  for (const d of CONFIG.dungeons) form.button(`Fastest clears: ${d.name}`);
  form.button("Highest tiers");
  form.button("Recent runs");
  form.button("Back");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined) return;
  const n = CONFIG.dungeons.length;
  if (res.selection < n) {
    const d = CONFIG.dungeons[res.selection];
    const best = bestFor(d);
    const keys = Object.keys(best)
      .map((k) => ({ k, L: parseLevelKey(k) }))
      .filter((e) => e.L !== undefined && best[e.k]?.length)
      .sort((a, b) => (b.L ?? 0) - (a.L ?? 0));
    const body = keys.length
      ? keys.map(({ k, L }) => `§l${levelName(L ?? 0)}§r\n${best[k].slice(0, L !== undefined && L >= 3 ? 3 : 5).map((b, i) => `${i + 1}. ${clock(b.t)}  ${b.n}${b.a?.length ? ` §8(${b.a.map((a) => affixOf(a)?.name).join(", ")})§r` : ""}`).join("\n")}`).join("\n\n")
      : "§7No clears yet.";
    await show(player, new ActionFormData().title(`§l${d.name}`).body(body).button("Close"));
  } else if (res.selection === n) {
    /** @type {TierEntry[]} */
    const tiers = readJson(PROP_TIERS) ?? [];
    const body = tiers.length ? tiers.map((e, i) => `${i + 1}. ${e.n}: ${levelName(e.l)} §8(${dungeonById(e.d)?.name ?? e.d})§r`).join("\n") : "§7Nobody has cleared a run yet.";
    await show(player, new ActionFormData().title("§lHighest tiers").body(body).button("Close"));
  } else if (res.selection === n + 1) {
    /** @type {HistoryEntry[]} */
    const hist = readJson(PROP_HISTORY) ?? [];
    await show(player, new ActionFormData().title("§lRecent runs").body(historyText(hist)).button("Close"));
  }
}

/** @param {HistoryEntry[]} hist */
function historyText(hist) {
  if (!hist.length) return "§7No runs yet.";
  return hist.map((h) => `${h.ok ? "§a" : "§c"}${h.ok ? "Cleared" : "Failed"}§r ${dungeonById(h.d)?.name ?? h.d} ${levelShort(h.l)} in ${clock(h.t)}: ${h.n}`).join("\n");
}

/** @param {Player} player */
async function myProgress(player) {
  const prog = progressOf(player);
  const top = unlockedLevel(player);
  const body = [
    `Unlocked up to: §e${levelName(top)}§r${top < topLvl() ? ` (clear it to unlock ${levelName(top + 1)})` : " (the highest)"}`,
    `Highest cleared: ${prog.b >= 0 ? levelName(prog.b) : "none yet"}`,
    `Runs cleared: ${prog.c}`,
    `Nightmare Sigils with you: ${sigilsOf(player).reduce((n, s) => n + s.amount, 0)}`,
    `§lYour recent runs§r\n${historyText(prog.r)}`,
  ].join("\n\n");
  await show(player, new ActionFormData().title("§lMy progress").body(body).button("Close"));
}

/** /realm:expedition @param {Player} player */
async function mainMenu(player) {
  const mine = runOf(player.id);
  if (mine) return runMenu(player, mine);
  const s = site();
  const active = [...runs.values()];
  /** @type {string[]} */
  const body = [];
  if (active.length) body.push(...active.map((r) => `§eAn expedition is in progress (${statusLine(r)})§r`));
  if (get("enabled") !== true) body.push("New expeditions are disabled right now.");
  else if (!s) body.push(`The operators haven't picked an expedition site yet.${isOp(player) ? " Use Operator tools, or stand far from spawn and run /realm:expedition_site." : ""}`);
  else body.push(`Dungeon runs for your party (members within ${CONFIG.partyRadius} blocks are asked along). Clear Hard to unlock Nightmare tiers: up to ${maxTier()}, with affixes, more rooms and better rewards. You can play up to §e${levelName(unlockedLevel(player))}§r.`);
  const form = new ActionFormData().title("§lExpeditions").body(body.join("\n\n"));
  /** @type {(() => Promise<void> | void)[]} */
  const actions = [];
  form.button("Start an expedition\n§8Pick a dungeon and difficulty");
  actions.push(() => chooseDungeon(player));
  const sig = sigilsOf(player).reduce((n, x) => n + x.amount, 0);
  if (sig) {
    form.button(`Use a Nightmare Sigil\n§8You have ${sig}`);
    actions.push(() => sigilMenu(player));
  }
  form.button("Leaderboards\n§8Fastest clears, highest tiers, recent runs");
  actions.push(() => leaderboards(player));
  form.button("My progress");
  actions.push(() => myProgress(player));
  if (typeof player.getDynamicProperty(PROP_RETURN) === "string") {
    form.button("Go back to where I started");
    actions.push(() => sendBack(player));
  }
  if (isOp(player)) {
    form.button("Operator tools\n§8Site, reset, sigils");
    actions.push(() => opMenu(player));
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

/** @param {Player} player */
async function opMenu(player) {
  if (!isOp(player)) return;
  const s = site();
  const form = new ActionFormData()
    .title("§lExpedition tools")
    .body(`${s ? `Site: ${s.x}, ${s.z} (set by ${s.by}).` : "No site yet."} Dungeons are built at y ${FLOOR - 1} and up to ${FLOOR + MAX_ROOM_H + 2} at the highest tiers.`)
    .button("Set the site where I stand")
    .button("End every expedition and reset")
    .button("Create a Nightmare Sigil")
    .button("Unlock every tier for me")
    .button("Back");
  const res = await show(player, form);
  if (!res || res.canceled) return;
  if (res.selection === 0) setSite(player, undefined, undefined);
  else if (res.selection === 1) await opReset(player);
  else if (res.selection === 2) await opSigil(player);
  else if (res.selection === 3) {
    const prog = progressOf(player);
    prog.u = maxTier();
    writePlayer(player, PROP_PROG, prog);
    player.sendMessage(`§aEvery tier up to Nightmare ${maxTier()} is unlocked for you.`);
  }
}

/** @param {Player} player */
async function opSigil(player) {
  const names = CONFIG.dungeons.map((d) => d.name);
  const form = new ModalFormData()
    .title("§lCreate a Nightmare Sigil")
    .dropdown("Dungeon", names, { defaultValueIndex: 0 })
    .slider("Nightmare tier", 1, maxTier(), { defaultValue: Math.min(5, maxTier()) })
    .toggle("Random affixes for the tier", { defaultValue: true });
  for (const a of AFFIXES) form.toggle(`${a.color}${a.name}§r (if not random)`, { defaultValue: false });
  const res = await show(player, form);
  if (!res || res.canceled || !res.formValues) return;
  const v = res.formValues;
  const d = CONFIG.dungeons[Number(v[0]) || 0];
  const tier = clamp(Math.round(Number(v[1]) || 1), 1, maxTier());
  const affixes = v[2] === true ? rollAffixes(tier + 2, Math.random) : AFFIXES.filter((_, k) => v[3 + k] === true).map((a) => a.id).slice(0, 6);
  const it = makeSigil(d, tier, affixes);
  const rest = player.getComponent("minecraft:inventory")?.container?.addItem(it);
  if (rest) player.dimension.spawnItem(rest, player.location);
  player.sendMessage(`§aCreated a Nightmare Sigil: ${d.name}, Nightmare ${tier}${affixes.length ? ` (${affixNames(affixes)}§a)` : ""}.`);
}

/** @param {Player} player @param {number | undefined} x @param {number | undefined} z */
function setSite(player, x, z) {
  if (runs.size || pending.size) return player.sendMessage("§cWait until the expedition in progress is over (or end it with /realm:expedition_reset).");
  if (x === undefined && player.dimension.id !== OVERWORLD) return player.sendMessage("§cExpedition sites are in the overworld. Go there, or give x and z.");
  const sx = Math.floor(x ?? player.location.x);
  const sz = Math.floor(z ?? player.location.z);
  const spawn = world.getDefaultSpawnLocation();
  const fromSpawn = Math.hypot(sx - spawn.x, sz - spawn.z);
  const avoid = CONFIG.avoidSpawn;
  const half = Math.floor((MAX_GRID * CELL) / 2);
  if (fromSpawn < avoid + half) {
    player.sendMessage(`§cThat's only ${Math.round(fromSpawn)} blocks from world spawn. The site must be at least ${avoid + half} blocks away (avoidSpawn plus half the biggest dungeon), so it's never under the spawn town.`);
    return;
  }
  /** @type {string[]} */
  const notes = [];
  const slots = Math.max(1, Math.min(3, get("slots")));
  const size = MAX_GRID * CELL;
  const top = MAX_ROOM_H + 2;
  for (let slot = 0; slot < slots; slot++) {
    const o = originFor({ x: sx, z: sz }, slot, size);
    const { from, to } = box(o, size, top);
    const label = slots > 1 ? `Dungeon ${slot + 1} (${from.x}, ${from.z} to ${to.x}, ${to.z})` : `The dungeon area (${from.x}, ${from.y}, ${from.z} to ${to.x}, ${to.y}, ${to.z})`;
    let found;
    try {
      found = findForeign(o, size, top);
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
  player.sendMessage(`§aExpedition site set at ${sx}, ${sz}: dungeons are built at y ${FLOOR - 1} to ${FLOOR + 7} (up to ${FLOOR + top} with the tallest Nightmare rooms), up to ${size} blocks wide, sealed in deepslate, and filled back in after each run.`);
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
      description: "Expeditions: start a dungeon run (Easy to Nightmare 20), use a sigil, see leaderboards and your progress",
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

/**
 * For tests: the state of the first run and one of its rooms (the current one, or `{ room }`), sent back as
 * `realm:expedition_state` in parts of under 2000 characters: { part, parts, data }.
 * @param {string} message
 */
function debugState(message) {
  const run = [...runs.values()][0];
  let want;
  try {
    want = JSON.parse(message || "{}")?.room;
  } catch {
    want = undefined;
  }
  /** @type {Record<string, unknown>} */
  const out = { phase: run?.phase ?? "none", pending: pending.size };
  if (run) {
    const i = typeof want === "number" ? want : Math.min(run.room, run.lay.rooms.length - 1);
    const rm = run.lay.rooms[i];
    const st = run.puz.get(i);
    const fr = frame(rm.back);
    Object.assign(out, {
      id: run.id,
      level: run.level,
      room: run.room,
      n: run.lay.n,
      active: run.roomActive,
      wave: run.wave,
      waves: run.waves,
      alive: aliveCount(run),
      affixes: run.affixes,
      o: run.o,
      size: run.size,
      top: run.top,
      sides: run.lay.rooms.map((r, j) => [j, r.parent]).filter((x) => x[1] >= 0),
      rm: {
        i,
        kind: rm.kind,
        h: rm.h,
        ey: rm.ey,
        c: wmid(run, rm, { u: 0, v: 0, y: 1 }),
        fwd: fr.fwd,
        zone: rm.zone ? wmid(run, rm, rm.zone) : undefined,
        chests: rm.chests.map((c) => wpos(run, rm, c.u, c.v, c.y)),
        pz: rm.puzzle,
        st: st ? { solved: st.solved, progress: st.progress, state: st.state, colors: st.colors, busy: st.busyUntil > system.currentTick } : undefined,
        el: [...run.elems.values()].filter((e) => e.room === i).map((e) => [e.k, e.i, e.at.x, e.at.y, e.at.z]),
      },
    });
  }
  const text = JSON.stringify(out);
  // 900 characters a part: quoted again inside `data`, every " grows to \", and a message may be at most 2048.
  const parts = Math.max(1, Math.ceil(text.length / 900));
  for (let k = 0; k < parts; k++) system.sendScriptEvent("realm:expedition_state", JSON.stringify({ part: k, parts, data: text.slice(k * 900, (k + 1) * 900) }));
}

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "expedition_bp");
    else if (id === "realm:expedition_debug") {
      try {
        debugState(message);
      } catch (e) {
        console.warn(`[expedition] debug: ${e}`);
      }
    }
  },
  { namespaces: ["realm"] },
);
