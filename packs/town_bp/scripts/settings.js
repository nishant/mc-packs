// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "town_bp";
const PREFIX = "town";
const TITLE = "Town Projects";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "announce", type: "bool", scope: "world", label: "Announce finished projects to everyone", help: "In chat, with a title when a town levels up" },
  { key: "fireworks", type: "bool", scope: "world", label: "Fireworks over a finished project" },
  { key: "deliverWithCommand", type: "bool", scope: "world", label: "Deliver with /realm:town in a town", help: "Without visiting the mayor" },
  { key: "keepNamedItems", type: "bool", scope: "world", label: "Never deliver items with a custom name" },
  { key: "townRadius", type: "int", scope: "world", label: "Town radius (blocks)", help: "How close to a town's center its mayor and commands work", min: 32, max: 256, step: 16 },
  { key: "repPerProject", type: "int", scope: "world", label: "Guild reputation per finished project", min: 0, max: 100, step: 5 },
  { key: "townMayors", type: "bool", scope: "world", label: "A mayor for each town", help: "Townsfolk: each town gets its own mayor NPC" },
  { key: "autoSpots", type: "bool", scope: "world", label: "Pick project spots automatically", help: "Spots operators set are kept and never leveled" },
  { key: "levelDepth", type: "int", scope: "world", label: "Most blocks a picked spot's ground is leveled", help: "Natural ground only, cut or filled; 0 never levels", min: 0, max: 3, step: 1 },
  { key: "outlineSeconds", type: "int", scope: "world", label: "Outline shown before a build (seconds)", help: "To players within 32 blocks; 0 shows none", min: 0, max: 15, step: 1 },
  { key: "houses", type: "bool", scope: "world", label: "Towns build houses from level 2", help: "One for each family the level brings, at picked spots" },
  { key: "townLife", type: "bool", scope: "world", label: "Paths, lanterns and a garden pen", help: "Placed once as towns grow; only grass becomes path" },
  { key: "residents", type: "bool", scope: "world", label: "Residents move into towns", help: "Villagers that never take players' beds or job sites" },
  { key: "residentCapWorld", type: "int", scope: "world", label: "Most residents in the world", help: "Each is a mob; lowering it removes nobody", min: 0, max: 40, step: 2 },
  { key: "residentsTrade", type: "bool", scope: "world", label: "Residents trade", help: "Vanilla trading bypasses the Crowns economy" },
  { key: "replaceMinutes", type: "int", scope: "world", label: "Minutes before a new family replaces one", help: "In-game minutes; 20 is one in-game day", min: 5, max: 120, step: 5 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
