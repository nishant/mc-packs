// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "rainbow_bp";
const PREFIX = "rainbow";
const TITLE = "Rainbows & the Pot of Gold";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Rainbows after rain", help: "/realm:rainbow_now works either way" },
  { key: "storyEvents", type: "bool", scope: "world", label: "Story events", help: "Story Questlines can put up a rainbow with its pot of gold at story moments (at most one every 30 minutes)" },
  { key: "chance", type: "float", scope: "world", label: "Chance of a rainbow", help: "0 to 1, when rain clears in the morning or evening", min: 0, max: 1, step: 0.05 },
  { key: "durationSeconds", type: "int", scope: "world", label: "Rainbow lasts (seconds)", min: 30, max: 600, step: 30 },
  { key: "potMinutes", type: "int", scope: "world", label: "Pot of gold can be found for (minutes)", min: 3, max: 60, step: 1 },
  { key: "crowns", type: "int", scope: "world", label: "Crowns for finding the pot of gold", min: 0, max: 1000, step: 5 },
  { key: "relicChance", type: "float", scope: "world", label: "Chance the pot of gold holds a relic", help: "Needs the Relics pack", min: 0, max: 1, step: 0.05 },
  { key: "avoidSpawn", type: "int", scope: "world", label: "Distance kept from world spawn (blocks)", min: 0, max: 1024, step: 16 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
