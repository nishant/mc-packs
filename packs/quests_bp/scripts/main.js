import { CommandPermissionLevel, CustomCommandStatus, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

// Each player's quests for the day are one small player property: "quests:day" -> JSON
// { d: day number, q: [{ id, p: progress, done: 0 | 1 }] }. Quests are saved by their pool id.
const PROP_DAY = "quests:day";
const DAY = 86400000;
const PLACED_MEMORY = 10000; // recently placed blocks remembered, so breaking them again doesn't count as mining

/** @typedef {typeof CONFIG.pool[number]} Quest */
/** @typedef {{ id: string, p: number, done: number }} Progress */
/** @typedef {{ d: number, q: Progress[] }} Day */
/** @typedef {Quest["kind"]} Kind */

const pool = new Map(CONFIG.pool.map((q) => [q.id, q]));
const crops = new Map(CONFIG.crops.map((c) => [c.block, c]));

/** Today's number: days since 1970 counted from resetHourUtc. */
const today = () => Math.floor((Date.now() - get("resetHourUtc") * 3600000) / DAY);

/** "5h 12m" until the next quests. */
function untilReset() {
  const next = (today() + 1) * DAY + get("resetHourUtc") * 3600000;
  const m = Math.max(1, Math.ceil((next - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** 12345 -> "12,345". @param {number} n */
const fmt = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// ---------------------------------------------------------------------------
// Saved progress (cached per player)
// ---------------------------------------------------------------------------

/** @type {Map<string, Day>} */
const cache = new Map();
world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cache.delete(playerId);
  travel.delete(playerId);
  announced.delete(playerId);
  joinedAt.delete(playerId);
});

/** Picks the day's quests: different kinds first, then any. @returns {Progress[]} */
function roll() {
  const n = Math.min(get("questsPerDay"), pool.size);
  const shuffled = [...pool.values()].sort(() => Math.random() - 0.5);
  /** @type {Quest[]} */
  const picked = [];
  for (const q of shuffled) if (picked.length < n && !picked.some((p) => p.kind === q.kind)) picked.push(q);
  for (const q of shuffled) if (picked.length < n && !picked.includes(q)) picked.push(q);
  return picked.map((q) => ({ id: q.id, p: 0, done: 0 }));
}

/** @param {Player} player @param {Day} day */
function save(player, day) {
  cache.set(player.id, day);
  player.setDynamicProperty(PROP_DAY, JSON.stringify(day));
}

/**
 * The player's quests for today, rolling new ones when the day changed. `fresh` is true when this
 * call rolled them.
 * @param {Player} player @returns {{ day: Day, fresh: boolean }}
 */
function questsOf(player) {
  const d = today();
  let day = cache.get(player.id);
  if (!day) {
    try {
      const raw = player.getDynamicProperty(PROP_DAY);
      const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
      if (parsed && typeof parsed.d === "number" && Array.isArray(parsed.q)) day = parsed;
    } catch {
      // corrupt: roll again
    }
  }
  if (day && day.d === d) {
    cache.set(player.id, day);
    return { day, fresh: false };
  }
  day = { d, q: roll() };
  save(player, day);
  return { day, fresh: true };
}

/** Does `id` count for this quest? @param {Quest} q @param {string} id */
const counts = (q, id) => !q.targets || !q.targets.length || q.targets.includes(id);

/** @param {Player} player */
function active(player) {
  if (!player.isValid) return false;
  if (get("skipCreative") === true && player.getGameMode() === GameMode.Creative) return false;
  return true;
}

/** Does the player have an unfinished quest of this kind today? Cheap: no saved data read once cached. @param {Player} player @param {Kind} kind */
function wants(player, kind) {
  const { day } = questsOf(player);
  return day.q.some((p) => !p.done && pool.get(p.id)?.kind === kind);
}

/**
 * Adds progress to every unfinished quest of this kind that `id` counts for.
 * @param {Player} player @param {Kind} kind @param {string} id @param {number} [n]
 */
function progress(player, kind, id, n = 1) {
  if (n <= 0 || !active(player)) return;
  const { day } = questsOf(player);
  let changed = false;
  for (const p of day.q) {
    const q = pool.get(p.id);
    if (!q || p.done || q.kind !== kind || !counts(q, id)) continue;
    const before = p.p;
    p.p = Math.min(q.count, p.p + n);
    changed = true;
    if (p.p >= q.count) {
      p.done = 1;
      complete(player, q, day);
    } else if (getFor(player, "progressNotes") === true) {
      const step = q.count / 4;
      if (Math.floor(before / step) !== Math.floor(p.p / step)) {
        player.onScreenDisplay.setActionBar(`§eQuest: ${q.label} §f${fmt(p.p)}/${fmt(q.count)}`);
        // Ask the Coordinates HUD, if installed, to leave the note on screen for a moment.
        system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: player.id, ticks: 40 }));
      }
    }
  }
  if (changed) save(player, day);
}

