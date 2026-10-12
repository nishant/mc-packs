// The bigger cards: the arena, the spore field, the rainbow name and the Wish.
import { Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import {
  addCrowns,
  attempt,
  blockAt,
  burst,
  ENCHANTS,
  give,
  giveStack,
  inZone,
  randomEnchanted,
  restoreDue,
  saveTask,
  sound,
  spawnAround,
  wait,
} from "./helpers.js";

/** @param {Player} p */
const online = (p) => {
  try {
    return p.isValid;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// The Arena: a walled platform high above the player, a wave of mobs, then everything goes back
// ---------------------------------------------------------------------------

const ARENA_TAG = "domt:arena";
const PROP_ARENA = "domt:arena"; // player: JSON { dim, x, y, z, task } where to send them back
const HALF = 7;
const ARENA_TYPES = ["minecraft:air", "minecraft:smooth_stone", "minecraft:barrier", "minecraft:sea_lantern"];

/** @type {Map<string, { task: string, center: import("@minecraft/server").Vector3, back: { dim: string, x: number, y: number, z: number } }>} */
const arenas = new Map();

/**
 * @param {Player} p @param {{ test?: boolean }} opts
 * @returns {Promise<boolean | string>}
 */
export async function arena(p, opts) {
  const dim = p.dimension;
  if (dim.id !== "minecraft:overworld" || arenas.has(p.id)) return false;
  const x0 = Math.floor(p.location.x);
  const z0 = Math.floor(p.location.z);
  if (inZone(dim.id, x0, z0, HALF + 1)) return false;
  let ground = Math.floor(p.location.y);
  try {
    const top = dim.getTopmostBlock({ x: x0, z: z0 });
    if (top) ground = Math.max(ground, top.location.y);
  } catch {
    // keep the player's height
  }
  const y0 = Math.min(ground + 24, dim.heightRange.max - 8);
  if (y0 < ground + 8) return false;
  // Every block of the box must be air (and loaded), so nothing is ever replaced.
  for (let x = x0 - HALF; x <= x0 + HALF; x++)
    for (let z = z0 - HALF; z <= z0 + HALF; z++)
      for (let y = y0; y <= y0 + 5; y++) {
        const b = blockAt(dim, { x, y, z });
        if (!b || !b.isAir) return false;
      }
  /** @type {number[][]} */
  const blocks = [];
  for (let x = x0 - HALF; x <= x0 + HALF; x++)
    for (let z = z0 - HALF; z <= z0 + HALF; z++) {
      const edge = Math.abs(x - x0) === HALF || Math.abs(z - z0) === HALF;
      const ring = Math.max(Math.abs(x - x0), Math.abs(z - z0)) === HALF - 2 && (x + z) % 2 === 0;
      const t = ring ? 3 : 1;
      dim.getBlock({ x, y: y0, z })?.setType(ARENA_TYPES[t]);
      blocks.push([x, y0, z, 0, t]);
      if (edge)
        for (let y = y0 + 1; y <= y0 + 4; y++) {
          dim.getBlock({ x, y, z })?.setType(ARENA_TYPES[2]);
          blocks.push([x, y, z, 0, 2]);
        }
    }
  const task = `arena_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`;
  // A safety net: even if the server restarts mid-fight, the arena is gone ten minutes later.
  saveTask({ id: task, dim: dim.id, at: Date.now() + 600000, types: ARENA_TYPES, blocks });
  const back = { dim: dim.id, x: p.location.x, y: p.location.y, z: p.location.z };
  p.setDynamicProperty(PROP_ARENA, JSON.stringify({ ...back, task }));
  const center = { x: x0 + 0.5, y: y0 + 1, z: z0 + 0.5 };
  arenas.set(p.id, { task, center, back });
  p.teleport(center, { dimension: dim, keepVelocity: false });
  runArena(p, opts.test ? 20 : 120).catch((e) => console.warn(`[domt] arena: ${e}`));
  return "The deck pulls you into a sky arena. Defeat every foe!";
}

/** @param {Player} p @param {number} seconds */
async function runArena(p, seconds) {
  const state = arenas.get(p.id);
  if (!state) return;
  const dim = world.getDimension(state.back.dim);
  for (const n of ["3", "2", "1"]) {
    if (!online(p)) break;
    system.sendScriptEvent("realm:title", JSON.stringify({ player: p.id, ticks: 20, from: "domt_bp" }));
    attempt(() => p.onScreenDisplay.setTitle(`§c${n}`, { subtitle: "", fadeInDuration: 0, stayDuration: 15, fadeOutDuration: 5 }));
    sound(p, "random.click");
    await wait(20);
  }
  if (online(p)) {
    system.sendScriptEvent("realm:title", JSON.stringify({ player: p.id, ticks: 30, from: "domt_bp" }));
    attempt(() => p.onScreenDisplay.setTitle("§4§lFIGHT!", { fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 10, subtitle: "Defeat every foe" }));
    sound(p, "raid.horn", 1, 0.6);
  }
  const corners = [
    [-4, -4],
    [4, -4],
    [-4, 4],
    [4, 4],
    [0, -5],
  ];
  const mobs = ["minecraft:husk", "minecraft:husk", "minecraft:husk", "minecraft:vindicator", "minecraft:pillager"];
  mobs.forEach((type, i) => {
    try {
      const [dx, dz] = corners[i];
      const e = dim.spawnEntity(type, { x: state.center.x + dx, y: state.center.y, z: state.center.z + dz });
      e.addTag(ARENA_TAG);
      e.addTag(`${ARENA_TAG}:${state.task}`);
    } catch (e) {
      console.warn(`[domt] arena mob: ${e}`);
    }
  });
  let outcome = "time";
  for (let s = 0; s < seconds; s++) {
    await wait(20);
    if (!online(p)) {
      outcome = "gone";
      break;
    }
    const at = p.location;
    if (p.dimension.id !== dim.id || Math.abs(at.x - state.center.x) > HALF + 2 || Math.abs(at.z - state.center.z) > HALF + 2 || at.y < state.center.y - 3) {
      outcome = "gone";
      break;
    }
    const left = dim.getEntities({ tags: [`${ARENA_TAG}:${state.task}`] }).length;
    if (left === 0) {
      outcome = "win";
      break;
    }
    if (s % 10 === 0)
      attempt(() => {
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: p.id, ticks: 60, from: "domt_bp" })); // other bar writers wait
        p.onScreenDisplay.setActionBar(`§cFoes left: ${left} §7| ${seconds - s}s`);
      });
  }
  await endArena(p, outcome);
}

