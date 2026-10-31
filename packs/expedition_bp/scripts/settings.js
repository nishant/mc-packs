// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "expedition_bp";
const PREFIX = "expedition";
const TITLE = "Expeditions";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "New expeditions can start", help: "A run in progress still finishes" },
  { key: "slots", type: "int", scope: "world", label: "Expeditions at the same time", help: "Each in its own dungeon, east of the site", min: 1, max: 3, step: 1 },
  { key: "maxParty", type: "int", scope: "world", label: "Most players in one expedition", min: 1, max: 4, step: 1 },
  { key: "timeLimitMinutes", type: "int", scope: "world", label: "Time limit for 7 rooms (minutes)", help: "Scaled by each run's room count; applies from the next run", min: 5, max: 60, step: 1 },
  { key: "exitSeconds", type: "int", scope: "world", label: "Seconds to collect the treasure", help: "Opening a chest near the end adds 20 more", min: 10, max: 300, step: 5 },
  { key: "announceFromLevel", type: "enum", scope: "world", label: "Announce clears in chat from", help: "Only the chat line for everyone changes; the party's own message, rewards and progress stay the same", choices: Array.from({ length: 23 }, (_, i) => String(i)), names: ["Easy (every clear)", "Normal", "Hard", ...Array.from({ length: 20 }, (_, i) => `Nightmare ${i + 1}`)] },
  { key: "gauntletEnabled", type: "bool", scope: "world", label: "Gauntlets can start", help: "Long runs with boons" },
  { key: "gauntletRooms", type: "int", scope: "world", label: "Rooms in a Gauntlet", min: 10, max: 20, step: 1 },
  { key: "boonEvery", type: "int", scope: "world", label: "Rooms between Gauntlet sanctuaries", min: 3, max: 8, step: 1 },
  { key: "loadoutDefault", type: "bool", scope: "world", label: "Gauntlets start with Fixed loadout", help: "The leader can switch it before starting" },
  { key: "returnItemsOnDeath", type: "bool", scope: "world", label: "Give back items dropped on death in a dungeon" },
  { key: "relicChance", type: "float", scope: "world", label: "Relic chance for finishing", help: "0 to 1, per player (Relics pack)", min: 0, max: 1, step: 0.05 },
  { key: "maxTier", type: "int", scope: "world", label: "Highest Nightmare tier", min: 1, max: 20, step: 1 },
  { key: "allowBuilding", type: "bool", scope: "world", label: "Players can build in Nightmare dungeons", help: "From buildFromTier; blocks are removed after the run" },
  { key: "useChampionsPack", type: "bool", scope: "world", label: "Champions in waves come from the Champions pack", help: "When it's installed" },
  { key: "mobCap", type: "int", scope: "world", label: "Most dungeon mobs alive at once", min: 6, max: 40, step: 1 },
  { key: "rerollCost", type: "int", scope: "world", label: "Crowns to reroll affixes", min: 0, max: 500, step: 5 },
  { key: "sigilChanceBoss", type: "float", scope: "world", label: "Sigil chance from a boss", help: "0 to 1, plus 1% per tier", min: 0, max: 1, step: 0.05 },
  { key: "sigilChanceChampion", type: "float", scope: "world", label: "Sigil chance from a champion", help: "0 to 1, Nightmare runs", min: 0, max: 1, step: 0.01 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
