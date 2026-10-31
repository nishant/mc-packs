// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { DEFAULTS } from "./config.js";

const PACK = "welcome_bp";
const PREFIX = "welcome";
const TITLE = "Welcome Message";
const BASE = DEFAULTS;

const PROP_SETTINGS = "welcome:settings"; // also written by /realm:welcome_edit and cleared by /realm:welcome_reset

/** @returns {Record<string, unknown>} */
function edits() {
  const raw = world.getDynamicProperty(PROP_SETTINGS);
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Saved with the welcome text, so /realm:welcome_edit and /realm:config show the same switches. @param {string} key */
const inEdits = (key) => ({
  read: () => edits()[key],
  write: (/** @type {unknown} */ value) => {
    const next = edits();
    if (value === undefined) delete next[key];
    else next[key] = value;
    world.setDynamicProperty(PROP_SETTINGS, Object.keys(next).length ? JSON.stringify(next) : undefined);
  },
});

/** @type {Option[]} */
const OPTIONS = [
  { key: "showOnce", type: "bool", scope: "world", label: "Popup only on first join", help: "Shown again to everyone after each edit", ...inEdits("showOnce") },
  { key: "chat", type: "bool", scope: "world", label: "Welcome message in chat", ...inEdits("chat") },
  { key: "screenTitle", type: "bool", scope: "world", label: "Welcome title on screen", ...inEdits("screenTitle") },
  { key: "popup", type: "bool", scope: "player", default: true, label: "Welcome popup when I join", help: "/realm:welcome still shows it" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
