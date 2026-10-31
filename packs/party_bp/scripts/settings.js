// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "party_bp";
const PREFIX = "party";
const TITLE = "Parties";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "forgetSoloAfterDays", type: "int", scope: "world", label: "Delete solo parties after (days)", help: "A party of one nobody played in for this long is deleted. 0 = never", min: 0, max: 3650, step: 5 },
  { key: "enabled", type: "bool", scope: "world", label: "Parties", help: "Disabled: no party commands or HUD; parties are kept" },
  { key: "maxSize", type: "int", scope: "world", label: "Party size", help: "Most players in a party, leader included", min: 2, max: 12, step: 1 },
  { key: "inviteSeconds", type: "int", scope: "world", label: "Invites last (seconds)", min: 30, max: 600, step: 30 },
  { key: "partyHud", type: "bool", scope: "world", label: "Party HUD", help: "Party mates' health, distance and direction above the hotbar" },
  { key: "hudRange", type: "int", scope: "world", label: "Party HUD range (blocks)", min: 16, max: 512, step: 16 },
  { key: "hudMates", type: "int", scope: "world", label: "Mates shown on the HUD", min: 1, max: 8, step: 1 },
  { key: "partyHud", type: "bool", scope: "player", lock: [["enabled", false]], base: "partyHud", label: "Party HUD", help: "Party mates' health, distance and direction above the hotbar" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
