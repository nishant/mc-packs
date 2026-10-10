// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "quests_bp";
const PREFIX = "quests";
const TITLE = "Daily Quests";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "resetHourUtc", type: "int", scope: "world", label: "New quests at (hour, UTC)", help: "0 = midnight UTC. Changing it can hand out new quests early once", min: 0, max: 23, step: 1 },
  { key: "questsPerDay", type: "int", scope: "world", label: "Quests per day", help: "Applies from the next day's quests", min: 1, max: 5, step: 1 },
  { key: "progressNotes", type: "bool", scope: "world", label: "Quest progress notes", help: "A note above the hotbar at each quarter of a quest" },
  { key: "skipCreative", type: "bool", scope: "world", label: "Creative mode makes no quest progress" },
  { key: "progressNotes", type: "bool", scope: "player", base: "progressNotes", label: "Quest progress notes", help: "A note above the hotbar at each quarter of a quest" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
