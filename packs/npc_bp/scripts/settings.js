// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "npc_bp";
const PREFIX = "npc";
const TITLE = "Townsfolk";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Townsfolk turn to players and chat", help: "They stay in their house either way; taps and menus work" },
  { key: "faceRange", type: "int", scope: "world", label: "Turn to players within (blocks)", help: "0 = never turn", min: 0, max: 16, step: 1 },
  { key: "idleMinSeconds", type: "int", scope: "world", label: "Idle lines at least every (seconds)", min: 10, max: 600, step: 5 },
  { key: "idleMaxSeconds", type: "int", scope: "world", label: "Idle lines at most every (seconds)", min: 10, max: 600, step: 5 },
  { key: "affinity", type: "bool", scope: "world", label: "Hearth & Hearsay: affinity, gifts and gossip", help: "Disabled: nothing is gained or lost; earned levels stay" },
  { key: "gossipChance", type: "int", scope: "world", label: "Gossip in greetings (percent)", help: "0 = no gossip", min: 0, max: 100, step: 5 },
  { key: "letters", type: "bool", scope: "world", label: "Letters from townsfolk (Realm Mail)", help: "When a player becomes Close with one" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
