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
  { key: "zoneMode", type: "enum", scope: "world", choices: ["pass", "calm", "avoid"], names: ["Passes through them", "Moves nothing inside them", "Steers around them"], label: "Tornadoes and safe zones", help: "A tornado never breaks blocks or touches mobs. This sets what it does to players in safe zones, towns and claims" },
  { key: "density", type: "float", scope: "world", label: "Funnel density", help: "Lower it if the funnel slows devices down", min: 0.25, max: 1.5, step: 0.25 },
  { key: "pullRadius", type: "int", scope: "world", label: "Pull radius (blocks)", help: "Players this close are sucked into the funnel, spun up and shot out the top", min: 4, max: 24, step: 1 },
  { key: "throwPlayers", type: "bool", scope: "world", label: "Suck up & launch players", help: "Players near the funnel (any gamemode) are sucked in, spun around up the funnel and shot high into the sky" },
  { key: "viewDistance", type: "int", scope: "world", label: "Funnel view distance (blocks)", min: 32, max: 192, step: 16 },
  { key: "rings", type: "int", scope: "world", label: "Funnel rings", help: "Rings of vortex clouds stacked up the funnel, for each nearby player", min: 4, max: 32, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
