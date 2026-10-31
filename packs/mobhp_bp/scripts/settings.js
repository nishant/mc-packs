// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { SLOT_NAMES, SLOTS } from "./side.js";

const PACK = "mobhp_bp";
const PREFIX = "mobhp";
const TITLE = "Mob Health";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Mob health", help: "Disabled: nobody sees it, whatever they chose" },
  { key: "defaultOn", type: "bool", scope: "world", label: "Mob health for new players", help: "For players who never chose with /realm:mobhp" },
  { key: "players", type: "bool", scope: "world", label: "Show players' health too", help: "When you hurt another player" },
  { key: "barLength", type: "int", scope: "world", label: "Health bar length", min: 5, max: 20, step: 1 },
  { key: "on", type: "bool", scope: "player", lock: [["enabled", false]], base: "defaultOn", label: "Show the health of mobs I hit", help: "The same switch as /realm:mobhp" },
  { key: "showAt", type: "enum", scope: "world", choices: [...SLOTS, "overhead", "hotbar"], names: [...SLOT_NAMES, "Above the mob (everyone nearby sees it)", "Above the hotbar"], label: "Where mob health shows (realm default)", help: "Right and Left 1-4 are boxes from Side HUD (Realm Resources); each pack can take its own, so they show at once. Other add-ons that use the line above the hotbar cannot cover them" },
  { key: "where", type: "enum", scope: "player", lock: [["enabled", false]], base: "showAt", choices: [...SLOTS, "overhead", "hotbar"], names: [...SLOT_NAMES, "Above the mob (everyone nearby sees it)", "Above the hotbar"], label: "Where the health of mobs I hit shows", help: "Pick a box no other pack uses so they show at once. Above the mob: a name tag on the mob for 2 seconds (players and named mobs show in the realm default box)" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
