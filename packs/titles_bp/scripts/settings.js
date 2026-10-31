// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "titles_bp";
const PREFIX = "titles";
const TITLE = "Titles & Trails";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "forgetAfterDays", type: "int", scope: "world", label: "Forget titles after (days)", help: "A player not seen for this long loses their saved titles, trails and stats. 0 = never", min: 0, max: 3650, step: 5 },
  { key: "enabled", type: "bool", scope: "world", label: "Built-in titles and trails", help: "Disabled: no trails, built-in titles stop counting; other packs' titles are still recorded" },
  { key: "trails", type: "bool", scope: "world", label: "Trails", help: "Particle trails behind players who chose one" },
  { key: "trailTicks", type: "int", scope: "world", label: "Trail puff every (ticks)", help: "20 ticks = 1 second", min: 2, max: 20, step: 1 },
  { key: "trailBudget", type: "int", scope: "world", label: "Trail puffs at a time", help: "Shared by everyone", min: 1, max: 40, step: 1 },
  { key: "announceUnlocks", type: "bool", scope: "world", label: "Announce new titles to everyone" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
