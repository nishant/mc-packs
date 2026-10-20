// Objectives: what counts for each objective type, the per-second and fast loops, and the scenes
// (story characters, guards, escorts, wisps, defenses, visions, riddles).
import { EquipmentSlot, GameMode, ItemStack, MolangVariableMap, Player, system, world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { ACTOR, ADD, actorOf, actors, actorsOf, removeActor, removeActors, setLostHandler, spawnActor, updateActorLabels } from "./actors.js";
import { spawnFresh } from "./spawn.js";
import {
  active,
  applyChoice,
  chapterDone,
  countdown,
  currentStep,
  entries,
  giveRep,
  invalidate,
  markDirty,
  matches,
  objApplies,
  objDone,
  objKey,
  orMates,
  pagesFor,
  progressOf,
  reached,
  requires,
  sagaOf,
  codexFits,
  partyViews,
  setFlag,
  target,
  WANDER_CHAMPION,
} from "./data.js";
import { featureSpot, infoOf, locate, placeSpot, placesOf } from "./places.js";
import { get, getFor } from "./settings.js";
import { holdTitle, isSlot, questCode, sideBoxes } from "./side.js";
import { STORIES } from "./stories.js";
import { FAVORS, WANDERERS } from "./stories/index.js";
import { DIMENSIONS, OVERWORLD, PACK, across, alive, busy, cancelInteractions, claim, clock, dialog, dist3, exclusive, groundAt, itemName, lifecycle, npcName, online, open as openBlock, plain, release, send, show, wait, waterTop } from "./util.js";
import { onScriptEvent } from "./script-events.js";

/** @typedef {import("./data.js").Entry} Entry */
/** @typedef {import("./data.js").Saga} Saga */
/** @typedef {import("./types.js").Objective} Objective */
/** @typedef {import("./types.js").Scene} VisionScene */
/** @typedef {import("./types.js").Reward} Reward */
/** @typedef {import("./types.js").SkyRequest} SkyRequest */
/** @typedef {import("./places.js").Loc} Loc */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

const LONG = 20000000;
export const CHAMPION_TAG = "saga:champion"; // champions this pack spawned itself (no Champions pack)
const PLACED_MEMORY = 2000;
const FAST_TICKS = 5;
const ESCORT_TICKS = 2; // an escorted character takes a short step this often
const ESCORT_STEP = 0.42; // blocks per step at walking pace (about 4 a second, a player's walk)
const ESCORT_HURRY = 0.6; // ...when the player is 5+ blocks ahead
const ESCORT_RUN = 1; // ...and 8+ ahead (they catch up with a sprinting player)
const ESCORT_GAP = 2.5; // they stop this close behind the player
const RACE_RADIUS = 300; // a race starts this close (blocks) to a bounty target or the last map leg
const RACED_MAX = 12; // targets and hunts remembered per race objective (each is raced once)
const BOUNTY_TAG = "realm:bounty:"; // + bounty id: a Bounty Board champion target

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Progress counts for this player now. @param {Player} player */
export function counting(player) {
  if (!player.isValid || get("enabled") !== true) return false;
  try {
    if (get("skipCreative") === true && player.getGameMode() === GameMode.Creative) return false;
  } catch {
    return false;
  }
  return true;
}

/** Default radius per objective type. @param {Objective} obj */
export function radiusOf(obj) {
  if (obj.radius !== undefined) return obj.radius;
  switch (obj.type) {
    case "interact":
    case "vision":
      return 8;
    case "defeat":
      return 32;
    case "survive":
      return 48;
    case "inspect":
      return 24;
    case "answer":
      return 6;
    case "meet":
      return 4;
    default:
      return 16;
  }
}

export const isNight = () => {
  const t = world.getTimeOfDay();
  return t >= 13000 && t < 23000;
};

/** Does the time of day move? False with the daylight cycle off (servers that keep it day), when no timed step could ever finish. */
export function timeMoves() {
  try {
    return world.gameRules.doDayLightCycle !== false;
  } catch {
    return true; // can't tell: assume it moves
  }
}

/** Night for a night-only step: also met while time is stopped, so those steps can finish. */
function nightMet() {
  return !timeMoves() || isNight();
}

/** Is the time of day inside a step's `timeOfDay` window? No window, or time stopped: yes. @param {Objective} obj */
function inWindow(obj) {
  if (!obj.timeOfDay || !timeMoves()) return true;
  const t = world.getTimeOfDay();
  const [a, b] = obj.timeOfDay;
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

/** A Minecraft day in real time (ms): what a `wait` day counts as while the daylight cycle is off. */
const DAY_MS = 20 * 60000;

/** A location with a height: the saved y, or the ground there (undefined when not loaded). @param {Loc} loc */
function withY(loc) {
  if (loc.y !== undefined) return { x: loc.x, y: loc.y, z: loc.z };
  try {
    const y = groundAt(world.getDimension(loc.dim), loc.x, loc.z);
    return y === undefined ? undefined : { x: loc.x, y, z: loc.z };
  } catch {
    return undefined;
  }
}

/** Is a point inside an objective's area? No location = anywhere. @param {Objective} obj @param {Vector3} at @param {string} dim */
function inArea(obj, at, dim) {
  const loc = locate(obj);
  if (loc === undefined) return true;
  if (typeof loc === "string" || loc.pending) return false;
  return loc.dim === dim && across(at, loc) <= radiusOf(obj);
}

/** Is the player standing in an objective's area? @param {Player} player @param {Objective} obj */
const playerIn = (player, obj) => inArea(obj, player.location, player.dimension.id);

// ---- Quest spot outlines (realm:guide_x / _y / _z from build_rp) ------------------------------------------

const COLOR_GOLD = { r: 1.0, g: 0.78, b: 0.18, a: 0.58 };
const COLOR_GREEN = { r: 0.25, g: 0.95, b: 0.55, a: 0.52 };
const COLOR_CYAN = { r: 0.25, g: 0.88, b: 1.0, a: 0.62 };

/** Does this player see quest spot outlines? @param {Player} player */
const guidesOn = (player) => getFor(player, "spotGuides") !== false;

/**
 * The variables of a guide particle.
 * @param {{ r: number, g: number, b: number, a: number }} color @param {number} [style] 0 = full block outline, 1 = corner brackets @param {number} [life] seconds
 */
function guideVars(color, style = 0, life = 1.15) {
  const m = new MolangVariableMap();
  m.setFloat("variable.life", life);
  m.setFloat("variable.style", style);
  m.setColorRGBA("variable.color", { red: color.r, green: color.g, blue: color.b, alpha: color.a });
  return m;
}

/** Outlines the 1x1x1 block at (bx, by, bz), all six faces, for this player only. @param {Player} player @param {number} bx @param {number} by @param {number} bz @param {MolangVariableMap} vars */
function drawBlockOutline(player, bx, by, bz, vars) {
  const x = Math.floor(bx);
  const y = Math.floor(by);
  const z = Math.floor(bz);
  try {
    player.spawnParticle("realm:guide_y", { x: x + 0.5, y: y + 1.015, z: z + 0.5 }, vars);
    player.spawnParticle("realm:guide_y", { x: x + 0.5, y: y - 0.015, z: z + 0.5 }, vars);
    player.spawnParticle("realm:guide_x", { x: x - 0.015, y: y + 0.5, z: z + 0.5 }, vars);
    player.spawnParticle("realm:guide_x", { x: x + 1.015, y: y + 0.5, z: z + 0.5 }, vars);
    player.spawnParticle("realm:guide_z", { x: x + 0.5, y: y + 0.5, z: z - 0.015 }, vars);
    player.spawnParticle("realm:guide_z", { x: x + 0.5, y: y + 0.5, z: z + 1.015 }, vars);
  } catch {
    // unloaded, or build_rp is not installed
  }
}

/**
 * A standing box: the block to stand on outlined, a 3x3 of floor tiles around it and, with a radius of 3 or more, a ring of floor tiles at the edge.
 * @param {Player} player @param {Dimension} dim @param {number} cx @param {number} cy feet y on the ground @param {number} cz
 * @param {{ r: number, g: number, b: number, a: number }} color @param {number} [ringRadius]
 */
function drawStandingPad(player, dim, cx, cy, cz, color, ringRadius = 0) {
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const z0 = Math.floor(cz);
  const centerVars = guideVars(color, 0, 1.15);
  const cornerVars = guideVars({ r: color.r, g: color.g, b: color.b, a: color.a * 0.78 }, 1, 1.15);
  drawBlockOutline(player, x0, y0, z0, cornerVars);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      try {
        player.spawnParticle("realm:guide_y", { x: x0 + dx + 0.5, y: y0 + 0.02, z: z0 + dz + 0.5 }, dx === 0 && dz === 0 ? centerVars : cornerVars);
      } catch {
        // unloaded
      }
    }
  }
  if (ringRadius >= 3) {
    const r = Math.min(ringRadius, 12);
    const steps = 12;
    for (let k = 0; k < steps; k++) {
      const ang = (k / steps) * Math.PI * 2;
      const rx = Math.floor(cx + Math.cos(ang) * r);
      const rz = Math.floor(cz + Math.sin(ang) * r);
      const ry = groundAt(dim, rx + 0.5, rz + 0.5, y0, false) ?? y0;
      try {
        player.spawnParticle("realm:guide_y", { x: rx + 0.5, y: Math.floor(ry) + 0.02, z: rz + 0.5 }, cornerVars);
      } catch {
        // unloaded
      }
    }
  }
}

/** Objective types whose spot is a box to stand in (the box shows the radius for the ones that need a zone). */
const STAND_GUIDES = new Set(["reach", "vigil", "survive", "vision", "answer", "defend", "place"]);
const ZONE_GUIDES = new Set(["vigil", "survive", "defend", "place"]);

/** Blocks one interact scan slice looks at; a scan runs one slice a tick, so its cost per tick is this many getBlock calls. */
const SCAN_STEP = 256;
/** Scans that may run at once, so the whole script's worst case is MAX_SCANS * SCAN_STEP getBlock calls a tick (1,024). */
const MAX_SCANS = 4;
/** What the interact scans did, for the profiler: blocks looked at, scans started, slices run, scans running now. */
const interactScanStats = { blocks: 0, jobs: 0, slices: 0, active: 0 };

/**
 * Looks for the wanted blocks around a spot, yielding every SCAN_STEP blocks (the caller runs one step a tick). Stops early when
 * alive() turns false. Fills out.found (nearest first, up to 4) and out.complete (false if any block could not be read: a chunk
 * that isn't loaded makes getBlock return nothing or throw, and the matches found so far are kept).
 * @param {(p: {x:number,y:number,z:number}) => {typeId: string} | undefined} getBlock @param {Loc} loc @param {number} r @param {number} cy @param {number} dy @param {string[]} wanted
 * @param {{ found: { x: number, y: number, z: number, type: string }[], complete: boolean }} out @param {() => boolean} alive
 */
function* scanInteract(getBlock, loc, r, cy, dy, wanted, out, alive) {
  /** @type {{ x: number, y: number, z: number, type: string, d: number }[]} */
  const found = [];
  let complete = true;
  let n = 0;
  for (let x = Math.floor(loc.x - r); x <= Math.floor(loc.x + r); x++) {
    for (let z = Math.floor(loc.z - r); z <= Math.floor(loc.z + r); z++) {
      if (across({ x: x + 0.5, z: z + 0.5 }, loc) > r) continue;
      for (let y = cy - dy; y <= cy + dy; y++) {
        interactScanStats.blocks++;
        try {
          const b = getBlock({ x, y, z });
          if (!b) complete = false;
          else if (wanted.includes(b.typeId)) found.push({ x, y, z, type: b.typeId, d: Math.hypot(x + 0.5 - loc.x, z + 0.5 - loc.z) + Math.abs(y - cy) });
        } catch {
          complete = false;
        }
        if (++n % SCAN_STEP === 0) {
          yield;
          if (!alive()) return;
        }
      }
    }
  }
  found.sort((a, b) => a.d - b.d);
  out.found = found.slice(0, 4).map(({ x, y, z, type }) => ({ x, y, z, type }));
  out.complete = complete;
}

/** Up to 4 blocks of an interact objective near its spot, kept per scene; the search runs in the background, one slice a tick. @param {SceneState} s @param {Player} player @param {Objective} obj @param {Loc} loc */
function interactBlocks(s, player, obj, loc) {
  const dim = player.dimension;
  /** @type {{ x: number, y: number, z: number, type?: string }[] | undefined} */
  let list = s.data.interactBlocks;
  if (list?.length && list.every((b) => !b.type || dim.getBlock(b)?.typeId === b.type)) return list;
  const now = system.currentTick;
  const fallback = () => {
    const gy = loc.y !== undefined ? Math.floor(loc.y) : Math.floor(groundAt(dim, loc.x, loc.z, player.location.y) ?? player.location.y) - 1;
    return [{ x: Math.floor(loc.x), y: gy, z: Math.floor(loc.z) }];
  };
  if (s.data.interactJob) return list ?? fallback(); // a scan is still running
  if (list && now < (s.data.interactTry ?? 0)) return list;
  const wanted = obj.blocks ?? [];
  if (!wanted.length) {
    s.data.interactTry = now + 100;
    s.data.interactBlocks = list = fallback();
    return list;
  }
  if (interactScanStats.active >= MAX_SCANS) {
    s.data.interactTry = now + 20; // too many scans at once: this one waits its turn
    return list ?? fallback();
  }
  s.data.interactTry = now + 100;
  const r = Math.min(radiusOf(obj), 12);
  const cy = Math.floor(loc.y ?? player.location.y);
  const dy = loc.y === undefined ? 6 : Math.min(r, 8);
  const token = {};
  s.data.interactJob = token;
  interactScanStats.jobs++;
  interactScanStats.active++;
  const out = { found: /** @type {{ x: number, y: number, z: number, type: string }[]} */ ([]), complete: false };
  // The scan only goes on while the scene is still this player's, they are in the same dimension, and nothing ended or replaced it.
  const alive = () => {
    try {
      return s.data.interactJob === token && scenes.get(sk(s.pid, s.key)) === s && player.isValid && player.dimension.id === dim.id;
    } catch {
      return false;
    }
  };
  const gen = scanInteract((p) => dim.getBlock(p), loc, r, cy, dy, wanted, out, alive);
  const stop = () => {
    system.clearRun(timer);
    interactScanStats.active--;
    if (s.data.interactJob === token) s.data.interactJob = undefined;
  };
  const timer = system.runInterval(() => {
    try {
      interactScanStats.slices++;
      if (!alive()) return stop();
      if (!gen.next().done) return;
      if (alive()) {
        // Blocks found are kept even when part of the box was unloaded; an empty, incomplete scan tries again soon.
        s.data.interactBlocks = out.found.length ? out.found : fallback();
        if (!out.found.length && !out.complete) s.data.interactTry = system.currentTick + 40;
      }
      stop();
    } catch {
      stop();
    }
  }, 1);
  return list ?? fallback();
}

/**
 * The outlines of an objective's spot for this player: gold to walk to, green when standing in it, cyan blocks to tap.
 * @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj
 */
