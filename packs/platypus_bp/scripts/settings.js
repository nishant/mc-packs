// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "platypus_bp";
const PREFIX = "platypus";
const TITLE = "Platypus";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "nauseaSeconds", type: "int", scope: "world", label: "Nausea from a bite (seconds)", help: "0 = no nausea; the bite still poisons", min: 0, max: 30, step: 1 },
  { key: "perryMessage", type: "bool", scope: "world", label: "Perry sighting message", help: "Players within 64 blocks are told when a Perry spawns" },
  { key: "findRadius", type: "int", scope: "world", label: "/realm:platypus search radius (blocks)", min: 16, max: 128, step: 16 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
