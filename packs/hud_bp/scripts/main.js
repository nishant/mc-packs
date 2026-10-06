import { CommandPermissionLevel, CustomCommandStatus, Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { get, getFor, onChange, setFor } from "./settings.js";

// The "on" and "showTime" preferences (player property "hud:pref") and the world options live in settings.js.

const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const COMPASS_4 = ["N", "E", "S", "W"];
/** The fastest the HUD may update: twice a second. */
const MIN_INTERVAL = 10;

/** player id -> { text, at } of what was last shown */
const shown = new Map();
/** player id -> tick until which another pack's action bar message is left alone */
const pausedUntil = new Map();

/** @param {Player} player */
const hudFor = (player) => get("enabled") === true && getFor(player, "on") === true;

/** @param {Player} player */
function facing(player) {
  const north = (player.getRotation().y + 180 + 360) % 360; // yaw 180 = north, -90 = east, 0 = south, 90 = west
  const names = get("eightWay") === true ? COMPASS_8 : COMPASS_4;
  return names[Math.round(north / (360 / names.length)) % names.length];
}

function clock() {
  const t = world.getTimeOfDay(); // 0 = 6:00 AM, 6000 = noon, 18000 = midnight
  const hours = (Math.floor(t / 1000) + 6) % 24;
  // In 10-minute steps: a clock that ticks every in-game minute would redraw the bar every 17 ticks.
  const minutes = Math.floor(((t % 1000) * 6) / 1000) * 10;
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** @param {Player} player */
function hudText(player) {
  const at = player.location;
  let text = `§7XYZ §f${Math.floor(at.x)} ${Math.floor(at.y)} ${Math.floor(at.z)}  §7Facing §f${facing(player)}`;
  if (getFor(player, "showTime") === true) text += `  §7Day §f${world.getDay() + 1} §7at §f${clock()}`;
  return text;
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    try {
      if (!hudFor(player)) continue;
      if ((pausedUntil.get(player.id) ?? 0) > now) continue;
      const text = hudText(player);
      const last = shown.get(player.id);
      if (last && last.text === text && now - last.at < CONFIG.refreshTicks) continue;
      player.onScreenDisplay.setActionBar(text);
      shown.set(player.id, { text, at: now });
    } catch (e) {
      console.warn(`[hud] ${e}`);
    }
  }
}, Math.max(MIN_INTERVAL, CONFIG.intervalTicks));

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  shown.delete(playerId);
  pausedUntil.delete(playerId);
});

// Turning the HUD off (here, in /realm:prefs, or for the whole realm) clears it right away.
onChange((key, player) => {
  const players = player ? [player] : world.getAllPlayers();
  for (const p of players) {
    const had = shown.delete(p.id);
    if (had && !hudFor(p)) p.onScreenDisplay.setActionBar("");
  }
});

// Packs that show a short message on the action bar can ask the HUD to leave it alone for a moment:
//   /scriptevent realm:actionbar {"player":"<player id>","ticks":40}
system.afterEvents.scriptEventReceive.subscribe(
  ({ id, message }) => {
    if (id !== "realm:actionbar") return;
    try {
      const req = JSON.parse(message);
      if (!req || typeof req.player !== "string") return;
      const ticks = Math.min(Math.max(Number(req.ticks) || 40, 0), 200);
      pausedUntil.set(req.player, system.currentTick + ticks);
      shown.delete(req.player); // redraw as soon as the pause ends
    } catch {
      // not for us
    }
  },
  { namespaces: ["realm"] }
);

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "realm:hud",
      description: "Show or hide your coordinates, facing and the time above the hotbar",
      permissionLevel: CommandPermissionLevel.Any,
      cheatsRequired: false,
    },
    (origin) => {
      const player = origin.initiator ?? origin.sourceEntity;
      if (!(player instanceof Player)) {
        return { status: CustomCommandStatus.Failure, message: "Must be run by a player." };
      }
      if (get("enabled") !== true) {
        return {
          status: CustomCommandStatus.Failure,
          message: "The coordinates HUD is disabled on this realm. An operator can enable it in /realm:config (Coordinates HUD).",
        };
      }
      const nowOn = getFor(player, "on") !== true;
      system.run(() => setFor(player, "on", nowOn));
      return {
        status: CustomCommandStatus.Success,
        message: nowOn
          ? "Coordinates HUD: Enabled. Run /realm:hud again to hide it. The day and time can be hidden in /realm:prefs."
          : "Coordinates HUD: Disabled. Run /realm:hud again to show it.",
      };
    }
  );
});

// /realm:help lists this pack while it's installed: answer its ping with the folder name.
system.afterEvents.scriptEventReceive.subscribe(
  ({ id }) => {
    if (id === "realm:help_ping") system.sendScriptEvent("realm:help_pong", "hud_bp");
  },
  { namespaces: ["realm"] }
);
