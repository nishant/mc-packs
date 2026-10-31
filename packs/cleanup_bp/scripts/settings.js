// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "cleanup_bp";
const PREFIX = "cleanup";
const TITLE = "Lag Cleanup";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Automatic cleanup", help: "Clear dropped items after a warning when there are too many. Disabled: only /realm:cleanup clears them" },
  { key: "threshold", type: "int", scope: "world", label: "Dropped items that start a cleanup", help: "All dimensions together", min: 100, max: 5000, step: 100 },
  { key: "checkSeconds", type: "int", scope: "world", label: "Seconds between counts", min: 10, max: 600, step: 10 },
  { key: "warnSeconds", type: "int", scope: "world", label: "Warning before clearing (seconds)", min: 0, max: 120, step: 5 },
  { key: "keepNearPlayers", type: "bool", scope: "world", label: "Keep items near players" },
  { key: "nearPlayerRadius", type: "int", scope: "world", label: "Near a player means within (blocks)", min: 1, max: 16, step: 1 },
  { key: "keepDeathDropsMinutes", type: "int", scope: "world", label: "Keep a dead player's drops for (minutes, 0 = don't)", help: "Items within 8 blocks of where a player died", min: 0, max: 30, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
