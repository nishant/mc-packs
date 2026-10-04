import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  WeatherType,
  world,
} from "@minecraft/server";
import { CONFIG } from "./config.js";

const CHECK_TICKS = 20;
const AFK_TICKS = CONFIG.afkMinutes * 60 * 20;
/** After /afk, ignore small movements (closing chat, camera settling) for this long. */
const MANUAL_GRACE_TICKS = 60;

/**
 * @typedef {{ lastActive: number, afkSince?: number, graceUntil: number, yaw: number, pitch: number }} AfkState
 * @type {Map<string, AfkState>}
 */
const players = new Map();

/** @param {Player} player */
function getState(player) {
  let s = players.get(player.id);
  if (!s) {
    const r = player.getRotation();
    s = { lastActive: system.currentTick, graceUntil: 0, yaw: r.y, pitch: r.x };
    players.set(player.id, s);
  }
  return s;
}

/** @param {Player} player */
function isAfk(player) {
  return players.get(player.id)?.afkSince !== undefined;
}

// ---------------------------------------------------------------------------
// Activity tracking
// ---------------------------------------------------------------------------

/** @param {Player} player */
function markActive(player) {
  const s = getState(player);
  if (system.currentTick < s.graceUntil) return;
  s.lastActive = system.currentTick;
  if (s.afkSince !== undefined) setAfk(player, false);
}

/** @param {unknown} entity */
const activeIfPlayer = (entity) => entity instanceof Player && markActive(entity);

world.afterEvents.playerBreakBlock.subscribe((e) => markActive(e.player));
world.afterEvents.playerPlaceBlock.subscribe((e) => markActive(e.player));
world.afterEvents.playerInteractWithBlock.subscribe((e) => markActive(e.player));
world.afterEvents.playerInteractWithEntity.subscribe((e) => markActive(e.player));
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((e) => markActive(e.player));
world.afterEvents.playerButtonInput.subscribe((e) => markActive(e.player));
world.afterEvents.itemUse.subscribe((e) => markActive(e.source));
world.afterEvents.entityHitEntity.subscribe((e) => activeIfPlayer(e.damagingEntity));
world.afterEvents.entityHitBlock.subscribe((e) => activeIfPlayer(e.damagingEntity));

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  // Clean up anything left over from a previous session.
  players.delete(player.id);
  player.nameTag = player.name;
  player.removeTag(CONFIG.tag);
  getState(player);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => players.delete(playerId));

/**
 * @param {Player} player
 * @param {boolean} afk
 */
function setAfk(player, afk) {
  const s = getState(player);
  if (afk === (s.afkSince !== undefined)) return;

  if (afk) {
    s.afkSince = system.currentTick;
    player.nameTag = CONFIG.nameTagPrefix + player.name;
    player.addTag(CONFIG.tag);
    if (CONFIG.announce) world.sendMessage(`§7${player.name} is now AFK`);
  } else {
    const minutes = Math.round((system.currentTick - (s.afkSince ?? system.currentTick)) / 1200);
    s.afkSince = undefined;
    player.nameTag = player.name;
    player.removeTag(CONFIG.tag);
    if (CONFIG.announce) world.sendMessage(`§7${player.name} is back${minutes > 0 ? ` (AFK ${minutes}m)` : ""}`);
  }
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    try {
      const s = getState(player);
      const r = player.getRotation();
      const turned = Math.abs(r.y - s.yaw) > 0.5 || Math.abs(r.x - s.pitch) > 0.5;
      const mv = player.inputInfo.getMovementVector();
      // Movement keys/stick, not position: water streams and minecarts don't count.
      const moving = mv.x !== 0 || mv.y !== 0;
      s.yaw = r.y;
      s.pitch = r.x;

      if (turned || moving) markActive(player);
      else if (s.afkSince === undefined && !player.isSleeping && now - s.lastActive >= AFK_TICKS) setAfk(player, true);
    } catch (e) {
      console.warn(`[afk] ${e}`);
    }
  }
  if (CONFIG.sleep.enabled) checkSleep();
}, CHECK_TICKS);

// ---------------------------------------------------------------------------
// Night skip
// ---------------------------------------------------------------------------

let sleepTicks = 0;
let thundering = false;

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  if (dimension === "minecraft:overworld") thundering = newWeather === WeatherType.Thunder;
});

function checkSleep() {
  const all = world.getAllPlayers();
  const sleeping = all.filter((p) => p.isSleeping);
  if (sleeping.length === 0) {
    sleepTicks = 0;
    return;
  }

  const counted = all.filter(
    (p) =>
      p.isSleeping ||
      (!isAfk(p) && (CONFIG.sleep.countOtherDimensions || p.dimension.id === "minecraft:overworld"))
  );
  const afkCount = all.filter((p) => !p.isSleeping && isAfk(p)).length;
  const needed = Math.max(1, Math.ceil((counted.length * CONFIG.sleep.percent) / 100));

  const status = `§e🛏 ${sleeping.length}/${needed} sleeping${afkCount ? ` §7(${afkCount} AFK ignored)` : ""}`;
  for (const p of all) if (p.dimension.id === "minecraft:overworld") p.onScreenDisplay.setActionBar(status);

  if (sleeping.length < needed) {
    sleepTicks = 0;
    return;
  }
  sleepTicks += CHECK_TICKS;
  if (sleepTicks < CONFIG.sleep.requiredTicks) return;
  sleepTicks = 0;

  const timeOfDay = world.getTimeOfDay();
  const night = timeOfDay >= 12000;
  if (!night && !thundering) return; // vanilla already woke everyone up

  if (night) {
    // Advance to the next morning (keeps the day counter correct, unlike setTimeOfDay).
    world.setAbsoluteTime(world.getAbsoluteTime() - timeOfDay + 24000);
  }
  world.getDimension("overworld").setWeather(WeatherType.Clear);
  thundering = false;
  world.sendMessage(afkCount ? `§e☀ Good morning! §7(${afkCount} AFK player${afkCount > 1 ? "s" : ""} skipped)` : "§e☀ Good morning!");
}

// ---------------------------------------------------------------------------
// /afk:now
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "afk:now",
      description: "Mark yourself as AFK (move to come back)",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      }
      system.run(() => {
        getState(player).graceUntil = system.currentTick + MANUAL_GRACE_TICKS;
        setAfk(player, true);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});
