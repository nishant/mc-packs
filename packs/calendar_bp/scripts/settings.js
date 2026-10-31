// What Realm Settings (/realm:config) can change in this pack. The pack reads these options with get()
// instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "calendar_bp";
const PREFIX = "cal";
const TITLE = "Realm Calendar";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "festivals", type: "bool", scope: "world", label: "Festivals", help: "The four festivals, their activities, Festival Ribbons and the ribbon stall (the calendar itself always runs)" },
  { key: "announce", type: "bool", scope: "world", label: "Announce festivals", help: "A title and a chat line for everyone when a festival starts and ends" },
  { key: "activityMax", type: "int", scope: "world", label: "Times each activity counts per festival", min: 1, max: 10, step: 1 },
  { key: "ribbonCap", type: "int", scope: "world", label: "Most Festival Ribbons per festival", min: 0, max: 64, step: 1 },
  { key: "crownCap", type: "int", scope: "world", label: "Most Crowns per festival", min: 0, max: 2000, step: 10 },
  { key: "sieges", type: "bool", scope: "world", label: "Choir sieges", help: "The Gray Choir besieges a town at night now and then" },
  { key: "siegeChance", type: "int", scope: "world", label: "Siege chance per night (percent)", help: "Doubled during the Lantern Fair; none on the Long Night", min: 0, max: 100, step: 5 },
  { key: "siegeMinPlayers", type: "int", scope: "world", label: "Players online for a siege", help: "Non-AFK, in the Overworld (or one who has finished Act II)", min: 1, max: 10, step: 1 },
  { key: "siegeGapDays", type: "int", scope: "world", label: "Realm days between sieges", min: 1, max: 48, step: 1 },
  { key: "warnMinutes", type: "int", scope: "world", label: "Siege warning (minutes)", min: 0, max: 10, step: 1 },
  { key: "siegeMinutes", type: "int", scope: "world", label: "Minutes to silence the circles", min: 4, max: 30, step: 1 },
  { key: "spareSafeTowns", type: "bool", scope: "world", label: "Spare towns kept safe from world events", help: "Enabled, towns with Protect from world events (Town Projects) are never besieged" },
  { key: "bellHits", type: "int", scope: "world", label: "Hits to silence a bell", min: 1, max: 20, step: 1 },
  { key: "heldCrowns", type: "int", scope: "world", label: "Crowns for holding a town", min: 0, max: 500, step: 5 },
  { key: "failedCrowns", type: "int", scope: "world", label: "Crowns for a lost siege", min: 0, max: 500, step: 5 },
  { key: "moodHours", type: "int", scope: "world", label: "Hours a town stays Heartened or Shaken", min: 1, max: 168, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
