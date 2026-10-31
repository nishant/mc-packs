// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "leaves_bp";
const PREFIX = "leaves";
const TITLE = "Fast Leaf Decay";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Fast leaf decay", help: "Leaves without a log drop within a few seconds after a log is broken. Disabled: vanilla speed" },
  { key: "leavesPerTick", type: "int", scope: "world", label: "Leaves decayed per tick", help: "Higher clears a canopy faster but costs more at once", min: 1, max: 20, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
