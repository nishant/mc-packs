// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { SLOT_NAMES, SLOTS } from "./side.js";

const PACK = "elytra_bp";
const PREFIX = "elytra";
const TITLE = "Elytra HUD";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Elytra HUD", help: "Speed, height, elytra durability and rockets while gliding" },
  { key: "lowPercent", type: "int", scope: "world", label: "Elytra durability in red at (percent left)", min: 1, max: 50, step: 1 },
  { key: "intervalTicks", type: "int", scope: "world", label: "Ticks between HUD updates", restart: true },
  { key: "off", type: "bool", scope: "player", lock: [["enabled", false]], default: false, invert: true, label: "Elytra HUD while gliding", help: "The same switch as /realm:elytra" },
  { key: "showAt", type: "enum", scope: "world", choices: [...SLOTS, "hotbar"], names: [...SLOT_NAMES, "Above the hotbar"], label: "Where the Elytra HUD shows (realm default)", help: "Right and Left 1-4 are boxes from Side HUD (Realm Resources); each pack can take its own, so they show at once. Other add-ons that use the line above the hotbar cannot cover them" },
  { key: "where", type: "enum", scope: "player", lock: [["enabled", false]], base: "showAt", choices: [...SLOTS, "hotbar"], names: [...SLOT_NAMES, "Above the hotbar"], label: "Where my Elytra HUD shows", help: "Pick a box no other pack uses so they show at once" },
  { key: "nosEnabled", type: "bool", scope: "world", label: "NOS Rockets", help: "Allow using NOS Rockets (custom:nos_rocket) for a nitrous boost while gliding" },
  { key: "nosMultiplier", type: "float", scope: "world", label: "NOS Rocket boost multiplier (x)", help: "Relative to normal firework baseline (default 3.5x)", min: 1, max: 6, step: 0.25 },
  { key: "nosBaseline", type: "float", scope: "world", label: "NOS Rocket baseline impulse (blocks/tick)", help: "Normal firework rocket impulse baseline", min: 0.25, max: 2, step: 0.05 },
  { key: "nosMaxSpeed", type: "float", scope: "world", label: "NOS Rocket max speed (blocks/tick)", help: "Maximum flight speed cap (3.6 = 72 blocks/s) so repeated boosts do not compound infinitely", min: 1.5, max: 6, step: 0.1 },
  { key: "nosBurstTicks", type: "int", scope: "world", label: "NOS Rocket full-boost hold (ticks)", help: "Ticks held at peak turbo boost before tapering off with wastegate flutter", min: 6, max: 120, step: 2 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
