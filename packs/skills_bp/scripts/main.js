import { CommandPermissionLevel, CustomCommandStatus, Dimension, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

// Six skills, each with its XP in a scoreboard (skill_mining, ...), so other packs, /scoreboard and
// sidebars can read them. The level is worked out from the XP with the curve in config.js, so the
// scoreboard is the only thing saved about levels. Explored chunks are remembered per player in a few
// small player properties (see "Exploration" below).

/** @typedef {"mining" | "woodcutting" | "farming" | "fishing" | "combat" | "exploration"} Skill */
/** @typedef {{ level: number, perk: string, chance?: number, seconds?: number, streak?: number, percent?: number }} Perk */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

/** @type {Skill[]} */
const SKILLS = ["mining", "woodcutting", "farming", "fishing", "combat", "exploration"];
/** @type {Record<Skill, string>} */
const NAMES = { mining: "Mining", woodcutting: "Woodcutting", farming: "Farming", fishing: "Fishing", combat: "Combat", exploration: "Exploration" };
/** @type {Record<Skill, string>} */
const HOW = {
  mining: "Mine stone and ores (blocks placed lately don't count, nor ores mined with Silk Touch).",
  woodcutting: "Chop logs and stems (logs placed lately don't count).",
  farming: "Harvest fully grown crops: break them, or tap them with the Right-click Harvest pack.",
  fishing: "Catch fish, treasure and junk with a fishing rod.",
  combat: "Defeat mobs. Champions give much more.",
  exploration: "Enter chunks (16 x 16 areas) you have never been in, and travel through places you haven't been lately.",
};
const PARTY_TAG = "realm_party:"; // the Parties pack's tag, `realm_party:<code>`
const CHAMPION_TAG = "realm:champion"; // the Champions pack's tag
const PLACED_MEMORY = 10000; // recently placed blocks remembered, so breaking them again gives no XP
const NOTE_TICKS = 20; // XP notes are added up and shown at most this often
const MAX_SCORE = 2000000000;
/** One character per dimension, for compact saved keys. */
const DIMS = /** @type {Record<string, string>} */ ({ "minecraft:overworld": "o", "minecraft:nether": "n", "minecraft:the_end": "e" });

const enabled = () => get("enabled") === true;

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

// Read once: changing the curve while players have XP would move their levels around.
const MAX_LEVEL = Math.max(2, Math.floor(Number(get("maxLevel")) || 50));
/** TOTAL[n] = XP needed in all to reach level n (TOTAL[1] = 0). @type {number[]} */
const TOTAL = [0, 0];
for (let n = 1; n < MAX_LEVEL; n++) {
  const step = Math.max(1, Math.round(Number(get("xpBase")) * n ** Number(get("xpExponent"))));
  TOTAL.push(Math.min(MAX_SCORE, TOTAL[n] + (Number.isFinite(step) ? step : 1)));
}

/** @param {number} xp */
function levelOf(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= TOTAL[level + 1]) level++;
  return level;
}

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// ---------------------------------------------------------------------------
// Scoreboards
// ---------------------------------------------------------------------------

/** @type {Map<Skill, import("@minecraft/server").ScoreboardObjective>} */
const objectives = new Map();

/** The skill's objective, made if missing (another pack or /scoreboard may have removed it). @param {Skill} skill */
function objective(skill) {
  const cached = objectives.get(skill);
  if (cached?.isValid) return cached;
  const id = `skill_${skill}`;
  let o;
  try {
    o = world.scoreboard.getObjective(id) ?? world.scoreboard.addObjective(id, `${NAMES[skill]} XP`);
  } catch {
    o = world.scoreboard.getObjective(id); // made by someone else in the same tick
  }
  if (o) objectives.set(skill, o);
  return o;
}

/** @param {Player} player @param {Skill} skill */
function xpOf(player, skill) {
  try {
    return objective(skill)?.getScore(player) ?? 0;
  } catch {
    return 0;
  }
}

/** @param {Player} player @param {Skill} skill */
const levelFor = (player, skill) => levelOf(xpOf(player, skill));

// ---------------------------------------------------------------------------
// Perks
// ---------------------------------------------------------------------------

/** The highest unlocked row of this perk for the level, or undefined. @param {Skill} skill @param {number} level @param {string} kind @returns {Perk | undefined} */
function perkAt(skill, level, kind) {
  /** @type {Perk | undefined} */
  let best;
  for (const p of CONFIG.perks[skill] ?? []) {
    if (p.perk === kind && p.level <= level && (!best || p.level >= best.level)) best = p;
  }
  return best;
}

/** The player's perk, while perks are on. @param {Player} player @param {Skill} skill @param {string} kind */
function perkOf(player, skill, kind) {
  if (get("perksEnabled") !== true) return undefined;
  return perkAt(skill, levelFor(player, skill), kind);
}

/** Rolls a perk's chance. @param {Perk | undefined} p */
const lucky = (p) => !!p && typeof p.chance === "number" && Math.random() < p.chance;

