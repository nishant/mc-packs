// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "atlas_bp";
const PREFIX = "atlas";
const TITLE = "Atlas of the Realm";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Regions and sites", help: "Disabled, no banners, nothing new is built and sites pay nothing (built sites stay)" },
  { key: "banners", type: "bool", scope: "world", label: "Region banners", help: "A title when someone crosses into another region (each player can disable it in /realm:prefs)" },
  { key: "cellSize", type: "int", scope: "world", label: "Region size (blocks)", help: "Never change it once players explore", min: 128, max: 2048, step: 64, restart: true },
  { key: "poiMin", type: "int", scope: "world", label: "Fewest sites per region", min: 0, max: 4, step: 1, restart: true },
  { key: "poiMax", type: "int", scope: "world", label: "Most sites per region", min: 0, max: 4, step: 1, restart: true },
  { key: "buildRange", type: "int", scope: "world", label: "A site is built when someone comes this close", min: 24, max: 128, step: 8 },
  { key: "avoidRadius", type: "int", scope: "world", label: "No sites this close to a town, claim or safe zone", min: 0, max: 512, step: 16 },
  { key: "spawnDistance", type: "int", scope: "world", label: "No sites this close to world spawn", min: 0, max: 2000, step: 16 },
  { key: "blessingMinutes", type: "int", scope: "world", label: "Shrine blessing (minutes)", min: 1, max: 60, step: 1 },
  { key: "banner", type: "bool", scope: "player", lock: [["enabled", false], ["banners", false]], base: "banners", label: "Region banners", help: "A title with the region's name when you cross into another one" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
