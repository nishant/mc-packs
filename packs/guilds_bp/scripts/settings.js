// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "guilds_bp";
const PREFIX = "guilds";
const TITLE = "Guilds & Reputation";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "passive.enabled", type: "bool", scope: "world", label: "Reputation from plain play", help: "Mining ores, harvesting, defeating monsters and traveling slowly earn reputation" },
  { key: "passive.oresPerRep", type: "int", scope: "world", label: "Ores per Miners rep", min: 1, max: 1000, step: 1 },
  { key: "passive.cropsPerRep", type: "int", scope: "world", label: "Crops per Growers rep", min: 1, max: 1000, step: 1 },
  { key: "passive.killsPerRep", type: "int", scope: "world", label: "Monsters per Wardens rep", min: 1, max: 1000, step: 1 },
  { key: "passive.blocksPerRep", type: "int", scope: "world", label: "Blocks traveled per Wayfarers rep", min: 10, max: 10000, step: 10 },
  { key: "perks.enabled", type: "bool", scope: "world", label: "Guild perks", help: "Haste, extra crops, Strength and Speed for higher ranks" },
  { key: "perkRank", type: "int", scope: "world", label: "Rank for the perks", help: "1 = Initiate, 3 = Journeyman, 5 = Master", min: 1, max: 5, step: 1 },
  { key: "repNotes", type: "bool", scope: "player", default: true, label: "Reputation notes in chat", help: "A chat line when a quest or bounty earns you reputation" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
