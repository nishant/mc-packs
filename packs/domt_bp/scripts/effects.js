// The Deck of Many Things: 132 cards (79 common, 36 uncommon, 15 rare, 2 legendary), plus 15 wild
// cards that start disabled.
// Each card is data (id, name, rarity, kind, the line on the card) and a small handler. A handler
// returns false when it can't happen here (no safe spot, no mob near...), and the deck draws again;
// a string is shown under the card's text.
import { EquipmentSlot, ItemLockMode, ItemStack, Player, system, WeatherType, world } from "@minecraft/server";
import { arena, inDeckArena, rainbowName, spore, wish } from "./events.js";
import {
  addCrowns,
  attempt,
  bar,
  between,
  blockAt,
  compass,
  burst,
  crownsOf,
  effect,
  enchant,
  ENCHANTS,
  farTeleport,
  give,
  giveStack,
  inZone,
  pick,
  prettyId,
  randomEnchanted,
  randomSpot,
  restoreDue,
  safeHop,
  saveTask,
  sightSpot,
  sound,
  spawnAround,
  spawnFresh,
  spotNear,
  standable,
  strike,
  UNTIL_DEATH,
  wait,
} from "./helpers.js";

/**
 * @typedef {object} Ctx
 * @property {Player} player who the card is for
 * @property {boolean} test run by the test path: long waits are short and forms are answered
 * @property {(msg: string) => void} announce tells everyone (when rare draws are announced)
 * @property {number} sporeMinutes how long The Spore lasts
 */
/**
 * @typedef {"common" | "uncommon" | "rare" | "legendary"} Rarity
 * @typedef {object} Card
 * @property {string} id
 * @property {string} name
 * @property {Rarity} rarity
 * @property {"good" | "bad" | "mixed"} kind
 * @property {string} text the line on the card (plain ASCII)
 * @property {string} expect what the test path checks afterwards: effect:<id>, item:<id>, spawn:<id>, hurt, fire, day, mended, worn, heldname, move, far, dim, xp, levels-, crowns, crowns-, crowns?, reward, health, noeffects, hotbar, drop, name, time, rotate, blocks, none
 * @property {boolean} [wild] a wild card: off until an operator switches it on
 * @property {boolean} [blocks] changes blocks (off with "Block-changing cards" disabled; skipped in safe zones)
 * @property {(p: Player) => void} [prep] test path only: set the player up so the card has something to work on
 * @property {(ctx: Ctx) => boolean | string | void | Promise<boolean | string | void>} run
 */

const S = "minecraft:";

/** A status effect card. @param {string} id @param {string} name @param {Rarity} rarity @param {Card["kind"]} kind @param {string} text @param {string} eff @param {number} seconds @param {number} [amp] @returns {Card} */
const buff = (id, name, rarity, kind, text, eff, seconds, amp = 0) => ({
  id,
  name,
  rarity,
  kind,
  text,
  expect: `effect:${eff}`,
  run: ({ player }) => {
    effect(player, S + eff, seconds, amp);
    burst(player.dimension, kind === "bad" ? "minecraft:villager_angry" : "minecraft:villager_happy", player.location, 8);
  },
});

/** An item card. @param {string} id @param {string} name @param {Rarity} rarity @param {Card["kind"]} kind @param {string} text @param {[string, number][]} items @returns {Card} */
const gift = (id, name, rarity, kind, text, items) => ({
  id,
  name,
  rarity,
  kind,
  text,
  expect: `item:${items[0][0]}`,
  run: ({ player }) => {
    for (const [item, n] of items) give(player, S + item, n);
    sound(player, "random.pop", 0.8);
  },
});

/** A mob card. @param {string} id @param {string} name @param {Rarity} rarity @param {Card["kind"]} kind @param {string} text @param {string} type @param {number} n @param {number} [minR] @param {number} [maxR] @returns {Card} */
const mobs = (id, name, rarity, kind, text, type, n, minR = 3, maxR = 6) => ({
  id,
  name,
  rarity,
  kind,
  text,
  expect: `spawn:${type}`,
  run: ({ player }) => {
    if (!spawnAround(player, S + type, n, minR, maxR).length) return false;
  },
});

/** Sends a script event to another pack. @param {string} id @param {object} msg */
const send = (id, msg) => attempt(() => system.sendScriptEvent(id, JSON.stringify(msg)));
const SKILLS = ["mining", "woodcutting", "farming", "fishing", "combat", "exploration"];
const SKILL_NAMES = { mining: "Mining", woodcutting: "Woodcutting", farming: "Farming", fishing: "Fishing", combat: "Combat", exploration: "Exploration" };

/** Skill XP through the Skills pack (realm:skill_xp); nothing happens without it. @param {Player} p @param {number} amount */
function skillXp(p, amount) {
  const skill = /** @type {keyof typeof SKILL_NAMES} */ (pick(SKILLS));
  send("realm:skill_xp", { player: p.id, skill, amount });
  return SKILL_NAMES[skill];
}

/** Gives hotbar filler so cards that work on the held item have something (test path). @param {Player} p */
const fillHotbar = (p) => {
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  ["stick", "dirt", "cobblestone", "oak_planks"].forEach((id, i) => {
    if (!inv.getItem(i)) attempt(() => inv.setItem(i, new ItemStack(S + id, 4)));
  });
  p.selectedSlotIndex = 0;
};

/** Champion mobs the deck asks for: ones that always come for a player (Champions swaps any it doesn't make). */
const CHAMP_MOBS = ["minecraft:zombie", "minecraft:husk", "minecraft:skeleton", "minecraft:stray", "minecraft:witch"];

/** The deck's own champion, when the Champions pack isn't there. @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at */
function deckChampion(dim, at) {
  const e = spawnFresh(dim, "minecraft:vindicator", at);
  e.nameTag = "§cThe Deck's Champion";
  e.addTag("domt:boss");
  effect(e, "minecraft:health_boost", 3600, 4);
  effect(e, "minecraft:instant_health", 1, 4);
  effect(e, "minecraft:resistance", 3600);
  effect(e, "minecraft:strength", 3600);
  return e;
}

/**
 * Three seconds after a champion appears, checks it is still there. If something removed it before
 * anyone could fight it (not a kill), the deck sends its own near the player. If the deck already
 * sent its own and the Champions pack's champion turns up late after all, the late one goes, so
 * only one champion comes.
 * @param {Player} p @param {import("@minecraft/server").Entity} champ @param {string} tag the tag asked of the Champions pack
 */
function watchChampion(p, champ, tag) {
  const dim = champ.dimension;
  const champId = champ.id;
  let died = false;
  const onDie = world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
    if (deadEntity.id === champId) died = true;
  });
  system.runTimeout(() => {
    attempt(() => world.afterEvents.entityDie.unsubscribe(onDie));
    try {
      if (champ.isValid && champ.hasTag("domt:boss")) for (const late of dim.getEntities({ tags: [tag] })) attempt(() => late.remove());
      if (died || !p.isValid || champ.isValid) return;
      const spot = sightSpot(p, 6, 10) ?? randomSpot(p, 6, 10, 40, 8);
      if (!spot) return;
      deckChampion(p.dimension, spot);
      p.sendMessage(`§6[Deck] §7The champion slipped away, so the deck sends its own, ${Math.round(Math.hypot(spot.x - p.location.x, spot.z - p.location.z))} blocks to the ${compass(p.location, spot)}.`);
    } catch (e) {
      console.warn(`[domt] champion check: ${e}`);
    }
  }, 60);
}

/** The item in the player's hand. @param {Player} p */
function held(p) {
  const inv = p.getComponent("minecraft:inventory")?.container;
  const slot = p.selectedSlotIndex;
  return { inv, slot, item: inv?.getItem(slot) };
}

/** Test path: an iron sword in the first hotbar slot, in hand, `damage` points worn. @param {Player} p @param {number} [damage] */
const testSword = (p, damage = 0) => {
  const inv = p.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  const sword = new ItemStack("minecraft:iron_sword", 1);
  const d = sword.getComponent("minecraft:durability");
  if (d && damage) d.damage = damage;
  inv.setItem(0, sword);
  p.selectedSlotIndex = 0;
};

/** Test path: Resistance IV, so cards that hurt don't kill the test player. @param {Player} p */
const toughen = (p) => effect(p, "minecraft:resistance", 30, 3);

/** Test path: moves the player to a nearby spot with open sky (`h` blocks), for cards that need it. @param {Player} p @param {number} h */
function toOpenSky(p, h) {
  for (let i = 0; i < 60; i++) {
    const spot = randomSpot(p, 1, 12, 1);
    if (!spot) continue;
    let clear = true;
    for (let y = 1; y <= h && clear; y++) clear = !!blockAt(p.dimension, { x: spot.x, y: spot.y + y, z: spot.z })?.isAir;
    if (clear) return void p.teleport(spot, { dimension: p.dimension, keepVelocity: false });
  }
}

/** Is the player's spot (and `pad` blocks around it) inside a safe zone? @param {Player} p @param {number} pad */
const zoned = (p, pad) => inZone(p.dimension.id, p.location.x, p.location.z, pad);

/** @type {Map<string, number>} player id -> the tick they last died */
const deaths = new Map();
world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => attempt(() => void deaths.set(deadEntity.id, system.currentTick)),
  { entityTypes: ["minecraft:player"] },
);
/** Has the player died since `tick`? @param {Player} p @param {number} tick */
const diedSince = (p, tick) => (deaths.get(p.id) ?? -1) >= tick;

/**
 * Runs `tick(secondsLeft)` now and then once a second, `seconds` times, in the background, then
 * `done` when the time is up. Stops early (without `done`) when the player leaves or dies (a card's
 * curse ends with the player: no lightning at their respawn point), or `tick` returns false.
 * @param {Player} p @param {number} seconds @param {(left: number) => boolean | void} tick @param {() => void} [done]
 */
