// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "fishing_bp";
const PREFIX = "fishing";
const TITLE = "Fishing 2.0";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Fish species", help: "Vanilla fish caught with a rod become a species with a size" },
  { key: "announceLegendary", type: "bool", scope: "world", label: "Announce legendary catches", help: "Tell everyone in chat when someone catches a legendary fish" },
  { key: "tournamentEnabled", type: "bool", scope: "world", label: "Weekly tournament" },
  { key: "tournamentDay", type: "int", scope: "world", label: "Tournament day (UTC)", help: "0 = Sunday, 1 = Monday ... 6 = Saturday", min: 0, max: 6, step: 1 },
  { key: "tournamentHourUtc", type: "int", scope: "world", label: "Tournament starts at (hour, UTC)", min: 0, max: 23, step: 1 },
  { key: "tournamentMinutes", type: "int", scope: "world", label: "Tournament length (minutes)", min: 10, max: 180, step: 5 },
  { key: "measure", type: "bool", scope: "player", lock: [["enabled", false]], default: false, label: "Separate named items per species", help: "Disabled (default): all caught fish (common, rare/shiny, or record) stack together as plain cod, salmon, tropical fish and pufferfish, while your log, records and Old Tobin still remember every catch. Enabled: each species has its own colored name and lore" },
  { key: "notableOnly", type: "bool", scope: "player", lock: [["enabled", false]], default: false, label: "Only measure notable catches", help: "A catch that isn't a new species, a personal best or a realm record comes as a plain fish that stacks" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
