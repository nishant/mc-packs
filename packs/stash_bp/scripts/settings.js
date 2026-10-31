// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "stash_bp";
const PREFIX = "stash";
const TITLE = "Quick Stack & Sort";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "sneakTap", type: "enum", scope: "world", choices: ["menu", "sort", "off"], names: ["Empty hand sorts, gear opens menu", "Sort it right away", "Nothing (opens as usual)"], label: "Sneak-tapping a container" },
  { key: "sortHotbar", type: "bool", scope: "world", label: "Inventory sort includes the hotbar" },
  { key: "stashGear", type: "bool", scope: "world", label: "Quick stack moves tools, weapons and armor" },
  { key: "stashNamedItems", type: "bool", scope: "world", label: "Quick stack moves named items" },
  { key: "cooldownTicks", type: "int", scope: "world", label: "Cooldown between sorts (ticks)", min: 0, max: 100, step: 5 },
  { key: "locks", type: "bool", scope: "world", label: "Chest locks", help: "The sneak-tap menu can lock a container to its owner. Disabled: no Lock button, and existing locks aren't enforced (they're kept)" },
  { key: "maxLocks", type: "int", scope: "world", label: "Locked containers per player", min: 1, max: 500, step: 5 },
  { key: "pages", type: "int", scope: "world", label: "Inventory pages (1 = vanilla inventory)", min: 1, max: 15, step: 1, help: "Pages of the main inventory, switched with the buttons in the inventory or /realm:inv. Items on a page that goes away move to the pages that are left" },
  { key: "invButtons", type: "bool", scope: "world", label: "In-inventory page buttons", help: "The three page buttons in the top row of the inventory. Players can turn them off for themselves" },
  { key: "autoStore", type: "bool", scope: "world", label: "Auto-store pickups into other pages", help: "When a page is full, new stacks move to another page. Players can turn it off for themselves" },
  { key: "sneakTap", type: "enum", scope: "player", base: "sneakTap", choices: ["menu", "sort", "off"], names: ["Empty hand sorts, gear opens menu", "Sort it right away", "Nothing (opens as usual)"], label: "When I sneak-tap a container" },
  { key: "sortHotbar", type: "bool", scope: "player", base: "sortHotbar", label: "My inventory sort includes my hotbar" },
  { key: "invOff", type: "bool", scope: "player", lock: [["pages", 1]], default: false, invert: true, label: "Expansive inventory (5 pages)", help: "Extra inventory pages and in-inventory buttons. Disabled: normal 27-slot inventory with no buttons (items on other pages move back to your inventory)" },
  { key: "invButtons", type: "bool", scope: "player", lock: [["pages", 1]], base: "invButtons", label: "In-inventory page buttons" },
  { key: "autoStore", type: "bool", scope: "player", lock: [["pages", 1]], base: "autoStore", label: "Auto-store pickups into other pages" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
