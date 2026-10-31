// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "translucent_bp";
const PREFIX = "translucent";
const TITLE = "Translucent Tools";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "translucentTools", type: "bool", scope: "world", label: "Translucent tools (realm default)", help: "What every player has until they choose in /realm:prefs. Needs the Translucent Tools resource pack" },
  { key: "translucent", type: "bool", scope: "player", base: "translucentTools", label: "Translucent tools", help: "Tools, weapons and the shield in your hand are see-through. Disabled: solid, like vanilla. Others see your choice too" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
