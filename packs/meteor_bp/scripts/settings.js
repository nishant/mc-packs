// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "meteor_bp";
const PREFIX = "meteor";
const TITLE = "Meteor Strikes";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Meteors at night", help: "/realm:meteor_now works either way" },
  { key: "storyEvents", type: "bool", scope: "world", label: "Story events", help: "Story Questlines can make a meteor fall at story moments (at most one every 10 minutes)" },
  { key: "chance", type: "float", scope: "world", label: "Chance of a meteor each night", help: "0 to 1, rolled once a night", min: 0, max: 1, step: 0.05 },
  { key: "warningSeconds", type: "int", scope: "world", label: "Warning before impact (seconds)", min: 10, max: 300, step: 10 },
  { key: "craters", type: "bool", scope: "world", label: "Craters", help: "A small crater in natural ground with a meteorite core (ancient debris). Disabled, a meteor is only the show" },
  { key: "avoidSpawn", type: "int", scope: "world", label: "Distance kept from world spawn (blocks)", min: 0, max: 1024, step: 16 },
  { key: "avoidZones", type: "bool", scope: "world", label: "Avoid safe zones and towns", help: "No meteor is aimed into a safe zone, protected town or claim, and no crater is made in one" },
  { key: "inZone", type: "enum", scope: "world", choices: ["move", "burst"], names: ["Land just outside it", "Burst in the sky"], label: "A meteor over a safe zone", help: "When one still comes down over a safe zone (aimed there by an operator, or a zone added while it falls)" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
