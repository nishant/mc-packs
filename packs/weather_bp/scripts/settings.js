// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "weather_bp";
const PREFIX = "weather";
const TITLE = "Weather Almanac";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Weather Almanac runs the weather", help: "Disabled, the doWeatherCycle gamerule goes back to how it was and the game's own weather takes over" },
  { key: "storyEvents", type: "bool", scope: "world", label: "Story events", help: "Story Questlines can ask for rain or a thunderstorm at story moments: it's planned in the forecast (at most one every 20 minutes)" },
  { key: "clear.minMinutes", type: "int", scope: "world", label: "Shortest clear spell (real minutes)", help: "Applies from the next spell", min: 1, max: 600, step: 1 },
  { key: "clear.maxMinutes", type: "int", scope: "world", label: "Longest clear spell (real minutes)", help: "Applies from the next spell", min: 1, max: 600, step: 1 },
  { key: "rain.minMinutes", type: "int", scope: "world", label: "Shortest rain (real minutes)", min: 1, max: 240, step: 1 },
  { key: "rain.maxMinutes", type: "int", scope: "world", label: "Longest rain (real minutes)", min: 1, max: 240, step: 1 },
  { key: "thunder.minMinutes", type: "int", scope: "world", label: "Shortest thunderstorm (real minutes)", min: 1, max: 240, step: 1 },
  { key: "thunder.maxMinutes", type: "int", scope: "world", label: "Longest thunderstorm (real minutes)", min: 1, max: 240, step: 1 },
  { key: "thunderAfterClear", type: "float", scope: "world", label: "Chance a clear spell ends in thunder", help: "Instead of rain", min: 0, max: 1, step: 0.05 },
  { key: "thunderAfterRain", type: "float", scope: "world", label: "Chance rain builds into thunder", help: "Instead of clearing", min: 0, max: 1, step: 0.05 },
  { key: "rainAfterThunder", type: "float", scope: "world", label: "Chance thunder eases into rain", help: "Instead of clearing", min: 0, max: 1, step: 0.05 },
  { key: "dailyForecast", type: "bool", scope: "world", label: "Daily forecast in chat", help: "When a player first joins each day (UTC)" },
  { key: "dailyForecast", type: "bool", scope: "player", lock: [["enabled", false]], base: "dailyForecast", label: "Daily forecast in chat", help: "A one-line forecast the first time you join each day (UTC)" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
