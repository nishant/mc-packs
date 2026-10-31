// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "wander_bp";
const PREFIX = "wander";
const TITLE = "Wanderers of the Wilds";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Wanderers appear", help: "Disabled, nobody new appears and camps stay empty" },
  { key: "scheduleTicks", type: "int", scope: "world", label: "Ticks between rolls (1200 = a minute)", min: 200, max: 12000, step: 200, restart: true },
  { key: "rollChance", type: "float", scope: "world", label: "Chance someone appears each minute", help: "0.07 = 7%: about 2 meetings an hour of exploring", min: 0, max: 1, step: 0.01 },
  { key: "spawnDistance", type: "int", scope: "world", label: "Nobody closer to world spawn than (blocks)", min: 0, max: 5000, step: 50 },
  { key: "zoneDistance", type: "int", scope: "world", label: "Nobody closer to a town, claim or safe zone than (blocks)", min: 0, max: 1000, step: 10 },
  { key: "cooldownMinutes", type: "int", scope: "world", label: "Minutes between meetings after a job", min: 1, max: 120, step: 1 },
  { key: "declineCooldownMinutes", type: "int", scope: "world", label: "Minutes between meetings after walking away", min: 1, max: 240, step: 1 },
  { key: "maxOnRoad", type: "int", scope: "world", label: "Most wanderers on the road at once", min: 0, max: 10, step: 1 },
  { key: "hostileShare", type: "float", scope: "world", label: "Share of hostile wanderers (0 to 0.5)", help: "0 = never; only once a player has finished both prologue stories", min: 0, max: 0.5, step: 0.05 },
  { key: "hostileGapMinutes", type: "int", scope: "world", label: "Minutes between hostile wanderers per player", min: 5, max: 600, step: 5 },
  { key: "sparkles", type: "bool", scope: "world", label: "Sparkles over a wanderer with a job for you" },
  { key: "meet", type: "bool", scope: "player", lock: [["enabled", false]], default: true, label: "Meet wanderers", help: "Disabled, nobody appears for you (camps of chains you are on still work)" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
