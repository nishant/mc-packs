// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "elite_bp";
const PREFIX = "elite";
const TITLE = "Champions";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Champions appear on their own", help: "Disabled, only operators and other packs (the Bounty Board) make champions" },
  { key: "chance", type: "float", scope: "world", label: "Champion chance", help: "Share of hostile night spawns that become champions (0.025 = 1 in 40)", min: 0, max: 0.25, step: 0.005 },
  { key: "bloodMoonMultiplier", type: "float", scope: "world", label: "Blood Moon multiplier", help: "The chance is multiplied by this during a Blood Moon", min: 1, max: 10, step: 0.5 },
  { key: "maxAlive", type: "int", scope: "world", label: "Most champions at once", help: "The ceiling for the whole world; the limit scales with players online (Champions per player online)", min: 1, max: 160, step: 1 },
  { key: "maxAlivePerPlayer", type: "float", scope: "world", label: "Champions per player online", help: "No new natural champions once this many for each player online are loaded, up to Most champions at once. 0 = no per-player limit", min: 0, max: 4, step: 0.1 },
  { key: "maxAliveNearby", type: "int", scope: "world", label: "Most champions in one area", help: "No new natural champion within 64 blocks of this many loaded champions. 0 = no limit", min: 0, max: 16, step: 1 },
  { key: "nightOnly", type: "bool", scope: "world", label: "Only at night" },
  { key: "surfaceOnly", type: "bool", scope: "world", label: "Only under the open sky", help: "Keeps caves and mob farms from making champions" },
  { key: "approach.enabled", type: "bool", scope: "world", label: "Champions come to players", help: "A champion walks slowly toward the nearest player in range. Disabled, they only wander and hunt like ordinary mobs" },
  { key: "approach.range", type: "int", scope: "world", label: "Approach range (blocks)", help: "How far away a champion notices a player and starts coming", min: 16, max: 96, step: 8 },
  { key: "approach.speed", type: "float", scope: "world", label: "Approach pace (blocks per second)", help: "An ordinary zombie walks about 2.3", min: 0.25, max: 3, step: 0.25 },
  { key: "announceRadius", type: "int", scope: "world", label: "Alert radius (blocks)", help: "Players this close get a chat line when a champion appears. 0 = no alerts", min: 0, max: 128, step: 8 },
  { key: "looks.aura", type: "bool", scope: "world", label: "Champion auras", help: "A small particle aura in each champion's trait color" },
  { key: "looks.auraTicks", type: "int", scope: "world", label: "Aura puff interval (ticks)", help: "20 ticks = 1 second. Lower is busier", min: 2, max: 40, step: 2 },
  { key: "looks.gear", type: "bool", scope: "world", label: "Champion helmets", help: "Champions that can wear armor get a helmet that shows their trait. It never drops" },
  { key: "looks.spawnEffect", type: "bool", scope: "world", label: "Champion arrival effect", help: "A spell sound and a burst of the aura when a champion appears" },
  { key: "alerts", type: "bool", scope: "player", lock: [["announceRadius", 0]], default: true, label: "Champion alerts in chat", help: "A chat line when a champion appears near you" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
