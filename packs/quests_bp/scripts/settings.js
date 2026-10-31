// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "quests_bp";
const PREFIX = "quests";
const TITLE = "Daily Quests";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "resetHourUtc", type: "int", scope: "world", label: "New quests at (hour, UTC)", help: "0 = midnight UTC. Changing it can hand out new quests early once", min: 0, max: 23, step: 1 },
  { key: "questsPerDay", type: "int", scope: "world", label: "Quests per day", help: "Applies from the next day's quests", min: 1, max: 5, step: 1 },
  { key: "progressNotes", type: "bool", scope: "world", label: "Quest progress notes", help: "A note above the hotbar at each quarter of a quest" },
  { key: "skipCreative", type: "bool", scope: "world", label: "Creative mode makes no quest progress" },
  { key: "partyShare", type: "bool", scope: "world", label: "Party mates share defeats", help: "A mob a party mate defeats nearby counts for your Defeat quests too" },
  { key: "partyRange", type: "int", scope: "world", label: "Party share range (blocks)", help: "How near a party mate must be, in the same dimension", min: 8, max: 128, step: 8 },
  { key: "progressNotes", type: "bool", scope: "player", base: "progressNotes", label: "Quest progress notes", help: "A note above the hotbar at each quarter of a quest" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
