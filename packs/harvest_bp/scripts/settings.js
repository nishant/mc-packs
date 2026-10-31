// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "harvest_bp";
const PREFIX = "harvest";
const TITLE = "Right-click Harvest";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "requireHoe", type: "bool", scope: "world", label: "Hoe required to harvest" },
  { key: "damageHoe", type: "bool", scope: "world", label: "Harvesting wears the hoe" },
  { key: "replantCostsSeed", type: "bool", scope: "world", label: "Replanting uses a seed", help: "From the drops, else from the inventory; with none, the crop isn't replanted" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
