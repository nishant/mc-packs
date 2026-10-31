// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "silly_bp";
const PREFIX = "silly";
const TITLE = "Silly Enchants";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Silly effects", help: "Silly enchants on gear play their effects" },
  { key: "maxPerItem", type: "int", scope: "world", label: "Silly enchants per item", min: 1, max: 5, step: 1 },
  { key: "hyperJumpCooldownSeconds", type: "int", scope: "world", label: "Hyper Jump cooldown (seconds)", min: 1, max: 30, step: 1 },
  { key: "hyperJumpSoftLanding", type: "bool", scope: "world", label: "Hyper Jump soft landing", help: "A puff of slow falling just above the ground, so landings don't hurt" },
  { key: "librarianBookLock", type: "bool", scope: "world", label: "Lock a villager to an Enchanted Book as a Novice Librarian", help: "Use an Enchanted Book on a villager to open a confirmation popup and lock them to trading that book" },
  { key: "effects", type: "bool", scope: "player", lock: [["enabled", false]], label: "My silly effects", help: "Your own silly enchants play (they stay on your gear either way)", default: true },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