/** Day number each online player was last told about. @type {Map<string, number>} */
const announced = new Map();
/** Tick each player joined at: the first notice waits until the join popups are done. @type {Map<string, number>} */
const joinedAt = new Map();
const NOTICE_DELAY = 200;

/** Tells the player about today's quests once a day: new ones, or how many are left. @param {Player} player */
function notice(player) {
  const { day } = questsOf(player);
  if (announced.get(player.id) === day.d) return;
  announced.set(player.id, day.d);
  const open = day.q.filter((p) => !p.done && pool.has(p.id));
  if (!open.length) return;
  if (day.q.every((p) => !p.p && !p.done)) {
    const names = day.q.map((p) => pool.get(p.id)?.label).filter(Boolean);
    player.sendMessage(`§eNew daily quests: ${names.join(", ")}. §7See them with /realm:quests`);
  } else {
    player.sendMessage(`§eYou have ${open.length} daily quest${open.length === 1 ? "" : "s"} to finish: /realm:quests`);
  }
}

/** @param {Player} player @param {Quest} q @param {Day} day */
function complete(player, q, day) {
  const got = reward(player, q.reward);
  player.sendMessage(`§aQuest complete: ${q.label}!${got ? ` §7Reward: ${got}` : ""}`);
  player.playSound("random.levelup", { pitch: 1.1, volume: 0.8 });
  // Tell other packs (Guilds, Skills, Titles, Journal...) a quest was finished. Nobody listening is fine.
  try {
    system.sendScriptEvent("realm:quest_done", JSON.stringify({ player: player.id, pack: "quests_bp", id: q.id, label: q.label, kind: q.kind }));
  } catch (e) {
    console.warn(`[quests] quest_done: ${e}`);
  }
  if (day.q.every((p) => p.done || !pool.has(p.id))) player.sendMessage(`§6All of today's quests are done. New ones in ${untilReset()}.`);
}

/** Gives the reward; returns what was given, e.g. "3 levels, 16 Torch". @param {Player} player @param {Quest["reward"]} r */
function reward(player, r) {
  /** @type {string[]} */
  const given = [];
  if (r.levels && r.levels > 0) {
    player.addLevels(r.levels);
    given.push(`${r.levels} level${r.levels === 1 ? "" : "s"}`);
  }
  if (r.item) {
    let left = Math.max(1, Math.floor(r.amount ?? 1));
    try {
      const container = player.getComponent("minecraft:inventory")?.container;
      const max = new ItemStack(r.item, 1).maxAmount;
      let dropped = false;
      while (left > 0) {
        const stack = new ItemStack(r.item, Math.min(max, left));
        left -= stack.amount;
        const rest = container ? container.addItem(stack) : stack;
        if (rest) {
          player.dimension.spawnItem(rest, player.location);
          dropped = true;
        }
      }
      given.push(`${Math.max(1, Math.floor(r.amount ?? 1))} ${itemName(r.item)}${dropped ? " (some dropped at your feet: your inventory is full)" : ""}`);
    } catch (e) {
      console.warn(`[quests] reward ${r.item}: ${e}`);
    }
  }
  return given.join(", ");
}

