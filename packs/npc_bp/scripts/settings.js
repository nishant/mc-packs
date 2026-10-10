// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "npc_bp";
const PREFIX = "npc";
const TITLE = "Townsfolk";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Townsfolk turn, chat and keep a routine", help: "Taps and menus work either way" },
  { key: "faceRange", type: "int", scope: "world", label: "Turn to players within (blocks)", help: "0 = never turn", min: 0, max: 16, step: 1 },
  { key: "idleMinSeconds", type: "int", scope: "world", label: "Idle lines at least every (seconds)", min: 10, max: 600, step: 5 },
  { key: "idleMaxSeconds", type: "int", scope: "world", label: "Idle lines at most every (seconds)", min: 10, max: 600, step: 5 },
  { key: "nightRoutine", type: "bool", scope: "world", label: "Go home at night", help: "Only townsfolk with a home set by /realm:npc_home" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
