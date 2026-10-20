import "./diag.js";
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
import { onScriptEvent } from "./script-events.js";
import { spreadPlayers } from "./spread.js";

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

/** The name tag without our AFK prefix (another pack, such as Nicknames, may have set it). @param {Player} player */
function baseNameTag(player) {
  const tag = player.nameTag;
  const base = tag.startsWith(CONFIG.nameTagPrefix) ? tag.slice(CONFIG.nameTagPrefix.length) : tag;
  return base || player.name;
}

/** Tells the Nicknames pack the name tag or the AFK tag changed, so it puts its own name tag right at once. @param {Player} player */
const tellNameTag = (player) => system.sendScriptEvent("realm:nametag", JSON.stringify({ player: player.id, from: "afk_bp" }));

/** Takes our AFK prefix off the name tag, keeping whatever else is there (a nickname or title). @param {Player} player */
function clearNameTag(player) {
  if (player.nameTag.startsWith(CONFIG.nameTagPrefix)) player.nameTag = baseNameTag(player);
}

/** @param {Player} player */
function getState(player) {
  let s = players.get(player.id);
  if (!s) {
    // No state yet but still tagged: left over from before a script reload.
    if (player.hasTag(CONFIG.tag)) player.removeTag(CONFIG.tag);
    clearNameTag(player);
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
  try {
    clearNameTag(player);
    player.removeTag(CONFIG.tag);
    getState(player);
  } catch (e) {
    console.warn(`[afk] ${e}`);
  }
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
    // Prefix the current tag rather than the gamertag, so a nickname or title stays.
    player.nameTag = CONFIG.nameTagPrefix + baseNameTag(player);
    player.addTag(CONFIG.tag);
    tellNameTag(player);
    if (announces(player)) world.sendMessage(`§7${player.name} is now AFK`);
  } else {
    const minutes = Math.round((system.currentTick - (s.afkSince ?? system.currentTick)) / 1200);
    s.afkSince = undefined;
    player.removeTag(CONFIG.tag);
    clearNameTag(player);
    tellNameTag(player);
    if (announces(player)) world.sendMessage(`§7${player.name} is back${minutes > 0 ? ` (AFK ${minutes}m)` : ""}`);
  }
}

// Each player once a second (CHECK_TICKS) as before, a tenth of them every 2 ticks (scripts/spread.js), so a full
// server doesn't read everyone's rotation and input on one tick. The night skip is counted once a second.
spreadPlayers(system, world, {
  every: CHECK_TICKS,
  parts: 10,
  start: () => {
    try {
      if (get("sleep.enabled")) checkSleep();
    } catch (e) {
      console.warn(`[afk] sleep: ${e}`);
    }
  },
  visit: (share) => {
    const now = system.currentTick;
    for (const player of share) {
      try {
        const s = getState(player);
        const r = player.getRotation();
        const turned = Math.abs(r.y - s.yaw) > 0.5 || Math.abs(r.x - s.pitch) > 0.5;
        s.yaw = r.y;
        s.pitch = r.x;
        // Movement keys/stick, not position: water streams and minecarts don't count. Not read when turning already counts.
        let moving = false;
        if (!turned) {
          const mv = player.inputInfo.getMovementVector();
          moving = Math.hypot(mv.x, mv.y) > STICK_DEADZONE;
        }

        if (turned || moving) markActive(player);
        else if (player.isSleeping) s.lastActive = now; // lying in bed waiting for the night isn't AFK
        else if (s.afkSince === undefined && now - s.lastActive >= get("afkMinutes") * 60 * 20) setAfk(player, true);
      } catch (e) {
        console.warn(`[afk] ${e}`);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Night skip
// ---------------------------------------------------------------------------

let sleepTicks = 0;
/** Weather can't be read, only watched: saved so a storm that started before a restart is still known. */
const PROP_THUNDER = "afk:thunder";
/** @type {boolean | undefined} undefined until read from the world */
let thundering;

function isThundering() {
  if (thundering === undefined) {
    try {
      thundering = world.getDynamicProperty(PROP_THUNDER) === true;
    } catch {
      return false;
    }
  }
  return thundering;
}

/** @param {boolean} value */
function setThundering(value) {
  thundering = value;
  try {
    world.setDynamicProperty(PROP_THUNDER, value || undefined);
  } catch (e) {
    console.warn(`[afk] ${e}`);
  }
}

world.afterEvents.weatherChange.subscribe(({ dimension, newWeather }) => {
  // BDS 1.26 sends "overworld" here, without the "minecraft:" other events use: accept both.
  if (dimension === "minecraft:overworld" || dimension === "overworld") setThundering(newWeather === WeatherType.Thunder);
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
  const names = awake.length && awake.length <= 3 ? ` §7- awake: ${awake.map((p) => p.name).join(", ")}` : "";
  const status = `§eZzz ${sleeping.length}/${needed} sleeping${names}${afkCount ? ` §7(${afkCount} AFK ignored)` : ""}`;
  for (const p of all) {
    try {
      if (p.dimension.id !== "minecraft:overworld") continue;
      // The action bar protocol: other bar writers (the Coordinates HUD...) leave the status alone until the next check.
      system.sendScriptEvent("realm:actionbar", JSON.stringify({ player: p.id, ticks: CHECK_TICKS * 2, from: "afk_bp" }));
      p.onScreenDisplay.setActionBar(status);
    } catch {
      // left meanwhile: the night still gets its count
    }
  }

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
  if (!night && !isThundering()) return; // vanilla already woke everyone up

  if (night) {
    // Advance to the next morning (keeps the day counter correct, unlike setTimeOfDay).
    world.setAbsoluteTime(world.getAbsoluteTime() - timeOfDay + 24000);
  }
  world.getDimension("overworld").setWeather(WeatherType.Clear);
  setThundering(false);
  world.sendMessage(afkCount ? `§eGood morning! §7(${afkCount} AFK player${afkCount > 1 ? "s" : ""} skipped)` : "§eGood morning!");
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
        if (!player.isValid) return; // left meanwhile
        // Already AFK: say so, since nothing else would answer (the AFK announcement went out the first time).
        if (isAfk(player)) return player.sendMessage("§7You're already AFK. Move to come back.");
        getState(player).graceUntil = system.currentTick + MANUAL_GRACE_TICKS;
        setAfk(player, true);
        if (!announces(player)) player.sendMessage("§7You're AFK. Move to come back.");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
onScriptEvent(
  "realm:help_ping",
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "afk_bp");
  },
);
