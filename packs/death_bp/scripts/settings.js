// What Realm Settings (/realm:config, /realm:prefs) can change in this pack. The pack reads these
// options with get() / getFor() instead of config.js directly, so changes apply without a restart.
import { Player, system, world } from "@minecraft/server";
import { CONFIG } from "./config.js";

const PACK = "death_bp";
const PREFIX = "death";
const TITLE = "Death Point";
const BASE = CONFIG;

/** @type {Option[]} */
const OPTIONS = [
  { key: "announce", type: "bool", scope: "world", label: "Tell players where they died", help: "A chat message with the death point once a player respawns" },
  { key: "tellParty", type: "bool", scope: "world", label: "Tell party mates where a member died", help: "A chat line for every online party mate, with the distance and direction from them" },
  { key: "backEnabled", type: "bool", scope: "world", label: "Teleport back to the death point (/realm:death_back)", help: "Once per death, only to a safe place to stand" },
  { key: "backSearchRadius", type: "int", scope: "world", label: "Safe spot search, sideways (blocks)", min: 0, max: 4, step: 1 },
  { key: "backSearchHeight", type: "int", scope: "world", label: "Safe spot search, up and down (blocks)", min: 0, max: 16, step: 1 },
  { key: "announce", type: "bool", scope: "player", base: "announce", label: "Tell me where I died", help: "The chat message when you respawn. /realm:death works either way" },
  { key: "tellParty", type: "bool", scope: "player", lock: [["tellParty", false]], base: "tellParty", label: "Tell me where party mates die", help: "A chat line when someone in your party dies" },
];

// ---- Shared: the same in every pack. Edit tools/settings-shared.js, then run node tools/sync-settings.mjs ----

/** @typedef {import("./settings-core.js").Option} Option */
import { onScriptEvent as onSettingsEvent } from "./script-events.js";
import { createSettings } from "./settings-core.js";
export const { get, set, reset, getFor, setFor, onChange } = createSettings({ PACK, PREFIX, TITLE, BASE, OPTIONS, onScriptEvent: onSettingsEvent });