/** @param {number | undefined} c */
const pct = (c) => `${Math.round((c ?? 0) * 100)}%`;

/** What a perk does, for players. @param {Skill} skill @param {Perk} p */
function describe(skill, p) {
  const s = `${p.seconds ?? 0}s`;
  switch (p.perk) {
    case "doubleOre":
      return `${pct(p.chance)} chance of a double ore drop (not with Silk Touch)`;
    case "haste":
      return `Haste I for ${s} after mining ${p.streak ?? 0} ores in a row`;
    case "extraLog":
      return `${pct(p.chance)} chance of an extra log`;
    case "apple":
      return `${pct(p.chance)} chance of an apple from a log`;
    case "extraCrop":
      return `${pct(p.chance)} chance of an extra crop`;
    case "seeds":
      return `${pct(p.chance)} chance of extra seeds`;
    case "secondCatch":
      return `${pct(p.chance)} chance of a second fish`;
    case "strength":
      return `${pct(p.chance)} chance of Strength I for ${s} after a kill`;
    case "regen":
      return `${pct(p.chance)} chance of Regeneration I for ${s} after a kill`;
    case "speed":
      return `Speed I for ${s} when you enter a new chunk`;
    case "bonusXp":
      return `+${p.percent ?? 0}% ${NAMES[skill]} XP`;
  }
  return p.perk;
}

/** Gives a short effect, quietly. @param {Player} player @param {string} effect @param {number | undefined} seconds */
function effect(player, effect, seconds) {
  try {
    player.addEffect(effect, Math.max(1, Math.round((seconds ?? 5) * 20)), { amplifier: 0, showParticles: false });
  } catch (e) {
    console.warn(`[skills] effect ${effect}: ${e}`);
  }
}

/** Items this pack spawned: never a fishing catch. @type {Set<string>} */
const ours = new Set();

/** Drops `amount` of an item at a spot. @param {Dimension} dimension @param {Vector3} at @param {string} item @param {number} [amount] */
function drop(dimension, at, item, amount = 1) {
  try {
    const entity = dimension.spawnItem(new ItemStack(item, Math.max(1, Math.floor(amount))), at);
    ours.add(entity.id);
    system.runTimeout(() => ours.delete(entity.id), 40);
  } catch (e) {
    console.warn(`[skills] drop ${item}: ${e}`);
  }
}

/** The middle of a block. @param {Vector3} p */
const center = (p) => ({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 });

// ---------------------------------------------------------------------------
// Gaining XP
// ---------------------------------------------------------------------------

/** @param {Player} player */
function active(player) {
  if (!enabled() || !player.isValid) return false;
  try {
    const mode = player.getGameMode();
    if (mode === GameMode.Spectator) return false;
    if (get("skipCreative") === true && mode === GameMode.Creative) return false;
  } catch {
    return false;
  }
  return true;
}

/** Is a party mate near? Worked out at most once a second per player. @type {Map<string, { tick: number, near: boolean }>} */
const partyCache = new Map();

/** @param {Player} player */
function mateNear(player) {
  const cached = partyCache.get(player.id);
  if (cached && system.currentTick - cached.tick < 20) return cached.near;
  let near = false;
  const tag = player.getTags().find((t) => t.startsWith(PARTY_TAG));
  if (tag) {
    const range = get("partyRange");
    const here = player.location;
    const dim = player.dimension.id;
    for (const p of world.getAllPlayers()) {
      if (p.id === player.id || p.dimension.id !== dim || !p.hasTag(tag)) continue;
      const at = p.location;
      if (Math.hypot(at.x - here.x, at.y - here.y, at.z - here.z) <= range) {
        near = true;
        break;
      }
    }
  }
  partyCache.set(player.id, { tick: system.currentTick, near });
  return near;
}

/** 2.3 -> 2 or 3, 3 more often: fractions add up right over many gains. @param {number} n */
const roundRandom = (n) => Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);

/**
 * Adds XP to a skill: times `xpMultiplier`, the party bonus (unless `fromPack`) and the skill's own
 * bonusXp perk. Returns the XP added.
 * @param {Player} player @param {Skill} skill @param {number} base
 * @param {{ fromPack?: boolean, quiet?: boolean }} [opts] fromPack: sent by another pack; quiet: no XP note
 */
function award(player, skill, base, opts = {}) {
  if (!(base > 0) || !active(player)) return 0;
  const o = objective(skill);
  if (!o) return 0;
  const before = xpOf(player, skill);
  const level = levelOf(before);
  let amount = base * Number(get("xpMultiplier"));
  if (!opts.fromPack && get("partyBonus") > 0 && mateNear(player)) amount *= 1 + get("partyBonus") / 100;
  const bonus = get("perksEnabled") === true ? perkAt(skill, level, "bonusXp") : undefined;
  if (bonus) amount *= 1 + (bonus.percent ?? 0) / 100;
  const whole = roundRandom(amount);
  if (whole <= 0) return 0;
  const after = Math.min(MAX_SCORE, before + whole);
  try {
    o.setScore(player, after);
  } catch (e) {
    console.warn(`[skills] score: ${e}`);
    return 0;
  }
  if (!opts.quiet) note(player, skill, after - before);
  const now = levelOf(after);
  if (now > level) levelUp(player, skill, level, now);
  return after - before;
}

