import {
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  system,
  WeatherType,
  world,
} from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor } from "./settings.js";

const CHECK_TICKS = 20;
/** After /afk, ignore small movements (closing chat, camera settling) for this long. */
const MANUAL_GRACE_TICKS = 60;
/** Stick input below this counts as no input (controller drift). */
const STICK_DEADZONE = 0.1;
/** Vanilla wakes everyone after ~100 ticks asleep. Waiting longer means we never skip a night it's already skipping. */
const MIN_SLEEP_TICKS = 140;

/**
 * @typedef {{ lastActive: number, afkSince?: number, graceUntil: number, yaw: number, pitch: number }} AfkState
 * @type {Map<string, AfkState>}
 */
const players = new Map();

/** @param {Player} player */
function getState(player) {
  let s = players.get(player.id);
  if (!s) {
    // No state yet but still tagged: left over from before a script reload.
    if (player.hasTag(CONFIG.tag)) {
      player.removeTag(CONFIG.tag);
      player.nameTag = player.name;
    }
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

/** AFK and back messages: on for the realm (/realm:config) and not turned off by the player (/realm:prefs). @param {Player} player */
const announces = (player) => get("announce") === true && getFor(player, "announce") === true;

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
    if (announces(player)) world.sendMessage(`§7${player.name} is now AFK`);
  } else {
    const minutes = Math.round((system.currentTick - (s.afkSince ?? system.currentTick)) / 1200);
    s.afkSince = undefined;
    player.nameTag = player.name;
    player.removeTag(CONFIG.tag);
    if (announces(player)) world.sendMessage(`§7${player.name} is back${minutes > 0 ? ` (AFK ${minutes}m)` : ""}`);
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
      const moving = Math.hypot(mv.x, mv.y) > STICK_DEADZONE;
      s.yaw = r.y;
      s.pitch = r.x;

      if (turned || moving) markActive(player);
      else if (player.isSleeping) s.lastActive = now; // lying in bed waiting for the night isn't AFK
      else if (s.afkSince === undefined && !player.isSleeping && now - s.lastActive >= get("afkMinutes") * 60 * 20) setAfk(player, true);
    } catch (e) {
      console.warn(`[afk] ${e}`);
    }
  }
  if (get("sleep.enabled")) checkSleep();
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
      (!isAfk(p) && (get("sleep.countOtherDimensions") || p.dimension.id === "minecraft:overworld"))
  );
  const afkCount = all.filter((p) => !p.isSleeping && isAfk(p)).length;
  const needed = Math.max(1, Math.ceil((counted.length * get("sleep.percent")) / 100));

  // Name the few still awake, so everyone knows who the night is waiting for.
  const awake = counted.filter((p) => !p.isSleeping);
  const names = awake.length && awake.length <= 3 ? ` §7· awake: ${awake.map((p) => p.name).join(", ")}` : "";
  const status = `§e🛏 ${sleeping.length}/${needed} sleeping${names}${afkCount ? ` §7(${afkCount} AFK ignored)` : ""}`;
  for (const p of all) if (p.dimension.id === "minecraft:overworld") p.onScreenDisplay.setActionBar(status);

  if (sleeping.length < needed) {
    sleepTicks = 0;
    return;
  }

  // If vanilla's own rule is met, let vanilla skip the night. Doing it too would
  // race it, and the second skip lands a full day later. Counting every player
  // here is the strictest reading of the gamerule, so if this holds, vanilla
  // skips whichever way it counts.
  const vanillaPercent = world.gameRules.playersSleepingPercentage;
  if (sleeping.length >= Math.max(1, Math.ceil((all.length * vanillaPercent) / 100))) {
    sleepTicks = 0;
    return;
  }

  sleepTicks += CHECK_TICKS;
  if (sleepTicks < Math.max(get("sleep.requiredTicks"), MIN_SLEEP_TICKS)) return;
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
// /realm:afk
// ---------------------------------------------------------------------------

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:afk",
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
        if (!announces(player)) player.sendMessage("§7You're AFK. Move to come back.");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "afk_bp");
  },
  { namespaces: ["realm"] }
);
