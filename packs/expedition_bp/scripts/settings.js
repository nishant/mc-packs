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
  { key: "timeLimitMinutes", type: "int", scope: "world", label: "Time limit (minutes)", help: "Applies from the next run", min: 5, max: 60, step: 1 },
  { key: "exitSeconds", type: "int", scope: "world", label: "Seconds to collect the treasure", min: 10, max: 120, step: 5 },
  { key: "returnItemsOnDeath", type: "bool", scope: "world", label: "Give back items dropped on death in a dungeon" },
  { key: "relicChance", type: "float", scope: "world", label: "Relic chance for finishing", help: "0 to 1, per player (Relics pack)", min: 0, max: 1, step: 0.05 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