/** "minecraft:golden_carrot" -> "Golden Carrot". @param {string} id */
const itemName = (id) =>
  id
    .replace(/^minecraft:/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/** Blocks players placed lately, "dim:x,y,z": breaking one again isn't mining. @type {Set<string>} */
const placed = new Set();
/** @param {string} dim @param {import("@minecraft/server").Vector3} p */
const spot = (dim, p) => `${dim}:${p.x},${p.y},${p.z}`;

world.afterEvents.playerPlaceBlock.subscribe(({ player, block }) => {
  try {
    const key = spot(block.dimension.id, block.location);
    placed.delete(key);
    placed.add(key);
    if (placed.size > PLACED_MEMORY) placed.delete(/** @type {string} */ (placed.values().next().value));
    progress(player, "place", block.typeId);
  } catch (e) {
    console.warn(`[quests] ${e}`);
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

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation }) => {
  try {
    const id = brokenBlockPermutation.type.id;
    const key = spot(block.dimension.id, block.location);
    const wasPlaced = placed.delete(key);
    if (!wasPlaced) progress(player, "mine", id);
    // Planting seeds is a block place too, so a grown crop counts even where it was planted lately;
    // a melon or pumpkin (no growth state) a player placed doesn't.
    if (ripe(brokenBlockPermutation) && (!wasPlaced || crops.get(id)?.state !== undefined)) progress(player, "harvest", id);
  } catch (e) {
    console.warn(`[quests] ${e}`);
  }
});

// A tap that resets a grown crop to its first stage is a harvest too (the Right-click Harvest pack).
world.beforeEvents.playerInteractWithBlock.subscribe(({ player, block, isFirstEvent }) => {
  if (!isFirstEvent || !crops.has(block.typeId)) return;
  const c = crops.get(block.typeId);
  if (!c || c.state === undefined || !ripe(block.permutation)) return;
  const dimension = block.dimension;
  const { x, y, z } = block.location;
  const type = block.typeId;
  system.runTimeout(() => {
    try {
      const b = dimension.getBlock({ x, y, z });
      if (!b || !player.isValid) return;
      // Broken instead (now air) is counted by playerBreakBlock.
      if (b.typeId === type && !ripe(b.permutation)) progress(player, "harvest", type);
    } catch (e) {
      console.warn(`[quests] ${e}`);
    }
  }, 3);
});

world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const killer = damageSource.damagingEntity;
  if (!(killer instanceof Player) || deadEntity instanceof Player) return;
  try {
    progress(killer, "kill", deadEntity.typeId);
  } catch (e) {
    console.warn(`[quests] ${e}`);
  }
});

world.afterEvents.itemCompleteUse.subscribe(({ source, itemStack }) => {
  try {
    if (!(source instanceof Player) || !itemStack) return;
    let food = false;
    try {
      food = !!itemStack.getComponent("minecraft:food");
    } catch {
      food = false;
    }
    if (food) progress(source, "eat", itemStack.typeId);
  } catch (e) {
    console.warn(`[quests] ${e}`);
  }
});

// Fishing: a hook belongs to the player nearest to where it appears. An item that appears where a
// hook just was is that player's catch.
/** @type {Map<string, { hook: import("@minecraft/server").Entity, owner: Player, dim: string, at: import("@minecraft/server").Vector3, seen: number }>} */
const hooks = new Map();

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  try {
    if (entity.typeId === "minecraft:fishing_hook") {
      const [owner] = entity.dimension.getPlayers({ location: entity.location, maxDistance: 4, closest: 1 });
      if (owner && wants(owner, "fish")) hooks.set(entity.id, { hook: entity, owner, dim: entity.dimension.id, at: entity.location, seen: system.currentTick });
      return;
    }
    if (entity.typeId !== "minecraft:item" || !hooks.size) return;
    const stack = entity.getComponent("minecraft:item")?.itemStack;
    if (!stack) return;
    const at = entity.location;
    for (const [id, h] of hooks) {
      if (h.dim !== entity.dimension.id) continue;
      if (Math.abs(h.at.x - at.x) > 3 || Math.abs(h.at.y - at.y) > 3 || Math.abs(h.at.z - at.z) > 3) continue;
      // An item dropped from the inventory appears at the owner's head, not at the hook: dropping
      // fish next to a hook close by isn't a catch.
      if (h.owner.isValid) {
        const head = h.owner.getHeadLocation();
        if (Math.hypot(head.x - at.x, head.y - at.y, head.z - at.z) < 1) continue;
      }
      hooks.delete(id);
      if (h.owner.isValid) progress(h.owner, "fish", stack.typeId, stack.amount);
      break;
    }
  } catch (e) {
    console.warn(`[quests] ${e}`);
  }
});

