// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "caravan_bp";
const PREFIX = "caravan";
const TITLE = "Merchant Caravan";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Caravan visits", help: "/realm:caravan_call still works when disabled" },
  { key: "everyDays", type: "int", scope: "world", label: "Comes every (days)", min: 1, max: 30, step: 1 },
  { key: "offsetDays", type: "int", scope: "world", label: "Day shift", help: "Moves the visit day: with every 7 days, 0 = Thursday, 2 = Saturday", min: 0, max: 29, step: 1 },
  { key: "hourUtc", type: "int", scope: "world", label: "Arrives at (hour, UTC)", min: 0, max: 23, step: 1 },
  { key: "stayMinutes", type: "int", scope: "world", label: "Stays for (real minutes)", min: 5, max: 240, step: 5 },
  { key: "stockSize", type: "int", scope: "world", label: "Goods for sale per visit", min: 1, max: 16, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