/** @param {Player} p @param {string} outcome */
async function endArena(p, outcome) {
  const state = arenas.get(p.id);
  if (!state) return;
  arenas.delete(p.id);
  const dim = world.getDimension(state.back.dim);
  for (const e of dim.getEntities({ tags: [`${ARENA_TAG}:${state.task}`] })) attempt(() => e.remove());
  if (online(p)) {
    if (outcome === "win") {
      system.sendScriptEvent("realm:title", JSON.stringify({ player: p.id, ticks: 50, from: "domt_bp" }));
      attempt(() => p.onScreenDisplay.setTitle("§6§lVICTORY", { fadeInDuration: 0, stayDuration: 40, fadeOutDuration: 10, subtitle: "The deck is pleased" }));
      sound(p, "random.levelup");
      const { stack } = randomEnchanted("minecraft:enchanted_book", ENCHANTS.book, 1, 3);
      giveStack(p, stack);
      addCrowns(p, 15);
      p.sendMessage("§6The Arena: §fvictory! §7+15 Crowns and an enchanted book.");
    } else if (outcome === "time") p.sendMessage("§6The Arena: §7time is up. The deck sends you home.");
    // Back home if they're still up there; give them a moment of Slow Falling either way.
    const at = p.location;
    if (p.dimension.id === dim.id && Math.abs(at.x - state.center.x) <= HALF + 3 && Math.abs(at.z - state.center.z) <= HALF + 3 && at.y >= state.center.y - 4) {
      p.teleport({ x: state.back.x, y: state.back.y, z: state.back.z }, { dimension: dim, keepVelocity: false });
    }
    attempt(() => p.addEffect("minecraft:slow_falling", 200, { showParticles: false }));
    attempt(() => p.setDynamicProperty(PROP_ARENA, undefined));
  }
  await wait(10);
  restoreDue(state.task);
}

