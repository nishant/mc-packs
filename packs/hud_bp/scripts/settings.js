// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { SLOT_NAMES, SLOTS } from "./side.js";

const PACK = "hud_bp";
const PREFIX = "hud";
const TITLE = "Coordinates HUD";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Coordinates HUD", help: "Disabled: nobody sees it, whatever they chose" },
  { key: "defaultOn", type: "bool", scope: "world", label: "Coordinates HUD for new players", help: "For players who never chose with /realm:hud" },
  { key: "showTime", type: "bool", scope: "world", label: "Show the day and time", help: "What players start with; each can change it in /realm:prefs" },
  { key: "eightWay", type: "bool", scope: "world", label: "Facing in 8 directions", help: "Disabled: N, E, S and W only" },
  { key: "intervalTicks", type: "int", scope: "world", label: "Update every (ticks)", restart: true },
  { key: "showAt", type: "enum", scope: "world", choices: ["hotbar", ...SLOTS.slice(0, 8)], names: ["Above the hotbar", ...SLOT_NAMES.slice(0, 8)], label: "Where the HUD shows (realm default)", help: "Above the hotbar, or a Side HUD box (Realm Resources) that other packs' boxes show next to" },
  { key: "on", type: "bool", scope: "player", lock: [["enabled", false]], base: "defaultOn", label: "Coordinates HUD", help: "Your coordinates and facing, above the hotbar or in a side box. The same switch as /realm:hud" },
  { key: "showTime", type: "bool", scope: "player", lock: [["enabled", false]], base: "showTime", label: "HUD shows the day and time" },
  { key: "where", type: "enum", scope: "player", lock: [["enabled", false]], base: "showAt", choices: ["hotbar", ...SLOTS.slice(0, 8)], names: ["Above the hotbar", ...SLOT_NAMES.slice(0, 8)], label: "Where my HUD shows", help: "A Side HUD box can't be covered by other packs' notes above the hotbar" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
