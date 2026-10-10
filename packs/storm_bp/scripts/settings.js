// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "storm_bp";
const PREFIX = "storm";
const TITLE = "Storm Chasing";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Storm cells", help: "A drifting storm cell during thunderstorms" },
  { key: "lightning", type: "bool", scope: "world", label: "Storm cell lightning" },
  { key: "gapSeconds", type: "int", scope: "world", label: "Seconds between storm cells", min: 0, max: 3600, step: 30 },
  { key: "formNotes", type: "bool", scope: "world", label: "Storm cell notes", help: "A chat line when a storm cell forms" },
  { key: "formNotes", type: "bool", scope: "player", base: "formNotes", label: "Storm cell notes", help: "A chat line when a storm cell forms" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