world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  try {
    if (deadEntity instanceof Player && arenas.has(deadEntity.id)) endArena(deadEntity, "died").catch(() => {});
  } catch {
    // ignore
  }
});

/** Is this block part of a running arena (floor, lights or walls)? @param {string} dimId @param {import("@minecraft/server").Vector3} l */
function inArena(dimId, l) {
  if (dimId !== "minecraft:overworld") return false;
  for (const { center } of arenas.values()) {
    if (Math.abs(l.x + 0.5 - center.x) <= HALF + 0.5 && Math.abs(l.z + 0.5 - center.z) <= HALF + 0.5 && l.y >= center.y - 1 && l.y <= center.y + 3) return true;
  }
  return false;
}

/** Is this player standing in a running Deck arena (theirs or someone else's)? @param {Player} p */
export function inDeckArena(p) {
  if (arenas.has(p.id)) return true;
  const l = p.location;
  return inArena(p.dimension.id, { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) });
}

// The arena's blocks are borrowed: mining the floor or the sea lanterns would keep free blocks after it's gone.
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  try {
    if (arenas.size && inArena(ev.block.dimension.id, ev.block.location)) ev.cancel = true;
  } catch {
    // not loaded
  }
});

// Arena mobs left over from a fight that a restart interrupted (or a chunk that unloaded): remove them.
system.runInterval(() => {
  try {
    const live = new Set([...arenas.values()].map((a) => `${ARENA_TAG}:${a.task}`));
    for (const e of world.getDimension("minecraft:overworld").getEntities({ tags: [ARENA_TAG] })) {
      if (!e.getTags().some((t) => live.has(t))) attempt(() => e.remove());
    }
  } catch {
    // ignore
  }
}, 200);

// After a restart mid-fight, or leaving the game mid-fight: send the player back down when they join
// (at once, with Slow Falling: the arena under them may already be gone).
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  system.run(() => {
    try {
      if (!online(player) || arenas.has(player.id)) return;
      const raw = player.getDynamicProperty(PROP_ARENA);
      if (typeof raw !== "string") return;
      player.setDynamicProperty(PROP_ARENA, undefined);
      attempt(() => player.addEffect("minecraft:slow_falling", 200, { showParticles: false }));
      const back = JSON.parse(raw);
      restoreDue(back.task);
      if (typeof back.x === "number") player.teleport({ x: back.x, y: back.y, z: back.z }, { dimension: world.getDimension(back.dim), keepVelocity: false });
    } catch (e) {
      console.warn(`[domt] arena return: ${e}`);
    }
  });
});

// ---------------------------------------------------------------------------
// The Spore: mycelium and mushrooms over wild ground, undone after a while
// ---------------------------------------------------------------------------

const NATURAL = /^minecraft:(grass_block|dirt|coarse_dirt|podzol|dirt_with_roots|rooted_dirt)$/;
/** Blocks that mean someone built or farmed here. */
const BUILT = /planks|stripped|glass|brick|wool|concrete|terracotta|crafting_table|chest|furnace|smoker|barrel|bed$|door|fence|torch|lantern|stairs|slab|farmland|grass_path|dirt_path|rail|carpet|sign|cobblestone|stone_bricks|polished|smooth|quartz|bookshelf|lectern|campfire|hay_block|composter|anvil|bell|banner|ladder|scaffolding|wall$|bars|pane|trapdoor|workbench|loom|cartography|fletching|smithing|grindstone|stonecutter|beehive|flower_pot|mycelium/;
const SPORE_TYPES = ["minecraft:grass_block", "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:podzol", "minecraft:dirt_with_roots", "minecraft:rooted_dirt", "minecraft:mycelium", "minecraft:air", "minecraft:red_mushroom", "minecraft:brown_mushroom"];

