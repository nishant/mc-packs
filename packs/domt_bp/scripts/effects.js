// The Deck of Many Things: 100 cards. 70 common, 20 uncommon, 9 rare, 1 legendary.
// Each card is data (id, name, rarity, kind, the line on the card) and a small handler. A handler
// returns false when it can't happen here (no safe spot, no mob near...), and the deck draws again;
// a string is shown under the card's text.
import { ItemStack, Player, system, world } from "@minecraft/server";
import { arena, rainbowName, spore, wish } from "./events.js";
import {
  addCrowns,
  attempt,
  between,
  blockAt,
  burst,
  crownsOf,
  effect,
  ENCHANTS,
  farTeleport,
  give,
  giveStack,
  pick,
  randomEnchanted,
  randomSpot,
  safeHop,
  sound,
  spawnAround,
  standable,
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
 * @property {string} expect what the test path checks afterwards: effect:<id>, item:<id>, spawn:<id>, move, far, dim, xp, levels-, crowns, crowns-, crowns?, reward, health, noeffects, hotbar, drop, name, time, rotate, blocks, none
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

/** @type {Card[]} */
export const CARDS = [
  // ---------------------------------------------------------------------------
  // Common (70)
  // ---------------------------------------------------------------------------
  buff("swift_feet", "Swift Feet", "common", "good", "Speed II for 3 minutes.", "speed", 180, 1),
  buff("the_frog", "The Frog", "common", "good", "Jump Boost II for 3 minutes.", "jump_boost", 180, 1),
  buff("owl_eyes", "Owl's Eyes", "common", "good", "Night Vision for 10 minutes.", "night_vision", 600),
  buff("iron_skin", "Iron Skin", "common", "good", "Resistance for 3 minutes.", "resistance", 180),
  buff("the_miner", "The Miner", "common", "good", "Haste II for 5 minutes.", "haste", 300, 1),
  buff("the_fish", "The Fish", "common", "good", "Water Breathing for 10 minutes.", "water_breathing", 600),
  buff("the_feather", "The Feather", "common", "good", "Slow Falling for 3 minutes.", "slow_falling", 180),
  buff("ember_ward", "Ember Ward", "common", "good", "Fire Resistance for 5 minutes.", "fire_resistance", 300),
  {
    id: "the_healer",
    name: "The Healer",
    rarity: "common",
    kind: "good",
    text: "Instant healing and Regeneration II for 30 seconds.",
    expect: "effect:regeneration",
    run: ({ player }) => {
      effect(player, "minecraft:instant_health", 1, 1);
      effect(player, "minecraft:regeneration", 30, 1);
      burst(player.dimension, "minecraft:heart_particle", player.location, 8);
    },
  },
  buff("the_ox", "The Ox", "common", "good", "Strength for 3 minutes.", "strength", 180),
  buff("golden_heart", "Golden Heart", "common", "good", "Absorption II for 3 minutes.", "absorption", 180, 1),
  buff("village_hero", "Village Hero", "common", "good", "Hero of the Village for 10 minutes: villagers give discounts.", "village_hero", 600),
  buff("full_belly", "Full Belly", "common", "good", "Your hunger is filled.", "saturation", 2, 9),
  buff("the_shadow", "The Shadow", "common", "mixed", "Invisibility for 3 minutes.", "invisibility", 180),
  buff("the_vigor", "The Vigor", "common", "good", "Health Boost II for 5 minutes: four extra hearts.", "health_boost", 300, 1),
  buff("heavy_boots", "Heavy Boots", "common", "bad", "Slowness for 1 minute.", "slowness", 60),
  buff("sore_arms", "Sore Arms", "common", "bad", "Mining Fatigue for 1 minute.", "mining_fatigue", 60),
  buff("weak_arms", "Weak Arms", "common", "bad", "Weakness for 1 minute.", "weakness", 60),
  buff("famine", "Famine", "common", "bad", "Hunger for 30 seconds.", "hunger", 30),
  buff("dizzy_spell", "Dizzy Spell", "common", "bad", "Nausea for 15 seconds.", "nausea", 15),
  buff("the_blindfold", "The Blindfold", "common", "bad", "Blindness for 10 seconds.", "blindness", 10),
  buff("the_dark", "The Dark", "common", "bad", "Darkness for 15 seconds.", "darkness", 15),
  {
    id: "up_up",
    name: "Up, Up",
    rarity: "common",
    kind: "mixed",
    text: "Levitation for 4 seconds, then a gentle Slow Falling down.",
    expect: "effect:levitation",
    run: ({ player }) => {
      effect(player, "minecraft:levitation", 4);
      effect(player, "minecraft:slow_falling", 20);
    },
  },
  buff("sour_berry", "Sour Berry", "common", "bad", "Poison for 5 seconds (it never kills).", "poison", 5),
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
      if (!item) return false;
      inv.setItem(slot, undefined);
      const view = player.getViewDirection();
      const at = player.getHeadLocation();
      const dropped = player.dimension.spawnItem(item, { x: at.x + view.x, y: at.y - 0.3, z: at.z + view.z });
      attempt(() => dropped.applyImpulse({ x: view.x * 0.2, y: 0.1, z: view.z * 0.2 }));
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
      const items = [];
      for (let i = 0; i < 9; i++) items.push(inv.getItem(i));
      if (items.filter((x) => x).length < 2) return false;
      const before = items.map((x) => x?.typeId ?? "").join();
      let shuffled = items;
      for (let t = 0; t < 5 && shuffled.map((x) => x?.typeId ?? "").join() === before; t++) shuffled = [...items].sort(() => Math.random() - 0.5);
      shuffled.forEach((it, i) => inv.setItem(i, it));
      sound(player, "random.pop", 1.4);
    },
  },
  gift("bakers_gift", "Baker's Gift", "common", "good", "8 bread.", [["bread", 8]]),
  gift("the_feast", "The Feast", "common", "good", "6 steaks.", [["cooked_beef", 6]]),
  gift("golden_carrots", "Golden Carrots", "common", "good", "4 golden carrots.", [["golden_carrot", 4]]),
  gift("the_apple", "The Apple", "common", "good", "A golden apple.", [["golden_apple", 1]]),
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
  gift("the_torch", "The Torch", "common", "good", "32 torches.", [["torch", 32]]),
  gift("the_quiver", "The Quiver", "common", "good", "24 arrows.", [["arrow", 24]]),
  gift("lump_of_coal", "Lump of Coal", "common", "mixed", "8 coal. Were you naughty?", [["coal", 8]]),
  gift("iron_ration", "Iron Ration", "common", "good", "6 iron ingots.", [["iron_ingot", 6]]),
  gift("fools_gold", "Fool's Gold", "common", "good", "4 gold ingots.", [["gold_ingot", 4]]),
  gift("merchants_purse", "Merchant's Purse", "common", "good", "3 emeralds.", [["emerald", 3]]),
  gift("the_woodsman", "The Woodsman", "common", "good", "16 oak logs.", [["oak_log", 16]]),
  gift("green_thumb", "Green Thumb", "common", "good", "16 bone meal.", [["bone_meal", 16]]),
  gift("the_gardener", "The Gardener", "common", "good", "Seeds, a sapling and a few carrots and potatoes.", [
    ["wheat_seeds", 8],
    ["oak_sapling", 2],
    ["carrot", 4],
    ["potato", 4],
  ]),
  gift("the_pearl", "The Pearl", "common", "good", "2 ender pearls.", [["ender_pearl", 2]]),
  gift("honey_pot", "Honey Pot", "common", "good", "3 bottles of honey.", [["honey_bottle", 3]]),
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
  gift("rotten_luck", "Rotten Luck", "common", "bad", "8 rotten flesh. Yum.", [["rotten_flesh", 8]]),
  gift("pocket_dirt", "Pocket Dirt", "common", "bad", "16 dirt. Your pockets are full of it.", [["dirt", 16]]),
  gift("snow_day", "Snow Day", "common", "good", "16 snowballs.", [["snowball", 16]]),
  gift("the_name", "The Name", "common", "good", "A name tag.", [["name_tag", 1]]),
  mobs("the_flock", "The Flock", "common", "good", "Three chickens come running.", "chicken", 3),
  mobs("stray_cat", "Stray Cat", "common", "good", "A stray cat finds you. Fish might win it over.", "cat", 1),
  mobs("bunny_hop", "Bunny Hop", "common", "good", "Four rabbits hop out of the deck.", "rabbit", 4),
  mobs("the_grave", "The Grave", "common", "bad", "Two zombies climb out of the ground.", "zombie", 2, 5, 8),
  mobs("creepy_crawlies", "Creepy Crawlies", "common", "bad", "Two spiders drop in.", "spider", 2, 5, 8),
  mobs("the_slime", "The Slime", "common", "bad", "A slime oozes out of the deck.", "slime", 1, 4, 7),
  mobs("the_hive", "The Hive", "common", "mixed", "Three bees buzz around. Be nice to them.", "bee", 3),
  mobs("bone_rattle", "Bone Rattle", "common", "bad", "Two skeletons rattle up.", "skeleton", 2, 6, 9),
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
    kind: "mixed",
    text: "You are thrown 20 blocks into the sky, with Slow Falling.",
    expect: "move",
    run: ({ player }) => {
      const at = player.location;
      const dim = player.dimension;
      for (let y = 1; y <= 22; y++) {
        const b = blockAt(dim, { x: at.x, y: at.y + y, z: at.z });
        if (!b || !b.isAir) return false;
      }
      effect(player, "minecraft:slow_falling", 30);
      player.teleport({ x: at.x, y: at.y + 20, z: at.z }, { keepVelocity: false });
      sound(player, "mob.enderdragon.flap");
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
    text: "50 experience points.",
    expect: "xp",
    run: ({ player }) => {
      player.addExperience(50);
      sound(player, "random.orb");
    },
  },
  {
    id: "copper_purse",
    name: "Copper Purse",
    rarity: "common",
    kind: "good",
    text: "5 Crowns.",
    expect: "crowns",
    run: ({ player }) => {
      addCrowns(player, 5);
      return `You have ${crownsOf(player)} Crowns.`;
    },
  },
  {
    id: "the_taxman",
    name: "The Taxman",
    rarity: "common",
    kind: "bad",
    text: "The taxman takes 5 Crowns.",
    expect: "crowns-",
    prep: (p) => void addCrowns(p, 10),
    run: ({ player }) => {
      const took = -addCrowns(player, -5);
      return took ? `You have ${crownsOf(player)} Crowns.` : "You had nothing to take. The taxman leaves grumbling.";
    },
  },
  {
    id: "the_leech",
    name: "The Leech",
    rarity: "common",
    kind: "bad",
    text: "You lose one experience level.",
    expect: "levels-",
    prep: (p) => void p.addLevels(3),
    run: ({ player }) => {
      if (player.level < 1) return false;
      player.addLevels(-1);
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
    text: "Your name shines in rainbow colors for 5 minutes.",
    expect: "name",
    run: ({ player, test }) => rainbowName(player, { test }),
  },

  // ---------------------------------------------------------------------------
  // Uncommon (20)
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
    text: "5 experience levels.",
    expect: "xp",
    run: ({ player }) => {
      player.addLevels(5);
      sound(player, "random.levelup");
    },
  },
  {
    id: "the_mentor",
    name: "The Mentor",
    rarity: "uncommon",
    kind: "good",
    text: "250 XP in a random skill (with the Skills pack).",
    expect: "none",
    run: ({ player }) => `${skillXp(player, 250)} skill XP, if the Skills pack is installed.`,
  },
  {
    id: "silver_purse",
    name: "Silver Purse",
    rarity: "uncommon",
    kind: "good",
    text: "25 Crowns.",
    expect: "crowns",
    run: ({ player }) => {
      addCrowns(player, 25);
      sound(player, "random.orb", 0.8);
      return `You have ${crownsOf(player)} Crowns.`;
    },
  },
  gift("the_gem", "The Gem", "uncommon", "good", "2 diamonds.", [["diamond", 2]]),
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
      const n = 3 + Math.min(3, friends);
      spawnAround(player, "minecraft:zombie", n, 6, 9);
      spawnAround(player, "minecraft:skeleton", 2, 7, 10);
      sound(player, "mob.zombie.say", 0.8);
    },
  },
  mobs("the_witch", "The Witch", "uncommon", "bad", "A witch arrives, cackling.", "witch", 1, 6, 9),
  {
    id: "night_terror",
    name: "Night Terror",
    rarity: "uncommon",
    kind: "bad",
    text: "Two phantoms swoop down from the sky.",
    expect: "spawn:phantom",
    run: ({ player }) => {
      const at = player.location;
      let n = 0;
      for (let i = 0; i < 2; i++) {
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
    text: "Haste II, Speed, Strength and Resistance for 5 minutes.",
    expect: "effect:haste",
    run: ({ player }) => {
      effect(player, "minecraft:haste", 300, 1);
      effect(player, "minecraft:speed", 300);
      effect(player, "minecraft:strength", 300);
      effect(player, "minecraft:resistance", 300);
      burst(player.dimension, "minecraft:villager_happy", player.location, 16);
      sound(player, "beacon.activate");
    },
  },
  {
    id: "the_curse",
    name: "The Curse",
    rarity: "uncommon",
    kind: "bad",
    text: "Slowness II, Weakness, Mining Fatigue and Hunger for 2 minutes.",
    expect: "effect:weakness",
    run: ({ player }) => {
      effect(player, "minecraft:slowness", 120, 1);
      effect(player, "minecraft:weakness", 120);
      effect(player, "minecraft:mining_fatigue", 120);
      effect(player, "minecraft:hunger", 120);
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
      const a = Math.random() * Math.PI * 2;
      const d = between(150, 300);
      const at = player.location;
      if (player.dimension.id === "minecraft:the_end") return false;
      const spot = await farTeleport(player, player.dimension, at.x + Math.cos(a) * d, at.z + Math.sin(a) * d);
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
  mobs("the_patrol", "The Patrol", "uncommon", "bad", "A pillager patrol finds you.", "pillager", 3, 8, 12),

  // ---------------------------------------------------------------------------
  // Rare (9)
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
      effect(player, "minecraft:fire_resistance", 120);
      const spot = await farTeleport(player, to, at.x * scale + between(-16, 16), at.z * scale + between(-16, 16));
      if (!spot) return false;
      give(player, "minecraft:obsidian", 10);
      give(player, "minecraft:flint_and_steel", 1);
      announce(`${player.name} drew The Gate and fell into the ${to.id === "minecraft:nether" ? "Nether" : "Overworld"}!`);
      return "Build a 4 by 5 obsidian frame and light it to go home. Fire Resistance helps for 2 minutes.";
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
      const spot = randomSpot(player, 8, 12);
      if (!spot) return false;
      const dim = player.dimension;
      const tag = `realm:domt_champ_${Date.now().toString(36)}`;
      send("realm:champion_spawn", { dim: dim.id, x: spot.x, y: spot.y, z: spot.z, name: "the Deck's Champion", tag });
      await wait(10);
      const found = dim.getEntities({ tags: [tag] });
      if (!found.length) {
        // No Champions pack: the deck sends its own.
        const e = dim.spawnEntity("minecraft:vindicator", spot);
        e.nameTag = "§cThe Deck's Champion";
        e.addTag("domt:boss");
        effect(e, "minecraft:health_boost", 3600, 4);
        effect(e, "minecraft:instant_health", 1, 4);
        effect(e, "minecraft:resistance", 3600);
        effect(e, "minecraft:strength", 3600);
      }
      burst(dim, "minecraft:knockback_roar_particle", spot, 6);
      sound(player, "mob.evocation_illager.prepare_summon");
      announce(`${player.name} drew The Champion! A champion hunts them.`);
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
    text: "15 experience levels and 750 XP in a random skill.",
    expect: "xp",
    run: ({ player, announce }) => {
      player.addLevels(15);
      const skill = skillXp(player, 750);
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

  // ---------------------------------------------------------------------------
  // Legendary (1)
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
];

/** @type {Record<Rarity, string>} */
export const RARITY_COLOR = { common: "§f", uncommon: "§a", rare: "§b", legendary: "§d" };
/** @type {Record<Rarity, string>} */
export const RARITY_NAME = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" };
/** @type {Rarity[]} */
export const RARITIES = ["common", "uncommon", "rare", "legendary"];
