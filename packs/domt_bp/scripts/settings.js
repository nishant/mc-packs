// What Realm Settings (/realm:config) can change in this pack. The pack reads these options with
// get() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "domt_bp";
const PREFIX = "domt";
const TITLE = "Deck of Many Things";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "mode", type: "enum", scope: "world", label: "Who draws", help: "Everyone with a cooldown, or only operators (who can draw for any player)", choices: ["cooldown", "operators"], names: ["Everyone, with a cooldown", "Operators only"] },
  { key: "cooldownMinutes", type: "int", scope: "world", label: "Cooldown (real minutes)", help: "Between a player's draws; 0 = none", min: 0, max: 720, step: 5 },
  { key: "weights.common", type: "int", scope: "world", label: "Common weight", min: 0, max: 100, step: 1 },
  { key: "weights.uncommon", type: "int", scope: "world", label: "Uncommon weight", min: 0, max: 100, step: 1 },
  { key: "weights.rare", type: "int", scope: "world", label: "Rare weight", min: 0, max: 100, step: 1 },
  { key: "weights.legendary", type: "int", scope: "world", label: "Legendary weight", min: 0, max: 100, step: 1 },
  { key: "announceRare", type: "bool", scope: "world", label: "Announce rare draws", help: "Rare and legendary draws are told to everyone in chat" },
  { key: "blockCards", type: "bool", scope: "world", label: "Block-changing cards", help: "Cards that place or break blocks: The Arena, The Spore, Anvil Drop, creepers, blazes (never in safe zones)" },
  { key: "sporeMinutes", type: "int", scope: "world", label: "Spore field lasts (minutes)", min: 5, max: 240, step: 5 },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
