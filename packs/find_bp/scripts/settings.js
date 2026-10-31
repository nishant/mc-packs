// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "find_bp";
const PREFIX = "find";
const TITLE = "Chest Finder";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "liveScanRadius", type: "int", scope: "world", label: "Live scan radius (blocks)", help: "Containers this close are read fresh; farther ones come from the index", min: 0, max: 32, step: 2 },
  { key: "maxResults", type: "int", scope: "world", label: "Results shown", min: 5, max: 50, step: 5 },
  { key: "highlightSeconds", type: "int", scope: "world", label: "Highlight time (seconds)", min: 3, max: 60, step: 1 },
  { key: "privateIndex", type: "bool", scope: "world", label: "Private index", help: "Enabled: players find only containers they opened. Disabled: anyone finds any remembered container they may open" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
