// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { SLOT_NAMES, SLOTS } from "./side.js";

const PACK = "saga_bp";
const PREFIX = "saga";
const TITLE = "Story Questlines";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Story questlines", help: "Disabled, no story offers and no progress; the story log still opens" },
  { key: "tracker", type: "bool", scope: "world", label: "Story tracker", help: "Default for players: where to go next, above the hotbar" },
  { key: "trackerAt", type: "enum", scope: "world", choices: [...SLOTS, "hotbar"], names: [...SLOT_NAMES, "Above the hotbar"], label: "Where the story tracker shows (realm default)", help: "Right and Left 1-4 are boxes from Side HUD (Realm Resources); each pack can take its own, so they show at once. Other add-ons that use the line above the hotbar cannot cover them" },
  { key: "partyShare", type: "bool", scope: "world", label: "Party mates share story progress", help: "Defeat, survive and reach objectives, on the same chapter" },
  { key: "partyRange", type: "int", scope: "world", label: "Party sharing range (blocks)", min: 8, max: 256, step: 8 },
  { key: "partyStory", type: "bool", scope: "world", label: "Parties share the main story", help: "One main-story chapter per party: the one of the member furthest behind. Its progress is shared; members ahead help" },
  { key: "skipCreative", type: "bool", scope: "world", label: "Creative mode makes no story progress" },
  { key: "opHints", type: "bool", scope: "world", label: "Operator hints for unset places", help: "Tells operators when a player's chapter needs a place nobody set" },
  { key: "championFallback", type: "bool", scope: "world", label: "Story champions without the Champions pack", help: "Spawn the story's mob ourselves when no Champions pack answers" },
  { key: "championRetrySeconds", type: "int", scope: "world", label: "Seconds before a story champion comes again", min: 30, max: 1800, step: 30 },
  { key: "hintPenalty", type: "float", scope: "world", label: "Reward cost of a hint (share)", help: "0 = free hints; 0.25 = a hinted chapter pays 25% fewer levels and Crowns", min: 0, max: 1, step: 0.05 },
  { key: "autoPlaces", type: "bool", scope: "world", label: "Pick and build story places", help: "Unset places are picked by the pack and built when a player comes close" },
  { key: "farScale", type: "float", scope: "world", label: "Distance of far story spots (share past 300 blocks)", help: "0.5 = a spot 1,200 blocks out is at 750; 1 = as the stories wrote them. Places already set don't move", min: 0.25, max: 1, step: 0.05 },
  { key: "buildRange", type: "int", scope: "world", label: "Build a picked place within (blocks)", min: 32, max: 128, step: 8 },
  { key: "actorTimeoutSeconds", type: "int", scope: "world", label: "Story characters wait for their player (seconds)", min: 60, max: 1800, step: 30 },
  { key: "favors", type: "bool", scope: "world", label: "Daily favors", help: "Questgivers offer a short job each real day" },
  { key: "campDays", type: "int", scope: "world", label: "Days before an unvisited wanderer's camp is taken down", min: 1, max: 60, step: 1 },
  { key: "tracker", type: "bool", scope: "player", lock: [["enabled", false]], base: "tracker", label: "Story tracker", help: "Where to go next for your story" },
  { key: "trackerAt", type: "enum", scope: "player", lock: [["enabled", false]], base: "trackerAt", choices: [...SLOTS, "hotbar"], names: [...SLOT_NAMES, "Above the hotbar"], label: "Where my story tracker shows", help: "Pick a box no other pack uses so they show at once" },
  { key: "spotGuides", type: "bool", scope: "player", lock: [["enabled", false]], default: true, label: "Show quest spot outlines", help: "Semi-clear colored outlines on the blocks and standing boxes your quests need (drawn by the Easy Building Guides resource pack)" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