/** @param {Player} p @param {{ test?: boolean, minutes: number }} opts @returns {boolean | string} */
export function spore(p, opts) {
  const dim = p.dimension;
  if (dim.id !== "minecraft:overworld") return false;
  const R = 9;
  const cx = Math.floor(p.location.x);
  const cz = Math.floor(p.location.z);
  const py = Math.floor(p.location.y);
  if (inZone(dim.id, cx, cz, R + 3)) return false;
  // Look around first: any sign of a build or farm (or a real mushroom field) and the card fizzles.
  for (let x = cx - R - 4; x <= cx + R + 4; x++)
    for (let z = cz - R - 4; z <= cz + R + 4; z++) {
      let top;
      try {
        top = dim.getTopmostBlock({ x, z });
      } catch {
        return false;
      }
      if (!top) return false;
      if (BUILT.test(top.typeId)) return false;
      const under = blockAt(dim, { x, y: top.location.y - 1, z });
      if (under && BUILT.test(under.typeId)) return false;
    }
  /** @type {number[][]} */
  const blocks = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (let x = cx - R; x <= cx + R; x++)
    for (let z = cz - R; z <= cz + R; z++) {
      if ((x - cx) ** 2 + (z - cz) ** 2 > R * R) continue;
      const top = dim.getTopmostBlock({ x, z });
      if (!top || !NATURAL.test(top.typeId) || Math.abs(top.location.y - py) > 10) continue;
      const above = blockAt(dim, { x, y: top.location.y + 1, z });
      if (!above || !above.isAir) continue;
      const y = top.location.y;
      blocks.push([x, y, z, SPORE_TYPES.indexOf(top.typeId), 6]);
      top.setType("minecraft:mycelium");
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (Math.random() < 0.12) {
        const m = Math.random() < 0.5 ? 8 : 9;
        above.setType(SPORE_TYPES[m]);
        blocks.push([x, y + 1, z, 7, m]);
      }
    }
  if (blocks.length < 12) {
    // Too little wild ground: undo and let the deck draw again.
    for (const [x, y, z, orig] of blocks) blockAt(dim, { x, y, z })?.setType(SPORE_TYPES[orig]);
    return false;
  }
  const ms = opts.test ? 20000 : Math.max(1, opts.minutes) * 60000;
  // Mycelium spreads onto dirt: when the hour is up, any mycelium in and around the field turns back to grass.
  const sweep = [cx - R - 3, minY - 2, cz - R - 3, cx + R + 3, maxY + 1, cz + R + 3, 6, 0];
  saveTask({ id: `spore_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`, dim: dim.id, at: Date.now() + ms, types: SPORE_TYPES, blocks, sweep });
  spawnAround(p, "minecraft:mooshroom", 2, 3, 7);
  for (let i = 0; i < 6; i++) burst(dim, "minecraft:mycelium_dust_particle", { x: cx + (Math.random() - 0.5) * R * 2, y: py + 1, z: cz + (Math.random() - 0.5) * R * 2 }, 10, 2);
  sound(p, "block.mycelium.place", 0.8);
  return `The ground around you turns to mushroom fields for ${opts.test ? "a moment" : `${opts.minutes} minutes`}.`;
}

// ---------------------------------------------------------------------------
// The Rainbow (a rainbow name above your head) and Cursed Name (a silly one), for a while
// ---------------------------------------------------------------------------

const PROP_NAME = "domt:name"; // player: the name tag to put back
const COLORS = ["§c", "§6", "§e", "§a", "§b", "§9", "§d"];
/** @type {Set<string>} players whose name the deck is changing */
const rainbows = new Set();