/** @param {Player} player @param {Skill} skill @param {number} from @param {number} to */
function levelUp(player, skill, from, to) {
  try {
    player.onScreenDisplay.setTitle(`§6${NAMES[skill]} ${to}`, { subtitle: "§fLevel up!", fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 15 });
    player.playSound("random.levelup", { pitch: 1.2, volume: 0.8 });
    const fresh = (CONFIG.perks[skill] ?? []).filter((p) => p.level > from && p.level <= to);
    const perks = fresh.length ? ` §aNew perk: ${fresh.map((p) => describe(skill, p)).join(", ")}.` : "";
    player.sendMessage(`§6${NAMES[skill]} is now level ${to}!${perks} §7See /realm:skills`);
    if (to >= MAX_LEVEL && from < MAX_LEVEL) mastered(player, skill, true);
  } catch (e) {
    console.warn(`[skills] level up: ${e}`);
  }
}

/** Unlocks the master title (Titles & Trails ignores ones a player already has). @param {Player} player @param {Skill} skill @param {boolean} news */
function mastered(player, skill, news) {
  const title = String(CONFIG.masterTitles[skill] ?? "");
  if (title) system.sendScriptEvent("realm:title_unlock", JSON.stringify({ player: player.id, title, from: "skills_bp" }));
  if (news && get("announceMaster") === true) {
    world.sendMessage(`§6${player.name} reached ${NAMES[skill]} level ${MAX_LEVEL}${title ? ` and is now a ${title}` : ""}!`);
  }
}

// ---------------------------------------------------------------------------
// XP notes above the hotbar
// ---------------------------------------------------------------------------

/** XP gained since the last note, and an extra line (an ore streak). @type {Map<string, { xp: Map<Skill, number>, extra: string }>} */
const pending = new Map();

/** @param {Player} player @param {Skill} skill @param {number} xp */
function note(player, skill, xp) {
  let p = pending.get(player.id);
  if (!p) pending.set(player.id, (p = { xp: new Map(), extra: "" }));
  p.xp.set(skill, (p.xp.get(skill) ?? 0) + xp);
}

/** @param {Player} player @param {string} text */
function noteExtra(player, text) {
  let p = pending.get(player.id);
  if (!p) pending.set(player.id, (p = { xp: new Map(), extra: "" }));
  p.extra = text;
}

system.runInterval(() => {
  if (!pending.size) return;
  for (const player of world.getAllPlayers()) {
    const p = pending.get(player.id);
    if (!p) continue;
    pending.delete(player.id);
    try {
      if (getFor(player, "xpNotes") !== true) continue;
      const parts = [...p.xp].map(([skill, xp]) => `+${fmt(xp)} ${NAMES[skill]}`);
      let text = parts.length ? `§b${parts.join(", ")} XP` : "";
      if (p.xp.size === 1) {
        const [skill] = [...p.xp.keys()];
        const xp = xpOf(player, skill);
        const level = levelOf(xp);
        text += level >= MAX_LEVEL ? ` §7(level ${level})` : ` §7(level ${level}: ${fmt(xp - TOTAL[level])}/${fmt(TOTAL[level + 1] - TOTAL[level])})`;
      }
      if (p.extra) text = text ? `${text} §e${p.extra}` : `§e${p.extra}`;
      if (!text) continue;
      // Ask the Coordinates HUD, if installed, to leave the note on screen for a moment.
      system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 40 }));
      player.onScreenDisplay.setActionBar(text);
    } catch (e) {
      console.warn(`[skills] note: ${e}`);
    }
  }
  pending.clear(); // players who left
}, NOTE_TICKS);

// ---------------------------------------------------------------------------
// Mining, woodcutting and farming
// ---------------------------------------------------------------------------

/** @type {Map<string, { xp: number, drop?: string, amount?: number }>} */
const mineBlocks = new Map();
for (const row of CONFIG.mining.blocks) for (const b of row.blocks) mineBlocks.set(b, row);
const logs = new Set(CONFIG.woodcutting.logs);
const crops = new Map(CONFIG.farming.crops.map((c) => [c.block, c]));

// Blocks players placed lately, "<dim>x,y,z": breaking one again gives no XP. Kept in world
// properties (skills:placed0, 1, ...) so a restart (a Realm closes when everyone leaves) doesn't
// make placed logs and stone count again. Pistons move blocks, so everything a piston moves (and
// the spots next to it) counts as placed too: a place-push-break loop gives nothing.
const PLACED_PROP = "skills:placed";
const PLACED_PER_PROP = 1500; // about 16 characters each: well under the 32,000 limit
/** @type {Set<string> | undefined} */
let placedSet;
let placedDirty = false;