function everySecond(p, seconds, tick, done) {
  let left = seconds;
  const start = system.currentTick;
  const step = () => {
    if (!p.isValid || diedSince(p, start)) return false;
    if (left <= 0) {
      done?.();
      return false;
    }
    const go = tick(left) !== false;
    left--;
    return go;
  };
  try {
    if (!step()) return;
  } catch (e) {
    return void console.warn(`[domt] timer: ${e}`);
  }
  const id = system.runInterval(() => {
    try {
      if (!step()) system.clearRun(id);
    } catch (e) {
      system.clearRun(id);
      console.warn(`[domt] timer: ${e}`);
    }
  }, 20);
}

/** Spawns mobs in the air above spots around the player. @param {Player} p @param {string} type @param {number} n @param {number} up @param {number} r */
function spawnAbove(p, type, n, up, r) {
  const dim = p.dimension;
  const at = p.location;
  /** @type {import("@minecraft/server").Entity[]} */
  const out = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const loc = { x: at.x + between(-r, r), y: at.y + up, z: at.z + between(-r, r) };
    const b = blockAt(dim, loc);
    if (!b || !b.isAir) continue;
    attempt(() => out.push(spawnFresh(dim, type, loc)));
  }
  return out;
}

const ANVILS = ["minecraft:anvil", "minecraft:chipped_anvil", "minecraft:damaged_anvil"];

/**
 * Anvil Drop's anvil goes away `seconds` after it drops (saved, so a restart doesn't keep it). It
 * lands on the block at `floor` (or replaces it, if that was grass or a flower): only an anvil
 * there is removed, never one that was there before, and the block it replaced comes back.
 * @param {string} dim @param {number} x @param {number} floor @param {number} z @param {string} under the block at `floor` before the drop @param {number} seconds
 */
