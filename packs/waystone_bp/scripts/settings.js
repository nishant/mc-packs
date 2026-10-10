// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "waystone_bp";
const PREFIX = "waystone";
const TITLE = "Waystones & Inns";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "whoCanCreate", type: "enum", scope: "world", label: "Who can make waystones", choices: ["everyone", "operators"], names: ["Everyone", "Operators only"] },
  { key: "currency", type: "enum", scope: "world", label: "Travel is paid in", choices: ["crowns", "levels"], names: ["Crowns", "XP levels"] },
  { key: "costPer100", type: "int", scope: "world", label: "Cost per 100 blocks", min: 0, max: 50, step: 1 },
  { key: "minCost", type: "int", scope: "world", label: "Least a trip costs", min: 0, max: 50, step: 1 },
  { key: "crossDimension", type: "bool", scope: "world", label: "Travel between dimensions" },
  { key: "crossDimensionCost", type: "int", scope: "world", label: "Cost to another dimension", min: 0, max: 200, step: 1 },
  { key: "channelSeconds", type: "int", scope: "world", label: "Seconds to stand still before traveling", min: 0, max: 30, step: 1 },
  { key: "travelAnywhere", type: "bool", scope: "world", label: "Travel from anywhere with /realm:waystones" },
  { key: "bedPrice", type: "int", scope: "world", label: "Inn bed price (Crowns)", min: 0, max: 500, step: 1 },
  { key: "wellRestedMinutes", type: "int", scope: "world", label: "Well Rested lasts (minutes)", min: 0, max: 240, step: 5 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
