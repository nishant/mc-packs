// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "farm_bp";
const PREFIX = "farm";
const TITLE = "Farm Loader";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "defaultRadius", type: "int", scope: "world", label: "Default farm radius (chunks)", min: 1, max: 4, step: 1 },
  { key: "maxAreas", type: "int", scope: "world", label: "Most farms kept loaded", min: 1, max: 10, step: 1 },
  { key: "everyoneCanAdd", type: "bool", scope: "world", label: "Everyone can add and remove farms", restart: true },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
