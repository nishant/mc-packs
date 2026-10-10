// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "tornado_bp";
const PREFIX = "tornado";
const TITLE = "Tornadoes";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Tornadoes in thunderstorms", help: "/realm:tornado_spawn works either way" },
  { key: "chance", type: "float", scope: "world", label: "Chance a thunderstorm brings a tornado", help: "0 to 1, rolled when the thunderstorm starts", min: 0, max: 1, step: 0.05 },
  { key: "avoidSpawn", type: "int", scope: "world", label: "Distance kept from world spawn (blocks)", min: 0, max: 512, step: 16 },
  { key: "density", type: "float", scope: "world", label: "Funnel density", help: "Lower it if the funnel slows devices down", min: 0.25, max: 1.5, step: 0.25 },
  { key: "pullRadius", type: "int", scope: "world", label: "Pull radius (blocks)", help: "Mobs, items and players this close are pulled in and lifted", min: 4, max: 24, step: 1 },
  { key: "throwPlayers", type: "bool", scope: "world", label: "Throw players", help: "Players close to the funnel are thrown a few blocks and land with Slow Falling" },
  { key: "viewDistance", type: "int", scope: "world", label: "Funnel view distance (blocks)", min: 32, max: 192, step: 16 },
  { key: "rings", type: "int", scope: "world", label: "Funnel rings per player", help: "Every 2 ticks, for each nearby player", min: 4, max: 24, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
