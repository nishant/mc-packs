// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG, DEFAULTS } from "./config.js";

const PACK = "news_bp";
const PREFIX = "news";
const TITLE = "Realm News & Tips";
const BASE = { ...DEFAULTS, ...CONFIG };

const PROP_TIP_SETTINGS = "news:tipSettings"; // also written by /realm:news_tips → Settings

/** @returns {Record<string, unknown>} */
function tipSettings() {
  const raw = world.getDynamicProperty(PROP_TIP_SETTINGS);
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Saved with the tip settings, so /realm:news_tips and /realm:config show the same values. @param {string} field */
const inTipSettings = (field) => ({
  read: () => tipSettings()[field],
  write: (/** @type {unknown} */ value) => {
    const next = tipSettings();
    if (value === undefined) delete next[field];
    else next[field] = value;
    world.setDynamicProperty(PROP_TIP_SETTINGS, Object.keys(next).length ? JSON.stringify(next) : undefined);
  },
});

/** @type {Option[]} */
const OPTIONS = [
  { key: "tipsEnabled", type: "bool", scope: "world", label: "Chat tips", ...inTipSettings("enabled") },
  { key: "tipIntervalMinutes", type: "int", scope: "world", label: "Minutes between tips", min: 5, max: 120, step: 5, ...inTipSettings("intervalMinutes") },
  { key: "awayNoticeHours", type: "int", scope: "world", label: "Welcome back after hours away (0 = never)", min: 0, max: 72, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
