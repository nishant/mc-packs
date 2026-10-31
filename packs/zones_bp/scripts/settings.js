// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "zones_bp";
const PREFIX = "zones";
const TITLE = "Safe Zones";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "defaultRadius", type: "int", scope: "world", label: "New zone radius (blocks)", help: "Where the radius slider starts", min: 8, max: 512, step: 8 },
  { key: "maxRadius", type: "int", scope: "world", label: "Largest zone radius (blocks)", min: 8, max: 512, step: 8 },
  { key: "playersCreate", type: "bool", scope: "world", label: "Players can add safe zones", help: "Not only operators: each player up to the limits below" },
  { key: "playerMaxZones", type: "int", scope: "world", label: "Safe zones per player", min: 1, max: 10, step: 1 },
  { key: "playerMaxRadius", type: "int", scope: "world", label: "Largest radius for players (blocks)", min: 8, max: 512, step: 8 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
