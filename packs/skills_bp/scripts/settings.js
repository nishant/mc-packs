// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "skills_bp";
const PREFIX = "skills";
const TITLE = "Skills";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Skills", help: "Disabled: no XP and no perks; levels are kept" },
  { key: "skipCreative", type: "bool", scope: "world", label: "Creative mode gains no skill XP" },
  { key: "xpMultiplier", type: "float", scope: "world", label: "XP multiplier", help: "Every XP gain is multiplied by this", min: 0.1, max: 10, step: 0.1 },
  { key: "partyBonus", type: "int", scope: "world", label: "Party bonus (percent)", help: "Extra XP while a party mate is near", min: 0, max: 100, step: 5 },
  { key: "partyRange", type: "int", scope: "world", label: "Party bonus range (blocks)", min: 8, max: 256, step: 8 },
  { key: "perksEnabled", type: "bool", scope: "world", label: "Skill perks", help: "Double drops and short effects from skill levels" },
  { key: "announceMaster", type: "bool", scope: "world", label: "Announce master levels to everyone" },
  { key: "xpNotes", type: "bool", scope: "world", label: "Skill XP notes", help: "A note above the hotbar as you gain XP" },
  { key: "maxLevel", type: "int", scope: "world", label: "Highest level", restart: true },
  { key: "xpBase", type: "int", scope: "world", label: "XP curve base", restart: true },
  { key: "xpExponent", type: "float", scope: "world", label: "XP curve exponent", restart: true },
  { key: "xpNotes", type: "bool", scope: "player", lock: [["enabled", false]], base: "xpNotes", label: "Skill XP notes", help: "A note above the hotbar as you gain XP" },
  { key: "callings.enabled", type: "bool", scope: "world", label: "Callings", help: "Disabled: Calling Sigils and talents do nothing; choices are kept" },
  { key: "callings.unlockTotal", type: "int", scope: "world", label: "Total skill level for a Calling", help: "All six skill levels added up", min: 6, max: 300, step: 1 },
  { key: "callings.respecCost", type: "int", scope: "world", label: "Reset talents cost (Crowns)", min: 0, max: 1000, step: 10 },
  { key: "callings.switchDays", type: "int", scope: "world", label: "Realm days between Calling choices", min: 0, max: 30, step: 1 },
  { key: "callings.chooseAnywhere", type: "bool", scope: "world", label: "Choose a Calling anywhere", help: "Disabled: only at Brother Hollis (or Moss) when the Townsfolk pack is here" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
