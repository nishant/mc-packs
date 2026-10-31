// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "durability_bp";
const PREFIX = "durability";
const TITLE = "Low Durability Warning";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "warnPercent", type: "int", scope: "world", label: "Warning at durability left (%)", min: 1, max: 50, step: 1 },
  { key: "criticalPercent", type: "int", scope: "world", label: "Critical warning at durability left (%)", min: 1, max: 25, step: 1 },
  { key: "maxUsesForWarning", type: "int", scope: "world", label: "Skip warnings above this many uses left (0 = always warn)", min: 0, max: 500, step: 10 },
  { key: "chatOnCritical", type: "bool", scope: "world", label: "Critical warnings in chat" },
  { key: "checkIntervalTicks", type: "int", scope: "world", label: "Ticks between durability checks", restart: true },
  { key: "off", type: "bool", scope: "player", default: false, prop: "durability:off", invert: true, label: "Low-durability warnings", help: "The same switch as /realm:durability" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
