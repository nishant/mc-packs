// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "map_bp";
const PREFIX = "map";
const TITLE = "Minimap";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Minimap (compass strip and radar)", help: "Disabled: nobody sees them, whatever they chose. /realm:map still works" },
  { key: "compassDefault", type: "bool", scope: "world", label: "Compass strip for new players", help: "What players start with; each can change it in /realm:prefs" },
  { key: "radarDefault", type: "bool", scope: "world", label: "Radar for new players", help: "What players start with; each can change it in /realm:prefs" },
  { key: "radarTerrain", type: "bool", scope: "world", label: "Terrain colors on radar (realm default)", help: "Colors empty cells by the land, water, roads and caves around you" },
  { key: "showMobs", type: "bool", scope: "world", label: "Show mobs (realm default)" },
  { key: "mobRadius", type: "int", scope: "world", min: 8, max: 48, step: 4, label: "Mob and radar range (realm default, blocks)" },
  { key: "mobRadiusMax", type: "int", scope: "world", min: 8, max: 48, step: 4, label: "Largest mob range players may pick (blocks)", help: "Caps each player's own range: a larger range costs more" },
  { key: "maxMobs", type: "int", scope: "world", min: 1, max: 16, label: "Mobs drawn at most (the nearest)" },
  { key: "showTown", type: "bool", scope: "world", label: "Show the nearest town (realm default)", help: "A house on the strip and radar (needs Town Projects)" },
  { key: "showHome", type: "bool", scope: "world", label: "Show your bed (realm default)", help: "A bed on the strip and radar where you respawn" },
  { key: "showOthers", type: "bool", scope: "world", label: "Show players outside your party", help: "White dots and arrows for online friends. Party mates always show" },
  { key: "npcRange", type: "int", scope: "world", min: 16, max: 96, step: 8, label: "Townsfolk and wanderers show within (blocks)" },
  { key: "placeRange", type: "int", scope: "world", min: 32, max: 512, step: 32, label: "Camps and found sites show within (blocks)" },
  { key: "arriveDistance", type: "int", scope: "world", min: 2, max: 32, label: "Arrived within (blocks)", help: "A picked destination clears this close. The story target never does" },
  { key: "maxMarks", type: "int", scope: "world", min: 1, max: 10, label: "Marked spots per player" },
  { key: "intervalTicks", type: "int", scope: "world", label: "Markers update every (ticks)", help: "The strip and radar still turn with you every tick", restart: true },
  { key: "budgetLevel", type: "enum", scope: "world", choices: ["low", "normal", "high"], names: ["Low (less work per tick)", "Normal (Oak profile)", "High (more display catch-up)"], label: "Minimap script time a tick", help: "For optional active radars together. Allocation limits are not CPU promises; low halves admitted work, normal is the Oak profile, high allows more display catch-up under the same scanner ceiling" },
  { key: "compass", type: "bool", scope: "player", lock: [["enabled", false]], base: "compassDefault", label: "Compass strip", help: "At the top of the screen: which way you face, your destination, townsfolk, wanderers, party mates, mobs, the nearest town, your bed and a rainbow's pot of gold (needs Realm Resources)" },
  { key: "radar", type: "bool", scope: "player", sticky:true, lock: [["enabled", false]], base: "radarDefault", label: "Radar", help: "At the top right below the compass strip, with you in the middle (needs Realm Resources)" },
  { key: "terrain", type: "bool", scope: "player", lock: [["enabled", false]], base: "radarTerrain", label: "Terrain colors on my minimap", help: "Colors the minimap grid by the land, water, roads and caves around you" },
  { key: "showMobs", type: "bool", scope: "player", lock: [["enabled", false]], base: "showMobs", label: "Show mobs on my minimap", help: "Red dots, and red arrows at the strip's edges for mobs behind you" },
  { key: "showTown", type: "bool", scope: "player", lock: [["enabled", false]], base: "showTown", label: "Show the nearest town", help: "A house on the strip and radar (needs Town Projects)" },
  { key: "showHome", type: "bool", scope: "player", lock: [["enabled", false]], base: "showHome", label: "Show my bed", help: "A bed on the strip and radar where you respawn" },
  { key: "mobRadius", type: "int", scope: "player", lock: [["enabled", false]], base: "mobRadius", min: 8, max: 48, step: 4, label: "My mob and radar range (blocks)", help: "No more than the realm's largest range" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