/** @returns {Set<string>} */
function placed() {
  if (placedSet) return placedSet;
  placedSet = new Set();
  try {
    for (let i = 0; ; i++) {
      const raw = world.getDynamicProperty(`${PLACED_PROP}${i}`);
      if (typeof raw !== "string") break;
      for (const key of raw.split(";")) if (key) placedSet.add(key);
    }
  } catch (e) {
    console.warn(`[skills] placed blocks: ${e}`);
  }
  return placedSet;
}

function savePlaced() {
  if (!placedDirty || !placedSet) return;
  try {
    const keys = [...placedSet];
    let i = 0;
    for (; i * PLACED_PER_PROP < keys.length; i++) world.setDynamicProperty(`${PLACED_PROP}${i}`, keys.slice(i * PLACED_PER_PROP, (i + 1) * PLACED_PER_PROP).join(";"));
    for (; world.getDynamicProperty(`${PLACED_PROP}${i}`) !== undefined; i++) world.setDynamicProperty(`${PLACED_PROP}${i}`, undefined);
    placedDirty = false;
  } catch (e) {
    console.warn(`[skills] saving placed blocks: ${e}`);
  }
}
system.runInterval(savePlaced, 600);

/** @param {string} dim @param {Vector3} p */
const spot = (dim, p) => `${DIMS[dim] ?? dim}${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;

/** @param {string} key */
function markPlaced(key) {
  const set = placed();
  set.delete(key);
  set.add(key);
  while (set.size > PLACED_MEMORY) set.delete(/** @type {string} */ (set.values().next().value));
  placedDirty = true;
}

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {
  try {
    markPlaced(spot(block.dimension.id, block.location));
  } catch (e) {
    console.warn(`[skills] ${e}`);
  }
});

world.afterEvents.pistonActivate.subscribe(({ dimension, piston }) => {
  try {
    const locs = piston.getAttachedBlocksLocations();
    if (locs.length > 13) return; // a piston moves at most 12 blocks
    for (const l of locs) {
      for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        markPlaced(spot(dimension.id, { x: l.x + dx, y: l.y + dy, z: l.z + dz }));
      }
    }
  } catch (e) {
    console.warn(`[skills] piston: ${e}`);
  }
});

/** Is this permutation a fully grown crop from `crops`? @param {import("@minecraft/server").BlockPermutation} perm */
function ripe(perm) {
  const c = crops.get(perm.type.id);
  if (!c) return false;
  if (c.state === undefined) return true;
  try {
    return perm.getState(/** @type {any} */ (c.state)) === c.ripe;
  } catch {
    return false;
  }
}

/** @param {import("@minecraft/server").ItemStack | undefined} item */
function silkTouch(item) {
  if (!item) return false;
  try {
    return item.getComponent("minecraft:enchantable")?.hasEnchantment("silk_touch") === true;
  } catch {
    return false;
  }
}

/** Ore streaks for the Haste perk. @type {Map<string, { count: number, last: number }>} */
const streaks = new Map();

/** @param {Player} player */
function oreStreak(player) {
  const now = system.currentTick;
  let s = streaks.get(player.id);
  if (!s || now - s.last > CONFIG.mining.streakGapSeconds * 20) streaks.set(player.id, (s = { count: 0, last: now }));
  s.count++;
  s.last = now;
  const haste = perkOf(player, "mining", "haste");
  if (haste && haste.streak && s.count >= haste.streak) {
    s.count = 0;
    effect(player, "haste", haste.seconds);
    noteExtra(player, `Ore streak! Haste I for ${haste.seconds ?? 0}s`);
  }
}

/** A grown crop was harvested at `at`. @param {Player} player @param {NonNullable<ReturnType<typeof crops.get>>} crop @param {Dimension} dimension @param {Vector3} at */
function harvested(player, crop, dimension, at) {
  if (!award(player, "farming", crop.xp)) return;
  if (lucky(perkOf(player, "farming", "extraCrop"))) drop(dimension, center(at), crop.drop);
  if (crop.seeds && lucky(perkOf(player, "farming", "seeds"))) drop(dimension, center(at), crop.seeds);
}

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation, itemStackBeforeBreak }) => {
  try {
    const id = brokenBlockPermutation.type.id;
    const mine = mineBlocks.get(id);
    const crop = crops.get(id);
    if (!mine && !crop && !logs.has(id)) return;
    // A crop with a growth state proves it grew (planting seeds counts as placing the crop block);
    // anything else a player placed lately gives no XP.
    const key = spot(block.dimension.id, block.location);
    const wasPlaced = placed().delete(key);
    if (wasPlaced) placedDirty = true;
    if (wasPlaced && !(crop && crop.state !== undefined)) return;
    if (!active(player)) return;
    const at = center(block.location);
    if (mine) {
      // An ore mined with Silk Touch gives no XP (as in vanilla): it comes back as a block that
      // could be placed and mined again.
      if (mine.drop && silkTouch(itemStackBeforeBreak)) return;
      if (!award(player, "mining", mine.xp) || !mine.drop) return;
      oreStreak(player);
      if (lucky(perkOf(player, "mining", "doubleOre"))) drop(block.dimension, at, mine.drop, mine.amount ?? 1);
    } else if (logs.has(id)) {
      if (!award(player, "woodcutting", CONFIG.woodcutting.xp)) return;
      if (lucky(perkOf(player, "woodcutting", "extraLog"))) drop(block.dimension, at, id);
      if (lucky(perkOf(player, "woodcutting", "apple"))) drop(block.dimension, at, "minecraft:apple");
    } else if (crop && ripe(brokenBlockPermutation)) {
      harvested(player, crop, block.dimension, block.location);
    }
  } catch (e) {
    console.warn(`[skills] ${e}`);
  }
});

// A tap that resets a grown crop to its first stage is a harvest too (the Right-click Harvest pack).
world.beforeEvents.playerInteractWithBlock.subscribe(({ player, block, isFirstEvent }) => {
  if (!isFirstEvent) return;
  const crop = crops.get(block.typeId);
  if (!crop || crop.state === undefined || !ripe(block.permutation)) return;
  const dimension = block.dimension;
  const { x, y, z } = block.location;
  system.runTimeout(() => {
    try {
      const b = dimension.getBlock({ x, y, z });
      if (!b || !player.isValid) return;
      // Broken instead (now air) is counted by playerBreakBlock.
      if (b.typeId === crop.block && !ripe(b.permutation)) harvested(player, crop, dimension, { x, y, z });
    } catch (e) {
      console.warn(`[skills] ${e}`);
    }
  }, 3);
});

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

const passive = new Set(CONFIG.combat.passive);
const ignored = new Set(CONFIG.combat.ignore);
const bosses = new Map(CONFIG.combat.bosses.map((b) => [b.mob, b.xp]));

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player) || deadEntity instanceof Player) return;
  try {
    const type = deadEntity.typeId;
    if (ignored.has(type) || !active(killer)) return;
    let xp = bosses.get(type) ?? (passive.has(type) ? CONFIG.combat.passiveXp : CONFIG.combat.xp);
    let champion = false;
    try {
      champion = deadEntity.hasTag(CHAMPION_TAG);
    } catch {
      champion = false; // already gone
    }
    if (champion) xp *= CONFIG.combat.championMultiplier;
    if (!award(killer, "combat", xp)) return;
    const strength = perkOf(killer, "combat", "strength");
    if (lucky(strength)) effect(killer, "strength", strength?.seconds);
    const regen = perkOf(killer, "combat", "regen");
    if (lucky(regen)) effect(killer, "regeneration", regen?.seconds);
  } catch (e) {
    console.warn(`[skills] ${e}`);
  }
});

// ---------------------------------------------------------------------------
// Fishing
// ---------------------------------------------------------------------------

// A hook belongs to the player nearest to where it appears. There is no "caught a fish" event: a
// catch is an item that appears right where the owner's hook was, in water, as the hook is reeled
// in (the hook goes within a few ticks of the item appearing), from a hook that was out for a
// moment. An item a player drops appears at their head instead, so dropping things next to your
// own hook and reeling in counts for nothing.
/** @typedef {{ hook: import("@minecraft/server").Entity, owner: Player, dim: string, at: Vector3, born: number, wet: boolean, gone?: number, item?: { id: string, tick: number } }} Hook */
/** @type {Map<string, Hook>} */
const hooks = new Map();
const fishItems = new Set(CONFIG.fishing.fish);
const treasure = new Set(CONFIG.fishing.treasure);
const CATCH_TICKS = 4; // the hook goes and the catch appears within this many ticks of each other
const MIN_HOOK_TICKS = 30; // a hook out for less than this can't have caught anything

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (!enabled()) return;
    if (entity.typeId === "minecraft:fishing_hook") {
      const [owner] = entity.dimension.getPlayers({ location: entity.location, maxDistance: 4, closest: 1 });
      if (owner) hooks.set(entity.id, { hook: entity, owner, dim: entity.dimension.id, at: entity.location, born: system.currentTick, wet: false });
      return;
    }
    if (entity.typeId !== "minecraft:item" || !hooks.size || ours.has(entity.id)) return;
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    if (!stack) return;
    const at = entity.location;
    const now = system.currentTick;
    for (const [id, h] of hooks) {
      if (h.dim !== entity.dimension.id) continue;
      if (Math.hypot(h.at.x - at.x, h.at.y - at.y, h.at.z - at.z) > 2) continue;
      if (!h.wet || now - h.born < MIN_HOOK_TICKS || droppedByPlayer(entity.dimension, at)) return;
      if (h.gone !== undefined || !h.hook.isValid) {
        hooks.delete(id);
        if (now - (h.gone ?? now) <= CATCH_TICKS && h.owner.isValid) caught(h.owner, stack.typeId);
      } else {
        h.item = { id: stack.typeId, tick: now }; // counted if the hook goes in the next few ticks
      }
      return;
    }
  } catch (e) {
    console.warn(`[skills] ${e}`);
  }
});

/** @param {Dimension} dimension @param {Vector3} at */
function isWater(dimension, at) {
  const b = dimension.getBlock(at);
  return !!b && (b.typeId === "minecraft:water" || b.typeId === "minecraft:flowing_water" || b.isWaterlogged);
}

/** Did this item appear at a player's head (dropped, not caught)? @param {Dimension} dimension @param {Vector3} at */
function droppedByPlayer(dimension, at) {
  for (const p of dimension.getPlayers({ location: at, maxDistance: 3 })) {
    try {
      const head = p.getHeadLocation();
      if (Math.hypot(head.x - at.x, head.y - at.y, head.z - at.z) < 1.2) return true;
    } catch {
      // gone
    }
  }
  return false;
}

/** @param {Player} player @param {string} item */
function caught(player, item) {
  const fish = fishItems.has(item);
  const xp = fish ? CONFIG.fishing.fishXp : treasure.has(item) ? CONFIG.fishing.treasureXp : CONFIG.fishing.junkXp;
  if (!award(player, "fishing", xp)) return;
  if (fish && lucky(perkOf(player, "fishing", "secondCatch"))) {
    drop(player.dimension, player.location, item);
    noteExtra(player, "Second catch!");
  }
}

// Follow live hooks (and whether they're in water); when one goes, an item that appeared just
// before is the catch. Forgotten a few ticks after they're gone.
system.runInterval(() => {
  if (!hooks.size) return;
  const now = system.currentTick;
  for (const [id, h] of hooks) {
    if (h.gone === undefined && h.hook.isValid) {
      try {
        h.at = h.hook.location;
        if (!h.wet && now % 4 === 0) {
          // A floating hook sits at the top of the water block, or just above it.
          h.wet = isWater(h.hook.dimension, h.at) || isWater(h.hook.dimension, { x: h.at.x, y: h.at.y - 0.5, z: h.at.z });
        }
      } catch {
        // unloaded
      }
      continue;
    }
    if (h.gone === undefined) h.gone = now;
    if (h.item && now - h.item.tick <= CATCH_TICKS) {
      hooks.delete(id);
      if (h.owner.isValid) caught(h.owner, h.item.id);
    } else if (now - h.gone > CATCH_TICKS) hooks.delete(id);
  }
}, 1);

// ---------------------------------------------------------------------------
// Exploration
// ---------------------------------------------------------------------------

// Visited chunks are kept per area of 8 x 8 chunks: a 64-bit map (two 32-bit halves), one bit per
// chunk. Saved as fixed-width records of 21 characters: dimension (1), area x (4), area z (4), the
// two halves (6 + 6), in a 64-character alphabet. Records are spread over player properties
// skills:map0, skills:map1, ... of at most PER_PROP records each, least recently visited first.
const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const RECORD = 21;
const PER_PROP = 1000; // 21,000 characters per property
const MAP_PROP = "skills:map";
const OFFSET = 2 ** 23; // area coordinates are within +-234,375: stored as non-negative 24-bit numbers

/** @param {number} n non-negative @param {number} width */
function enc(n, width) {
  let s = "";
  for (let i = 0; i < width; i++) {
    s = ALPHA[n % 64] + s;
    n = Math.floor(n / 64);
  }
  return s;
}

/** @param {string} s */
function dec(s) {
  let n = 0;
  for (const c of s) {
    const v = ALPHA.indexOf(c);
    if (v < 0) return NaN;
    n = n * 64 + v;
  }
  return n;
}

/** @typedef {{ areas: Map<string, number[]>, dirty: boolean }} Visited key = dimension + area x + area z (9 characters), value = [low, high] */

/** @type {Map<string, Visited>} */
const visited = new Map();

/** @param {Player} player @returns {Visited} */
function visitedOf(player) {
  let v = visited.get(player.id);
  if (v) return v;
  /** @type {Map<string, number[]>} */
  const areas = new Map();
  try {
    for (let i = 0; ; i++) {
      const raw = player.getDynamicProperty(`${MAP_PROP}${i}`);
      if (typeof raw !== "string") break;
      for (let at = 0; at + RECORD <= raw.length; at += RECORD) {
        const rec = raw.slice(at, at + RECORD);
        const lo = dec(rec.slice(9, 15));
        const hi = dec(rec.slice(15, 21));
        if (Number.isFinite(lo) && Number.isFinite(hi)) areas.set(rec.slice(0, 9), [lo >>> 0, hi >>> 0]);
      }
    }
  } catch (e) {
    console.warn(`[skills] explored chunks: ${e}`);
  }
  visited.set(player.id, (v = { areas, dirty: false }));
  return v;
}

/** @param {Player} player */
function saveVisited(player) {
  const v = visited.get(player.id);
  if (!v || !v.dirty) return;
  try {
    const records = [...v.areas].map(([key, [lo, hi]]) => key + enc(lo, 6) + enc(hi, 6));
    let i = 0;
    for (; i * PER_PROP < records.length; i++) player.setDynamicProperty(`${MAP_PROP}${i}`, records.slice(i * PER_PROP, (i + 1) * PER_PROP).join(""));
    for (; player.getDynamicProperty(`${MAP_PROP}${i}`) !== undefined; i++) player.setDynamicProperty(`${MAP_PROP}${i}`, undefined);
    v.dirty = false;
  } catch (e) {
    console.warn(`[skills] saving explored chunks: ${e}`);
  }
}

/**
 * Marks a chunk visited; true when it is new.
 * @param {Player} player @param {string} dim one character @param {number} cx @param {number} cz
 */
function visit(player, dim, cx, cz) {
  const v = visitedOf(player);
  const key = dim + enc((cx >> 3) + OFFSET, 4) + enc((cz >> 3) + OFFSET, 4);
  const bit = (cx & 7) + 8 * (cz & 7);
  const area = v.areas.get(key) ?? [0, 0];
  const half = bit < 32 ? 0 : 1;
  const mask = (1 << bit % 32) >>> 0;
  const fresh = (area[half] & mask) === 0;
  // Most recently visited last, so the oldest go first when there are too many.
  v.areas.delete(key);
  if (fresh) area[half] = (area[half] | mask) >>> 0;
  v.areas.set(key, area);
  const max = Math.max(1, Math.floor(CONFIG.exploration.maxAreas));
  while (v.areas.size > max) v.areas.delete(/** @type {string} */ (v.areas.keys().next().value));
  if (fresh) v.dirty = true;
  return fresh;
}

/** Explored chunks known for a player (for the menu). @param {Player} player */
function chunkCount(player) {
  let n = 0;
  for (const [lo, hi] of visitedOf(player).areas.values()) n += bits(lo) + bits(hi);
  return n;
}

/** @param {number} n */
function bits(n) {
  let c = 0;
  for (n >>>= 0; n; n >>>= 1) c += n & 1;
  return c;
}

/** Chunks each player was in lately: traveling in them again gives no distance XP. */
const RECENT_CHUNKS = 128;
/** @type {Map<string, { last?: { x: number, y: number, z: number, dim: string }, chunk: string, fresh: boolean, recent: Set<string>, blocks: number, minute: number, found: number }>} */
const travel = new Map();

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  const t = travel.get(player.id);
  if (t) t.last = undefined; // respawning or joining isn't traveling
  if (!initialSpawn) return;
  // Unlock master titles earned before the Titles pack was installed (it ignores repeats).
  system.runTimeout(() => {
    if (!player.isValid) return;
    for (const skill of SKILLS) if (levelFor(player, skill) >= MAX_LEVEL) mastered(player, skill, false);
  }, 200);
});

world.beforeEvents.playerLeave.subscribe(({ player }) => {
  // Player properties can still be written while the player leaves.
  saveVisited(player);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  travel.delete(playerId);
  visited.delete(playerId);
  streaks.delete(playerId);
  partyCache.delete(playerId);
  pending.delete(playerId);
});

let seconds = 0;
system.runInterval(() => {
  seconds++;
  for (const player of world.getAllPlayers()) {
    try {
      if (seconds % 30 === 0) saveVisited(player);
      if (!active(player)) {
        travel.delete(player.id);
        continue;
      }
      const loc = player.location;
      const dim = player.dimension.id;
      let t = travel.get(player.id);
      if (!t) travel.set(player.id, (t = { chunk: "", fresh: false, recent: new Set(), blocks: 0, minute: seconds, found: 0 }));
      const d = DIMS[dim] ?? dim;
      const cx = Math.floor(loc.x / 16);
      const cz = Math.floor(loc.z / 16);
      const chunk = `${d}${cx},${cz}`;
      const entered = chunk !== t.chunk;
      if (entered) {
        // Distance counts only in chunks you haven't been in lately, so riding a rail loop, a
        // water stream or circling your base earns nothing after the first lap.
        t.chunk = chunk;
        t.fresh = !t.recent.has(chunk);
        t.recent.delete(chunk);
        t.recent.add(chunk);
        while (t.recent.size > RECENT_CHUNKS) t.recent.delete(/** @type {string} */ (t.recent.values().next().value));
      }
      if (t.last && t.last.dim === dim && t.fresh) {
        const dist = Math.hypot(loc.x - t.last.x, loc.y - t.last.y, loc.z - t.last.z);
        if (dist <= CONFIG.exploration.maxSpeed) t.blocks += dist;
      }
      t.last = { x: loc.x, y: loc.y, z: loc.z, dim };
      const per = Math.max(1, CONFIG.exploration.blocksPerXp);
      if (seconds % 5 === 0 && t.blocks >= per) {
        const xp = Math.floor(t.blocks / per);
        t.blocks -= xp * per;
        award(player, "exploration", xp, { quiet: true }); // a note every few seconds while walking would be too much
      }

      if (!entered || !DIMS[dim] || !visit(player, d, cx, cz)) continue;
      if (seconds - t.minute >= 60) {
        t.minute = seconds;
        t.found = 0;
      }
      t.found++;
      if (t.found <= CONFIG.exploration.maxChunksPerMinute) award(player, "exploration", CONFIG.exploration.chunkXp);
      const speed = perkOf(player, "exploration", "speed");
      if (speed) effect(player, "speed", speed.seconds);
    } catch (e) {
      console.warn(`[skills] ${e}`);
    }
  }
}, 20);

// ---------------------------------------------------------------------------
// XP from other packs: realm:skill_xp { player, skill, amount }
// ---------------------------------------------------------------------------

system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:skill_xp") return;
    try {
      const req = JSON.parse(message);
      if (!req || typeof req !== "object" || typeof req.player !== "string") return;
      const skill = /** @type {Skill} */ (String(req.skill ?? "").toLowerCase().replace(/^skill_/, ""));
      const amount = Number(req.amount);
      if (!SKILLS.includes(skill) || !Number.isFinite(amount) || amount <= 0) return;
      const player = world.getAllPlayers().find((p) => p.id === req.player);
      if (player) award(player, skill, Math.min(100000, amount), { fromPack: true });
    } catch {
      // not JSON: ignore
    }
  },
  { namespaces: ["realm"] },
);

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/** "[||||||....]" in color. @param {number} p @param {number} of */
function bar(p, of) {
  const filled = Math.round((Math.min(p, of) / Math.max(1, of)) * 20);
  return `§a${"|".repeat(filled)}§8${"|".repeat(20 - filled)}§r`;
}

/** "340/1,200 XP to level 13", or "Max level". @param {number} xp */
function progressText(xp) {
  const level = levelOf(xp);
  if (level >= MAX_LEVEL) return `${bar(1, 1)} §6Max level`;
  const into = xp - TOTAL[level];
  const need = TOTAL[level + 1] - TOTAL[level];
  return `${bar(into, need)} §f${fmt(into)}/${fmt(need)} XP to level ${level + 1}`;
}

/**
 * Shows a form, retrying while the player still has chat or another screen open.
 * @param {Player} player @param {ActionFormData} form
 */
async function show(player, form) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return undefined;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return res;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
  return undefined;
}

/** @param {Player} player */
async function showSkills(player) {
  const levels = SKILLS.map((s) => levelFor(player, s));
  const total = levels.reduce((a, b) => a + b, 0);
  const notes = [`Total level: §e${total}§r of ${MAX_LEVEL * SKILLS.length}. Tap a skill for its perks.`];
  if (!enabled()) notes.push("§cSkills are paused on this realm: no XP for now.");
  if (get("partyBonus") > 0) notes.push(`§7+${get("partyBonus")}% XP while a party mate is within ${get("partyRange")} blocks.`);
  const form = new ActionFormData().title("§lSkills").body(notes.join("\n"));
  SKILLS.forEach((s, i) => form.button(`§l${NAMES[s]}§r  Level ${levels[i]}\n${progressText(xpOf(player, s)).replace(/ XP to level \d+$/, "")}`));
  form.button("Close");
  const res = await show(player, form);
  if (!res || res.canceled || res.selection === undefined || !player.isValid) return;
  const skill = SKILLS[res.selection];
  if (skill) await showSkill(player, skill);
}

/** @param {Player} player @param {Skill} skill */
async function showSkill(player, skill) {
  const xp = xpOf(player, skill);
  const level = levelOf(xp);
  const lines = [`§l${NAMES[skill]}§r  Level ${level} of ${MAX_LEVEL}`, progressText(xp), `§7Total XP: ${fmt(xp)}`, "", `§eHow to gain XP:§r ${HOW[skill]}`];
  if (skill === "exploration") lines.push(`§7Chunks you have explored: ${fmt(chunkCount(player))}`);
  lines.push("", "§ePerks:");
  const perks = [...(CONFIG.perks[skill] ?? [])].sort((a, b) => a.level - b.level);
  if (!perks.length) lines.push("§7None on this realm.");
  for (const p of perks) lines.push(p.level <= level ? `§a[x] Level ${p.level}: ${describe(skill, p)}` : `§7[ ] Level ${p.level}: ${describe(skill, p)}`);
  if (get("perksEnabled") !== true) lines.push("", "§cPerks are disabled on this realm.");
  const title = CONFIG.masterTitles[skill];
  if (title) lines.push("", `§7Level ${MAX_LEVEL} unlocks the title ${title}.`);
  const res = await show(player, new ActionFormData().title(`§l${NAMES[skill]}`).body(lines.join("\n")).button("Back").button("Close"));
  if (res && !res.canceled && res.selection === 0 && player.isValid) await showSkills(player);
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:skills",
      description: "Skills: your levels, XP and perks in Mining, Woodcutting, Farming, Fishing, Combat and Exploration",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showSkills(player).catch((e) => console.warn(`[skills] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "skills_bp");
  },
  { namespaces: ["realm"] },
);
