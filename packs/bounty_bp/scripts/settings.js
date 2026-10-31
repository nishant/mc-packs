// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "bounty_bp";
const PREFIX = "bounty";
const TITLE = "Bounty Board";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "enabled", type: "bool", scope: "world", label: "Post new bounties every day", help: "Disabled, no new bounties and no targets spawn" },
  { key: "resetHourUtc", type: "int", scope: "world", label: "New bounties at (hour, UTC)", help: "0 = midnight UTC. Changing it can post new bounties early once", min: 0, max: 23, step: 1 },
  { key: "count", type: "int", scope: "world", label: "Bounties per day", help: "Applies from the next day's bounties", min: 1, max: 8, step: 1 },
  { key: "champions", type: "int", scope: "world", label: "Champion targets per day", help: "The rest are cull bounties. Needs the Champions pack", min: 0, max: 5, step: 1 },
  { key: "minDistance", type: "int", scope: "world", label: "Targets at least (blocks from the board)", min: 50, max: 5000, step: 50 },
  { key: "maxDistance", type: "int", scope: "world", label: "Targets at most (blocks from the board)", min: 100, max: 10000, step: 50 },
  { key: "spawnDistance", type: "int", scope: "world", label: "Target appears within (blocks)", help: "A target appears when a player comes this close to its spot", min: 16, max: 128, step: 8 },
  { key: "rewards.champion", type: "int", scope: "world", label: "Crowns for a champion target", min: 0, max: 10000, step: 5 },
  { key: "rewards.helper", type: "int", scope: "world", label: "Crowns for each helper", min: 0, max: 10000, step: 5 },
  { key: "rewards.rivalShare", type: "float", scope: "world", label: "Share of the reward after losing a race to Rook", help: "0.5 = half. Only the killer who lost a story race (Story Questlines) gets less", min: 0, max: 1, step: 0.05 },
  { key: "rewards.cull", type: "int", scope: "world", label: "Crowns for a cull bounty (each)", min: 0, max: 10000, step: 5 },
  { key: "notes", type: "bool", scope: "player", default: true, label: "Bounty progress notes", help: "A note above the hotbar when a kill counts toward a cull bounty" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
