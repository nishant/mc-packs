// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "dolphin_bp";
const PREFIX = "dolphin";
const TITLE = "Dolphin Friends";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Taming and riding dolphins", help: "Dolphins can be tamed with raw fish, ridden and called" },
  { key: "tameChancePercent", type: "int", scope: "world", label: "Taming chance per fish (%)", min: 1, max: 100, step: 1 },
  { key: "maxPerPlayer", type: "int", scope: "world", label: "Tamed dolphins per player", min: 1, max: 10, step: 1 },
  { key: "othersCanRide", type: "bool", scope: "world", label: "Others can ride your dolphins", help: "Other players may ride and steer your tamed dolphins" },
  { key: "maxSpeed", type: "int", scope: "world", label: "Riding top speed (blocks/s)", min: 4, max: 24, step: 1 },
  { key: "riderWaterBreathing", type: "bool", scope: "world", label: "Riders breathe under water", help: "Riding a tamed dolphin gives Water Breathing until a few seconds after you get off" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
