// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "rain_bp";
const PREFIX = "rain";
const TITLE = "Rain Extras";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "defaultOff", type: "bool", scope: "world", invert: true, label: "Rain extras for new players", help: "For players who never chose with /realm:rain" },
  { key: "stormFog.enabled", type: "bool", scope: "world", label: "Storm fog", help: "Thicker fog in thunderstorms" },
  { key: "haze.enabled", type: "bool", scope: "world", label: "Vibrant Visuals haze", help: "A darker haze in rain. Vibrant Visuals ignores fog colors, so rain looks pale without it. Fancy is unaffected" },
  { key: "mist.enabled", type: "bool", scope: "world", label: "Ground mist", help: "Low mist in thunderstorms" },
  { key: "drips.enabled", type: "bool", scope: "world", label: "Drips", help: "Drops falling from leaves and roof edges in rain" },
  { key: "wind.enabled", type: "bool", scope: "world", label: "Wind", help: "Gusts in thunderstorms, a breeze in rain, muffled indoors" },
  { key: "wind.inThunder", type: "float", scope: "world", label: "Storm wind volume", min: 0, max: 1, step: 0.05 },
  { key: "wind.inRain", type: "float", scope: "world", label: "Rain breeze volume", min: 0, max: 1, step: 0.05 },
  { key: "stormSound.enabled", type: "bool", scope: "world", label: "Thunderstorm sound", help: "The storm recording plays around you during thunderstorms, muffled indoors" },
  { key: "stormSound.volume", type: "float", scope: "world", label: "Thunderstorm sound volume", min: 0, max: 1, step: 0.05 },
  { key: "roof.enabled", type: "bool", scope: "world", label: "Rain on the roof", help: "Rain drumming on the roof while you're indoors" },
  { key: "roof.volume", type: "float", scope: "world", label: "Rain on the roof volume", min: 0, max: 1, step: 0.05 },
  { key: "roof.muffleRain", type: "bool", scope: "world", label: "Muffled rain indoors", help: "Under a roof the game's rain is stopped for you and you hear it muffled through the roof instead (at the rain on the roof volume); deep underground it's silent" },
  { key: "off", type: "bool", scope: "player", base: "defaultOff", prop: "rain:off", invert: true, label: "Rain extras (fog, haze, mist, drips and sounds)", help: "The same switch as /realm:rain" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
