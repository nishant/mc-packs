// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "phantom_bp";
const PREFIX = "phantom";
const TITLE = "Phantom Opt-out";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "defaultOff", type: "bool", scope: "world", invert: true, label: "Phantoms for new players", help: "For players who never chose with /realm:phantoms" },
  { key: "off", type: "bool", scope: "player", base: "defaultOff", prop: "phantom:off", invert: true, label: "Phantoms near me", help: "The same switch as /realm:phantoms" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
