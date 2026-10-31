// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "moon_bp";
const PREFIX = "moon";
const TITLE = "Blood Moon & Harvest Moon";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Blood Moons and Harvest Moons", help: "Disabled, every night is normal" },
  { key: "storyEvents", type: "bool", scope: "world", label: "Story events", help: "Story Questlines can make tonight a Blood Moon or a Harvest Moon at story moments (at most once a day)" },
  { key: "bloodChance", type: "float", scope: "world", label: "Blood Moon chance (each full moon)", min: 0, max: 1, step: 0.01 },
  { key: "harvestChance", type: "float", scope: "world", label: "Harvest Moon chance (full moons that aren't Blood Moons)", min: 0, max: 1, step: 0.01 },
  { key: "avoidSpawn", type: "int", scope: "world", label: "No extra monsters this close to world spawn (blocks)", min: 0, max: 512, step: 8 },
  { key: "blood.spawnSeconds", type: "int", scope: "world", label: "Seconds between Blood Moon monster waves", min: 5, max: 120, step: 5 },
  { key: "blood.maxExtraPerPlayer", type: "int", scope: "world", label: "Most Blood Moon monsters around a player", min: 0, max: 24, step: 1 },
  { key: "blood.maxExtraWorld", type: "int", scope: "world", label: "Most Blood Moon monsters in the whole world", help: "0 = no world limit. Counts every player's monsters together, in every dimension", min: 0, max: 1000, step: 10 },
  { key: "blood.creepersInZones", type: "bool", scope: "world", label: "Blood Moon creepers in safe zones", help: "Disabled, no Blood Moon creeper spawns in a safe zone, protected town or claim" },
  { key: "blood.rewardLevels", type: "int", scope: "world", label: "Blood Moon survivor reward (levels)", min: 0, max: 30, step: 1 },
  { key: "blood.rewardCrowns", type: "int", scope: "world", label: "Blood Moon survivor reward (Crowns)", min: 0, max: 1000, step: 5 },
  { key: "harvest.tickSpeed", type: "int", scope: "world", label: "Harvest Moon growth speed (randomTickSpeed)", help: "Vanilla is 1. Put back at dawn", min: 1, max: 10, step: 1 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
