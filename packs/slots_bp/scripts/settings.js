// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "slots_bp";
const PREFIX = "slots";
const TITLE = "Slot Machine";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Slot machines", help: "Machines and the Slot Machine item can be played" },
  { key: "currencies.crowns", type: "bool", scope: "world", label: "Crowns as stakes", help: "Spin for Crowns (the Crowns pack's balance)" },
  { key: "currencies.emeralds", type: "bool", scope: "world", label: "Emeralds as stakes", help: "Spin for emeralds from your inventory" },
  { key: "dailyLossLimit.crowns", type: "int", scope: "world", label: "Daily loss limit (Crowns)", help: "Most a player can lose per UTC day; 0 = no limit", min: 0, max: 10000, step: 10 },
  { key: "dailyLossLimit.emeralds", type: "int", scope: "world", label: "Daily loss limit (emeralds)", help: "Most a player can lose per UTC day; 0 = no limit", min: 0, max: 640, step: 1 },
  { key: "cooldownSeconds", type: "int", scope: "world", label: "Seconds between spins", min: 0, max: 30, step: 1 },
  { key: "announceJackpots", type: "bool", scope: "world", label: "Announce jackpots in chat" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
