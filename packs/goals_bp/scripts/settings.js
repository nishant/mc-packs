// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "goals_bp";
const PREFIX = "goals";
const TITLE = "Community Goals";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "announce", type: "bool", scope: "world", label: "Announce goal progress to everyone", help: "In chat at 25, 50, 75 and 100 percent" },
  { key: "topContributors", type: "int", scope: "world", label: "Top contributors shown", min: 3, max: 20, step: 1 },
  { key: "keepNamedItems", type: "bool", scope: "world", label: "Never donate items with a custom name" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
