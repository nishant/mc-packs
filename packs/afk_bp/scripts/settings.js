// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "afk_bp";
const PREFIX = "afk";
const TITLE = "AFK + Smart Sleep";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "afkMinutes", type: "int", scope: "world", label: "Minutes idle before AFK", min: 1, max: 60, step: 1 },
  { key: "announce", type: "bool", scope: "world", label: "AFK announcements in chat", help: "Posts when a player goes AFK and comes back" },
  { key: "sleep.enabled", type: "bool", scope: "world", label: "Smart sleep", help: "AFK players don't block skipping the night" },
  { key: "sleep.percent", type: "int", scope: "world", label: "Sleepers needed to skip the night (%)", min: 5, max: 100, step: 5 },
  { key: "sleep.countOtherDimensions", type: "bool", scope: "world", label: "Players in the Nether and End count toward sleep", help: "Like vanilla: they can't sleep, so the night waits for them" },
  { key: "sleep.requiredTicks", type: "int", scope: "world", label: "Ticks asleep before the night skips (20 = 1 s)", min: 140, max: 600, step: 20 },
  { key: "announce", type: "bool", scope: "player", lock: [["announce", false]], base: "announce", label: "Announce when I go AFK", help: "Only while the realm has AFK announcements enabled" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
