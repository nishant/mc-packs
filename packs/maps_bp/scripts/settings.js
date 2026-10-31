// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { SLOT_NAMES, SLOTS } from "./side.js";

const PACK = "maps_bp";
const PREFIX = "maps";
const TITLE = "Treasure Maps & Riddles";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "price", type: "int", scope: "world", label: "Treasure map price (Crowns)", min: 0, max: 1000, step: 5 },
  { key: "maxHunts", type: "int", scope: "world", label: "Treasure hunts at once per player", min: 1, max: 3, step: 1 },
  { key: "minDistance", type: "int", scope: "world", label: "Shortest hunt (blocks)", help: "Applies to maps bought from now on", min: 200, max: 5000, step: 100 },
  { key: "maxDistance", type: "int", scope: "world", label: "Longest hunt (blocks)", help: "Applies to maps bought from now on. At least the shortest hunt", min: 200, max: 10000, step: 100 },
  { key: "warmth", type: "bool", scope: "world", label: "Warmer / Colder hints", help: "While holding a Treasure Map, in a Side HUD box or above the hotbar (see below)" },
  { key: "warmthRadius", type: "int", scope: "world", label: "Warmer / Colder range (blocks)", help: "Farther from the marker or chest, the map only says cold, cool or faintly warm", min: 16, max: 512, step: 8 },
  { key: "markers", type: "bool", scope: "world", label: "Build clue markers", help: "A cairn, flag or standing stone at the end of each leg. Disabled: the next clue waits in a bottle" },
  { key: "plainHints", type: "bool", scope: "world", label: "Plain directions in /realm:maps", help: "Shows the compass direction and distance under the riddle" },
  { key: "crownsMin", type: "int", scope: "world", label: "Treasure Crowns (least)", min: 0, max: 1000, step: 5 },
  { key: "crownsMax", type: "int", scope: "world", label: "Treasure Crowns (most)", min: 0, max: 1000, step: 5 },
  { key: "partyShare", type: "int", scope: "world", label: "Party mates' share of the treasure (percent)", help: "Each party mate nearby gets this percent of the Crowns on top; 0 = none", min: 0, max: 100, step: 10 },
  { key: "partyRange", type: "int", scope: "world", label: "Party share range (blocks)", min: 8, max: 128, step: 8 },
  { key: "avoidSpawn", type: "int", scope: "world", label: "No treasure within (blocks of world spawn)", min: 0, max: 1000, step: 16 },
  { key: "showAt", type: "enum", scope: "world", choices: [...SLOTS, "hotbar"], names: [...SLOT_NAMES, "Above the hotbar"], label: "Where Warmer / Colder shows (realm default)", help: "Right and Left 1-4 are boxes from Side HUD (Realm Resources); each pack can take its own, so they show at once. Other add-ons that use the line above the hotbar cannot cover them" },
  { key: "where", type: "enum", scope: "player", lock: [["warmth", false]], base: "showAt", choices: [...SLOTS, "hotbar"], names: [...SLOT_NAMES, "Above the hotbar"], label: "Where Warmer / Colder shows for me", help: "Pick a box no other pack uses so they show at once" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