function questGuides(player, e, i, obj) {
  const isStand = STAND_GUIDES.has(obj.type);
  if ((!isStand && obj.type !== "interact") || !guidesOn(player)) return;
  const loc = locate(obj);
  const p = player.location;
  if (!loc || typeof loc === "string" || loc.pending || loc.dim !== player.dimension.id) return;
  if (obj.type === "interact") {
    if (across(p, loc) > 40) return;
    const s = sceneFor(player, e, i, "interact");
    const vars = guideVars(COLOR_CYAN, 0, 1.15);
    try {
      for (const b of interactBlocks(s, player, obj, loc)) drawBlockOutline(player, b.x, b.y, b.z, vars);
    } catch {
      // unloaded
    }
    return;
  }
  if (across(p, loc) > Math.max(40, radiusOf(obj) + 20)) return;
  const gy = loc.y ?? groundAt(player.dimension, loc.x, loc.z, p.y, false, onBed(obj.place)) ?? p.y;
  const col = playerIn(player, obj) ? COLOR_GREEN : COLOR_GOLD;
  drawStandingPad(player, player.dimension, loc.x, gy, loc.z, col, ZONE_GUIDES.has(obj.type) ? radiusOf(obj) : 0);
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/** Players whose progress changed since the last tracker draw: the tracker redraws on the next loop. @type {Set<string>} */
export const progressed = new Set();

/** Tick until which another note owns a player's actionbar: the tracker waits. @type {Map<string, number>} */
export const holdUntil = new Map();

/**
 * The tracker's rank among steady lines above the hotbar (`steady` in its `realm:actionbar`): a higher one (a Relics
 * readout, a run line, build mode, the Elytra HUD) keeps the bar and the tracker waits; a lower one waits for it.
 */
export const TRACKER_STEADY = 20;

/** Tick until which our own note owns the line the tracker uses. @type {Map<string, number>} */
export const ownUntil = new Map();

/** Does this player see the tracker off the action bar (in a Side HUD box, not above the hotbar)? @param {Player} player */
export const inMiddle = (player) => getFor(player, "trackerAt") !== "hotbar";

/** The tracker and progress notes in a Side HUD box (scripts/side.js, the side boxes protocol). */
export const side = sideBoxes("saga");

/**
 * Shows a line for a while: in the player's Side HUD box (hud_rp; other add-ons that redraw the action bar
 * every tick can't cover it), or above the hotbar for players who chose that.
 * @param {Player} player @param {string} text @param {number} ticks @param {number} [steady] the tracker's rank (its own redraws, not notes)
 */
export function showLine(player, text, ticks, steady) {
  const where = getFor(player, "trackerAt");
  if (isSlot(where)) {
    // Side HUD's quest box, next to the box the player picked (the questCode says which).
    side.show(player, "quest", questCode(where) + text, ticks);
    return;
  }
  send("realm:actionbar", steady ? { player: player.id, ticks, from: PACK, steady } : { player: player.id, ticks, from: PACK });
  player.onScreenDisplay.setActionBar(text);
}

/**
 * A progress note. With the tracker in a Side HUD box it shows in the small box at the place the player picked (a
 * second readout, "saga/note"), so the quest box beside it stays; when another pack's readout is in that box, or above
 * the hotbar, it takes the tracker's place and the tracker waits while it shows.
 * @param {Player} player @param {string} text @param {number} ticks
 */
export function note(player, text, ticks = 40) {
  const where = getFor(player, "trackerAt");
  if (isSlot(where) && !side.taken(player, where)) {
    side.show(player, where, text, ticks, "note");
    return;
  }
  ownUntil.set(player.id, system.currentTick + ticks);
  showLine(player, text, ticks);
}

/** Who hears the report for an entry. @param {Entry} e */
export const reportTo = (e) => e.chapter.end ?? e.chapter.npc ?? e.story.giver;

/**
 * Sets or adds progress on one objective; tells the player when it's done, and when the chapter is.
 * @param {Player} player @param {Entry} e @param {number} i @param {number} n @param {boolean} [absolute] set to n instead of adding
 */
export function bump(player, e, i, n, absolute = false) {
  const obj = e.chapter.objectives[i];
  if (!obj) return false;
  const need = target(obj);
  e.st.o ??= [];
  const before = e.st.o[i] ?? 0;
  if (before >= need) return false;
  const after = Math.max(0, Math.min(need, absolute ? Math.floor(n) : before + n));
  if (after === before) return false;
  e.st.o[i] = after;
  const x = (e.st.x ??= {});
  if (obj.within && before === 0 && after > 0 && after < need) x[`t${i}`] = Date.now();
  if (after === 0 || after >= need) delete x[`t${i}`];
  markDirty(player);
  progressed.add(player.id);
  if (after >= need) {
    player.sendMessage(`§a[Story] ${obj.optional ? "Optional: " : ""}${obj.label}: done.`);
    player.playSound("random.orb", { pitch: 1.2, volume: 0.6 });
    const saga = sagaOf(player);
    // A party quest's flags, bonuses and sky requests belong to the mates whose chapter it is: they get them when
    // the progress reaches their own entry (party.js).
    if (!e.pq) finishObj(player, e, i, saga);
    if (obj.optional) return true; // the chapter's own steps didn't move
    if (chapterDone(e, saga)) {
      const to = npcName(reportTo(e));
      const wv = /** @type {any} */ (e.st);
      if (e.pq) player.sendMessage(`§6[Party] ${e.story.title}: "${e.chapter.title}" is done. Your party mates on it report to ${to}.`);
      else if (e.wv && (wv.g || wv.tn)) player.sendMessage(`§6[Story] ${e.chapter.title}: done.`);
      else if (e.wv) player.sendMessage(`§6[Story] Job done: go back to ${to} for your reward.`);
      else if (e.fav) player.sendMessage(`§6[Story] Favor done: go back to ${to} for your reward.`);
      else player.sendMessage(`§6[Story] ${e.story.title}: "${e.chapter.title}" is done. Go back to ${to} to hear what happens.`);
      player.playSound("random.levelup", { pitch: 1.3, volume: 0.6 });
    } else {
      const next = currentStep(e, saga);
      if (next >= 0) player.sendMessage(`§e[Story] Next: ${e.chapter.objectives[next].label}`);
    }
  } else if (need >= 4 && obj.type !== "collect" && obj.type !== "deliver" && !(isSlot(getFor(player, "trackerAt")) && getFor(player, "tracker") === true)) {
    // A note above the hotbar at each quarter (the tracker's box counts down by itself: no note over it).
    const step = need / 4;
    if (Math.floor(before / step) !== Math.floor(after / step)) note(player, `§b${e.story.short}: §f${countdown(obj, after)} ${after}/${need}${obj.type === "survive" || obj.type === "vigil" ? " s" : obj.type === "ride" ? " blocks" : ""}`);
  }
  return true;
}

/**
 * What an objective does once it is done: the rest of its "either" group ends, its flags are set, an
 * optional objective's bonus is given, and a sky request made "on done" is sent.
 * @param {Player} player @param {Entry} e @param {number} i @param {Saga} saga
 */
function finishObj(player, e, i, saga) {
  const obj = e.chapter.objectives[i];
  for (const k of orMates(e, i, saga)) endScene(player.id, objKey(e, k));
  if (obj.set && Object.keys(obj.set).length) {
    for (const [k, v] of Object.entries(obj.set)) setFlag(saga, e.story.id, k, v);
    invalidate(player.id);
  }
  if (obj.bonus) {
    const got = reward(player, obj.bonus, `Story: ${e.story.title}`);
    player.sendMessage(`§a[Story] Bonus for "${obj.label}"${got ? `: §7${got}` : "!"}`);
  }
  if (obj.sky && obj.sky.on === "done") askSky(player, obj.sky, `${e.story.id}:${e.chapter.id}`);
}

/** Unfinished objectives of the player, by type (rebuilt when their chapters change). @type {WeakMap<Entry[], Map<string, { e: Entry, i: number, obj: Objective }[]>>} */
const indexes = new WeakMap();

/** @param {Player} player */
function byType(player) {
  const list = entries(player);
  let idx = indexes.get(list);
  if (!idx) {
    idx = new Map();
    for (const e of list)
      e.chapter.objectives.forEach((obj, i) => {
        const arr = idx?.get(obj.type) ?? [];
        arr.push({ e, i, obj });
        idx?.set(obj.type, arr);
      });
    indexes.set(list, idx);
  }
  return idx;
}

/**
 * Objectives a helper does for their party mates (on a party quest, party.js): not the ones that are about the
 * mate themselves (a story character to meet, an escort, a riddle, items in their own pack...). @type {Set<string>}
 */
const SOLO = new Set(["meet", "inspect", "stealth", "escort", "lead", "defend", "follow", "vision", "answer", "wait", "sleep", "wear"]);
/** Does this objective count for the player? Always, but on a party quest only what a helper can do. @param {Entry} e @param {Objective} obj */
export const helps = (e, obj) => !e.pq || (!SOLO.has(obj.type) && !obj.race);

/** The player's unfinished objectives of a type that exist for them now. @param {Player} player @param {Objective["type"]} type */
export function open(player, type) {
  const items = byType(player).get(type);
  if (!items) return [];
  const saga = sagaOf(player);
  return items.filter(({ e, i, obj }) => helps(e, obj) && active(e, i, saga));
}

/**
 * Adds progress to every unfinished objective of a type that `amountFor` gives an amount for.
 * Returns the keys of the objectives that matched, so party mates can share exactly those.
 * @param {Player} player @param {Objective["type"]} type
 * @param {(obj: Objective, e: Entry, i: number) => number} amountFor @param {Set<string>} [only]
 */
export function advance(player, type, amountFor, only) {
  /** @type {Set<string>} */
  const keys = new Set();
  if (!counting(player)) return keys;
  for (const { e, i, obj } of open(player, type)) {
    const key = objKey(e, i);
    if (only && !only.has(key)) continue;
    const n = amountFor(obj, e, i);
    if (n <= 0) continue;
    keys.add(key);
    bump(player, e, i, n);
  }
  return keys;
}

/** Party mates (Parties pack) close enough to share progress. @param {Player} player */
export function mates(player) {
  if (get("partyShare") !== true) return [];
  const tag = player.getTags().find((t) => t.startsWith("realm_party:"));
  if (!tag) return [];
  const range = Number(get("partyRange")) || 64;
  const dim = player.dimension.id;
  const at = player.location;
  return world.getAllPlayers().filter((p) => p.id !== player.id && p.dimension.id === dim && p.hasTag(tag) && dist3(p.location, at) <= range);
}

/**
 * Gives the same progress to party mates on the same objectives (each mate once: `credited`).
 * @param {Player} player @param {Set<string>} keys @param {Objective["type"]} type @param {(obj: Objective, e: Entry, i: number) => number} amountFor @param {Set<string>} credited
 */
function share(player, keys, type, amountFor, credited) {
  if (!keys.size) return;
  for (const mate of mates(player)) {
    if (credited.has(mate.id)) continue;
    credited.add(mate.id);
    // The party's main-story chapter is shared by the party sync (party.js), wherever the mates are: not twice.
    const view = partyViews.get(mate.id);
    const prefix = view ? `${view.story.id}:${view.chapter.id}:` : "";
    advance(mate, type, amountFor, prefix ? new Set([...keys].filter((k) => !k.startsWith(prefix))) : keys);
  }
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

/**
 * The Kitchen pack's dishes and rare ingredients (name -> the food item, and for dishes "rare" when it is
 * a rare dish). Kept in step with packs/cooking_bp/scripts/recipes.js by hand (packs can't import each
 * other). A delivery of one of these must be the real thing: the right item with the Kitchen's lore, not
 * a cheaper food renamed on an anvil (an anvil can't add lore).
 * @type {Record<string, { item: string, rare?: boolean, ingredient?: boolean, alsoAny?: string }>}
 */
const KITCHEN = {
  "harbor chowder": { item: "minecraft:rabbit_stew" },
  "fisherman's breakfast": { item: "minecraft:cooked_salmon" },
  "miner's pasty": { item: "minecraft:baked_potato" },
  "garden salad": { item: "minecraft:beetroot_soup" },
  "hearty porridge": { item: "minecraft:mushroom_stew" },
  "campfire kebab": { item: "minecraft:cooked_mutton" },
  "warden's ration": { item: "minecraft:bread" },
  "glow berry tart": { item: "minecraft:cookie" },
  "honey-glazed ham": { item: "minecraft:cooked_porkchop" },
  "spiced pumpkin soup": { item: "minecraft:mushroom_stew" },
  "climber's trail mix": { item: "minecraft:cookie" },
  "rabbit ragout": { item: "minecraft:rabbit_stew" },
  "pathfinder's carrots": { item: "minecraft:golden_carrot" },
  "smith's hotpot": { item: "minecraft:mushroom_stew" },
  "sweet berry roll": { item: "minecraft:bread" },
  "mystery stew": { item: "minecraft:mushroom_stew" },
  "hiccup cookies": { item: "minecraft:cookie" },
  "gambler's goulash": { item: "minecraft:rabbit_stew" },
  "storm eel pie": { item: "minecraft:pumpkin_pie", rare: true },
  "frost pepper soup": { item: "minecraft:beetroot_soup", rare: true },
  "ember truffle risotto": { item: "minecraft:mushroom_stew", rare: true },
  "moon salt roast": { item: "minecraft:cooked_beef", rare: true },
  "golden harvest loaf": { item: "minecraft:bread", rare: true },
  "champion's heart stew": { item: "minecraft:rabbit_stew", rare: true },
  "starwright bread": { item: "minecraft:bread", rare: true },
  "lantern cake": { item: "minecraft:pumpkin_pie", rare: true },
  "hearthkeeper's feast": { item: "minecraft:rabbit_stew", rare: true },
  "champion's heart": { item: "minecraft:beetroot", ingredient: true },
  "storm eel": { item: "minecraft:cod", ingredient: true, alsoAny: "minecraft:cod" },
  "frost pepper": { item: "minecraft:light_blue_dye", ingredient: true },
  "glow honey": { item: "minecraft:honeycomb", ingredient: true },
  "starwright flour": { item: "minecraft:sugar", ingredient: true },
  "ember truffle": { item: "minecraft:magma_cream", ingredient: true },
  "moon salt": { item: "minecraft:quartz", ingredient: true },
  "harvest saffron": { item: "minecraft:orange_dye", ingredient: true },
};

/** Is a stack named as a Kitchen dish or ingredient the real thing (its item and the Kitchen's lore)? @param {ItemStack} stack @param {string} key */
function kitchenOk(stack, key) {
  const k = KITCHEN[key];
  if (!k) return true;
  /** @type {string[]} */
  let lore = [];
  try {
    lore = stack.getLore();
  } catch {
    return false;
  }
  if (k.ingredient) {
    if (stack.typeId === k.item && lore[0] === "§7Rare ingredient") return true;
    return !!k.alsoAny && stack.typeId === k.alsoAny && /^§7\d+ cm$/.test(lore[0] ?? ""); // a Storm Eel from Fishing
  }
  // A dish made since the Kitchen marks its lore with its own name: a rare dish renamed to another of the same food fails.
  // Older dishes have no mark and are still taken.
  const mark = lore.find((l) => l.startsWith("§8Dish: "));
  if (mark !== undefined && nameKey(mark.slice("§8Dish: ".length)) !== key) return false;
  return stack.typeId === k.item && lore.includes(k.rare ? "§6Rare dish" : "§8Kitchen dish");
}

/**
 * A name as typed at an anvil, for comparing: no color codes, any case, single spaces, and a phone keyboard's curly
 * apostrophe or quotes the same as straight ones ("Lily\u2019s Marble" is "lily's marble"). @param {string} s
 */
const nameKey = (s) =>
  plain(s)
    .replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Does a stack match an item and/or a custom name (either may be left out)? @param {ItemStack | undefined} stack @param {string | undefined} item @param {string} [name] */
function same(stack, item, name) {
  if (!stack || (item !== undefined && stack.typeId !== item)) return false;
  if (name === undefined) return true;
  const key = nameKey(name);
  return nameKey(stack.nameTag ?? "") === key && kitchenOk(stack, key);
}

/** @param {Player} player @param {string | undefined} item @param {string} [name] */
export function countItem(player, item, name) {
  let n = 0;
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return 0;
    for (let i = 0; i < inv.size; i++) {
      const stack = inv.getItem(i);
      if (same(stack, item, name)) n += /** @type {ItemStack} */ (stack).amount;
    }
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
  return n;
}

// stash-bridge:begin
/**
 * Items Expansive Inventory (stash_bp) keeps on saved pages count toward a collect step, which would otherwise never see
 * what its page routing moved off the active page. It asks (realm:stash_count_ask { player, item?, name? }) and
 * stash_bp answers with realm:stash_count { player, item?, name?, rev, part, parts, rows: [{ id, name?, lore?, n }] },
 * one row per kind on saved pages, split over `parts` messages; a realm:stash_changed { player, rev } says the saved
 * pages changed. A step with only a name is asked too: the rows are matched here with the same rules as live items.
 * Parts of one revision are assembled and used only when complete; a reply of an older revision than the last notice
 * is stale and dropped. countItem is untouched: deliveries and every other reader still see only the live inventory.
 * Without stash_bp nothing answers: after one wait of STASH_WAIT ticks the step counts the live inventory alone.
 * Once stash_bp has spoken this session (an answer or a notice) it is installed, so a missing answer is a failure
 * (a page it couldn't read says so with { unknown: true }, or a message was lost), never "nothing saved": the step
 * then counts the live inventory but never lowers its progress, and asks again every STASH_RETRY ticks.
 * @type {Map<string, { id: string, name?: string, lore?: string[], n: number }[]>}
 */
const stashRows = new Map();
/** When each unanswered ask was sent (tick). @type {Map<string, number>} */
const stashAsked = new Map();
/** Parts of an answer received so far. @type {Map<string, { rev?: string, parts: number, got: Map<number, { id: string, name?: string, lore?: string[], n: number }[]> }>} */
const stashParts = new Map();
/** The newest committed revision a notice named, per player. @type {Map<string, string>} */
const stashRev = new Map();
/** Ticks to wait for an answer before counting without it. */
const STASH_WAIT = 40;
/** Ticks before a step whose answer is missing asks again. */
const STASH_RETRY = 200;
/** stash_bp answered or sent a notice this session: it is installed. */
let stashHeard = false;

/** @param {Player} player @param {Objective} obj */
const stashKey = (player, obj) => `${player.id}|${obj.item ?? ""}|${obj.name ?? ""}`;

/**
 * What a collect step has: the live inventory plus the saved pages. Undefined while stash_bp's answer is pending,
 * so a count taken between a page move and its answer can't make progress dip. When stash_bp is installed but its
 * answer is missing, the live count, but never less than the progress the step already has (`had`).
 * @param {Player} player @param {Objective} obj @param {number} [had] the step's progress now
 * @returns {number | undefined}
 */
function collectCount(player, obj, had = 0) {
  const live = countItem(player, obj.item, obj.name);
  const key = stashKey(player, obj);
  let rows = stashRows.get(key);
  if (!rows) {
    const now = system.currentTick;
    const asked = stashAsked.get(key);
    if (asked === undefined) {
      stashAsked.set(key, now);
      send("realm:stash_count_ask", { player: player.id, item: obj.item, name: obj.name });
      return undefined;
    }
    if (now - asked < STASH_WAIT) return undefined;
    if (stashHeard) {
      // Installed but no answer: what the pages hold is unknown, not zero. Keep what the step has; ask again later.
      if (now - asked >= STASH_RETRY) {
        stashAsked.set(key, now);
        stashParts.delete(key);
        send("realm:stash_count_ask", { player: player.id, item: obj.item, name: obj.name });
      }
      return Math.max(live, had);
    }
    stashAsked.delete(key);
    stashParts.delete(key);
    rows = [];
    stashRows.set(key, rows);
  }
  let hidden = 0;
  for (const r of rows) {
    const lore = r.lore ?? [];
    const stack = /** @type {ItemStack} */ (/** @type {unknown} */ ({ typeId: r.id, nameTag: r.name, getLore: () => lore }));
    if (same(stack, obj.item, obj.name)) hidden += r.n;
  }
  return live + hidden;
}

/** @param {string} message */
function stashCountReply(message) {
  try {
    const m = JSON.parse(message);
    if (!m || typeof m.player !== "string") return;
    stashHeard = true;
    const key = `${m.player}|${typeof m.item === "string" ? m.item : ""}|${typeof m.name === "string" ? m.name : ""}`;
    if (m.unknown === true) {
      // stash_bp couldn't read a page: count without it now (never lowering), and ask again after STASH_RETRY.
      if (!stashRows.has(key)) stashAsked.set(key, system.currentTick - STASH_WAIT);
      return;
    }
    if (!Array.isArray(m.rows)) return;
    const rev = typeof m.rev === "string" ? m.rev : undefined;
    const known = stashRev.get(m.player);
    if (known !== undefined && rev !== known) return;
    const parts = Number.isInteger(m.parts) && m.parts > 1 ? m.parts : 1;
    const part = Number.isInteger(m.part) && m.part >= 1 && m.part <= parts ? m.part : 1;
    const rows = [];
    for (const r of m.rows) {
      if (r && typeof r.id === "string" && Number.isInteger(r.n) && r.n > 0) {
        rows.push({ id: r.id, name: typeof r.name === "string" ? r.name : undefined, lore: Array.isArray(r.lore) ? r.lore.map(String) : undefined, n: r.n });
      }
    }
    let pending = stashParts.get(key);
    if (!pending || pending.rev !== rev || pending.parts !== parts) {
      pending = { rev, parts, got: new Map() };
      stashParts.set(key, pending);
    }
    pending.got.set(part, rows);
    if (pending.got.size < parts) return;
    stashParts.delete(key);
    /** @type {typeof rows} */
    const all = [];
    for (let i = 1; i <= parts; i++) all.push(.../** @type {typeof rows} */ (pending.got.get(i)));
    const was = JSON.stringify(stashRows.get(key));
    stashRows.set(key, all);
    stashAsked.delete(key);
    if (was !== JSON.stringify(all)) invChanged.add(m.player);
  } catch {
    // an unreadable answer is ignored; the step keeps what it had
  }
}

/** The saved pages changed: what stash_bp said before is stale until it answers again. @param {string} message */
function stashChanged(message) {
  try {
    const m = JSON.parse(message);
    if (!m || typeof m.player !== "string") return;
    stashHeard = true;
    if (typeof m.rev === "string") stashRev.set(m.player, m.rev);
    for (const map of [stashRows, stashAsked, stashParts]) for (const key of [...map.keys()]) if (key.startsWith(`${m.player}|`)) map.delete(key);
    invChanged.add(m.player);
  } catch {
    // ignored
  }
}

/** A player left: forget what the bridge knew and asked for them. @param {string} pid */
function stashForget(pid) {
  stashRev.delete(pid);
  for (const map of [stashRows, stashAsked, stashParts]) for (const key of [...map.keys()]) if (key.startsWith(`${pid}|`)) map.delete(key);
}
// stash-bridge:end

onScriptEvent(["realm:stash_count", "realm:stash_changed"], ({ id, message }) => {
  if (id === "realm:stash_count") stashCountReply(message);
  else if (id === "realm:stash_changed") stashChanged(message);
});

/**
 * Takes up to `max` of an item. Without `name`, renamed items are never taken; with it, only items
 * with that name are. Returns how many were taken.
 * @param {Player} player @param {string | undefined} item @param {number} max @param {string} [name]
 */
function takeItem(player, item, max, name) {
  let taken = 0;
  try {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return 0;
    for (let i = 0; i < inv.size && taken < max; i++) {
      const stack = inv.getItem(i);
      if (!stack || !same(stack, item, name) || (name === undefined && stack.nameTag)) continue;
      const k = Math.min(stack.amount, max - taken);
      if (k >= stack.amount) inv.setItem(i, undefined);
      else {
        stack.amount -= k;
        inv.setItem(i, stack);
      }
      taken += k;
    }
  } catch (e) {
    console.warn(`[saga] take ${item}: ${e}`);
  }
  return taken;
}

/**
 * Gives an item; what doesn't fit drops at the player's feet. Returns true if some dropped.
 * @param {Player} player @param {string} item @param {number} amount @param {string} [name] @param {string[]} [lore]
 */
export function giveItem(player, item, amount, name, lore) {
  let dropped = false;
  let left = Math.max(1, Math.floor(amount));
  const inv = player.getComponent("minecraft:inventory")?.container;
  const max = new ItemStack(item, 1).maxAmount;
  while (left > 0) {
    const stack = new ItemStack(item, Math.min(max, left));
    if (name) stack.nameTag = name;
    if (lore?.length) {
      try {
        stack.setLore(lore.slice(0, 20).map((l) => String(l).slice(0, 50)));
      } catch {
        // lore isn't allowed on this item
      }
    }
    left -= stack.amount;
    const rest = inv ? inv.addItem(stack) : stack;
    if (rest) {
      player.dimension.spawnItem(rest, player.location);
      dropped = true;
    }
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/**
 * Gives a reward (levels and Crowns cut by `penalty` after a hint); returns what this pack gave itself.
 * @param {Player} player @param {Reward | undefined} r @param {string} source @param {number} [penalty]
 */
export function reward(player, r, source, penalty = 0) {
  if (!r) return "";
  /** @type {string[]} */
  const given = [];
  const keep = 1 - Math.max(0, Math.min(1, penalty));
  const levels = Math.round((r.levels ?? 0) * keep);
  const crowns = Math.round((r.crowns ?? 0) * keep);
  try {
    if (levels > 0) {
      player.addLevels(levels);
      given.push(`${levels} level${levels === 1 ? "" : "s"}`);
    }
  } catch (e) {
    console.warn(`[saga] levels: ${e}`);
  }
  for (const it of r.items ?? []) {
    try {
      const dropped = giveItem(player, it.item, it.amount, it.name, it.lore);
      given.push(`${it.amount} ${it.name ? `"${plain(it.name)}"` : itemName(it.item)}${dropped ? " (some dropped at your feet: your inventory is full)" : ""}`);
    } catch (e) {
      console.warn(`[saga] reward ${it.item}: ${e}`);
    }
  }
  if (crowns > 0 && addCrowns(player, crowns)) player.sendMessage(`§6+${crowns} Crowns §7(${source})`);
  const cut = penalty > 0 && ((r.levels ?? 0) > levels || (r.crowns ?? 0) > crowns);
  // These belong to other packs, which tell the player themselves (nothing happens without them).
  if (r.relic) send("realm:relic_give", { player: player.id, relic: r.relic });
  if (r.relicRoll?.relics.length && Math.random() < r.relicRoll.chance) send("realm:relic_give", { player: player.id, relic: r.relicRoll.relics[Math.floor(Math.random() * r.relicRoll.relics.length)] });
  if (r.skill && r.skill.amount > 0) send("realm:skill_xp", { player: player.id, skill: r.skill.skill, amount: Math.round(r.skill.amount * keep) });
  if (r.title) send("realm:title_unlock", { player: player.id, title: r.title, from: PACK });
  if (r.journal) send("realm:journal", { player: player.id, page: "story", entry: r.journal.entry, label: r.journal.label });
  if (r.codex) grantCodex(player, sagaOf(player), r.codex);
  return given.join(", ") + (cut ? " (less for the hint)" : "");
}

/**
 * Adds a codex entry unless the save could not hold it even after the trim flush() may do (the old tracking list, finished
 * favors, the oldest codex entries), so a nearly full save still takes the newest entry. Stories, flags and the entry itself are never trimmed.
 * @param {Player} player @param {Saga} saga @param {{ id: string, title: string }} codex
 */
export function grantCodex(player, saga, codex) {
  saga.cx ??= [];
  if (saga.cx.includes(codex.id)) return;
  if (!codexFits(saga, codex.id)) {
    console.warn(`[saga] ${player.name}: codex entry ${codex.id} refused, the save is full`);
    player.sendMessage(`§c[Codex] Your saved progress is full, so "${codex.title}" was not added.`);
    return;
  }
  saga.cx.push(codex.id);
  markDirty(player);
  player.sendMessage(`§d[Codex] New entry: ${codex.title} §7(read it in /realm:saga, Codex)`);
}

function crownsObjective() {
  try {
    return world.scoreboard.getObjective("crowns") ?? world.scoreboard.addObjective("crowns", "Crowns");
  } catch {
    return world.scoreboard.getObjective("crowns"); // another pack added it this tick
  }
}

/** A player's Crowns (0 for a brand-new player with no score yet). @param {Player} p */
export function crownsOf(p) {
  try {
    return crownsObjective()?.getScore(p) ?? 0;
  } catch {
    return 0;
  }
}

/** Takes Crowns if the player has them. @param {Player} p @param {number} n */
export function takeCrowns(p, n) {
  if (n <= 0) return true;
  if (crownsOf(p) < n) return false;
  return addCrowns(p, -n);
}

/** @param {Player} p @param {number} n */
function addCrowns(p, n) {
  try {
    const obj = crownsObjective();
    if (!obj) return false;
    obj.addScore(p, Math.floor(n));
    return true;
  } catch (e) {
    console.warn(`[saga] crowns: ${e}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Weather (overworld): the stable API can't read it, so remember the last change
// ---------------------------------------------------------------------------

const PROP_WEATHER = "saga:weather";
export let weather = "Clear";
world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension !== OVERWORLD && dimension !== "overworld") return;
  weather = newWeather;
  try {
    world.setDynamicProperty(PROP_WEATHER, newWeather);
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

export function loadWeather() {
  try {
    const saved = world.getDynamicProperty(PROP_WEATHER);
    if (saved === "Rain" || saved === "Thunder") weather = saved;
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
}

/** Does the weather suit a survive/vigil objective? @param {Objective} obj @param {string} dim */
export function weatherOk(obj, dim) {
  const want = obj.weather ?? (obj.type === "survive" ? "thunder" : undefined);
  if (!want || want === "any") return true;
  if (dim !== OVERWORLD) return false;
  if (want === "thunder") return weather === "Thunder";
  return weather === "Rain" || weather === "Thunder";
}

/**
 * The Weather Almanac's plan (realm:weather_plan, asked for with realm:weather_ask at start), for "due in" times.
 * @type {{ next: { weather: string, at: number }[] } | undefined}
 */
let weatherPlan;
onScriptEvent(
  "realm:weather_plan",
  ({ id, message }) => {
    if (id !== "realm:weather_plan") return;
    try {
      const msg = JSON.parse(message);
      weatherPlan = msg && !msg.off && Array.isArray(msg.next) ? { next: msg.next.filter((/** @type {any} */ s) => s && typeof s.weather === "string" && Number.isFinite(s.at)) } : undefined;
    } catch {
      weatherPlan = undefined;
    }
  },
);

/**
 * "wait for a thunderstorm (due in about 6 min)" while the weather doesn't suit a survive/vigil objective, else
 * undefined. The time comes from the Weather Almanac's plan, when it's installed.
 * @param {Objective} obj
 */
export function weatherWait(obj) {
  if (obj.type !== "survive" && obj.type !== "vigil") return undefined;
  const want = obj.weather ?? (obj.type === "survive" ? "thunder" : undefined);
  if (want !== "thunder" && want !== "rain") return undefined;
  if (weatherOk(obj, OVERWORLD)) return undefined;
  const now = Date.now();
  const due = weatherPlan?.next.find((s) => s.at > now && (s.weather === "Thunder" || (want === "rain" && s.weather === "Rain")));
  const what = want === "thunder" ? "a thunderstorm" : "rain";
  return due ? `wait for ${what} (due in about ${Math.max(1, Math.ceil((due.at - now) / 60000))} min)` : `wait for ${what}`;
}

/**
 * "wait for nightfall (in about 4 min)" while a vigil's time of day hasn't come, else undefined. A Minecraft day is
 * 24000 ticks, 20 minutes.
 * @param {Objective} obj
 */
export function timeWait(obj) {
  if ((obj.type !== "survive" && obj.type !== "vigil") || !obj.timeOfDay) return undefined;
  if (inWindow(obj)) return undefined;
  const [a] = obj.timeOfDay;
  const t = world.getTimeOfDay();
  const what = a >= 12000 && a < 16000 ? "nightfall" : a >= 16000 && a < 20000 ? "midnight" : a < 1000 || a >= 23000 ? "dawn" : "the right time of day";
  return `wait for ${what} (in about ${Math.max(1, Math.ceil((((a - t + 24000) % 24000) / 1200)))} min)`;
}

/** Nothing over the player's head (the sky can see them). @param {Player} player */
export function outdoors(player) {
  try {
    const at = player.location;
    const top = player.dimension.getTopmostBlock({ x: Math.floor(at.x), z: Math.floor(at.z) });
    // Tall grass or a flower at your feet is fine; a block 2 over your feet is a roof.
    return !top || top.location.y <= Math.floor(at.y) + 1;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Champions (Champions pack, or our own fallback)
// ---------------------------------------------------------------------------

/** Recurring Wanderers' ids (an escort of one hides the wanderer pack's own copy). */
const WANDERER_IDS = new Set(WANDERERS.map((w) => w.id));

/** Champion tag -> time (ms) it may be asked for again. @type {Map<string, number>} */
const championNext = new Map();
/** Is this tag a story champion's (a story's, a favor's, or a wanderer encounter's)? @param {string} tag */
export const isChampionTag = (tag) => championTags.has(tag) || WANDER_CHAMPION.test(tag);
/** Champion tags the stories use. */
export const championTags = new Set(
  [...STORIES.flatMap((s) => s.chapters.flatMap((c) => c.objectives.map((o) => o.champion?.tag ?? ""))), ...FAVORS.map((f) => f.objective?.champion?.tag ?? "")].filter(Boolean),
);
/** Champion objectives by tag (for adds). @type {Map<string, Objective>} */
const championObj = new Map();
/**
 * Objectives (by key) and champion tags whose mobs are the Gray Choir: they get the tag
 * `saga:choir` (the Relics pack's Gray Choir Mask halves their damage).
 */
const CHOIR = new Set();
{
  const choirish = /choir|cantor|gray ring|grey ring|enforcer|cultist|hooded/i;
  for (const s of STORIES)
    for (const c of s.chapters)
      c.objectives.forEach((o, i) => {
        const text = [o.label, o.guards?.name, o.champion?.name, o.place === "choir_ring" ? "choir" : ""].join(" ");
        if (!choirish.test(text)) return;
        CHOIR.add(`${s.id}:${c.id}:${i}`);
        if (o.champion) CHOIR.add(o.champion.tag);
      });
}
for (const s of STORIES) for (const c of s.chapters) for (const o of c.objectives) if (o.champion) championObj.set(o.champion.tag, o);

/** Is a champion with this tag loaded anywhere in the dimension? @param {string} tag @param {Dimension} dim */
function championAlive(tag, dim) {
  try {
    // Only a living mob counts: an item that got the tag (a world whose entity ids repeat) loses it.
    return dim.getEntities({ tags: [tag] }).some((e) => {
      if (e.getComponent("minecraft:health")) return true;
      e.removeTag(tag);
      return false;
    });
  } catch {
    return false;
  }
}

/** Illagers the story spawns never carry a banner (killing a captain would give Bad Omen). @param {Entity} ent */
export function noBanner(ent) {
  if (ent.typeId !== "minecraft:pillager" && ent.typeId !== "minecraft:vindicator") return;
  try {
    ent.runCommand("replaceitem entity @s slot.armor.head 0 air");
  } catch {
    // nothing worn
  }
}

/**
 * Mobs the Champions pack can turn into champions (its default `mobs`). For any other story mob (an elder
 * guardian, a pillager, a phantom) it would spawn one of these instead, so those are always our own.
 */
const CHAMPION_MOBS = new Set(["minecraft:zombie", "minecraft:husk", "minecraft:drowned", "minecraft:zombie_villager_v2", "minecraft:skeleton", "minecraft:stray", "minecraft:spider", "minecraft:creeper", "minecraft:witch"]);

const WATER_MOBS = new Set(["minecraft:guardian", "minecraft:elder_guardian", "minecraft:drowned", "minecraft:squid", "minecraft:glow_squid", "minecraft:dolphin"]);
/** Mobs at home under water: they may spawn on a lake or sea bed (everything else comes at the water's surface). */
const SWIMMERS = new Set([...WATER_MOBS, "minecraft:pufferfish", "minecraft:cod", "minecraft:salmon", "minecraft:tropicalfish", "minecraft:axolotl", "minecraft:turtle", "minecraft:tadpole"]);
/** A place built on a lake or sea bed (the Sunken Bell, the Tide Seal): who and what is there stays on the bottom. @param {string | undefined} name */
const onBed = (name) => !!name && infoOf(name).site === "water";

/** The nearest water within 24 blocks of a spot (a sea mob's champion swims there), or undefined. @param {Dimension} dim @param {Vector3} at */
function waterNear(dim, at) {
  for (let r = 0; r <= 24; r += 3) {
    const steps = r === 0 ? 1 : Math.max(8, Math.round((r * 2 * Math.PI) / 3));
    for (let k = 0; k < steps; k++) {
      const x = Math.floor(at.x + Math.cos((k / steps) * Math.PI * 2) * r);
      const z = Math.floor(at.z + Math.sin((k / steps) * Math.PI * 2) * r);
      try {
        const top = dim.getTopmostBlock({ x, z });
        if (!top) continue;
        // The topmost block may be the water itself, or the sea floor under it.
        for (const y of [top.location.y, top.location.y + 1]) {
          const b = dim.getBlock({ x, y, z });
          if (b?.isLiquid && b.typeId.includes("water")) return { x: x + 0.5, y, z: z + 0.5 };
        }
      } catch {
        // unloaded
      }
    }
  }
  return undefined;
}

/**
 * Asks for the story champion when the player comes close to its place (or, for a champion with no
 * place, near the player; at night only when the objective says `night`).
 * @param {Player} player @param {Objective} obj
 */
function championNear(player, obj) {
  const champ = obj.champion;
  if (!champ) return;
  const dim = player.dimension;
  /** @type {Vector3} */
  let at;
  const loc = locate(obj);
  if (loc === undefined) {
    if (obj.night && !nightMet()) return;
    const p = player.location;
    const a = Math.random() * Math.PI * 2;
    const x = p.x + Math.cos(a) * 10;
    const z = p.z + Math.sin(a) * 10;
    at = { x, y: groundAt(dim, x, z, p.y, false, SWIMMERS.has(champ.mob)) ?? p.y, z };
  } else {
    if (typeof loc === "string" || loc.pending || player.dimension.id !== loc.dim) return;
    if (across(player.location, loc) > radiusOf(obj)) return;
    at = { x: loc.x + 0.5, y: loc.y ?? player.location.y, z: loc.z + 0.5 };
  }
  const now = Date.now();
  watchAdds(champ.tag, dim, player);
  if ((championNext.get(champ.tag) ?? 0) > now) return;
  if (championAlive(champ.tag, dim)) {
    championNext.set(champ.tag, now + 10000);
    return;
  }
  if (WATER_MOBS.has(champ.mob)) at = waterNear(dim, at) ?? at;
  championNext.set(champ.tag, now + Number(get("championRetrySeconds")) * 1000);
  const viaPack = CHAMPION_MOBS.has(champ.mob);
  if (viaPack) send("realm:champion_spawn", { dim: dim.id, x: at.x, y: at.y, z: at.z, mob: champ.mob, trait: champ.trait, name: champ.name, tag: champ.tag, health: champ.health });
  if (champ.warn) player.sendMessage(`§c[Story] ${champ.warn}`);
  const spawnAt = at;
  // No Champions pack (or a mob it can't make)? Spawn a tougher named mob ourselves, so the story can still be finished.
  system.runTimeout(() => {
    try {
      if (championAlive(champ.tag, dim)) return;
      // Nothing came: ask again in 5 seconds rather than after championRetrySeconds.
      if (viaPack && get("championFallback") !== true) return void championNext.set(champ.tag, Date.now() + 5000);
      const mob = spawnFresh(dim, champ.mob, spawnAt);
      mob.nameTag = `§c${champ.name}`;
      mob.addTag(CHAMPION_TAG);
      trackChampion(mob);
      mob.addTag(champ.tag);
      if (CHOIR.has(champ.tag) || champ.tag.startsWith("realm:saga:whc_")) mob.addTag("saga:choir");
      noBanner(mob);
      const boost = champ.health ? Math.max(0, Math.min(30, Math.ceil(champ.health / 4) - 1)) : 4;
      mob.addEffect("health_boost", LONG, { amplifier: boost, showParticles: false });
      mob.addEffect("resistance", LONG, { amplifier: 1, showParticles: false });
      mob.addEffect("strength", LONG, { amplifier: 1, showParticles: false });
      mob.addEffect("fire_resistance", LONG, { amplifier: 0, showParticles: false });
      // Fill up the boosted health a moment later (healing effects would hurt undead mobs).
      system.runTimeout(() => {
        try {
          if (mob.isValid) mob.getComponent("minecraft:health")?.resetToMaxValue();
        } catch {
          // gone
        }
      }, 2);
    } catch (e) {
      console.warn(`[saga] champion fallback: ${e}`);
      championNext.set(champ.tag, Date.now() + 5000);
    }
  }, 60);
}

/** At half health a champion calls its adds (once). @param {string} tag @param {Dimension} dim @param {Player} player */
function watchAdds(tag, dim, player) {
  const obj = championObj.get(tag);
  const adds = obj?.champion?.adds;
  if (!adds?.mobs?.length) return;
  try {
    for (const champ of dim.getEntities({ tags: [tag] })) {
      if (champ.hasTag("saga:adds")) continue;
      const hp = champ.getComponent("minecraft:health");
      if (!hp || hp.currentValue > hp.effectiveMax / 2) continue;
      champ.addTag("saga:adds");
      player.sendMessage(`§c[Story] ${obj?.champion?.name ?? "The champion"} calls for help!`);
      spawnGroup(player, dim, champ.location, adds, tag, 3, 6);
    }
  } catch {
    // unloaded
  }
}

/**
 * A story champion died: credit the killer, the helpers and their party mates on that objective.
 * @param {string} tag @param {string[]} ids @param {Vector3 | undefined} at @param {string | undefined} dim
 */
export function championSlain(tag, ids, at, dim) {
  /** @param {Objective} obj */
  const amountFor = (obj) => (obj.champion?.tag === tag ? 1 : 0);
  /** @type {Set<string>} */
  const credited = new Set();
  /** @type {Player[]} */
  const players = [];
  for (const id of ids) {
    const p = online(id);
    if (p && !credited.has(p.id)) {
      credited.add(p.id);
      players.push(p);
    }
  }
  // Everyone close by working on it counts as a helper, so a shared fight is never lost.
  if (at && dim) {
    for (const p of world.getAllPlayers()) {
      if (credited.has(p.id) || p.dimension.id !== dim || dist3(p.location, at) > 32) continue;
      credited.add(p.id);
      players.push(p);
    }
  }
  for (const p of players) share(p, advance(p, "defeat", amountFor), "defeat", amountFor, credited);
}

/** Can `b` be seen from `a`: nothing but air, water or plants between (checked every half block)? @param {Dimension} dim @param {Vector3} a @param {Vector3} b */
function inSight(dim, a, b) {
  const d = dist3(a, b);
  try {
    for (let k = 0.5; k < d - 0.3; k += 0.5) {
      const f = k / d;
      const blk = dim.getBlock({ x: Math.floor(a.x + (b.x - a.x) * f), y: Math.floor(a.y + (b.y - a.y) * f), z: Math.floor(a.z + (b.z - a.z) * f) });
      if (!blk || !openBlock(blk)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawns story mobs (an ambush, adds, a wrong answer) around a point: real fights, removed later.
 * @param {Player} player @param {Dimension} dim @param {Vector3} at @param {{ mobs: string[], count: number }} group @param {string} key @param {number} [min] @param {number} [max]
 */
export function spawnGroup(player, dim, at, group, key, min = 4, max = 8) {
  /** @type {Entity[]} */
  const out = [];
  const n = Math.max(0, Math.min(24, Math.floor(group.count ?? 1)));
  /** The middle's height for land mobs (false: on the water's surface) and for swimmers (true: may be the bed). @type {Map<boolean, number>} */
  const mids = new Map();
  for (let k = 0; k < n; k++) {
    const type = group.mobs[k % group.mobs.length];
    const deep = SWIMMERS.has(type);
    // Somewhere a mob can stand and that can be seen from the middle (not inside the rock around a room
    // underground, or in a cave next to it): closer in each try, else the middle.
    /** @type {Vector3 | undefined} */
    let spot;
    let y0 = mids.get(deep);
    if (y0 === undefined) mids.set(deep, (y0 = groundAt(dim, at.x, at.z, at.y, false, deep) ?? at.y));
    for (let tries = 0; tries < 8 && !spot; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = (min + Math.random() * (max - min)) * (1 - tries / 8);
      const x = at.x + Math.cos(a) * d;
      const z = at.z + Math.sin(a) * d;
      const y = groundAt(dim, x, z, y0, true, deep);
      if (y === undefined) continue;
      const eye = { x: at.x, y: y0 + 1.5, z: at.z };
      // A swimmer on the bed may be out of a straight line from the middle (the shore's edge is in the way): it counts
      // when the open water over it reaches a surface that can be seen.
      let top;
      if (inSight(dim, eye, { x, y: y + 1.5, z }) || (deep && (top = waterTop(dim, x, y, z)) !== undefined && inSight(dim, eye, { x, y: top + 0.5, z }))) spot = { x, y, z };
    }
    spot ??= { x: at.x, y: y0, z: at.z };
    const ent = spawnActor(dim, type, spot, { owner: player.id, key, role: "add" });
    if (ent && (CHOIR.has(key) || key.startsWith("realm:saga:whc_"))) ent.addTag("saga:choir");
    if (ent) noBanner(ent);
    if (ent) out.push(ent);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Events that count
// ---------------------------------------------------------------------------

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  try {
    if (deadEntity instanceof Player) {
      cancelInteractions(deadEntity.id); // a form open when they died would hide the respawn screen
      for (const s of scenes.values()) if (s.pid === deadEntity.id && s.kind === "defend" && s.state === "run") defendFail(s, "You fell.");
      return;
    }
    const actor = actors.get(deadEntity.id);
    if (actor) {
      actors.delete(deadEntity.id);
      const s = scenes.get(sk(actor.owner, actor.key));
      if (s && actor.role === "escort") escortFail(s);
      else if (s && actor.role === "ward") defendFail(s, `${s.e.chapter.objectives[s.i].ward?.name ?? "The one you were guarding"} fell.`);
      if (actor.role !== "add") return;
    }
    let tags = /** @type {string[]} */ ([]);
    let at;
    let dim;
    try {
      tags = deadEntity.getTags();
      at = deadEntity.location;
      dim = deadEntity.dimension.id;
    } catch {
      // gone already
    }
    const killer = damageSource.damagingEntity;
    if (tags.includes(CHAMPION_TAG)) {
      const tag = tags.find((t) => isChampionTag(t));
      if (tag) championSlain(tag, killer instanceof Player ? [killer.id] : [], at, dim);
      return;
    }
    if (!(killer instanceof Player) || !at || !dim) return;
    const type = deadEntity.typeId;
    const night = nightMet();
    const where = at;
    const d = dim;
    // A story mob that came for a `defeat` with `spawn` counts even if the fight drifted past the edge.
    const spawned = actor?.role === "add";
    /** @param {Objective} obj */
    const amountFor = (obj) => (!obj.champion && !obj.bounty && (!obj.mobs?.length || obj.mobs.includes(type)) && (!obj.night || night) && (inArea(obj, where, d) || (spawned && !!obj.spawn)) ? 1 : 0);
    share(killer, advance(killer, "defeat", amountFor), "defeat", amountFor, new Set([killer.id]));
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

/** Blocks players placed lately, "dim:x,y,z": breaking one again isn't mining. @type {Set<string>} */
const placed = new Set();
/** Placed blocks that counted for a place objective: position -> "player|objective key". @type {Map<string, string>} */
const counted = new Map();
/** @param {string} dim @param {Vector3} p */
const spot = (dim, p) => `${dim}:${p.x},${p.y},${p.z}`;

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  try {
    const key = spot(block.dimension.id, block.location);
    placed.delete(key);
    placed.add(key);
    if (placed.size > PLACED_MEMORY) placed.delete(/** @type {string} */ (placed.values().next().value));
    const type = block.typeId;
    const b = block.location;
    const dim = block.dimension.id;
    if (counted.has(key)) return; // the same block reported twice
    for (const { e, i, obj } of open(player, "place")) {
      if (!counting(player)) break;
      if (obj.blocks?.length && !obj.blocks.includes(type)) continue;
      if (!inArea(obj, b, dim)) continue;
      if (bump(player, e, i, 1)) {
        counted.set(key, `${player.id}|${objKey(e, i)}`);
        if (counted.size > PLACED_MEMORY) counted.delete(/** @type {string} */ (counted.keys().next().value));
      }
      break;
    }
  } catch {
    // ignore
  }
});

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation }) => {
  try {
    const key = spot(block.dimension.id, block.location);
    const was = counted.get(key);
    if (was) {
      counted.delete(key);
      const [pid, okey] = was.split("|");
      if (pid === player.id) {
        const hit = open(player, "place").find(({ e, i }) => objKey(e, i) === okey);
        if (hit) bump(player, hit.e, hit.i, -1);
      }
    }
    const id = brokenBlockPermutation.type.id;
    // Broken by a hit the hit event missed (it sees air when the block breaks at once): still a touch.
    // Mining the block it just hit is the same touch.
    const last = lastTouch.get(player.id);
    if (!last || last.at !== key || system.currentTick - last.tick > 200) touchedAt(player, id, block.dimension.id, block.location);
    if (placed.delete(key)) return;
    advance(player, "mine", (obj) => (!obj.blocks?.length || obj.blocks.includes(id) ? 1 : 0));
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

/** The block each player last touched, and when ("dim:x,y,z", tick): a hit that breaks it is one touch. @type {Map<string, { at: string, tick: number }>} */
const lastTouch = new Map();

/** A tap or a hit on a block counts for interact objectives and finds inspect clues. @param {Player} player @param {import("@minecraft/server").Block} block */
function touched(player, block) {
  touchedAt(player, block.typeId, block.dimension.id, block.location);
}

/**
 * A touch of a block of `type` at `b` (also a block broken by a hit: an end rod or a candle breaks at
 * the first hit, before the hit event can see it).
 * @param {Player} player @param {string} type @param {string} dim @param {Vector3} b
 */
function touchedAt(player, type, dim, b) {
  lastTouch.set(player.id, { at: spot(dim, b), tick: system.currentTick });
  advance(player, "interact", (obj) => {
    if (!obj.blocks?.includes(type)) return 0;
    const loc = locate(obj);
    if (!loc || typeof loc === "string") return obj.place ? 0 : 1; // no place given: anywhere counts
    if (loc.dim !== dim || loc.pending) return 0;
    const d = loc.y === undefined ? across(b, loc) : Math.hypot(b.x - loc.x, b.y - loc.y, b.z - loc.z);
    return d <= radiusOf(obj) ? 1 : 0;
  });
  if (counting(player)) for (const { e, i, obj } of open(player, "inspect")) inspectTouch(player, e, i, obj, { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 }, dim);
}

/** Last "use" per player (tick): a use and a tap on a block are one use. @type {Map<string, number>} */
const lastUse = new Map();

/** @param {Player} player @param {string} item */
function used(player, item) {
  const now = system.currentTick;
  if (now - (lastUse.get(player.id) ?? -100) < 10) return;
  lastUse.set(player.id, now);
  advance(player, "use", (obj) => (obj.item === item && playerIn(player, obj) ? 1 : 0));
}

/** Is a block a bed? @param {string} id */
const isBed = (id) => id === "minecraft:bed" || id === "minecraft:straw_bed" || (!id.startsWith("minecraft:") && id.endsWith("_bed"));

/**
 * With the daylight cycle off, vanilla refuses the bed by day, so `isSleeping` never turns true: a tap on a
 * bed counts as the night's sleep, and the step's vision waits for the next tick (queued like a real dream).
 * @param {Player} player @param {import("@minecraft/server").Block} block
 */
function bedWhileStopped(player, block) {
  if (timeMoves() || !isBed(block.typeId) || !counting(player)) return;
  for (const { e, i, obj } of open(player, "sleep")) {
    bump(player, e, i, 1);
    if (obj.vision?.length) dreams.set(player.id, obj.vision);
  }
}

world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, isFirstEvent, beforeItemStack }) => {
  if (!isFirstEvent) return;
  try {
    touched(player, block);
    bedWhileStopped(player, block);
    if (beforeItemStack) used(player, beforeItemStack.typeId);
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  try {
    if (source instanceof Player && itemStack) used(source, itemStack.typeId);
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

/** Tick of each player's last counted hit: holding the button down is one strike, not many. @type {Map<string, number>} */
const lastHit = new Map();

// "Strike the bell": most players hit it rather than use it, so a hit counts like a tap.
world.afterEvents.entityHitBlock.subscribe(({ damagingEntity, hitBlock }) => {
  if (!(damagingEntity instanceof Player)) return;
  try {
    const now = system.currentTick;
    if (now - (lastHit.get(damagingEntity.id) ?? -100) < 6) return;
    lastHit.set(damagingEntity.id, now);
    touched(damagingEntity, hitBlock);
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

// Fishing, as Daily Quests does it: a hook belongs to the player nearest to where it appears, and an
// item that appears where a hook just was is that player's catch.
/** @type {Map<string, { hook: Entity, owner: Player, dim: string, at: Vector3, seen: number }>} */
const hooks = new Map();

/** Did an item appear at a player's head (dropped, not caught)? @param {Dimension} dim @param {Vector3} at */
function droppedAt(dim, at) {
  for (const p of dim.getPlayers({ location: at, maxDistance: 3 })) {
    try {
      const head = p.getHeadLocation();
      if (Math.hypot(head.x - at.x, head.y - at.y, head.z - at.z) < 1.2) return true;
    } catch {
      // gone
    }
  }
  return false;
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (entity.typeId === "minecraft:fishing_hook") {
      const [owner] = entity.dimension.getPlayers({ location: entity.location, maxDistance: 4, closest: 1 });
      if (owner && open(owner, "fish").length) hooks.set(entity.id, { hook: entity, owner, dim: entity.dimension.id, at: entity.location, seen: system.currentTick });
      return;
    }
    if (entity.typeId !== "minecraft:item" || !hooks.size) return;
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    if (!stack) return;
    const at = entity.location;
    for (const [id, h] of hooks) {
      if (h.dim !== entity.dimension.id) continue;
      if (Math.abs(h.at.x - at.x) > 3 || Math.abs(h.at.y - at.y) > 3 || Math.abs(h.at.z - at.z) > 3) continue;
      // An item dropped from the inventory appears at a player's head, not at the hook: fish dropped next to a hook
      // close by (fishing off a dock) aren't a catch.
      if (droppedAt(entity.dimension, at)) return;
      hooks.delete(id);
      const type = stack.typeId;
      const amount = stack.amount;
      if (h.owner.isValid) advance(h.owner, "fish", (obj) => (!obj.items?.length || obj.items.includes(type) ? amount : 0));
      break;
    }
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

system.runInterval(() => {
  if (!hooks.size) return;
  for (const [id, h] of hooks) {
    if (h.hook.isValid) {
      try {
        h.at = h.hook.location;
        h.seen = system.currentTick;
      } catch {
        // unloaded
      }
    } else if (system.currentTick - h.seen > 20) hooks.delete(id);
  }
}, 2);

/** Animals each player fed or tamed for an objective (each animal counts once). @type {Map<string, Set<string>>} */
const tended = new Map();
/** Was the animal tamed before the interaction? (entity id -> true/false) @type {Map<string, boolean>} */
const tamedBefore = new Map();

/** @param {Entity} ent */
function isTamed(ent) {
  try {
    if (ent.getComponent("minecraft:is_tamed")) return true;
    const t = ent.getComponent("minecraft:tameable");
    const m = ent.getComponent("minecraft:tamemount");
    return !!(t?.isTamed || m?.isTamed);
  } catch {
    return false;
  }
}

world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.cancel) return; // another pack already stopped this tap
  const { player, target } = ev;
  try {
    const a = actors.get(target.id);
    if (a && a.role !== "lead") {
      ev.cancel = true; // no trading with a story villager, no handing items to a ghost
      if (a.owner === player.id && a.role === "meet") system.run(() => meetTap(player, a.key));
      return;
    }
    if (!a && target.hasTag(ACTOR)) {
      ev.cancel = true; // a leftover not yet removed (it goes when its chunk loads)
      return;
    }
    if (!tamedBefore.has(target.id)) {
      const before = isTamed(target);
      tamedBefore.set(target.id, before);
      system.runTimeout(() => tamedBefore.delete(target.id), 220);
    }
  } catch {
    // ignore
  }
});

world.afterEvents.playerInteractWithEntity.subscribe(({ player, target, beforeItemStack }) => {
  try {
    if (!counting(player)) return;
    const type = target.typeId;
    const id = target.id;
    for (const { e, i, obj } of open(player, "tend")) {
      if (obj.mobs?.length && !obj.mobs.includes(type)) continue;
      if (obj.item && beforeItemStack?.typeId !== obj.item) continue;
      if (!playerIn(player, obj)) continue;
      const k = `${player.id}|${objKey(e, i)}`;
      const set = tended.get(k) ?? new Set();
      if (set.has(id)) continue;
      set.add(id);
      tended.set(k, set);
      bump(player, e, i, 1);
    }
    const tames = open(player, "tame").filter(({ obj }) => !obj.mobs?.length || obj.mobs.includes(type));
    if (!tames.length || tamedBefore.get(id) === true) return;
    // Taming takes effect a moment later (a horse bucks for a while): look again a few times.
    for (const delay of [10, 40, 100, 200]) {
      system.runTimeout(() => {
        try {
          if (!target.isValid || !player.isValid || !isTamed(target)) return;
          for (const { e, i, obj } of open(player, "tame")) {
            if (obj.mobs?.length && !obj.mobs.includes(type)) continue;
            const k = `tame|${player.id}|${objKey(e, i)}`;
            const set = tended.get(k) ?? new Set();
            if (set.has(id)) continue;
            set.add(id);
            tended.set(k, set);
            bump(player, e, i, 1);
          }
        } catch {
          // ignore
        }
      }, delay);
    }
  } catch (e) {
    console.warn(`[saga] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Talk and deliver (from the Townsfolk pack's realm:npc_talk)
// ---------------------------------------------------------------------------

/** Counts talk objectives and takes deliveries for an NPC. @param {Player} player @param {string} npc */
export function talked(player, npc) {
  if (!counting(player)) return;
  for (const { e, i, obj } of open(player, "talk")) if (obj.npc === npc) bump(player, e, i, 1);
  for (const { e, i, obj } of open(player, "deliver")) {
    if (obj.npc !== npc || (!obj.item && !obj.name)) continue;
    const need = target(obj) - progressOf(e, i);
    if (need <= 0) continue;
    const got = takeItem(player, obj.item, need, obj.name);
    const name = obj.name ? `"${plain(obj.name)}"` : itemName(obj.item ?? "");
    if (got > 0) {
      player.sendMessage(`§e[Story] You give ${npcName(npc)} ${got} ${name} (${progressOf(e, i) + got}/${target(obj)}).`);
      bump(player, e, i, got);
    } else if (!obj.optional) {
      // An optional delivery isn't nagged about: the player may never bring it.
      const kitchen = obj.name && KITCHEN[plain(obj.name).trim().toLowerCase()] ? " It must be the real thing, from the Kitchen (a renamed item won't do)." : "";
      player.sendMessage(`§7[Story] ${npcName(npc)} still needs ${need} ${name}.${obj.name ? kitchen : " Renamed items are never taken."}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Scenes: one per player and objective that needs runtime state
// ---------------------------------------------------------------------------

/**
 * @typedef {object} SceneState
 * @property {string} kind
 * @property {string} pid
 * @property {string} key
 * @property {Entry} e
 * @property {number} i
 * @property {number} seen loop run it was last visited
 * @property {number} [farSince] tick the player went far away
 * @property {any} [state]
 * @property {any} [data]
 */

/** @type {Map<string, SceneState>} */
export const scenes = new Map();
/** @param {string} pid @param {string} key */
const sk = (pid, key) => `${pid}|${key}`;
let run = 0;

/** @param {Player} player @param {Entry} e @param {number} i @param {string} kind @returns {SceneState} */
function sceneFor(player, e, i, kind) {
  const key = objKey(e, i);
  let s = scenes.get(sk(player.id, key));
  if (!s || s.kind !== kind) {
    s = { kind, pid: player.id, key, e, i, seen: run, data: {} };
    scenes.set(sk(player.id, key), s);
  }
  s.e = e;
  s.seen = run;
  return s;
}

/** Ends a scene: its characters and story mobs go. @param {string} pid @param {string} key @param {boolean} [effect] */
export function endScene(pid, key, effect = false) {
  const s = scenes.get(sk(pid, key));
  if (s?.data) s.data.interactJob = undefined; // its background scan stops
  scenes.delete(sk(pid, key));
  removeActors({ owner: pid, key }, effect);
  // The animals fed or tamed for it count again next time (the same daily favor on a later day, a reset chapter).
  tended.delete(`${pid}|${key}`);
  tended.delete(`tame|${pid}|${key}`);
}

/** Ends every scene of a player (they left, or their stories were reset). @param {string} pid */
export function endScenesOf(pid) {
  for (const s of [...scenes.values()]) {
    if (s.pid !== pid) continue;
    if (s.data) s.data.interactJob = undefined;
    scenes.delete(sk(s.pid, s.key));
  }
  removeActors({ owner: pid });
  for (const k of [...tended.keys()]) if (k.startsWith(`${pid}|`) || k.startsWith(`tame|${pid}|`)) tended.delete(k);
}

/** The far-away timer: true once the player has been away long enough for the scene to end. @param {SceneState} s @param {boolean} near */
function tooFar(s, near) {
  if (near) {
    delete s.farSince;
    return false;
  }
  s.farSince ??= system.currentTick;
  return system.currentTick - s.farSince > (Number(get("actorTimeoutSeconds")) || 300) * 20;
}

/** Where a story character stands at a place: a prefab feature named for it, else beside the spot. @param {Objective} obj @param {Loc} loc @param {string} [id] */
function standSpot(obj, loc, id) {
  if (obj.place) {
    const f = (id && featureSpot(obj.place, id)) || featureSpot(obj.place, "actor");
    if (f) return f;
  }
  const dim = world.getDimension(loc.dim);
  const x = loc.x + 2.5;
  const z = loc.z + 0.5;
  const y = groundAt(dim, x, z, loc.y, false, onBed(obj.place));
  return y === undefined ? undefined : { x, y, z };
}

// ---- meet --------------------------------------------------------------

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function meetTick(player, e, i, obj) {
  const s = sceneFor(player, e, i, "meet");
  const loc = locate(obj);
  if (!loc || typeof loc === "string" || loc.pending || !obj.who) return;
  const near = player.dimension.id === loc.dim && across(player.location, loc) <= 48;
  if (tooFar(s, near)) {
    removeActors({ owner: player.id, key: s.key });
    return;
  }
  if (!near) return;
  let [a] = actorsOf(player.id, s.key, "meet");
  if (!a || !a.ent.isValid) {
    const at = standSpot(obj, loc, obj.who.id);
    if (!at) return;
    const ent = spawnActor(world.getDimension(loc.dim), obj.who.entity, at, { owner: player.id, key: s.key, role: "meet", name: `§e${obj.who.name}`, invul: true, anchor: true, look: obj.who.look });
    if (!ent) return;
    [a] = actorsOf(player.id, s.key, "meet");
    player.sendMessage(`§e[Story] ${obj.who.name} is here. Walk up to them to talk.`);
  }
  if (!a) return;
  if (busy.has(player.id) || system.currentTick < (s.data.cool ?? 0)) return;
  if (dist3(player.location, a.ent.location) <= radiusOf(obj)) runMeet(player, s).catch((err) => console.warn(`[saga] meet: ${err}`));
}

/** A tap on a meet character. @param {Player} player @param {string} key */
function meetTap(player, key) {
  const s = scenes.get(sk(player.id, key));
  if (s && s.kind === "meet") runMeet(player, s).catch((err) => console.warn(`[saga] meet: ${err}`));
}

/** The conversation with a story character, and its choice. @param {Player} player @param {SceneState} s */
async function runMeet(player, s) {
  const { e, i } = s;
  const obj = e.chapter.objectives[i];
  if (!obj.who || !counting(player)) return;
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    if (objDone(e, i, saga)) return;
    const choices = (obj.choices ?? []).filter((c) => requires(c.requires, saga, e.story.id, player).ok);
    const pages = pagesFor(obj.pages, saga, e.story.id, player.name);
    const pick = await dialog(player, obj.who?.name ?? "", "", pages, choices.length ? choices.map((c) => c.label) : ["Goodbye"]);
    if (pick < 0 || !player.isValid) {
      s.data.cool = system.currentTick + 300; // walked away: ask again in 15 s (a tap works any time)
      return;
    }
    if (objDone(e, i, sagaOf(player))) return;
    const choice = choices[pick];
    if (choice && !e.fav) {
      applyChoice(saga, e.story, `${e.chapter.id}#${i}`, choice);
      giveRep(player, choice.rep, saga, e.story);
      invalidate(player.id);
      markDirty(player, true);
    }
    bump(player, e, i, 1);
    const key = s.key;
    const pid = player.id;
    s.data.keepUntil = system.currentTick + 170;
    system.runTimeout(() => removeActors({ owner: pid, key }, true), 160);
    if (choice?.reply?.length) await dialog(player, obj.who?.name ?? "", "", pagesFor(choice.reply, saga, e.story.id, player.name), ["OK"]);
  });
}

// ---- inspect -----------------------------------------------------------

/** Where clue k is (cached per scene once the ground is loaded). @param {SceneState} s @param {Objective} obj @param {number} k */
function clueSpot(s, obj, k) {
  s.data.spots ??= [];
  const hit = s.data.spots[k];
  if (hit) return hit;
  const c = obj.clues?.[k];
  if (!c) return undefined;
  /** @type {{ dim: string, x: number, y?: number, z: number } | undefined} */
  let p;
  if (obj.place) p = placeSpot(obj.place, { x: c.dx, y: c.dy, z: c.dz });
  else {
    const loc = locate(obj);
    if (loc && typeof loc !== "string") p = { dim: loc.dim, x: loc.x + c.dx, y: loc.y !== undefined && c.dy !== undefined ? loc.y + c.dy : undefined, z: loc.z + c.dz };
  }
  if (!p) return undefined;
  let y = p.y;
  if (y === undefined) {
    const base = obj.place ? placesOf()[obj.place]?.y : undefined;
    y = groundAt(world.getDimension(p.dim), p.x, p.z, base, false, onBed(obj.place));
    if (y === undefined) return undefined;
  }
  const out = { dim: p.dim, x: Math.floor(p.x) + 0.5, y: y + 0.5, z: Math.floor(p.z) + 0.5 };
  s.data.spots[k] = out;
  return out;
}

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function inspectTick(player, e, i, obj) {
  const s = sceneFor(player, e, i, "inspect");
  if (!alive(player)) return;
  const loc = locate(obj);
  if (!loc || typeof loc === "string" || loc.pending || player.dimension.id !== loc.dim || across(player.location, loc) > 48) return;
  const bits = e.st.x?.[String(i)] ?? 0;
  const p = player.location;
  (obj.clues ?? []).forEach((_, k) => {
    if (bits & (1 << k)) return;
    const c = clueSpot(s, obj, k);
    if (!c) return;
    try {
      player.spawnParticle("minecraft:villager_happy", { x: c.x, y: c.y + 0.3, z: c.z });
      player.spawnParticle("minecraft:villager_happy", { x: c.x + 0.3, y: c.y + 0.6, z: c.z - 0.2 });
    } catch {
      // unloaded
    }
    if (guidesOn(player)) {
      drawBlockOutline(player, Math.floor(c.x), Math.floor(c.y) - 1, Math.floor(c.z), guideVars(COLOR_CYAN, 0, 1.15));
      drawBlockOutline(player, Math.floor(c.x), Math.floor(c.y), Math.floor(c.z), guideVars(COLOR_GOLD, 1, 1.15));
    }
    if (across(p, c) <= 1.6 && Math.abs(p.y - c.y) <= 2.5) clueFound(player, e, i, obj, k);
  });
}

/** A tap or hit near a clue. @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj @param {Vector3} at @param {string} dim */
function inspectTouch(player, e, i, obj, at, dim) {
  if (!alive(player)) return;
  const s = scenes.get(sk(player.id, objKey(e, i)));
  if (!s) return;
  const bits = e.st.x?.[String(i)] ?? 0;
  (obj.clues ?? []).forEach((_, k) => {
    if (bits & (1 << k)) return;
    const c = clueSpot(s, obj, k);
    if (c && c.dim === dim && dist3(c, at) <= 2.2) clueFound(player, e, i, obj, k);
  });
}

/**
 * A clue found: saved, counted, and told in chat (the whole text stays in the chat history). No form: it would open by
 * itself, in the middle of a fight, and hold the player (and their respawn screen) until they answered.
 * @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj @param {number} k
 */
function clueFound(player, e, i, obj, k) {
  const x = (e.st.x ??= {});
  const bits = x[String(i)] ?? 0;
  if (bits & (1 << k)) return;
  x[String(i)] = bits | (1 << k);
  const saga = sagaOf(player);
  const clue = obj.clues?.[k];
  const text = clue ? pagesFor([clue.text], saga, e.story.id, player.name)[0] ?? "" : "";
  const n = Object.keys(obj.clues ?? []).filter((kk) => x[String(i)] & (1 << Number(kk))).length;
  const total = obj.clues?.length ?? 1;
  player.playSound("random.orb", { pitch: 1.6, volume: 0.5 });
  player.sendMessage(`§e[Clue ${n}/${total}]§r ${text}`);
  bump(player, e, i, 1);
}

// ---- stealth -----------------------------------------------------------

/** @param {Player} player */
function sneaking(player) {
  try {
    return player.isSneaking;
  } catch {
    return false;
  }
}

/** @param {Player} player @param {{ slot: string, item: string } | undefined} d */
function disguised(player, d) {
  if (!d) return false;
  try {
    const slot = { head: EquipmentSlot.Head, chest: EquipmentSlot.Chest, legs: EquipmentSlot.Legs, feet: EquipmentSlot.Feet }[d.slot];
    return slot !== undefined && player.getComponent("minecraft:equippable")?.getEquipment(slot)?.typeId === d.item;
  } catch {
    return false;
  }
}

/** The stealth area's center and goal. @param {Objective} obj */
function stealthSpots(obj) {
  const loc = locate(obj);
  if (!loc || typeof loc === "string" || loc.pending) return undefined;
  const center = withY(loc);
  if (!center) return undefined;
  /** @type {{ x: number, y?: number, z: number }} */
  let goal = center;
  if (obj.goal) {
    const g = obj.place ? placeSpot(obj.place, { x: obj.goal.dx, z: obj.goal.dz }) : { x: loc.x + obj.goal.dx, z: loc.z + obj.goal.dz };
    if (g) goal = { x: g.x, y: center.y, z: g.z };
  }
  return { loc, center, goal };
}

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function stealthTick(player, e, i, obj) {
  const s = sceneFor(player, e, i, "stealth");
  const sp = stealthSpots(obj);
  if (!sp) return;
  const r = radiusOf(obj);
  const near = player.dimension.id === sp.loc.dim && across(player.location, sp.center) <= r + 32;
  if (!near) {
    if (s.data.guards) {
      removeActors({ owner: player.id, key: s.key });
      delete s.data.guards;
    }
    return;
  }
  if (guidesOn(player)) drawStandingPad(player, player.dimension, sp.goal.x, sp.goal.y ?? sp.center.y, sp.goal.z, COLOR_GOLD, 0);
  if (s.data.guards && s.data.guards.some((/** @type {any} */ g) => g.ent.isValid)) return;
  // Post the guards.
  const g = obj.guards ?? { mob: "minecraft:pillager", count: 2 };
  const n = Math.max(1, Math.min(8, g.count ?? 2));
  const dim = player.dimension;
  removeActors({ owner: player.id, key: s.key });
  s.data.guards = [];
  for (let k = 0; k < n; k++) {
    let gr = Math.max(3, r * (0.35 + (0.55 * (k + 0.5)) / n));
    const ang = (2 * Math.PI * k) / n + Math.random() * 0.5;
    // Rounds where a guard can stand: smaller ones when the place is a room in the rock.
    const deep = SWIMMERS.has(g.mob);
    let y = groundAt(dim, sp.center.x + Math.cos(ang) * gr, sp.center.z + Math.sin(ang) * gr, sp.center.y, true, deep);
    while (y === undefined && gr > 3) {
      gr = Math.max(3, gr * 0.75);
      y = groundAt(dim, sp.center.x + Math.cos(ang) * gr, sp.center.z + Math.sin(ang) * gr, sp.center.y, true, deep);
    }
    const x = sp.center.x + Math.cos(ang) * gr;
    const z = sp.center.z + Math.sin(ang) * gr;
    y ??= groundAt(dim, x, z, sp.center.y, false, deep) ?? sp.center.y;
    const ent = spawnActor(dim, g.mob, { x, y, z }, { owner: player.id, key: s.key, role: "guard", name: g.name ? `§c${g.name}` : undefined, invul: true });
    if (ent && CHOIR.has(s.key)) ent.addTag("saga:choir");
    if (ent) s.data.guards.push({ ent, r: gr, ang, dir: k % 2 ? 1 : -1, yaw: 0, y, pause: 0, flipAt: system.currentTick + 200 + Math.floor(Math.random() * 300) });
  }
  s.data.grace = system.currentTick + 40;
  if (!s.data.told) {
    s.data.told = true;
    const goal = obj.goal ? "reach the spot the tracker shows" : "reach the middle";
    player.sendMessage(`§e[Story] Guards! Sneak (hold sneak) and stay out of their sight to ${goal}. They see you up to ${obj.detect ?? 10} blocks away, ${obj.detectSneak ?? 4} when you sneak${obj.disguise ? ` or wear a ${itemName(obj.disguise.item)}` : ""}, and only in front of them.`);
  }
}

/** Guards walk their rounds and look for the player; reaching the goal finishes it. @param {SceneState} s @param {Player} player */
function stealthFast(s, player) {
  const obj = s.e.chapter.objectives[s.i];
  const guards = s.data.guards;
  if (!guards?.length) return;
  const sp = stealthSpots(obj);
  if (!sp || player.dimension.id !== sp.loc.dim) return;
  const dim = player.dimension;
  const now = system.currentTick;
  for (const gd of guards) {
    if (!gd.ent.isValid) continue;
    let yaw = gd.yaw;
    if (gd.pause > 0) {
      gd.pause--;
      if (gd.pause === 0) gd.dir = -gd.dir;
    } else {
      gd.ang += (0.35 / gd.r) * gd.dir;
      const tx = -Math.sin(gd.ang) * gd.dir;
      const tz = Math.cos(gd.ang) * gd.dir;
      yaw = (Math.atan2(-tx, tz) * 180) / Math.PI;
      if (now >= gd.flipAt) {
        // Stop and look out over the area for two seconds, then walk back the other way.
        gd.pause = 8;
        gd.flipAt = now + 200 + Math.floor(Math.random() * 300);
        yaw = (Math.atan2(-Math.cos(gd.ang), Math.sin(gd.ang)) * 180) / Math.PI;
      }
    }
    const x = sp.center.x + Math.cos(gd.ang) * gd.r;
    const z = sp.center.z + Math.sin(gd.ang) * gd.r;
    const y = groundAt(dim, x, z, gd.y, false, SWIMMERS.has(obj.guards?.mob ?? "")) ?? gd.y;
    gd.y = y;
    gd.yaw = yaw;
    try {
      gd.ent.teleport({ x, y, z }, { rotation: { x: 0, y: yaw } });
    } catch {
      // unloaded
    }
  }
  const p = player.location;
  // The goal.
  if (across(p, sp.goal) <= 2.5 && (sp.goal.y === undefined || Math.abs(p.y - sp.goal.y) < 4)) {
    if (counting(player)) {
      s.data.keepUntil = system.currentTick + 50;
      bump(player, s.e, s.i, 1);
      system.runTimeout(() => endScene(s.pid, s.key, true), 40);
    }
    return;
  }
  if (now < (s.data.grace ?? 0) || !counting(player)) return;
  const hidden = sneaking(player) || disguised(player, obj.disguise);
  const limit = hidden ? obj.detectSneak ?? 4 : obj.detect ?? 10;
  for (const gd of guards) {
    if (!gd.ent.isValid) continue;
    const g = gd.ent.location;
    const eye = { x: g.x, y: g.y + 1.6, z: g.z };
    const target = { x: p.x, y: p.y + 1.2, z: p.z };
    const d = dist3(eye, target);
    if (d > limit) continue;
    if (d > 1.8) {
      const rad = (gd.yaw * Math.PI) / 180;
      const fx = -Math.sin(rad);
      const fz = Math.cos(rad);
      const dx = p.x - g.x;
      const dz = p.z - g.z;
      const len = Math.hypot(dx, dz) || 1;
      if ((fx * dx + fz * dz) / len < 0.5) continue; // outside the 120-degree cone
      try {
        const dir = { x: (target.x - eye.x) / d, y: (target.y - eye.y) / d, z: (target.z - eye.z) / d };
        const hit = dim.getBlockFromRay(eye, dir, { maxDistance: d, includeLiquidBlocks: false, includePassableBlocks: false });
        if (hit) {
          const bl = hit.block.location;
          if (dist3(eye, { x: bl.x + 0.5, y: bl.y + 0.5, z: bl.z + 0.5 }) < d - 1) continue; // behind a wall
        }
      } catch {
        // can't tell: they see you
      }
    }
    spotted(s, player, gd, sp, obj);
    return;
  }
}

/** @param {SceneState} s @param {Player} player @param {any} gd @param {{ center: Vector3 }} sp @param {Objective} obj */
function spotted(s, player, gd, sp, obj) {
  const now = system.currentTick;
  s.data.grace = now + 60;
  const name = obj.guards?.name ?? "A guard";
  player.playSound("raid.horn", { volume: 0.4, pitch: 1.4 });
  if (obj.onSpotted === "ambush" && now >= (s.data.ambushAt ?? 0)) {
    s.data.ambushAt = now + 600;
    player.sendMessage(`§c[Story] ${name} spotted you! The guards attack. Fight them off, or slip away and try again.`);
    spawnGroup(player, player.dimension, gd.ent.location, { mobs: [obj.guards?.mob ?? "minecraft:pillager"], count: Math.max(1, obj.guards?.count ?? 2) }, s.key, 2, 4);
    return;
  }
  // Back to the edge of the area.
  const p = player.location;
  const r = radiusOf(obj) + 4;
  const dx = p.x - sp.center.x;
  const dz = p.z - sp.center.z;
  const len = Math.hypot(dx, dz) || 1;
  const x = sp.center.x + (dx / len) * r;
  const z = sp.center.z + (dz / len) * r;
  const y = groundAt(player.dimension, x, z, sp.center.y) ?? p.y;
  player.sendMessage(`§c[Story] ${name} spotted you! You slip back to the edge before they raise the alarm. Sneak, stay behind them, and try again.`);
  try {
    player.teleport({ x, y, z });
  } catch {
    // unloaded
  }
}

// ---- defeat with spawn -------------------------------------------------

/**
 * A `defeat` at a place whose mobs never come there by themselves (the Choir, vexes, bogged): with `spawn`, a group
 * of them comes when the player is in the area and keeps coming, `count` alive at a time (never more than are left
 * to defeat), topped up every `every` seconds. They go when the player leaves (the scene ends).
 * @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj
 */
function defeatSpawnTick(player, e, i, obj) {
  const sp = obj.spawn;
  const loc = locate(obj);
  if (!sp || !loc || typeof loc === "string" || loc.pending || player.dimension.id !== loc.dim) return;
  const r = radiusOf(obj);
  const d = across(player.location, loc);
  // A little past the edge the fight goes on (the scene and its mobs stay); farther, it ends next run.
  if (d > r + 24) return;
  const s = sceneFor(player, e, i, "defeat");
  const now = system.currentTick;
  const mobs = actorsOf(player.id, s.key, "add").filter((a) => a.ent.isValid);
  // In a fight they don't time out (expireAdds).
  for (const a of mobs) a.born = now;
  if (d > r || (obj.night && !isNight()) || now < (s.data.next ?? 0)) return;
  const left = target(obj) - progressOf(e, i);
  const want = Math.min(Math.max(1, sp.count ?? 3), left) - mobs.length;
  if (want <= 0) return;
  const center = withY(loc);
  if (!center) return;
  if (!s.data.warned) {
    s.data.warned = true;
    player.sendMessage(`§c[Story] ${sp.warn ?? "They're here. Fight!"}`);
    player.playSound("raid.horn", { volume: 0.5, pitch: 1.2 });
  }
  s.data.next = now + Math.max(5, sp.every ?? 20) * 20;
  spawnGroup(player, world.getDimension(loc.dim), center, { mobs: sp.mobs ?? obj.mobs ?? [], count: want }, s.key, 6, Math.max(8, Math.min(16, r / 2)));
}

// ---- escort ------------------------------------------------------------

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function escortTick(player, e, i, obj) {
  const s = sceneFor(player, e, i, "escort");
  if (!obj.who) return;
  // A Recurring Wanderer escorted from their camp: the wanderer pack hides its own copy while ours walks.
  if (WANDERER_IDS.has(obj.who.id) && actorsOf(player.id, s.key, "escort").length && system.currentTick >= (s.data.hideAt ?? 0)) {
    s.data.hideAt = system.currentTick + 200;
    send("realm:wander_hide", { wid: obj.who.id, player: player.id, seconds: 15 });
  }
  const now = system.currentTick;
  const to = locate(obj.to, "the destination");
  if (to && typeof to !== "string" && !to.pending && to.dim === player.dimension.id && across(player.location, to) <= 48 && guidesOn(player)) {
    const ty = to.y ?? groundAt(player.dimension, to.x, to.z, player.location.y) ?? player.location.y;
    drawStandingPad(player, player.dimension, to.x, ty, to.z, COLOR_GOLD, obj.to?.radius ?? 6);
  }
  const [a] = actorsOf(player.id, s.key, "escort");
  if (a?.ent.isValid) {
    const near = a.ent.dimension.id === player.dimension.id && dist3(a.ent.location, player.location) <= 96;
    if (tooFar(s, near)) {
      player.sendMessage(`§e[Story] ${obj.who.name} got tired of waiting and went back. Pick them up again.`);
      endScene(player.id, s.key);
      return;
    }
    // Arrived?
    if (to && typeof to !== "string" && !to.pending && a.ent.dimension.id === to.dim && across(a.ent.location, to) <= (obj.to?.radius ?? obj.radius ?? 6)) {
      if (counting(player)) {
        player.sendMessage(`§a[Story] ${obj.who.name} is safe.`);
        bump(player, e, i, 1);
        const pid = player.id;
        const key = s.key;
        s.data.keepUntil = system.currentTick + 110;
        system.runTimeout(() => endScene(pid, key, true), 100);
      }
      return;
    }
    if (s.state === "wait" && dist3(a.ent.location, player.location) <= 4) {
      s.state = "go";
      s.data.crumbs = [];
      s.data.ptr = 0;
      s.data.lastAmbush = now;
      player.sendMessage(`§e[Story] ${obj.who.name} follows you. Lead them to ${to && typeof to !== "string" ? to.label : "safety"}, and keep them alive.`);
    }
    // Ambushes on the way.
    if (s.state === "go" && obj.ambush?.mobs?.length && now - (s.data.lastAmbush ?? now) >= (obj.ambush.every ?? 30) * 20) {
      s.data.lastAmbush = now;
      const alive = actorsOf(player.id, s.key, "add").filter((x) => x.ent.isValid).length;
      if (alive < (obj.ambush.count ?? 2) * 2) {
        player.sendMessage(`§c[Story] An ambush! Protect ${obj.who.name}!`);
        spawnGroup(player, player.dimension, player.location, { mobs: obj.ambush.mobs, count: obj.ambush.count ?? 2 }, s.key, 10, 14);
      }
    }
    return;
  }
  // Not spawned (or gone): they wait where the escort starts, or beside the player.
  if (now < (s.data.cool ?? 0)) return;
  const from = locate(obj.from, "the start");
  /** @type {Vector3 | undefined} */
  let at;
  let dim = player.dimension;
  if (from && typeof from !== "string") {
    if (from.pending || from.dim !== player.dimension.id || across(player.location, from) > 32) return;
    at = (obj.from?.place && featureSpot(obj.from.place, obj.who.id)) || withY(from);
  } else {
    const p = player.location;
    const y = groundAt(dim, p.x + 2, p.z, p.y);
    at = y === undefined ? undefined : { x: p.x + 2, y, z: p.z };
  }
  if (!at) return;
  const ent = spawnActor(dim, obj.who.entity, at, { owner: player.id, key: s.key, role: "escort", name: `§e${obj.who.name}`, frozen: true, invul: !!obj.who.invul, look: obj.who.look });
  if (!ent) return;
  s.state = "wait";
  player.sendMessage(`§e[Story] ${obj.who.name} is waiting for you. Walk up to them and they will follow.`);
}

/**
 * The escorted character walks the player's own path (always somewhere a body fits): every ESCORT_TICKS a short step
 * along the trail toward the player, faster when they fall behind, facing the way they go. Crumbs are dropped only
 * on the ground, so they don't float after a jump.
 * @param {SceneState} s @param {Player} player
 */
function escortFast(s, player) {
  if (s.state !== "go") return;
  const [a] = actorsOf(s.pid, s.key, "escort");
  if (!a || !a.ent.isValid || a.ent.dimension.id !== player.dimension.id) return;
  const crumbs = s.data.crumbs;
  const p = player.location;
  const last = crumbs[crumbs.length - 1];
  // On the ground, swimming or riding; a crumb 3 blocks back is dropped anyway (a long fall, a jump over a gap).
  const gap = last ? dist3(last, p) : Infinity;
  if (gap >= 1 && (gap >= 3 || player.isOnGround || player.isInWater || !!player.getComponent("minecraft:riding")?.entityRidingOn)) {
    crumbs.push({ x: p.x, y: p.y, z: p.z });
    if (crumbs.length > 80) {
      crumbs.shift();
      s.data.ptr = Math.max(0, s.data.ptr - 1);
    }
  }
  const al = a.ent.location;
  const dp = dist3(al, p);
  if (dp > 32 || dp <= ESCORT_GAP || !crumbs.length) return; // left behind (they wait), or close enough
  let budget = dp > 8 ? ESCORT_RUN : dp > 5 ? ESCORT_HURRY : ESCORT_STEP;
  let ptr = Math.min(s.data.ptr ?? 0, crumbs.length - 1);
  // Far behind (the player ran ahead): skip to at most 12 crumbs back, as before.
  ptr = Math.max(ptr, crumbs.length - 13);
  let pos = { x: al.x, y: al.y, z: al.z };
  while (budget > 0.01 && ptr < crumbs.length) {
    const c = crumbs[ptr];
    if (dist3(c, p) < ESCORT_GAP) break; // don't walk into the player
    const d = dist3(pos, c);
    if (d <= budget) {
      pos = { x: c.x, y: c.y, z: c.z };
      budget -= d;
      ptr++;
    } else {
      const k = budget / d;
      pos = { x: pos.x + (c.x - pos.x) * k, y: pos.y + (c.y - pos.y) * k, z: pos.z + (c.z - pos.z) * k };
      budget = 0;
    }
  }
  s.data.ptr = ptr;
  const dx = pos.x - al.x;
  const dz = pos.z - al.z;
  if (Math.abs(dx) + Math.abs(dz) + Math.abs(pos.y - al.y) < 0.02) return;
  const yaw = Math.abs(dx) + Math.abs(dz) > 0.01 ? (Math.atan2(-dx, dz) * 180) / Math.PI : a.ent.getRotation().y;
  try {
    a.ent.teleport(pos, { rotation: { x: 0, y: yaw } });
    updateActorLabels();
  } catch {
    // unloaded
  }
}

/** The escorted character died: start over. @param {SceneState} s */
function escortFail(s) {
  const obj = s.e.chapter.objectives[s.i];
  const player = online(s.pid);
  removeActors({ owner: s.pid, key: s.key });
  s.state = undefined;
  s.data = { cool: system.currentTick + 100 };
  if (player) {
    player.sendMessage(`§c[Story] ${obj.who?.name ?? "The one you were escorting"} was hurt and ran back${obj.from ? " to where you found them" : ""}. Try again, and keep the monsters off them.`);
    player.playSound("note.bass", { pitch: 0.6 });
  }
}

// ---- lead --------------------------------------------------------------

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function leadTick(player, e, i, obj) {
  if (!obj.mob) return;
  const s = sceneFor(player, e, i, "lead");
  const to = locate(obj.to, "the pen");
  const dim = player.dimension;
  // Animals to bring, waiting where they're lost.
  if (obj.spawnAt) {
    const at = locate(obj.spawnAt, "the lost animal");
    if (at && typeof at !== "string" && !at.pending && at.dim === dim.id) {
      // Leading one home far from where it was lost is not "away": only a player far from both waits it out.
      const leading = actorsOf(player.id, s.key, "lead").some((a) => a.ent.isValid && a.ent.dimension.id === dim.id && dist3(a.ent.location, player.location) <= 48);
      const near = across(player.location, at) <= 40;
      if (tooFar(s, near || leading)) removeActors({ owner: player.id, key: s.key, role: "lead" });
      else if (near) {
        const want = target(obj) - progressOf(e, i);
        const have = actorsOf(player.id, s.key, "lead").filter((a) => a.ent.isValid).length;
        const base = withY(at);
        for (let k = have; k < want && base; k++) {
          const x = base.x + (Math.random() * 4 - 2);
          const z = base.z + (Math.random() * 4 - 2);
          const y = groundAt(dim, x, z, base.y, false, SWIMMERS.has(obj.mob ?? "")) ?? base.y;
          spawnActor(dim, obj.mob, { x, y, z }, { owner: player.id, key: s.key, role: "lead", name: obj.name ? `§e${obj.name}` : undefined, fireproof: false });
          if (k === have) player.sendMessage(`§e[Story] There it is. Put a lead on it (use a lead on the animal) and bring it to ${to && typeof to !== "string" ? to.label : "the pen"}.`);
        }
      }
    }
  }
  if (!to || typeof to === "string" || to.pending || to.dim !== dim.id) return;
  const r = obj.to?.radius ?? 8;
  if (across(player.location, to) <= 48 && guidesOn(player)) {
    const ty = to.y ?? groundAt(dim, to.x, to.z, player.location.y) ?? player.location.y;
    drawStandingPad(player, dim, to.x, ty, to.z, COLOR_GOLD, r);
  }
  if (across(player.location, to) > r + 24) return;
  try {
    const center = { x: to.x, y: to.y ?? player.location.y, z: to.z };
    for (const ent of dim.getEntities({ type: obj.mob, location: center, maxDistance: r + 12 })) {
      if (across(ent.location, to) > r || ent.hasTag("saga:led")) continue;
      const holder = ent.getComponent("minecraft:leashable")?.leashHolder;
      if (!(holder instanceof Player)) continue;
      if (!counting(player)) return;
      ent.addTag("saga:led");
      // It stays: a normal animal from now on.
      if (actors.has(ent.id)) {
        actors.delete(ent.id);
        ent.removeTag(ACTOR);
      }
      bump(player, e, i, 1);
      player.sendMessage(`§a[Story] ${obj.name ? plain(obj.name) : itemName(obj.mob)} is home (${progressOf(e, i)}/${target(obj)}).`);
    }
  } catch {
    // unloaded
  }
}

// ---- defend ------------------------------------------------------------

/** Wards that would fight the player they need protecting by. */
const HOSTILE_WARDS = new Set(["minecraft:witch", "minecraft:evocation_illager", "minecraft:vindicator", "minecraft:pillager", "minecraft:zombie", "minecraft:skeleton", "minecraft:drowned", "minecraft:bogged"]);
/** A wave none of whose monsters fell for this long (stuck in a hole or a wall, out of reach) regroups in sight of the middle. */
const WAVE_STALL_TICKS = 6000;

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function defendTick(player, e, i, obj) {
  const s = sceneFor(player, e, i, "defend");
  const loc = locate(obj);
  if (!loc || typeof loc === "string" || loc.pending) return;
  const center = withY(loc);
  if (!center) return;
  const r = radiusOf(obj);
  const dim = world.getDimension(loc.dim);
  const here = player.dimension.id === loc.dim && across(player.location, loc) <= r;
  const now = system.currentTick;
  const waves = obj.waves ?? [];
  if (s.state !== "run") {
    if (!here || now < (s.data.cool ?? 0) || !counting(player)) return;
    s.state = "run";
    s.data = { mobs: [], next: now + 40, wave: progressOf(e, i) };
    if (obj.ward) {
      const at = (obj.place && featureSpot(obj.place, obj.ward.id)) || center;
      // A ward that is a hostile mob (Vesna is a witch) would attack the player it needs, and no wave
      // mob goes for it anyway: it can't be hurt, and what it throws is removed.
      const hostile = HOSTILE_WARDS.has(obj.ward.entity);
      spawnActor(dim, obj.ward.entity, at, { owner: player.id, key: s.key, role: "ward", name: `§e${obj.ward.name}`, frozen: true, anchor: true, invul: hostile, look: obj.ward.look });
    }
    player.sendMessage(`§c[Story] Hold ${loc.label}!${obj.ward ? ` Keep ${obj.ward.name} alive.` : ""} ${waves.length} wave${waves.length === 1 ? "" : "s"} are coming.`);
    return;
  }
  // Running.
  const away = !here && !(player.dimension.id === loc.dim && across(player.location, loc) <= r * 2 + 16);
  if (away) {
    s.data.awaySince ??= now;
    if (now - s.data.awaySince > 600) return defendFail(s, "You left.");
    // The fight waits for the player: no wave comes or counts meanwhile, and mobs that unload with their chunk
    // (the player ran off) aren't beaten.
    s.data.left = true;
    return;
  }
  delete s.data.awaySince;
  const left = !!s.data.left;
  delete s.data.left;
  let lost = 0;
  s.data.mobs = s.data.mobs.filter((/** @type {Entity} */ m) => {
    try {
      if (!m.isValid) {
        if (left) lost++;
        return false;
      }
      if (across(m.location, loc) > r * 4) {
        removeActor(m.id);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });
  const cur = waves[s.data.wave];
  if (lost && s.data.spawned && cur) {
    // Gone with their chunk while the player was away: they come back.
    player.sendMessage(`§c[Story] The attackers regroup at ${loc.label}!`);
    s.data.mobs.push(...spawnGroup(player, dim, center, { mobs: cur.mobs, count: lost }, s.key, Math.max(6, r * 0.7), Math.max(8, r)));
  }
  if (s.data.mobs.length) {
    // The fight is on with the player here: the wave's monsters don't time out (expireAdds) and only count as
    // beaten when they fall. One none of whose monsters fell for 5 minutes comes again in sight of the middle.
    for (const m of s.data.mobs) {
      const a = actors.get(m.id);
      if (a) a.born = now;
    }
    if (s.data.mobs.length < (s.data.alive ?? Infinity)) s.data.stall = now;
    s.data.alive = s.data.mobs.length;
    if (cur && now - (s.data.stall ?? now) > WAVE_STALL_TICKS) {
      const n = s.data.mobs.length;
      for (const m of s.data.mobs) removeActor(m.id);
      player.sendMessage(`§c[Story] The last attackers regroup at ${loc.label}!`);
      s.data.mobs = spawnGroup(player, dim, center, { mobs: cur.mobs, count: n }, s.key, Math.max(6, r * 0.7), Math.max(8, r));
      s.data.stall = now;
      s.data.alive = s.data.mobs.length;
    }
    return;
  }
  if (s.data.spawned) {
    // A wave is cleared.
    s.data.spawned = false;
    s.data.wave++;
    bump(player, e, i, 1);
    if (s.data.wave >= waves.length) {
      player.sendMessage(`§a[Story] ${loc.label} holds!`);
      const pid = player.id;
      const key = s.key;
      s.data.keepUntil = system.currentTick + 110;
      system.runTimeout(() => endScene(pid, key, true), 100);
      return;
    }
    player.sendMessage(`§e[Story] Wave ${s.data.wave} beaten. Get ready...`);
    s.data.next = now + 100;
    return;
  }
  if (now < s.data.next) return;
  const w = waves[s.data.wave];
  if (!w) return;
  s.data.spawned = true;
  note(player, `§c${e.story.short}: wave ${s.data.wave + 1} of ${waves.length}`, 60);
  s.data.mobs = spawnGroup(player, dim, center, w, s.key, Math.max(6, r * 0.7), Math.max(8, r));
  s.data.stall = now;
  s.data.alive = s.data.mobs.length;
}

/** Test hook (realm:saga_debug `age_adds`): the player's running defenses as if `ticks` passed with no monster falling. @param {string} pid @param {number} ticks */
export function ageDefenses(pid, ticks) {
  for (const s of scenes.values()) if (s.pid === pid && s.kind === "defend" && s.state === "run" && s.data.stall !== undefined) s.data.stall -= ticks;
}

/** A defense failed: everything resets, and it starts again when the player comes back. @param {SceneState} s @param {string} why */
function defendFail(s, why) {
  const player = online(s.pid);
  removeActors({ owner: s.pid, key: s.key });
  s.state = undefined;
  s.data = { cool: system.currentTick + 200 };
  if (!player) return;
  bump(player, s.e, s.i, 0, true);
  player.sendMessage(`§c[Story] ${why} The defense failed: rest, then go back and try again from the first wave.`);
  player.playSound("note.bass", { pitch: 0.5 });
}

// ---- follow ------------------------------------------------------------

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function followTick(player, e, i, obj) {
  const s = sceneFor(player, e, i, "follow");
  if (s.data.pos) return;
  const to = locate(obj.to);
  if (!to || typeof to === "string" || to.pending || to.dim !== player.dimension.id) return;
  const from = locate(obj.from, "where the trail starts");
  const p = player.location;
  if (from && typeof from !== "string") {
    if (from.pending || from.dim !== player.dimension.id || across(p, from) > 10) return;
    const at = withY(from);
    if (!at) return;
    s.data.pos = at;
  } else {
    const dx = to.x - p.x;
    const dz = to.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    s.data.pos = { x: p.x + (dx / len) * 3, y: p.y, z: p.z + (dz / len) * 3 };
  }
  s.data.start = { ...s.data.pos };
  player.sendMessage(`§e[Story] A ${obj.wisp ?? "faint light"} drifts ahead. Follow it; it waits if you fall behind.`);
}

/** The wisp drifts toward the destination along the ground, waiting for the player. @param {SceneState} s @param {Player} player */
function followFast(s, player) {
  const pos = s.data.pos;
  if (!pos) return;
  const obj = s.e.chapter.objectives[s.i];
  const to = locate(obj.to);
  if (!to || typeof to === "string" || to.pending || to.dim !== player.dimension.id) return;
  const dim = player.dimension;
  try {
    dim.spawnParticle("minecraft:endrod", { x: pos.x, y: pos.y + 0.8, z: pos.z });
    dim.spawnParticle("minecraft:endrod", { x: pos.x + 0.2, y: pos.y + 1.1, z: pos.z - 0.2 });
  } catch {
    // unloaded
  }
  const p = player.location;
  const dp = dist3(p, pos);
  const stray = obj.stray ?? 12;
  const now = system.currentTick;
  if (dp > Math.max(48, stray * 4)) {
    s.data.lost ??= now;
    if (now - s.data.lost > 300) {
      delete s.data.lost;
      if (s.data.start) s.data.pos = { ...s.data.start };
      else delete s.data.pos;
      player.sendMessage(`§c[Story] You lost the ${obj.wisp ?? "light"}. It waits where the trail began.`);
    }
    return;
  }
  delete s.data.lost;
  const left = across(pos, to);
  if (left <= 2) {
    if (across(p, to) <= (obj.to?.radius ?? 8) && counting(player)) {
      bump(player, s.e, s.i, 1);
      scenes.delete(sk(s.pid, s.key));
    }
    return;
  }
  if (dp > stray) return; // waits for the player
  const step = Math.min(1, left);
  const nx = pos.x + ((to.x - pos.x) / left) * step;
  const nz = pos.z + ((to.z - pos.z) / left) * step;
  const ny = groundAt(dim, nx, nz, pos.y);
  s.data.pos = { x: nx, y: ny ?? pos.y, z: nz };
}

// ---- vision ------------------------------------------------------------

/** Players watching a vision, by the claim that holds their busy mark. @type {Map<string, object>} */
const watching = new Map();
/** Dreams waiting for the sleeper to wake. @type {Map<string, VisionScene[]>} */
const dreams = new Map();

/**
 * Plays a short cutscene: a fade, a title and subtitle per scene (also in chat), sounds, darkness.
 * Sneaking skips it. Resolves true when it ended (or was skipped), false when it never started or was cut short by the
 * player dying, leaving or changing dimension (no credit then).
 * @param {Player} player @param {VisionScene[]} list @param {boolean} [dark]
 */
export async function playVision(player, list, dark = false) {
  if (watching.has(player.id) || !alive(player)) return false;
  const claimed = claim(player.id);
  if (!claimed) return false;
  watching.set(player.id, claimed);
  const stale = lifecycle(player);
  let skipped = false;
  let cut = false;
  try {
    const total = list.reduce((n, sc) => n + (sc.seconds ?? 5), 0);
    try {
      player.camera.fade({ fadeColor: { red: 0, green: 0, blue: 0 }, fadeTime: { fadeInTime: 0.6, holdTime: 0.6, fadeOutTime: 1.2 } });
    } catch {
      // no camera control
    }
    if (dark) player.addEffect("darkness", (total + 4) * 20, { showParticles: false });
    await wait(24);
    let released = !sneaking(player);
    for (const sc of list) {
      if (stale()) {
        cut = true;
        break;
      }
      if (skipped) break;
      const secs = Math.max(1, sc.seconds ?? 5);
      holdTitle(player, secs * 20 + 20);
      player.onScreenDisplay.setTitle(sc.title ? `§l${sc.title}` : " ", { subtitle: sc.text, fadeInDuration: 10, stayDuration: secs * 20, fadeOutDuration: 10 });
      player.sendMessage(`§7§o${sc.title ? `${sc.title}: ` : ""}${sc.text}`);
      if (sc.sound) player.playSound(sc.sound, { volume: 0.8 });
      for (let t = 0; t < secs * 4; t++) {
        await wait(5);
        if (stale()) {
          cut = true;
          break;
        }
        if (t % 8 === 0) {
          send("realm:actionbar", { player: player.id, ticks: 45, from: PACK });
          player.onScreenDisplay.setActionBar("§8Sneak to skip");
        }
        const sn = sneaking(player);
        if (!sn) released = true;
        else if (released) {
          skipped = true;
          break;
        }
      }
      if (cut) break;
    }
    cut ||= stale();
  } finally {
    if (watching.get(player.id) === claimed) watching.delete(player.id);
    release(player.id, claimed);
    try {
      if (player.isValid) {
        holdTitle(player, 6);
        player.onScreenDisplay.setTitle(" ", { subtitle: " ", fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 5 });
        if ((skipped || cut) && dark) player.removeEffect("darkness");
      }
    } catch {
      // gone
    }
  }
  return !cut;
}

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function visionTick(player, e, i, obj) {
  if (watching.has(player.id) || busy.has(player.id)) return;
  if (obj.place || obj.at || obj.offset) {
    const loc = locate(obj);
    if (!loc || typeof loc === "string" || loc.pending || loc.dim !== player.dimension.id || across(player.location, loc) > radiusOf(obj)) return;
  }
  playVision(player, obj.scenes ?? [], !!obj.dark)
    .then((played) => {
      if (played && alive(player) && counting(player)) bump(player, e, i, 1);
    })
    .catch((err) => console.warn(`[saga] vision: ${err}`));
}

// ---- answer ------------------------------------------------------------

/** "The Stars!" -> "stars": lower case, letters and digits, single spaces, no leading article. @param {string} s */
export function normalizeAnswer(s) {
  return String(s)
    .replace(/§./g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

/** Is `input` one of the accepted answers? @param {string} input @param {string[]} answers */
export const answerOk = (input, answers) => {
  const got = normalizeAnswer(input);
  return got.length > 0 && answers.some((a) => normalizeAnswer(a) === got);
};

/** When each player may be asked again (tick). @type {Map<string, number>} */
const askCool = new Map();

/**
 * Asks a riddle in a text field; a wrong answer may call monsters (`failSpawn`).
 * @param {Player} player @param {Entry} e @param {number} i
 */
export async function askAnswer(player, e, i) {
  const obj = e.chapter.objectives[i];
  await exclusive(player, async () => {
    const saga = sagaOf(player);
    if (objDone(e, i, saga)) return;
    const q = obj.question ? pagesFor([obj.question], saga, e.story.id, player.name)[0] ?? obj.label : obj.label;
    const form = new ModalFormData().title(e.story.title).textField(`${q}\n\n§7Type your answer (capitals and spaces don't matter):`, "Your answer").submitButton("Answer");
    const res = await show(player, form);
    if (alive(player)) askCool.set(player.id, system.currentTick + 400); // not for a player who left or died: no id written back, asked again at once after a respawn
    if (!res || res.canceled || !player.isValid) return;
    const input = String(res.formValues?.[0] ?? "");
    if (!input.trim()) return;
    resolveAnswer(player, e, i, input);
  });
}

/** Checks an answer and acts on it (also used by the test hook). @param {Player} player @param {Entry} e @param {number} i @param {string} input */
export function resolveAnswer(player, e, i, input) {
  const obj = e.chapter.objectives[i];
  if (answerOk(input, obj.answers ?? [])) {
    player.sendMessage(`§a[Story] "${input.trim()}" - that's it!`);
    if (counting(player)) bump(player, e, i, 1);
    return true;
  }
  player.sendMessage(`§c[Story] "${input.trim()}" isn't it.${obj.failSpawn ? " Something stirs..." : " Think it over and try again."}`);
  player.playSound("note.bass", { pitch: 0.7 });
  askCool.set(player.id, system.currentTick + 200);
  if (obj.failSpawn?.mobs?.length) spawnGroup(player, player.dimension, player.location, obj.failSpawn, objKey(e, i), 4, 7);
  return false;
}

/** @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function answerTick(player, e, i, obj) {
  if (obj.npc || !(obj.place || obj.at || obj.offset)) return; // asked by the NPC, or from the story log
  if (busy.has(player.id) || system.currentTick < (askCool.get(player.id) ?? 0)) return;
  if (!playerIn(player, obj)) return;
  askAnswer(player, e, i).catch((err) => console.warn(`[saga] answer: ${err}`));
}

// ---------------------------------------------------------------------------
// World events: sky events and other packs' quests for `event` objectives, and the story's requests
// to the world-event packs (realm:sky_request)
// ---------------------------------------------------------------------------

/** Sky event kinds (realm:sky_event): what the story says, where a `near` chase goes, and which last the night. @type {Record<string, { text: string, spot?: string, night?: boolean }>} */
const SKY = {
  meteor: { text: "A meteor is falling", spot: "where it lands" },
  rainbow: { text: "A rainbow is out", spot: "its pot of gold" },
  storm_cell: { text: "A storm cell is forming", spot: "the storm" },
  tornado: { text: "A tornado touched down", spot: "the tornado" },
  blood_moon: { text: "A Blood Moon rises", night: true },
  harvest_moon: { text: "A Harvest Moon rises", night: true },
  aurora: { text: "Northern lights are out", night: true },
};
const SKY_MEMORY_MS = 3600000; // an event is forgotten an hour after it ended (the longest chase)
const NIGHT_MAX_MS = 1200000; // a night event ends at dawn, or after 20 real minutes at most
const PLACE_GRACE_MS = 60000; // an instant event counts at a place for a minute after it is announced
const WEATHER_ASK_MS = 1800000; // weather help: once per player and objective per 30 minutes

/** @typedef {{ id: number, kind: string, dim: string, x?: number, z?: number, at: number, end?: number }} SkyEvent */
/** Sky events seen since the world loaded (not saved: a restart forgets them). @type {SkyEvent[]} */
const skyEvents = [];
let skyIds = 0;
/** "pid|objective key|event id": events that already counted. @type {Set<string>} */
const skyCounted = new Set();
/** "pid|objective key" -> when weather help was last asked for. @type {Map<string, number>} */
const weatherAsked = new Map();

/** How long a `near` chase lasts (ms). @param {Objective} obj */
const chaseMs = (obj) => Math.max(1, Math.min(60, obj.minutes ?? 15)) * 60000;

/** @param {SkyEvent} ev */
const hasSpot = (ev) => ev.x !== undefined && ev.z !== undefined;

/**
 * Does a sky event count for an event objective now? With `near` (and a spot): the player is that close
 * within the chase time. Otherwise the player is in the event's dimension (and at the objective's place, if
 * any) when it is announced, or while it lasts (moons and auroras: the night; others at a place: a minute).
 * @param {Player} player @param {Objective} obj @param {SkyEvent} ev @param {boolean} announced @param {number} now
 */
function skyCounts(player, obj, ev, announced, now) {
  if (!obj.events?.includes(/** @type {any} */ (ev.kind)) || player.dimension.id !== ev.dim) return false;
  if (obj.near && hasSpot(ev)) return now - ev.at <= chaseMs(obj) && across(player.location, /** @type {{ x: number, z: number }} */ (ev)) <= obj.near;
  if (SKY[ev.kind]?.night) {
    if (ev.end !== undefined) return false;
  } else if (!announced && !(locate(obj) !== undefined && now - ev.at <= PLACE_GRACE_MS)) return false;
  return playerIn(player, obj);
}

/** Counts the sky events an event objective hasn't counted yet. @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj @param {boolean} [announced] */
function skyCheck(player, e, i, obj, announced = false) {
  const now = Date.now();
  const base = `${player.id}|${objKey(e, i)}|`;
  for (const ev of skyEvents) {
    if (skyCounted.has(base + ev.id) || !skyCounts(player, obj, ev, announced && ev === skyEvents[skyEvents.length - 1], now)) continue;
    skyCounted.add(base + ev.id);
    if (!bump(player, e, i, 1)) return;
  }
}

/** A new sky event: it counts at once for players where it happens, and `near` objectives start a chase. @param {string} kind @param {string} dim @param {number | undefined} x @param {number | undefined} z */
function addSky(kind, dim, x, z) {
  /** @type {SkyEvent} */
  const ev = { id: ++skyIds, kind, dim, at: Date.now() };
  if (x !== undefined && z !== undefined) {
    ev.x = Math.floor(x);
    ev.z = Math.floor(z);
  }
  skyEvents.push(ev);
  if (skyEvents.length > 100) forgetSky();
  for (const player of world.getAllPlayers()) {
    if (!counting(player)) continue;
    for (const { e, i, obj } of open(player, "event")) {
      if (!obj.events?.includes(/** @type {any} */ (kind))) continue;
      skyCheck(player, e, i, obj, true);
      if (obj.near && hasSpot(ev) && !skyCounted.has(`${player.id}|${objKey(e, i)}|${ev.id}`) && player.dimension.id === dim)
        player.sendMessage(`§e[Story] ${SKY[kind]?.text ?? "Something is happening"}: get within ${obj.near} blocks of ${SKY[kind]?.spot ?? "it"} (${ev.x} ~ ${ev.z}) in the next ${Math.round(chaseMs(obj) / 60000)} min. §7(${obj.label})`);
    }
  }
}

/** realm:sky_event `{ kind, dim, x?, z? }` from the world-event packs. @param {any} msg */
export function skyEvent(msg) {
  if (typeof msg.kind !== "string" || !SKY[msg.kind]) return;
  const dim = typeof msg.dim === "string" ? (msg.dim.includes(":") ? msg.dim : `minecraft:${msg.dim}`) : OVERWORLD;
  // A moon already announced by realm:moon (moon_bp sends both) is the same moon.
  if (SKY[msg.kind].night && skyEvents.some((ev) => ev.kind === msg.kind && ev.end === undefined)) return;
  addSky(msg.kind, dim, typeof msg.x === "number" ? msg.x : undefined, typeof msg.z === "number" ? msg.z : undefined);
}

/** realm:moon `{ state }`: a blood or harvest moon starts; "normal" ends it. @param {any} msg */
export function moonState(msg) {
  const now = Date.now();
  if (msg.state === "normal") {
    for (const ev of skyEvents) if ((ev.kind === "blood_moon" || ev.kind === "harvest_moon") && ev.end === undefined) ev.end = now;
    return;
  }
  const kind = msg.state === "blood" ? "blood_moon" : msg.state === "harvest" ? "harvest_moon" : undefined;
  if (kind && !skyEvents.some((ev) => ev.kind === kind && ev.end === undefined)) addSky(kind, OVERWORLD, undefined, undefined);
}

/** Night events end at dawn; old events are forgotten. Every second, from main.js. */
export function skyHousekeeping() {
  if (!skyEvents.length) return;
  const now = Date.now();
  // Daylight, for the sky's night events: moon_bp starts its moon at dusk (12000), before isNight() does.
  const t = world.getTimeOfDay();
  const day = t >= 23000 || t < 12000;
  for (const ev of skyEvents) if (SKY[ev.kind]?.night && ev.end === undefined && ((day && now - ev.at > 30000) || now - ev.at > NIGHT_MAX_MS)) ev.end = now;
  while (skyEvents.length && now - (skyEvents[0].end ?? (SKY[skyEvents[0].kind]?.night ? now : skyEvents[0].at)) > SKY_MEMORY_MS) forgetSky();
}

/** Forgets the oldest sky event, and which objectives it counted for. */
function forgetSky() {
  const ev = skyEvents.shift();
  if (!ev) return;
  const gone = `|${ev.id}`;
  for (const k of [...skyCounted]) if (k.endsWith(gone)) skyCounted.delete(k);
}

/**
 * The sky event a `near` objective is chasing now (the newest one in time that hasn't counted), for the tracker
 * and the log, or undefined.
 * @param {string} pid @param {Entry} e @param {number} i
 * @returns {{ dim: string, x: number, z: number, text: string, spot: string, near: number, left: number } | undefined}
 */
export function skyFocus(pid, e, i) {
  const obj = e.chapter.objectives[i];
  if (obj.type !== "event" || !obj.near || !obj.events?.length) return undefined;
  const now = Date.now();
  const base = `${pid}|${objKey(e, i)}|`;
  for (let k = skyEvents.length - 1; k >= 0; k--) {
    const ev = skyEvents[k];
    if (!hasSpot(ev) || !obj.events.includes(/** @type {any} */ (ev.kind)) || skyCounted.has(base + ev.id)) continue;
    const left = (chaseMs(obj) - (now - ev.at)) / 1000;
    if (left <= 0) continue;
    return { dim: ev.dim, x: /** @type {number} */ (ev.x), z: /** @type {number} */ (ev.z), text: SKY[ev.kind]?.text ?? ev.kind, spot: SKY[ev.kind]?.spot ?? "it", near: obj.near, left };
  }
  return undefined;
}

const TIERS = ["easy", "normal", "hard", "nightmare"];

/** Does a realm:quest_done message match an event objective's `quest`? @param {Objective["quest"]} q @param {any} msg */
export function questMatches(q, msg) {
  if (!q || q.pack !== msg.pack) return false;
  if (q.id !== undefined) {
    const id = String(q.id);
    if (id.endsWith("*") ? !String(msg.id).startsWith(id.slice(0, -1)) : msg.id !== id) return false;
  }
  if (q.minLevel !== undefined && !(Number(msg.level) >= q.minLevel)) return false;
  if (q.tier !== undefined && TIERS.indexOf(msg.tier) < TIERS.indexOf(q.tier)) return false;
  if (q.gauntlet !== undefined && (msg.gauntlet === true) !== q.gauntlet) return false;
  return true;
}

/** realm:quest_done from any pack (Expeditions sends one for every party member: no sharing here). @param {any} msg */
export function questDone(msg) {
  if (typeof msg.player !== "string" || typeof msg.pack !== "string" || typeof msg.id !== "string") return;
  const player = online(msg.player);
  if (!player) return;
  // A treasure found during a race to it: won or lost (races count only through this).
  if (msg.pack === "maps_bp" && counting(player))
    for (const { e, i, obj } of open(player, "event")) {
      const r = obj.race ? raceX(e)[`r${i}`] : undefined;
      if (r && msg.id === `treasure_${r.k}`) raceOver(player, e, i, obj, Date.now() <= r.u);
    }
  advance(player, "event", (obj) => (!obj.race && questMatches(obj.quest, msg) ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Races against a rival (Rook): to a Bounty Board champion target, or to the player's own treasure chest
// ---------------------------------------------------------------------------
//   realm:bounty_targets { targets: [{ id, name, dim, x, z }], part, parts }   <- bounty_bp: today's live targets
//   realm:map_leg        { player, hunt, dim, x, z, leg, legs, final } | { player, hunt, gone } <- maps_bp
//   realm:bounty_rival   { id, player, until }                              -> bounty_bp: a race started (until: ms)
//   realm:map_rival      { player, hunt, until }                            -> maps_bp: a race to that chest started

/** Live bounty targets by id. @type {Map<string, { id: string, name: string, dim: string, x: number, z: number }>} */
let bountyTargets = new Map();
/** realm:bounty_targets parts still coming in. @type {typeof bountyTargets | undefined} */
let bountyIncoming;
/** Each player's treasure hunts on their last leg: player id -> hunt id -> spot. @type {Map<string, Map<string, { dim: string, x: number, z: number }>>} */
const lastLegs = new Map();
/** Has Bounty Board's list come since the world loaded? Until then a target missing from it may just not be heard yet. */
let targetsHeard = false;
/** Hunts that ended ("<player>|<hunt>", from `gone`): a race to one of them is off. @type {Set<string>} */
const huntsEnded = new Set();

/** realm:bounty_targets: the list of today's live targets (in parts). @param {any} msg */
export function onBountyTargets(msg) {
  if (!Array.isArray(msg.targets)) return;
  const part = Number(msg.part) || 1;
  if (part === 1 || !bountyIncoming) bountyIncoming = new Map();
  for (const t of msg.targets.slice(0, 32))
    if (t && typeof t.id === "string" && typeof t.dim === "string" && Number.isFinite(t.x) && Number.isFinite(t.z))
      bountyIncoming.set(t.id, { id: t.id.slice(0, 32), name: typeof t.name === "string" ? plain(t.name).slice(0, 40) : "the bounty target", dim: t.dim, x: t.x, z: t.z });
  if (part >= (Number(msg.parts) || 1)) {
    bountyTargets = bountyIncoming;
    bountyIncoming = undefined;
    targetsHeard = true;
  }
}

/** realm:map_leg: a hunt's current leg (only last legs are kept), or the hunt ended. @param {any} msg */
export function onMapLeg(msg) {
  if (typeof msg.player !== "string" || typeof msg.hunt !== "string") return;
  let legs = lastLegs.get(msg.player);
  if (msg.gone || msg.final !== true || typeof msg.dim !== "string" || !Number.isFinite(msg.x) || !Number.isFinite(msg.z)) {
    legs?.delete(msg.hunt);
    if (legs && !legs.size) lastLegs.delete(msg.player);
    if (msg.gone) {
      if (huntsEnded.size > 200) huntsEnded.delete(/** @type {string} */ (huntsEnded.values().next().value));
      huntsEnded.add(`${msg.player}|${msg.hunt}`);
    }
    return;
  }
  if (!legs) lastLegs.set(msg.player, (legs = new Map()));
  if (legs.size < 16 || legs.has(msg.hunt)) legs.set(msg.hunt, { dim: msg.dim, x: msg.x, z: msg.z });
}

/** @param {string} pid */
export function racesForget(pid) {
  lastLegs.delete(pid);
}

/**
 * A race's state, in the chapter's extras (gone with the chapter): "r<i>" the race on { k: target or hunt id,
 * u: ends (ms), n: what it's for }, "rd<i>" the ids raced already. @param {Entry} e @returns {Record<string, any>}
 */
const raceX = (e) => /** @type {Record<string, any>} */ ((e.st.x ??= {}));

/** Is it a map race (else a bounty race)? @param {Objective} obj */
const mapRace = (obj) => obj.type === "event";

/**
 * Once a second for a race objective: start a race when the player comes within `radius` of a live bounty target
 * (or their last map leg) not raced yet; a race whose time ran out is lost; one whose target went (claimed by
 * someone else, the hunt given up) is off.
 * @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj
 */
function raceTick(player, e, i, obj) {
  if (!obj.race) return;
  const x = raceX(e);
  const now = Date.now();
  const map = mapRace(obj);
  const r = x[`r${i}`];
  if (r) {
    // Off when its target went (claimed by someone else, the hunt given up); a list not heard yet since a restart
    // (or a rejoin) proves nothing, so only what the other pack said counts.
    if (map ? huntsEnded.has(`${player.id}|${r.k}`) : targetsHeard && !bountyTargets.has(r.k)) {
      delete x[`r${i}`];
      markDirty(player);
      player.sendMessage(`§7[Story] The race is off: ${map ? "that treasure hunt is over" : `someone else claimed ${r.n}`}.`);
      return;
    }
    if (now > r.u) raceOver(player, e, i, obj, false);
    return;
  }
  /** @type {string[]} */
  const raced = x[`rd${i}`] ?? [];
  const dim = player.dimension.id;
  const p = player.location;
  const radius = obj.radius ?? RACE_RADIUS;
  const pool = map
    ? [...(lastLegs.get(player.id) ?? new Map())].map(([k, l]) => ({ k, n: "your treasure", ...l }))
    : [...bountyTargets.values()].map((t) => ({ k: t.id, n: t.name, dim: t.dim, x: t.x, z: t.z }));
  let best;
  let bestD = Infinity;
  for (const c of pool) {
    if (c.dim !== dim || raced.includes(c.k)) continue;
    const d = across(p, c);
    if (d <= radius && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  if (!best) return;
  const until = now + obj.race * 1000;
  x[`r${i}`] = { k: best.k, u: until, n: best.n };
  x[`rd${i}`] = [...raced, best.k].slice(-RACED_MAX);
  markDirty(player);
  if (map) send("realm:map_rival", { player: player.id, hunt: best.k, until });
  else send("realm:bounty_rival", { id: best.k, player: player.id, until });
  const rival = obj.rival ?? "A rival";
  player.sendMessage(`§e[Story] ${rival} is after ${best.n} too! Get there first: you have ${clock(obj.race)}. §7(${obj.label})`);
  player.playSound("note.pling", { pitch: 1.4, volume: 0.7 });
}

/**
 * A race ends: won (the target fell, or the treasure was found, in time) counts one and adds to `tally`; lost sets
 * `lose`. Either way that target is never raced again by this objective.
 * @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj @param {boolean} won
 */
function raceOver(player, e, i, obj, won) {
  const x = raceX(e);
  const r = x[`r${i}`];
  if (!r) return;
  delete x[`r${i}`];
  const rival = obj.rival ?? "Your rival";
  const saga = sagaOf(player);
  markDirty(player);
  if (won) {
    if (obj.tally?.startsWith("g:")) {
      saga.g ??= {};
      const k = obj.tally.slice(2);
      saga.g[k] = String(Number(saga.g[k] ?? 0) + 1);
    }
    invalidate(player.id);
    player.sendMessage(`§a[Story] You beat ${rival} to ${r.n}!`);
    player.playSound("random.levelup", { pitch: 1.5, volume: 0.6 });
    bump(player, e, i, 1);
    return;
  }
  for (const [k, v] of Object.entries(obj.lose ?? {})) setFlag(saga, e.story.id, k, v);
  invalidate(player.id);
  player.sendMessage(
    mapRace(obj)
      ? `§c[Story] ${rival} got to your treasure first! The chest is still yours, but he takes his cut of the coins. Beat him to the next one.`
      : `§c[Story] ${rival} got to ${r.n} first! Finish it anyway for part of the bounty, or beat him to the next one.`,
  );
  player.playSound("note.bass", { pitch: 0.6 });
}

/**
 * realm:champion_slain for a Bounty Board target: races on it end (the killer, the helpers and players within 32
 * blocks), and plain `bounty` defeats count.
 * @param {string} tag @param {string[]} ids @param {Vector3 | undefined} at @param {string | undefined} dim
 */
export function bountySlain(tag, ids, at, dim) {
  const id = tag.slice(BOUNTY_TAG.length);
  /** @type {Set<string>} */
  const credited = new Set(ids);
  if (at && dim) for (const p of world.getAllPlayers()) if (p.dimension.id === dim && dist3(p.location, at) <= 32) credited.add(p.id);
  const now = Date.now();
  for (const pid of credited) {
    const p = online(pid);
    if (!p || !counting(p)) continue;
    for (const { e, i, obj } of open(p, "defeat")) {
      if (!obj.bounty) continue;
      if (!obj.race) {
        bump(p, e, i, 1);
        continue;
      }
      const r = raceX(e)[`r${i}`];
      if (r && r.k === id) raceOver(p, e, i, obj, now <= r.u);
    }
  }
}

/**
 * Debug and test scenarios: every race this player is running ends now (its time is up), and the other pack hears it,
 * so a lost race can be tested without waiting five minutes. @param {Player} player
 */
export function expireRaces(player) {
  const now = Date.now() - 1;
  for (const e of entries(player))
    e.chapter.objectives.forEach((obj, i) => {
      const r = obj.race ? raceX(e)[`r${i}`] : undefined;
      if (!r) return;
      r.u = now;
      if (mapRace(obj)) send("realm:map_rival", { player: player.id, hunt: r.k, until: now });
      else send("realm:bounty_rival", { id: r.k, player: player.id, until: now });
    });
}

/** Is this a Bounty Board target's tag? @param {string} tag */
export const isBountyTag = (tag) => tag.startsWith(BOUNTY_TAG);

/**
 * Where a bounty race points the tracker: its target while it runs, else the nearest live target not raced yet (the
 * board shows where they were seen anyway). A treasure race never points: the clues lead there.
 * @param {string} pid @param {Entry} e @param {number} i
 */
function raceFocus(pid, e, i) {
  const obj = e.chapter.objectives[i];
  if (!obj.race || mapRace(obj)) return undefined;
  const x = raceX(e);
  const r = x[`r${i}`];
  if (r) {
    const t = bountyTargets.get(r.k);
    return t ? { dim: t.dim, x: t.x, z: t.z, label: r.n } : undefined;
  }
  const p = online(pid);
  if (!p) return undefined;
  /** @type {string[]} */
  const raced = x[`rd${i}`] ?? [];
  let best;
  let bestD = Infinity;
  for (const t of bountyTargets.values()) {
    if (t.dim !== p.dimension.id || raced.includes(t.id)) continue;
    const d = across(p.location, t);
    if (d < bestD) {
      best = t;
      bestD = d;
    }
  }
  return best ? { dim: best.dim, x: best.x, z: best.z, label: best.name } : undefined;
}

/**
 * Asks a world-event pack for something (realm:sky_request). Fire and forget: the pack decides.
 * @param {Player} player @param {SkyRequest} req @param {string} reason "<story>:<chapter>"
 */
export function askSky(player, req, reason) {
  if (!req || typeof req.kind !== "string") return;
  let at = { dim: player.dimension.id, x: Math.floor(player.location.x), z: Math.floor(player.location.z) };
  const loc = req.place ? locate({ place: req.place }) : undefined;
  if (loc && typeof loc !== "string") at = { dim: loc.dim, x: Math.floor(loc.x), z: Math.floor(loc.z) };
  /** @type {Record<string, unknown>} */
  const msg = { kind: req.kind, from: PACK, player: player.id, ...at, reason };
  if (req.burst) msg.burst = true;
  if (typeof req.minutes === "number") msg.minutes = req.minutes;
  if (typeof req.within === "number") msg.within = req.within;
  send("realm:sky_request", msg);
}

/** An objective's sky request "on start": once, the first time it counts (saved, so a rejoin doesn't ask again). @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj */
function skyOnStart(player, e, i, obj) {
  const x = (e.st.x ??= {});
  if (x[`s${i}`]) return;
  x[`s${i}`] = 1;
  markDirty(player);
  askSky(player, /** @type {SkyRequest} */ (obj.sky), `${e.story.id}:${e.chapter.id}`);
}

/**
 * Weather help: a survive or vigil objective that needs thunder or rain, with the player at its place in other
 * weather, asks the Weather Almanac for it (at most every 30 minutes per player and objective).
 * @param {Player} player @param {Entry} e @param {number} i @param {Objective} obj
 */
function weatherHelp(player, e, i, obj) {
  const want = obj.weather ?? (obj.type === "survive" ? "thunder" : undefined);
  if ((want !== "thunder" && want !== "rain") || player.dimension.id !== OVERWORLD || weatherOk(obj, OVERWORLD) || !playerIn(player, obj)) return;
  const k = `${player.id}|${objKey(e, i)}`;
  const now = Date.now();
  if (now - (weatherAsked.get(k) ?? -Infinity) < WEATHER_ASK_MS) return;
  weatherAsked.set(k, now);
  askSky(player, { kind: want, minutes: 6, within: 8 }, `${e.story.id}:${e.chapter.id}`);
}

// ---------------------------------------------------------------------------
// The per-second loop
// ---------------------------------------------------------------------------

/** Last riding position per player, for ride distance. @type {Map<string, { x: number, z: number, d: number }>} */
const rides = new Map();

/** Players whose inventory changed since their collect steps were last counted. @type {Set<string>} */
const invChanged = new Set();
/** When each player's collect steps were last all counted (tick). @type {Map<string, number>} */
const collectedAt = new Map();
/** The collect steps (objective keys) counted since then. @type {Map<string, Set<string>>} */
const collectSeen = new Map();
/** Collect steps are counted again at least this often (ticks), in case an inventory change wasn't reported. */
const COLLECT_RECOUNT = 200;
world.afterEvents.playerInventoryItemChange.subscribe(({ player }) => {
  invChanged.add(player.id);
});

/** Survive objectives credited this second (each player once, mates included). @type {Set<string>} */
let survived = new Set();

/**
 * One second of a player's objectives: everything that is checked rather than counted by an event.
 * @param {Player} player @param {Entry[]} list
 */
export function tickPlayer(player, list) {
  /** @type {string[]} collect steps counted this second */
  const collected = [];
  const recount = invChanged.has(player.id) || system.currentTick - (collectedAt.get(player.id) ?? -Infinity) >= COLLECT_RECOUNT;
  const saga = sagaOf(player);
  const counts = counting(player);
  const dim = player.dimension.id;
  const p = player.location;
  for (const e of list) {
    e.chapter.objectives.forEach((obj, i) => {
      if (!helps(e, obj) || !active(e, i, saga)) return;
      try {
        // Timed objectives: progress resets when the time runs out.
        if (obj.within && e.st.x?.[`t${i}`] && Date.now() - e.st.x[`t${i}`] > obj.within * 1000) {
          bump(player, e, i, 0, true);
          player.sendMessage(`§c[Story] Too slow! "${obj.label}" starts over.`);
          player.playSound("note.bass", { pitch: 0.6 });
        }
        if (obj.sky && obj.sky.on !== "done" && counts) skyOnStart(player, e, i, obj);
        questGuides(player, e, i, obj);
        switch (obj.type) {
          case "reach": {
            if (!counts) break;
            if (obj.dim && dim !== obj.dim) break;
            if (obj.belowY !== undefined && p.y >= obj.belowY) break;
            if (obj.aboveY !== undefined && p.y <= obj.aboveY) break;
            const loc = locate(obj);
            if (typeof loc === "string" || loc?.pending) break;
            if (loc && (loc.dim !== dim || across(p, loc) > radiusOf(obj))) break;
            const key = objKey(e, i);
            bump(player, e, i, 1);
            share(player, new Set([key]), "reach", () => 1, new Set([player.id]));
            break;
          }
          case "collect":
            if (!counts || !(obj.item || obj.name)) break;
            {
              // Counted again only when the inventory changed (or every 10 seconds, or for a step not counted yet).
              const key = objKey(e, i);
              if (!recount && collectSeen.get(player.id)?.has(key)) break;
              const have = collectCount(player, obj, e.st.o?.[i] ?? 0);
              if (have === undefined) break; // stash_bp's answer is pending: counted next second
              collected.push(key);
              bump(player, e, i, have, true);
            }
            // Done: party mates on the same chapter nearby have it done too (the party's main chapter: party.js).
            if (reached(e, i)) share(player, new Set([objKey(e, i)]), "collect", (o) => target(o), new Set([player.id]));
            break;
          case "survive": {
            if (counts) weatherHelp(player, e, i, obj);
            if (!counts || survived.has(player.id) || !weatherOk(obj, dim) || !outdoors(player) || !playerIn(player, obj)) break;
            const key = objKey(e, i);
            survived.add(player.id);
            bump(player, e, i, 1);
            share(player, new Set([key]), "survive", () => 1, survived);
            break;
          }
          case "vigil": {
            if (counts) weatherHelp(player, e, i, obj);
            if (!counts || !playerIn(player, obj) || !weatherOk(obj, dim)) break;
            if (!inWindow(obj)) break;
            if (obj.outdoors && !outdoors(player)) break;
            if (obj.sneaking && !sneaking(player)) break;
            bump(player, e, i, 1);
            break;
          }
          case "wear": {
            if (!counts || !obj.items?.length) break;
            const slot = { head: EquipmentSlot.Head, chest: EquipmentSlot.Chest, legs: EquipmentSlot.Legs, feet: EquipmentSlot.Feet }[obj.slot ?? "head"];
            const worn = player.getComponent("minecraft:equippable")?.getEquipment(slot)?.typeId;
            if (worn && obj.items.includes(worn)) bump(player, e, i, 1);
            break;
          }
          case "ride": {
            const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
            const last = rides.get(player.id);
            if (!mount || (obj.mobs?.length && !obj.mobs.includes(mount.typeId))) {
              rides.delete(player.id);
              break;
            }
            if (!last) {
              rides.set(player.id, { x: p.x, z: p.z, d: 0 });
              break;
            }
            const step = Math.min(30, across(p, last));
            last.x = p.x;
            last.z = p.z;
            last.d += step;
            if (counts && last.d >= 1) {
              const whole = Math.floor(last.d);
              last.d -= whole;
              bump(player, e, i, whole);
            }
            break;
          }
          case "wait": {
            const x = (e.st.x ??= {});
            const k = String(i);
            if (obj.days) {
              if (waitDays(x, k, obj, world.getAbsoluteTime(), Date.now(), markDirty, player)) bump(player, e, i, 1);
            } else {
              const now = Date.now();
              if (x[k] === undefined) {
                x[k] = now;
                markDirty(player);
              } else if (now - x[k] >= (obj.minutes ?? 1) * 60000) bump(player, e, i, 1);
            }
            break;
          }
          case "sleep":
            if (counts && player.isSleeping) {
              bump(player, e, i, 1);
              if (obj.vision?.length) dreams.set(player.id, obj.vision);
            }
            break;
          case "defeat":
            if (obj.champion && counts) championNear(player, obj);
            else if (obj.race && counts) raceTick(player, e, i, obj);
            else if (obj.spawn && counts) defeatSpawnTick(player, e, i, obj);
            break;
          case "meet":
            meetTick(player, e, i, obj);
            break;
          case "inspect":
            if (counts) inspectTick(player, e, i, obj);
            break;
          case "stealth":
            if (counts) stealthTick(player, e, i, obj);
            break;
          case "escort":
            if (counts) escortTick(player, e, i, obj);
            break;
          case "lead":
            leadTick(player, e, i, obj);
            break;
          case "defend":
            defendTick(player, e, i, obj);
            break;
          case "follow":
            if (counts) followTick(player, e, i, obj);
            break;
          case "vision":
            if (counts) visionTick(player, e, i, obj);
            break;
          case "answer":
            if (counts) answerTick(player, e, i, obj);
            break;
          case "event":
            if (counts && obj.events?.length) skyCheck(player, e, i, obj);
            else if (counts && obj.race) raceTick(player, e, i, obj);
            break;
        }
      } catch (err) {
        console.warn(`[saga] ${obj.type}: ${err}`);
      }
    });
  }
  if (collected.length) {
    let seen = collectSeen.get(player.id);
    if (!seen) collectSeen.set(player.id, (seen = new Set()));
    if (recount) {
      seen.clear();
      invChanged.delete(player.id);
      collectedAt.set(player.id, system.currentTick);
    }
    for (const k of collected) seen.add(k);
  }
  // A dream after sleeping, once awake.
  const dream = dreams.get(player.id);
  if (dream && !player.isSleeping && !busy.has(player.id)) {
    dreams.delete(player.id);
    playVision(player, dream, true).catch(() => {});
  }
}

/** Starts a loop run: scenes not visited in the previous run are ended. */
export function beginRun() {
  const now = system.currentTick;
  for (const s of [...scenes.values()]) if (s.seen < run && !(s.data?.keepUntil > now)) endScene(s.pid, s.key);
  run++;
  survived = new Set();
}

/** The fast loop (every 5 ticks): guards on patrol, escorts following, wisps drifting. */
function fast() {
  if (!scenes.size) return;
  for (const s of scenes.values()) {
    if (s.kind !== "stealth" && s.kind !== "follow") continue;
    const player = online(s.pid);
    if (!player) continue;
    try {
      if (s.kind === "stealth") stealthFast(s, player);
      else followFast(s, player);
    } catch (err) {
      console.warn(`[saga] ${s.kind}: ${err}`);
    }
  }
}
system.runInterval(fast, FAST_TICKS);

/** Escorts walking (every ESCORT_TICKS; one scene per player at most, so a few at once). */
function escorts() {
  if (!scenes.size) return;
  for (const s of scenes.values()) {
    if (s.kind !== "escort" || s.state !== "go") continue;
    const player = online(s.pid);
    if (!player) continue;
    try {
      escortFast(s, player);
    } catch (err) {
      console.warn(`[saga] escort: ${err}`);
    }
  }
}
system.runInterval(escorts, ESCORT_TICKS);

// A character a zombie turned into a zombie villager (its death event may not come): the scene counts it as hurt.
setLostHandler((a) => {
  const s = scenes.get(sk(a.owner, a.key));
  if (!s) return;
  if (a.role === "escort") escortFail(s);
  else if (a.role === "ward") defendFail(s, `${s.e.chapter.objectives[s.i].ward?.name ?? "The one you were guarding"} fell.`);
});

/**
 * Where the tracker should point for a scene (an escort's character, a wisp, a stealth goal), or
 * undefined to use the objective's own location.
 * @param {string} pid @param {Entry} e @param {number} i @returns {{ dim: string, x: number, y?: number, z: number, label: string } | undefined}
 */
export function sceneFocus(pid, e, i) {
  const race = raceFocus(pid, e, i);
  if (race) return race;
  const s = scenes.get(sk(pid, objKey(e, i)));
  if (!s) return undefined;
  const obj = e.chapter.objectives[i];
  if (s.kind === "follow" && s.data.pos) return { dim: online(pid)?.dimension.id ?? OVERWORLD, ...s.data.pos, label: `the ${obj.wisp ?? "light"}` };
  if (s.kind === "escort") {
    const [a] = actorsOf(pid, s.key, "escort");
    if (!a?.ent.isValid) return undefined;
    const player = online(pid);
    if (s.state === "wait" || (player && dist3(player.location, a.ent.location) > 24)) return { dim: a.dim, ...a.ent.location, label: obj.who?.name ?? "them" };
    const to = locate(obj.to, "the destination");
    return to && typeof to !== "string" ? to : undefined;
  }
  if (s.kind === "stealth") {
    const sp = stealthSpots(obj);
    return sp ? { dim: sp.loc.dim, ...sp.goal, label: obj.goal ? "the goal" : sp.loc.label } : undefined;
  }
  return undefined;
}

/**
 * One tick of a `wait` for days: `x[k]` is the world time it started at (kept as saved), `x[w<k>]` the real time (ms). With
 * the daylight cycle off the world clock never moves, so the real clock counts instead, 20 minutes a day. True when done.
 * @param {Record<string, any>} x @param {string} k @param {Objective} obj @param {number} absNow @param {number} msNow
 * @param {(player: Player) => void} dirty @param {Player} player
 */
export function waitDays(x, k, obj, absNow, msNow, dirty, player) {
  const w = `w${k}`;
  if (x[k] === undefined) {
    x[k] = absNow;
    if (!timeMoves()) x[w] = msNow; // the real-time fallback only runs while the clock is stopped
    dirty(player);
    return false;
  }
  if (x[w] === undefined && !timeMoves()) {
    x[w] = msNow; // progress saved before the fallback existed: it counts from here
    dirty(player);
  }
  const days = obj.days ?? 1;
  return absNow - x[k] >= days * 24000 || (!timeMoves() && x[w] !== undefined && msNow - x[w] >= days * DAY_MS);
}

/** Seconds left on a timed objective (or a wait), or undefined. @param {Entry} e @param {number} i */
export function timeLeft(e, i) {
  const obj = e.chapter.objectives[i];
  const x = e.st.x;
  if (obj.within && x?.[`t${i}`]) return obj.within - (Date.now() - x[`t${i}`]) / 1000;
  const race = obj.race && x ? /** @type {Record<string, any>} */ (x)[`r${i}`] : undefined;
  if (race) return Math.max(0, (race.u - Date.now()) / 1000);
  if (obj.type === "wait" && x?.[String(i)] !== undefined) {
    if (obj.days) {
      const world_ = (obj.days * 24000 - (world.getAbsoluteTime() - x[String(i)])) / 20;
      if (timeMoves()) return world_;
      const from = x[`w${i}`] ?? Date.now();
      return Math.max(0, Math.min(world_, (obj.days * DAY_MS - (Date.now() - from)) / 1000));
    }
    return ((obj.minutes ?? 1) * 60000 - (Date.now() - x[String(i)])) / 1000;
  }
  return undefined;
}

/** "3:20 left" or "2 days left" for the log and tracker. @param {Entry} e @param {number} i */
export function timeText(e, i) {
  const left = timeLeft(e, i);
  if (left === undefined) return "";
  const obj = e.chapter.objectives[i];
  if (obj.type === "wait" && obj.days) {
    const days = Math.max(0, left / 1200);
    return days >= 1 ? `${Math.ceil(days)} day${Math.ceil(days) === 1 ? "" : "s"} left` : `${clock(left)} left`;
  }
  return `${clock(left)} left`;
}

/** Cleanup for a player who left. @param {string} pid */
export function playerGone(pid) {
  endScenesOf(pid);
  rides.delete(pid);
  lastHit.delete(pid);
  lastTouch.delete(pid);
  lastUse.delete(pid);
  askCool.delete(pid);
  dreams.delete(pid);
  invChanged.delete(pid);
  stashForget(pid);
  collectedAt.delete(pid);
  collectSeen.delete(pid);
  holdUntil.delete(pid);
  ownUntil.delete(pid);
  for (const k of [...tended.keys()]) if (k.startsWith(`${pid}|`) || k.startsWith(`tame|${pid}|`)) tended.delete(k);
  for (const k of [...weatherAsked.keys()]) if (k.startsWith(`${pid}|`)) weatherAsked.delete(k);
}

const sessionChampions = new Set();
/** @param {Entity} ent */
function trackChampion(ent) {
  sessionChampions.add(ent.id);
}
/** A tagged champion that this session did not spawn: a leftover from a chunk that was unloaded at world load. @param {Entity} ent */
function staleChampion(ent) {
  return ent.hasTag(CHAMPION_TAG) && !sessionChampions.has(ent.id);
}
/** Removes a leftover champion when its chunk loads. @param {Entity} ent */
export function sweepLoadedChampion(ent) {
  try {
    if (staleChampion(ent)) ent.remove();
  } catch {
    // already gone
  }
}

/** Every dimension's story champions this pack spawned are removed at world load. */
export function sweepChampions() {
  for (const id of DIMENSIONS) {
    try {
      for (const ent of world.getDimension(id).getEntities({ tags: [CHAMPION_TAG] })) ent.remove();
    } catch (e) {
      console.warn(`[saga] cleanup: ${e}`);
    }
  }
}

/** For the operators' "complete the current step" tool. @param {Player} player @param {Entry} e */
export function completeStep(player, e) {
  const saga = sagaOf(player);
  const i = currentStep(e, saga);
  if (i < 0) return false;
  const obj = e.chapter.objectives[i];
  bump(player, e, i, target(obj), true);
  endScene(player.id, objKey(e, i));
  return true;
}

export { matches };
