// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "admin_bp";
const PREFIX = "admin";
const TITLE = "Realm Configuration";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "giveToPlayers", type: "bool", scope: "world", label: "Give every player the Realm Configuration item", help: "When they join or respawn without one. Players who aren't operators see only the commands they can use; operator ones are red" },
  { key: "giveToOperators", type: "bool", scope: "world", label: "Give operators the item (when it isn't for everyone)", help: "With the item for every player off: when operators join or respawn without one, and soon after someone becomes an operator" },
  { key: "removeFromOthers", type: "bool", scope: "world", label: "Take the item from others (when it isn't for everyone)", help: "With the item for every player off: take the real item from players who aren't operators" },
  { key: "checkSeconds", type: "int", scope: "world", label: "Check who carries the item every (seconds)", min: 5, max: 300, step: 5 },
  { key: "recentSize", type: "int", scope: "world", label: "Commands kept in Recent", min: 1, max: 20, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