function removeAnvil(dim, x, floor, z, under, seconds) {
  const types = ["minecraft:air", ...ANVILS];
  /** @type {number[][]} */
  const blocks = ANVILS.map((_, i) => [x, floor + 1, z, 0, i + 1]);
  if (!ANVILS.includes(under) && under !== "minecraft:air") {
    types.push(under);
    for (let i = 0; i < ANVILS.length; i++) blocks.push([x, floor, z, types.length - 1, i + 1]);
  }
  const id = `anvil_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
  saveTask({ id, dim, at: Date.now() + seconds * 1000, types, blocks });
  system.runTimeout(() => attempt(() => restoreDue(id)), seconds * 20);
}

/** A Hot Potato whose 30 seconds ran out without the bang (a restart)? @param {ItemStack | undefined} it */
function stalePotato(it) {
  if (!it || it.typeId !== "minecraft:potato") return false;
  const mark = it.getLore().find((l) => l.startsWith("§8Deck of Many Things "));
  const made = mark ? parseInt(mark.slice("§8Deck of Many Things ".length), 36) : NaN;
  return Number.isFinite(made) && Date.now() - made > 40000;
}

/** A Hot Potato whose 30 seconds ran out while its holder was away (or the server restarted) is removed when they join, without the bang. */
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  attempt(() => {
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    for (let i = 0; i < inv.size; i++) if (stalePotato(inv.getItem(i))) inv.setItem(i, undefined);
  });
});

const TEMP_TAG = "domt:temp"; // mobs that leave after a while
const PROP_GONE = "domt:gone"; // entity: when it leaves (ms since 1970)

/** The mob leaves after `seconds`, even across a restart or a chunk reload. @param {import("@minecraft/server").Entity} e @param {number} seconds */
function tempMob(e, seconds) {
  attempt(() => {
    e.setDynamicProperty(PROP_GONE, Date.now() + seconds * 1000);
    e.addTag(TEMP_TAG);
  });
  system.runTimeout(() => attempt(() => e.isValid && e.remove()), seconds * 20);
}

/** Removes a temporary mob whose time is up. @param {import("@minecraft/server").Entity} e */
function expire(e) {
  const gone = e.getDynamicProperty(PROP_GONE);
  if (typeof gone !== "number" || Date.now() >= gone) e.remove();
}

world.afterEvents.entityLoad.subscribe(({ entity }) =>
  attempt(() => {
    if (!entity.isValid) return;
    if (entity.hasTag(TEMP_TAG)) expire(entity);
    // A Hot Potato left lying on the ground when the server restarted goes quietly too.
    else if (entity.typeId === "minecraft:item" && stalePotato(entity.getComponent("minecraft:item")?.itemStack)) entity.remove();
  }),
);
system.runInterval(() => {
  for (const id of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"])
    attempt(() => {
      for (const e of world.getDimension(id).getEntities({ tags: [TEMP_TAG] })) attempt(() => expire(e));
    });
}, 400);

/**
 * Is the player somewhere a swap must not reach: a running Deck arena, or an Expedition run (the
 * Expeditions pack tags players in a run `realm_expedition`, and its dungeon mobs and pets `realm:exp_mob` /
 * `realm:exp_pet`; any of those within 64 blocks means the player is in or by a dungeon)?
 * @param {Player} p
 */
function busyElsewhere(p) {
  if (inDeckArena(p)) return true;
  if (p.hasTag("realm_expedition")) return true;
  try {
    for (const tag of ["realm:exp_mob", "realm:exp_pet"]) if (p.dimension.getEntities({ tags: [tag], location: p.location, maxDistance: 64 }).length) return true;
  } catch {
    return true;
  }
  return false;
}

/** Villagers The Void never moves: they live in trading halls and farms. */
const VILLAGERS = ["minecraft:villager_v2", "minecraft:villager"];

/** Names Cursed Name picks from. */
const SILLY_NAMES = ["Sir Bonks-a-Lot", "Captain Soggy", "Lord Snackington", "Dirt Muncher", "The Wobbler", "Princess Pebble", "Baron von Oops", "Mister Noodles", "Duke of Mud", "Lil Creeper Hugger"];

/** @type {Card[]} */
export const CARDS = [
  // ---------------------------------------------------------------------------
  // Common
  // ---------------------------------------------------------------------------
  buff("swift_feet", "Swift Feet", "common", "good", "Speed II for 15 minutes.", "speed", 900, 1),
  buff("the_frog", "The Frog", "common", "good", "Jump Boost II for 15 minutes.", "jump_boost", 900, 1),
  buff("owl_eyes", "Owl's Eyes", "common", "good", "Night Vision for an hour.", "night_vision", 3600),
  buff("iron_skin", "Iron Skin", "common", "good", "Resistance for 15 minutes.", "resistance", 900),
  buff("the_miner", "The Miner", "common", "good", "Haste II for 20 minutes.", "haste", 1200, 1),
  buff("the_fish", "The Fish", "common", "good", "Water Breathing for 30 minutes.", "water_breathing", 1800),
  buff("the_feather", "The Feather", "common", "good", "Slow Falling for 15 minutes.", "slow_falling", 900),
  buff("ember_ward", "Ember Ward", "common", "good", "Fire Resistance for 20 minutes.", "fire_resistance", 1200),
  {
    id: "the_healer",
    name: "The Healer",
    rarity: "common",
    kind: "good",
    text: "Instant healing and Regeneration II for 1 minute.",
    expect: "effect:regeneration",
    run: ({ player }) => {
      effect(player, "minecraft:instant_health", 1, 1);
      effect(player, "minecraft:regeneration", 60, 1);
      burst(player.dimension, "minecraft:heart_particle", player.location, 8);
    },
  },
  buff("the_ox", "The Ox", "common", "good", "Strength for 15 minutes.", "strength", 900),
  buff("golden_heart", "Golden Heart", "common", "good", "Absorption II for 15 minutes.", "absorption", 900, 1),
  buff("village_hero", "Village Hero", "common", "good", "Hero of the Village for 30 minutes: villagers give discounts.", "village_hero", 1800),
  buff("full_belly", "Full Belly", "common", "good", "Your hunger is filled.", "saturation", 2, 9),
  buff("the_shadow", "The Shadow", "common", "mixed", "Invisibility for 15 minutes.", "invisibility", 900),
  buff("the_vigor", "The Vigor", "common", "good", "Health Boost II for 30 minutes: four extra hearts.", "health_boost", 1800, 1),
  buff("heavy_boots", "Heavy Boots", "common", "bad", "Slowness for 15 minutes.", "slowness", 900),
  buff("sore_arms", "Sore Arms", "common", "bad", "Mining Fatigue II for 10 minutes.", "mining_fatigue", 600, 1),
  buff("weak_arms", "Weak Arms", "common", "bad", "Weakness for 15 minutes.", "weakness", 900),
  buff("famine", "Famine", "common", "bad", "Hunger II for 3 minutes: your food bar drains fast.", "hunger", 180, 1),
  buff("dizzy_spell", "Dizzy Spell", "common", "bad", "Nausea for 1 minute.", "nausea", 60),
  buff("the_blindfold", "The Blindfold", "common", "bad", "Blindness for 1 minute.", "blindness", 60),
  buff("the_dark", "The Dark", "common", "bad", "Darkness for 3 minutes.", "darkness", 180),
  {
    id: "up_up",
    name: "Up, Up",
    rarity: "common",
    kind: "bad",
    text: "Levitation for 7 seconds. What goes up must come down.",
    expect: "effect:levitation",
    run: ({ player }) => {
      effect(player, "minecraft:levitation", 7);
    },
  },
  buff("sour_berry", "Sour Berry", "common", "bad", "Poison II for 30 seconds. It stops at half a heart.", "poison", 30, 1),
  {
    id: "hot_foot",
    name: "Hot Foot",
    rarity: "common",
    kind: "bad",
    text: "Your boots catch fire for a moment.",
    expect: "none",
    run: ({ player }) => {
      player.setOnFire(3, true);
    },
  },
  {
    id: "butterfingers",
    name: "Butterfingers",
    rarity: "common",
    kind: "bad",
    text: "You drop what you are holding.",
    expect: "drop",
    prep: (p) => fillHotbar(p),
    run: ({ player }) => {
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (!inv) return false;
      const slot = player.selectedSlotIndex;
      const item = inv.getItem(slot);
      // A locked item (the Realm Configuration item, another pack's tool) stays: it can't be dropped.
      if (!item || item.lockMode !== ItemLockMode.none) return false;
      inv.setItem(slot, undefined);
      // A few blocks away, so it isn't picked straight back up, and where the player can see it: never
      // in another cave below a mine tunnel or on the surface above it.
      const spot = sightSpot(player, 3, 5, 20) ?? player.location;
      player.dimension.spawnItem(item, { x: spot.x, y: spot.y + 0.5, z: spot.z });
    },
  },
  {
    id: "the_juggler",
    name: "The Juggler",
    rarity: "common",
    kind: "bad",
    text: "Your hotbar is shuffled.",
    expect: "hotbar",
    prep: (p) => fillHotbar(p),
    run: ({ player }) => {
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (!inv) return false;
      // An item locked in its slot stays where it is; the rest are shuffled.
      /** @type {number[]} */
      const slots = [];
      for (let i = 0; i < 9; i++) if (inv.getItem(i)?.lockMode !== ItemLockMode.slot) slots.push(i);
      const items = slots.map((i) => inv.getItem(i));
      if (items.filter((x) => x).length < 2) return false;
      const before = items.map((x) => x?.typeId ?? "").join();
      let shuffled = items;
      for (let t = 0; t < 5 && shuffled.map((x) => x?.typeId ?? "").join() === before; t++) shuffled = [...items].sort(() => Math.random() - 0.5);
      shuffled.forEach((it, k) => inv.setItem(slots[k], it));
      sound(player, "random.pop", 1.4);
    },
  },
  gift("bakers_gift", "Baker's Gift", "common", "good", "16 bread.", [["bread", 16]]),
  gift("the_feast", "The Feast", "common", "good", "12 steaks.", [["cooked_beef", 12]]),
  gift("golden_carrots", "Golden Carrots", "common", "good", "8 golden carrots.", [["golden_carrot", 8]]),
  gift("the_apple", "The Apple", "common", "good", "Two golden apples.", [["golden_apple", 2]]),
  {
    id: "the_cake",
    name: "The Cake",
    rarity: "common",
    kind: "good",
    text: "A cake! Happy un-birthday.",
    expect: "item:cake",
    run: ({ player }) => {
      give(player, "minecraft:cake", 1);
      burst(player.dimension, "minecraft:note_particle", player.location, 8);
      sound(player, "random.levelup", 1.6, 0.6);
    },
  },
  gift("the_torch", "The Torch", "common", "good", "64 torches.", [["torch", 64]]),
  gift("the_quiver", "The Quiver", "common", "good", "48 arrows.", [["arrow", 48]]),
  gift("lump_of_coal", "Lump of Coal", "common", "mixed", "16 coal. Were you naughty?", [["coal", 16]]),
  gift("iron_ration", "Iron Ration", "common", "good", "12 iron ingots.", [["iron_ingot", 12]]),
  gift("fools_gold", "Fool's Gold", "common", "good", "8 gold ingots.", [["gold_ingot", 8]]),
  gift("merchants_purse", "Merchant's Purse", "common", "good", "6 emeralds.", [["emerald", 6]]),
  gift("the_woodsman", "The Woodsman", "common", "good", "32 oak logs.", [["oak_log", 32]]),
  gift("green_thumb", "Green Thumb", "common", "good", "32 bone meal.", [["bone_meal", 32]]),
  gift("the_gardener", "The Gardener", "common", "good", "Seeds, a sapling and a few carrots and potatoes.", [
    ["wheat_seeds", 8],
    ["oak_sapling", 2],
    ["carrot", 4],
    ["potato", 4],
  ]),
  gift("the_pearl", "The Pearl", "common", "good", "4 ender pearls.", [["ender_pearl", 4]]),
  gift("honey_pot", "Honey Pot", "common", "good", "4 bottles of honey.", [["honey_bottle", 4]]),
  {
    id: "the_bouquet",
    name: "The Bouquet",
    rarity: "common",
    kind: "good",
    text: "A bunch of flowers.",
    expect: "item:any",
    run: ({ player }) => {
      for (const f of ["poppy", "dandelion", "cornflower", "blue_orchid", "allium", "oxeye_daisy"].sort(() => Math.random() - 0.5).slice(0, 3)) give(player, S + f, 2);
    },
  },
  gift("rotten_luck", "Rotten Luck", "common", "bad", "16 rotten flesh. Yum.", [["rotten_flesh", 16]]),
  gift("pocket_dirt", "Pocket Dirt", "common", "bad", "32 dirt. Your pockets are full of it.", [["dirt", 32]]),
  gift("snow_day", "Snow Day", "common", "good", "16 snowballs.", [["snowball", 16]]),
  gift("the_name", "The Name", "common", "good", "A name tag.", [["name_tag", 1]]),
  mobs("the_flock", "The Flock", "common", "good", "Three chickens come running.", "chicken", 3),
  mobs("stray_cat", "Stray Cat", "common", "good", "A stray cat finds you. Fish might win it over.", "cat", 1),
  mobs("bunny_hop", "Bunny Hop", "common", "good", "Four rabbits hop out of the deck.", "rabbit", 4),
  mobs("the_grave", "The Grave", "common", "bad", "Three zombies climb out of the ground.", "zombie", 3, 5, 8),
  mobs("creepy_crawlies", "Creepy Crawlies", "common", "bad", "Three spiders drop in.", "spider", 3, 5, 8),
  mobs("the_slime", "The Slime", "common", "bad", "A slime oozes out of the deck.", "slime", 1, 4, 7),
  mobs("the_hive", "The Hive", "common", "mixed", "Three bees buzz around. Be nice to them.", "bee", 3),
  mobs("bone_rattle", "Bone Rattle", "common", "bad", "Three skeletons rattle up.", "skeleton", 3, 6, 9),
  mobs("frog_chorus", "Frog Chorus", "common", "good", "Three frogs, ready to sing.", "frog", 3),
  {
    id: "the_hop",
    name: "The Hop",
    rarity: "common",
    kind: "mixed",
    text: "You blink 8 to 16 blocks away.",
    expect: "move",
    run: ({ player }) => safeHop(player, 8, 16) && undefined,
  },
  {
    id: "the_wanderer",
    name: "The Wanderer",
    rarity: "common",
    kind: "mixed",
    text: "You are whisked up to 64 blocks in a random direction.",
    expect: "move",
    run: ({ player }) => safeHop(player, 24, 64) && undefined,
  },
  {
    id: "the_sky",
    name: "The Sky",
    rarity: "common",
    kind: "bad",
    text: "You are thrown 14 to 22 blocks into the sky. Find water, or brace yourself.",
    expect: "move",
    run: ({ player, test }) => {
      const dim = player.dimension;
      const h = between(14, 22);
      /** Open sky above this spot? @param {import("@minecraft/server").Vector3} at */
      const clear = (at) => {
        for (let y = 1; y <= h + 2; y++) {
          const b = blockAt(dim, { x: at.x, y: at.y + y, z: at.z });
          if (!b || !b.isAir) return false;
        }
        return true;
      };
      let at = player.location;
      for (let i = 0; i < 12 && !clear(at); i++) {
        const spot = randomSpot(player, 1, 8, 4);
        // Near the player's own height: never a spot on the surface far above a cave.
        at = spot && Math.abs(spot.y - player.location.y) <= 3 && clear(spot) ? spot : at;
      }
      if (!clear(at)) return false;
      bar(player, "§cThe ground lets go of you...", 40);
      sound(player, "mob.enderdragon.flap");
      const to = { x: at.x, y: at.y + h, z: at.z };
      system.runTimeout(() => attempt(() => player.isValid && player.teleport(to, { dimension: dim, keepVelocity: false })), test ? 2 : 30);
      return `${h} blocks up, and nothing to slow your fall.`;
    },
  },
  {
    id: "the_spin",
    name: "The Spin",
    rarity: "common",
    kind: "mixed",
    text: "You spin around. Which way were you going?",
    expect: "rotate",
    run: ({ player }) => {
      const r = player.getRotation();
      player.setRotation({ x: r.x, y: ((r.y + between(90, 270) + 180) % 360) - 180 });
      sound(player, "random.pop", 0.6);
    },
  },
  {
    id: "the_spark",
    name: "The Spark",
    rarity: "common",
    kind: "good",
    text: "100 experience points.",
    expect: "xp",
    run: ({ player }) => {
      player.addExperience(100);
      sound(player, "random.orb");
    },
  },
  {
    id: "copper_purse",
    name: "Copper Purse",
    rarity: "common",
    kind: "good",
    text: "10 Crowns.",
    expect: "crowns",
    run: ({ player }) => {
      addCrowns(player, 10);
      return `You have ${crownsOf(player)} Crowns.`;
    },
  },
  {
    id: "the_taxman",
    name: "The Taxman",
    rarity: "common",
    kind: "bad",
    text: "The taxman takes 10 Crowns.",
    expect: "crowns-",
    prep: (p) => void addCrowns(p, 10),
    run: ({ player }) => {
      const took = -addCrowns(player, -10);
      return took ? `You have ${crownsOf(player)} Crowns.` : "You had nothing to take. The taxman leaves grumbling.";
    },
  },
  {
    id: "the_leech",
    name: "The Leech",
    rarity: "common",
    kind: "bad",
    text: "You lose three experience levels.",
    expect: "levels-",
    prep: (p) => void p.addLevels(3),
    run: ({ player }) => {
      if (player.level < 1) return false;
      player.addLevels(-Math.min(3, player.level));
      sound(player, "mob.silverfish.hit");
    },
  },
  {
    id: "the_bandage",
    name: "The Bandage",
    rarity: "common",
    kind: "good",
    text: "Your health is fully restored.",
    expect: "health",
    prep: (p) => void p.getComponent("minecraft:health")?.setCurrentValue(8),
    run: ({ player }) => {
      const hp = player.getComponent("minecraft:health");
      if (!hp) return false;
      hp.resetToMaxValue();
      burst(player.dimension, "minecraft:heart_particle", player.location, 6);
    },
  },
  {
    id: "clean_slate",
    name: "Clean Slate",
    rarity: "common",
    kind: "mixed",
    text: "Every effect on you is washed away, good and bad.",
    expect: "noeffects",
    prep: (p) => effect(p, "minecraft:slowness", 30),
    run: ({ player }) => {
      const all = player.getEffects();
      if (!all.length) return false;
      for (const e of all) player.removeEffect(e.typeId);
      sound(player, "random.drink");
    },
  },
  {
    id: "the_fireworks",
    name: "The Fireworks",
    rarity: "common",
    kind: "good",
    text: "Fireworks! And three rockets to keep.",
    expect: "item:firework_rocket",
    run: async ({ player }) => {
      give(player, "minecraft:firework_rocket", 3);
      for (let i = 0; i < 5; i++) {
        const at = player.location;
        attempt(() => player.dimension.spawnEntity("minecraft:fireworks_rocket", { x: at.x + between(-3, 3), y: at.y + 1, z: at.z + between(-3, 3) }));
        await wait(6);
        if (!player.isValid) break;
      }
    },
  },
  {
    id: "confetti",
    name: "Confetti",
    rarity: "common",
    kind: "good",
    text: "A burst of confetti. Congratulations, on something!",
    expect: "none",
    run: ({ player }) => {
      burst(player.dimension, "minecraft:totem_particle", player.location, 30, 1.5);
      sound(player, "random.levelup", 1.4);
    },
  },
  {
    id: "the_rainbow",
    name: "The Rainbow",
    rarity: "common",
    kind: "good",
    text: "Your name shines in rainbow colors for 20 minutes.",
    expect: "name",
    run: ({ player, test }) => rainbowName(player, { test }),
  },

  buff("golden_hour", "Golden Hour", "common", "good", "Regeneration for 5 minutes.", "regeneration", 300),
  buff("withering", "Withering", "common", "bad", "Wither II for 10 seconds. It can kill.", "wither", 10, 1),
  buff("the_ooze", "The Ooze", "common", "bad", "Oozing for 20 minutes: if you die, slimes burst out of you.", "oozing", 1200),
  buff("the_albatross", "The Albatross", "common", "bad", "Slowness until you die (or drink milk).", "slowness", UNTIL_DEATH),
  mobs("venom", "Venom", "common", "bad", "Three cave spiders skitter in. They bite with poison.", "cave_spider", 3, 4, 7),
  {
    id: "smite",
    name: "Smite",
    rarity: "common",
    kind: "bad",
    text: "Lightning strikes you. The fire it starts goes out; yours doesn't.",
    expect: "fire",
    prep: toughen,
    run: ({ player }) => {
      strike(player.dimension, player.location, player);
    },
  },
  {
    id: "the_kick",
    name: "The Kick",
    rarity: "common",
    kind: "bad",
    text: "Something kicks you, hard, into the air in a random direction.",
    expect: "move",
    run: ({ player }) => {
      const a = Math.random() * Math.PI * 2;
      player.applyKnockback({ x: Math.cos(a) * 2.6, z: Math.sin(a) * 2.6 }, 1.1);
      sound(player, "mob.irongolem.throw");
      burst(player.dimension, "minecraft:knockback_roar_particle", player.location, 2);
    },
  },
  {
    id: "the_magpie",
    name: "The Magpie",
    rarity: "common",
    kind: "bad",
    text: "A magpie snatches a stack from your pockets and drops it 8 to 16 blocks away. Go get it.",
    expect: "drop",
    prep: (p) => fillHotbar(p),
    run: ({ player }) => {
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (!inv) return false;
      // Never enchanted, named or container items: the magpie wants shiny things, not your best sword.
      const slots = [];
      for (let i = 0; i < inv.size; i++) {
        const it = inv.getItem(i);
        if (!it || it.nameTag || it.lockMode !== ItemLockMode.none || /shulker_box|bundle/.test(it.typeId)) continue;
        if (it.getComponent("minecraft:enchantable")?.getEnchantments().length) continue;
        slots.push(i);
      }
      if (!slots.length) return false;
      const slot = pick(slots);
      const item = /** @type {ItemStack} */ (inv.getItem(slot));
      // Somewhere the player can see it, so it can be fetched (not in another cave, nor on the surface over a mine).
      const spot = sightSpot(player, 8, 16, 40);
      if (!spot) return false;
      inv.setItem(slot, undefined);
      player.dimension.spawnItem(item, { x: spot.x, y: spot.y + 0.5, z: spot.z });
      sound(player, "mob.parrot.fly");
      return `It took ${item.amount} ${prettyId(item.typeId).toLowerCase()} to the ${compass(player.location, spot)}.`;
    },
  },
  {
    id: "hiss",
    name: "Hiss",
    rarity: "common",
    kind: "bad",
    text: "A creeper appears right behind you.",
    expect: "spawn:creeper",
    blocks: true,
    run: ({ player }) => {
      if (zoned(player, 8)) return false;
      const dim = player.dimension;
      const v = player.getViewDirection();
      const len = Math.hypot(v.x, v.z) || 1;
      const at = player.location;
      const behind = spotNear(dim, at.x - (v.x / len) * 2.5, at.z - (v.z / len) * 2.5, at.y, 2) ?? randomSpot(player, 2, 4, 20);
      if (!behind) return false;
      dim.spawnEntity("minecraft:creeper", behind);
      sound(player, "random.fuse", 1, 0.6);
    },
  },

  // ---------------------------------------------------------------------------
  // Uncommon
  // ---------------------------------------------------------------------------
  {
    id: "the_merchant",
    name: "The Merchant",
    rarity: "uncommon",
    kind: "good",
    text: "A wandering trader appears with wares to sell.",
    expect: "spawn:wandering_trader",
    run: ({ player }) => {
      const t = spawnAround(player, "minecraft:wandering_trader", 1, 3, 5);
      if (!t.length) return false;
      sound(player, "mob.wanderingtrader.yes");
    },
  },
  {
    id: "the_void",
    name: "The Void",
    rarity: "uncommon",
    kind: "mixed",
    text: "You swap places with a nearby creature.",
    expect: "move",
    prep: (p) => void spawnAround(p, "minecraft:pig", 1, 5, 8),
    run: ({ player }) => {
      const dim = player.dimension;
      const at = player.location;
      const near = dim
        .getEntities({ location: at, maxDistance: 24, minDistance: 3, families: ["mob"], excludeTypes: ["minecraft:player"] })
        .filter((e) => !e.getTags().some((t) => t.startsWith("realm") || t.startsWith("npc") || t.startsWith("domt")))
        // Never someone's pet, a named or leashed mob, a ridden horse or a villager (out of its trading hall).
        .filter((e) => !e.nameTag && !VILLAGERS.includes(e.typeId) && !e.hasComponent("minecraft:is_tamed") && !e.getComponent("minecraft:tameable")?.isTamed && !e.getComponent("minecraft:leashable")?.isLeashed && !e.getComponent("minecraft:rideable")?.getRiders().length)
        .filter((e) => {
          const l = e.location;
          return standable(dim, Math.floor(l.x), Math.floor(l.y), Math.floor(l.z));
        });
      const mob = near[0];
      if (!mob) return false;
      const there = { ...mob.location };
      mob.teleport(at, { keepVelocity: false });
      player.teleport(there, { keepVelocity: false });
      burst(dim, "minecraft:portal_reverse_particle", at, 12);
      burst(dim, "minecraft:portal_reverse_particle", there, 12);
      sound(player, "mob.endermen.portal");
      return `You swapped places with a ${mob.typeId.replace(S, "").replace(/_/g, " ")}.`;
    },
  },
  {
    id: "the_scholar",
    name: "The Scholar",
    rarity: "uncommon",
    kind: "good",
    text: "A random enchanted book.",
    expect: "item:enchanted_book",
    run: ({ player }) => {
      const { stack } = randomEnchanted("minecraft:enchanted_book", ENCHANTS.book, 1, 3);
      giveStack(player, stack);
      sound(player, "item.book.page_turn");
    },
  },
  {
    id: "the_smith",
    name: "The Smith",
    rarity: "uncommon",
    kind: "good",
    text: "An enchanted iron tool or weapon.",
    expect: "item:any",
    run: ({ player }) => {
      const [item, pool] = pick([
        ["iron_pickaxe", ENCHANTS.pickaxe],
        ["iron_axe", ENCHANTS.axe],
        ["iron_shovel", ENCHANTS.shovel],
        ["iron_sword", ENCHANTS.sword],
        ["bow", ENCHANTS.bow],
      ]);
      const { stack } = randomEnchanted(S + item, pool, between(1, 2), 3);
      giveStack(player, stack);
      sound(player, "random.anvil_use", 1.2, 0.6);
    },
  },
  {
    id: "the_sage",
    name: "The Sage",
    rarity: "uncommon",
    kind: "good",
    text: "8 experience levels.",
    expect: "xp",
    run: ({ player }) => {
      player.addLevels(8);
      sound(player, "random.levelup");
    },
  },
  {
    id: "the_mentor",
    name: "The Mentor",
    rarity: "uncommon",
    kind: "good",
    text: "400 XP in a random skill (with the Skills pack).",
    expect: "none",
    run: ({ player }) => `${skillXp(player, 400)} skill XP, if the Skills pack is installed.`,
  },
  {
    id: "silver_purse",
    name: "Silver Purse",
    rarity: "uncommon",
    kind: "good",
    text: "50 Crowns.",
    expect: "crowns",
    run: ({ player }) => {
      addCrowns(player, 50);
      sound(player, "random.orb", 0.8);
      return `You have ${crownsOf(player)} Crowns.`;
    },
  },
  gift("the_gem", "The Gem", "uncommon", "good", "3 diamonds.", [["diamond", 3]]),
  {
    id: "the_pack",
    name: "The Pack",
    rarity: "uncommon",
    kind: "good",
    text: "Two wolves, already loyal to you.",
    expect: "spawn:wolf",
    run: ({ player }) => {
      const wolves = spawnAround(player, "minecraft:wolf", 2, 2, 4);
      if (!wolves.length) return false;
      for (const w of wolves) attempt(() => w.getComponent("minecraft:tameable")?.tame(player));
    },
  },
  {
    id: "the_steed",
    name: "The Steed",
    rarity: "uncommon",
    kind: "good",
    text: "A tamed horse, and a saddle for it.",
    expect: "spawn:horse",
    run: ({ player }) => {
      const [horse] = spawnAround(player, "minecraft:horse", 1, 3, 5);
      if (!horse) return false;
      attempt(() => horse.getComponent("minecraft:tamemount")?.tameToPlayer(true, player));
      give(player, "minecraft:saddle", 1);
    },
  },
  {
    id: "ambush",
    name: "Ambush",
    rarity: "uncommon",
    kind: "bad",
    text: "Monsters surround you! More of them when friends are near.",
    expect: "spawn:zombie",
    run: ({ player }) => {
      const friends = player.dimension.getPlayers({ location: player.location, maxDistance: 16 }).length - 1;
      const n = 4 + Math.min(4, friends);
      spawnAround(player, "minecraft:zombie", n, 6, 9);
      spawnAround(player, "minecraft:skeleton", 2, 7, 10);
      spawnAround(player, "minecraft:spider", 1, 6, 9);
      sound(player, "mob.zombie.say", 0.8);
    },
  },
  mobs("the_witch", "The Witch", "uncommon", "bad", "A witch arrives, cackling.", "witch", 1, 6, 9),
  {
    id: "night_terror",
    name: "Night Terror",
    rarity: "uncommon",
    kind: "bad",
    text: "Three phantoms swoop down from the sky.",
    expect: "spawn:phantom",
    run: ({ player }) => {
      const at = player.location;
      let n = 0;
      for (let i = 0; i < 3; i++) {
        const loc = { x: at.x + between(-6, 6), y: at.y + 12, z: at.z + between(-6, 6) };
        const b = blockAt(player.dimension, loc);
        if (!b || !b.isAir) continue;
        attempt(() => {
          player.dimension.spawnEntity("minecraft:phantom", loc);
          n++;
        });
      }
      if (!n) return false;
      sound(player, "mob.phantom.swoop");
    },
  },
  {
    id: "the_beacon",
    name: "The Beacon",
    rarity: "uncommon",
    kind: "good",
    text: "Haste II, Speed, Strength and Resistance for 20 minutes.",
    expect: "effect:haste",
    run: ({ player }) => {
      effect(player, "minecraft:haste", 1200, 1);
      effect(player, "minecraft:speed", 1200);
      effect(player, "minecraft:strength", 1200);
      effect(player, "minecraft:resistance", 1200);
      burst(player.dimension, "minecraft:villager_happy", player.location, 16);
      sound(player, "beacon.activate");
    },
  },
  {
    id: "the_curse",
    name: "The Curse",
    rarity: "uncommon",
    kind: "bad",
    text: "Slowness II, Weakness, Mining Fatigue and Hunger for 10 minutes.",
    expect: "effect:weakness",
    run: ({ player }) => {
      effect(player, "minecraft:slowness", 600, 1);
      effect(player, "minecraft:weakness", 600);
      effect(player, "minecraft:mining_fatigue", 600);
      effect(player, "minecraft:hunger", 600);
      burst(player.dimension, "minecraft:villager_angry", player.location, 12);
      sound(player, "mob.witch.ambient", 0.7);
    },
  },
  {
    id: "the_comet",
    name: "The Comet",
    rarity: "uncommon",
    kind: "mixed",
    text: "You streak across the sky and land 150 to 300 blocks away.",
    expect: "far",
    run: async ({ player }) => {
      const at = player.location;
      if (player.dimension.id === "minecraft:the_end") return false;
      const targets = [0, 1, 2, 3].map(() => {
        const a = Math.random() * Math.PI * 2;
        const d = between(150, 300);
        return { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
      });
      const spot = await farTeleport(player, player.dimension, targets);
      if (!spot) return false;
      return `You landed at ${Math.floor(spot.x)}, ${Math.floor(spot.y)}, ${Math.floor(spot.z)}.`;
    },
  },
  {
    id: "treasure",
    name: "Treasure",
    rarity: "uncommon",
    kind: "good",
    text: "A handful of riches: iron, gold, lapis, redstone, emeralds or a diamond.",
    expect: "item:any",
    run: ({ player }) => {
      const pool = /** @type {[string, number][]} */ ([
        ["iron_ingot", 8],
        ["gold_ingot", 6],
        ["lapis_lazuli", 12],
        ["redstone", 16],
        ["emerald", 4],
        ["diamond", 1],
      ]);
      for (const [item, n] of [...pool].sort(() => Math.random() - 0.5).slice(0, 3)) give(player, S + item, n);
      sound(player, "random.orb", 0.7);
    },
  },
  {
    id: "the_shepherd",
    name: "The Shepherd",
    rarity: "uncommon",
    kind: "good",
    text: "Three sheep and a pair of shears.",
    expect: "spawn:sheep",
    run: ({ player }) => {
      if (!spawnAround(player, "minecraft:sheep", 3, 3, 6).length) return false;
      give(player, "minecraft:shears", 1);
    },
  },
  mobs("the_guardian", "The Guardian", "uncommon", "good", "An iron golem comes to protect you.", "iron_golem", 1, 3, 5),
  mobs("the_patrol", "The Patrol", "uncommon", "bad", "A pillager patrol of four finds you.", "pillager", 4, 8, 12),

  buff("bad_omen", "Bad Omen", "uncommon", "bad", "Bad Omen for 100 minutes: walk into a village and a raid begins.", "bad_omen", 6000),
  buff("nightshade", "Nightshade", "uncommon", "bad", "Fatal Poison for 15 seconds. Unlike plain poison, this one can kill.", "fatal_poison", 15),
  buff("guardian_angel", "Guardian Angel", "uncommon", "good", "Resistance until you die (or drink milk).", "resistance", UNTIL_DEATH),
  buff("sea_blessing", "Sea Blessing", "uncommon", "good", "Conduit Power for 30 minutes: breathe, see and mine fast under water.", "conduit_power", 1800),
  mobs("vexed", "Vexed", "uncommon", "bad", "Three vexes fly through the walls at you.", "vex", 3, 4, 6),
  mobs("gust", "Gust", "uncommon", "bad", "A breeze blows in and knocks you around.", "breeze", 1, 6, 9),
  mobs("the_shulker", "The Shulker", "uncommon", "mixed", "A shulker shows up. Dodge its bullets, keep its shell.", "shulker", 1, 5, 8),
  {
    id: "hot_headed",
    name: "Hot Headed",
    rarity: "uncommon",
    kind: "bad",
    text: "Two blazes rise around you. Bring water.",
    expect: "spawn:blaze",
    blocks: true,
    run: ({ player }) => {
      if (zoned(player, 16)) return false;
      if (!spawnAround(player, "minecraft:blaze", 2, 6, 10).length) return false;
      sound(player, "mob.blaze.breathe");
    },
  },
  {
    id: "anvil_drop",
    name: "Anvil Drop",
    rarity: "uncommon",
    kind: "bad",
    text: "An anvil falls from the sky onto your head. Move! It crumbles away a few seconds after it lands.",
    expect: "hurt",
    blocks: true,
    prep: (p) => {
      toOpenSky(p, 9);
      toughen(p);
    },
    run: ({ player, test }) => {
      const dim = player.dimension;
      const x = Math.floor(player.location.x);
      const y = Math.floor(player.location.y);
      const z = Math.floor(player.location.z);
      if (zoned(player, 2)) return false;
      // It drops from up to 8 blocks above the head; a roof lower than 5 blocks up keeps it out.
      let top = 1;
      while (top < 8 && blockAt(dim, { x, y: y + top + 1, z })?.isAir) top++;
      if (top < 5) return false;
      // Where it will land: just above the first non-air block under the drop point.
      let floor = y + top - 1;
      while (floor > y - 6 && blockAt(dim, { x, y: floor, z })?.isAir) floor--;
      // It must land on something solid nearby, where it can be found again: not in water or lava
      // (it would sink out of reach), and not under a player flying or falling high up.
      const ground = blockAt(dim, { x, y: floor, z });
      if (!ground || ground.isAir || ground.isLiquid || /water|lava|bubble_column/.test(ground.typeId)) return false;
      const under = ground.typeId;
      bar(player, "§c§lLook up!", 40);
      sound(player, "random.anvil_land", 0.6);
      system.runTimeout(() => {
        const b = blockAt(dim, { x, y: y + top, z });
        if (!b || !b.isAir) return;
        attempt(() => b.setType("minecraft:anvil"));
        removeAnvil(dim.id, x, floor, z, under, test ? 3 : 8);
      }, test ? 1 : 25);
    },
  },
  {
    id: "reapers_touch",
    name: "Reaper's Touch",
    rarity: "uncommon",
    kind: "bad",
    text: "Your health drops to half a heart. Careful now.",
    expect: "hurt",
    run: ({ player }) => {
      const hp = player.getComponent("minecraft:health");
      if (!hp) return false;
      hp.setCurrentValue(1);
      sound(player, "mob.wither.ambient", 1.2, 0.5);
      burst(player.dimension, "minecraft:soul_particle", player.location, 10);
    },
  },
  {
    id: "lit_fuse",
    name: "Lit Fuse",
    rarity: "uncommon",
    kind: "bad",
    text: "A fuse hisses at your feet. Run! It blows in 4 seconds (it breaks no blocks).",
    expect: "hurt",
    prep: toughen,
    run: ({ player, test }) => {
      // An explosion knocks down armor stands and paintings even when it breaks no blocks: not in a safe zone.
      if (zoned(player, 8)) return false;
      const dim = player.dimension;
      const at = { ...player.location };
      everySecond(
        player,
        test ? 1 : 4,
        (left) => {
          sound(player, "random.fuse", 1, 1);
          burst(dim, "minecraft:basic_smoke_particle", at, 8, 0.4);
          bar(player, `§c§lRUN! §r§c${left}...`, 25);
        },
        () => void dim.createExplosion(at, 3, { breaksBlocks: false, causesFire: false }),
      );
    },
  },
  {
    id: "the_storm",
    name: "The Storm",
    rarity: "uncommon",
    kind: "bad",
    text: "A thunderstorm rolls in for 10 minutes, for everyone.",
    expect: "none",
    run: ({ player, announce }) => {
      world.getDimension("minecraft:overworld").setWeather(WeatherType.Thunder, 12000);
      sound(player, "ambient.weather.thunder", 1, 0.6);
      announce(`${player.name} drew The Storm! Thunder rolls across the realm.`);
    },
  },
  {
    id: "the_sun",
    name: "The Sun",
    rarity: "uncommon",
    kind: "good",
    text: "Morning comes at once, with clear skies, for everyone.",
    expect: "day",
    run: ({ player, announce }) => {
      world.setTimeOfDay(1000);
      world.getDimension("minecraft:overworld").setWeather(WeatherType.Clear, 12000);
      sound(player, "random.levelup", 1.4, 0.6);
      announce(`${player.name} drew The Sun! Morning breaks across the realm.`);
    },
  },
  {
    id: "the_mender",
    name: "The Mender",
    rarity: "uncommon",
    kind: "good",
    text: "Every worn tool, weapon and piece of armor you carry is repaired like new.",
    expect: "mended",
    prep: (p) => testSword(p, 120),
    run: ({ player }) => {
      let n = 0;
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (inv)
        for (let i = 0; i < inv.size; i++) {
          const it = inv.getItem(i);
          const d = it?.getComponent("minecraft:durability");
          if (!it || !d || d.damage <= 0) continue;
          d.damage = 0;
          inv.setItem(i, it);
          n++;
        }
      const eq = player.getComponent("minecraft:equippable");
      if (eq)
        for (const slot of [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand]) {
          const it = eq.getEquipment(slot);
          const d = it?.getComponent("minecraft:durability");
          if (!it || !d || d.damage <= 0) continue;
          d.damage = 0;
          eq.setEquipment(slot, it);
          n++;
        }
      if (!n) return false;
      sound(player, "random.anvil_use", 1.2, 0.7);
      return `${n} item${n === 1 ? "" : "s"} repaired.`;
    },
  },
  {
    id: "rust",
    name: "Rust",
    rarity: "uncommon",
    kind: "bad",
    text: "The item in your hand loses a third of its durability (it never breaks outright).",
    expect: "worn",
    prep: (p) => testSword(p),
    run: ({ player }) => {
      const { inv, slot, item } = held(player);
      const d = item?.getComponent("minecraft:durability");
      if (!inv || !item || !d) return false;
      if (d.damage >= d.maxDurability - 1) return false;
      d.damage = Math.min(d.maxDurability - 1, d.damage + Math.ceil(d.maxDurability / 3));
      inv.setItem(slot, item);
      sound(player, "random.break", 0.7, 0.6);
    },
  },
  {
    id: "glass_cannon",
    name: "Glass Cannon",
    rarity: "uncommon",
    kind: "mixed",
    text: "Strength II and Speed II for 15 minutes, but your health drops to two hearts.",
    expect: "effect:strength",
    run: ({ player }) => {
      effect(player, "minecraft:strength", 900, 1);
      effect(player, "minecraft:speed", 900, 1);
      player.getComponent("minecraft:health")?.setCurrentValue(4);
      sound(player, "random.glass", 1.2);
    },
  },

  // ---------------------------------------------------------------------------
  // Rare
  // ---------------------------------------------------------------------------
  {
    id: "the_gate",
    name: "The Gate",
    rarity: "rare",
    kind: "mixed",
    text: "You are pulled into the Nether (or out of it), with obsidian and flint and steel to build a portal home.",
    expect: "dim",
    run: async ({ player, announce }) => {
      const from = player.dimension.id;
      if (from === "minecraft:the_end") return false;
      const to = world.getDimension(from === "minecraft:nether" ? "minecraft:overworld" : "minecraft:nether");
      const at = player.location;
      const scale = from === "minecraft:nether" ? 8 : 1 / 8;
      effect(player, "minecraft:fire_resistance", 300);
      const targets = [0, 1, 2, 3].map((i) => ({ x: at.x * scale + between(-16 - i * 24, 16 + i * 24), z: at.z * scale + between(-16 - i * 24, 16 + i * 24) }));
      const spot = await farTeleport(player, to, targets);
      if (!spot) return false;
      give(player, "minecraft:obsidian", 10);
      give(player, "minecraft:flint_and_steel", 1);
      announce(`${player.name} drew The Gate and fell into the ${to.id === "minecraft:nether" ? "Nether" : "Overworld"}!`);
      return "Build a 4 by 5 obsidian frame and light it to go home. Fire Resistance helps for 5 minutes.";
    },
  },
  {
    id: "the_arena",
    name: "The Arena",
    rarity: "rare",
    kind: "mixed",
    text: "You are pulled into a sky arena. Win for an enchanted book and 15 Crowns.",
    expect: "move",
    blocks: true,
    run: async ({ player, test, announce }) => {
      const r = await arena(player, { test });
      if (r) announce(`${player.name} drew The Arena and fights in the sky!`);
      return r;
    },
  },
  {
    id: "the_champion",
    name: "The Champion",
    rarity: "rare",
    kind: "bad",
    text: "A champion monster comes for you.",
    expect: "spawn:any",
    run: async ({ player, announce }) => {
      const dim = player.dimension;
      // Where the player can see it: a champion in a cave below or behind a wall looks like nothing came.
      const spot = sightSpot(player, 6, 10) ?? randomSpot(player, 6, 10, 40, 8);
      if (!spot) return false;
      const tag = `realm:domt_champ_${Date.now().toString(36)}`;
      // Mobs that always come for a player, day or night (a spider is calm by day, a creeper just blows up).
      send("realm:champion_spawn", { dim: dim.id, x: spot.x, y: spot.y, z: spot.z, mob: pick(CHAMP_MOBS), name: "the Deck's Champion", tag });
      /** @type {import("@minecraft/server").Entity | undefined} */
      let champ;
      for (let i = 0; i < 6 && !champ; i++) {
        await wait(5);
        champ = dim.getEntities({ tags: [tag] }).find((e) => e.isValid);
      }
      // No Champions pack (or it didn't answer): the deck sends its own. On Peaceful this throws, and the card fizzles.
      if (!champ) champ = deckChampion(dim, spot);
      burst(dim, "minecraft:knockback_roar_particle", spot, 6);
      sound(player, "mob.evocation_illager.prepare_summon");
      announce(`${player.name} drew The Champion! A champion hunts them.`);
      watchChampion(player, champ, tag);
      return `It is a ${prettyId(champ.typeId).toLowerCase()}, ${Math.round(Math.hypot(spot.x - player.location.x, spot.z - player.location.z))} blocks to the ${compass(player.location, spot)}.`;
    },
  },
  {
    id: "the_spore",
    name: "The Spore",
    rarity: "rare",
    kind: "mixed",
    text: "The wild ground around you turns to mushroom fields for an hour, with two mooshrooms.",
    expect: "blocks",
    blocks: true,
    run: ({ player, test, sporeMinutes, announce }) => {
      const r = spore(player, { test, minutes: sporeMinutes });
      if (r) announce(`${player.name} drew The Spore! Mushrooms sprout around them.`);
      return r;
    },
  },
  {
    id: "the_eclipse",
    name: "The Eclipse",
    rarity: "rare",
    kind: "mixed",
    text: "Night falls at once, for everyone.",
    expect: "time",
    run: ({ player, announce }) => {
      world.setTimeOfDay(18000);
      for (const q of world.getAllPlayers()) sound(q, "ambient.cave", 0.6);
      announce(`${player.name} drew The Eclipse! Night falls across the realm.`);
    },
  },
  {
    id: "the_archmage",
    name: "The Archmage",
    rarity: "rare",
    kind: "good",
    text: "20 experience levels and 1000 XP in a random skill.",
    expect: "xp",
    run: ({ player, announce }) => {
      player.addLevels(20);
      const skill = skillXp(player, 1000);
      burst(player.dimension, "minecraft:enchanting_table_particle", player.location, 40, 1.5);
      sound(player, "random.levelup", 0.7);
      announce(`${player.name} drew The Archmage!`);
      return `And ${skill} skill XP, if the Skills pack is installed.`;
    },
  },
  {
    id: "the_knight",
    name: "The Knight",
    rarity: "rare",
    kind: "good",
    text: "Full iron armor, enchanted.",
    expect: "item:iron_chestplate",
    run: ({ player, announce }) => {
      for (const piece of ["helmet", "chestplate", "leggings", "boots"]) {
        const pool = piece === "boots" ? ENCHANTS.boots : piece === "helmet" ? ENCHANTS.helmet : ENCHANTS.armor;
        giveStack(player, randomEnchanted(`minecraft:iron_${piece}`, pool, 2, 3).stack);
      }
      sound(player, "armor.equip_iron");
      announce(`${player.name} drew The Knight!`);
    },
  },
  {
    id: "second_chance",
    name: "Second Chance",
    rarity: "rare",
    kind: "good",
    text: "A Totem of Undying and an enchanted golden apple.",
    expect: "item:totem_of_undying",
    run: ({ player, announce }) => {
      give(player, "minecraft:totem_of_undying", 1);
      give(player, "minecraft:enchanted_golden_apple", 1);
      burst(player.dimension, "minecraft:totem_particle", player.location, 20);
      announce(`${player.name} drew Second Chance!`);
    },
  },
  {
    id: "the_gamble",
    name: "The Gamble",
    rarity: "rare",
    kind: "mixed",
    text: "A coin flip: double your Crowns (up to 100 more), or lose half (up to 100).",
    expect: "crowns?",
    prep: (p) => void addCrowns(p, 20),
    run: ({ player, announce }) => {
      const have = crownsOf(player);
      if (Math.random() < 0.5) {
        const won = Math.min(100, Math.max(10, have));
        addCrowns(player, won);
        sound(player, "random.levelup");
        announce(`${player.name} won The Gamble: +${won} Crowns!`);
        return `Heads! +${won} Crowns. You have ${crownsOf(player)}.`;
      }
      const lost = -addCrowns(player, -Math.min(100, Math.ceil(have / 2)));
      sound(player, "mob.villager.no");
      announce(`${player.name} lost The Gamble.`);
      return lost ? `Tails. -${lost} Crowns. You have ${crownsOf(player)}.` : "Tails, but you had nothing to lose.";
    },
  },

  {
    id: "the_horde",
    name: "The Horde",
    rarity: "rare",
    kind: "bad",
    text: "A horde closes in: zombies, husks, skeletons, spiders and a vindicator.",
    expect: "spawn:zombie",
    run: ({ player, announce }) => {
      const n =
        spawnAround(player, "minecraft:zombie", 5, 8, 14).length +
        spawnAround(player, "minecraft:husk", 2, 8, 14).length +
        spawnAround(player, "minecraft:skeleton", 3, 9, 14).length +
        spawnAround(player, "minecraft:spider", 2, 8, 14).length +
        spawnAround(player, "minecraft:vindicator", 1, 10, 14).length;
      if (!n) return false;
      sound(player, "mob.zombie.say", 0.6);
      announce(`${player.name} drew The Horde! ${n} monsters close in on them.`);
    },
  },
  {
    id: "doom",
    name: "Doom",
    rarity: "rare",
    kind: "bad",
    text: "Lightning will strike wherever you stand, three times in the next minute.",
    expect: "fire",
    prep: toughen,
    run: ({ player, test, announce }) => {
      // A strike every `gap` seconds: two during the countdown and one at the end.
      const gap = test ? 1 : 20;
      const zap = () => {
        strike(player.dimension, player.location, player);
        sound(player, "ambient.weather.thunder", 1, 0.6);
      };
      everySecond(
        player,
        gap * 3,
        (left) => {
          const hit = left % gap === 0 && left < gap * 3;
          if (hit) zap();
          const more = Math.ceil((left - (hit ? 0.5 : 0)) / gap);
          bar(player, `§4Doom: §c${more} more strike${more === 1 ? "" : "s"} §7(${left}s)`, 25);
        },
        zap,
      );
      announce(`${player.name} drew Doom! Stand clear of them.`);
    },
  },
  mobs("the_evoker", "The Evoker", "rare", "mixed", "An evoker appears. Beat it for its Totem of Undying.", "evocation_illager", 1, 10, 14),
  {
    id: "the_reaper",
    name: "The Reaper",
    rarity: "rare",
    kind: "bad",
    text: "Your health drops to half a heart and three wither skeletons come for the rest.",
    expect: "spawn:wither_skeleton",
    run: ({ player, announce }) => {
      if (!spawnAround(player, "minecraft:wither_skeleton", 3, 8, 12).length) return false;
      player.getComponent("minecraft:health")?.setCurrentValue(1);
      sound(player, "mob.wither.spawn", 1, 0.5);
      burst(player.dimension, "minecraft:soul_particle", player.location, 20, 1.5);
      announce(`${player.name} drew The Reaper!`);
    },
  },
  {
    id: "the_titan",
    name: "The Titan",
    rarity: "rare",
    kind: "good",
    text: "Full health, then Strength II, Resistance II and Health Boost III for 20 minutes.",
    expect: "effect:health_boost",
    run: ({ player, announce }) => {
      effect(player, "minecraft:health_boost", 1200, 2);
      effect(player, "minecraft:strength", 1200, 1);
      effect(player, "minecraft:resistance", 1200, 1);
      system.runTimeout(() => attempt(() => player.getComponent("minecraft:health")?.resetToMaxValue()), 2);
      sound(player, "mob.irongolem.repair");
      burst(player.dimension, "minecraft:villager_happy", player.location, 20);
      announce(`${player.name} drew The Titan!`);
    },
  },
  {
    id: "mother_lode",
    name: "Mother Lode",
    rarity: "rare",
    kind: "good",
    text: "6 diamonds, 16 iron, 12 gold and 2 netherite scrap.",
    expect: "item:diamond",
    run: ({ player, announce }) => {
      give(player, "minecraft:diamond", 6);
      give(player, "minecraft:iron_ingot", 16);
      give(player, "minecraft:gold_ingot", 12);
      give(player, "minecraft:netherite_scrap", 2);
      sound(player, "random.levelup", 0.8);
      announce(`${player.name} drew the Mother Lode!`);
    },
  },

  // ---------------------------------------------------------------------------
  // Legendary
  // ---------------------------------------------------------------------------
  {
    id: "the_wish",
    name: "The Wish",
    rarity: "legendary",
    kind: "good",
    text: "The deck grants one wish: choose one of three powerful boons.",
    expect: "reward",
    run: async ({ player, test, announce }) => {
      announce(`§d§l${player.name} drew THE WISH!`);
      for (let i = 0; i < 6; i++) {
        const at = player.location;
        attempt(() => player.dimension.spawnEntity("minecraft:fireworks_rocket", { x: at.x + between(-4, 4), y: at.y + 1, z: at.z + between(-4, 4) }));
      }
      return await wish(player, { test });
    },
  },
  {
    id: "the_fates",
    name: "The Fates",
    rarity: "legendary",
    kind: "mixed",
    text: "The Fates flip a coin: an hour of godlike power, or half a heart and a horde.",
    expect: "none",
    run: ({ player, announce }) => {
      if (Math.random() < 0.5) {
        for (const [id, amp] of /** @type {[string, number][]} */ ([["health_boost", 4], ["strength", 1], ["resistance", 1], ["regeneration", 0], ["speed", 0], ["fire_resistance", 0]])) effect(player, S + id, 3600, amp);
        system.runTimeout(() => attempt(() => player.getComponent("minecraft:health")?.resetToMaxValue()), 2);
        burst(player.dimension, "minecraft:totem_particle", player.location, 40, 1.5);
        sound(player, "random.totem");
        announce(`§d${player.name} drew The Fates, and the Fates smiled!`);
        return "The Fates smile: Health Boost V, Strength II, Resistance II, Regeneration, Speed and Fire Resistance for an hour.";
      }
      player.getComponent("minecraft:health")?.setCurrentValue(1);
      spawnAround(player, "minecraft:zombie", 4, 8, 14);
      spawnAround(player, "minecraft:skeleton", 3, 9, 14);
      spawnAround(player, "minecraft:vindicator", 2, 10, 14);
      sound(player, "mob.wither.spawn", 1, 0.6);
      announce(`§d${player.name} drew The Fates, and the Fates frowned...`);
      return "The Fates frown: half a heart, and a horde on its way.";
    },
  },

  // ---------------------------------------------------------------------------
  // Wild cards: off until an operator switches them on (Cards on/off)
  // ---------------------------------------------------------------------------
  {
    id: "the_swap",
    name: "The Swap",
    rarity: "uncommon",
    kind: "mixed",
    wild: true,
    text: "You swap places with a random player in your dimension, wherever they are.",
    expect: "move",
    run: ({ player }) => {
      // Never into or out of a Deck arena or an Expedition dungeon, and only within the same dimension.
      if (busyElsewhere(player)) return false;
      const others = world.getAllPlayers().filter((q) => q.id !== player.id && q.isValid && q.dimension.id === player.dimension.id && !busyElsewhere(q));
      if (!others.length) return false;
      const other = pick(others);
      const mine = { dim: player.dimension, at: { ...player.location } };
      const theirs = { dim: other.dimension, at: { ...other.location } };
      player.teleport(theirs.at, { dimension: theirs.dim, keepVelocity: false });
      other.teleport(mine.at, { dimension: mine.dim, keepVelocity: false });
      sound(player, "mob.endermen.portal");
      sound(other, "mob.endermen.portal");
      other.sendMessage(`§6[Deck] §7${player.name} drew The Swap: you traded places with them!`);
      return `You traded places with ${other.name}.`;
    },
  },
  {
    id: "chaos_pockets",
    name: "Chaos Pockets",
    rarity: "common",
    kind: "bad",
    wild: true,
    text: "Your whole inventory is shuffled, hotbar and all.",
    expect: "hotbar",
    prep: (p) => fillHotbar(p),
    run: ({ player }) => {
      const inv = player.getComponent("minecraft:inventory")?.container;
      if (!inv) return false;
      // An item locked in its slot stays where it is; the rest are shuffled.
      /** @type {number[]} */
      const slots = [];
      for (let i = 0; i < inv.size; i++) if (inv.getItem(i)?.lockMode !== ItemLockMode.slot) slots.push(i);
      const items = slots.map((i) => inv.getItem(i));
      if (items.filter((x) => x).length < 2) return false;
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      // Make sure the hotbar changed at all.
      const hot = slots.filter((s) => s < 9).length;
      if (items.slice(0, hot).every((it, k) => (it?.typeId ?? "") === (inv.getItem(slots[k])?.typeId ?? ""))) items.push(...items.splice(0, hot));
      items.forEach((it, k) => inv.setItem(slots[k], it));
      sound(player, "random.pop", 0.6);
    },
  },
  {
    id: "into_orbit",
    name: "Into Orbit",
    rarity: "uncommon",
    kind: "bad",
    wild: true,
    text: "You are launched sky high. Here, have a water bucket. Good luck.",
    expect: "effect:levitation",
    run: ({ player, test }) => {
      give(player, "minecraft:water_bucket", 1);
      effect(player, "minecraft:levitation", test ? 1 : 3, 12);
      sound(player, "firework.launch", 0.6);
      burst(player.dimension, "minecraft:basic_flame_particle", player.location, 16, 0.6);
    },
  },
  {
    id: "gravity_flip",
    name: "Gravity Flip",
    rarity: "common",
    kind: "bad",
    wild: true,
    text: "For 30 seconds, gravity flips every few seconds. Up you go, and down you come.",
    expect: "effect:levitation",
    run: ({ player, test }) => {
      const pulse = () => {
        effect(player, "minecraft:levitation", 1.5, 3);
        sound(player, "mob.shulker.bullet.hit", 0.8);
      };
      pulse();
      everySecond(player, test ? 3 : 30, (left) => {
        if (left % 5 === 0 && left < 30) pulse();
        bar(player, `§dGravity flips: §f${left}s`, 25);
      });
    },
  },
  {
    id: "chicken_rain",
    name: "Chicken Rain",
    rarity: "common",
    kind: "mixed",
    wild: true,
    text: "It's raining chickens! They fly off home after 3 minutes.",
    expect: "spawn:chicken",
    run: ({ player, test }) => {
      const birds = spawnAbove(player, "minecraft:chicken", 16, 18, 8);
      if (!birds.length) return false;
      for (const b of birds) tempMob(b, test ? 10 : 180);
      sound(player, "mob.chicken.say", 1.2);
    },
  },
  {
    id: "floor_is_lava",
    name: "The Floor Is Lava",
    rarity: "common",
    kind: "bad",
    wild: true,
    text: "For 30 seconds, the floor is lava: touch the ground and you burn. Jump! Swim!",
    expect: "fire",
    run: ({ player, test }) => {
      let tick = 0;
      const start = system.currentTick;
      const id = system.runInterval(() => {
        try {
          if (!player.isValid || diedSince(player, start) || ++tick > (test ? 60 : 600) / 5) return system.clearRun(id);
          if (player.isOnGround && !player.isInWater) player.setOnFire(2, true);
        } catch {
          system.clearRun(id);
        }
      }, 5);
      everySecond(player, test ? 3 : 30, (left) => void bar(player, `§c§lThe floor is lava! §r§f${left}s`, 25), () => bar(player, "§aThe floor is just floor again.", 40));
    },
  },
  {
    id: "the_hex",
    name: "The Hex",
    rarity: "uncommon",
    kind: "bad",
    wild: true,
    text: "The item in your hand gets a silly name and Curse of Vanishing: die with it and it's gone.",
    expect: "heldname",
    prep: (p) => testSword(p),
    run: ({ player }) => {
      const { inv, slot, item } = held(player);
      if (!inv || !item || item.maxAmount > 1 || item.lockMode !== ItemLockMode.none) return false;
      const cursed = enchant(item, [["minecraft:vanishing", 1]]);
      if (!cursed) return false;
      const name = pick(["Wet Noodle", "Mister Pokey", "The Disappointment", "Soggy Biscuit", "Tickle Stick", "Old Faithless"]);
      item.nameTag = `§d${name}`;
      inv.setItem(slot, item);
      sound(player, "mob.witch.ambient", 1.2);
      burst(player.dimension, "minecraft:villager_angry", player.location, 6);
      return `It is now called ${name}.`;
    },
  },
  {
    id: "cursed_name",
    name: "Cursed Name",
    rarity: "common",
    kind: "bad",
    wild: true,
    text: "For 20 minutes, the name above your head is something silly.",
    expect: "name",
    run: ({ player, test }) => rainbowName(player, { test, title: pick(SILLY_NAMES) }),
  },
  {
    id: "zoomies",
    name: "Zoomies",
    rarity: "common",
    kind: "mixed",
    wild: true,
    text: "Speed V and Jump Boost III for 3 minutes. Good luck stopping.",
    expect: "effect:speed",
    run: ({ player }) => {
      effect(player, "minecraft:speed", 180, 4);
      effect(player, "minecraft:jump_boost", 180, 2);
      sound(player, "mob.wolf.bark", 1.4);
    },
  },
  {
    id: "topsy_turvy",
    name: "Topsy Turvy",
    rarity: "common",
    kind: "bad",
    wild: true,
    text: "For 20 seconds you keep spinning to face a new way.",
    expect: "rotate",
    run: ({ player, test }) => {
      const spin = () => {
        const r = player.getRotation();
        player.setRotation({ x: between(-30, 30), y: ((r.y + between(90, 270) + 180) % 360) - 180 });
        sound(player, "random.pop", 0.6);
      };
      spin();
      everySecond(player, test ? 2 : 20, (left) => void (left % 2 === 0 && left < 20 && spin()));
    },
  },
  {
    id: "zero_g",
    name: "Zero G",
    rarity: "uncommon",
    kind: "mixed",
    wild: true,
    text: "Every creature within 16 blocks floats up for a few seconds, then drops. Pets and named mobs are spared.",
    expect: "none",
    prep: (p) => void spawnAround(p, "minecraft:pig", 1, 3, 6),
    run: ({ player }) => {
      const mobsNear = player.dimension
        .getEntities({ location: player.location, maxDistance: 16, families: ["mob"], excludeTypes: ["minecraft:player"] })
        .filter((e) => !e.nameTag && !e.hasComponent("minecraft:is_tamed") && !e.getComponent("minecraft:tameable")?.isTamed && !e.getTags().some((t) => t.startsWith("realm") || t.startsWith("npc") || t.startsWith("domt")));
      if (!mobsNear.length) return false;
      for (const e of mobsNear) attempt(() => effect(e, "minecraft:levitation", 4, 2));
      sound(player, "mob.shulker.bullet.hit", 0.7);
      return `${mobsNear.length} creature${mobsNear.length === 1 ? "" : "s"} float up.`;
    },
  },
  {
    id: "creeper_party",
    name: "Creeper Party",
    rarity: "uncommon",
    kind: "bad",
    wild: true,
    blocks: true,
    text: "Four creepers come to the party. They break blocks (never in a safe zone).",
    expect: "spawn:creeper",
    run: ({ player }) => {
      if (zoned(player, 12)) return false;
      if (!spawnAround(player, "minecraft:creeper", 4, 5, 9).length) return false;
      sound(player, "random.fuse", 0.8);
    },
  },
  {
    id: "the_ghast",
    name: "The Ghast",
    rarity: "rare",
    kind: "bad",
    wild: true,
    blocks: true,
    text: "A ghast drifts in from nowhere. Its fireballs break blocks (never in a safe zone).",
    expect: "spawn:ghast",
    run: ({ player }) => {
      if (zoned(player, 32)) return false;
      const g = spawnAbove(player, "minecraft:ghast", 1, 10, 16);
      if (!g.length) return false;
      sound(player, "mob.ghast.scream");
    },
  },
  {
    id: "the_warden",
    name: "The Warden",
    rarity: "rare",
    kind: "bad",
    wild: true,
    text: "A warden rises out of the ground 10 to 14 blocks away. Be very quiet.",
    expect: "spawn:warden",
    run: ({ player, announce }) => {
      if (!spawnAround(player, "minecraft:warden", 1, 10, 14).length) return false;
      sound(player, "mob.warden.emerge");
      announce(`${player.name} drew The Warden! Run.`);
    },
  },
  {
    id: "hot_potato",
    name: "Hot Potato",
    rarity: "uncommon",
    kind: "bad",
    wild: true,
    text: "You get a Hot Potato. In 30 seconds it explodes on whoever has it. Pass it on!",
    expect: "item:potato",
    prep: toughen,
    run: ({ player, test }) => {
      const mark = `§8Deck of Many Things ${Date.now().toString(36)}`;
      const power = test ? 0.5 : 1.3;
      /** The bang: an explosion that breaks no blocks, or in a safe zone (armor stands, paintings) just a pop. @param {import("@minecraft/server").Dimension} dim @param {import("@minecraft/server").Vector3} at */
      const bang = (dim, at) => {
        if (inZone(dim.id, at.x, at.z, 6)) {
          burst(dim, "minecraft:basic_smoke_particle", at, 12, 0.6);
          attempt(() => dim.playSound("random.explode", at, { volume: 0.8, pitch: 1.4 }));
        } else dim.createExplosion(at, power, { breaksBlocks: false, causesFire: false });
      };
      give(player, "minecraft:potato", 1, { name: "§c§lHot Potato", lore: ["§7Explodes in 30 seconds.", "§7Drop it near a friend!", "§7Goes off anywhere in your inventory", mark] });
      sound(player, "random.fuse");
      const isIt = (/** @type {ItemStack | undefined} */ it) => !!it && it.typeId === "minecraft:potato" && it.getLore().includes(mark);
      // Its own clock, not the drawer's: the potato goes off on time even if they passed it on and left.
      let left = test ? 2 : 30;
      const showLeft = () => {
        for (const q of world.getAllPlayers()) {
          const inv = q.getComponent("minecraft:inventory")?.container;
          if (!inv) continue;
          for (let i = 0; i < inv.size; i++)
            if (isIt(inv.getItem(i))) {
              bar(q, `§c§lHot Potato! §r§f${left}s`, 25);
              break;
            }
        }
      };
      attempt(showLeft);
      const clock = system.runInterval(() => {
        try {
          left--;
          if (left > 0) return showLeft();
          system.clearRun(clock);
          goOff();
        } catch (e) {
          system.clearRun(clock);
          console.warn(`[domt] hot potato: ${e}`);
        }
      }, 20);
      const goOff = () => {
        // Whoever holds it (or wherever it lies) gets the bang. It breaks no blocks.
        for (const q of world.getAllPlayers()) {
          const inv = q.getComponent("minecraft:inventory")?.container;
          if (!inv) continue;
          for (let i = 0; i < inv.size; i++)
            if (isIt(inv.getItem(i))) {
              inv.setItem(i, undefined);
              bang(q.dimension, q.location);
              world.sendMessage(`§6[Deck] §c${q.name} was holding the Hot Potato!`);
              return;
            }
        }
        for (const dim of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"].map((d) => world.getDimension(d)))
          for (const e of dim.getEntities({ type: "minecraft:item" })) {
            if (!isIt(e.getComponent("minecraft:item")?.itemStack)) continue;
            const at = e.location;
            e.remove();
            bang(dim, at);
            return;
          }
      };
    },
  },
];

/** @type {Record<Rarity, string>} */
export const RARITY_COLOR = { common: "§f", uncommon: "§a", rare: "§b", legendary: "§d" };
/** @type {Record<Rarity, string>} */
export const RARITY_NAME = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" };
/** @type {Rarity[]} */
export const RARITIES = ["common", "uncommon", "rare", "legendary"];