// Follow live hooks, and forget them a second after they're gone (the catch appears as the hook goes).
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

// Travel: distance moved each second; whole blocks are added every 5 seconds.
/** @type {Map<string, { last?: { x: number, y: number, z: number, dim: string }, blocks: number, ticks: number }>} */
const travel = new Map();
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  const t = travel.get(player.id);
  if (t) t.last = undefined; // respawning or joining isn't traveling
  if (initialSpawn) joinedAt.set(player.id, system.currentTick);
});

let seconds = 0;
system.runInterval(() => {
  seconds++;
  for (const player of world.getAllPlayers()) {
    try {
      // On joining (after the popups), and when a new day starts while playing.
      if (system.currentTick - (joinedAt.get(player.id) ?? -NOTICE_DELAY) >= NOTICE_DELAY) notice(player);
      if (!wants(player, "travel")) {
        travel.delete(player.id);
        continue;
      }
      let t = travel.get(player.id);
      if (!t) travel.set(player.id, (t = { blocks: 0, ticks: 0 }));
      const loc = player.location;
      const dim = player.dimension.id;
      if (t.last && t.last.dim === dim) {
        const dist = Math.hypot(loc.x - t.last.x, loc.y - t.last.y, loc.z - t.last.z);
        if (dist <= CONFIG.maxSpeed) t.blocks += dist;
      }
      t.last = { x: loc.x, y: loc.y, z: loc.z, dim };
      if (seconds % 5 === 0 && t.blocks >= 1) {
        const whole = Math.floor(t.blocks);
        t.blocks -= whole;
        progress(player, "travel", "", whole);
      }
    } catch (e) {
      console.warn(`[quests] ${e}`);
    }
  }
}, 20);

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

/** "[||||||....]" in color. @param {number} p @param {number} of */
function bar(p, of) {
  const filled = Math.round((Math.min(p, of) / Math.max(1, of)) * 20);
  return `§a${"|".repeat(filled)}§8${"|".repeat(20 - filled)}§r`;
}

/** @param {Player} player */
async function showQuests(player) {
  const { day } = questsOf(player);
  announced.set(player.id, day.d);
  const lines = day.q.map((p) => {
    const q = pool.get(p.id);
    if (!q) return "§7(a quest that was removed from the realm's list)";
    const rewardText = [
      q.reward.levels ? `${q.reward.levels} level${q.reward.levels === 1 ? "" : "s"}` : "",
      q.reward.item ? `${q.reward.amount ?? 1} ${itemName(q.reward.item)}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    return p.done
      ? `§a[Done] ${q.label}§r\n§7Reward: ${rewardText}`
      : `§e${q.label}§r\n${bar(p.p, q.count)} §f${fmt(p.p)}/${fmt(q.count)}\n§7Reward: ${rewardText}`;
  });
  const done = day.q.filter((p) => p.done).length;
  const body = [`${done} of ${day.q.length} done today. New quests in ${untilReset()}.`, ...lines].join("\n\n");
  const form = new ActionFormData().title("§lDaily Quests").body(body).button("OK");
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!player.isValid) return;
    const res = await form.show(player);
    if (!(res.canceled && res.cancelationReason === FormCancelationReason.UserBusy)) return;
    await new Promise((r) => system.runTimeout(() => r(undefined), 20));
  }
}

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:quests",
      description: "Daily Quests: today's quests, your progress and the time until new ones",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      system.run(() => showQuests(player).catch((e) => console.warn(`[quests] ${e}`)));
      return { status: CustomCommandStatus.Success };
    },
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "quests_bp");
  },
  { namespaces: ["realm"] },
);
