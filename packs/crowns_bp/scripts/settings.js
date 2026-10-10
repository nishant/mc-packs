// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "crowns_bp";
const PREFIX = "crowns";
const TITLE = "Crowns";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "dailyBonus", type: "int", scope: "world", label: "Daily login bonus (Crowns)", help: "Once per UTC day; 0 = none", min: 0, max: 100, step: 1 },
  { key: "startBalance", type: "int", scope: "world", label: "Starting balance (Crowns)", help: "For players joining for the first time", min: 0, max: 1000, step: 5 },
  { key: "marketAnywhere", type: "bool", scope: "world", label: "Market from anywhere", help: "/realm:crowns_market opens the market without visiting a merchant" },
  { key: "marketEnabled", type: "bool", scope: "world", label: "Market", help: "Merchants offer the market, and /realm:crowns_market opens it" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
