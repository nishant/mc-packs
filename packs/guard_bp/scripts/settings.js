// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "guard_bp";
const PREFIX = "guard";
const TITLE = "Creeper Guard";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "mode", type: "enum", scope: "world", choices: ["everywhere", "zones"], names: ["Everywhere", "Only in protected zones"], label: "Creeper blast protection", help: "Where creeper blasts break no blocks. Zones come from /realm:guard_add" },
  { key: "safeZones", type: "bool", scope: "world", label: "Safe zones are protected too", help: "Only protected zones mode: safe zones (/realm:zones), and towns and claims protected from world events, count as zones" },
  { key: "defaultRadius", type: "int", scope: "world", label: "Default zone radius (blocks)", min: 8, max: 256, step: 8 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
