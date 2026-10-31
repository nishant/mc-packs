// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "cooking_bp";
const PREFIX = "cooking";
const TITLE = "Kitchen";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Dish effects", help: "Dishes give their effects when eaten" },
  { key: "durationMultiplier", type: "float", scope: "world", label: "Effect durations (x)", help: "Every dish effect lasts this many times as long", min: 0.25, max: 4, step: 0.25 },
  { key: "rollingDishes", type: "bool", scope: "world", label: "Rolling dishes", help: "Mystery Stew, Hiccup Cookies and Gambler's Goulash roll for a surprise" },
  { key: "championDropChance", type: "int", scope: "world", label: "Champion ingredient chance (%)", help: "Chance that a champion's killer gets a rare ingredient (helpers: half)", min: 0, max: 100, step: 5 },
  { key: "recipeCardChance", type: "int", scope: "world", label: "Recipe card chance (%)", help: "Chance that a champion's killer gets a recipe card", min: 0, max: 100, step: 5 },
  { key: "foragingEnabled", type: "bool", scope: "world", label: "Foraging", help: "Rare ingredients from harvesting, beehives and hunting" },
  { key: "cookAnywhere", type: "bool", scope: "world", label: "Cook anywhere", help: "Cook from /realm:cooking without a cooking pot" },
  { key: "sounds", type: "bool", scope: "player", label: "Cooking sounds", help: "Bubbling and a ding while your dish cooks", default: true },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
