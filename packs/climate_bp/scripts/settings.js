// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "climate_bp";
const PREFIX = "climate";
const TITLE = "Regional Weather";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Regional weather", help: "Sandstorms, blizzards and fog banks" },
  { key: "slowness", type: "bool", scope: "world", label: "Slowness in sandstorms and blizzards", help: "Slowness I; in a sandstorm only without a helmet" },
  { key: "sandstorm.enabled", type: "bool", scope: "world", label: "Sandstorms", help: "Rain over deserts and badlands" },
  { key: "sandstorm.helmetProtects", type: "bool", scope: "world", label: "A helmet keeps sandstorm Slowness away" },
  { key: "blizzard.enabled", type: "bool", scope: "world", label: "Blizzards", help: "Rain or thunder over snow and ice" },
  { key: "blizzard.campfireRadius", type: "int", scope: "world", label: "Campfire shelter (blocks)", help: "A lit campfire this close keeps the blizzard off", min: 1, max: 8, step: 1 },
  { key: "fogbank.enabled", type: "bool", scope: "world", label: "Morning fog banks", help: "By the water at dawn after rain" },
  { key: "fogbank.minutesAfterRain", type: "int", scope: "world", label: "Fog bank window after rain (real minutes)", min: 5, max: 120, step: 5 },
  { key: "particlesPerSecond", type: "int", scope: "world", label: "Sand and snow bursts per second", min: 0, max: 5, step: 1 },
  { key: "visuals", type: "bool", scope: "player", default: true, label: "Sandstorm, blizzard and fog bank visuals", help: "The fog and particles; the same switch as /realm:climate. Slowness still applies" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
