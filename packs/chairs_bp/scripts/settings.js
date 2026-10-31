// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "chairs_bp";
const PREFIX = "chairs";
const TITLE = "Chairs";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "maxReach", type: "float", scope: "world", label: "Seat reach (blocks)", min: 1, max: 5, step: 0.5 },
  { key: "cleanupTicks", type: "int", scope: "world", label: "Ticks between empty-seat cleanups", restart: true },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
