// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "journal_bp";
const PREFIX = "journal";
const TITLE = "Field Journal";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Journal entries", help: "Disabled, nothing new is recorded" },
  { key: "rewards", type: "bool", scope: "world", label: "Rewards for finished pages" },
  { key: "notes", type: "bool", scope: "world", label: "New entry notes", help: "A chat line for each new journal entry" },
  { key: "notes", type: "bool", scope: "player", base: "notes", label: "New journal entry notes", help: "A chat line for each new journal entry" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----
