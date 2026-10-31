// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "night_bp";
const PREFIX = "night";
const TITLE = "Aurora & Shooting Stars";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Night sky show", help: "Shooting stars and the aurora on clear nights" },
  { key: "stars.enabled", type: "bool", scope: "world", label: "Shooting stars" },
  { key: "storyEvents", type: "bool", scope: "world", label: "Story events", help: "Story Questlines can send a shooting star at story moments (at night under a clear sky)" },
  { key: "wish.enabled", type: "bool", scope: "world", label: "Wishes on shooting stars", help: "Sneak right after a shooting star, once a night" },
  { key: "aurora.enabled", type: "bool", scope: "world", label: "Aurora over snowy ground" },
  { key: "aurora.chance", type: "float", scope: "world", label: "Chance a night is an aurora night", min: 0, max: 1, step: 0.05 },
  { key: "wish.windowSeconds", type: "int", scope: "world", label: "Seconds to make a wish after a star", min: 1, max: 10, step: 1 },
  { key: "defaultOn", type: "bool", scope: "world", label: "Night sky show for new players", help: "For players who never chose with /realm:night" },
  { key: "sky", type: "bool", scope: "player", lock: [["enabled", false]], base: "defaultOn", label: "Night sky show (aurora and shooting stars)", help: "The same switch as /realm:night" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