/**
 * Changes the name above a player's head for a while, then puts it back: rainbow colors, or with
 * `title`, that name in red.
 * @param {Player} p @param {{ test?: boolean, minutes?: number, title?: string }} opts
 */
export function rainbowName(p, opts) {
  if (rainbows.has(p.id)) return false;
  const orig = p.nameTag;
  const plain = (orig || p.name).replace(/§./g, "");
  const minutes = opts.minutes ?? 20;
  p.setDynamicProperty(PROP_NAME, orig);
  rainbows.add(p.id);
  let shift = 0;
  let last = "";
  const until = system.currentTick + (opts.test ? 60 : minutes * 1200);
  const id = system.runInterval(() => {
    try {
      if (!online(p) || (last && p.nameTag !== last)) {
        // gone, or another pack (Nicknames, AFK) changed the name: leave it to them
        system.clearRun(id);
        rainbows.delete(p.id);
        if (online(p)) p.setDynamicProperty(PROP_NAME, undefined);
        return;
      }
      if (system.currentTick >= until) {
        system.clearRun(id);
        rainbows.delete(p.id);
        p.nameTag = orig;
        p.setDynamicProperty(PROP_NAME, undefined);
        return;
      }
      shift++;
      last = opts.title ? `§c${opts.title}` : [...plain].map((ch, i) => `${COLORS[(i + shift) % COLORS.length]}${ch}`).join("");
      if (p.nameTag !== last) p.nameTag = last;
    } catch {
      system.clearRun(id);
      rainbows.delete(p.id);
    }
  }, 5);
  return opts.title ? `Everyone sees you as "${opts.title}" for ${minutes} minutes.` : `Your name shines in rainbow colors for ${minutes} minutes.`;
}

// A restart in the middle: put the name back when they join.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  try {
    const orig = player.getDynamicProperty(PROP_NAME);
    if (typeof orig === "string" && !rainbows.has(player.id)) {
      player.nameTag = orig;
      player.setDynamicProperty(PROP_NAME, undefined);
    }
  } catch {
    // ignore
  }
});

// ---------------------------------------------------------------------------
// The Wish: choose one of three powerful boons
// ---------------------------------------------------------------------------

const PROP_WISH = "domt:wish"; // player: JSON list of the three boon ids offered, until one is chosen

/** @type {{ id: string, name: string, give: (p: Player) => void }[]} */
export const BOONS = [
  {
    id: "pickaxe",
    name: "The Worldbreaker: netherite pickaxe (Efficiency V, Fortune III, Unbreaking III, Mending)",
    give: (p) =>
      give(p, "minecraft:netherite_pickaxe", 1, {
        name: "§dWorldbreaker",
        enchants: [
          ["minecraft:efficiency", 5],
          ["minecraft:fortune", 3],
          ["minecraft:unbreaking", 3],
          ["minecraft:mending", 1],
        ],
      }),
  },
  {
    id: "sword",
    name: "The Kingslayer: netherite sword (Sharpness V, Looting III, Unbreaking III, Mending)",
    give: (p) =>
      give(p, "minecraft:netherite_sword", 1, {
        name: "§dKingslayer",
        enchants: [
          ["minecraft:sharpness", 5],
          ["minecraft:looting", 3],
          ["minecraft:unbreaking", 3],
          ["minecraft:mending", 1],
        ],
      }),
  },
  {
    id: "wings",
    name: "Wings: an elytra (Unbreaking III, Mending) and 64 rockets",
    give: (p) => {
      give(p, "minecraft:elytra", 1, {
        enchants: [
          ["minecraft:unbreaking", 3],
          ["minecraft:mending", 1],
        ],
      });
      give(p, "minecraft:firework_rocket", 64);
    },
  },
  { id: "levels", name: "Wisdom: 30 experience levels", give: (p) => void p.addLevels(30) },
  { id: "riches", name: "Riches: 500 Crowns", give: (p) => void addCrowns(p, 500) },
  {
    id: "trident",
    name: "The Tide: a trident (Loyalty III, Impaling V, Unbreaking III, Mending) and a Heart of the Sea",
    give: (p) => {
      give(p, "minecraft:trident", 1, {
        name: "§bThe Tide",
        enchants: [
          ["minecraft:loyalty", 3],
          ["minecraft:impaling", 5],
          ["minecraft:unbreaking", 3],
          ["minecraft:mending", 1],
        ],
      });
      give(p, "minecraft:heart_of_the_sea", 1);
    },
  },
  {
    id: "beacon",
    name: "A Beacon and the 9 iron blocks to light it",
    give: (p) => {
      give(p, "minecraft:beacon", 1);
      give(p, "minecraft:iron_block", 9);
    },
  },
  {
    id: "armor",
    name: "The Bulwark: full diamond armor (Protection IV, Unbreaking III)",
    give: (p) => {
      for (const piece of ["helmet", "chestplate", "leggings", "boots"])
        give(p, `minecraft:diamond_${piece}`, 1, {
          enchants: [
            ["minecraft:protection", 4],
            ["minecraft:unbreaking", 3],
          ],
        });
    },
  },
];

