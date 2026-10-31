// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "refill_bp";
const PREFIX = "refill";
const TITLE = "Hotbar Refill";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Hotbar refill", help: "Disabled: nothing is refilled for anyone" },
  { key: "refillTools", type: "bool", scope: "world", label: "Replace broken tools and weapons", help: "With a spare of the same kind from the inventory" },
  { key: "defaultOn", type: "bool", scope: "world", label: "Hotbar refill for new players", help: "For players who never chose with /realm:refill" },
  { key: "on", type: "bool", scope: "player", lock: [["enabled", false]], base: "defaultOn", label: "Refill my hotbar", help: "The same switch as /realm:refill" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