/** Is a Wish waiting for this player? @param {Player} p */
export function wishPending(p) {
  return typeof p.getDynamicProperty(PROP_WISH) === "string";
}

/** Offers three boons (saved until chosen). @param {Player} p @param {{ test?: boolean }} opts */
export async function wish(p, opts) {
  const offered = [...BOONS].sort(() => Math.random() - 0.5).slice(0, 3).map((b) => b.id);
  p.setDynamicProperty(PROP_WISH, JSON.stringify(offered));
  for (const q of world.getAllPlayers()) {
    sound(q, "random.totem", 1, 0.8);
    sound(q, "mob.enderdragon.growl", 1.2, 0.4);
  }
  burst(p.dimension, "minecraft:totem_particle", p.location, 40, 1.5);
  if (opts.test) chooseBoon(p, 0);
  else
    system.runTimeout(() => {
      showWish(p).catch((e) => console.warn(`[domt] wish: ${e}`));
    }, 60);
  return "Make a wish: choose one of three powerful boons.";
}

/** @param {Player} p @param {number} index @returns {boolean} */
function chooseBoon(p, index) {
  const raw = p.getDynamicProperty(PROP_WISH);
  if (typeof raw !== "string") return false;
  /** @type {string[]} */
  let ids;
  try {
    ids = JSON.parse(raw);
  } catch {
    ids = [];
  }
  const boon = BOONS.find((b) => b.id === ids[index]);
  if (!boon) return false;
  p.setDynamicProperty(PROP_WISH, undefined);
  boon.give(p);
  burst(p.dimension, "minecraft:totem_particle", p.location, 30, 1.2);
  sound(p, "random.levelup", 0.8);
  p.sendMessage(`§dThe Wish: §f${boon.name}. §7So be it.`);
  return true;
}

/** Shows the Wish form; a closed form keeps the Wish for later. @param {Player} p */
export async function showWish(p) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!online(p)) return;
    const raw = p.getDynamicProperty(PROP_WISH);
    if (typeof raw !== "string") return;
    /** @type {string[]} */
    let ids;
    try {
      ids = JSON.parse(raw);
    } catch {
      ids = [];
    }
    const boons = ids.map((id) => BOONS.find((b) => b.id === id)).filter((b) => !!b);
    const form = new ActionFormData().title("§d§lThe Wish").body("The deck grants one wish. Choose well: the other two vanish.");
    for (const b of boons) form.button(b.name);
    const res = await form.show(p);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await wait(20);
      continue;
    }
    if (res.canceled || res.selection === undefined) {
      p.sendMessage("§dYour wish waits. §7Open /realm:domt to make it.");
      return;
    }
    chooseBoon(p, res.selection);
    return;
  }
}


